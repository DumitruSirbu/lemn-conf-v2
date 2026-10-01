// M3 work item 10: the browser `ConfigurationRepository`.
//
// What is asserted here is the HTTP contract — which verb goes to which URL, what a non-2xx does,
// and that every request is credentialed so the write-token cookie travels. The cookie's actual
// round trip through a browser is not provable from here (there is no cookie jar in this process);
// `apps/web/tests/e2e/design-write-path.e2e.spec.ts` is where that is proven.
import {
  KITCHEN_L_DESIGN,
  InvalidDesignError,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  FetchConfigurationRepository,
  sessionConfigurationRepository,
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "../../src/persistence/fetch-configuration-repository";

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly credentials: RequestCredentials | undefined;
  readonly body: string | undefined;
}

/** The revision every scripted response reports and every scripted save states. These tests are
 *  about the HTTP contract, not about concurrency, so one value throughout keeps them readable;
 *  the conflict behaviour has its own tests below. */
const STORED_REVISION = "1";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("FetchConfigurationRepository", () => {
  let requests: RecordedRequest[];
  let responses: (() => Response)[];

  beforeEach(() => {
    requests = [];
    responses = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        credentials: init.credentials,
        body: typeof init.body === "string" ? init.body : undefined,
      });
      const next = responses.shift();
      if (!next)
        throw new Error(`unscripted request: ${init.method ?? "GET"} ${url}`);
      return Promise.resolve(next());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function scriptSuccessfulMint(id: string) {
    responses.push(() => jsonResponse({ id, revision: STORED_REVISION }, 201));
    responses.push(() => jsonResponse({ id, revision: STORED_REVISION }));
  }

  it("mints with POST and then writes the design to the minted id with PUT", async () => {
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");

    const saved = await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    expect(saved).toEqual({ id: "design-1", revision: STORED_REVISION });
    expect(
      requests.map((request) => `${request.method} ${request.url}`),
    ).toEqual(["POST /api/designs", "PUT /api/designs/design-1"]);
    // The mint route takes no body and seeds the fixture design, so without the PUT the
    // customer's first edit would never reach the database.
    expect(requests[0]?.body).toBeUndefined();
    expect(requests[1]?.body).toBe(JSON.stringify(KITCHEN_L_DESIGN));
  });

  it("mints through the create-design lock, exclusive, and only the mint (M7 wave 7E3b S6, D2)", async () => {
    const requestedLocks: { name: string; mode: string }[] = [];
    vi.stubGlobal("navigator", {
      locks: {
        request: (
          name: string,
          options: { mode: string },
          callback: () => Promise<unknown>,
        ) => {
          requestedLocks.push({ name, mode: options.mode });
          return callback();
        },
      },
    });
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");

    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    // Exactly one lock request, for the mint alone — the PUT that follows takes no lock at all.
    expect(requestedLocks).toEqual([
      { name: "lemnaria:create-design", mode: "exclusive" },
    ]);
  });

  it("sends every request with same-origin credentials, so the write-token cookie travels", async () => {
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        revision: STORED_REVISION,
        design: KITCHEN_L_DESIGN,
      }),
    );

    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });
    await repository.loadWithAccess("design-1");

    expect(requests).not.toHaveLength(0);
    for (const request of requests)
      expect(request.credentials).toBe("same-origin");
  });

  it("updates an existing id without minting anything", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({ id: "design-1", revision: STORED_REVISION }),
    );

    await repository.save({
      id: "design-1",
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    expect(requests.map((request) => request.method)).toEqual(["PUT"]);
  });

  it("mints exactly once for two overlapping saves that both start with no id", async () => {
    // Nothing serialises these two calls: `resolveTargetId` must collapse them itself, or both
    // read `null`, both mint, and the design forks into two rows.
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");
    responses.push(() =>
      jsonResponse({ id: "design-1", revision: STORED_REVISION }),
    );

    await Promise.all([
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ]);

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
      2,
    );
  });

  it("deduplicates one opaque provisional identity but mints separately for another", async () => {
    const repository = new FetchConfigurationRepository();
    const provisionalA = {};
    const provisionalB = {};
    scriptSuccessfulMint("design-a");
    responses.push(() =>
      jsonResponse({ id: "design-a", revision: STORED_REVISION }),
    );
    scriptSuccessfulMint("design-b");

    await Promise.all([
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
        provisionalMintIdentity: provisionalA,
      }),
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
        provisionalMintIdentity: provisionalA,
      }),
    ]);
    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
      provisionalMintIdentity: provisionalB,
    });

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
    expect(
      requests
        .filter((request) => request.method === "PUT")
        .map((request) => request.url),
    ).toEqual([
      "/api/designs/design-a",
      "/api/designs/design-a",
      "/api/designs/design-b",
    ]);
  });

  it("holds one provisional identity's mint guarantee on the singleton the app uses", async () => {
    // The store's coalescer and `/d/{id}`'s write-access probe share this repository. The
    // coalescer supplies one opaque identity per fresh design; overlapping attempts carrying the
    // same identity must still collapse on the real singleton, not only on a locally built object.
    const provisionalIdentity = {};
    scriptSuccessfulMint("design-shared");
    responses.push(() =>
      jsonResponse({ id: "design-shared", revision: STORED_REVISION }),
    );

    await Promise.all([
      sessionConfigurationRepository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
        provisionalMintIdentity: provisionalIdentity,
      }),
      sessionConfigurationRepository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
        provisionalMintIdentity: provisionalIdentity,
      }),
    ]);

    expect(sessionConfigurationRepository).toBeInstanceOf(
      FetchConfigurationRepository,
    );
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
  });

  it("mints again after a mint that failed, rather than caching the rejection forever", async () => {
    // A cached rejected promise would make every later save in the session fail, which is worse
    // than the fork it was guarding against.
    const repository = new FetchConfigurationRepository();
    responses.push(() => jsonResponse({ error: "down" }, 503));
    scriptSuccessfulMint("design-1");

    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toBeInstanceOf(DesignRequestFailedError);
    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).resolves.toEqual({ id: "design-1", revision: STORED_REVISION });

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
  });

  it("mints exactly once even when the write that follows the mint fails and is retried", async () => {
    // The failure mode this guards: the store's `designId` is only set after a *fully* successful
    // save, so the coalescer retries with `null` — and an unguarded repository mints a second row,
    // silently forking the design.
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({ id: "design-1", revision: STORED_REVISION }, 201),
    );
    responses.push(() => jsonResponse({ error: "nope" }, 500));
    responses.push(() =>
      jsonResponse({ id: "design-1", revision: STORED_REVISION }),
    );

    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toBeInstanceOf(DesignRequestFailedError);
    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).resolves.toEqual({ id: "design-1", revision: STORED_REVISION });

    expect(
      requests.map((request) => `${request.method} ${request.url}`),
    ).toEqual([
      "POST /api/designs",
      "PUT /api/designs/design-1",
      "PUT /api/designs/design-1",
    ]);
  });

  const nonSuccessStatuses = [400, 404, 409, 500] as const;
  for (const status of nonSuccessStatuses) {
    it(`rejects rather than resolving when a save answers ${String(status)}`, async () => {
      const repository = new FetchConfigurationRepository();
      responses.push(() => jsonResponse({ error: "refused" }, status));

      await expect(
        repository.save({
          id: "design-1",
          design: KITCHEN_L_DESIGN,
          expectedRevision: STORED_REVISION,
        }),
      ).rejects.toBeInstanceOf(DesignRequestFailedError);
    });
  }

  const notAuthorizedStatuses = [401, 403] as const;
  for (const status of notAuthorizedStatuses) {
    it(`rejects a save refused with ${String(status)} as a credential failure, not a retryable one`, async () => {
      const repository = new FetchConfigurationRepository();
      responses.push(() => jsonResponse({ error: "refused" }, status));

      const failure: unknown = await repository
        .save({
          id: "design-1",
          design: KITCHEN_L_DESIGN,
          expectedRevision: STORED_REVISION,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(WriteNotAuthorizedError);
      // Still a failed request, so a caller that only cares about that keeps working.
      expect(failure).toBeInstanceOf(DesignRequestFailedError);
    });
  }

  it("rejects when a mint answers 2xx with no id", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() => jsonResponse({ nothing: true }, 201));

    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toBeInstanceOf(DesignRequestFailedError);
  });

  it("loads and validates a design from GET", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        revision: STORED_REVISION,
        design: KITCHEN_L_DESIGN,
      }),
    );

    const loaded = await repository.loadWithAccess("design-1");

    expect(loaded.design).toEqual(KITCHEN_L_DESIGN);
    expect(requests[0]?.url).toBe("/api/designs/design-1");
  });

  it("carries canWrite back beside the design, from the one GET", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        revision: STORED_REVISION,
        design: KITCHEN_L_DESIGN,
        canWrite: true,
      }),
    );

    const loaded = await repository.loadWithAccess("design-1");

    expect(loaded).toEqual({
      design: KITCHEN_L_DESIGN,
      revision: STORED_REVISION,
      canWrite: true,
    });
    // One request, not two: the credential answer rides the read it was already going to make.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
  });

  it("gives up on a load that never settles, so the panel is not stranded", async () => {
    // Finding S7-F1. `fetch` does not distinguish a hung request from a slow one, and `/d/{id}`'s
    // probe reads a pending promise as "still checking" — a state that carries no retry. Without a
    // bound, a blackholed request disables the panel permanently for the design's own author.
    vi.useFakeTimers();
    const repository = new FetchConfigurationRepository();
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const load = repository.loadWithAccess("design-1");
    // Attached before the timers run, so the rejection is never unhandled.
    const outcome = load.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);

    // The adapter's own error type, not the browser's `DOMException`: a caller branching on this
    // module's contract would not recognise the latter.
    expect(await outcome).toBeInstanceOf(DesignRequestFailedError);
    vi.useRealTimers();
  });

  it("leaves a load that answers in time untouched, and cancels nothing behind it", async () => {
    // The other side of the bound: the timeout must not fire against a completed request, which is
    // what the cleared timer is for. `vi.getTimerCount()` is the observation that proves it.
    vi.useFakeTimers();
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        revision: STORED_REVISION,
        design: KITCHEN_L_DESIGN,
        canWrite: true,
      }),
    );

    const loaded = await repository.loadWithAccess("design-1");

    expect(loaded.canWrite).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("reports canWrite: false when the route says so", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        revision: STORED_REVISION,
        design: KITCHEN_L_DESIGN,
        canWrite: false,
      }),
    );

    expect((await repository.loadWithAccess("design-1")).canWrite).toBe(false);
  });

  it.each([
    { name: "absent", payload: {} },
    { name: "a string", payload: { canWrite: "true" } },
    { name: "a number", payload: { canWrite: 1 } },
    { name: "null", payload: { canWrite: null } },
  ])(
    "falls back to read-only when canWrite is $name — never offers an edit on a guess",
    async ({ payload }) => {
      const repository = new FetchConfigurationRepository();
      responses.push(() =>
        jsonResponse({
          id: "design-1",
          revision: STORED_REVISION,
          design: KITCHEN_L_DESIGN,
          ...payload,
        }),
      );

      expect((await repository.loadWithAccess("design-1")).canWrite).toBe(
        false,
      );
    },
  );

  it("rejects a loaded payload that is not a valid design rather than handing it to the store", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        revision: STORED_REVISION,
        design: { presetId: 7 },
      }),
    );

    await expect(repository.loadWithAccess("design-1")).rejects.toBeInstanceOf(
      InvalidDesignError,
    );
  });

  it("percent-encodes the id it puts in the path", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({ id: "a/b", revision: STORED_REVISION }),
    );

    await repository.save({
      id: "a/b",
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    expect(requests[0]?.url).toBe("/api/designs/a%2Fb");
  });
});

/**
 * WEB-003 at the transport. Before wave S11 `save` took `(id, design)` and sent a `PUT` with no
 * statement of what it was editing, so the server had nothing to make the write conditional on.
 *
 * Every test here fails against that adapter: there was no header to assert, no `revision` in the
 * result to read, and a 409 was folded into the undifferentiated terminal failure.
 */
describe("FetchConfigurationRepository states the revision it is editing", () => {
  let requests: { headers: Headers; method: string }[];
  let respond: () => Response;

  beforeEach(() => {
    requests = [];
    respond = () =>
      new Response(JSON.stringify({ id: "design-1", revision: "2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      requests.push({
        headers: new Headers(init.headers),
        method: init.method ?? "GET",
      });
      return Promise.resolve(respond());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the expected revision as a header, never inside the design document", async () => {
    // `DesignSchema` is a strictObject, so a revision smuggled into the body would be rejected by
    // the schema — and transport metadata inside the customer's document is how the two come to be
    // confused later.
    const repository = new FetchConfigurationRepository();

    await repository.save({
      id: "design-1",
      design: KITCHEN_L_DESIGN,
      expectedRevision: "7",
    });

    expect(requests[0]?.headers.get("x-expected-revision")).toBe("7");
  });

  it("returns the revision the save produced, so the next save can state it", async () => {
    const repository = new FetchConfigurationRepository();

    const saved = await repository.save({
      id: "design-1",
      design: KITCHEN_L_DESIGN,
      expectedRevision: "1",
    });

    expect(saved).toEqual({ id: "design-1", revision: "2" });
  });

  it("carries the mint's own revision into the PUT that follows it", async () => {
    // A mint decides its own first revision and nothing before it could have known one, so what
    // the caller passed must be ignored rather than sent.
    const repository = new FetchConfigurationRepository();
    respond = () =>
      new Response(JSON.stringify({ id: "minted", revision: "1" }), {
        status: requests.at(-1)?.method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });

    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: "99",
    });

    expect(requests[1]?.headers.get("x-expected-revision")).toBe("1");
  });

  it("raises WriteConflictError for a 409, which no retry may be armed against", async () => {
    const repository = new FetchConfigurationRepository();
    respond = () => new Response("{}", { status: 409 });

    const failure: unknown = await repository
      .save({
        id: "design-1",
        design: KITCHEN_L_DESIGN,
        expectedRevision: "1",
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(WriteConflictError);
    // Under the terminal type, so a caller that has not learned about conflicts still stops.
    expect(failure).toBeInstanceOf(WriteNotRetryableError);
    // And not the credential type, which would tell the panel the design is read-only when it is
    // this browser's own design and perfectly writable.
    expect(failure).not.toBeInstanceOf(WriteNotAuthorizedError);
  });

  it("rejects a 2xx save that carries no revision rather than reusing the old one", async () => {
    // Silently keeping the previous revision is how a client starts overwriting its own newer
    // state: the next save would state a revision the server has already consumed.
    const repository = new FetchConfigurationRepository();
    respond = () =>
      new Response(JSON.stringify({ id: "design-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(
      repository.save({
        id: "design-1",
        design: KITCHEN_L_DESIGN,
        expectedRevision: "1",
      }),
    ).rejects.toThrow(/carried no design revision/);
  });

  it("rejects a load that carries no revision, rather than handing over a document it cannot write back", async () => {
    const repository = new FetchConfigurationRepository();
    respond = () =>
      new Response(
        JSON.stringify({ id: "design-1", design: KITCHEN_L_DESIGN }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(repository.loadWithAccess("design-1")).rejects.toThrow(
      /carried no design revision/,
    );
  });
});
