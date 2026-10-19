import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { judgeSaveRequest } from "@/lib/server/rate-limit/judge-save-request";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  SAVES_PER_CREDENTIAL_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

/**
 * The save judge's account arm (ADR 0172 D9, L12b): a session's save is counted in the block's bucket and then in the
 * account's own, apart from a write token's. The account's id is the one the route read from the session.
 */

const ACCOUNT_ID = "A1b2C3d4E5f6G7h8I9j0_";
const OTHER_ACCOUNT_ID = "Z1b2C3d4E5f6G7h8I9j0_";
const WRITE_TOKEN_HASH = "ab".repeat(32);
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });

beforeEach(() => {
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function countsOf(spy: {
  mock: { results: { value: unknown }[] };
}): Promise<number[][]> {
  return Promise.all(
    spy.mock.results.map(({ value }) => value as Promise<number[]>),
  );
}

describe("judgeSaveRequest with a session's account", () => {
  it("counts the block's bucket, then the account's, and allows a save under both figures", async () => {
    const recorded = vi.spyOn(getRateLimitStore(), "recordHits");

    const judgement = await judgeSaveRequest(FROM_192_0_2, {
      kind: "account",
      accountId: ACCOUNT_ID,
    });

    expect(judgement.decision).toEqual({ kind: "allow" });
    expect(recorded).toHaveBeenCalledTimes(2);
    expect(judgement.policy).toMatchObject({
      status: "chosen",
      policy: {
        name: "design-save-by-account-per-60-utc-minutes",
        figure: SAVES_PER_CREDENTIAL_FIGURE,
      },
    });
  });

  it("counts an account's saves apart from a write token's, and one account's apart from another's", async () => {
    const recorded = vi.spyOn(getRateLimitStore(), "recordHits");
    const asks = [
      { kind: "account", accountId: ACCOUNT_ID },
      { kind: "account", accountId: ACCOUNT_ID },
      { kind: "write-token", hash: WRITE_TOKEN_HASH },
      { kind: "account", accountId: OTHER_ACCOUNT_ID },
      { kind: "account", accountId: ACCOUNT_ID },
    ] as const;

    for (const credential of asks)
      await judgeSaveRequest(FROM_192_0_2, credential);

    const counts = (await countsOf(recorded)).map(([count]) => count);
    // each save counts the block first and its credential second: the block's one bucket counts all five saves, an
    // account's bucket counts its own (1, 2 and then 3 again after a write token's and another account's), and the
    // write token's and the other account's start at 1
    const ofTheBlock = counts.filter((_count, index) => index % 2 === 0);
    const ofTheCredentials = counts.filter((_count, index) => index % 2 === 1);
    expect(ofTheBlock).toEqual([1, 2, 3, 4, 5]);
    expect(ofTheCredentials).toEqual([1, 2, 1, 1, 3]);
  });

  it("refuses at the account's figure with a wait, and counts the account's bucket only after the block allowed", async () => {
    const real = getRateLimitStore();
    const recorded = vi.spyOn(real, "recordHits");
    let calls = 0;
    recorded.mockImplementation(() => {
      calls += 1;
      return Promise.resolve([
        calls % 2 === 1 ? 1 : SAVES_PER_CREDENTIAL_FIGURE + 1,
      ]);
    });

    const judgement = await judgeSaveRequest(FROM_192_0_2, {
      kind: "account",
      accountId: ACCOUNT_ID,
    });

    expect(judgement.decision.kind).toBe("refuse");
    expect(calls).toBe(2);
  });

  it("stops at the block when it refuses: the account's bucket is not counted, so a flood writes no row for an id it invents", async () => {
    const recorded = vi
      .spyOn(getRateLimitStore(), "recordHits")
      .mockImplementation(() => Promise.resolve([100_000]));

    const judgement = await judgeSaveRequest(FROM_192_0_2, {
      kind: "account",
      accountId: ACCOUNT_ID,
    });

    expect(judgement.decision.kind).toBe("refuse");
    expect(recorded).toHaveBeenCalledTimes(1);
  });

  it("is a judgement that failed, with nothing counted for the account, when the id is not an account's", async () => {
    const recorded = vi.spyOn(getRateLimitStore(), "recordHits");

    const judgement = await judgeSaveRequest(FROM_192_0_2, {
      kind: "account",
      accountId: "not an id",
    });

    expect(judgement.decision).toMatchObject({
      kind: "unavailable",
      cause: "judgement-failed",
    });
    expect(recorded).toHaveBeenCalledTimes(1);
  });
});
