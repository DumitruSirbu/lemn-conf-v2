import {
  KITCHEN_L_DESIGN,
  MAX_DESIGN_BYTES,
  MAX_PLACEMENTS,
  DesignNotFoundError,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { DesignWriteForbiddenError } from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The one property these tests need from the repository: a save lands only for the credential the
 *  row was minted with, so a rejection can be attributed to the payload and not to authorisation. */
class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string }
  >();
  private readonly rawRows = new Map<DesignId, unknown>();
  private nextId = 0;

  mint(design: Design, writeTokenHash: string): Promise<DesignId> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash });
    return Promise.resolve(id);
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
  }: AuthorizedSave): Promise<DesignId> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    this.rows.set(id, { ...row, design });
    return Promise.resolve(id);
  }

  load(id: DesignId): Promise<Design> {
    const raw = this.rawRows.get(id);
    // A raw row goes through the real migration, which is what makes an invalid stored document
    // fail here the way it fails in the Neon adapter rather than by a hand-thrown error.
    if (raw !== undefined) {
      try {
        return Promise.resolve(migrateDesign(1, raw));
      } catch (error) {
        return Promise.reject(error as Error);
      }
    }
    const row = this.rows.get(id);
    return row
      ? Promise.resolve(row.design)
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

function saveRequest(
  id: string,
  { body, cookie }: { body: BodyInit; cookie: string },
): NextRequest {
  // `duplex` is required by undici for a streamed request body and is absent from the DOM
  // `RequestInit` this project's lib targets, which is the only reason for the cast.
  const init = {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
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
