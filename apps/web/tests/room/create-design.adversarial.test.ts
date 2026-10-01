import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import {
  createDesignCreationAttempt,
  type DesignCreationRepository,
} from "@/room/create-design";

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | null | undefined;
}

const CUSTOMER_DESIGN: Design = {
  ...structuredClone(KITCHEN_L_DESIGN),
  presetId: "recipe-customer-choice",
  room: {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  },
};

describe("createDesignCreationAttempt — adversarial orchestration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collapses concurrent taps into one bodyless POST, one chosen-design PUT, then one navigation", async () => {
    const requests: RecordedRequest[] = [];
    const put = deferred<Response>();
    const putStarted = oneShotSignal();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        requests.push(recordRequest(url, init));
        if (init.method === "POST") {
          return Promise.resolve(
            jsonResponse({ id: "chosen-design", revision: "1" }, 201),
          );
        }
        if (init.method === "PUT") {
          putStarted.raise();
          return put.promise;
        }
        return Promise.reject(
          new Error(`Unexpected ${init.method ?? "GET"} ${url}`),
        );
      }),
    );
    const navigateToDesign = vi.fn();
    const attempt = createDesignCreationAttempt({
      design: CUSTOMER_DESIGN,
      repository: new FetchConfigurationRepository(),
      navigateToDesign,
    });

    const first = attempt.run();
    const second = attempt.run();
    await putStarted.promise;

    expect(second).toBe(first);
    expect(requests.map(requestLine)).toEqual([
      "POST /api/designs",
      "PUT /api/designs/chosen-design",
    ]);
    expect(requests[0]?.body).toBeUndefined();
    expect(parseJsonBody(requests[1])).toEqual(CUSTOMER_DESIGN);
    expect(requests[1]?.body).not.toContain("locale");
    expect(requests[1]?.body).not.toContain("revision");
    expect(navigateToDesign).not.toHaveBeenCalled();

    put.resolve(jsonResponse({ id: "chosen-design", revision: "2" }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: "chosen-design", revision: "2" },
      { id: "chosen-design", revision: "2" },
    ]);
    expect(navigateToDesign).toHaveBeenCalledOnce();
    expect(navigateToDesign).toHaveBeenCalledWith("chosen-design");
  });

  it("retries a failed PUT on the already minted row without issuing another POST", async () => {
    const requests: RecordedRequest[] = [];
    const responses = [
      jsonResponse({ id: "stable-row", revision: "1" }, 201),
      jsonResponse({ error: "temporarily unavailable" }, 503),
      jsonResponse({ id: "stable-row", revision: "2" }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        requests.push(recordRequest(url, init));
        const response = responses.shift();
        return response === undefined
          ? Promise.reject(new Error("Unscripted request"))
          : Promise.resolve(response);
      }),
    );
    const navigateToDesign = vi.fn();
    const attempt = createDesignCreationAttempt({
      design: CUSTOMER_DESIGN,
      repository: new FetchConfigurationRepository(),
      navigateToDesign,
    });

    await expect(attempt.run()).rejects.toThrow("HTTP status 503");
    await expect(attempt.run()).resolves.toEqual({
      id: "stable-row",
      revision: "2",
    });

    expect(requests.map(requestLine)).toEqual([
      "POST /api/designs",
      "PUT /api/designs/stable-row",
      "PUT /api/designs/stable-row",
    ]);
    expect(navigateToDesign).toHaveBeenCalledOnce();
  });

  it("does not PUT or navigate after a failed mint, and retries the same chosen document", async () => {
    const requests: RecordedRequest[] = [];
    const responses = [
      jsonResponse({ error: "mint unavailable" }, 503),
      jsonResponse({ id: "minted-on-retry", revision: "1" }, 201),
      jsonResponse({ id: "minted-on-retry", revision: "2" }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        requests.push(recordRequest(url, init));
        const response = responses.shift();
        return response === undefined
          ? Promise.reject(new Error("Unscripted request"))
          : Promise.resolve(response);
      }),
    );
    const navigateToDesign = vi.fn();
    const attempt = createDesignCreationAttempt({
      design: CUSTOMER_DESIGN,
      repository: new FetchConfigurationRepository(),
      navigateToDesign,
    });

    await expect(attempt.run()).rejects.toThrow("HTTP status 503");
    expect(requests.map(requestLine)).toEqual(["POST /api/designs"]);
    expect(navigateToDesign).not.toHaveBeenCalled();

    await expect(attempt.run()).resolves.toEqual({
      id: "minted-on-retry",
      revision: "2",
    });
    expect(requests.map(requestLine)).toEqual([
      "POST /api/designs",
      "POST /api/designs",
      "PUT /api/designs/minted-on-retry",
    ]);
    expect(parseJsonBody(requests[2])).toEqual(CUSTOMER_DESIGN);
    expect(navigateToDesign).toHaveBeenCalledOnce();
  });

  it("mints a new row for a later deliberate attempt even when the document is equal", async () => {
    const requests: RecordedRequest[] = [];
    let minted = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        requests.push(recordRequest(url, init));
        if (init.method === "POST") {
          minted += 1;
          return Promise.resolve(
            jsonResponse({ id: `row-${String(minted)}`, revision: "1" }, 201),
          );
        }
        const id = url.split("/").at(-1);
        return Promise.resolve(jsonResponse({ id, revision: "2" }));
      }),
    );
    const repository = new FetchConfigurationRepository();
    const first = createDesignCreationAttempt({
      design: CUSTOMER_DESIGN,
      repository,
      navigateToDesign: vi.fn(),
    });
    const second = createDesignCreationAttempt({
      design: structuredClone(CUSTOMER_DESIGN),
      repository,
      navigateToDesign: vi.fn(),
    });

    await first.run();
    await second.run();

    expect(requests.map(requestLine)).toEqual([
      "POST /api/designs",
      "PUT /api/designs/row-1",
      "POST /api/designs",
      "PUT /api/designs/row-2",
    ]);
  });

  it("keeps a completed write when navigation throws, so retry only retries navigation", async () => {
    const saved = { id: "written-row" as DesignId, revision: "2" };
    const repository = recordingRepository(() => Promise.resolve(saved));
    let firstNavigation = true;
    const navigateToDesign = vi.fn(() => {
      if (firstNavigation) {
        firstNavigation = false;
        throw new Error("router refused navigation");
      }
    });
    const attempt = createDesignCreationAttempt({
      design: CUSTOMER_DESIGN,
      repository,
      navigateToDesign,
    });

    await expect(attempt.run()).rejects.toThrow("router refused navigation");
    await expect(attempt.run()).resolves.toEqual(saved);

    expect(repository.requests).toHaveLength(1);
    expect(navigateToDesign).toHaveBeenCalledTimes(2);
    expect(navigateToDesign).toHaveBeenNthCalledWith(1, saved.id);
    expect(navigateToDesign).toHaveBeenNthCalledWith(2, saved.id);
  });

  it("turns a synchronous repository throw into the rejected Promise its run contract declares", async () => {
    const failure = new Error("repository threw before returning");
    const attempt = createDesignCreationAttempt({
      design: CUSTOMER_DESIGN,
      repository: {
        save() {
          throw failure;
        },
      },
      navigateToDesign: vi.fn(),
    });

    const run = attempt.run();

    expect(run).toBeInstanceOf(Promise);
    await expect(run).rejects.toBe(failure);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestLine(request: RecordedRequest): string {
  return `${request.method} ${request.url}`;
}

function recordRequest(url: string, init: RequestInit): RecordedRequest {
  return {
    url,
    method: init.method ?? "GET",
    body: textBodyOf(init.body),
  };
}

/**
 * Keeps a recorded body comparable as text without ever letting a non-string body read as an
 * absent one — a payload the repository sent as an object would otherwise silently satisfy the
 * "the mint POST carries no body" assertion.
 */
function textBodyOf(
  body: BodyInit | null | undefined,
): string | null | undefined {
  if (body === undefined || body === null || typeof body === "string") {
    return body;
  }
  throw new TypeError(
    `Expected a string request body, received ${typeof body}`,
  );
}

function parseJsonBody(request: RecordedRequest | undefined): unknown {
  const body = request?.body;
  if (typeof body !== "string") {
    throw new TypeError(`Expected a JSON body, received ${typeof body}`);
  }
  return JSON.parse(body);
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function oneShotSignal(): {
  readonly promise: Promise<unknown>;
  readonly raise: () => void;
} {
  const { promise, resolve } = deferred<unknown>();
  return {
    promise,
    raise: () => {
      resolve(undefined);
    },
  };
}

interface RecordingRepository extends DesignCreationRepository {
  readonly requests: unknown[];
}

function recordingRepository(
  save: () => Promise<{ id: DesignId; revision: string }>,
): RecordingRepository {
  const requests: unknown[] = [];
  return {
    requests,
    save(request) {
      requests.push(request);
      return save();
    },
  };
}
