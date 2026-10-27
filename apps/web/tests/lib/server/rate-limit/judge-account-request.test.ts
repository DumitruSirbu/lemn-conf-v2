import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  judgeAccountBlock,
  judgeAccountSubject,
  type AccountBlockPurpose,
  type AccountSubjectAsk,
} from "@/lib/server/rate-limit/judge-account-request";
import {
  ACCOUNT_CLAIM_BY_ACCOUNT_POLICY,
  ACCOUNT_EMAIL_CHANGE_BY_ACCOUNT_POLICY,
  ACCOUNT_EMAIL_CHANGE_MAIL_BY_ADDRESS_POLICY,
  ACCOUNT_EXPORT_BY_ACCOUNT_POLICY,
  ACCOUNT_LOGIN_BY_ADDRESS_DAY_POLICY,
  ACCOUNT_LOGIN_BY_ADDRESS_QUARTER_HOUR_POLICY,
  ACCOUNT_LOGIN_BY_BLOCK_POLICY,
  ACCOUNT_LOGIN_RESEND_BY_ADDRESS_POLICY,
  ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_DAY_POLICY,
  ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_HOUR_POLICY,
  ACCOUNT_PROFILE_BY_ACCOUNT_POLICY,
  ACCOUNT_REGISTER_BY_BLOCK_DAY_POLICY,
  ACCOUNT_REGISTER_BY_BLOCK_HOUR_POLICY,
  ACCOUNT_REGISTER_MAIL_BY_ADDRESS_POLICY,
  ACCOUNT_RESET_MAIL_BY_ADDRESS_POLICY,
  ACCOUNT_RESET_REQUEST_BY_BLOCK_POLICY,
  ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY,
  DESIGN_DUPLICATE_BY_ACCOUNT_POLICY,
  E2E_RATE_LIMIT_POLICY_FLAG,
  MINT_POLICY,
  SAVE_BY_ACCOUNT_POLICY,
  STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY,
  STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY,
  STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY,
  STAFF_NOTE_BY_ACCOUNT_POLICY,
  STAFF_STATUS_BY_ACCOUNT_POLICY,
  STAFF_SEEN_BY_ACCOUNT_POLICY,
  STAFF_UNHIDE_BY_ACCOUNT_POLICY,
  type LimitPolicy,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  limiterLedger,
  watchTheLimiter,
} from "../../../support/account-world";

/**
 * The account judges' tables (M8B plan section 5, the common order; ADR 0172 D5 and Amendments A and B): which buckets
 * each flow counts, in what order, at which stage; that one refusal stops the rest; and that whatever cannot be judged
 * is unavailable and counts nothing further.
 */

const HEADERS = new Headers({ "x-forwarded-for": "192.0.2.10" });
const ACCOUNT_ID = "A1b2C3d4E5f6G7h8I9j0_";
const ADDRESS = "someone@example.test";

beforeEach(() => {
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
  limiterLedger.reset();
  watchTheLimiter();
  limiterLedger.knowAccount(ACCOUNT_ID);
  limiterLedger.knowAddress(ADDRESS);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const names = (...policies: LimitPolicy[]) => policies.map(({ name }) => name);

describe("the block stage: the network's buckets alone", () => {
  const BLOCK_TABLE: readonly [AccountBlockPurpose, readonly LimitPolicy[]][] =
    [
      [
        "register",
        [
          ACCOUNT_REGISTER_BY_BLOCK_HOUR_POLICY,
          ACCOUNT_REGISTER_BY_BLOCK_DAY_POLICY,
        ],
      ],
      ["login", [ACCOUNT_LOGIN_BY_BLOCK_POLICY]],
      ["password-reset-request", [ACCOUNT_RESET_REQUEST_BY_BLOCK_POLICY]],
      ["confirm-email", [ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY]],
      ["password-reset-complete", [ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY]],
      ["email-change-confirm", [ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY]],
      ["email-change-revert", [ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY]],
      ["kitchen-duplicate", [MINT_POLICY]],
    ];

  it.each(BLOCK_TABLE)(
    "counts %s in the buckets of the table, in order, and allows",
    async (purpose, policies) => {
      const judgement = await judgeAccountBlock({ purpose, headers: HEADERS });

      expect(judgement.decision).toEqual({ kind: "allow" });
      expect(limiterLedger.counted).toEqual(names(...policies));
      expect(judgement.policy).toMatchObject({
        status: "chosen",
        policy: policies.at(-1),
      });
    },
  );

  it("counts the four link-completing flows in one bucket, since the cost of using a mailed link is bounded together", async () => {
    for (const purpose of [
      "confirm-email",
      "password-reset-complete",
      "email-change-confirm",
      "email-change-revert",
    ] as const) {
      await judgeAccountBlock({ purpose, headers: HEADERS });
    }

    expect(new Set(limiterLedger.counted).size).toBe(1);
    expect(limiterLedger.counted).toHaveLength(4);
  });

  it("stops at the first bucket that refuses, counting none after it, and names that bucket's policy", async () => {
    limiterLedger.refusing.set(ACCOUNT_REGISTER_BY_BLOCK_HOUR_POLICY.name, 77);

    const judgement = await judgeAccountBlock({
      purpose: "register",
      headers: HEADERS,
    });

    expect(judgement.decision).toMatchObject({ kind: "refuse" });
    expect(judgement.decision).toHaveProperty(
      "retryAfterSeconds",
      expect.any(Number),
    );
    expect(limiterLedger.counted).toEqual(
      names(ACCOUNT_REGISTER_BY_BLOCK_HOUR_POLICY),
    );
    expect(judgement.policy).toMatchObject({
      policy: ACCOUNT_REGISTER_BY_BLOCK_HOUR_POLICY,
    });
  });

  it("is unavailable, and counts nothing, for a purpose the table does not hold, however it is spelled", async () => {
    for (const purpose of [
      "claim",
      "export",
      "constructor",
      "__proto__",
      "toString",
      "",
      undefined,
    ]) {
      limiterLedger.counted.length = 0;

      const judgement = await judgeAccountBlock({
        purpose: purpose as never,
        headers: HEADERS,
      });

      expect(judgement.decision, String(purpose)).toMatchObject({
        kind: "unavailable",
        cause: "judgement-failed",
      });
      expect(limiterLedger.counted, String(purpose)).toEqual([]);
    }
  });

  it("is unavailable under a misconfigured network source, before any bucket is counted", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "somewhere-else");

    const judgement = await judgeAccountBlock({
      purpose: "login",
      headers: HEADERS,
    });

    expect(judgement.decision).toMatchObject({
      kind: "unavailable",
      cause: "source-misconfigured",
    });
  });
});

describe("the subject stage: an address's or an account's own buckets", () => {
  const SUBJECT_TABLE: readonly [AccountSubjectAsk, readonly LimitPolicy[]][] =
    [
      [
        { purpose: "register", headers: HEADERS, address: ADDRESS },
        [ACCOUNT_REGISTER_MAIL_BY_ADDRESS_POLICY],
      ],
      [
        { purpose: "login", headers: HEADERS, address: ADDRESS },
        [
          ACCOUNT_LOGIN_BY_ADDRESS_QUARTER_HOUR_POLICY,
          ACCOUNT_LOGIN_BY_ADDRESS_DAY_POLICY,
        ],
      ],
      [
        {
          purpose: "password-reset-request",
          headers: HEADERS,
          address: ADDRESS,
        },
        [ACCOUNT_RESET_MAIL_BY_ADDRESS_POLICY],
      ],
      [
        { purpose: "email-change-mail", headers: HEADERS, address: ADDRESS },
        [ACCOUNT_EMAIL_CHANGE_MAIL_BY_ADDRESS_POLICY],
      ],
      [
        { purpose: "mail", headers: HEADERS, address: ADDRESS },
        [ACCOUNT_LOGIN_RESEND_BY_ADDRESS_POLICY],
      ],
      [
        { purpose: "claim", headers: HEADERS, accountId: ACCOUNT_ID },
        [ACCOUNT_CLAIM_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "password-check", headers: HEADERS, accountId: ACCOUNT_ID },
        [
          ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_HOUR_POLICY,
          ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_DAY_POLICY,
        ],
      ],
      [
        { purpose: "profile", headers: HEADERS, accountId: ACCOUNT_ID },
        [ACCOUNT_PROFILE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "email-change", headers: HEADERS, accountId: ACCOUNT_ID },
        [ACCOUNT_EMAIL_CHANGE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "export", headers: HEADERS, accountId: ACCOUNT_ID },
        [ACCOUNT_EXPORT_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "kitchen-rename", headers: HEADERS, accountId: ACCOUNT_ID },
        [SAVE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "kitchen-hide", headers: HEADERS, accountId: ACCOUNT_ID },
        [SAVE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "kitchen-delete", headers: HEADERS, accountId: ACCOUNT_ID },
        [SAVE_BY_ACCOUNT_POLICY],
      ],
      [
        {
          purpose: "kitchen-duplicate",
          headers: HEADERS,
          accountId: ACCOUNT_ID,
        },
        [DESIGN_DUPLICATE_BY_ACCOUNT_POLICY],
      ],
      [
        {
          purpose: "staff-kitchens-list",
          headers: HEADERS,
          accountId: ACCOUNT_ID,
        },
        [STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY],
      ],
      [
        {
          purpose: "staff-kitchen-open",
          headers: HEADERS,
          accountId: ACCOUNT_ID,
        },
        [STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY],
      ],
      [
        {
          purpose: "staff-audit-page",
          headers: HEADERS,
          accountId: ACCOUNT_ID,
        },
        [STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "staff-note", headers: HEADERS, accountId: ACCOUNT_ID },
        [STAFF_NOTE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "staff-status", headers: HEADERS, accountId: ACCOUNT_ID },
        [STAFF_STATUS_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "staff-unhide", headers: HEADERS, accountId: ACCOUNT_ID },
        [STAFF_UNHIDE_BY_ACCOUNT_POLICY],
      ],
      [
        { purpose: "staff-seen", headers: HEADERS, accountId: ACCOUNT_ID },
        [STAFF_SEEN_BY_ACCOUNT_POLICY],
      ],
    ];

  it.each(SUBJECT_TABLE)(
    "counts $purpose in the buckets of the table, in order, and allows",
    async (ask, policies) => {
      const judgement = await judgeAccountSubject(ask);

      expect(judgement.decision).toEqual({ kind: "allow" });
      expect(limiterLedger.counted).toEqual(names(...policies));
    },
  );

  it("counts a rename, a hide and a delete in one bucket, the saves', and a copy in its own", async () => {
    for (const purpose of [
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

    expect(limiterLedger.counted).toEqual(
      names(
        SAVE_BY_ACCOUNT_POLICY,
        SAVE_BY_ACCOUNT_POLICY,
        SAVE_BY_ACCOUNT_POLICY,
        DESIGN_DUPLICATE_BY_ACCOUNT_POLICY,
      ),
    );
  });

  it("stops at the first bucket that refuses: the hour's refusal leaves the day's uncounted", async () => {
    limiterLedger.refusing.set(
      ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_HOUR_POLICY.name,
      55,
    );

    const judgement = await judgeAccountSubject({
      purpose: "password-check",
      headers: HEADERS,
      accountId: ACCOUNT_ID,
    });

    expect(judgement.decision).toMatchObject({ kind: "refuse" });
    expect(judgement.decision).toHaveProperty(
      "retryAfterSeconds",
      expect.any(Number),
    );
    expect(limiterLedger.counted).toEqual(
      names(ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_HOUR_POLICY),
    );
  });

  it("is unavailable, counting nothing, for an account id that is not one's shape", async () => {
    for (const accountId of [
      "",
      "short",
      "a".repeat(22),
      `${"a".repeat(20)} `,
      "ana@example.com",
    ]) {
      limiterLedger.counted.length = 0;

      const judgement = await judgeAccountSubject({
        purpose: "profile",
        headers: HEADERS,
        accountId,
      });

      expect(judgement.decision, accountId).toMatchObject({
        kind: "unavailable",
        cause: "judgement-failed",
      });
    }
  });

  it("is unavailable for an address that is not in its counted form", async () => {
    for (const address of [
      "",
      "Someone@Example.test",
      "not an address",
      " someone@example.test",
    ]) {
      const judgement = await judgeAccountSubject({
        purpose: "login",
        headers: HEADERS,
        address,
      });

      expect(judgement.decision, address).toMatchObject({
        kind: "unavailable",
        cause: "judgement-failed",
      });
    }
  });

  it("is unavailable, counting nothing, for a purpose the table does not hold", async () => {
    for (const purpose of [
      "constructor",
      "__proto__",
      "toString",
      "",
      undefined,
      "kitchen-list",
    ]) {
      const judgement = await judgeAccountSubject({
        purpose: purpose as never,
        headers: HEADERS,
        accountId: ACCOUNT_ID,
      });

      expect(judgement.decision, String(purpose)).toMatchObject({
        kind: "unavailable",
        cause: "judgement-failed",
      });
    }
    expect(limiterLedger.counted).toEqual([]);
  });

  it("fails closed when a bucket cannot be judged, counting no bucket after it", async () => {
    limiterLedger.unavailable.add(
      ACCOUNT_LOGIN_BY_ADDRESS_QUARTER_HOUR_POLICY.name,
    );

    const judgement = await judgeAccountSubject({
      purpose: "login",
      headers: HEADERS,
      address: ADDRESS,
    });

    expect(judgement.decision).toMatchObject({ kind: "unavailable" });
    expect(limiterLedger.counted).toEqual(
      names(ACCOUNT_LOGIN_BY_ADDRESS_QUARTER_HOUR_POLICY),
    );
  });
});

describe("what a judgement writes down", () => {
  it("writes nothing for an allowance", async () => {
    const console_ = captureConsole();

    await judgeAccountSubject({
      purpose: "profile",
      headers: HEADERS,
      accountId: ACCOUNT_ID,
    });

    expect(console_.accountLines()).toEqual([]);
  });

  it("writes a refusal as limited, by the flow's event and the policy that stopped it", async () => {
    const console_ = captureConsole();
    limiterLedger.refusing.set(ACCOUNT_EXPORT_BY_ACCOUNT_POLICY.name, 9);

    await judgeAccountSubject({
      purpose: "export",
      headers: HEADERS,
      accountId: ACCOUNT_ID,
    });

    expect(console_.accountLines()).toEqual([
      {
        event: "export",
        outcome: "limited",
        policy: ACCOUNT_EXPORT_BY_ACCOUNT_POLICY.name,
      },
    ]);
  });

  it("writes an unavailability as unavailable with no policy, and nothing of the account or the address", async () => {
    const console_ = captureConsole();
    limiterLedger.unavailable.add(ACCOUNT_PROFILE_BY_ACCOUNT_POLICY.name);

    await judgeAccountSubject({
      purpose: "profile",
      headers: HEADERS,
      accountId: ACCOUNT_ID,
    });

    expect(console_.accountLines()).toEqual([
      { event: "profile", outcome: "unavailable" },
    ]);
    expect(console_.everything()).not.toContain(ACCOUNT_ID);
  });

  it.each([
    ["password-check", "password-change"],
    ["claim", "claim"],
    ["kitchen-rename", "kitchen-rename"],
    ["kitchen-hide", "kitchen-hide"],
    ["kitchen-delete", "kitchen-delete"],
    ["kitchen-duplicate", "kitchen-duplicate"],
    ["email-change", "email-change"],
    ["profile", "profile"],
    ["staff-kitchens-list", "staff-kitchens"],
    ["staff-kitchen-open", "staff-kitchen"],
    ["staff-audit-page", "staff-audit"],
    ["staff-note", "staff-note"],
    ["staff-status", "staff-status"],
    ["staff-unhide", "staff-unhide"],
    ["staff-seen", "staff-seen"],
  ] as const)("names the flow of %s as %s", async (purpose, event) => {
    const console_ = captureConsole();
    limiterLedger.refusing.set(
      {
        "password-check": ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_HOUR_POLICY,
        claim: ACCOUNT_CLAIM_BY_ACCOUNT_POLICY,
        "kitchen-rename": SAVE_BY_ACCOUNT_POLICY,
        "kitchen-hide": SAVE_BY_ACCOUNT_POLICY,
        "kitchen-delete": SAVE_BY_ACCOUNT_POLICY,
        "kitchen-duplicate": DESIGN_DUPLICATE_BY_ACCOUNT_POLICY,
        "email-change": ACCOUNT_EMAIL_CHANGE_BY_ACCOUNT_POLICY,
        profile: ACCOUNT_PROFILE_BY_ACCOUNT_POLICY,
        "staff-kitchens-list": STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY,
        "staff-kitchen-open": STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY,
        "staff-audit-page": STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY,
        "staff-note": STAFF_NOTE_BY_ACCOUNT_POLICY,
        "staff-status": STAFF_STATUS_BY_ACCOUNT_POLICY,
        "staff-unhide": STAFF_UNHIDE_BY_ACCOUNT_POLICY,
        "staff-seen": STAFF_SEEN_BY_ACCOUNT_POLICY,
      }[purpose].name,
      5,
    );

    await judgeAccountSubject({
      purpose,
      headers: HEADERS,
      accountId: ACCOUNT_ID,
    });

    expect(console_.accountLines().map((line) => line.event)).toEqual([event]);
  });

  it("lets a caller name the flow, as the e-mail change names its password check", async () => {
    const console_ = captureConsole();
    limiterLedger.refusing.set(
      ACCOUNT_PASSWORD_CHECK_BY_ACCOUNT_HOUR_POLICY.name,
      5,
    );

    await judgeAccountSubject({
      purpose: "password-check",
      headers: HEADERS,
      accountId: ACCOUNT_ID,
      event: "email-change",
    });

    expect(console_.accountLines().map((line) => line.event)).toEqual([
      "email-change",
    ]);
  });

  it("names the block stage's flow by its purpose", async () => {
    const console_ = captureConsole();
    limiterLedger.refusing.set(ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY.name, 5);

    await judgeAccountBlock({
      purpose: "email-change-confirm",
      headers: HEADERS,
    });

    expect(console_.accountLines().map((line) => line.event)).toEqual([
      "email-change-confirm",
    ]);
  });

  it("names the undo link's flow by its own event, not the confirmation's", async () => {
    const console_ = captureConsole();
    limiterLedger.refusing.set(ACCOUNT_TOKEN_COMPLETE_BY_BLOCK_POLICY.name, 5);

    await judgeAccountBlock({
      purpose: "email-change-revert",
      headers: HEADERS,
    });

    expect(console_.accountLines().map((line) => line.event)).toEqual([
      "email-change-revert",
    ]);
  });
});
