import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chisinauDayOf } from "@/lib/server/rate-limit/chisinau-day";
import { RATE_LIMIT_DEADLINE_MS } from "@/lib/server/rate-limit/enforce-rate-limit";
import { judgeMintRequest } from "@/lib/server/rate-limit/judge-mint-request";
import {
  E2E_MINT_DAILY_FIGURE,
  E2E_MINT_POLICY,
  E2E_RATE_LIMIT_POLICY_FLAG,
  MINT_DAILY_FIGURE,
  MINT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import { readSource } from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** What `openssl dgst -sha256 -mac HMAC -macopt hexkey:<the fake secret>` gave for the mint's two buckets, over
 *  `17:rate-limit-bucket,28:design-mint-per-chisinau-day,10:ipv4-block,7:192.0.2,` and `...,6:shared,0:,`. These are
 *  what the mint counted under before it took a subject, and what it must keep counting under. */
const PINNED_KEY_OF_192_0_2 =
  "a46dd85e1cf9159fef421d085e37caebb57532ef9559b120d504ab0c4d5a7342";
const PINNED_KEY_OF_THE_SHARED_BLOCK =
  "159ec356b492ef38c5e04c7e22dffabdaa1663a51c4e038afda9224f0540a8c3";

const NOON_ORDINARY = new Date("2026-07-15T12:00:00Z");

const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOON_ORDINARY);
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function silenceTheConsole(): void {
  for (const method of [
    "debug",
    "error",
    "info",
    "log",
    "trace",
    "warn",
  ] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
}

function recordedBuckets() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

describe("judgeMintRequest: the mint's bucket, held to the keys it counted under before it took a subject", () => {
  it("counts a request from 192.0.2.77 under the pinned key of 192.0.2 in the Chisinau day", async () => {
    const recorded = recordedBuckets();

    await judgeMintRequest(FROM_192_0_2);

    expect(recorded).toHaveBeenCalledTimes(1);
    expect(recorded.mock.calls[0]?.[0]).toEqual([
      { key: PINNED_KEY_OF_192_0_2, window: chisinauDayOf(NOON_ORDINARY) },
    ]);
  });

  it("counts every host of that /24 under that one key", async () => {
    const recorded = recordedBuckets();

    await judgeMintRequest(new Headers({ "x-forwarded-for": "192.0.2.1" }));
    await judgeMintRequest(new Headers({ "x-forwarded-for": "192.0.2.254" }));

    expect(recorded.mock.calls.map(([buckets]) => buckets[0]?.key)).toEqual([
      PINNED_KEY_OF_192_0_2,
      PINNED_KEY_OF_192_0_2,
    ]);
  });

  it.each([
    ["no header", new Headers()],
    [
      "a list of addresses",
      new Headers({ "x-forwarded-for": "192.0.2.1, 192.0.2.2" }),
    ],
    [
      "text that is no address",
      new Headers({ "x-forwarded-for": "not an address" }),
    ],
  ])(
    "counts %s under the pinned key of the shared block",
    async (_label, headers) => {
      const recorded = recordedBuckets();

      await judgeMintRequest(headers);

      expect(recorded.mock.calls[0]?.[0][0]?.key).toBe(
        PINNED_KEY_OF_THE_SHARED_BLOCK,
      );
    },
  );

  it("counts every request under the shared block when no source is named, whatever header it carries", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const recorded = recordedBuckets();

    await judgeMintRequest(FROM_192_0_2);

    expect(recorded.mock.calls[0]?.[0][0]?.key).toBe(
      PINNED_KEY_OF_THE_SHARED_BLOCK,
    );
  });

  it("counts an IPv6 address by its /64 and an IPv4-mapped one in its IPv4 block, refusing neither", async () => {
    const recorded = recordedBuckets();

    const v6 = await judgeMintRequest(
      new Headers({ "x-forwarded-for": "2001:db8:0:42::1" }),
    );
    const mapped = await judgeMintRequest(
      new Headers({ "x-forwarded-for": "::ffff:192.0.2.77" }),
    );

    expect(v6.decision).toEqual({ kind: "allow" });
    expect(mapped.decision).toEqual({ kind: "allow" });
    expect(recorded.mock.calls[1]?.[0][0]?.key).toBe(PINNED_KEY_OF_192_0_2);
    expect(recorded.mock.calls[0]?.[0][0]?.key).not.toBe(PINNED_KEY_OF_192_0_2);
  });
});

describe("judgeMintRequest: what the mint answers, as it did", () => {
  it("allows the first twenty from one block and refuses the twenty-first with the wait to the day's end", async () => {
    const answers: string[] = [];
    for (let hit = 1; hit <= MINT_DAILY_FIGURE + 1; hit += 1) {
      answers.push((await judgeMintRequest(FROM_192_0_2)).decision.kind);
    }

    expect(answers.slice(0, MINT_DAILY_FIGURE)).toEqual(
      new Array<string>(MINT_DAILY_FIGURE).fill("allow"),
    );
    expect(answers[MINT_DAILY_FIGURE]).toBe("refuse");
  });

  it("answers the chosen policy beside the decision, as the route logs its name", async () => {
    const judgement = await judgeMintRequest(FROM_192_0_2);

    expect(judgement.policy).toEqual({ status: "chosen", policy: MINT_POLICY });
  });

  it("chooses the e2e twin under the flag, and counts 1,600 a day before it refuses", async () => {
    silenceTheConsole();
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");

    const first = await judgeMintRequest(FROM_192_0_2);
    for (let hit = 2; hit <= E2E_MINT_DAILY_FIGURE; hit += 1) {
      await judgeMintRequest(FROM_192_0_2);
    }
    const past = await judgeMintRequest(FROM_192_0_2);

    expect(first.policy).toEqual({ status: "chosen", policy: E2E_MINT_POLICY });
    expect(first.decision).toEqual({ kind: "allow" });
    expect(past.decision.kind).toBe("refuse");
  });

  it("waits for the store no longer than the write's deadline", async () => {
    vi.spyOn(getRateLimitStore(), "recordHits").mockReturnValue(
      new Promise<readonly number[]>(() => undefined),
    );
    let decided: string | undefined;
    const pending = judgeMintRequest(FROM_192_0_2).then(({ decision }) => {
      decided =
        decision.kind === "unavailable" ? decision.cause : decision.kind;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS - 1);
    expect(decided).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(decided).toBe("deadline-passed");
  });
});

interface Unusable {
  readonly source?: string;
  readonly flag?: string;
  readonly secret?: string;
}

describe("judgeMintRequest: what is unavailable before the store is asked, the source first", () => {
  const MISCONFIGURED_SOURCE = "other";
  const CASES: readonly [string, Unusable, string][] = [
    [
      "a misconfigured source",
      { source: MISCONFIGURED_SOURCE },
      "source-misconfigured",
    ],
    ["a flag beside the source", { flag: "1" }, "policy-misconfigured"],
    ["an unusable secret", { secret: "short" }, "digester-unusable"],
    [
      "a source and a secret both unusable: the source first",
      { source: MISCONFIGURED_SOURCE, secret: "short" },
      "source-misconfigured",
    ],
    [
      "a flag beside the source and a secret both unusable: the flag first",
      { flag: "1", secret: "short" },
      "policy-misconfigured",
    ],
    [
      "all three unusable",
      { source: MISCONFIGURED_SOURCE, flag: "1", secret: "short" },
      "source-misconfigured",
    ],
  ];

  it.each(CASES)(
    "answers %s as unavailable without a call to the store",
    async (_label, unusable, cause) => {
      silenceTheConsole();
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, unusable.source ?? "vercel");
      vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, unusable.flag);
      vi.stubEnv("DIGEST_SECRET", unusable.secret ?? FAKE_SECRET);
      const recorded = recordedBuckets();

      const { decision } = await judgeMintRequest(FROM_192_0_2);

      expect(decision).toEqual({ kind: "unavailable", cause });
      expect(recorded).not.toHaveBeenCalled();
    },
  );

  it("answers a store that cannot be made as unavailable, keeping nothing", async () => {
    vi.spyOn(getRateLimitStore(), "recordHits").mockRejectedValue(
      new Error("STORE-MARKER-3108"),
    );

    const { decision } = await judgeMintRequest(FROM_192_0_2);

    expect(decision).toEqual({ kind: "unavailable", cause: "store-failed" });
    expect(JSON.stringify(decision)).not.toContain("MARKER");
  });
});

describe("judge-mint-request.ts", () => {
  const source = readSource("lib/server/rate-limit/judge-mint-request.ts");

  it("reads source: asks the process environment once, inside the request, and never at module level", () => {
    const readings = source.match(/process\.env/g) ?? [];

    expect(readings).toHaveLength(1);
    expect(source).toMatch(/^ {2}const environment = process\.env;$/m);
  });

  it("reads source: takes its instant from the clock inside the request and its deadline from the evaluator", () => {
    expect(source.match(/new Date\(\)/g)).toHaveLength(1);
    expect(source).toMatch(/deadlineMs: RATE_LIMIT_DEADLINE_MS/);
    expect(source).not.toMatch(/\b3000\b|\b20\b|\b1100\b/);
  });
});
