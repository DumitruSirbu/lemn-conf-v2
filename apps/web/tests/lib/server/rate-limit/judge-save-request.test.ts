import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  E2E_SAVES_PER_BLOCK_FIGURE,
  SAVE_BY_BLOCK_POLICY,
  SAVE_BY_CREDENTIAL_POLICY,
  SAVES_PER_BLOCK_FIGURE,
  SAVES_PER_CREDENTIAL_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

import { readSource } from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const CREDENTIAL_HASH = "ab".repeat(32);
const OTHER_CREDENTIAL_HASH = "cd".repeat(32);

const NOON = new Date("2026-07-15T12:20:00Z");
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });
const SECONDS_TO_THE_HOURS_END = 40 * 60;
const MILLISECONDS_IN_AN_HOUR = 60 * 60 * 1000;

/** The judge and the store it counts in, from a module graph of their own: a refusal is announced once for a process,
 *  so a test that reads what was announced must start with a process that announced nothing. */
async function freshJudge() {
  vi.resetModules();
  const judge = await import("@/lib/server/rate-limit/judge-save-request");
  const { getRateLimitStore } = await import(
    "@/lib/server/rate-limit/rate-limit-store-instance"
  );
  const store = getRateLimitStore();
  return {
    ...judge,
    ...writeTokenCasesOf(judge),
    store,
    recorded: vi.spyOn(store, "recordHits"),
  };
}

/** The judge as these cases were written: a write-token hash stated bare, wrapped into the credential union at the
 *  seam, so each case still names the hash it counts. */
function writeTokenCasesOf(
  judge: typeof import("@/lib/server/rate-limit/judge-save-request"),
) {
  const asCredential = (hash: string) => ({
    kind: "write-token" as const,
    hash,
  });
  return {
    judgeSaveRequest: (headers: Headers, hash: string) =>
      judge.judgeSaveRequest(headers, asCredential(hash)),
    refusalOfSaveLimit: (headers: Headers, hash: string) =>
      judge.refusalOfSaveLimit(headers, asCredential(hash)),
  };
}

function theConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

function headersOfBlock(blockNumber: number): Headers {
  return new Headers({
    "x-forwarded-for": [1 + (blockNumber >> 8), blockNumber & 255, 1, 9].join(
      ".",
    ),
  });
}

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

describe("judgeSaveRequest: two judgements, the network's block first", () => {
  it("counts the block and then the credential, each in a bucket of its own", async () => {
    const { judgeSaveRequest, recorded } = await freshJudge();

    const { decision } = await judgeSaveRequest(FROM_192_0_2, CREDENTIAL_HASH);

    const keys = recorded.mock.calls.map(([buckets]) => buckets[0]?.key);
    expect(decision).toEqual({ kind: "allow" });
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.join(" ")).not.toContain(CREDENTIAL_HASH);
  });

  it("counts a credential under the same key from every block, and another credential under another", async () => {
    const { judgeSaveRequest, recorded } = await freshJudge();

    await judgeSaveRequest(headersOfBlock(1), CREDENTIAL_HASH);
    await judgeSaveRequest(headersOfBlock(2), CREDENTIAL_HASH);
    await judgeSaveRequest(headersOfBlock(2), OTHER_CREDENTIAL_HASH);

    const keysOfCalls = recorded.mock.calls.map(([buckets]) => buckets[0]?.key);
    const [, credentialA1, , credentialA2, blockOfOther, credentialB] =
      keysOfCalls;
    expect(credentialA1).toBe(credentialA2);
    expect(credentialB).not.toBe(credentialA1);
    expect(blockOfOther).toBe(keysOfCalls[2]);
  });

  it("counts the block alone when the block refuses, never starting the credential's judgement", async () => {
    const { judgeSaveRequest, recorded } = await freshJudge();
    recorded.mockResolvedValueOnce([SAVES_PER_BLOCK_FIGURE + 1]);

    const { decision, policy } = await judgeSaveRequest(
      FROM_192_0_2,
      CREDENTIAL_HASH,
    );

    expect(decision).toEqual({
      kind: "refuse",
      retryAfterSeconds: SECONDS_TO_THE_HOURS_END,
    });
    expect(policy).toEqual({ status: "chosen", policy: SAVE_BY_BLOCK_POLICY });
    expect(recorded).toHaveBeenCalledTimes(1);
  });

  it("answers under the credential's policy when the credential's bucket is the one that refuses", async () => {
    const { judgeSaveRequest, recorded } = await freshJudge();
    recorded
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([SAVES_PER_CREDENTIAL_FIGURE + 1]);

    const { decision, policy } = await judgeSaveRequest(
      FROM_192_0_2,
      CREDENTIAL_HASH,
    );

    expect(decision.kind).toBe("refuse");
    expect(policy).toEqual({
      status: "chosen",
      policy: SAVE_BY_CREDENTIAL_POLICY,
    });
  });

  it("takes one window for both, so an hour's turn between the two statements tells one wait", async () => {
    const { judgeSaveRequest, recorded } = await freshJudge();
    recorded.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(NOON.getTime() + MILLISECONDS_IN_AN_HOUR));
      return Promise.resolve([1]);
    });
    recorded.mockResolvedValueOnce([SAVES_PER_CREDENTIAL_FIGURE + 1]);

    const { decision } = await judgeSaveRequest(FROM_192_0_2, CREDENTIAL_HASH);

    const windows = recorded.mock.calls.map(([buckets]) => buckets[0]?.window);
    expect(windows).toEqual([utcWindowOf(NOON, 60), utcWindowOf(NOON, 60)]);
    expect(decision).toEqual({
      kind: "refuse",
      retryAfterSeconds: SECONDS_TO_THE_HOURS_END,
    });
  });

  it("gives both policies one window rule, so one wait can be told for a save", () => {
    expect(SAVE_BY_CREDENTIAL_POLICY.window).toEqual(
      SAVE_BY_BLOCK_POLICY.window,
    );
  });

  it("allows the credential's figure and refuses the next, from one credential spread over blocks", async () => {
    const { judgeSaveRequest } = await freshJudge();
    const kinds = [];
    for (let save = 1; save <= SAVES_PER_CREDENTIAL_FIGURE + 1; save += 1) {
      kinds.push(
        (await judgeSaveRequest(headersOfBlock(save), CREDENTIAL_HASH)).decision
          .kind,
      );
    }

    expect(kinds.slice(0, SAVES_PER_CREDENTIAL_FIGURE)).toEqual(
      Array(SAVES_PER_CREDENTIAL_FIGURE).fill("allow"),
    );
    expect(kinds[SAVES_PER_CREDENTIAL_FIGURE]).toBe("refuse");
  });

  it("allows the block's figure and refuses the next, over credentials that are each used once", async () => {
    const { judgeSaveRequest } = await freshJudge();
    const kinds = [];
    for (let save = 1; save <= SAVES_PER_BLOCK_FIGURE + 1; save += 1) {
      const credential = save.toString(16).padStart(64, "0");
      kinds.push(
        (await judgeSaveRequest(FROM_192_0_2, credential)).decision.kind,
      );
    }

    expect(kinds.slice(0, SAVES_PER_BLOCK_FIGURE)).toEqual(
      Array(SAVES_PER_BLOCK_FIGURE).fill("allow"),
    );
    expect(kinds[SAVES_PER_BLOCK_FIGURE]).toBe("refuse");
  });

  it("counts under the e2e twin's figure for the block when the flag is set under no source", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");
    const { judgeSaveRequest, recorded } = await freshJudge();
    recorded.mockResolvedValueOnce([E2E_SAVES_PER_BLOCK_FIGURE]);
    recorded.mockResolvedValueOnce([1]);
    const allowed = await judgeSaveRequest(FROM_192_0_2, CREDENTIAL_HASH);
    recorded.mockResolvedValueOnce([E2E_SAVES_PER_BLOCK_FIGURE + 1]);

    const refused = await judgeSaveRequest(FROM_192_0_2, CREDENTIAL_HASH);

    expect(allowed.decision.kind).toBe("allow");
    expect(refused.decision.kind).toBe("refuse");
  });
});

describe("judgeSaveRequest: anything that is not an allow is not a pass", () => {
  it.each([
    ["not a hash", "not-a-hash"],
    ["an upper-case hash", "AB".repeat(32)],
    ["an empty text", ""],
    ["a hash one digit short", "a".repeat(63)],
  ])(
    "answers %s as a judgement that failed, after the block was counted",
    async (_label, writeTokenHash) => {
      const { judgeSaveRequest, recorded } = await freshJudge();

      const { decision } = await judgeSaveRequest(FROM_192_0_2, writeTokenHash);

      expect(decision).toEqual({
        kind: "unavailable",
        cause: "judgement-failed",
      });
      expect(recorded).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["a hash the constructor refuses", "not-a-hash"],
    ["a store that fails on the credential's statement", CREDENTIAL_HASH],
  ])(
    "names the credential's policy as the one that ended it for %s",
    async (_label, hash) => {
      const { judgeSaveRequest, recorded } = await freshJudge();
      recorded.mockResolvedValueOnce([1]).mockRejectedValueOnce(new Error("x"));

      const { policy } = await judgeSaveRequest(FROM_192_0_2, hash);

      expect(policy).toEqual({
        status: "chosen",
        policy: SAVE_BY_CREDENTIAL_POLICY,
      });
    },
  );

  it("names the block's policy as the one that ended it when the block cannot be judged", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "other");
    const { judgeSaveRequest } = await freshJudge();

    const { decision, policy } = await judgeSaveRequest(
      FROM_192_0_2,
      CREDENTIAL_HASH,
    );

    expect(decision.kind).toBe("unavailable");
    expect(policy).toEqual({ status: "chosen", policy: SAVE_BY_BLOCK_POLICY });
  });

  it("answers a store that fails on the credential's statement as unavailable", async () => {
    const { judgeSaveRequest, recorded } = await freshJudge();
    recorded.mockResolvedValueOnce([1]).mockRejectedValueOnce(new Error("x"));

    const { decision } = await judgeSaveRequest(FROM_192_0_2, CREDENTIAL_HASH);

    expect(decision).toEqual({ kind: "unavailable", cause: "store-failed" });
  });

  it("answers a misconfigured source as the block's judgement does, asking no store", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "other");
    const { judgeSaveRequest, recorded } = await freshJudge();

    const { decision } = await judgeSaveRequest(FROM_192_0_2, CREDENTIAL_HASH);

    expect(decision).toEqual({
      kind: "unavailable",
      cause: "source-misconfigured",
    });
    expect(recorded).not.toHaveBeenCalled();
  });
});

describe("refusalOfSaveLimit: the answer that stops a save", () => {
  it("is nothing for a save that is allowed, and writes nothing", async () => {
    const { warn, error } = theConsole();
    const { refusalOfSaveLimit } = await freshJudge();

    expect(
      await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH),
    ).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("is a 429 with the wait and its code, holding nothing but the code and a sentence", async () => {
    theConsole();
    const { refusalOfSaveLimit, recorded } = await freshJudge();
    recorded.mockResolvedValueOnce([SAVES_PER_BLOCK_FIGURE + 1]);

    const response = await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe(
      String(SECONDS_TO_THE_HOURS_END),
    );
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({
      error: "The limit on saving is reached for now.",
      code: "SAVE_LIMIT_REACHED",
    });
  });

  it("tells a wait of at least one second and at most the window's, whatever the minute", async () => {
    theConsole();
    const { refusalOfSaveLimit, recorded } = await freshJudge();
    const waits = [];
    for (const minutes of [0, 1, 30, 59]) {
      vi.setSystemTime(
        new Date(NOON.getTime() + minutes * 60_000 - 20 * 60_000),
      );
      recorded.mockResolvedValueOnce([SAVES_PER_BLOCK_FIGURE + 1]);
      const response = await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);
      waits.push(Number(response?.headers.get("Retry-After")));
    }

    expect(waits).toEqual([3600, 3540, 1800, 60]);
  });

  it("is a 503 with a code and no wait when the save cannot be judged, with a line naming the cause", async () => {
    vi.stubEnv("DIGEST_SECRET", "short");
    const { error } = theConsole();
    const { refusalOfSaveLimit } = await freshJudge();

    const response = await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);

    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBeNull();
    expect(await response?.json()).toEqual({
      error: "A save cannot be made right now.",
      code: "SAVE_UNAVAILABLE",
    });
    expect(error.mock.calls).toEqual([
      [
        "[designs]",
        {
          event: "design-operation-unavailable",
          operation: "save",
          refusalCode: "SAVE_UNAVAILABLE",
          status: 503,
          cause: "digester-unusable",
        },
      ],
    ]);
  });

  it("is a 503 when the judgement itself throws, keeping nothing of what it threw", async () => {
    const { error } = theConsole();
    const { refusalOfSaveLimit } = await freshJudge();
    const hostile = new Proxy(new Headers(), {
      get() {
        throw new Error("HEADER-MARKER-7721");
      },
    });

    const response = await refusalOfSaveLimit(hostile, CREDENTIAL_HASH);

    expect(response?.status).toBe(503);
    expect(JSON.stringify(error.mock.calls)).not.toContain("MARKER");
    expect(error.mock.calls[0]?.[1]).toMatchObject({
      cause: "judgement-failed",
    });
  });

  it("is a 503 for a hash the constructor refuses, and never an allow", async () => {
    theConsole();
    const { refusalOfSaveLimit } = await freshJudge();

    const response = await refusalOfSaveLimit(FROM_192_0_2, "not-a-hash");

    expect(response?.status).toBe(503);
  });
});

describe("refusalOfSaveLimit: at most one refusal line for a process and a policy", () => {
  it("writes the block's refusal once however many saves it refuses, and the credential's once beside it", async () => {
    const { warn } = theConsole();
    const { refusalOfSaveLimit, recorded } = await freshJudge();
    recorded.mockResolvedValue([SAVES_PER_BLOCK_FIGURE + 1]);
    for (let save = 0; save < 50; save += 1) {
      await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);
    }
    recorded
      .mockReset()
      .mockResolvedValueOnce([1])
      .mockResolvedValue([SAVES_PER_CREDENTIAL_FIGURE + 1]);
    for (let save = 0; save < 50; save += 1) {
      await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);
      recorded.mockResolvedValueOnce([1]);
    }

    expect(warn.mock.calls).toEqual([
      [
        "[designs]",
        {
          event: "design-operation-refused",
          operation: "save",
          refusalCode: "SAVE_LIMIT_REACHED",
          status: 429,
          policy: "design-save-by-block-per-60-utc-minutes",
        },
      ],
      [
        "[designs]",
        {
          event: "design-operation-refused",
          operation: "save",
          refusalCode: "SAVE_LIMIT_REACHED",
          status: 429,
          policy: "design-save-by-credential-per-60-utc-minutes",
        },
      ],
    ]);
  });

  it("writes a line for each save that could not be judged, since the store failing is the signal", async () => {
    vi.stubEnv("DIGEST_SECRET", "short");
    const { error } = theConsole();
    const { refusalOfSaveLimit } = await freshJudge();

    for (let save = 0; save < 3; save += 1) {
      await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);
    }

    expect(error).toHaveBeenCalledTimes(3);
  });

  it("holds no address, block, hash, key, count or secret in an answer or a line", async () => {
    const { warn, error } = theConsole();
    const { refusalOfSaveLimit, recorded } = await freshJudge();
    recorded.mockResolvedValueOnce([SAVES_PER_BLOCK_FIGURE + 1]);
    const refused = await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);
    vi.stubEnv("DIGEST_SECRET", "short");
    const unavailable = await refusalOfSaveLimit(FROM_192_0_2, CREDENTIAL_HASH);

    const everything = JSON.stringify([
      await refused?.json(),
      await unavailable?.json(),
      warn.mock.calls,
      error.mock.calls,
    ]);
    expect(everything).not.toMatch(/192\.0\.2|[0-9a-f]{64}|short|abab/);
    expect(everything).not.toMatch(/count|hits|remain/i);
  });
});

describe("judge-save-request.ts", () => {
  const source = readSource("lib/server/rate-limit/judge-save-request.ts");

  it("reads source: asks the environment once, takes its deadline by name and names no figure", () => {
    expect(source.match(/process\.env/g)).toHaveLength(1);
    expect(source).toMatch(/deadlineMs: RATE_LIMIT_DEADLINE_MS/);
    expect(source.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(
      /\b3000\b|\b60\b|\b300\b|\b600\b/,
    );
  });

  it("reads source: makes the credential's subject inside the second step, from the hash it was handed", () => {
    expect(source).toMatch(
      /subjectStep\(\s*credential,\s*\(\) =>\s*subjectOfWriteCredentialHash\(writeTokenHash\)/,
    );
    expect(source).toMatch(
      /judgeStepsInSequence\(\[\s*blockStep\(block\),\s*subjectStep\(/,
    );
  });
});
