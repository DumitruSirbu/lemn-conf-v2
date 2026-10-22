// M5 wave 5H, write seam — criterion 5H-4's network-facing half (ADR 0053).
//
// DOM-001: both seams refuse together. A `columnExtents` entry that does not contain the placements
// filed under its key is a document the domain cannot execute — restore it and the column publishes
// an opening over a body, or loses the space the customer left — so the PUT that would store it has
// to answer the same code the load seam does.
//
// Each fixture carries **one** fault, and the control below stores the very same document with the
// extent its own members stand inside. Without that control a refusal here could be coming from
// anything in the seeded design.
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
  SaveOutcome,
  MintDesign,
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

/** The seeded `A|2.60` column: a base with the hob on it, a wall unit at 1500–2200 and a top box at
 *  2200–2600. `topMm` is the one field the fixtures below change. */
function designWithExtentTop(topMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    columnExtents: [
      {
        wall: "A",
        alongMm: 2600,
        widthMm: 600,
        y0Mm: 0,
        topMm,
        depthMm: 620,
      },
    ],
  };
}

const FULL_HEIGHT_TOP_MM = 2600;
/** Below `p19`'s own top, and above nothing else in the document — so the only thing wrong with
 *  this design is that its stored extent excludes a member. */
const TOP_BELOW_A_MEMBER_MM = 1000;

describe("PUT /api/designs/[id] — ADR 0053's containment rule at the write seam", () => {
  it("stores the document whose extent its own members stand inside", async () => {
    const { id, cookie } = await mintDesign();
    const contained = designWithExtentTop(FULL_HEIGHT_TOP_MM);

    const response = await PUT(
      saveRequest(id, { design: contained, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(storedSerialization(id)).toBe(canonicalSerializeDesign(contained));
  });

  it("refuses an extent that excludes a member, and stores nothing", async () => {
    const { id, cookie } = await mintDesign();
    const before = storedSerialization(id);

    const response = await PUT(
      saveRequest(id, {
        design: designWithExtentTop(TOP_BELOW_A_MEMBER_MM),
        cookie,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
    expect(storedSerialization(id)).toBe(before);
  });

  it("refuses an extent on a key no placement is filed under", async () => {
    const { id, cookie } = await mintDesign();
    const before = storedSerialization(id);
    const orphaned: Design = {
      ...designWithExtentTop(FULL_HEIGHT_TOP_MM),
      columnExtents: [
        {
          wall: "A",
          alongMm: 3900,
          widthMm: 600,
          y0Mm: 0,
          topMm: FULL_HEIGHT_TOP_MM,
          depthMm: 620,
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { design: orphaned, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(storedSerialization(id)).toBe(before);
  });
});
