import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RATE_LIMIT_DEADLINE_MS,
  type UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  judgeShareWrite,
  refusalOfShareWriteLimit,
} from "@/lib/server/rate-limit/judge-share-write";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  E2E_SHARE_WRITES_PER_BLOCK_FIGURE,
  SHARE_WRITES_PER_BLOCK_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

import { readSource } from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** What `openssl dgst -sha256 -mac HMAC -macopt hexkey:<the fake secret>` gave over the encodings of a share write's
 *  bucket for the block 192.0.2, for the shared block, and for the e2e twin's shared block. */
const PINNED_KEY_FOR_192_0_2 =
  "6e37b79171628e2fbd6aae7786a3beeac80c5a177b4569dc556e1ccd9e5859b7";
const PINNED_KEY_FOR_THE_SHARED_BLOCK =
  "40a92136cbdb99ad6d8444040072cf9646a224576c1f3e8a8594c38784b6f595";
const PINNED_KEY_OF_THE_E2E_TWIN_FOR_THE_SHARED_BLOCK =
  "57d56c30de932ea4fa0cd7cfb8c5445d9db88d3f1624bbc7908c9ba92dc534d4";

const NOON = new Date("2026-07-15T12:20:00Z");
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });
const SECONDS_TO_THE_HOURS_END = 40 * 60;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOON);
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function theConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

function recordedBuckets() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

describe("judgeShareWrite: the share write's bucket, by the block, in the clock hour", () => {
  it("counts a write from 192.0.2.77 under the pinned key of its block", async () => {
    const recorded = recordedBuckets();

    await judgeShareWrite(FROM_192_0_2);

    expect(recorded.mock.calls[0]?.[0]).toEqual([
      { key: PINNED_KEY_FOR_192_0_2, window: utcWindowOf(NOON, 60) },
    ]);
  });

  it("counts every write under the shared block when no source is named", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const recorded = recordedBuckets();

    await judgeShareWrite(FROM_192_0_2);

    expect(recorded.mock.calls[0]?.[0][0]?.key).toBe(
      PINNED_KEY_FOR_THE_SHARED_BLOCK,
    );
  });

  it("counts under the e2e twin's own key for the shared block when the flag is set", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");
    const recorded = recordedBuckets();

    await judgeShareWrite(FROM_192_0_2);

    expect(recorded.mock.calls[0]?.[0][0]?.key).toBe(
      PINNED_KEY_OF_THE_E2E_TWIN_FOR_THE_SHARED_BLOCK,
    );
  });

  it("allows 60 writes in an hour and refuses the 61st, telling the seconds to the hour's end", async () => {
    const decisions = [];
    for (
      let write = 1;
      write <= SHARE_WRITES_PER_BLOCK_FIGURE + 1;
      write += 1
    ) {
      decisions.push((await judgeShareWrite(FROM_192_0_2)).decision);
    }

    expect(
      decisions
        .slice(0, SHARE_WRITES_PER_BLOCK_FIGURE)
        .every(({ kind }) => kind === "allow"),
    ).toBe(true);
    expect(decisions[SHARE_WRITES_PER_BLOCK_FIGURE]).toEqual({
      kind: "refuse",
      retryAfterSeconds: SECONDS_TO_THE_HOURS_END,
    });
  });

  it("allows the e2e twin's 300 and refuses its 301st", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");
    const kinds = [];
    for (
      let write = 1;
      write <= E2E_SHARE_WRITES_PER_BLOCK_FIGURE + 1;
      write += 1
    ) {
      kinds.push((await judgeShareWrite(FROM_192_0_2)).decision.kind);
    }

    expect(
      kinds
        .slice(0, E2E_SHARE_WRITES_PER_BLOCK_FIGURE)
        .every((kind) => kind === "allow"),
    ).toBe(true);
    expect(kinds[E2E_SHARE_WRITES_PER_BLOCK_FIGURE]).toBe("refuse");
  });
});

describe("judgeShareWrite: a write that cannot be judged is unavailable, the source first", () => {
  interface Unusable {
    readonly source?: string;
    readonly flag?: string;
    readonly secret?: string;
  }
  const CASES: readonly [string, Unusable, UnavailableCause][] = [
    ["a misconfigured source", { source: "other" }, "source-misconfigured"],
    ["a flag beside the source", { flag: "1" }, "policy-misconfigured"],
    ["an unusable secret", { secret: "short" }, "digester-unusable"],
    [
      "a source and a secret both unusable",
      { source: "other", secret: "short" },
      "source-misconfigured",
    ],
    [
      "a flag and a secret both unusable",
      { flag: "1", secret: "short" },
      "policy-misconfigured",
    ],
    [
      "all three unusable",
      { source: "other", flag: "1", secret: "short" },
      "source-misconfigured",
    ],
  ];

  it.each(CASES)(
    "answers %s as unavailable without a call to the store",
    async (_label, unusable, cause) => {
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, unusable.source ?? "vercel");
      vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, unusable.flag);
      vi.stubEnv("DIGEST_SECRET", unusable.secret ?? FAKE_SECRET);
      const recorded = recordedBuckets();

      const { decision } = await judgeShareWrite(FROM_192_0_2);

      expect(decision).toEqual({ kind: "unavailable", cause });
      expect(recorded).not.toHaveBeenCalled();
    },
  );

  it("answers a store that fails as unavailable, and one that never answers at three seconds", async () => {
    const recorded = recordedBuckets();
    recorded.mockRejectedValueOnce(new Error("down"));
    const failed = await judgeShareWrite(FROM_192_0_2);
    recorded.mockReturnValue(new Promise<readonly number[]>(() => undefined));
    let answered: string | undefined;
    const pending = judgeShareWrite(FROM_192_0_2).then(({ decision }) => {
      answered =
        decision.kind === "unavailable" ? decision.cause : decision.kind;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS - 1);
    expect(answered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(failed.decision).toEqual({
      kind: "unavailable",
      cause: "store-failed",
    });
    expect(answered).toBe("deadline-passed");
  });
});

describe("refusalOfShareWriteLimit: the answer that stops a share write", () => {
  it("is nothing for a write that is allowed, and writes nothing", async () => {
    const { warn, error } = theConsole();

    expect(
      await refusalOfShareWriteLimit(FROM_192_0_2, "share-issue"),
    ).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("is a 429 with the wait and its code past the figure, with one line for each refusal", async () => {
    const { warn } = theConsole();
    for (let write = 0; write < SHARE_WRITES_PER_BLOCK_FIGURE; write += 1) {
      await refusalOfShareWriteLimit(FROM_192_0_2, "share-issue");
    }

    const first = await refusalOfShareWriteLimit(FROM_192_0_2, "share-issue");
    await refusalOfShareWriteLimit(FROM_192_0_2, "share-revoke");
    await refusalOfShareWriteLimit(FROM_192_0_2, "share-revoke");

    expect(first?.status).toBe(429);
    expect(first?.headers.get("Retry-After")).toBe(
      String(SECONDS_TO_THE_HOURS_END),
    );
    expect(first?.headers.get("Cache-Control")).toBe("no-store");
    expect(await first?.json()).toEqual({
      error: "The limit on share links is reached for now.",
      code: "SHARE_LIMIT_REACHED",
    });
    expect(
      warn.mock.calls.map(
        ([, line]) => (line as { operation: string }).operation,
      ),
    ).toEqual(["share-issue", "share-revoke", "share-revoke"]);
    expect(warn.mock.calls[0]).toEqual([
      "[designs]",
      {
        event: "design-operation-refused",
        operation: "share-issue",
        refusalCode: "SHARE_LIMIT_REACHED",
        status: 429,
        policy: "share-write-by-block-per-60-utc-minutes",
      },
    ]);
  });

  it("is a 503 with a code and no wait when the write cannot be judged, with a line naming the cause", async () => {
    vi.stubEnv("DIGEST_SECRET", "short");
    const { error } = theConsole();

    const response = await refusalOfShareWriteLimit(
      FROM_192_0_2,
      "share-revoke",
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBeNull();
    expect(await response?.json()).toEqual({
      error: "A share link cannot be changed right now.",
      code: "SHARE_UNAVAILABLE",
    });
    expect(error.mock.calls).toEqual([
      [
        "[designs]",
        {
          event: "design-operation-unavailable",
          operation: "share-revoke",
          refusalCode: "SHARE_UNAVAILABLE",
          status: 503,
          cause: "digester-unusable",
        },
      ],
    ]);
  });

  it("holds no address, block, key, count or secret in an answer or a line", async () => {
    const { warn, error } = theConsole();
    for (let write = 0; write <= SHARE_WRITES_PER_BLOCK_FIGURE; write += 1) {
      await refusalOfShareWriteLimit(FROM_192_0_2, "share-issue");
    }
    vi.stubEnv("DIGEST_SECRET", "short");
    const unavailable = await refusalOfShareWriteLimit(
      FROM_192_0_2,
      "share-issue",
    );

    const everything = JSON.stringify([
      await unavailable?.json(),
      warn.mock.calls,
      error.mock.calls,
    ]);
    expect(everything).not.toMatch(/192\.0\.2|[0-9a-f]{64}|short/);
    expect(everything).not.toMatch(/count|hits|remain/i);
  });

  it("answers as unavailable when the judgement itself throws, keeping nothing of it", async () => {
    const { error } = theConsole();
    const hostile = new Proxy(new Headers(), {
      get() {
        throw new Error("HEADER-MARKER-6190");
      },
    });

    const response = await refusalOfShareWriteLimit(hostile, "share-issue");

    expect(response?.status).toBe(503);
    expect(JSON.stringify(error.mock.calls)).not.toContain("MARKER");
    expect(error.mock.calls[0]?.[1]).toMatchObject({
      cause: "judgement-failed",
    });
  });
});

describe("judge-share-write.ts", () => {
  const source = readSource("lib/server/rate-limit/judge-share-write.ts");

  it("reads source: asks the environment once and takes its deadline by name, naming no figure", () => {
    expect(source.match(/process\.env/g)).toHaveLength(1);
    expect(source).toMatch(/deadlineMs: RATE_LIMIT_DEADLINE_MS/);
    expect(source.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(
      /\b3000\b|\b60\b|\b300\b/,
    );
  });
});
