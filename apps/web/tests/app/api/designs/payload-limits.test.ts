import {
  KITCHEN_L_DESIGN,
  MAX_DESIGN_BYTES,
  MAX_PLACEMENTS,
  DesignNotFoundError,
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
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The one property these tests need from the repository: a save lands only for the credential the
 *  row was minted with, so a rejection can be attributed to the payload and not to authorisation. */
/** What `0004_add_design_revision.sql` gives every row. These tests mint and save once, so it is
 *  also the revision every save in this file states. */
const FIRST_REVISION = "1";

class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string; revision: string }
  >();
  private readonly rawRows = new Map<DesignId, unknown>();
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
    // The order the real repository uses: the credential decides between 403 and 409, so a caller
    // without one can never see a conflict and never learn the design exists.
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
    const raw = this.rawRows.get(id);
    // A raw row goes through the real migration, which is what makes an invalid stored document
    // fail here the way it fails in the Neon adapter rather than by a hand-thrown error.
    if (raw !== undefined) {
      try {
        return Promise.resolve({
          design: migrateDesign(1, raw),
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

  /** A row already sitting in the database, stored before this validator existed or written by a
   *  future one — the case the load path has to survive. */
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
const { GET, PUT } = await import("../../../../src/app/api/designs/[id]/route");

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

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Every save this file sends states a revision, because the route refuses one that does not
 *  (WEB-003). It is always the revision a mint produces, which is what these tests hold. */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

function saveRequest(
  id: string,
  {
    body,
    cookie,
    revision = FIRST_REVISION,
  }: { body: BodyInit; cookie: string; revision?: string },
): NextRequest {
  // `duplex` is required by undici for a streamed request body and is absent from the DOM
  // `RequestInit` this project's lib targets, which is the only reason for the cast.
  const init = {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: revision,
    },
    body,
    duplex: "half",
  } as unknown as ConstructorParameters<typeof NextRequest>[1];
  return new NextRequest(`https://example.test/api/designs/${id}`, init);
}

/** The seeded design's first placement, as a value rather than a possibly-missing one: an empty
 *  fixture means this test file's own premise is wrong, and that should read as a failure. */
function firstSeededPlacement(): Design["placements"][number] {
  const [first] = KITCHEN_L_DESIGN.placements;
  if (first === undefined) throw new Error("Seeded design has no placements");
  return first;
}

/** A body delivered in chunks with **no** `Content-Length`, which is the case a header-based limit
 *  cannot see. `pulledChunks` reports how much of it the handler actually consumed. */
const CHUNK_BYTES = 1024;

function chunkedBody(totalBytes: number): {
  body: ReadableStream<Uint8Array>;
  pulledChunks: () => number;
} {
  const chunk = new TextEncoder().encode("x".repeat(CHUNK_BYTES));
  const chunkCount = Math.ceil(totalBytes / chunk.byteLength);
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunkCount) {
        controller.close();
        return;
      }
      pulled += 1;
      controller.enqueue(chunk);
    },
  });
  return { body, pulledChunks: () => pulled };
}

describe("PUT /api/designs/[id] payload limits", () => {
  it("saves an authorized, valid design", async () => {
    const { id, cookie } = await mintDesign();
    const design: Design = { ...KITCHEN_L_DESIGN, presetId: "edited" };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(fakeRepository.storedDesign(id)).toEqual(design);
  });

  it("stores an otherwise-valid design whose only diagnostic is placement overflow", async () => {
    const { id, cookie } = await mintDesign();
    const first = firstSeededPlacement();
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          ...first,
          alongMm: KITCHEN_L_DESIGN.room.widthMm - first.body.widthMm / 2 + 1,
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(fakeRepository.storedDesign(id)).toEqual(design);
  });

  it("persists overflow only with the matching credential and revision", async () => {
    const { id, cookie } = await mintDesign();
    const first = firstSeededPlacement();
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          ...first,
          alongMm: KITCHEN_L_DESIGN.room.widthMm - first.body.widthMm / 2 + 1,
        },
      ],
    };
    const body = JSON.stringify(design);

    const forbidden = await PUT(
      saveRequest(id, { body, cookie: "" }),
      routeParams(id),
    );
    expect(forbidden.status).toBe(403);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);

    const conflicted = await PUT(
      saveRequest(id, { body, cookie, revision: "999" }),
      routeParams(id),
    );
    expect(conflicted.status).toBe(409);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);

    const saved = await PUT(saveRequest(id, { body, cookie }), routeParams(id));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ id, revision: "2" });
    expect(fakeRepository.storedDesign(id)).toEqual(design);
  });

  it("still refuses overflow when a separate fatal placement issue accompanies it", async () => {
    const { id, cookie } = await mintDesign();
    const first = firstSeededPlacement();
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          ...first,
          alongMm: KITCHEN_L_DESIGN.room.widthMm - first.body.widthMm / 2 + 1,
          y0Mm: KITCHEN_L_DESIGN.room.heightMm,
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("does not leak hostile values when a fatal body issue accompanies overflow", async () => {
    const { id, cookie } = await mintDesign();
    const first = firstSeededPlacement();
    const canary = "LEAK-CANARY-6A3";
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          ...first,
          id: canary,
          alongMm: KITCHEN_L_DESIGN.room.widthMm - first.body.widthMm / 2 + 1,
          body: { ...first.body, buildId: canary },
        },
      ],
    };
    const logged = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );
    const responseBody = await response.text();
    const logLine = logged.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(response.status).toBe(400);
    expect(JSON.parse(responseBody)).toEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
    expect(responseBody).not.toContain(canary);
    expect(logLine).toContain("UNKNOWN_BUILD_ID");
    expect(logLine).not.toContain(canary);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 413 for a chunked body over the limit, without buffering it whole", async () => {
    const { id, cookie } = await mintDesign();
    const { body, pulledChunks } = chunkedBody(MAX_DESIGN_BYTES * 4);

    const response = await PUT(
      saveRequest(id, { body, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      error: "Design payload too large.",
    });
    // Bounded by the limit, not by the body: at 4x the limit a bound stated in terms of the body
    // would pass having read almost all of it. The two terms are the chunks needed to *exceed* the
    // limit (the reader refuses on `>`, so an exact multiple is still accepted) and one more for
    // the stream's own read-ahead.
    const chunksToExceedLimit = Math.floor(MAX_DESIGN_BYTES / CHUNK_BYTES) + 1;
    expect(pulledChunks()).toBeLessThanOrEqual(chunksToExceedLimit + 1);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 413 rather than 400 — the size gate runs before the schema", async () => {
    const { id, cookie } = await mintDesign();
    // Valid JSON of the wrong shape: a 400 here would prove the schema saw it first.
    const oversized = JSON.stringify({ junk: "y".repeat(MAX_DESIGN_BYTES) });

    const response = await PUT(
      saveRequest(id, { body: oversized, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(413);
  });

  it("answers 413 and logs nothing when an oversized body's stream then errors", async () => {
    const { id, cookie } = await mintDesign();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const chunk = new Uint8Array(MAX_DESIGN_BYTES + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
      },
      pull(controller) {
        controller.error(new Error("aborted by peer"));
      },
    });

    const response = await PUT(
      saveRequest(id, { body, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(413);
    // The whole point of the silent 413: one attacker-chosen log write per oversized request is
    // the amplification the byte limit exists to remove.
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 400, not a framework 500, when the request stream breaks mid-body", async () => {
    const { id, cookie } = await mintDesign();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"room":'));
      },
      pull(controller) {
        controller.error(new Error("aborted by peer"));
      },
    });

    const response = await PUT(
      saveRequest(id, { body, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
    // The defect this replaces: the rejection escaped the handler and Next answered with a
    // framework 500 whose log line carried a stack trace.
    const logged = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain("at ");
    expect(logged).not.toContain("aborted by peer");
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 400 with a stable code for a design naming an unknown body", async () => {
    const { id, cookie } = await mintDesign();
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          id: "evil",
          wall: "A",
          alongMm: 500,
          y0Mm: 0,
          body: { buildId: "unknown-builder", widthMm: 600, heightMm: 720 },
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 400 for duplicate placement ids", async () => {
    const { id, cookie } = await mintDesign();
    const first = firstSeededPlacement();
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: [first, { ...first, alongMm: 2400 }],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 400 for a 40 mm body", async () => {
    const { id, cookie } = await mintDesign();
    const first = firstSeededPlacement();
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        { ...first, body: { ...first.body, heightMm: 40 } },
        ...KITCHEN_L_DESIGN.placements.slice(1),
      ],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("answers 400 for a negative room dimension", async () => {
    const { id, cookie } = await mintDesign();
    const design = {
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, widthMm: -1 },
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  // ADR 0044 at the **write seam itself**, which is where a hostile or hand-edited document arrives.
  // Wave 5B2a proved the same refusal through `validateDesignForCatalog` directly; a route that
  // stopped calling it would leave that test green and this one red, which is the whole point of
  // asserting it here as well.
  it("answers 400 for an empty column that overlaps a placement", async () => {
    const { id, cookie } = await mintDesign();
    // `p0` is the 800 mm sink at 1300, so it fills 900–1700. This strip is inside it.
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      emptyColumns: [
        {
          wall: "A",
          alongMm: 1500,
          widthMm: 200,
          y0Mm: 0,
          topMm: 820,
          depthMm: 580,
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });

  // The boundary the refusal above must not swallow: ADR 0046 **merges** two spaces that touch, so
  // an entry abutting a placement is a legal document and the write seam has to store it. Without
  // this row a `>` loosened to `>=` in the overlap predicate would go unnoticed.
  it("stores an empty column that abuts a placement without overlapping it", async () => {
    const { id, cookie } = await mintDesign();
    // `p4` is the 600 mm drawer bank at 3200, so it ends at 3500; this strip starts there and runs
    // to the end of wall A, which ADR 0065 corrected to 3560 mm — 60 mm, not the 100 this claimed
    // while the along-wall bound was the longer of the room's two runs.
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      emptyColumns: [
        {
          wall: "A",
          alongMm: 3530,
          widthMm: 60,
          y0Mm: 0,
          topMm: 820,
          depthMm: 580,
        },
      ],
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(fakeRepository.storedDesign(id)).toEqual(design);
  });

  it("answers 400 when updatedAt precedes createdAt", async () => {
    const { id, cookie } = await mintDesign();
    const design = {
      ...KITCHEN_L_DESIGN,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    };

    const response = await PUT(
      saveRequest(id, { body: JSON.stringify(design), cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.storedDesign(id)).toEqual(KITCHEN_L_DESIGN);
  });
});

describe("GET /api/designs/[id] with an unreadable stored row", () => {
  /** Distinctive enough that finding it anywhere in the response can only mean the row's own
   *  contents were reflected back. */
  const LEAK_CANARY = "LEAK-CANARY-9f3a2b";

  function loadRequest(id: string): NextRequest {
    return new NextRequest(`https://example.test/api/designs/${id}`);
  }

  function seedRowNaming(buildId: string): string {
    const id = "design-unreadable";
    const first = firstSeededPlacement();
    fakeRepository.seedRawRow(id, {
      ...KITCHEN_L_DESIGN,
      placements: [{ ...first, body: { ...first.body, buildId } }],
    });
    return id;
  }

  it("answers 500 with a stable code and no fragment of the stored document", async () => {
    const id = seedRowNaming(LEAK_CANARY);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(loadRequest(id), routeParams(id));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      code: "DESIGN_UNREADABLE",
      error: "Design could not be loaded.",
    });
    // Asserted on the serialised body rather than one field, so a future change that adds a
    // `details` or `reason` key alongside `error` still fails this test.
    expect(body).not.toContain(LEAK_CANARY);
    expect(body).not.toContain("UNKNOWN_BUILD_ID");
    expect(body).not.toContain("placements");
  });

  it("does not put the stored document's values in the log either", async () => {
    const id = seedRowNaming(LEAK_CANARY);
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await GET(loadRequest(id), routeParams(id));

    const line = logged.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(line).toContain("UNKNOWN_BUILD_ID");
    expect(line).not.toContain(LEAK_CANARY);
  });

  it("keeps one unreadable row's log line a constant size", async () => {
    // MAX_PLACEMENTS, not more: a larger row would be refused by the schema cap and the log line
    // would describe one issue rather than the many this test is about.
    const first = firstSeededPlacement();
    fakeRepository.seedRawRow("design-unreadable", {
      ...KITCHEN_L_DESIGN,
      placements: Array.from({ length: MAX_PLACEMENTS }, (_unused, index) => ({
        ...first,
        id: `p${String(index)}`,
        body: { ...first.body, buildId: LEAK_CANARY },
      })),
    });
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await GET(
      loadRequest("design-unreadable"),
      routeParams("design-unreadable"),
    );

    // Asserted first: without it, a handler that logged nothing at all would pass every line below.
    expect(logged).toHaveBeenCalledOnce();
    const line = String(logged.mock.calls[0]?.[1]);
    expect(line.length).toBeLessThan(400);
    expect(line).toContain("issue(s)");
    expect(line).not.toContain(LEAK_CANARY);
  });
});
