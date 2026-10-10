import {
  FakeRateLimitStore,
  RateLimitStoreError,
  RateLimitWindowConflictError,
  type RateLimitBucket,
  type RateLimitStore,
} from "@lemnaria/persistence";
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readDigester,
  type DigesterOutcome,
} from "@/lib/server/digest/digest-secret";
import { keyedDigest } from "@/lib/server/digest/keyed-digest";
import {
  subjectOfNetworkBlock,
  subjectOfWriteCredentialHash,
  type BucketSubject,
} from "@/lib/server/rate-limit/bucket-subject";
import {
  chisinauDayOf,
  LONGEST_DAY_SECONDS,
} from "@/lib/server/rate-limit/chisinau-day";
import {
  enforceRateLimit,
  judgeInSequence,
  judgeStepsInSequence,
  RATE_LIMIT_DEADLINE_MS,
  RATE_LIMIT_READ_DEADLINE_MS,
  UNAVAILABLE_CAUSES,
  type JudgementStep,
  type PolicyStep,
  type RateLimitDecision,
  type RateLimitRequest,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  E2E_MINT_POLICY,
  MINT_POLICY,
  READ_POLICY,
  SAVE_BY_BLOCK_POLICY,
  SAVE_BY_CREDENTIAL_POLICY,
  type LimitPolicy,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";
import { LOCK_ACQUIRE_TIMEOUT_MS } from "@/persistence/create-design-lock";

import { UNUSED_STORE_READS } from "../../../support/unused-store-reads";
import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const FAKE_KEY = Uint8Array.from({ length: 32 }, (_, i) => i);

const BLOCK = subjectOfNetworkBlock({ kind: "ipv4-block", subject: "192.0.2" });
const OTHER_BLOCK = subjectOfNetworkBlock({
  kind: "ipv4-block",
  subject: "198.51.100",
});
const SHARED = subjectOfNetworkBlock({ kind: "shared", subject: "" });
const A_CREDENTIAL = subjectOfWriteCredentialHash(
  createHash("sha256").update("abc").digest("hex"),
);

const USABLE: DigesterOutcome = readDigester({ DIGEST_SECRET: FAKE_SECRET });

const NOON_ORDINARY = new Date("2026-07-15T12:00:00Z");

function requestOf(
  overrides: Partial<RateLimitRequest> & { store: RateLimitStore },
): RateLimitRequest {
  return {
    subject: BLOCK,
    digester: USABLE,
    policy: MINT_POLICY,
    instant: NOON_ORDINARY,
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
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
    ...UNUSED_STORE_READS,
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
    ...UNUSED_STORE_READS,
  };
  return store;
}

async function decide(
  instant: Date,
  store: RateLimitStore,
  subject: BucketSubject = BLOCK,
): Promise<RateLimitDecision> {
  return await enforceRateLimit(requestOf({ store, instant, subject }));
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

      const allowed = await enforceRateLimit(requestOf({ store: at, policy }));
      const refused = await enforceRateLimit(
        requestOf({ store: above, policy }),
      );

      expect(allowed).toEqual({ kind: "allow" });
      expect(refused.kind).toBe("refuse");
    },
  );

  it("counts a hit under the e2e policy's own name, apart from the mint's", async () => {
    const mint = storeAnswering(1);
    const e2e = storeAnswering(1);

    await enforceRateLimit(requestOf({ store: mint }));
    await enforceRateLimit(requestOf({ store: e2e, policy: E2E_MINT_POLICY }));

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

describe("enforceRateLimit: the key of each kind of bucket, held to answers an outside tool gave", () => {
  // Each digest below was made with `openssl dgst -sha256 -mac HMAC -macopt hexkey:<the fake secret>` over the
  // encoding written beside it, and the mint's first was also read from this module before it took a subject.
  const PINNED: readonly [string, LimitPolicy, BucketSubject, string][] = [
    [
      "the mint's IPv4 block: 17:rate-limit-bucket,28:design-mint-per-chisinau-day,10:ipv4-block,7:192.0.2,",
      MINT_POLICY,
      BLOCK,
      "a46dd85e1cf9159fef421d085e37caebb57532ef9559b120d504ab0c4d5a7342",
    ],
    [
      "the mint's bucket for the shared block: ...,6:shared,0:,",
      MINT_POLICY,
      SHARED,
      "159ec356b492ef38c5e04c7e22dffabdaa1663a51c4e038afda9224f0540a8c3",
    ],
    [
      "a save's bucket for an IPv6 block: ...,44:design-save-by-block-per-60-utc-minutes,10:ipv6-block,19:...,",
      SAVE_BY_BLOCK_POLICY,
      subjectOfNetworkBlock({
        kind: "ipv6-block",
        subject: "2001:0db8:0000:0042",
      }),
      "7d79ce766956a2cdd7309f4fc217f1205f2d5e3d656d91378f56da36fff80c41",
    ],
    [
      "a save's credential: ...,44:design-save-by-credential-per-60-utc-minutes,16:write-credential,64:<hash>,",
      SAVE_BY_CREDENTIAL_POLICY,
      A_CREDENTIAL,
      "a5a465ce3b74a625e8582e77be69f5a4c2007c7b554798510e944e9817ba7685",
    ],
  ];

  it.each(PINNED)(
    "counts under the pinned key for %s",
    async (_label, policy, subject, expected) => {
      const store = storeAnswering(1);

      await enforceRateLimit(requestOf({ store, policy, subject }));

      expect(store.calls[0]?.[0]?.key).toBe(expected);
    },
  );

  it("gives the credential's bucket a key unlike the key of any block's bucket under the same policy", async () => {
    const credential = storeAnswering(1);
    const blocks = [BLOCK, OTHER_BLOCK, SHARED].map(() => storeAnswering(1));

    await enforceRateLimit(
      requestOf({
        store: credential,
        policy: SAVE_BY_CREDENTIAL_POLICY,
        subject: A_CREDENTIAL,
      }),
    );
    for (const [index, subject] of [BLOCK, OTHER_BLOCK, SHARED].entries()) {
      await enforceRateLimit(
        requestOf({
          store: blocks[index] ?? credential,
          policy: SAVE_BY_CREDENTIAL_POLICY,
          subject,
        }),
      );
    }

    const keys = [credential, ...blocks].map(
      (store) => store.calls[0]?.[0]?.key,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("enforceRateLimit: what is unavailable before the store is asked", () => {
  const DIGESTER_UNAVAILABLE: DigesterOutcome = {
    status: "unavailable",
    variable: "DIGEST_SECRET",
  };

  it("answers an unusable secret as unavailable without a call to the store", async () => {
    const store = storeAnswering(1);

    const decision = await enforceRateLimit(
      requestOf({ store, digester: DIGESTER_UNAVAILABLE }),
    );

    expect(decision).toEqual(UNAVAILABLE("digester-unusable"));
    expect(store.calls).toHaveLength(0);
  });

  it.each([
    ["nought", 0],
    ["a negative", -1],
    ["a fraction", 2.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["longer than a timer can wait", 2_147_483_648],
  ])(
    "answers a deadline of %s as unavailable without a call to the store",
    async (_label, deadlineMs) => {
      const store = storeAnswering(1);

      const decision = await enforceRateLimit(requestOf({ store, deadlineMs }));

      expect(decision).toEqual(UNAVAILABLE("judgement-failed"));
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

describe("enforceRateLimit: a subject no constructor made and a policy outside the closed set are not judged", () => {
  const LOOK_ALIKES: readonly [string, unknown][] = [
    ["a literal cast to a subject", { kind: "ipv4-block", subject: "192.0.2" }],
    ["a spread copy of a made subject", { ...BLOCK }],
    ["a copy that went through JSON", JSON.parse(JSON.stringify(BLOCK))],
    [
      "a frozen credential look-alike holding a design's id",
      Object.freeze({ kind: "write-credential", subject: "design 1" }),
    ],
    [
      "an object that inherits from a made subject",
      Object.create(BLOCK) as object,
    ],
    ["nothing", undefined],
    ["null", null],
    ["text", "192.0.2"],
  ];

  it.each(LOOK_ALIKES)(
    "answers %s as judgement-failed without a call to the store",
    async (_label, subject) => {
      const store = storeAnswering(1);

      const decision = await enforceRateLimit(
        requestOf({ store, subject: subject as BucketSubject }),
      );

      expect(decision).toEqual(UNAVAILABLE("judgement-failed"));
      expect(store.calls).toHaveLength(0);
    },
  );

  const FOREIGN_POLICIES: readonly [string, unknown][] = [
    ["a copy of the mint's own policy", { ...MINT_POLICY }],
    [
      "a policy named from a caller's text",
      {
        name: "design-mint-per-chisinau-day-x",
        figure: 1_000_000,
        window: MINT_POLICY.window,
      },
    ],
    [
      "a policy with the mint's name and a higher figure",
      { ...MINT_POLICY, figure: 1_000_000 },
    ],
    ["nothing", undefined],
    ["null", null],
    ["a policy's name", MINT_POLICY.name],
  ];

  it.each(FOREIGN_POLICIES)(
    "answers %s as judgement-failed without a call to the store",
    async (_label, policy) => {
      const store = storeAnswering(1);

      const decision = await enforceRateLimit(
        requestOf({ store, policy: policy as LimitPolicy }),
      );

      expect(decision).toEqual(UNAVAILABLE("judgement-failed"));
      expect(store.calls).toHaveLength(0);
    },
  );

  it("judges the mint's own policy and a subject a constructor made, so the refusals above are theirs", async () => {
    const store = storeAnswering(1);

    expect(await enforceRateLimit(requestOf({ store }))).toEqual({
      kind: "allow",
    });
    expect(store.calls).toHaveLength(1);
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
        ...UNUSED_STORE_READS,
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
    ["a count of nought", [0]],
    ["a fraction", [1.5]],
    ["a fraction below one", [0.5]],
    ["a negative count", [-1]],
    ["a count that is not a whole number past the figure", [20.5]],
  ])("answers %s from the store as store-failed", async (_label, counts) => {
    const store: RateLimitStore = {
      recordHits: () => Promise.resolve(counts as readonly number[]),
      ...UNUSED_STORE_READS,
    };

    expect(await enforceRateLimit(requestOf({ store }))).toEqual(
      UNAVAILABLE("store-failed"),
    );
  });
});

describe("enforceRateLimit: the deadline", () => {
  const unhandledRejections = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    unhandledRejections.mockClear();
  });

  afterEach(() => {
    process.off("unhandledRejection", unhandledRejections);
  });

  function neverAnswering(): RateLimitStore {
    return {
      recordHits: () => new Promise<readonly number[]>(() => undefined),
      ...UNUSED_STORE_READS,
    };
  }

  it("is three seconds for a write and 300 milliseconds for a read", () => {
    expect(RATE_LIMIT_DEADLINE_MS).toBe(3000);
    expect(RATE_LIMIT_READ_DEADLINE_MS).toBe(300);
  });

  it.each([
    ["a read's", RATE_LIMIT_READ_DEADLINE_MS],
    ["a caller's own", 50],
  ])(
    "answers unavailable at %s deadline and not a millisecond before",
    async (_label, deadlineMs) => {
      let decision: RateLimitDecision | undefined;
      const pending = enforceRateLimit(
        requestOf({ store: neverAnswering(), deadlineMs }),
      ).then((value) => {
        decision = value;
      });

      await vi.advanceTimersByTimeAsync(deadlineMs - 1);
      expect(decision).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await pending;

      expect(decision).toEqual(UNAVAILABLE("deadline-passed"));
    },
  );

  it("waits for a read no longer than a read's deadline, whatever the write's is", async () => {
    let decision: RateLimitDecision | undefined;
    const pending = enforceRateLimit(
      requestOf({
        store: neverAnswering(),
        deadlineMs: RATE_LIMIT_READ_DEADLINE_MS,
      }),
    ).then((value) => {
      decision = value;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_READ_DEADLINE_MS);
    await pending;

    expect(decision).toEqual(UNAVAILABLE("deadline-passed"));
    expect(vi.getTimerCount()).toBe(0);
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
    process.on("unhandledRejection", unhandledRejections);
    const late: RateLimitStore = {
      recordHits: () =>
        new Promise<readonly number[]>((_resolve, reject) => {
          setTimeout(() => {
            reject(new RateLimitStoreError("record hits"));
          }, RATE_LIMIT_DEADLINE_MS + 2000);
        }),
      ...UNUSED_STORE_READS,
    };

    const pending = enforceRateLimit(requestOf({ store: late }));
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS);
    const decision = await pending;
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    expect(decision).toEqual(UNAVAILABLE("deadline-passed"));
    expect(unhandledRejections).not.toHaveBeenCalled();
  });

  it("drops an answer that arrives after the deadline, and a later count changes nothing", async () => {
    const late: RateLimitStore = {
      recordHits: () =>
        new Promise<readonly number[]>((resolve) => {
          setTimeout(() => {
            resolve([1]);
          }, RATE_LIMIT_DEADLINE_MS + 1);
        }),
      ...UNUSED_STORE_READS,
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

  it("holds the deadline to a third of the lock's wait, which the store's repeat and the mint's own time share", () => {
    expect(RATE_LIMIT_DEADLINE_MS * 3).toBeLessThanOrEqual(
      LOCK_ACQUIRE_TIMEOUT_MS,
    );
  });
});

describe("enforceRateLimit: a window of whole minutes on the UTC clock, held by the policy as data", () => {
  const HOUR_START = "2026-07-15T12:00:00.000Z";
  const HOUR_END = "2026-07-15T13:00:00.000Z";

  async function hitsAt(
    store: RateLimitStore,
    instant: Date,
    policy: LimitPolicy,
    hits: number,
  ) {
    for (let hit = 0; hit < hits; hit += 1) {
      await enforceRateLimit(requestOf({ store, instant, policy }));
    }
  }

  it("hands the store the clock hour that holds the instant, and not the Chisinau day", async () => {
    const store = storeAnswering(1);

    await enforceRateLimit(requestOf({ store, policy: SAVE_BY_BLOCK_POLICY }));

    expect(store.calls[0]?.[0]?.window).toEqual(utcWindowOf(NOON_ORDINARY, 60));
    expect(store.calls[0]?.[0]?.window).not.toEqual(
      chisinauDayOf(NOON_ORDINARY),
    );
  });

  it("allows 600 hits of one block's saves in an hour and refuses the 601st, with the seconds to the end", async () => {
    const store = new FakeRateLimitStore();
    const instant = new Date("2026-07-15T12:20:00.000Z");
    await hitsAt(store, instant, SAVE_BY_BLOCK_POLICY, 600);

    expect(
      await enforceRateLimit(
        requestOf({ store, instant, policy: SAVE_BY_BLOCK_POLICY }),
      ),
    ).toEqual({ kind: "refuse", retryAfterSeconds: 40 * 60 });
  });

  it("refuses the 601st hit at the hour's last millisecond with one second, then allows the next hour's", async () => {
    const store = new FakeRateLimitStore();
    const last = new Date(new Date(HOUR_END).getTime() - 1);
    await hitsAt(store, last, SAVE_BY_BLOCK_POLICY, 600);

    expect(
      await enforceRateLimit(
        requestOf({ store, instant: last, policy: SAVE_BY_BLOCK_POLICY }),
      ),
    ).toEqual({
      kind: "refuse",
      retryAfterSeconds: 1,
    });
    expect(
      await enforceRateLimit(
        requestOf({
          store,
          instant: new Date(HOUR_END),
          policy: SAVE_BY_BLOCK_POLICY,
        }),
      ),
    ).toEqual({ kind: "allow" });
  });

  it("tells the whole hour to a refusal at the hour's first millisecond", async () => {
    const store = new FakeRateLimitStore();
    const first = new Date(HOUR_START);
    await hitsAt(store, first, SAVE_BY_BLOCK_POLICY, 600);

    expect(
      await enforceRateLimit(
        requestOf({ store, instant: first, policy: SAVE_BY_BLOCK_POLICY }),
      ),
    ).toEqual({
      kind: "refuse",
      retryAfterSeconds: 3600,
    });
  });

  it("allows 300 hits of one credential's saves in an hour and refuses the 301st", async () => {
    const store = new FakeRateLimitStore();
    const credential = {
      policy: SAVE_BY_CREDENTIAL_POLICY,
      subject: A_CREDENTIAL,
    };
    for (let hit = 0; hit < 300; hit += 1) {
      expect(
        (await enforceRateLimit(requestOf({ store, ...credential }))).kind,
      ).toBe("allow");
    }

    expect(
      (await enforceRateLimit(requestOf({ store, ...credential }))).kind,
    ).toBe("refuse");
  });

  it("tells a wait from 1 to 3,600 seconds across the instants of an hour policy, with a floor", async () => {
    const waits: number[] = [];
    for (
      let ms = Date.parse("2026-07-15T12:00:00Z");
      ms < Date.parse("2026-07-15T14:00:00Z");
      ms += 7_001
    ) {
      const decision = await enforceRateLimit(
        requestOf({
          store: storeAnswering(601),
          instant: new Date(ms),
          policy: SAVE_BY_BLOCK_POLICY,
        }),
      );
      if (decision.kind === "refuse") waits.push(decision.retryAfterSeconds);
    }

    expect(waits.length).toBeGreaterThanOrEqual(1000);
    expect(
      waits.every(
        (wait) => Number.isInteger(wait) && wait >= 1 && wait <= 3600,
      ),
    ).toBe(true);
    expect(Math.max(...waits)).toBeLessThanOrEqual(LONGEST_DAY_SECONDS);
  });
});

describe("judgeInSequence: steps asked in order, the first that refuses or cannot be judged ending it", () => {
  type Outcome = "allow" | "refuse" | "unavailable";
  const ANSWERS: Record<Outcome, RateLimitDecision> = {
    allow: { kind: "allow" },
    refuse: { kind: "refuse", retryAfterSeconds: 77 },
    unavailable: { kind: "unavailable", cause: "store-failed" },
  };
  const OUTCOMES: readonly Outcome[] = ["allow", "refuse", "unavailable"];

  /** Steps that answer the given outcomes and write down which of them were asked. */
  function stepsAnswering(outcomes: readonly Outcome[]): {
    steps: JudgementStep[];
    asked: number[];
  } {
    const asked: number[] = [];
    const steps = outcomes.map(
      (outcome, index): JudgementStep =>
        () => {
          asked.push(index);
          return Promise.resolve(ANSWERS[outcome]);
        },
    );
    return { steps, asked };
  }

  function everyCombinationOf(length: number): Outcome[][] {
    return length === 0
      ? [[]]
      : OUTCOMES.flatMap((first) =>
          everyCombinationOf(length - 1).map((rest) => [first, ...rest]),
        );
  }

  it("answers allow when every step allows, having asked each once and in order", async () => {
    const { steps, asked } = stepsAnswering(["allow", "allow", "allow"]);

    expect(await judgeInSequence(steps)).toEqual({ kind: "allow" });
    expect(asked).toEqual([0, 1, 2]);
  });

  it("ends at a refusal of the first step and never asks the second", async () => {
    const { steps, asked } = stepsAnswering(["refuse", "allow"]);

    expect(await judgeInSequence(steps)).toEqual(ANSWERS.refuse);
    expect(asked).toEqual([0]);
  });

  it("ends at the first step when it cannot be judged and never asks the second", async () => {
    const { steps, asked } = stepsAnswering(["unavailable", "allow"]);

    expect(await judgeInSequence(steps)).toEqual(ANSWERS.unavailable);
    expect(asked).toEqual([0]);
  });

  it("answers the second step's refusal after the first allowed, having asked both", async () => {
    const { steps, asked } = stepsAnswering(["allow", "refuse"]);

    expect(await judgeInSequence(steps)).toEqual(ANSWERS.refuse);
    expect(asked).toEqual([0, 1]);
  });

  it("answers the second step's unavailable after the first allowed, having asked both", async () => {
    const { steps, asked } = stepsAnswering(["allow", "unavailable"]);

    expect(await judgeInSequence(steps)).toEqual(ANSWERS.unavailable);
    expect(asked).toEqual([0, 1]);
  });

  it("asks a step only after the one before it has answered, however long that takes", async () => {
    vi.useFakeTimers();
    const started: string[] = [];
    const slow: JudgementStep = async () => {
      started.push("first");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return ANSWERS.allow;
    };
    const next: JudgementStep = () => {
      started.push("second");
      return Promise.resolve(ANSWERS.allow);
    };

    const pending = judgeInSequence([slow, next]);
    await vi.advanceTimersByTimeAsync(999);
    expect(started).toEqual(["first"]);
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(started).toEqual(["first", "second"]);
  });

  it("asks no step after another's first refusal in any combination of three, with a floor on each end", async () => {
    const endedAt = [0, 0, 0, 0];
    for (const outcomes of everyCombinationOf(3)) {
      const { steps, asked } = stepsAnswering(outcomes);

      const decision = await judgeInSequence(steps);

      const firstEnd = outcomes.findIndex((outcome) => outcome !== "allow");
      const lastAsked = firstEnd === -1 ? outcomes.length - 1 : firstEnd;
      expect(asked).toEqual(
        outcomes.slice(0, lastAsked + 1).map((_, index) => index),
      );
      expect(decision).toEqual(
        firstEnd === -1
          ? ANSWERS.allow
          : ANSWERS[outcomes[firstEnd] ?? "allow"],
      );
      endedAt[firstEnd === -1 ? 3 : firstEnd] =
        (endedAt[firstEnd === -1 ? 3 : firstEnd] ?? 0) + 1;
    }

    expect(endedAt).toEqual([18, 6, 2, 1]);
  });

  it("answers unavailable for a sequence of none, since nothing was judged", async () => {
    expect(await judgeInSequence([])).toEqual(UNAVAILABLE("judgement-failed"));
  });

  it.each([
    [
      "throws at once",
      (): Promise<RateLimitDecision> => {
        throw new Error("STEP-MARKER-6612");
      },
    ],
    ["rejects", () => Promise.reject(new Error("STEP-MARKER-6612"))],
    [
      "throws a text",
      (): Promise<RateLimitDecision> => {
        throw "STEP-MARKER-6612" as unknown as Error;
      },
    ],
    [
      "answers nothing",
      () => Promise.resolve(undefined as unknown as RateLimitDecision),
    ],
  ])(
    "answers a first step that %s as unavailable, asks no second and keeps nothing of it",
    async (_label, failing) => {
      const { steps, asked } = stepsAnswering(["allow"]);

      const decision = await judgeInSequence([failing, ...steps]);

      expect(decision).toEqual(UNAVAILABLE("judgement-failed"));
      expect(asked).toEqual([]);
      expect(
        inspect(decision, { depth: null, showHidden: true }),
      ).not.toContain("MARKER");
    },
  );

  it("answers a second step that throws after the first allowed as unavailable, keeping nothing of it", async () => {
    const { steps, asked } = stepsAnswering(["allow"]);
    const throwing: JudgementStep = () =>
      Promise.reject(new Error("STEP-MARKER-6612"));

    const decision = await judgeInSequence([...steps, throwing]);

    expect(decision).toEqual(UNAVAILABLE("judgement-failed"));
    expect(asked).toEqual([0]);
    expect(inspect(decision, { depth: null, showHidden: true })).not.toContain(
      "MARKER",
    );
  });
});

describe("a save's two judgements on the counter fake: the credential counts only a request the block passes", () => {
  const keyOf = (policy: LimitPolicy, subject: BucketSubject) =>
    keyedDigest(FAKE_KEY, {
      purpose: "rate-limit-bucket",
      fields: {
        policyName: policy.name,
        subjectKind: subject.kind,
        subject: subject.subject,
      },
    });

  /** What the fake would count next for a bucket, which a probe adds one hit to. */
  async function nextCountOf(
    store: FakeRateLimitStore,
    policy: LimitPolicy,
    subject: BucketSubject,
  ) {
    const [count] = await store.recordHits([
      { key: keyOf(policy, subject), window: utcWindowOf(NOON_ORDINARY, 60) },
    ]);
    return count;
  }

  function saveSteps(store: FakeRateLimitStore): JudgementStep[] {
    return [
      () =>
        enforceRateLimit(
          requestOf({ store, policy: SAVE_BY_BLOCK_POLICY, subject: BLOCK }),
        ),
      () =>
        enforceRateLimit(
          requestOf({
            store,
            policy: SAVE_BY_CREDENTIAL_POLICY,
            subject: A_CREDENTIAL,
          }),
        ),
    ];
  }

  async function fillTo(
    store: FakeRateLimitStore,
    policy: LimitPolicy,
    subject: BucketSubject,
    hits: number,
  ) {
    for (let hit = 0; hit < hits; hit += 1) {
      await enforceRateLimit(requestOf({ store, policy, subject }));
    }
  }

  it("counts both buckets once for a request that both allow", async () => {
    const store = new FakeRateLimitStore();

    expect(await judgeInSequence(saveSteps(store))).toEqual({ kind: "allow" });

    expect(await nextCountOf(store, SAVE_BY_BLOCK_POLICY, BLOCK)).toBe(2);
    expect(
      await nextCountOf(store, SAVE_BY_CREDENTIAL_POLICY, A_CREDENTIAL),
    ).toBe(2);
  });

  it("writes no row for the credential when the block refuses, however many requests it refuses", async () => {
    const store = new FakeRateLimitStore();
    await fillTo(store, SAVE_BY_BLOCK_POLICY, BLOCK, 600);

    for (let request = 0; request < 5; request += 1) {
      expect((await judgeInSequence(saveSteps(store))).kind).toBe("refuse");
    }

    expect(
      await nextCountOf(store, SAVE_BY_CREDENTIAL_POLICY, A_CREDENTIAL),
    ).toBe(1);
    expect(await nextCountOf(store, SAVE_BY_BLOCK_POLICY, BLOCK)).toBe(606);
  });

  it("counts both buckets for a request the credential refuses", async () => {
    const store = new FakeRateLimitStore();
    await fillTo(store, SAVE_BY_CREDENTIAL_POLICY, A_CREDENTIAL, 300);

    expect((await judgeInSequence(saveSteps(store))).kind).toBe("refuse");

    expect(await nextCountOf(store, SAVE_BY_BLOCK_POLICY, BLOCK)).toBe(2);
    expect(
      await nextCountOf(store, SAVE_BY_CREDENTIAL_POLICY, A_CREDENTIAL),
    ).toBe(302);
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

describe("judgeStepsInSequence: the policy of the step that ended the sequence", () => {
  const FIRST: PolicyChoice = { status: "chosen", policy: MINT_POLICY };
  const SECOND: PolicyChoice = { status: "chosen", policy: READ_POLICY };
  const ALLOW: RateLimitDecision = { kind: "allow" };
  const REFUSE: RateLimitDecision = { kind: "refuse", retryAfterSeconds: 9 };
  const NOT_JUDGED: RateLimitDecision = {
    kind: "unavailable",
    cause: "store-failed",
  };

  function stepOf(
    policy: PolicyChoice,
    answer: RateLimitDecision | "throws",
    asked: PolicyChoice[],
  ): PolicyStep {
    return {
      policy,
      judge: () => {
        asked.push(policy);
        return answer === "throws"
          ? Promise.reject(new Error("STEP-MARKER-0471"))
          : Promise.resolve(answer);
      },
    };
  }

  it.each([
    ["the first refuses", [REFUSE, ALLOW], FIRST, REFUSE, 1],
    ["the first cannot be judged", [NOT_JUDGED, ALLOW], FIRST, NOT_JUDGED, 1],
    ["the second refuses", [ALLOW, REFUSE], SECOND, REFUSE, 2],
    ["the second cannot be judged", [ALLOW, NOT_JUDGED], SECOND, NOT_JUDGED, 2],
    ["both allow", [ALLOW, ALLOW], SECOND, ALLOW, 2],
  ] as const)(
    "answers the decision and the policy of the step that ended it when %s",
    async (_label, answers, policy, decision, askedCount) => {
      const asked: PolicyChoice[] = [];

      const judged = await judgeStepsInSequence([
        stepOf(FIRST, answers[0], asked),
        stepOf(SECOND, answers[1], asked),
      ]);

      expect(judged).toEqual({ decision, policy });
      expect(asked).toHaveLength(askedCount);
    },
  );

  it.each([
    ["first", ["throws", ALLOW], FIRST],
    ["second", [ALLOW, "throws"], SECOND],
  ] as const)(
    "names the policy of the step that threw when the %s does, and keeps nothing of what it threw",
    async (_label, answers, policy) => {
      const asked: PolicyChoice[] = [];

      const judged = await judgeStepsInSequence([
        stepOf(FIRST, answers[0], asked),
        stepOf(SECOND, answers[1], asked),
      ]);

      expect(judged).toEqual({
        decision: UNAVAILABLE("judgement-failed"),
        policy,
      });
      expect(inspect(judged, { depth: null, showHidden: true })).not.toContain(
        "MARKER",
      );
    },
  );

  it("answers no policy for a sequence of none, and judgement-failed", async () => {
    expect(await judgeStepsInSequence([])).toEqual({
      decision: UNAVAILABLE("judgement-failed"),
      policy: { status: "unavailable", variable: undefined },
    });
  });

  it("is what judgeInSequence answers the decision of, so the two cannot differ", async () => {
    for (const answers of [
      [ALLOW, ALLOW],
      [REFUSE, ALLOW],
      [ALLOW, NOT_JUDGED],
    ] as const) {
      const steps = answers.map((answer, index) =>
        stepOf(index === 0 ? FIRST : SECOND, answer, []),
      );

      expect(await judgeInSequence(steps.map(({ judge }) => judge))).toEqual(
        (await judgeStepsInSequence(steps)).decision,
      );
    }
  });
});
