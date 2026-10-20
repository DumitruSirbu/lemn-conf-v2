import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewAccount } from "../src/account-store.js";
import { createFakeAccountAndSessionStores } from "../src/fake-session-store.js";
import type { FakeAccountStore } from "../src/fake-account-store.js";
import type { FakeSessionStore } from "../src/fake-session-store.js";

/**
 * The account store's contract as the in-memory fake models it: the semantics Lot 2 added (a signed-in password change,
 * an e-mail change, and the retirement of every unused token when a password or an address changes) and the ones they
 * lean on. Sessions are the session fake's, wired to the account fake as the database joins its tables.
 */
const FIRST_INSTANT = new Date("2026-10-19T09:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_LIFETIMES = {
  client: 3_600_000,
  operator: 3_600_000,
  administrator: 3_600_000,
};

let currentTime: Date;
let accounts: FakeAccountStore;
let sessions: FakeSessionStore;

beforeEach(() => {
  currentTime = new Date(FIRST_INSTANT);
  ({ accounts, sessions } = createFakeAccountAndSessionStores(
    () => new Date(currentTime),
  ));
});

function advanceClock(milliseconds = 1_000): void {
  currentTime = new Date(currentTime.getTime() + milliseconds);
}

function sha256Of(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

/** An argon2id PHC string of the shape the store checks, distinct for each seed. */
function passwordHashOf(seed: string): string {
  const filler = (length: number) =>
    seed
      .replace(/[^A-Za-z0-9]/g, "A")
      .padEnd(length, "A")
      .slice(0, length);
  return `$argon2id$v=19$m=19456,t=2,p=1$${filler(22)}$${filler(43)}`;
}

function newAccount(email: string, passwordHash: string): NewAccount {
  return {
    email,
    emailNormalForm: email.toLowerCase(),
    phone: undefined,
    locale: "ro",
    privacyNoticeVersion: "2026-10-draft",
    passwordHash,
  };
}

interface Registered {
  readonly accountId: string;
  readonly email: string;
  readonly passwordHash: string;
}

async function register(email: string, seed: string): Promise<Registered> {
  const passwordHash = passwordHashOf(seed);
  const created = await accounts.createUnverified(
    newAccount(email, passwordHash),
  );
  if (created.kind !== "created") throw new Error("the address was taken");
  return { accountId: created.accountId, email, passwordHash };
}

async function registerVerified(
  email: string,
  seed: string,
): Promise<Registered> {
  const account = await register(email, seed);
  const tokenHash = sha256Of(`verify-${email}`);
  await accounts.issueToken({
    accountId: account.accountId,
    purpose: "verify-email",
    tokenHash,
    expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
  });
  const confirmed = await accounts.confirmEmail({
    tokenHash,
    accountId: account.accountId,
    verifiedPasswordHash: account.passwordHash,
  });
  if (confirmed.kind !== "confirmed") throw new Error("could not verify");
  advanceClock();
  return account;
}

async function startSession(
  account: Registered,
  seed: string,
  passwordHash = account.passwordHash,
): Promise<string> {
  const tokenHash = sha256Of(`session-${seed}`);
  const created = await sessions.create({
    tokenHash,
    accountId: account.accountId,
    expectedPasswordHash: passwordHash,
    absoluteExpiresAt: new Date(currentTime.getTime() + 30 * ONE_DAY_MS),
  });
  if (created.kind !== "created")
    throw new Error(`no session: ${created.kind}`);
  return tokenHash;
}

async function isLive(tokenHash: string): Promise<boolean> {
  const lookup = await sessions.findLive({
    tokenHash,
    idleLifetimeSeconds: IDLE_LIFETIMES,
  });
  return lookup.kind === "live";
}

const REVERT_LIFETIME_MS = ONE_DAY_MS;

/** A confirmation that names its own undo link, as the caller mints one per call: the hash follows the token's. */
function revertHashOf(tokenHash: string): string {
  return sha256Of(`revert-of-${tokenHash}`);
}

function confirmChange(tokenHash: string) {
  return accounts.confirmEmailChange({
    tokenHash,
    revertTokenHash: revertHashOf(tokenHash),
    revertExpiresAt: new Date(currentTime.getTime() + REVERT_LIFETIME_MS),
  });
}

async function issueEmailChange(
  account: Registered,
  newEmail: string,
  seed: string,
  expiresInMs = ONE_DAY_MS,
): Promise<string> {
  const tokenHash = sha256Of(`email-change-${seed}`);
  const issued = await accounts.issueEmailChangeToken({
    accountId: account.accountId,
    verifiedPasswordHash: account.passwordHash,
    newEmail,
    newEmailNormalForm: newEmail.toLowerCase(),
    tokenHash,
    expiresAt: new Date(currentTime.getTime() + expiresInMs),
  });
  if (issued.kind !== "issued")
    throw new Error("the email change token was refused");
  return tokenHash;
}

async function issueReset(account: Registered, seed: string): Promise<string> {
  const tokenHash = sha256Of(`reset-${seed}`);
  await accounts.issueToken({
    accountId: account.accountId,
    purpose: "reset-password",
    tokenHash,
    expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
  });
  return tokenHash;
}

function tokenState(tokenHash: string): { isUsed: boolean } | undefined {
  const held = accounts
    .heldTokens()
    .find((token) => token.tokenHash === tokenHash);
  return held === undefined ? undefined : { isUsed: held.usedAt !== undefined };
}

describe("FakeAccountStore.changePassword: a signed-in password change", () => {
  it("replaces the hash, advances password_changed_at to the clock, and answers changed", async () => {
    const account = await registerVerified("ana@example.md", "first");
    advanceClock(60_000);
    const replacement = passwordHashOf("second");

    const outcome = await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: replacement,
    });

    expect(outcome).toEqual({ kind: "changed" });
    expect(accounts.passwordHashOf(account.accountId)).toBe(replacement);
    expect(accounts.passwordChangedAtOf(account.accountId)).toEqual(
      currentTime,
    );
  });

  it("revokes every session of the account that existed before, this device's old cookie value included, even one created in the very instant of the change", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const thisDevice = await startSession(account, "this-device");
    const otherDevice = await startSession(account, "other-device");
    expect([await isLive(thisDevice), await isLive(otherDevice)]).toEqual([
      true,
      true,
    ]);

    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: passwordHashOf("second"),
    });

    expect([await isLive(thisDevice), await isLive(otherDevice)]).toEqual([
      false,
      false,
    ]);
  });

  it("leaves another account's sessions live", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const bystander = await registerVerified("bob@example.md", "bystander");
    const bystanderSession = await startSession(bystander, "bystander");

    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: passwordHashOf("second"),
    });

    expect(await isLive(bystanderSession)).toBe(true);
  });

  it("lets the replacing session start under the new hash in the same instant, and it is live", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const oldSession = await startSession(account, "old");
    const replacement = passwordHashOf("second");

    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: replacement,
    });
    const newSession = await startSession(account, "new", replacement);

    expect(await isLive(newSession)).toBe(true);
    expect(await isLive(oldSession)).toBe(false);
  });

  it("cannot start a session bound to the old hash after the change", async () => {
    const account = await registerVerified("ana@example.md", "first");
    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: passwordHashOf("second"),
    });

    const attempt = await sessions.create({
      tokenHash: sha256Of("late"),
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      absoluteExpiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
    });

    expect(attempt).toEqual({ kind: "stale" });
  });

  it("retires every unused e-mail token of the account, of every purpose", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const reset = await issueReset(account, "pending");
    advanceClock();
    const emailChange = await issueEmailChange(
      account,
      "new@example.md",
      "pending",
    );
    const bystander = await registerVerified("bob@example.md", "bystander");
    const bystanderReset = await issueReset(bystander, "bystander");

    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: passwordHashOf("second"),
    });

    expect(tokenState(reset)).toEqual({ isUsed: true });
    expect(tokenState(emailChange)).toEqual({ isUsed: true });
    expect(tokenState(bystanderReset)).toEqual({ isUsed: false });
  });

  describe("when the account no longer holds the expected hash (a reset or another change got there first)", () => {
    it("answers stale and changes nothing: the hash, the instant, the sessions and the tokens stay", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const session = await startSession(account, "kept");
      const reset = await issueReset(account, "kept");
      advanceClock(60_000);
      const changedAtBefore = accounts.passwordChangedAtOf(account.accountId);

      const outcome = await accounts.changePassword({
        accountId: account.accountId,
        expectedPasswordHash: passwordHashOf("not-the-current-one"),
        passwordHash: passwordHashOf("second"),
      });

      expect(outcome).toEqual({ kind: "stale" });
      expect(accounts.passwordHashOf(account.accountId)).toBe(
        account.passwordHash,
      );
      expect(accounts.passwordChangedAtOf(account.accountId)).toEqual(
        changedAtBefore,
      );
      expect(await isLive(session)).toBe(true);
      expect(tokenState(reset)).toEqual({ isUsed: false });
    });

    it("answers stale for an account that does not exist", async () => {
      expect(
        await accounts.changePassword({
          accountId: "N".repeat(21),
          expectedPasswordHash: passwordHashOf("a"),
          passwordHash: passwordHashOf("b"),
        }),
      ).toEqual({ kind: "stale" });
    });

    it("answers stale for the second of two changes made from the same verified hash", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const change = (seed: string) =>
        accounts.changePassword({
          accountId: account.accountId,
          expectedPasswordHash: account.passwordHash,
          passwordHash: passwordHashOf(seed),
        });

      const outcomes = [await change("winner"), await change("loser")];

      expect(outcomes).toEqual([{ kind: "changed" }, { kind: "stale" }]);
      expect(accounts.passwordHashOf(account.accountId)).toBe(
        passwordHashOf("winner"),
      );
    });
  });

  it.each([
    ["an account id of the wrong shape", { accountId: "x" }],
    ["a new hash that is not argon2id", { passwordHash: "plaintext-password" }],
    [
      "an expected hash that is not argon2id",
      { expectedPasswordHash: "plaintext-password" },
    ],
  ])("refuses %s with a rejection", async (_label, override) => {
    const account = await registerVerified("ana@example.md", "first");

    await expect(
      accounts.changePassword({
        accountId: account.accountId,
        expectedPasswordHash: account.passwordHash,
        passwordHash: passwordHashOf("second"),
        ...override,
      }),
    ).rejects.toThrow(/Refusing to change a password/);
    expect(accounts.passwordHashOf(account.accountId)).toBe(
      account.passwordHash,
    );
  });
});

describe("FakeAccountStore.confirmEmailChange", () => {
  it("replaces the address with the row's, marks the token used, revokes every session and returns the old address", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const session = await startSession(account, "device");
    const token = await issueEmailChange(account, "Ana.New@Example.md", "one");

    const outcome = await confirmChange(token);

    expect(outcome).toEqual({
      kind: "changed",
      accountId: account.accountId,
      previous: { email: "ana@example.md", locale: "ro" },
    });
    expect(await accounts.findByNormalForm("ana.new@example.md")).toMatchObject(
      {
        kind: "found",
        account: { id: account.accountId, email: "Ana.New@Example.md" },
      },
    );
    expect(await accounts.findByNormalForm("ana@example.md")).toEqual({
      kind: "none",
    });
    expect(tokenState(token)).toEqual({ isUsed: true });
    expect(await isLive(session)).toBe(false);
  });

  it("keeps the password hash, the verification and the role: only the address changes", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");

    await confirmChange(token);

    const found = await accounts.findById(account.accountId);
    expect(found.kind === "found" ? found.account : undefined).toMatchObject({
      passwordHash: account.passwordHash,
      isEmailVerified: true,
      role: "client",
      locale: "ro",
    });
  });

  it("works once: the same link answers invalid the second time", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");

    const outcomes = [await confirmChange(token), await confirmChange(token)];

    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      "changed",
      "invalid",
    ]);
  });

  it("retires every other unused token of the account, so a link mailed to the old address cannot outlive it", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const reset = await issueReset(account, "to-old-address");
    advanceClock();
    const token = await issueEmailChange(account, "new@example.md", "one");

    await confirmChange(token);

    expect(tokenState(reset)).toEqual({ isUsed: true });
  });

  describe("invalid, with one outcome, for", () => {
    it("an unknown token", async () => {
      expect(await confirmChange(sha256Of("never-issued"))).toEqual({
        kind: "invalid",
      });
    });

    it("an expired token, at the expiry instant itself", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const token = await issueEmailChange(
        account,
        "new@example.md",
        "one",
        60_000,
      );
      advanceClock(59_999);
      expect(
        (
          await accounts.findByLiveToken({
            tokenHash: token,
            purpose: "email-change",
          })
        ).kind,
      ).toBe("found");
      advanceClock(1);

      expect(await confirmChange(token)).toEqual({
        kind: "invalid",
      });
    });

    it("a superseded token, while the newer one is good", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const older = await issueEmailChange(
        account,
        "older@example.md",
        "older",
      );
      advanceClock();
      const newer = await issueEmailChange(
        account,
        "newer@example.md",
        "newer",
      );

      expect(await confirmChange(older)).toEqual({
        kind: "invalid",
      });
      expect((await confirmChange(newer)).kind).toBe("changed");
    });

    it("a token issued before the account's last password change", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const token = await issueEmailChange(account, "new@example.md", "one");
      advanceClock();
      await accounts.changePassword({
        accountId: account.accountId,
        expectedPasswordHash: account.passwordHash,
        passwordHash: passwordHashOf("second"),
      });

      expect(await confirmChange(token)).toEqual({
        kind: "invalid",
      });
      expect(await accounts.findByNormalForm("new@example.md")).toEqual({
        kind: "none",
      });
    });

    it("a token stamped before the account's last password change, even though nothing retired it", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const changedAt = accounts.passwordChangedAtOf(account.accountId);
      currentTime = new Date((changedAt?.getTime() ?? 0) - 60_000);
      const token = await issueEmailChange(account, "new@example.md", "one");
      currentTime = new Date((changedAt?.getTime() ?? 0) + 60_000);

      expect(
        (
          await accounts.findByLiveToken({
            tokenHash: token,
            purpose: "email-change",
          })
        ).kind,
      ).toBe("found");
      expect(await confirmChange(token)).toEqual({
        kind: "invalid",
      });
      expect(tokenState(token)).toEqual({ isUsed: false });
    });

    it("a token of another purpose", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const reset = await issueReset(account, "one");

      expect(await confirmChange(reset)).toEqual({
        kind: "invalid",
      });
      expect(tokenState(reset)).toEqual({ isUsed: false });
    });
  });

  describe("a new address another account now holds is invalid, writes nothing and leaves the token whole", () => {
    it.each([
      ["a verified account", true],
      ["an unverified account", false],
    ])("held by %s", async (_label, isHolderVerified) => {
      const account = await registerVerified("ana@example.md", "first");
      const session = await startSession(account, "device");
      const token = await issueEmailChange(account, "taken@example.md", "one");
      await (isHolderVerified ? registerVerified : register)(
        "TAKEN@example.md",
        "holder",
      );

      const outcome = await confirmChange(token);

      expect(outcome).toEqual({ kind: "invalid" });
      expect(tokenState(token)).toEqual({ isUsed: false });
      expect(await isLive(session)).toBe(true);
      expect((await accounts.findByNormalForm("ana@example.md")).kind).toBe(
        "found",
      );
    });

    it("compares by the normal form, so a different case is the same address", async () => {
      const account = await registerVerified("ana@example.md", "first");
      const token = await issueEmailChange(account, "Taken@Example.md", "one");
      await register("taken@example.md", "holder");

      expect(await confirmChange(token)).toEqual({
        kind: "invalid",
      });
    });
  });

  it("accepts a new address that is the account's own, in another case: the account does not hold it against itself", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "ANA@example.md", "one");

    expect((await confirmChange(token)).kind).toBe("changed");
  });

  it("refuses an account that is not verified", async () => {
    const account = await register("ana@example.md", "first");

    const issued = await accounts.issueEmailChangeToken({
      accountId: account.accountId,
      verifiedPasswordHash: account.passwordHash,
      newEmail: "new@example.md",
      newEmailNormalForm: "new@example.md",
      tokenHash: sha256Of("unverified"),
      expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
    });

    expect(issued).toEqual({ kind: "refused" });
  });
});

describe("FakeAccountStore: the undo link written by confirmEmailChange (ADR 0172 Amendment H)", () => {
  function revertRows() {
    return accounts
      .heldTokens()
      .filter((held) => held.purpose === "email-change-revert");
  }

  async function confirmedChange(
    account: Registered,
    newEmail: string,
    seed: string,
  ): Promise<string> {
    const token = await issueEmailChange(account, newEmail, seed);
    expect((await confirmChange(token)).kind).toBe("changed");
    advanceClock();
    return token;
  }

  it("writes exactly one row holding the address being left, the caller's hash and the caller's expiry", async () => {
    const account = await registerVerified("Ana@Example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");
    const confirmedAt = new Date(currentTime);

    await confirmChange(token);

    expect(revertRows()).toEqual([
      {
        tokenHash: revertHashOf(token),
        accountId: account.accountId,
        purpose: "email-change-revert",
        issuedAt: confirmedAt,
        expiresAt: new Date(confirmedAt.getTime() + REVERT_LIFETIME_MS),
        newEmail: "Ana@Example.md",
        newEmailNormalForm: "ana@example.md",
        usedAt: undefined,
      },
    ]);
  });

  it.each([
    ["an unknown token", () => sha256Of("never-issued")],
    ["a token of another purpose", async (a: Registered) => issueReset(a, "r")],
  ])("%s writes no row", async (_label, tokenFor) => {
    const account = await registerVerified("ana@example.md", "first");

    const outcome = await confirmChange(await tokenFor(account));

    expect(outcome).toEqual({ kind: "invalid" });
    expect(revertRows()).toEqual([]);
  });

  it("a link clicked again writes no second row and leaves the account's address unreserved", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");
    await confirmChange(token);

    const again = await confirmChange(token);

    expect(again).toEqual({ kind: "invalid" });
    expect(revertRows().map((row) => row.tokenHash)).toEqual([
      revertHashOf(token),
    ]);
  });

  it("a new address another account holds writes no row", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "taken@example.md", "one");
    await register("taken@example.md", "holder");

    expect(await confirmChange(token)).toEqual({ kind: "invalid" });
    expect(revertRows()).toEqual([]);
  });

  it("a token issued before the last password change writes no row", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");
    advanceClock();
    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: passwordHashOf("second"),
    });

    expect(await confirmChange(token)).toEqual({ kind: "invalid" });
    expect(revertRows()).toEqual([]);
  });

  it("refuses a malformed revert hash or expiry before touching anything", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");

    await expect(
      accounts.confirmEmailChange({
        tokenHash: token,
        revertTokenHash: "short",
        revertExpiresAt: new Date(currentTime),
      }),
    ).rejects.toThrow(/revert token hash/);
    await expect(
      accounts.confirmEmailChange({
        tokenHash: token,
        revertTokenHash: revertHashOf(token),
        revertExpiresAt: new Date(Number.NaN),
      }),
    ).rejects.toThrow(/revert expiry/);
    expect(tokenState(token)).toEqual({ isUsed: false });
  });

  it("a revert hash that is already held changes nothing, the token whole", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");

    await expect(
      accounts.confirmEmailChange({
        tokenHash: token,
        revertTokenHash: token,
        revertExpiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
      }),
    ).rejects.toThrow(/already held/);

    expect(tokenState(token)).toEqual({ isUsed: false });
    expect((await accounts.findByNormalForm("ana@example.md")).kind).toBe(
      "found",
    );
  });

  describe("an earlier undo link stays unused through", () => {
    async function accountWithEarlierRevert() {
      const account = await registerVerified("ana@example.md", "first");
      const firstToken = await confirmedChange(
        account,
        "second@example.md",
        "one",
      );
      return { account, earlier: revertHashOf(firstToken) };
    }

    function isUnused(tokenHash: string): boolean {
      return tokenState(tokenHash)?.isUsed === false;
    }

    it("a second confirmed change, which retires every other token", async () => {
      const { account, earlier } = await accountWithEarlierRevert();
      const reset = await issueReset(account, "pending");

      const secondToken = await confirmedChange(
        account,
        "third@example.md",
        "two",
      );

      expect(isUnused(earlier)).toBe(true);
      expect(isUnused(revertHashOf(secondToken))).toBe(true);
      expect(tokenState(reset)).toEqual({ isUsed: true });
    });

    it("a signed-in password change, which retires every other token", async () => {
      const { account, earlier } = await accountWithEarlierRevert();
      const pending = await issueEmailChange(
        account,
        "pending@example.md",
        "p",
      );

      await accounts.changePassword({
        accountId: account.accountId,
        expectedPasswordHash: account.passwordHash,
        passwordHash: passwordHashOf("second"),
      });

      expect(isUnused(earlier)).toBe(true);
      expect(tokenState(pending)).toEqual({ isUsed: true });
    });

    it("a completed reset, which retires every other token", async () => {
      const { account, earlier } = await accountWithEarlierRevert();
      const pending = await issueEmailChange(
        account,
        "pending@example.md",
        "p",
      );
      advanceClock();
      const reset = await issueReset(account, "now");

      await accounts.completeReset({
        tokenHash: reset,
        passwordHash: passwordHashOf("after-reset"),
      });

      expect(isUnused(earlier)).toBe(true);
      expect(tokenState(pending)).toEqual({ isUsed: true });
    });

    it("retireEmailChangeTokens, which names the email-change purpose alone", async () => {
      const { account, earlier } = await accountWithEarlierRevert();

      await accounts.retireEmailChangeTokens(account.accountId);

      expect(isUnused(earlier)).toBe(true);
    });
  });

  it("is not a plain token: issueToken refuses the purpose, and writes nothing", async () => {
    const account = await registerVerified("ana@example.md", "first");

    await expect(
      accounts.issueToken({
        accountId: account.accountId,
        purpose: "email-change-revert" as never,
        tokenHash: sha256Of("forged"),
        expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
      }),
    ).rejects.toThrow(/purpose/);
    expect(revertRows()).toEqual([]);
  });

  it("is not asked by findByLiveToken, whose newest-token rule an earlier undo link would fail", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");
    await confirmChange(token);

    await expect(
      accounts.findByLiveToken({
        tokenHash: revertHashOf(token),
        purpose: "email-change-revert" as never,
      }),
    ).rejects.toThrow(/purpose/);
  });
});

describe("FakeAccountStore.issueEmailChangeToken", () => {
  it("is bound to the hash the caller verified: a password changed since issues nothing", async () => {
    const account = await registerVerified("ana@example.md", "first");
    await accounts.changePassword({
      accountId: account.accountId,
      expectedPasswordHash: account.passwordHash,
      passwordHash: passwordHashOf("second"),
    });

    const issued = await accounts.issueEmailChangeToken({
      accountId: account.accountId,
      verifiedPasswordHash: account.passwordHash,
      newEmail: "new@example.md",
      newEmailNormalForm: "new@example.md",
      tokenHash: sha256Of("stale-verification"),
      expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
    });

    expect(issued).toEqual({ kind: "refused" });
    expect(accounts.heldTokens()).toHaveLength(1);
  });

  it("holds the new address on the row and the link carries only the token", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "New@Example.md", "one");

    const held = accounts
      .heldTokens()
      .find((candidate) => candidate.tokenHash === token);

    expect(held).toMatchObject({
      purpose: "email-change",
      newEmail: "New@Example.md",
      newEmailNormalForm: "new@example.md",
    });
  });

  it("repeating the same token for the same account answers issued, and for another account refused", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const other = await registerVerified("bob@example.md", "other");
    const token = await issueEmailChange(account, "new@example.md", "one");

    const repeat = await accounts.issueEmailChangeToken({
      accountId: account.accountId,
      verifiedPasswordHash: account.passwordHash,
      newEmail: "new@example.md",
      newEmailNormalForm: "new@example.md",
      tokenHash: token,
      expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
    });
    const stolen = await accounts.issueEmailChangeToken({
      accountId: other.accountId,
      verifiedPasswordHash: other.passwordHash,
      newEmail: "else@example.md",
      newEmailNormalForm: "else@example.md",
      tokenHash: token,
      expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
    });

    expect([repeat, stolen]).toEqual([{ kind: "issued" }, { kind: "refused" }]);
  });

  it("cannot be reached through issueToken: a token that carries no address may not have the e-mail-change purpose", async () => {
    const account = await registerVerified("ana@example.md", "first");

    await expect(
      accounts.issueToken({
        accountId: account.accountId,
        purpose: "email-change" as "verify-email",
        tokenHash: sha256Of("no-address"),
        expiresAt: new Date(currentTime.getTime() + ONE_DAY_MS),
      }),
    ).rejects.toThrow(/Refusing to issue an e-mail token/);
  });

  it("is a read that uses nothing up: findByLiveToken names the account and leaves the token unused", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "new@example.md", "one");

    const lookup = await accounts.findByLiveToken({
      tokenHash: token,
      purpose: "email-change",
    });

    expect(lookup.kind === "found" ? lookup.account.id : undefined).toBe(
      account.accountId,
    );
    expect(tokenState(token)).toEqual({ isUsed: false });
  });
});

describe("FakeAccountStore.retireEmailChangeTokens", () => {
  it("marks every unused e-mail-change token of the account used, and no token of another purpose or account", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const bystander = await registerVerified("bob@example.md", "other");
    const first = await issueEmailChange(account, "one@example.md", "one");
    advanceClock();
    const second = await issueEmailChange(account, "two@example.md", "two");
    const reset = await issueReset(account, "kept");
    const bystanderToken = await issueEmailChange(
      bystander,
      "bob2@example.md",
      "bystander",
    );

    await accounts.retireEmailChangeTokens(account.accountId);

    expect(
      [first, second, reset, bystanderToken].map(
        (hash) => tokenState(hash)?.isUsed,
      ),
    ).toEqual([true, true, false, false]);
  });

  it("is idempotent and keeps the first instant a token was retired", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const token = await issueEmailChange(account, "one@example.md", "one");
    await accounts.retireEmailChangeTokens(account.accountId);
    const firstUse = accounts
      .heldTokens()
      .find((held) => held.tokenHash === token)?.usedAt;
    advanceClock(60_000);

    await accounts.retireEmailChangeTokens(account.accountId);

    expect(
      accounts.heldTokens().find((held) => held.tokenHash === token)?.usedAt,
    ).toEqual(firstUse);
  });

  it("refuses an account id of the wrong shape", async () => {
    await expect(accounts.retireEmailChangeTokens("x")).rejects.toThrow(
      /account id/,
    );
  });
});

describe("FakeAccountStore.completeReset retires every unused token and ends every session (O23)", () => {
  it("retires a pending e-mail-change token along with the reset's own, so a reset cannot leave an address change armed", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const emailChange = await issueEmailChange(
      account,
      "new@example.md",
      "one",
    );
    const reset = await issueReset(account, "one");
    const session = await startSession(account, "device");

    const outcome = await accounts.completeReset({
      tokenHash: reset,
      passwordHash: passwordHashOf("after-reset"),
    });

    expect(outcome).toEqual({ kind: "password-changed" });
    expect(tokenState(emailChange)).toEqual({ isUsed: true });
    expect(tokenState(reset)).toEqual({ isUsed: true });
    expect(await isLive(session)).toBe(false);
    expect(await confirmChange(emailChange)).toEqual({ kind: "invalid" });
  });
});

describe("FakeAccountStore.updateProfile and findProfile", () => {
  async function profileOf(accountId: string) {
    const lookup = await accounts.findProfile(accountId);
    return lookup.kind === "found" ? lookup.profile : undefined;
  }

  it("starts with nothing given", async () => {
    const account = await register("ana@example.md", "first");

    expect(await profileOf(account.accountId)).toEqual({
      name: null,
      address: null,
      phone: null,
    });
  });

  it("writes only the fields the changes name; an absent field is left as it is", async () => {
    const account = await register("ana@example.md", "first");
    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { name: "Ana", address: "Orhei" },
    });

    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { name: "Ana Maria" },
    });

    expect(await profileOf(account.accountId)).toEqual({
      name: "Ana Maria",
      address: "Orhei",
      phone: null,
    });
  });

  it("leaves the name and the phone alone when only the address is named", async () => {
    const account = await register("ana@example.md", "first");
    await accounts.updateProfile({
      accountId: account.accountId,
      changes: {
        name: "Ana",
        phone: { phone: "079 123 456", phoneNormalForm: "+37379123456" },
      },
    });

    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { address: "Orhei" },
    });

    expect(await profileOf(account.accountId)).toEqual({
      name: "Ana",
      address: "Orhei",
      phone: "079 123 456",
    });
  });

  it("stores an empty text as null, which is how a field is cleared", async () => {
    const account = await register("ana@example.md", "first");
    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { name: "Ana", address: "Orhei" },
    });

    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { name: "", address: "" },
    });

    expect(await profileOf(account.accountId)).toEqual({
      name: null,
      address: null,
      phone: null,
    });
  });

  it("sets and clears the phone pair together", async () => {
    const account = await register("ana@example.md", "first");

    await accounts.updateProfile({
      accountId: account.accountId,
      changes: {
        phone: { phone: "079 123 456", phoneNormalForm: "+37379123456" },
      },
    });
    expect((await profileOf(account.accountId))?.phone).toBe("079 123 456");

    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { phone: { phone: null, phoneNormalForm: null } },
    });
    expect((await profileOf(account.accountId))?.phone).toBeNull();
  });

  it("refuses half a phone pair, and a name or address past the table's bound, and writes nothing", async () => {
    const account = await register("ana@example.md", "first");

    await expect(
      accounts.updateProfile({
        accountId: account.accountId,
        changes: { phone: { phone: "079 123 456", phoneNormalForm: null } },
      }),
    ).rejects.toThrow(/phone/);
    await expect(
      accounts.updateProfile({
        accountId: account.accountId,
        changes: { name: "n".repeat(121) },
      }),
    ).rejects.toThrow(/name/);
    await expect(
      accounts.updateProfile({
        accountId: account.accountId,
        changes: { address: "a".repeat(201) },
      }),
    ).rejects.toThrow(/address/);

    expect(await profileOf(account.accountId)).toEqual({
      name: null,
      address: null,
      phone: null,
    });
  });

  it("answers none for an account that does not exist", async () => {
    expect(
      await accounts.updateProfile({
        accountId: "N".repeat(21),
        changes: { name: "Ana" },
      }),
    ).toEqual({ kind: "none" });
    expect(await accounts.findProfile("N".repeat(21))).toEqual({
      kind: "none",
    });
  });

  it("changes nothing of the sign-in: the address, the hash, the verification and the role", async () => {
    const account = await registerVerified("ana@example.md", "first");
    const before = await accounts.findById(account.accountId);

    await accounts.updateProfile({
      accountId: account.accountId,
      changes: { name: "Ana", address: "Orhei" },
    });

    expect(await accounts.findById(account.accountId)).toEqual(before);
  });
});
