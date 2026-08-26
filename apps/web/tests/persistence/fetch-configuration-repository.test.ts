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
import type { Design } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  FetchConfigurationRepository,
  sessionConfigurationRepository,
  WriteNotAuthorizedError,
} from "../../src/persistence/fetch-configuration-repository";

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly credentials: RequestCredentials | undefined;
  readonly body: string | undefined;
}

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
    responses.push(() => jsonResponse({ id }, 201));
    responses.push(() => jsonResponse({ id }));
  }

  it("mints with POST and then writes the design to the minted id with PUT", async () => {
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");

    const savedId = await repository.save(null, KITCHEN_L_DESIGN);

    expect(savedId).toBe("design-1");
    expect(
      requests.map((request) => `${request.method} ${request.url}`),
    ).toEqual(["POST /api/designs", "PUT /api/designs/design-1"]);
    // The mint route takes no body and seeds the fixture design, so without the PUT the
    // customer's first edit would never reach the database.
    expect(requests[1]?.body).toBe(JSON.stringify(KITCHEN_L_DESIGN));
  });

  it("sends every request with same-origin credentials, so the write-token cookie travels", async () => {
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");
    responses.push(() =>
      jsonResponse({ id: "design-1", design: KITCHEN_L_DESIGN }),
    );

    await repository.save(null, KITCHEN_L_DESIGN);
    await repository.load("design-1");

    expect(requests).not.toHaveLength(0);
    for (const request of requests)
      expect(request.credentials).toBe("same-origin");
  });

  it("updates an existing id without minting anything", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() => jsonResponse({ id: "design-1" }));

    await repository.save("design-1", KITCHEN_L_DESIGN);

    expect(requests.map((request) => request.method)).toEqual(["PUT"]);
  });

  it("mints exactly once for two overlapping saves that both start with no id", async () => {
    // Nothing serialises these two calls: `resolveTargetId` must collapse them itself, or both
    // read `null`, both mint, and the design forks into two rows.
    const repository = new FetchConfigurationRepository();
    scriptSuccessfulMint("design-1");
    responses.push(() => jsonResponse({ id: "design-1" }));

    await Promise.all([
      repository.save(null, KITCHEN_L_DESIGN),
      repository.save(null, KITCHEN_L_DESIGN),
    ]);

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
      2,
    );
  });

  it("holds the session's mint guarantee on the one instance the app actually uses", async () => {
    // The guarantee is per-instance: a second `new FetchConfigurationRepository()` is a second
    // `mintedId` and therefore a second row for the same session. `sessionConfigurationRepository`
    // is what both app callers hold — the store's save coalescer and `/d/{id}`'s write-access
    // probe — so the guarantee is a property of the app, not only of a locally built object.
    scriptSuccessfulMint("design-shared");
    responses.push(() => jsonResponse({ id: "design-shared" }));

    await Promise.all([
      sessionConfigurationRepository.save(null, KITCHEN_L_DESIGN),
      sessionConfigurationRepository.save(null, KITCHEN_L_DESIGN),
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
      repository.save(null, KITCHEN_L_DESIGN),
    ).rejects.toBeInstanceOf(DesignRequestFailedError);
    await expect(repository.save(null, KITCHEN_L_DESIGN)).resolves.toBe(
      "design-1",
    );

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
  });

  it("mints exactly once even when the write that follows the mint fails and is retried", async () => {
    // The failure mode this guards: the store's `designId` is only set after a *fully* successful
    // save, so the coalescer retries with `null` — and an unguarded repository mints a second row,
    // silently forking the design.
    const repository = new FetchConfigurationRepository();
    responses.push(() => jsonResponse({ id: "design-1" }, 201));
    responses.push(() => jsonResponse({ error: "nope" }, 500));
    responses.push(() => jsonResponse({ id: "design-1" }));

    await expect(
      repository.save(null, KITCHEN_L_DESIGN),
    ).rejects.toBeInstanceOf(DesignRequestFailedError);
    await expect(repository.save(null, KITCHEN_L_DESIGN)).resolves.toBe(
      "design-1",
    );

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
        repository.save("design-1", KITCHEN_L_DESIGN),
      ).rejects.toBeInstanceOf(DesignRequestFailedError);
    });
  }

  const notAuthorizedStatuses = [401, 403] as const;
  for (const status of notAuthorizedStatuses) {
    it(`rejects a save refused with ${String(status)} as a credential failure, not a retryable one`, async () => {
      const repository = new FetchConfigurationRepository();
      responses.push(() => jsonResponse({ error: "refused" }, status));

      const failure: unknown = await repository
        .save("design-1", KITCHEN_L_DESIGN)
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
      repository.save(null, KITCHEN_L_DESIGN),
    ).rejects.toBeInstanceOf(DesignRequestFailedError);
  });

  it("loads and validates a design from GET", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({ id: "design-1", design: KITCHEN_L_DESIGN }),
    );

    const loaded: Design = await repository.load("design-1");

    expect(loaded).toEqual(KITCHEN_L_DESIGN);
    expect(requests[0]?.url).toBe("/api/designs/design-1");
  });

  it("carries canWrite back beside the design, from the one GET", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
        design: KITCHEN_L_DESIGN,
        canWrite: true,
      }),
    );

    const loaded = await repository.loadWithAccess("design-1");

    expect(loaded).toEqual({ design: KITCHEN_L_DESIGN, canWrite: true });
    // One request, not two: the credential answer rides the read it was already going to make.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
  });

  it("reports canWrite: false when the route says so", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({
        id: "design-1",
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
        jsonResponse({ id: "design-1", design: KITCHEN_L_DESIGN, ...payload }),
      );

      expect((await repository.loadWithAccess("design-1")).canWrite).toBe(
        false,
      );
    },
  );

  it("rejects a loaded payload that is not a valid design rather than handing it to the store", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() =>
      jsonResponse({ id: "design-1", design: { presetId: 7 } }),
    );

    await expect(repository.load("design-1")).rejects.toBeInstanceOf(
      InvalidDesignError,
    );
  });

  it("percent-encodes the id it puts in the path", async () => {
    const repository = new FetchConfigurationRepository();
    responses.push(() => jsonResponse({ id: "a/b" }));

    await repository.save("a/b", KITCHEN_L_DESIGN);

    expect(requests[0]?.url).toBe("/api/designs/a%2Fb");
  });
});
