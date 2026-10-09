import type { RateLimitBucket } from "@lemnaria/persistence";
import { FakeRateLimitStore, NeonRateLimitStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { E2E_MINT_POLICY_NOTICE } from "@/lib/server/design-failure-log";

import { UNUSED_STORE_READS } from "../../../support/unused-store-reads";

/**
 * `POST /api/designs` asks the limiter after the cross-site guard and before the visitor is read or anything is
 * minted. The judgement is the real one, as in every route test; this file chooses the store it counts in.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** What the route did, in order, so a test can say what happened before what. */
const order = vi.hoisted(() => ({ calls: [] as string[] }));
const rateLimitStore = vi.hoisted(() => ({
  current: undefined as unknown,
  /** What the instance throws when no store can be made, as the real constructor does with no database. */
  failure: undefined as unknown,
}));
const repository = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({
  getRateLimitStore: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- it is whatever the real constructor threw.
    if (rateLimitStore.failure !== undefined) throw rateLimitStore.failure;
    return rateLimitStore.current;
  },
}));

vi.mock("@/lib/server/visitor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/visitor")>();
  return {
    ...actual,
    resolveVisitorForMint: (
      ...args: Parameters<typeof actual.resolveVisitorForMint>
    ) => {
      order.calls.push("resolve-visitor");
      return actual.resolveVisitorForMint(...args);
    },
  };
});

vi.mock("@/lib/server/write-token", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/server/write-token")>();
  return {
    ...actual,
    mintWriteToken: (...args: Parameters<typeof actual.mintWriteToken>) => {
      order.calls.push("mint-write-token");
      return actual.mintWriteToken(...args);
    },
  };
});

const { POST } = await import("../../../../src/app/api/designs/route");

const ALL_LOG_METHODS = [
  "debug",
  "error",
  "info",
  "log",
  "trace",
  "warn",
] as const;

function mintRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

/** A store that records the order of its own call, and answers `count` for every hit. */
function storeAnswering(count: number) {
  const buckets: (readonly RateLimitBucket[])[] = [];
  return {
    buckets,
    recordHits: (given: readonly RateLimitBucket[]) => {
      order.calls.push("record-hits");
      buckets.push(given);
      return Promise.resolve([count]);
    },
    ...UNUSED_STORE_READS,
  };
}

function silenceLogs() {
  return Object.fromEntries(
    ALL_LOG_METHODS.map((method) => [
      method,
      vi.spyOn(console, method).mockImplementation(() => undefined),
    ]),
  ) as Record<(typeof ALL_LOG_METHODS)[number], ReturnType<typeof vi.spyOn>>;
}

function everythingLogged(logs: ReturnType<typeof silenceLogs>): string {
  return ALL_LOG_METHODS.flatMap((method) => logs[method].mock.calls)
    .map((call) => JSON.stringify(call))
    .join("\n");
}

const minted = vi.fn(() => Promise.resolve({ id: "design-0", revision: "1" }));

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

beforeEach(() => {
  rateLimitStore.failure = undefined;
  order.calls.length = 0;
  minted.mockClear();
  repository.current = {
    mint: (...args: unknown[]) => {
      order.calls.push("mint");
      return (minted as (...rest: unknown[]) => unknown)(...args);
    },
  };
  rateLimitStore.current = storeAnswering(1);
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("POST /api/designs: the order of its checks", () => {
  it("runs the cross-site guard, then the limiter, then the visitor and the token, then the mint", async () => {
    const response = await POST(mintRequest());

    expect(response.status).toBe(201);
    expect(order.calls).toEqual([
      "record-hits",
      "mint-write-token",
      "resolve-visitor",
      "mint",
    ]);
  });

  it("counts nothing for a request the cross-site guard refuses", async () => {
    const response = await POST(
      mintRequest({ "sec-fetch-site": "cross-site" }),
    );

    expect(response.status).toBe(403);
    expect(order.calls).toEqual([]);
  });
});

describe("POST /api/designs: a mint the limiter refuses", () => {
  beforeEach(() => {
    rateLimitStore.current = storeAnswering(21);
  });

  it("answers 429 with Retry-After in whole seconds and the fixed body, and nothing else of the limit", async () => {
    const response = await POST(mintRequest());
    const retryAfter = Number(response.headers.get("Retry-After"));

    expect(response.status).toBe(429);
    expect(
      Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 90_000,
    ).toBe(true);
    expect(await response.json()).toEqual({
      error: "The limit on new designs is reached for today.",
      code: "MINT_LIMIT_REACHED",
    });
    expect([...response.headers.keys()].sort()).toEqual([
      "cache-control",
      "content-type",
      "retry-after",
    ]);
  });

  it("resolves no visitor, mints no token, writes no row, and sets no cookie", async () => {
    const response = await POST(
      mintRequest({
        cookie: "lemnaria_visitor=abc; lemnaria_write_token=def",
      }),
    );

    expect(order.calls).toEqual(["record-hits"]);
    expect(minted).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("writes one line naming the policy, with nothing of the request in it", async () => {
    const logs = silenceLogs();

    await POST(
      mintRequest({
        "x-forwarded-for": "192.0.2.77",
        cookie: "lemnaria_visitor=VISITOR-COOKIE-MARKER",
      }),
    );

    expect(logs.warn).toHaveBeenCalledTimes(1);
    expect(logs.warn).toHaveBeenCalledWith("[designs]", {
      event: "design-operation-refused",
      operation: "mint",
      refusalCode: "MINT_LIMIT_REACHED",
      status: 429,
      policy: "design-mint-per-chisinau-day",
    });
    const everything = everythingLogged(logs);
    expect(everything).not.toContain("192.0.2");
    expect(everything).not.toContain("MARKER");
    expect(everything).not.toContain(FAKE_SECRET);
  });
});

describe("POST /api/designs: a mint the limiter cannot judge", () => {
  const MISCONFIGURED_SOURCE = { CLIENT_NETWORK_SOURCE: "not-a-host" };

  async function expectUnavailable(
    response: Response,
    calls: readonly string[],
  ): Promise<void> {
    expect(response.status).toBe(503);
    expect(response.headers.has("Retry-After")).toBe(false);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.json()).toEqual({
      error: "A new design cannot be made right now.",
      code: "MINT_UNAVAILABLE",
    });
    expect(order.calls).toEqual(calls);
    expect(minted).not.toHaveBeenCalled();
  }

  it.each([
    ["a source that is misconfigured", MISCONFIGURED_SOURCE, FAKE_SECRET],
    [
      "the e2e flag beside the source",
      { LEMNARIA_E2E_RATE_LIMIT_POLICY: "1", CLIENT_NETWORK_SOURCE: "vercel" },
      FAKE_SECRET,
    ],
    ["a secret that is unset", {}, undefined],
    ["a secret that is not sixty-four hexadecimal characters", {}, "not-hex"],
  ])(
    "answers 503 before any store call for %s",
    async (_label, variables, secret) => {
      for (const [name, value] of Object.entries(variables))
        vi.stubEnv(name, value);
      if (secret === undefined)
        vi.stubEnv("DIGEST_SECRET", undefined as unknown as string);
      else vi.stubEnv("DIGEST_SECRET", secret);

      await expectUnavailable(await POST(mintRequest()), []);
    },
  );

  it("answers 503, mints nothing and sets no cookie when the store fails", async () => {
    rateLimitStore.current = {
      recordHits: () => {
        order.calls.push("record-hits");
        return Promise.reject(new Error("STORE-MARKER"));
      },
      ...UNUSED_STORE_READS,
    };
    const logs = silenceLogs();

    await expectUnavailable(await POST(mintRequest()), ["record-hits"]);

    expect(logs.error).toHaveBeenCalledWith("[designs]", {
      event: "design-operation-unavailable",
      operation: "mint",
      refusalCode: "MINT_UNAVAILABLE",
      status: 503,
      cause: "store-failed",
    });
    expect(everythingLogged(logs)).not.toContain("MARKER");
  });

  it("answers 503 after three seconds when the store never answers, with nothing minted", async () => {
    vi.useFakeTimers();
    rateLimitStore.current = {
      recordHits: () => {
        order.calls.push("record-hits");
        return new Promise<readonly number[]>(() => undefined);
      },
      ...UNUSED_STORE_READS,
    };

    const pending = POST(mintRequest());
    await vi.advanceTimersByTimeAsync(3000);

    await expectUnavailable(await pending, ["record-hits"]);
  });

  it("answers 503 as judgement-failed when the judgement itself throws, keeping nothing of what it threw", async () => {
    const hostileEnvironment = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("ENVIRONMENT-MARKER");
        },
      },
    );
    const environmentSpy = vi
      .spyOn(process, "env", "get")
      .mockReturnValue(hostileEnvironment as NodeJS.ProcessEnv);
    const logs = silenceLogs();

    try {
      await expectUnavailable(await POST(mintRequest()), []);
    } finally {
      environmentSpy.mockRestore();
    }

    expect(logs.error).toHaveBeenCalledWith("[designs]", {
      event: "design-operation-unavailable",
      operation: "mint",
      refusalCode: "MINT_UNAVAILABLE",
      status: 503,
      cause: "judgement-failed",
    });
    expect(everythingLogged(logs)).not.toContain("MARKER");
  });

  it("answers 503 when no store can be made, as the real constructor fails without a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    rateLimitStore.failure = thrownBy(() => new NeonRateLimitStore());

    await expectUnavailable(await POST(mintRequest()), []);
  });
});

describe("POST /api/designs: what the limiter asks, and when", () => {
  it("reads the environment inside the request, so a variable set after import is the one used", async () => {
    vi.stubEnv("DIGEST_SECRET", undefined as unknown as string);
    expect((await POST(mintRequest())).status).toBe(503);

    vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
    expect((await POST(mintRequest())).status).toBe(201);
  });

  it("counts every request in one shared bucket under no network source, whatever headers it carries", async () => {
    const store = storeAnswering(1);
    rateLimitStore.current = store;

    await POST(mintRequest());
    await POST(mintRequest({ "x-forwarded-for": "198.51.100.9" }));
    await POST(
      mintRequest({
        "x-real-ip": "203.0.113.5",
        "x-vercel-forwarded-for": "203.0.113.6",
        forwarded: "for=192.0.2.9",
        "cf-connecting-ip": "192.0.2.10",
      }),
    );

    const keys = store.buckets.map((given) => given[0]?.key);
    expect(new Set(keys).size).toBe(1);
  });

  it("takes the block from x-forwarded-for when the owner names the source, and counts blocks apart", async () => {
    vi.stubEnv("CLIENT_NETWORK_SOURCE", "vercel");
    const store = storeAnswering(1);
    rateLimitStore.current = store;

    await POST(mintRequest({ "x-forwarded-for": "192.0.2.1" }));
    await POST(mintRequest({ "x-forwarded-for": "192.0.2.200" }));
    await POST(mintRequest({ "x-forwarded-for": "198.51.100.1" }));
    await POST(mintRequest({ "x-forwarded-for": "192.0.2.1, 198.51.100.1" }));
    await POST(mintRequest());

    const keys = store.buckets.map((given) => given[0]?.key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).toBe(keys[4]);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it("puts a real store's count through the route: mint 20 is made and mint 21 is refused", async () => {
    rateLimitStore.current = new FakeRateLimitStore();
    const statuses: number[] = [];
    for (let mint = 0; mint < 21; mint += 1) {
      statuses.push((await POST(mintRequest())).status);
    }

    expect(statuses.slice(0, 20)).toEqual(new Array<number>(20).fill(201));
    expect(statuses[20]).toBe(429);
    expect(minted).toHaveBeenCalledTimes(20);
  });
});

describe("POST /api/designs: the e2e policy", () => {
  it("allows a count the production policy refuses, and says so at most once in a process", async () => {
    vi.stubEnv("LEMNARIA_E2E_RATE_LIMIT_POLICY", "1");
    rateLimitStore.current = storeAnswering(21);
    const logs = silenceLogs();

    const first = await POST(mintRequest());
    const second = await POST(mintRequest());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const notices = logs.warn.mock.calls.filter(
      ([, line]) =>
        (line as { message?: string }).message === E2E_MINT_POLICY_NOTICE,
    );
    expect(notices.length).toBeLessThanOrEqual(1);
    expect(E2E_MINT_POLICY_NOTICE).toBe(
      "rate limit: an e2e policy is in use (LEMNARIA_E2E_RATE_LIMIT_POLICY); " +
        "its figure is not the production one",
    );
  });

  it("is chosen only by the flag exactly 1: any other value counts under the mint's row", async () => {
    vi.stubEnv("LEMNARIA_E2E_RATE_LIMIT_POLICY", "true");
    rateLimitStore.current = storeAnswering(21);

    expect((await POST(mintRequest())).status).toBe(429);
  });
});
