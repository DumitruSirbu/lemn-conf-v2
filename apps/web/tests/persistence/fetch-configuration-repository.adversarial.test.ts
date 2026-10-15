// Adversarial QA for M3 Wave 3C-2b: the `fetch` repository's own contract, independent of the
// coalescer that currently protects it.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { InvalidDesignError } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRetryableStatus,
  WriteNotRetryableError,
} from "../../src/persistence/design-request-errors";
import {
  DesignRequestFailedError,
  FetchConfigurationRepository,
  WriteNotAuthorizedError,
} from "../../src/persistence/fetch-configuration-repository";

interface Recorded {
  readonly url: string;
  readonly method: string;
}

let requests: Recorded[];

function respondWith(
  handler: (request: Recorded) => Response | Promise<Response>,
): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const request = { url, method: init.method ?? "GET" };
    requests.push(request);
    return Promise.resolve(handler(request));
  });
}

/** The revision every scripted response reports and every scripted save states. These tests attack
 *  the transport, not the concurrency rule, so one value keeps them readable. */
const STORED_REVISION = "1";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  requests = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// FINDING QA-1 — found in R1, fixed in R1.1 by caching the in-flight **promise** rather than the
// awaited id. These cases are the standing guard. The block below them attacks the thing that fix
// most easily gets wrong: a cached promise that *rejected*, which would make one transient network
// blip poison every save for as long as the tab stayed open.
describe("mint-exactly-once holds without help from the caller", () => {
  it("mints one row for two overlapping saves on an unminted design", async () => {
    respondWith(
      (request) =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(
              jsonResponse(
                { id: "minted", revision: STORED_REVISION },
                request.method === "POST" ? 201 : 200,
              ),
            );
          }, 5);
        }),
    );
    const repository = new FetchConfigurationRepository();

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
  });

  it("mints one row for a sequential pair, which is the path the coalescer takes", async () => {
    respondWith((request) =>
      jsonResponse(
        { id: "minted", revision: STORED_REVISION },
        request.method === "POST" ? 201 : 200,
      ),
    );
    const repository = new FetchConfigurationRepository();

    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });
    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
      2,
    );
  });
});

describe("every way a response can disappoint", () => {
  const FAILING_STATUSES = [400, 401, 403, 404, 409, 429, 500, 502, 503];

  it.each(FAILING_STATUSES)(
    "rejects a mint that answers %i",
    async (status) => {
      respondWith(() => jsonResponse({ error: "no" }, status));
      const repository = new FetchConfigurationRepository();

      await expect(
        repository.save({
          id: null,
          design: KITCHEN_L_DESIGN,
          expectedRevision: STORED_REVISION,
        }),
      ).rejects.toThrow(DesignRequestFailedError);
      // And nothing was written: a failed mint must not be followed by a PUT to an id it never got.
      expect(requests.map((request) => request.method)).toEqual(["POST"]);
    },
  );

  it("rejects when the network itself fails", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const repository = new FetchConfigurationRepository();

    await expect(
      repository.save({
        id: "existing-id",
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toThrow(TypeError);
  });

  it("rejects a 2xx whose body is not JSON at all", async () => {
    respondWith(
      () => new Response("<html>a proxy error page</html>", { status: 200 }),
    );
    const repository = new FetchConfigurationRepository();

    await expect(
      repository.save({
        id: "existing-id",
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toThrow(/not parseable JSON/);
  });

  it.each([
    { name: "an empty object", body: {} },
    { name: "a null id", body: { id: null, revision: STORED_REVISION } },
    { name: "a numeric id", body: { id: 7, revision: STORED_REVISION } },
    { name: "an empty-string id", body: { id: "", revision: STORED_REVISION } },
    { name: "a bare null body", body: null },
  ])("rejects a 2xx save carrying $name", async (testCase) => {
    respondWith(() => jsonResponse(testCase.body, 200));
    const repository = new FetchConfigurationRepository();

    await expect(
      repository.save({
        id: "existing-id",
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toThrow(/carried no design id/);
  });

  it("rejects a loaded design that does not validate, with the domain's own error", async () => {
    respondWith(() =>
      jsonResponse(
        { id: "x", revision: STORED_REVISION, design: { nope: true } },
        200,
      ),
    );
    const repository = new FetchConfigurationRepository();

    await expect(repository.loadWithAccess("x")).rejects.toThrow(
      InvalidDesignError,
    );
  });
});

// The failure text is what a client log would carry, and the response body is server-authored.
describe("a failure carries the status and never the response body", () => {
  it("keeps a server-authored body out of the error it throws", async () => {
    const serverText = "Design write not authorized. token=leaky-detail";
    respondWith(() => jsonResponse({ error: serverText }, 403));
    const repository = new FetchConfigurationRepository();

    const failure = await repository
      .save({
        id: "existing-id",
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(DesignRequestFailedError);
    expect((failure as Error).message).toContain("403");
    expect((failure as Error).message).not.toContain("leaky-detail");
    expect((failure as Error).message).not.toContain("authorized");
  });
});

describe("the id in the path", () => {
  it("percent-encodes an id that would otherwise change the route", async () => {
    respondWith(() =>
      jsonResponse({ id: "x", revision: STORED_REVISION }, 200),
    );
    const repository = new FetchConfigurationRepository();

    await repository.save({
      id: "../../admin?x=1",
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    expect(requests[0]?.url).toBe("/api/designs/..%2F..%2Fadmin%3Fx%3D1");
    expect(requests[0]?.url).not.toContain("?");
  });
});

// R1.1's harder half. Caching a promise is the right fix; caching a *rejected* one is a worse bug
// than the race it replaced, because it is permanent and silent.
describe("a mint that fails is not cached as a failure", () => {
  it("lets a later save mint again after an earlier mint failed", async () => {
    let mintsRemainingToFail = 1;
    respondWith((request) => {
      if (request.method === "POST" && mintsRemainingToFail > 0) {
        mintsRemainingToFail -= 1;
        return jsonResponse({ error: "no" }, 500);
      }
      return jsonResponse(
        { id: "minted", revision: STORED_REVISION },
        request.method === "POST" ? 201 : 200,
      );
    });
    const repository = new FetchConfigurationRepository();

    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).rejects.toThrow(DesignRequestFailedError);
    // The session must not be poisoned: the next save has to try again, and succeed.
    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).resolves.toEqual({ id: "minted", revision: STORED_REVISION });

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
  });

  it("collapses two saves that overlap a failing mint into one attempt, then recovers", async () => {
    let mintsRemainingToFail = 1;
    respondWith(
      (request) =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            if (request.method === "POST" && mintsRemainingToFail > 0) {
              mintsRemainingToFail -= 1;
              resolve(jsonResponse({ error: "no" }, 500));
              return;
            }
            resolve(
              jsonResponse(
                { id: "minted", revision: STORED_REVISION },
                request.method === "POST" ? 201 : 200,
              ),
            );
          }, 5);
        }),
    );
    const repository = new FetchConfigurationRepository();

    const outcomes = await Promise.allSettled([
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

    // One attempt shared by both callers, and both told about the failure.
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "rejected",
      "rejected",
    ]);

    await expect(
      repository.save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      }),
    ).resolves.toEqual({ id: "minted", revision: STORED_REVISION });
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
  });

  it("keeps a fulfilled mint for the session rather than minting per save", async () => {
    respondWith((request) =>
      jsonResponse(
        { id: "minted", revision: STORED_REVISION },
        request.method === "POST" ? 201 : 200,
      ),
    );
    const repository = new FetchConfigurationRepository();

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
    await repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: STORED_REVISION,
    });

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
      3,
    );
  });
});

// R1.2 at this layer: the type the coalescer branches on has to be thrown for exactly the statuses
// that mean "this browser holds no credential", and for no others.
describe("only a credential refusal gets the terminal error type", () => {
  it.each([401, 403])(
    "throws WriteNotAuthorizedError for %i on a save",
    async (status) => {
      respondWith(() => jsonResponse({ error: "no" }, status));
      const repository = new FetchConfigurationRepository();

      const failure = await repository
        .save({
          id: "existing-id",
          design: KITCHEN_L_DESIGN,
          expectedRevision: STORED_REVISION,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(WriteNotAuthorizedError);
      // Still a DesignRequestFailedError, so a caller that only cares that it failed keeps working.
      expect(failure).toBeInstanceOf(DesignRequestFailedError);
      expect((failure as Error).message).toContain(String(status));
    },
  );

  // R2's classification, swept in full. Re-aimed: my earlier version only asked "not the credential
  // error", which every one of these satisfied even when the split was a two-element list. What
  // matters now is retryable versus terminal, so that is what is asserted — one row per status,
  // with the expectation written out rather than derived, so a status that quietly changes side
  // fails here instead of passing under a weaker predicate.
  const CLASSIFICATION: readonly {
    readonly status: number;
    readonly retryable: boolean;
    readonly credential: boolean;
  }[] = [
    { status: 400, retryable: false, credential: false },
    { status: 401, retryable: false, credential: true },
    { status: 403, retryable: false, credential: true },
    { status: 404, retryable: false, credential: false },
    { status: 408, retryable: true, credential: false },
    { status: 409, retryable: false, credential: false },
    { status: 413, retryable: false, credential: false },
    { status: 429, retryable: true, credential: false },
    { status: 500, retryable: true, credential: false },
    { status: 502, retryable: true, credential: false },
    { status: 503, retryable: true, credential: false },
    { status: 504, retryable: true, credential: false },
  ];

  it.each(CLASSIFICATION)(
    "classifies $status as retryable=$retryable, credential=$credential",
    async (testCase) => {
      respondWith(() => jsonResponse({ error: "no" }, testCase.status));
      const repository = new FetchConfigurationRepository();

      const failure = await repository
        .save({
          id: "existing-id",
          design: KITCHEN_L_DESIGN,
          expectedRevision: STORED_REVISION,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(DesignRequestFailedError);
      expect(failure instanceof WriteNotRetryableError).toBe(
        !testCase.retryable,
      );
      expect(failure instanceof WriteNotAuthorizedError).toBe(
        testCase.credential,
      );
    },
  );

  it("agrees with the exported predicate on every status it classifies", () => {
    for (const testCase of CLASSIFICATION) {
      expect(isRetryableStatus(testCase.status), String(testCase.status)).toBe(
        testCase.retryable,
      );
    }
  });

  // Worth stating rather than assuming: a 403 on the **mint** is not the same fact. The mint route
  // takes no credential, so a 403 there is a gateway or firewall answer, not a missing cookie — and
  // it is deliberately left retryable.
  it("does not treat a refused mint as a credential refusal", async () => {
    respondWith(() => jsonResponse({ error: "no" }, 403));
    const repository = new FetchConfigurationRepository();

    const failure = await repository
      .save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: STORED_REVISION,
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(DesignRequestFailedError);
    expect(failure).not.toBeInstanceOf(WriteNotAuthorizedError);
  });
});
