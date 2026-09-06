// **Wave 6P's free colour is the first free-form string a customer authors that a document has ever
// held**, and the wave's criterion says the schema is *the one gate both the API write seam and
// `migrateDesign` pass through*. `migrateDesign`'s half is asserted in the domain package; this is
// the other half, which until this file nothing asserted — every other test of the bound calls
// `FinishSchema` directly, and that cannot tell whether the route reaches it.
//
// The attack is a document that is legal in every respect except the colour: same seeded kitchen,
// same body, same everything, one malformed value. A control stores the very same document with a
// well-formed colour, so a refusal below can only be the bound.
import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
  paletteFinish,
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

const FIRST_REVISION = "1";
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/** A finishable seeded body. `p0` is the base cabinet §11 row 12 is written against. */
const FINISHABLE_ID = "p0";

/** The same in-memory stand-in the other route suites use, reduced to what this file asks of it. */
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

/** The body is written as JSON text, not as a `Design`: a malformed colour is not expressible
 *  through the type, and the seam under test takes bytes off the wire. */
function saveRequest(
  id: string,
  { body, cookie }: { body: string; cookie: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body,
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

/** The seeded kitchen with one body wearing whatever the caller wrote, as wire bytes.
 *
 *  **The material is a parameter since wave 6Q-b**, because the write seam now also refuses a finish
 *  the document's material does not offer (ADR 0078 decision 2) and the seeded kitchen carries no
 *  `materialTierId`, so it is a PAL kitchen — which offers its own six decors and no free colour at
 *  all. Every case below still turns on the bound `FinishSchema` declares; naming the material is
 *  what keeps the offer from being the thing that answers. */
function bodyWearing(finish: unknown, materialTierId?: string): string {
  return JSON.stringify({
    ...KITCHEN_L_DESIGN,
    settings:
      materialTierId === undefined
        ? KITCHEN_L_DESIGN.settings
        : { ...KITCHEN_L_DESIGN.settings, materialTierId },
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === FINISHABLE_ID
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  });
}

/** The material whose control is the RAL picker, and therefore the only one that offers a free
 *  colour at all (ADR 0078 decision 1). */
const RAL_PICKER_TIER_ID = "material.painted-mdf";

describe("PUT /api/designs/[id] — the free colour bound is the route's gate too", () => {
  it("stores a well-formed colour, so every refusal below can only be the bound", async () => {
    const { id, cookie } = await mintDesign();
    const wellFormed = bodyWearing(
      { kind: "free-colour", value: "#b8c4a1" },
      RAL_PICKER_TIER_ID,
    );

    const response = await PUT(
      saveRequest(id, { body: wellFormed, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(storedSerialization(id)).toBe(
      canonicalSerializeDesign(JSON.parse(wellFormed) as Design),
    );
  });

  it("stores a declared palette entry too", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing(paletteFinish("pal.gri-havanna")),
        cookie,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
  });

  it.each([
    ["a three-digit hex", "#abc"],
    ["an eight-digit hex", "#abcdefab"],
    ["a hex with no hash", "b8c4a1"],
    ["a non-hex digit", "#gggggg"],
    ["a leading space", " #b8c4a1"],
    ["a trailing space", "#b8c4a1 "],
    ["a trailing newline", "#b8c4a1\n"],
    ["a full-width hash", "＃b8c4a1"],
    ["an empty value", ""],
    ["a very long value", `#${"b".repeat(100_000)}`],
    ["a CSS colour function", "rgb(184,196,161)"],
    ["a CSS colour name", "red"],
  ])("refuses %s and stores nothing", async (_name, value) => {
    const { id, cookie } = await mintDesign();
    const before = storedSerialization(id);

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing({ kind: "free-colour", value }),
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

  it.each([
    ["a legacy enum name", "sage"],
    ["a bare hex string", "#b8c4a1"],
    ["a palette id with no kind", { entryId: "pal.alb" }],
    ["a colour with no kind", { value: "#b8c4a1" }],
    [
      "an undeclared palette entry",
      { kind: "palette-entry", entryId: "pal.roz" },
    ],
    ["a third kind", { kind: "texture", entryId: "pal.alb" }],
    [
      "both kinds at once",
      { kind: "palette-entry", entryId: "pal.alb", value: "#b8c4a1" },
    ],
    ["a numeric finish", 7],
    ["an array finish", ["sage"]],
  ])("refuses %s and stores nothing", async (_name, finish) => {
    const { id, cookie } = await mintDesign();
    const before = storedSerialization(id);

    const response = await PUT(
      saveRequest(id, { body: bodyWearing(finish), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(storedSerialization(id)).toBe(before);
  });

  it("names no colour value back to the caller", async () => {
    // ADR 0014 S2: a refusal states a stable code and never why. A schema message quoting the
    // attacker's own string back is how a bound becomes a description of the parser.
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing({ kind: "free-colour", value: "#gggggg" }),
        cookie,
      }),
      routeParams(id),
    );

    expect(JSON.stringify(await response.json())).not.toContain("gggggg");
  });
});

// **Wave 6Q-b's write seam, asserted here because this is where the route's plumbing already is.**
//
// The two are different gates on the same field and the difference is the point: above, a value
// `FinishSchema` cannot parse; here, a value it parses perfectly that the document's own material
// does not offer (ADR 0078 decision 1). `migrateDesign` resolves this violation immediately before
// it validates, so the only seam that can meet it is a client sending a whole document that never
// passed through `setFinish` or `setMaterialTier`.
describe("PUT /api/designs/[id] — a finish the document's material does not offer", () => {
  it("refuses a wood on a PAL kitchen and stores nothing", async () => {
    const { id, cookie } = await mintDesign();
    const before = storedSerialization(id);

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing(paletteFinish("veneer.stejar")),
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

  it("refuses a PAL decor on a veneer kitchen, so the rule is the material's and not one palette's", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing(paletteFinish("pal.alb"), "material.veneer"),
        cookie,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
  });

  it("stores the same finish once the document names the material that offers it", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing(paletteFinish("veneer.stejar"), "material.veneer"),
        cookie,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
  });

  // ADR 0014 S2 again: a stable code, never the reason. The code names no placement and no colour.
  it("echoes neither the finish nor the material back to the caller", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, {
        body: bodyWearing(paletteFinish("veneer.stejar")),
        cookie,
      }),
      routeParams(id),
    );

    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("veneer.stejar");
    expect(body).not.toContain("UNOFFERED");
  });
});
