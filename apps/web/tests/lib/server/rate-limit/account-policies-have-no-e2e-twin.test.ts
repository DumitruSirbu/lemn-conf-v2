import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { E2E_MINT_POLICY_NOTICE } from "@/lib/server/design-failure-log";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  choosePolicy,
  isE2eTwin,
  type LimitPolicy,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

/**
 * No account purpose has an e2e twin (limit-policy.ts: "Nor has any account purpose: the e2e round decides whether one
 * needs it"). The e2e flag must therefore leave every account bucket at its production figure, write no notice that a
 * twin decided, and, beside a named network source, fail an account write closed like every other purpose.
 */

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const HEADERS = new Headers({ "x-forwarded-for": "192.0.2.77" });
const ACCOUNT_ID = "A1b2C3d4E5f6G7h8I9j0_";
const ADDRESS = "someone@example.test";

/** The purposes the account routes count: a name that is not a `PolicyPurpose` is a type error. */
const ACCOUNT_PURPOSES: Record<
  Extract<
    PolicyPurpose,
    | "account-register-by-block-hour"
    | "account-register-by-block-day"
    | "account-login-by-block"
    | "account-login-by-address-quarter-hour"
    | "account-login-by-address-day"
    | "account-reset-request-by-block"
    | "account-token-complete-by-block"
    | "account-register-mail-by-address"
    | "account-reset-mail-by-address"
    | "account-login-resend-by-address"
    | "account-claim-by-account"
    | "save-by-account"
    | "account-password-check-by-account-hour"
    | "account-password-check-by-account-day"
    | "account-profile-by-account"
    | "account-email-change-mail-by-address"
    | "account-email-change-by-account"
    | "account-export-by-account"
    | "duplicate-by-account"
  >,
  true
> = {
  "account-register-by-block-hour": true,
  "account-register-by-block-day": true,
  "account-login-by-block": true,
  "account-login-by-address-quarter-hour": true,
  "account-login-by-address-day": true,
  "account-reset-request-by-block": true,
  "account-token-complete-by-block": true,
  "account-register-mail-by-address": true,
  "account-reset-mail-by-address": true,
  "account-login-resend-by-address": true,
  "account-claim-by-account": true,
  "save-by-account": true,
  "account-password-check-by-account-hour": true,
  "account-password-check-by-account-day": true,
  "account-profile-by-account": true,
  "account-email-change-mail-by-address": true,
  "account-email-change-by-account": true,
  "account-export-by-account": true,
  "duplicate-by-account": true,
};
const ACCOUNT_PURPOSE_NAMES = Object.keys(ACCOUNT_PURPOSES) as PolicyPurpose[];

function chosen(
  environment: Record<string, string>,
  purpose: PolicyPurpose,
): LimitPolicy {
  const choice = choosePolicy(environment, purpose);
  if (choice.status !== "chosen")
    throw new Error(`nothing chosen for ${purpose}`);
  return choice.policy;
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the e2e flag and the account purposes", () => {
  it.each(ACCOUNT_PURPOSE_NAMES)(
    "chooses the production policy of %s under the flag, which is no twin",
    (purpose) => {
      const flagged = chosen({ [E2E_RATE_LIMIT_POLICY_FLAG]: "1" }, purpose);
      const plain = chosen({}, purpose);

      expect(flagged).toBe(plain);
      expect(isE2eTwin(flagged)).toBe(false);
      expect(flagged.name).not.toMatch(/e2e/);
    },
  );

  it("names every one of them, at least nineteen, so the list cannot shrink unseen", () => {
    expect(ACCOUNT_PURPOSE_NAMES.length).toBeGreaterThanOrEqual(19);
  });

  it.each(ACCOUNT_PURPOSE_NAMES)(
    "fails %s closed beside a named network source, as every purpose does",
    (purpose) => {
      const choice = choosePolicy(
        {
          [E2E_RATE_LIMIT_POLICY_FLAG]: "1",
          [CLIENT_NETWORK_SOURCE_VARIABLE]: "vercel",
        },
        purpose,
      );

      expect(choice).toEqual({
        status: "unavailable",
        variable: E2E_RATE_LIMIT_POLICY_FLAG,
      });
    },
  );
});

describe("the e2e notice and the account judges", () => {
  async function freshAccountJudges() {
    vi.resetModules();
    const judges = await import(
      "@/lib/server/rate-limit/judge-account-request"
    );
    return judges;
  }

  function noticesWritten(warn: ReturnType<typeof vi.spyOn>): number {
    return warn.mock.calls.filter(
      ([, line]) =>
        (line as { message?: string } | undefined)?.message ===
        E2E_MINT_POLICY_NOTICE,
    ).length;
  }

  it("is not written by the account judges alone: every purpose but the copy's mint bucket has no twin to announce", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { judgeAccountBlock, judgeAccountSubject } =
      await freshAccountJudges();

    for (const purpose of [
      "register",
      "login",
      "password-reset-request",
      "confirm-email",
      "password-reset-complete",
      "email-change-confirm",
      "email-change-revert",
    ] as const) {
      await judgeAccountBlock({ purpose, headers: HEADERS });
    }
    for (const purpose of [
      "claim",
      "password-check",
      "profile",
      "email-change",
      "export",
      "kitchen-rename",
      "kitchen-hide",
      "kitchen-delete",
      "kitchen-duplicate",
    ] as const) {
      await judgeAccountSubject({
        purpose,
        headers: HEADERS,
        accountId: ACCOUNT_ID,
      });
    }
    for (const purpose of [
      "register",
      "login",
      "password-reset-request",
      "email-change-mail",
      "mail",
    ] as const) {
      await judgeAccountSubject({
        purpose,
        headers: HEADERS,
        address: ADDRESS,
      });
    }

    expect(noticesWritten(warn)).toBe(0);
  });

  it("is written once when the copy's mint bucket decides under the flag: that bucket is the mint's, which has a twin", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { judgeAccountBlock } = await freshAccountJudges();

    await judgeAccountBlock({ purpose: "kitchen-duplicate", headers: HEADERS });
    await judgeAccountBlock({ purpose: "kitchen-duplicate", headers: HEADERS });

    expect(noticesWritten(warn)).toBe(1);
  });

  it("fails every account write closed beside a named network source and the flag, without counting anything", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { judgeAccountBlock, judgeAccountSubject } =
      await freshAccountJudges();
    const { getRateLimitStore } = await import(
      "@/lib/server/rate-limit/rate-limit-store-instance"
    );
    const recorded = vi.spyOn(getRateLimitStore(), "recordHits");

    const decisions = [
      await judgeAccountBlock({ purpose: "login", headers: HEADERS }),
      await judgeAccountSubject({
        purpose: "profile",
        headers: HEADERS,
        accountId: ACCOUNT_ID,
      }),
      await judgeAccountSubject({
        purpose: "mail",
        headers: HEADERS,
        address: ADDRESS,
      }),
    ].map(({ decision }) => decision);

    for (const decision of decisions) {
      expect(decision).toMatchObject({ kind: "unavailable" });
    }
    expect(recorded).not.toHaveBeenCalled();
  });
});
