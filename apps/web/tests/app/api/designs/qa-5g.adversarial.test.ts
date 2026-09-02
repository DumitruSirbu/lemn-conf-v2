// Adversarial QA for M5 wave 5G, write seam — criterion 5G-4's other half.
//
// **The wave's own write-seam case does not witness the rule it names.** Its fixture records a
// 900 mm space on wall B at `alongMm: 3000`, which stands over the seeded kitchen's own placements,
// so `validateDesignForCatalog` answers `EMPTY_COLUMN_WIDER_THAN_CAP` **and**
// `EMPTY_COLUMN_OVERLAPS_PLACEMENT`, and the route returns the same `DESIGN_INVALID` either way.
// Measured: deleting `findOversizedEmptyColumns` from `validate-design.ts` leaves the whole web
// suite green.
//
// So the fixture here carries **one** fault. The design's placements are pared back to the single
// body that keeps the document executable, and the space sits where nothing stands, so the only
// thing between this PUT and a stored share link publishing an opening no catalogue body fits is
// the code ADR 0052 added. DOM-001: both seams refuse together, and this is the half that faces the
// network.
import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
  DesignVersion,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The revision `0004_add_design_revision.sql` gives every row, which is what a single mint holds. */
const FIRST_REVISION = "1";
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/** The same in-memory stand-in `write-authorization.test.ts` uses, reduced to what this file asks
 *  of it: mint, save under a matching credential, and read back what was stored. */
class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string | null; revision: string }
  >();
  private nextId = 0;

  mint(design: Design, writeTokenHash: string): Promise<DesignVersion> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash, revision: FIRST_REVISION });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<DesignVersion> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    if (row.revision !== expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(id, { ...row, design, revision });
    return Promise.resolve({ id, revision });
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

async function mintDesign(): Promise<{ id: string; cookie: string }> {
  const response = await POST();
  const { id } = (await response.json()) as { id: string };
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { id, cookie: setCookie.split(";")[0] ?? "" };
}

function saveRequest(
  id: string,
  { design, cookie }: { design: Design; cookie: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body: JSON.stringify(design),
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function storedSerialization(id: string): string {
  const design = fakeRepository.storedDesign(id);
  if (design === undefined) throw new Error(`No stored design for id "${id}"`);
  return canonicalSerializeDesign(design);
}

/** One body and one recorded space, chosen so the space stands where nothing does: `p2` occupies
 *  2300–2900 on wall A, and the entry spans 300–1700. */
function designWithEmptyColumnWidth(widthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.id === "p2",
    ),
    emptyColumns: [
      {
        wall: "A",
        alongMm: 1000,
        widthMm,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 580,
      },
    ],
  };
}

describe("PUT /api/designs/[id] — ADR 0052's ceiling at the write seam", () => {
  /** The fixture's own control, and the reason the refusal below can only be the cap: at 800 mm the
   *  very same document is stored. A fixture that was invalid for a second reason would fail here
   *  and say so, rather than passing the next case for free. */
  it("stores the same document when the space is exactly at the ceiling", async () => {
    const { id, cookie } = await mintDesign();
    const atCap = designWithEmptyColumnWidth(800);

    const response = await PUT(
      saveRequest(id, { design: atCap, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(storedSerialization(id)).toBe(canonicalSerializeDesign(atCap));
  });

  /** One millimetre over, and nothing else changed. This is the case that reddens when
   *  `findOversizedEmptyColumns` is deleted; the wave's own write-seam case does not. */
  it("refuses a space one millimetre over the ceiling, and stores nothing", async () => {
    const { id, cookie } = await mintDesign();
    const before = storedSerialization(id);

    const response = await PUT(
      saveRequest(id, { design: designWithEmptyColumnWidth(801), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
    expect(storedSerialization(id)).toBe(before);
  });

  /** And the space decomposed into columns the ceiling allows is stored, which is ADR 0037's half of
   *  the rule: the 1400 mm *space* stays legal, carried as an 800 and a 600. A validator that
   *  refused the space rather than the column would fail here. */
  it("stores the same span as two columns under the ceiling", async () => {
    const { id, cookie } = await mintDesign();
    const split: Design = {
      ...designWithEmptyColumnWidth(800),
      emptyColumns: [
        {
          wall: "A",
          alongMm: 700,
          widthMm: 800,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
        {
          wall: "A",
          alongMm: 1400,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { design: split, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(storedSerialization(id)).toBe(canonicalSerializeDesign(split));
  });
});
