import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAccountMail } from "@/lib/server/mail/account-mail-messages";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

import {
  drainAfterTasks,
  pendingAfterTasks,
} from "../../../support/after-queue";
import {
  DRIVER_FAILURE_MARKER,
  PUBLIC_ORIGIN,
  TOKEN_COMPLETE_POLICY_NAME,
  accountRequest,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  hashingLedger,
  jsonOf,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
  setCookieLinesOf,
  sha256Hex,
  wireOf,
  type AccountWorld,
  type SeededAccount,
} from "../../../support/account-world";

const flag = vi.hoisted(() => ({ on: false }));

vi.mock("@/account/profile/email-change-enabled", () => ({
  get EMAIL_CHANGE_ENABLED() {
    return flag.on;
  },
}));
vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("next/server", async (original) => {
  const queue = await import("../../../support/after-queue");
  return queue.nextServerModule(await original<typeof import("next/server")>());
});
vi.mock("@/lib/server/mail/create-customer-mail-sender", () =>
  import("../../../support/account-world").then((world) =>
    world.customerMailSenderModule(),
  ),
);
vi.mock("@/lib/server/account/breached-password", () =>
  import("../../../support/account-world").then((world) =>
    world.breachedPasswordModule(),
  ),
);
vi.mock("@/lib/server/account/password-hash", async (original) => {
  const world = await import("../../../support/account-world");
  return world.passwordHashModule(
    await original<typeof import("@/lib/server/account/password-hash")>(),
  );
});

const { POST: revertChange } = await import(
  "@/app/api/account/email-change/revert/route"
);

/**
 * `POST /api/account/email-change/revert` (M8B Lot 2 S13d; ADR 0172 Amendment H; criteria R-7 to R-9 and R-11): the
 * undo link of an address change, with the new password it asks for. The store's own rules are in the persistence
 * tests; what is pinned here is the route: what it asks first, which password it judges against which address, the one
 * refusal, that it is not behind the feature flag, and what it does after the store has answered.
 */

const LEFT_ADDRESS = "Ana.Left@Example.test";
const NEW_ADDRESS = "ana.new@example.test";
const NEW_PASSWORD = "a brand new passphrase 77";
const PASSWORD_CHANGED_KEY_PREFIX = "account-mail/password-changed/";
const LINK_INVALID_WIRE_SAMPLE = { status: "link-invalid" };

let world: AccountWorld;
let owner: SeededAccount;

beforeEach(async () => {
  flag.on = true;
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", PUBLIC_ORIGIN);
  owner = await seedVerifiedAccount({ email: LEFT_ADDRESS, locale: "ru" });
});

afterEach(() => {
  flag.on = false;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function revert(
  json: unknown,
  init: Parameters<typeof accountRequest>[1] = {},
) {
  return revertChange(
    accountRequest("/api/account/email-change/revert", {
      method: "POST",
      json,
      ...init,
    }),
  );
}

function aRevert(token: string, newPassword: unknown = NEW_PASSWORD) {
  return { token, newPassword };
}

function aRevertWithoutPassword(token: string) {
  return { token };
}

function aTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

/** The account moves off its address by a confirmed change, as E9 does; returns the value of the undo link it wrote. */
async function leaveFor(
  account: SeededAccount,
  newEmail: string,
): Promise<string> {
  const changeValue = aTokenValue();
  const issued = await world.accounts.issueEmailChangeToken({
    accountId: account.id,
    verifiedPasswordHash: world.accounts.passwordHashOf(account.id) ?? "",
    newEmail,
    newEmailNormalForm: newEmail.toLowerCase(),
    tokenHash: sha256Hex(changeValue),
    expiresAt: new Date(world.now().getTime() + 86_400_000),
  });
  expect(issued.kind).toBe("issued");
  const undoValue = aTokenValue();
  const confirmed = await world.accounts.confirmEmailChange({
    tokenHash: sha256Hex(changeValue),
    revertTokenHash: sha256Hex(undoValue),
    revertExpiresAt: new Date(world.now().getTime() + 86_400_000),
  });
  expect(confirmed.kind).toBe("changed");
  world.advance(1_000);
  world.calls.length = 0;
  return undoValue;
}

/** One live token of each other purpose, all outliving the undo link's day, so only their purpose can refuse them. */
async function issueTokensOfOtherPurposes(): Promise<{
  reset: string;
  change: string;
  verify: string;
}> {
  const expiresAt = new Date(world.now().getTime() + 2 * 86_400_000);
  const values = {
    reset: aTokenValue(),
    change: aTokenValue(),
    verify: aTokenValue(),
  };
  for (const purpose of ["reset-password", "verify-email"] as const) {
    const value = purpose === "reset-password" ? values.reset : values.verify;
    await world.accounts.issueToken({
      accountId: owner.id,
      purpose,
      tokenHash: sha256Hex(value),
      expiresAt,
    });
  }
  await world.accounts.issueEmailChangeToken({
    accountId: owner.id,
    verifiedPasswordHash: world.accounts.passwordHashOf(owner.id) ?? "",
    newEmail: "fifth@example.test",
    newEmailNormalForm: "fifth@example.test",
    tokenHash: sha256Hex(values.change),
    expiresAt,
  });
  return values;
}

async function isLive(tokenHash: string): Promise<boolean> {
  const lookup = await world.sessions.findLive({
    tokenHash,
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  });
  return lookup.kind === "live";
}

function heldSnapshot(): string {
  return JSON.stringify([
    world.accounts.heldTokens(),
    world.accounts.heldAccounts(),
  ]);
}

describe("a revert", () => {
  it("restores the address, sets the new password, ends every session and starts none (R-7)", async () => {
    const before = await seedSession(owner);
    const undo = await leaveFor(owner, NEW_ADDRESS);
    const between = await seedSession(owner);
    const oldHash = owner.passwordHash;
    const changedAt = world.accounts.passwordChangedAtOf(owner.id);

    const answer = await revert(aRevert(undo));

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "email-reverted" });
    expect(setCookieLinesOf(answer)).toEqual([]);
    expect(
      await world.accounts.findByNormalForm(LEFT_ADDRESS.toLowerCase()),
    ).toMatchObject({
      kind: "found",
      account: { id: owner.id, email: LEFT_ADDRESS },
    });
    expect(await world.accounts.findByNormalForm(NEW_ADDRESS)).toEqual({
      kind: "none",
    });
    const hashNow = world.accounts.passwordHashOf(owner.id);
    expect(hashNow).not.toBe(oldHash);
    expect(
      world.accounts.passwordChangedAtOf(owner.id)?.getTime(),
    ).toBeGreaterThan(changedAt?.getTime() ?? 0);
    expect(await isLive(before.tokenHash)).toBe(false);
    expect(await isLive(between.tokenHash)).toBe(false);
    expect(world.calls).not.toContain("sessions.create");
  });

  it("asks the session store to revoke every session once more, after the store has", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    await revert(aRevert(undo));

    expect(world.calls).toEqual([
      "accounts.findRevertAddress",
      "accounts.revertEmailChange",
      "sessions.revokeAllForAccount",
    ]);
  });

  it("queues one password-changed notice to the restored address, in the account's language, after the response", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    const answer = await revert(aRevert(undo));
    const queued = pendingAfterTasks();
    const sentBefore = world.mail.sent.length;
    await drainAfterTasks();

    expect(answer.status).toBe(200);
    expect(queued).toBe(1);
    expect(sentBefore).toBe(0);
    const notices = world.mail.sent.filter((mail) =>
      mail.key.startsWith(PASSWORD_CHANGED_KEY_PREFIX),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.recipient).toBe(LEFT_ADDRESS);
    const inTheirLanguage = buildAccountMail({
      kind: "password-changed",
      locale: "ru",
    });
    const inTheOtherOne = buildAccountMail({
      kind: "password-changed",
      locale: "ro",
    });
    expect(inTheirLanguage.subject).not.toBe(inTheOtherOne.subject);
    expect(notices[0]?.subject).toBe(inTheirLanguage.subject);
    expect(world.mail.sent).toHaveLength(1);
  });

  it("refuses a pending change link made before it, even one the revert did not need to retire (R-7)", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    const pendingValue = aTokenValue();
    await world.accounts.issueEmailChangeToken({
      accountId: owner.id,
      verifiedPasswordHash: world.accounts.passwordHashOf(owner.id) ?? "",
      newEmail: "third@example.test",
      newEmailNormalForm: "third@example.test",
      tokenHash: sha256Hex(pendingValue),
      expiresAt: new Date(world.now().getTime() + 86_400_000),
    });

    await revert(aRevert(undo));

    expect(
      await world.accounts.confirmEmailChange({
        tokenHash: sha256Hex(pendingValue),
        revertTokenHash: sha256Hex(aTokenValue()),
        revertExpiresAt: new Date(world.now().getTime() + 86_400_000),
      }),
    ).toEqual({ kind: "invalid" });
  });

  it("leaves the profile alone (R-12)", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    await world.accounts.updateProfile({
      accountId: owner.id,
      changes: { name: "Ana", address: "Str. Mare 1" },
    });
    const profileBefore = await world.accounts.findProfile(owner.id);

    await revert(aRevert(undo));

    expect(await world.accounts.findProfile(owner.id)).toEqual(profileBefore);
  });

  it("works once", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    const answers = [await revert(aRevert(undo)), await revert(aRevert(undo))];

    expect(answers.map(({ status }) => status)).toEqual([200, 400]);
  });

  it("lets the earlier of two links be used after the later one was (oldest wins)", async () => {
    const first = await leaveFor(owner, NEW_ADDRESS);
    const second = await leaveFor(owner, "third@example.test");

    const answers = [
      await revert(aRevert(second)),
      await revert(aRevert(first)),
    ];

    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
  });

  it("retires the later link when the earlier one is used", async () => {
    const first = await leaveFor(owner, NEW_ADDRESS);
    const second = await leaveFor(owner, "third@example.test");

    const answers = [
      await revert(aRevert(first)),
      await revert(aRevert(second)),
    ];

    expect(answers.map(({ status }) => status)).toEqual([200, 400]);
  });
});

describe("the new password is judged against the address the link restores", () => {
  it("refuses a password equal to the restored address, though it is not the address the account holds now", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    const answer = await revert(aRevert(undo, LEFT_ADDRESS.toLowerCase()));

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_IS_EMAIL" }],
    });
  });

  it("accepts a password equal to the address being left: the policy protects the address that is restored", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    const answer = await revert(aRevert(undo, NEW_ADDRESS.padEnd(14, "x")));

    expect(answer.status).toBe(200);
  });

  it.each([
    [
      "too short",
      (undo: string) => aRevert(undo, "short"),
      "PASSWORD_TOO_SHORT",
    ],
    [
      "not text",
      (undo: string) => aRevert(undo, 123456789012),
      "PASSWORD_NOT_TEXT",
    ],
    ["absent", aRevertWithoutPassword, "PASSWORD_NOT_TEXT"],
  ])(
    "refuses a password that is %s on the field it was sent in, and spends nothing",
    async (_label, bodyOf, code) => {
      const undo = await leaveFor(owner, NEW_ADDRESS);
      const before = heldSnapshot();

      const answer = await revert(bodyOf(undo));

      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "newPassword", code }],
      });
      expect(heldSnapshot()).toBe(before);
      expect(hashingLedger.hashes).toBe(0);
      expect((await revert(aRevert(undo))).status).toBe(200);
    },
  );

  it("refuses a breached password, and spends nothing", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.breach = "breached";
    const before = heldSnapshot();

    const answer = await revert(aRevert(undo));

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_BREACHED" }],
    });
    expect(heldSnapshot()).toBe(before);
    world.breach = "not-breached";
    expect((await revert(aRevert(undo))).status).toBe(200);
  });

  it("hashes once, after every check, and only for a live link", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    await revert(aRevert(aTokenValue()));
    await revert(aRevert(undo, "short"));
    expect(hashingLedger.hashes).toBe(0);

    await revert(aRevert(undo));
    expect(hashingLedger.hashes).toBe(1);
  });
});

describe("one refusal, link-invalid, for every link that does not work (R-8)", () => {
  async function reference(): Promise<string> {
    return wireOf(await revert(aRevert(aTokenValue())));
  }

  it("is a 400 with the word link-invalid, no cache, and nothing else", async () => {
    const answer = await revert(aRevert(aTokenValue()));

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(LINK_INVALID_WIRE_SAMPLE);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers the same bytes, with a weak password too, for an unknown token and a malformed one", async () => {
    const expected = await reference();

    for (const token of ["short", "", 5, null, {}, "a".repeat(44)]) {
      expect(
        await wireOf(await revert(aRevert(token as string, "x"))),
        JSON.stringify(token),
      ).toBe(expected);
    }
    expect(await wireOf(await revert({ newPassword: NEW_PASSWORD }))).toBe(
      expected,
    );
  });

  it("answers the same bytes for a used link, one retired by an earlier link's use, an expired one, and a token of another purpose", async () => {
    const expected = await reference();
    const used = await leaveFor(owner, NEW_ADDRESS);
    await revert(aRevert(used));
    const earlier = await leaveFor(owner, "second@example.test");
    const retired = await leaveFor(owner, "third@example.test");
    await revert(aRevert(earlier));
    const expiring = await leaveFor(owner, "fourth@example.test");
    const otherPurposes = await issueTokensOfOtherPurposes();
    const before = heldSnapshot();

    for (const [label, token] of [
      ["used", used],
      ["retired", retired],
      ["reset-password", otherPurposes.reset],
      ["email-change", otherPurposes.change],
      ["verify-email", otherPurposes.verify],
    ] as const) {
      expect(await wireOf(await revert(aRevert(token))), label).toBe(expected);
    }
    expect(heldSnapshot()).toBe(before);
    world.advance(86_400_000);
    expect(await wireOf(await revert(aRevert(expiring))), "expired").toBe(
      expected,
    );
  });

  it("answers the same bytes when the store itself refuses (an address another account holds or has reserved)", async () => {
    const expected = await reference();
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.intercept("accounts.revertEmailChange", () =>
      Promise.resolve({ kind: "invalid" }),
    );

    expect(await wireOf(await revert(aRevert(undo)))).toBe(expected);
  });

  it("starts no session and writes nothing for a refusal", async () => {
    const before = heldSnapshot();

    const answer = await revert(aRevert(aTokenValue()));

    expect(setCookieLinesOf(answer)).toEqual([]);
    expect(heldSnapshot()).toBe(before);
    expect(world.calls).toEqual(["accounts.findRevertAddress"]);
    expect(pendingAfterTasks()).toBe(0);
  });
});

describe("not behind the e-mail change flag (R-9)", () => {
  beforeEach(() => {
    flag.on = false;
  });

  it("answers link-invalid, not 404, to a well-formed unknown token while the flag is off", async () => {
    const answer = await revert(aRevert(aTokenValue()));

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(LINK_INVALID_WIRE_SAMPLE);
  });

  it("still honours a live link while the flag is off: switching the feature off cannot strand it", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);

    const answer = await revert(aRevert(undo));

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "email-reverted" });
    expect(
      await world.accounts.findByNormalForm(LEFT_ADDRESS.toLowerCase()),
    ).toMatchObject({
      kind: "found",
    });
  });
});

describe("the common steps of the route", () => {
  it("counts the shared token bucket first, then refuses at the limit with a wait and no store call and no hash (R-11)", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    limiterLedger.counted.length = 0;
    limiterLedger.refusing.set(TOKEN_COMPLETE_POLICY_NAME, 1);

    const answer = await revert(aRevert(undo));

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, TOKEN_COMPLETE_POLICY_NAME);
    expect(limiterLedger.counted).toEqual([TOKEN_COMPLETE_POLICY_NAME]);
    expect(world.calls).toEqual([]);
    expect(hashingLedger.hashes).toBe(0);
    limiterLedger.refusing.clear();
    expect((await revert(aRevert(undo))).status).toBe(200);
  });

  it("counts one request in the same bucket as the other link-completing routes, and no other", async () => {
    limiterLedger.counted.length = 0;

    await revert(aRevert(aTokenValue()));

    expect(limiterLedger.counted).toEqual([TOKEN_COMPLETE_POLICY_NAME]);
  });

  it("refuses a request from another site before anything is read or counted", async () => {
    limiterLedger.counted.length = 0;

    const answer = await revert(aRevert(aTokenValue()), {
      secFetchSite: "cross-site",
    });

    expect(answer.status).toBe(403);
    expect(limiterLedger.counted).toEqual([]);
    expect(world.calls).toEqual([]);
  });

  it("refuses a body that is not JSON before anything is counted", async () => {
    limiterLedger.counted.length = 0;

    const answer = await revert(aRevert(aTokenValue()), {
      contentType: "text/plain",
    });

    expect(answer.status).toBe(415);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("answers an invalid-request for a body that is not an object, with the store untouched", async () => {
    const answer = await revert("[1]");

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(world.calls).toEqual([]);
  });
});

describe("when the store fails", () => {
  it("answers 503 with no cause, and keeps the link whole, when the lookup fails", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.failOn("accounts.findRevertAddress");

    const answer = await revert(aRevert(undo));

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    world.intercept("accounts.findRevertAddress", (real) => real());
    expect((await revert(aRevert(undo))).status).toBe(200);
  });

  it("answers 503 and keeps the link whole when the revert fails before it commits", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.failOn("accounts.revertEmailChange");

    const answer = await revert(aRevert(undo));

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(pendingAfterTasks()).toBe(0);
    world.intercept("accounts.revertEmailChange", (real) => real());
    expect((await revert(aRevert(undo))).status).toBe(200);
  });

  it("answers the success it is when the revert committed and only its acknowledgement was lost, and mails the notice", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.intercept("accounts.revertEmailChange", async (real) => {
      await real();
      throw new Error(DRIVER_FAILURE_MARKER);
    });

    const answer = await revert(aRevert(undo));
    await drainAfterTasks();

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "email-reverted" });
    expect(world.mail.sent.map(({ recipient }) => recipient)).toEqual([
      LEFT_ADDRESS,
    ]);
  });

  it("does not mistake a revert that never committed for one that did: the account holds neither the address nor the hash", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.intercept("accounts.revertEmailChange", () =>
      Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
    );

    expect((await revert(aRevert(undo))).status).toBe(503);
    expect(pendingAfterTasks()).toBe(0);
  });

  it("still answers 200 when the extra session revoke fails: the address is restored either way", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    world.failOn("sessions.revokeAllForAccount");

    const answer = await revert(aRevert(undo));

    expect(answer.status).toBe(200);
    expect(
      await world.accounts.findByNormalForm(LEFT_ADDRESS.toLowerCase()),
    ).toMatchObject({
      kind: "found",
    });
  });

  it("still answers 200 when the notice cannot be sent", async () => {
    const undo = await leaveFor(owner, NEW_ADDRESS);
    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", "");

    const answer = await revert(aRevert(undo));
    await drainAfterTasks();

    expect(answer.status).toBe(200);
    expect(world.mail.sent).toEqual([]);
  });
});
