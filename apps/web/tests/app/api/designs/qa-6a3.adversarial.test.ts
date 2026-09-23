// `OVERFLOWING_KITCHEN_L_DESIGN` is the **one declared** overflow fixture (ADR 0083 decision 10):
// the seeded kitchen with one body a millimetre past the end of wall B, positioned relative to the
// room so a wall moving cannot silently stop it overflowing. It was hand-built in six test files
// and agreed everywhere only because the six were written together. Aliased to the local name the
// cases below already use.
import {
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN as OVERFLOWING_DESIGN,
  DesignNotFoundError,
  findOverflowingPlacementIds,
  migrateDesign,
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

/**
 * ADR 0065 decision 7 at the HTTP seams: an overflowing design **loads, saves and resumes with the
 * warning intact**. Every verb the `[id]` route exports is asked, plus the raw load path, because a
 * demotion applied at one seam and not another is the "one design marked in one place and not
 * another" failure wave 6A3 exists to prevent.
 */

const FIRST_REVISION = "1";
const SCHEMA_VERSION_OF_A_STORED_ROW = 1;

class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string; revision: string }
  >();
  private readonly rawRows = new Map<DesignId, unknown>();
  private nextId = 0;

  mint({ design, writeTokenHash }: MintDesign): Promise<DesignVersion> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash, revision: FIRST_REVISION });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
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
    const raw = this.rawRows.get(id);
    // The real migration, so a stored document fails — or does not — exactly where the Neon
    // adapter would take it.
    if (raw !== undefined) {
      try {
        return Promise.resolve({
          design: migrateDesign(SCHEMA_VERSION_OF_A_STORED_ROW, raw),
          revision: FIRST_REVISION,
        });
      } catch (error) {
        return Promise.reject(error as Error);
      }
    }
    const row = this.rows.get(id);
    return row
      ? Promise.resolve({ design: row.design, revision: row.revision })
      : Promise.reject(new DesignNotFoundError(id));
  }

  seedRawRow(id: DesignId, document: unknown): void {
    this.rawRows.set(id, document);
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
const { GET, PATCH, PUT } = await import(
  "../../../../src/app/api/designs/[id]/route"
);

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

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function saveRequest(
  id: string,
  { body, cookie, method }: { body: string; cookie: string; method: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      "x-expected-revision": FIRST_REVISION,
    },
    body,
  });
}

function loadRequest(id: string): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`);
}

describe("the seams that read validation, on an overflowing design", () => {
  it("is exactly one overflowing body and no other complaint", () => {
    expect(findOverflowingPlacementIds(OVERFLOWING_DESIGN)).toStrictEqual([
      "dragged-past-wall-b",
    ]);
  });

  it.each(["PUT", "PATCH"] as const)("saves it through %s", async (method) => {
    const { id, cookie } = await mintDesign();
    const handler = method === "PUT" ? PUT : PATCH;

    const response = await handler(
      saveRequest(id, {
        body: JSON.stringify(OVERFLOWING_DESIGN),
        cookie,
        method,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(fakeRepository.storedDesign(id)).toEqual(OVERFLOWING_DESIGN);
  });

  it("loads a stored row whose only diagnostic is the overflow", async () => {
    const id = "design-overflowing";
    fakeRepository.seedRawRow(
      id,
      JSON.parse(JSON.stringify(OVERFLOWING_DESIGN)),
    );

    const response = await GET(loadRequest(id), routeParams(id));
    const body = (await response.json()) as { design: Design };

    expect(response.status).toBe(200);
    expect(body.design).toEqual(OVERFLOWING_DESIGN);
    expect(findOverflowingPlacementIds(body.design)).toStrictEqual([
      "dragged-past-wall-b",
    ]);
  });

  it("resumes it: a save followed by a load returns the same overflow", async () => {
    const { id, cookie } = await mintDesign();

    await PUT(
      saveRequest(id, {
        body: JSON.stringify(OVERFLOWING_DESIGN),
        cookie,
        method: "PUT",
      }),
      routeParams(id),
    );
    const reloaded = await GET(loadRequest(id), routeParams(id));
    const body = (await reloaded.json()) as { design: Design };

    expect(reloaded.status).toBe(200);
    expect(findOverflowingPlacementIds(body.design)).toStrictEqual([
      "dragged-past-wall-b",
    ]);
  });

  /** The demotion is one code wide at the load seam too: a stored row carrying an overflow **and** a
   *  fatal issue is still refused, and still says nothing about its own contents. */
  it("still refuses a stored row carrying a fatal issue beside the overflow", async () => {
    const id = "design-unreadable";
    const canary = "LEAK-CANARY-6A3-LOAD";
    fakeRepository.seedRawRow(id, {
      ...OVERFLOWING_DESIGN,
      placements: OVERFLOWING_DESIGN.placements.map((placement) => ({
        ...placement,
        body: { ...placement.body, buildId: canary },
      })),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(loadRequest(id), routeParams(id));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      code: "DESIGN_UNREADABLE",
      error: "Design could not be loaded.",
    });
    expect(text).not.toContain(canary);
  });

  /** Owner, 2026-09-03: what the product *proposes* must always fit. The mint route is where the
   *  proposal becomes a row, so its document is held to the stricter rule. */
  it("mints a demo design that overflows nothing", async () => {
    const { id } = await mintDesign();
    const minted = fakeRepository.storedDesign(id);

    expect(findOverflowingPlacementIds(KITCHEN_L_DESIGN)).toStrictEqual([]);
    expect(minted).toBeDefined();
    expect(
      findOverflowingPlacementIds(minted ?? KITCHEN_L_DESIGN),
    ).toStrictEqual([]);
  });
});
