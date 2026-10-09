import {
  FakeRateLimitStore,
  RateLimitStoreError,
  RateLimitWindowConflictError,
  type RateLimitBucket,
  type RateLimitStore,
} from "@lemnaria/persistence";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readDigester,
  type DigesterOutcome,
} from "@/lib/server/digest/digest-secret";
import { keyedDigest } from "@/lib/server/digest/keyed-digest";
import { chisinauDayOf } from "@/lib/server/rate-limit/chisinau-day";
import type { NetworkBlock } from "@/lib/server/rate-limit/client-network";
import {
  enforceRateLimit,
  RATE_LIMIT_DEADLINE_MS,
  UNAVAILABLE_CAUSES,
  type RateLimitDecision,
  type RateLimitRequest,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  E2E_MINT_POLICY,
  MINT_POLICY,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import type { ClientNetwork } from "@/lib/server/rate-limit/network-source";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const FAKE_KEY = Uint8Array.from({ length: 32 }, (_, i) => i);

const BLOCK: NetworkBlock = { kind: "ipv4-block", subject: "192.0.2" };
const OTHER_BLOCK: NetworkBlock = { kind: "ipv4-block", subject: "198.51.100" };
const SHARED: NetworkBlock = { kind: "shared", subject: "" };

const USABLE: DigesterOutcome = readDigester({ DIGEST_SECRET: FAKE_SECRET });
const KNOWN = (block: NetworkBlock): ClientNetwork => ({
  status: "known",
  block,
});
const CHOSEN: PolicyChoice = { status: "chosen", policy: MINT_POLICY };

const NOON_ORDINARY = new Date("2026-07-15T12:00:00Z");

function requestOf(
  overrides: Partial<RateLimitRequest> & { store: RateLimitStore },
): RateLimitRequest {
  return {
    network: KNOWN(BLOCK),
    digester: USABLE,
    policy: CHOSEN,
    instant: NOON_ORDINARY,
    ...overrides,
  };
}

/** A store that answers `count` for every hit, and remembers what it was asked. */
function storeAnswering(
  count: number,
): RateLimitStore & { calls: (readonly RateLimitBucket[])[] } {
  const calls: (readonly RateLimitBucket[])[] = [];
  return {
    calls,
    recordHits: (buckets) => {
      calls.push(buckets);
      return Promise.resolve([count]);
    },
    pruneExpired: () => Promise.resolve(0),
  };
}

function storeFailingWith(
  reason: () => unknown,
): RateLimitStore & { calls: number } {
  const store = {
    calls: 0,
    recordHits: (): Promise<readonly number[]> => {
      store.calls += 1;
      throw reason();
    },
    pruneExpired: () => Promise.resolve(0),
  };
  return store;
}

async function decide(
  instant: Date,
  store: RateLimitStore,
  block: NetworkBlock = BLOCK,
): Promise<RateLimitDecision> {
  return await enforceRateLimit(
    requestOf({ store, instant, network: KNOWN(block) }),
  );
}

const UNAVAILABLE = (cause: string) => ({ kind: "unavailable", cause });

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("enforceRateLimit: the twentieth hit in a day, and the twenty-first", () => {
  it("allows the first twenty hits of one block and refuses the twenty-first and the one after", async () => {
    const store = new FakeRateLimitStore();
    const answers: string[] = [];
    for (let hit = 1; hit <= 22; hit += 1) {
      answers.push((await decide(NOON_ORDINARY, store)).kind);
    }

    expect(answers.slice(0, 20)).toEqual(new Array<string>(20).fill("allow"));
    expect(answers.slice(20)).toEqual(["refuse", "refuse"]);
  });

  it("counts another block apart, and the shared bucket at the same twenty", async () => {
    const store = new FakeRateLimitStore();
    for (let hit = 0; hit < 21; hit += 1) await decide(NOON_ORDINARY, store);

    expect((await decide(NOON_ORDINARY, store, OTHER_BLOCK)).kind).toBe(
      "allow",
    );
    for (let hit = 0; hit < 20; hit += 1)
      await decide(NOON_ORDINARY, store, SHARED);
    expect((await decide(NOON_ORDINARY, store, SHARED)).kind).toBe("refuse");
  });

  it.each([
    ["the mint's row at 20", MINT_POLICY],
    ["the e2e policy at its figure", E2E_MINT_POLICY],
  ])(
    "allows a count at the figure and refuses one above it, for %s",
    async (_label, policy) => {
      const at = storeAnswering(policy.figure);
      const above = storeAnswering(policy.figure + 1);
      const choice: PolicyChoice = { status: "chosen", policy };

      const allowed = await enforceRateLimit(
        requestOf({ store: at, policy: choice }),
      );
      const refused = await enforceRateLimit(
        requestOf({ store: above, policy: choice }),
      );

      expect(allowed).toEqual({ kind: "allow" });
      expect(refused.kind).toBe("refuse");
    },
  );

  it("counts a hit under the e2e policy's own name, apart from the mint's", async () => {
    const mint = storeAnswering(1);
    const e2e = storeAnswering(1);

    await enforceRateLimit(requestOf({ store: mint }));
    await enforceRateLimit(
      requestOf({
        store: e2e,
        policy: { status: "chosen", policy: E2E_MINT_POLICY },
      }),
    );

    expect(mint.calls[0]?.[0]?.key).not.toBe(e2e.calls[0]?.[0]?.key);
  });
});

describe("enforceRateLimit: the day's edges on a fake clock", () => {
  const DAYS: readonly [string, string, string, number][] = [
    [
      "an ordinary day",
      "2026-07-14T21:00:00.000Z",
      "2026-07-15T21:00:00.000Z",
      86_400,
    ],
    [
      "the 23-hour day",
      "2026-03-28T22:00:00.000Z",
      "2026-03-29T21:00:00.000Z",
      82_800,
    ],
    [
      "the 25-hour day",
      "2026-10-24T21:00:00.000Z",
      "2026-10-25T22:00:00.000Z",
      90_000,
    ],
  ];

  async function twentyHitsAt(
    store: FakeRateLimitStore,
    instant: Date,
  ): Promise<void> {
    for (let hit = 0; hit < 20; hit += 1) {
      expect((await decide(instant, store)).kind).toBe("allow");
    }
  }

  describe.each(DAYS)("%s", (_label, startsAt, endsAt, wholeDaySeconds) => {
    const lastMillisecond = new Date(new Date(endsAt).getTime() - 1);

    it("refuses the twenty-first hit at the last millisecond of the day, telling one second", async () => {
      const store = new FakeRateLimitStore();
      await twentyHitsAt(store, lastMillisecond);

      expect(await decide(lastMillisecond, store)).toEqual({
        kind: "refuse",
        retryAfterSeconds: 1,
      });
    });

    it("allows the first hit of the next day, which starts at the day's end", async () => {
      const store = new FakeRateLimitStore();
      await twentyHitsAt(store, lastMillisecond);
      await decide(lastMillisecond, store);

      expect(await decide(new Date(endsAt), store)).toEqual({ kind: "allow" });
    });

    it("tells the whole day's seconds to a refusal at the first millisecond of the day", async () => {
      const store = new FakeRateLimitStore();
      const first = new Date(startsAt);
      await twentyHitsAt(store, first);

      expect(await decide(first, store)).toEqual({
        kind: "refuse",
        retryAfterSeconds: wholeDaySeconds,
      });
    });

    it("counts the first millisecond of the day apart from the last millisecond of the day before", async () => {
      const store = new FakeRateLimitStore();
      const before = new Date(new Date(startsAt).getTime() - 1);
      await twentyHitsAt(store, before);
      await decide(before, store);

      expect(await decide(new Date(startsAt), store)).toEqual({
        kind: "allow",
      });
    });
  });
});

describe("enforceRateLimit: the bucket it asks the store to count", () => {
  it("makes one call with one bucket: the digest of policy, kind and subject, in the day's window", async () => {
    const store = storeAnswering(1);

    await enforceRateLimit(requestOf({ store }));

    const expectedKey = keyedDigest(FAKE_KEY, {
      purpose: "rate-limit-bucket",
      fields: {
        policyName: "design-mint-per-chisinau-day",
        subjectKind: "ipv4-block",
        subject: "192.0.2",
      },
    });
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]).toEqual([
      { key: expectedKey, window: chisinauDayOf(NOON_ORDINARY) },
    ]);
  });

  it("holds nothing of the block in a key that is only sixty-four hexadecimal characters", async () => {
    const store = storeAnswering(1);

    await enforceRateLimit(requestOf({ store }));

    expect(store.calls[0]?.[0]?.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives one key to one block and policy on every call, and another to another", async () => {
    const one = storeAnswering(1);
    const again = storeAnswering(1);
    const other = storeAnswering(1);

    await decide(NOON_ORDINARY, one);
    await decide(NOON_ORDINARY, again);
    await decide(NOON_ORDINARY, other, OTHER_BLOCK);

    expect(again.calls[0]?.[0]?.key).toBe(one.calls[0]?.[0]?.key);
    expect(other.calls[0]?.[0]?.key).not.toBe(one.calls[0]?.[0]?.key);
  });
});

describe("enforceRateLimit: what is unavailable before the store is asked", () => {
  const MISCONFIGURED: ClientNetwork = {
    status: "misconfigured",
    variable: "CLIENT_NETWORK_SOURCE",
  };
  const POLICY_UNAVAILABLE: PolicyChoice = {
    status: "unavailable",
    variable: "LEMNARIA_E2E_RATE_LIMIT_POLICY",
  };
  const DIGESTER_UNAVAILABLE: DigesterOutcome = {
    status: "unavailable",
    variable: "DIGEST_SECRET",
  };

  it.each([
    [
      "a misconfigured source",
      { network: MISCONFIGURED },
      "source-misconfigured",
    ],
    [
      "a flag beside the source",
      { policy: POLICY_UNAVAILABLE },
      "policy-misconfigured",
    ],
    [
      "an unusable secret",
      { digester: DIGESTER_UNAVAILABLE },
      "digester-unusable",
    ],
    [
      "a source and a secret both unusable: the source first",
      { network: MISCONFIGURED, digester: DIGESTER_UNAVAILABLE },
      "source-misconfigured",
    ],
    [
      "a flag and a secret both unusable: the flag first",
      { policy: POLICY_UNAVAILABLE, digester: DIGESTER_UNAVAILABLE },
      "policy-misconfigured",
    ],
    [
      "all three unusable",
      {
        network: MISCONFIGURED,
        policy: POLICY_UNAVAILABLE,
        digester: DIGESTER_UNAVAILABLE,
      },
      "source-misconfigured",
    ],
  ])(
    "answers %s as unavailable without a call to the store",
    async (_label, overrides, cause) => {
      const store = storeAnswering(1);

      const decision = await enforceRateLimit(
        requestOf({ store, ...overrides }),
      );

      expect(decision).toEqual(UNAVAILABLE(cause));
      expect(store.calls).toHaveLength(0);
    },
  );

  it("answers a digester that throws as unavailable, without a call to the store and keeping nothing", async () => {
    const store = storeAnswering(1);
    const throwing: DigesterOutcome = {
      status: "usable",
      digest: () => {
        throw new Error("DIGESTER-MARKER-5503");
      },
    };

    const decision = await enforceRateLimit(
      requestOf({ store, digester: throwing }),
    );

    expect(decision).toEqual(UNAVAILABLE("digester-unusable"));
    expect(store.calls).toHaveLength(0);
    expect(inspect(decision, { depth: null, showHidden: true })).not.toContain(
      "MARKER",
    );
  });

  it("answers an instant that is not a date as unavailable, without a call to the store", async () => {
    const store = storeAnswering(1);

    expect(await decide(new Date(Number.NaN), store)).toEqual(
      UNAVAILABLE("window-unavailable"),
    );
    expect(store.calls).toHaveLength(0);
  });
});

describe("enforceRateLimit: every way the store can fail is unavailable, keeping nothing", () => {
  const HOSTILE = new Proxy(
    {},
    new Proxy(
      {},
      {
        get: () => () => {
          throw new Error("a trap ran");
        },
      },
    ),
  );
  const FAILURES: readonly [string, () => unknown][] = [
    ["the store's own error", () => new RateLimitStoreError("record hits")],
    ["a window conflict", () => new RateLimitWindowConflictError()],
    [
      "a refusal of the request, a plain Error",
      () => new Error("Refusing to count a hit: MARKER"),
    ],
    ["a TypeError", () => new TypeError("MARKER")],
    ["text", () => "MARKER"],
    ["a number", () => 42],
    ["undefined", () => undefined],
    ["a value whose every trap throws", () => HOSTILE],
  ];

  it.each(FAILURES)(
    "answers %s thrown at once as store-failed",
    async (_label, reason) => {
      const store = storeFailingWith(reason);

      const decision = await enforceRateLimit(requestOf({ store }));

      expect(decision).toEqual(UNAVAILABLE("store-failed"));
      expect(store.calls).toBe(1);
      expect(Reflect.ownKeys(decision)).toEqual(["kind", "cause"]);
      expect(
        inspect(decision, { depth: null, showHidden: true }),
      ).not.toContain("MARKER");
    },
  );

  it.each(FAILURES)(
    "answers %s rejected later as store-failed",
    async (_label, reason) => {
      const store: RateLimitStore = {
        recordHits: () => Promise.reject(reason() as Error),
        pruneExpired: () => Promise.resolve(0),
      };

      expect(await enforceRateLimit(requestOf({ store }))).toEqual(
        UNAVAILABLE("store-failed"),
      );
    },
  );

  it.each([
    ["an empty list", []],
    ["no list", undefined],
    ["text", "20"],
    ["a count that is not a number", ["20"]],
    ["a count that is not finite", [Number.NaN]],
    ["an infinite count", [Number.POSITIVE_INFINITY]],
  ])("answers %s from the store as store-failed", async (_label, counts) => {
    const store: RateLimitStore = {
      recordHits: () => Promise.resolve(counts as readonly number[]),
      pruneExpired: () => Promise.resolve(0),
    };

    expect(await enforceRateLimit(requestOf({ store }))).toEqual(
      UNAVAILABLE("store-failed"),
    );
  });
});

describe("enforceRateLimit: the deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function neverAnswering(): RateLimitStore {
    return {
      recordHits: () => new Promise<readonly number[]>(() => undefined),
      pruneExpired: () => Promise.resolve(0),
    };
  }

  it("is three seconds", () => {
    expect(RATE_LIMIT_DEADLINE_MS).toBe(3000);
  });

  it("answers unavailable at three seconds and not a millisecond before", async () => {
    let decision: RateLimitDecision | undefined;
    const pending = enforceRateLimit(
      requestOf({ store: neverAnswering() }),
    ).then((value) => {
      decision = value;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS - 1);
    expect(decision).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(decision).toEqual(UNAVAILABLE("deadline-passed"));
  });

  it("handles and drops a rejection that arrives after the deadline", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const late: RateLimitStore = {
      recordHits: () =>
        new Promise<readonly number[]>((_resolve, reject) => {
          setTimeout(() => {
            reject(new RateLimitStoreError("record hits"));
          }, RATE_LIMIT_DEADLINE_MS + 2000);
        }),
      pruneExpired: () => Promise.resolve(0),
    };

    const pending = enforceRateLimit(requestOf({ store: late }));
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS);
    const decision = await pending;
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();
    process.off("unhandledRejection", unhandled);

    expect(decision).toEqual(UNAVAILABLE("deadline-passed"));
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("drops an answer that arrives after the deadline, and a later count changes nothing", async () => {
    const late: RateLimitStore = {
      recordHits: () =>
        new Promise<readonly number[]>((resolve) => {
          setTimeout(() => {
            resolve([1]);
          }, RATE_LIMIT_DEADLINE_MS + 1);
        }),
      pruneExpired: () => Promise.resolve(0),
    };

    const pending = enforceRateLimit(requestOf({ store: late }));
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS + 10);

    expect(await pending).toEqual(UNAVAILABLE("deadline-passed"));
  });

  it("answers a store that answers in time, and leaves no timer behind", async () => {
    const decision = await enforceRateLimit(
      requestOf({ store: storeAnswering(1) }),
    );

    expect(decision).toEqual({ kind: "allow" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the deadline, the store's longest repeat and the mint's longest time under the lock's ten seconds", () => {
    const STORES_LONGEST_REPEAT_MS = 2000;
    const MINTS_LONGEST_TIME_MS = 2000;
    const LOCKS_WAIT_MS = 10_000;

    expect(
      RATE_LIMIT_DEADLINE_MS + STORES_LONGEST_REPEAT_MS + MINTS_LONGEST_TIME_MS,
    ).toBeLessThan(LOCKS_WAIT_MS);
  });
});

describe("what a decision carries", () => {
  it("is one of three shapes, and a refusal carries its wait alone, a whole number from 1 to 90,000", async () => {
    const allowed = await enforceRateLimit(
      requestOf({ store: storeAnswering(1) }),
    );
    const refused = await enforceRateLimit(
      requestOf({ store: storeAnswering(21) }),
    );
    const unavailable = await enforceRateLimit(
      requestOf({ store: storeFailingWith(() => new Error("x")) }),
    );

    expect(Reflect.ownKeys(allowed)).toEqual(["kind"]);
    expect(Reflect.ownKeys(refused)).toEqual(["kind", "retryAfterSeconds"]);
    expect(Reflect.ownKeys(unavailable)).toEqual(["kind", "cause"]);
    expect([...UNAVAILABLE_CAUSES]).toEqual([
      "source-misconfigured",
      "policy-misconfigured",
      "digester-unusable",
      "window-unavailable",
      "store-failed",
      "deadline-passed",
      "judgement-failed",
    ]);
  });

  it("holds no count, block, key or remainder anywhere a caller could print it", async () => {
    const store = storeAnswering(37);

    const refused = await enforceRateLimit(requestOf({ store }));
    const reading =
      JSON.stringify(refused) +
      inspect(refused, { depth: null, showHidden: true });

    expect(reading).not.toContain("37");
    expect(reading).not.toContain("192.0.2");
    expect(reading).not.toContain(store.calls[0]?.[0]?.key ?? "");
  });

  it("tells a wait from 1 to 90,000 seconds for refusals across a year of instants, with a floor", async () => {
    const waits: number[] = [];
    for (
      let ms = Date.parse("2026-01-01T00:00:00Z");
      ms < Date.parse("2027-01-01T00:00:00Z");
      ms += 5 * 3_600_000 + 17 * 60_000
    ) {
      const decision = await enforceRateLimit(
        requestOf({ store: storeAnswering(21), instant: new Date(ms) }),
      );
      if (decision.kind === "refuse") waits.push(decision.retryAfterSeconds);
    }

    expect(waits.length).toBeGreaterThanOrEqual(1500);
    expect(
      waits.every(
        (wait) => Number.isInteger(wait) && wait >= 1 && wait <= 90_000,
      ),
    ).toBe(true);
  });
});

describe("enforce-rate-limit.ts", () => {
  const source = readSource("lib/server/rate-limit/enforce-rate-limit.ts");

  it("logs nothing, even where every kind of failure is met", async () => {
    const spies = (
      ["debug", "error", "info", "log", "trace", "warn"] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    await enforceRateLimit(
      requestOf({ store: storeFailingWith(() => new Error("x")) }),
    );
    await enforceRateLimit(requestOf({ store: storeAnswering(21) }));

    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it("reads source: names no log, clock, environment or build mode, and no store but the port's type", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(
      /console\.|Date\.now|new Date\(\)|performance\./,
    );
    expect(source).not.toMatch(/Neon|Fake|new RateLimitStore|catch\s*\(/);
  });
});
