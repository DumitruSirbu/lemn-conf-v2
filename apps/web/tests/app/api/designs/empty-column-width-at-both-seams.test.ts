// A member-less column of any width saves at `PUT /api/designs/[id]` and loads at `migrateDesign`, and every other
// empty-column rule answers the same at both seams (DOM-001).
import {
  CURRENT_SCHEMA_VERSION,
  DesignNotFoundError,
  InvalidDesignError,
  KITCHEN_L_DESIGN,
  MAX_DESIGN_DIMENSION_MM,
  MAX_EMPTY_COLUMNS,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  fatalDesignValidationIssues,
  migrateDesign,
  validateDesignForCatalog,
} from "@lemnaria/configurator-domain";
import type {
  Design,
  DesignId,
  DesignPlacement,
  EmptyColumn,
} from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
  DesignVersion,
  SaveOutcome,
  MintDesign,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The revision `0004_add_design_revision.sql` gives every row, which is what a single mint holds. */
const FIRST_REVISION = "1";
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/** The same in-memory stand-in `write-authorization.test.ts` uses, reduced to mint, an authorised save and a read
 *  of what was stored. It never migrates, so the load seam is driven explicitly below. */
class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string | null; revision: string }
  >();
  private nextId = 0;

  mint({ design, writeTokenHash }: MintDesign): Promise<DesignVersion> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash, revision: FIRST_REVISION });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  saveAuthorized({
    id,
    design,
    credential,
    expectedRevision,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    if (
      !row ||
      credential.kind !== "write-token" ||
      row.writeTokenHash !== credential.hash
    ) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    if (row.revision !== expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(id, { ...row, design, revision });
    return Promise.resolve({ id, revision, ownsVisitor: false });
  }

  load(id: DesignId): Promise<StoredDesign> {
    const row = this.rows.get(id);
    return row
      ? Promise.resolve({ design: row.design, revision: row.revision })
      : Promise.reject(new DesignNotFoundError(id));
  }

  storedDesign(id: DesignId): Design | undefined {
    return this.rows.get(id)?.design;
  }
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { PUT } = await import("../../../../src/app/api/designs/[id]/route");

let fakeRepository: FakeAuthorizedRepository;

beforeEach(() => {
  fakeRepository = new FakeAuthorizedRepository();
  repository.current = fakeRepository;
});

/** Wall A runs 6000 mm, so a 3000 mm column fits beside the one body without touching it. */
const ROOM_MM = { widthMm: 6000, depthMm: 3000, heightMm: 2600 } as const;

/** The seeded hob base, 2300–2900 on wall A at 0–820: the only body, so every overlap below is with it. */
const HOB = seededPlacement("p2");
const HOB_RIGHT_EDGE_MM = HOB.alongMm + HOB.body.widthMm / 2;

function seededPlacement(id: string): DesignPlacement {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.id === id,
  );
  if (placement === undefined) {
    throw new Error(`The seeded kitchen has no placement "${id}"`);
  }
  return placement;
}

/** A floor-to-ceiling member-less column on wall A, laid out from its left edge. */
function emptyColumnFrom(leftEdgeMm: number, widthMm: number): EmptyColumn {
  return {
    wall: "A",
    alongMm: leftEdgeMm + widthMm / 2,
    widthMm,
    y0Mm: 0,
    topMm: ROOM_MM.heightMm,
    depthMm: 580,
  };
}

function designWith(emptyColumns: readonly EmptyColumn[]): Design {
  return {
    ...KITCHEN_L_DESIGN,
    room: { ...KITCHEN_L_DESIGN.room, ...ROOM_MM },
    placements: [HOB],
    emptyColumns: [...emptyColumns],
  };
}

function mintRequest(): NextRequest {
  return new NextRequest("https://example.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

async function mintDesign(): Promise<{ id: string; cookie: string }> {
  const response = await POST(mintRequest());
  const { id } = (await response.json()) as { id: string };
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { id, cookie: setCookie.split(";")[0] ?? "" };
}

async function save(design: Design): Promise<{ id: string; status: number }> {
  const { id, cookie } = await mintDesign();
  const request = new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body: JSON.stringify(design),
  });
  const response = await PUT(request, { params: Promise.resolve({ id }) });
  return { id, status: response.status };
}

/** The stored-row load, through `JSON` as a row arrives. */
function loadAsStored(design: Design): Design {
  return migrateDesign(
    CURRENT_SCHEMA_VERSION,
    JSON.parse(JSON.stringify(design)) as unknown,
  );
}

type Verdict = "accepted" | "refused";

async function writeSeamVerdict(design: Design): Promise<Verdict> {
  const { status } = await save(design);
  return status === 200 ? "accepted" : "refused";
}

function loadSeamVerdict(design: Design): Verdict {
  try {
    loadAsStored(design);
    return "accepted";
  } catch (error) {
    if (error instanceof InvalidDesignError) return "refused";
    throw error;
  }
}

function validationCodesOf(design: Design): readonly string[] {
  return validationIssuesOf(design).map((issue) => issue.code);
}

function validationIssuesOf(design: Design) {
  return validateDesignForCatalog(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  );
}

describe("a member-less column wider than 800 mm, through both seams", () => {
  const WIDE_COLUMNS = [
    emptyColumnFrom(0, 1200),
    emptyColumnFrom(HOB_RIGHT_EDGE_MM, 3000),
  ];

  it("saves a 1200 mm and a 3000 mm column and stores the document byte-identically", async () => {
    const design = designWith(WIDE_COLUMNS);

    const { id, status } = await save(design);

    expect(status).toBe(200);
    const stored = fakeRepository.storedDesign(id);
    expect(stored && canonicalSerializeDesign(stored)).toBe(
      canonicalSerializeDesign(design),
    );
  });

  it("reloads what was saved deep-equal, and a second load changes nothing", async () => {
    const design = designWith(WIDE_COLUMNS);
    const { id } = await save(design);
    const stored = fakeRepository.storedDesign(id);
    if (stored === undefined) throw new Error("the save stored nothing");

    const loaded = loadAsStored(stored);

    expect(loaded).toStrictEqual(design);
    expect(loadAsStored(loaded)).toStrictEqual(loaded);
  });
});

/** One fault per row, each at a width the ceiling allowed (600) and two it refused (1200, 3000), so a wide column is
 *  judged by every other rule exactly as a narrow one is. `codes` pins the fault. */
interface SeamCase {
  readonly name: string;
  readonly verdict: Verdict;
  readonly codes: readonly string[];
  readonly emptyColumnsAt: (widthMm: number) => readonly EmptyColumn[];
}

const SEAM_CASES: readonly SeamCase[] = [
  {
    name: "a column beside the body (control)",
    verdict: "accepted",
    codes: [],
    emptyColumnsAt: (widthMm) => [emptyColumnFrom(HOB_RIGHT_EDGE_MM, widthMm)],
  },
  {
    name: "a column standing through the body",
    verdict: "refused",
    codes: ["EMPTY_COLUMN_OVERLAPS_PLACEMENT"],
    emptyColumnsAt: (widthMm) => [
      emptyColumnFrom(HOB_RIGHT_EDGE_MM - 100, widthMm),
    ],
  },
  {
    name: "a column overlapping another column",
    verdict: "refused",
    codes: [
      "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
      "EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN",
    ],
    emptyColumnsAt: (widthMm) => [
      emptyColumnFrom(HOB_RIGHT_EDGE_MM, widthMm),
      emptyColumnFrom(HOB_RIGHT_EDGE_MM + widthMm - 50, 100),
    ],
  },
  {
    name: "a column keyed onto the body's column, above it",
    verdict: "refused",
    codes: ["EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT"],
    emptyColumnsAt: (widthMm) => [
      { ...emptyColumnFrom(HOB.alongMm - widthMm / 2, widthMm), y0Mm: 1500 },
    ],
  },
  {
    name: "two columns sharing one key at different heights",
    verdict: "refused",
    codes: [
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN",
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN",
    ],
    emptyColumnsAt: (widthMm) => [
      { ...emptyColumnFrom(HOB_RIGHT_EDGE_MM, widthMm), topMm: 820 },
      { ...emptyColumnFrom(HOB_RIGHT_EDGE_MM + 2, widthMm), y0Mm: 1500 },
    ],
  },
  {
    name: "a column starting before its wall, in the upper row",
    verdict: "refused",
    codes: ["EMPTY_COLUMN_BEFORE_WALL_START"],
    emptyColumnsAt: (widthMm) => [
      { ...emptyColumnFrom(-100, widthMm), y0Mm: 1500 },
    ],
  },
  {
    name: "a column ending past its wall (a mark, ADR 0065)",
    verdict: "accepted",
    codes: ["EMPTY_COLUMN_PAST_WALL_END"],
    emptyColumnsAt: (widthMm) => [
      emptyColumnFrom(ROOM_MM.widthMm - widthMm + 100, widthMm),
    ],
  },
  {
    name: "a column rising above the room",
    verdict: "refused",
    codes: ["EMPTY_COLUMN_ABOVE_ROOM"],
    emptyColumnsAt: (widthMm) => [
      { ...emptyColumnFrom(HOB_RIGHT_EDGE_MM, widthMm), topMm: 2700 },
    ],
  },
  {
    name: "a column deeper than the room",
    verdict: "refused",
    codes: ["EMPTY_COLUMN_DEEPER_THAN_ROOM"],
    emptyColumnsAt: (widthMm) => [
      { ...emptyColumnFrom(HOB_RIGHT_EDGE_MM, widthMm), depthMm: 3100 },
    ],
  },
  {
    name: "a column with no height",
    verdict: "refused",
    codes: ["EMPTY_COLUMN_INVERTED"],
    emptyColumnsAt: (widthMm) => [
      {
        ...emptyColumnFrom(HOB_RIGHT_EDGE_MM, widthMm),
        y0Mm: 1000,
        topMm: 1000,
      },
    ],
  },
];

const SEAM_ROWS = SEAM_CASES.flatMap((seamCase) =>
  [600, 1200, 3000].map((widthMm) => ({ ...seamCase, widthMm })),
);

describe("every other empty-column rule answers the same at both seams, at any width", () => {
  it.each(SEAM_ROWS)(
    "$name at $widthMm mm: $verdict",
    async ({ verdict, codes, emptyColumnsAt, widthMm }) => {
      const design = designWith(emptyColumnsAt(widthMm));

      expect(validationCodesOf(design)).toStrictEqual(codes);
      expect(await writeSeamVerdict(design)).toBe(verdict);
      expect(loadSeamVerdict(design)).toBe(verdict);
    },
  );
});

/** `deriveColumnKeyAt`'s grid: entries this far apart never share a key. */
const COLUMN_KEY_STEP_MM = 10;

/** `count` abutting 10 mm upper-row entries, each on its own key: wall A first, skipping the hob's key, then wall B.
 *  Centres run past each wall's end, which is a mark, so the count is the only thing that can refuse them. */
function distinctlyKeyedEntries(count: number): EmptyColumn[] {
  const centresMm = Array.from(
    { length: MAX_DESIGN_DIMENSION_MM / COLUMN_KEY_STEP_MM },
    (_, index) => (index + 1) * COLUMN_KEY_STEP_MM,
  );
  const slots = [
    ...centresMm
      .filter((centreMm) => centreMm !== HOB.alongMm)
      .map((alongMm) => ({ wall: "A" as const, alongMm })),
    ...centresMm.map((alongMm) => ({ wall: "B" as const, alongMm })),
  ];
  if (slots.length < count) {
    throw new Error(
      `Only ${String(slots.length)} distinct keys for ${String(count)} entries`,
    );
  }
  return slots.slice(0, count).map(({ wall, alongMm }) => ({
    wall,
    alongMm,
    widthMm: COLUMN_KEY_STEP_MM,
    y0Mm: 1500,
    topMm: ROOM_MM.heightMm,
    depthMm: 330,
  }));
}

describe("MAX_EMPTY_COLUMNS, at both seams", () => {
  it("accepts exactly MAX_EMPTY_COLUMNS entries with no fatal finding", async () => {
    const design = designWith(distinctlyKeyedEntries(MAX_EMPTY_COLUMNS));

    expect(
      fatalDesignValidationIssues(validationIssuesOf(design)),
    ).toStrictEqual([]);
    expect((await save(design)).status).toBe(200);
    expect(loadSeamVerdict(design)).toBe("accepted");
  });

  it("refuses one entry more at the schema, not at the size gate", async () => {
    const design = designWith(distinctlyKeyedEntries(MAX_EMPTY_COLUMNS + 1));

    expect(
      fatalDesignValidationIssues(validationIssuesOf(design)),
    ).toStrictEqual([]);
    expect((await save(design)).status).toBe(400);
    expect(() => loadAsStored(design)).toThrow(/emptyColumns/);
  });
});
