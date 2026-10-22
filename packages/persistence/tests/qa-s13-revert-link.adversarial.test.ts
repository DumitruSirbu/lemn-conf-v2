import { createHash } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { NewAccount } from "../src/account-store.js";
import type { FakeAccountStore } from "../src/fake-account-store.js";
import { createFakeAccountAndSessionStores } from "../src/fake-session-store.js";
import type { FakeSessionStore } from "../src/fake-session-store.js";

/**
 * Plan 14.3.7 R-5 (a revert link survives anything the account does) and R-6 (oldest wins), as properties over random
 * action sequences instead of a fixed sweep, plus the counterexamples that a sweep would miss: the exact expiry
 * instant, another account's link, and every takeover of the address a live link reserves.
 *
 * Each property run builds a world of its own: a run that reused one would register its first address twice.
 */
const START = new Date("2026-10-19T09:00:00.000Z");
const ONE_SECOND_MS = 1_000;
const ONE_HOUR_MS = 3_600_000;
const REVERT_LIFETIME_MS = 24 * ONE_HOUR_MS;
const IDLE_LIFETIMES = {
  client: ONE_HOUR_MS,
  operator: ONE_HOUR_MS,
  administrator: ONE_HOUR_MS,
};
const HOME_ADDRESS = "home@example.md";

function sha256Of(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

/** An argon2id PHC string of the shape the store checks, distinct for each serial. */
function passwordHashOf(serial: number): string {
  const filler = (length: number) =>
    `S${String(serial)}`.padEnd(length, "A").slice(0, length);
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

interface UndoLink {
  readonly hash: string;
  /** The address the link restores. */
  readonly address: string;
  readonly expiresAtMs: number;
  isUsed: boolean;
}

/**
 * A fresh database (accounts and sessions joined as the database joins them), one verified account at
 * `HOME_ADDRESS`, and a model of the undo links its address changes wrote.
 */
class Lab {
  clockMs = START.getTime();
  readonly accounts: FakeAccountStore;
  readonly sessions: FakeSessionStore;
  readonly links: UndoLink[] = [];
  accountId = "";
  address = HOME_ADDRESS;
  passwordHash = passwordHashOf(0);
  private serial = 1;

  constructor() {
    ({ accounts: this.accounts, sessions: this.sessions } =
      createFakeAccountAndSessionStores(() => new Date(this.clockMs)));
  }

  static async withVerifiedAccount(): Promise<Lab> {
    const lab = new Lab();
    await lab.seedVerifiedAccount();
    return lab;
  }

  /** Every step moves the clock on, so two rows are never issued in one tick (the fake orders a tie by hash). */
  tick(milliseconds = ONE_SECOND_MS): void {
    this.clockMs += milliseconds;
  }

  nextSerial(): number {
    this.serial += 1;
    return this.serial;
  }

  nowPlus(milliseconds: number): Date {
    return new Date(this.clockMs + milliseconds);
  }

  async seedVerifiedAccount(): Promise<void> {
    const created = await this.accounts.createUnverified(
      newAccount(HOME_ADDRESS, this.passwordHash),
    );
    if (created.kind !== "created") throw new Error("the seed was refused");
    this.accountId = created.accountId;
    const verifyHash = sha256Of("verify-seed");
    await this.accounts.issueToken({
      accountId: this.accountId,
      purpose: "verify-email",
      tokenHash: verifyHash,
      expiresAt: this.nowPlus(REVERT_LIFETIME_MS),
    });
    const confirmed = await this.accounts.confirmEmail({
      tokenHash: verifyHash,
      accountId: this.accountId,
      verifiedPasswordHash: this.passwordHash,
    });
    expect(confirmed.kind).toBe("confirmed");
    this.tick();
  }

  /** E8 then E9 to `target`; the undo link it wrote is recorded in the model. */
  async changeAddressTo(target: string): Promise<UndoLink> {
    const serial = this.nextSerial();
    const changeHash = sha256Of(`change-${String(serial)}`);
    const issued = await this.accounts.issueEmailChangeToken({
      accountId: this.accountId,
      verifiedPasswordHash: this.passwordHash,
      newEmail: target,
      newEmailNormalForm: target.toLowerCase(),
      tokenHash: changeHash,
      expiresAt: this.nowPlus(ONE_HOUR_MS),
    });
    expect(issued.kind).toBe("issued");
    const link: UndoLink = {
      hash: sha256Of(`undo-${String(serial)}`),
      address: this.address,
      expiresAtMs: this.clockMs + REVERT_LIFETIME_MS,
      isUsed: false,
    };
    const outcome = await this.accounts.confirmEmailChange({
      tokenHash: changeHash,
      revertTokenHash: link.hash,
      revertExpiresAt: new Date(link.expiresAtMs),
    });
    expect(outcome.kind).toBe("changed");
    this.links.push(link);
    this.address = target;
    this.tick();
    return link;
  }

  /** Uses the link with a new password; a revert that took effect moves the model's address and hash with it. */
  async revert(link: UndoLink | string) {
    const tokenHash = typeof link === "string" ? link : link.hash;
    const passwordHash = passwordHashOf(this.nextSerial());
    const outcome = await this.accounts.revertEmailChange({
      tokenHash,
      passwordHash,
    });
    if (outcome.kind === "reverted") {
      this.address = outcome.email;
      this.passwordHash = passwordHash;
    }
    return outcome;
  }

  async currentAddress(): Promise<string | undefined> {
    const found = await this.accounts.findById(this.accountId);
    return found.kind === "found" ? found.account.email : undefined;
  }

  isLiveInModel(link: UndoLink): boolean {
    return !link.isUsed && link.expiresAtMs > this.clockMs;
  }

  async startSession(): Promise<string> {
    const tokenHash = sha256Of(`session-${String(this.nextSerial())}`);
    const created = await this.sessions.create({
      tokenHash,
      accountId: this.accountId,
      expectedPasswordHash: this.passwordHash,
      absoluteExpiresAt: this.nowPlus(30 * REVERT_LIFETIME_MS),
    });
    expect(created.kind).toBe("created");
    return tokenHash;
  }

  async isSessionLive(tokenHash: string): Promise<boolean> {
    const lookup = await this.sessions.findLive({
      tokenHash,
      idleLifetimeSeconds: IDLE_LIFETIMES,
    });
    return lookup.kind === "live";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// R-5: survival

type HolderAction =
  | { readonly kind: "change-password" }
  | { readonly kind: "reset-completion" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "logout-everywhere" }
  | { readonly kind: "request-change" }
  | { readonly kind: "retire-change-tokens" }
  | { readonly kind: "confirm-change"; readonly returnsHome: boolean }
  | { readonly kind: "profile-edit" }
  | { readonly kind: "export" }
  | { readonly kind: "verify-again" }
  | { readonly kind: "wait"; readonly milliseconds: number };

const holderActionArbitrary: fc.Arbitrary<HolderAction> = fc.oneof(
  fc.constant({ kind: "change-password" } as const),
  fc.constant({ kind: "reset-completion" } as const),
  fc.constant({ kind: "sign-in" } as const),
  fc.constant({ kind: "logout-everywhere" } as const),
  fc.constant({ kind: "request-change" } as const),
  fc.constant({ kind: "retire-change-tokens" } as const),
  fc.record({
    kind: fc.constant("confirm-change" as const),
    returnsHome: fc.boolean(),
  }),
  fc.constant({ kind: "profile-edit" } as const),
  fc.constant({ kind: "export" } as const),
  fc.constant({ kind: "verify-again" } as const),
  fc.record({
    kind: fc.constant("wait" as const),
    // up to 9 hours: a sequence of eight can pass the 24-hour expiry, which the oracle accounts for
    milliseconds: fc.integer({ min: 1, max: 9 * ONE_HOUR_MS }),
  }),
);

async function applyHolderAction(
  lab: Lab,
  action: HolderAction,
): Promise<void> {
  const serial = lab.nextSerial();
  switch (action.kind) {
    case "change-password": {
      const next = passwordHashOf(serial);
      const outcome = await lab.accounts.changePassword({
        accountId: lab.accountId,
        expectedPasswordHash: lab.passwordHash,
        passwordHash: next,
      });
      expect(outcome.kind).toBe("changed");
      lab.passwordHash = next;
      break;
    }
    case "reset-completion": {
      const tokenHash = sha256Of(`reset-${String(serial)}`);
      await lab.accounts.issueToken({
        accountId: lab.accountId,
        purpose: "reset-password",
        tokenHash,
        expiresAt: lab.nowPlus(ONE_HOUR_MS),
      });
      lab.tick();
      const next = passwordHashOf(serial);
      const outcome = await lab.accounts.completeReset({
        tokenHash,
        passwordHash: next,
      });
      expect(outcome.kind).toBe("password-changed");
      lab.passwordHash = next;
      break;
    }
    case "sign-in":
      await lab.startSession();
      break;
    case "logout-everywhere":
      await lab.sessions.revokeAllForAccount(lab.accountId);
      break;
    case "request-change":
      await lab.accounts.issueEmailChangeToken({
        accountId: lab.accountId,
        verifiedPasswordHash: lab.passwordHash,
        newEmail: `pending-${String(serial)}@example.md`,
        newEmailNormalForm: `pending-${String(serial)}@example.md`,
        tokenHash: sha256Of(`pending-${String(serial)}`),
        expiresAt: lab.nowPlus(ONE_HOUR_MS),
      });
      break;
    case "retire-change-tokens":
      await lab.accounts.retireEmailChangeTokens(lab.accountId);
      break;
    case "confirm-change": {
      const goesHome = action.returnsHome && lab.address !== HOME_ADDRESS;
      await lab.changeAddressTo(
        goesHome ? HOME_ADDRESS : `moved-${String(serial)}@example.md`,
      );
      break;
    }
    case "profile-edit":
      await lab.accounts.updateProfile({
        accountId: lab.accountId,
        changes: { name: `Name ${String(serial)}` },
      });
      break;
    case "export":
      await lab.accounts.findProfile(lab.accountId);
      await lab.accounts.findById(lab.accountId);
      break;
    case "verify-again": {
      const tokenHash = sha256Of(`verify-${String(serial)}`);
      await lab.accounts.issueToken({
        accountId: lab.accountId,
        purpose: "verify-email",
        tokenHash,
        expiresAt: lab.nowPlus(ONE_HOUR_MS),
      });
      break;
    }
    case "wait":
      lab.tick(action.milliseconds);
      break;
  }
  lab.tick();
}

describe("R-5: an undo link survives any sequence of the account's own later actions", () => {
  it("is still unused and unexpired-or-expired exactly by the clock, and a revert restores the first address (500 random sequences)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(holderActionArbitrary, { minLength: 0, maxLength: 8 }),
        async (actions) => {
          const lab = await Lab.withVerifiedAccount();
          const first = await lab.changeAddressTo("away@example.md");

          for (const action of actions) {
            await applyHolderAction(lab, action);
            // nothing but a revert uses a link up: every row of the purpose is unused after every action
            for (const link of lab.links) {
              const row = lab.accounts
                .heldTokens()
                .find(({ tokenHash }) => tokenHash === link.hash);
              expect(row?.usedAt).toBeUndefined();
            }
          }

          const outcome = await lab.revert(first);
          if (first.expiresAtMs > lab.clockMs) {
            expect(outcome.kind).toBe("reverted");
            expect(await lab.currentAddress()).toBe(HOME_ADDRESS);
            const lookup = await lab.accounts.findByNormalForm(HOME_ADDRESS);
            expect(lookup.kind).toBe("found");
          } else {
            expect(outcome).toEqual({ kind: "invalid" });
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("survives a password change made by whoever moved the account, and the revert then ends their sessions", async () => {
    const lab = await Lab.withVerifiedAccount();
    const first = await lab.changeAddressTo("away@example.md");
    await applyHolderAction(lab, { kind: "change-password" });
    const intruderSession = await lab.startSession();

    const outcome = await lab.revert(first);

    expect(outcome.kind).toBe("reverted");
    expect(await lab.isSessionLive(intruderSession)).toBe(false);
  });

  it("survives a reset completion whose token was issued after the confirm", async () => {
    const lab = await Lab.withVerifiedAccount();
    const first = await lab.changeAddressTo("away@example.md");
    await applyHolderAction(lab, { kind: "reset-completion" });

    expect((await lab.revert(first)).kind).toBe("reverted");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R-6: oldest wins

type ChainAction =
  | { readonly kind: "confirm"; readonly toHome: boolean }
  | { readonly kind: "revert"; readonly pick: number }
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "request-change" };

const chainActionArbitrary: fc.Arbitrary<ChainAction> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("confirm" as const),
      toHome: fc.boolean(),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("revert" as const),
      pick: fc.nat(1000),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("wait" as const),
      milliseconds: fc.integer({ min: 1, max: 14 * ONE_HOUR_MS }),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: "request-change" } as const) },
);

async function expectEveryLinkToMatchTheModel(lab: Lab): Promise<void> {
  for (const [index, link] of lab.links.entries()) {
    const found = await lab.accounts.findRevertAddress(link.hash);
    const expected = lab.isLiveInModel(link)
      ? { kind: "found", accountId: lab.accountId, email: link.address }
      : { kind: "none" };
    expect([index, found]).toEqual([index, expected]);
  }
}

async function applyChainAction(lab: Lab, action: ChainAction): Promise<void> {
  const serial = lab.nextSerial();
  if (action.kind === "confirm") {
    const goesHome = action.toHome && lab.address !== HOME_ADDRESS;
    await lab.changeAddressTo(
      goesHome ? HOME_ADDRESS : `hop-${String(serial)}@example.md`,
    );
  } else if (action.kind === "wait") {
    lab.tick(action.milliseconds);
  } else if (action.kind === "request-change") {
    await lab.accounts.issueEmailChangeToken({
      accountId: lab.accountId,
      verifiedPasswordHash: lab.passwordHash,
      newEmail: `pending-${String(serial)}@example.md`,
      newEmailNormalForm: `pending-${String(serial)}@example.md`,
      tokenHash: sha256Of(`pending-${String(serial)}`),
      expiresAt: lab.nowPlus(ONE_HOUR_MS),
    });
  } else {
    await applyRevertPick(lab, action.pick);
  }
  lab.tick();
}

async function applyRevertPick(lab: Lab, pick: number): Promise<void> {
  if (lab.links.length === 0) return;
  const index = pick % lab.links.length;
  const link = lab.links[index];
  if (link === undefined) return;
  const wasLive = lab.isLiveInModel(link);
  const outcome = await lab.revert(link);
  expect([index, outcome.kind]).toEqual([
    index,
    wasLive ? "reverted" : "invalid",
  ]);
  if (!wasLive) return;
  expect(await lab.currentAddress()).toBe(link.address);
  for (const later of lab.links.slice(index)) later.isUsed = true;
}

describe("R-6: the oldest wins, as a random interleaving of changes, reverts, waits and requests", () => {
  it("never retires a link created before the one used, retires every later one, and refuses exactly the dead (500 random chains)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(chainActionArbitrary, { minLength: 1, maxLength: 14 }),
        async (actions) => {
          const lab = await Lab.withVerifiedAccount();
          await lab.changeAddressTo("away@example.md");

          for (const action of actions) {
            await applyChainAction(lab, action);
            await expectEveryLinkToMatchTheModel(lab);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("keeps the first link usable through a chain of any length when the later ones are used newest first", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (length) => {
        const lab = await Lab.withVerifiedAccount();
        const links: UndoLink[] = [];
        for (let hop = 1; hop <= length; hop += 1) {
          links.push(
            await lab.changeAddressTo(`hop-${String(hop)}@example.md`),
          );
        }

        for (const link of [...links].reverse().slice(0, -1)) {
          expect((await lab.revert(link)).kind).toBe("reverted");
          lab.tick();
        }

        const [first] = links;
        expect((await lab.revert(first ?? "")).kind).toBe("reverted");
        expect(await lab.currentAddress()).toBe(HOME_ADDRESS);
      }),
      { numRuns: 60 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The instant, the other account, the takeovers

describe("the expiry instant", () => {
  it("lives to the last millisecond before the stored expiry and is dead at it: the link and the reservation end together", async () => {
    const lab = await Lab.withVerifiedAccount();
    const link = await lab.changeAddressTo("away@example.md");
    const untilExpiry = link.expiresAtMs - lab.clockMs;
    const stranger = newAccount(HOME_ADDRESS, passwordHashOf(900));

    lab.tick(untilExpiry - 1);
    expect(await lab.accounts.findRevertAddress(link.hash)).toMatchObject({
      kind: "found",
    });
    expect(await lab.accounts.createUnverified(stranger)).toEqual({
      kind: "address-reserved",
    });
    lab.tick(1);

    expect(await lab.accounts.findRevertAddress(link.hash)).toEqual({
      kind: "none",
    });
    expect(await lab.revert(link)).toEqual({ kind: "invalid" });
    expect(await lab.currentAddress()).toBe("away@example.md");
    expect((await lab.accounts.createUnverified(stranger)).kind).toBe(
      "created",
    );
  });

  it("is usable at the last millisecond: the revert itself succeeds there", async () => {
    const lab = await Lab.withVerifiedAccount();
    const link = await lab.changeAddressTo("away@example.md");
    lab.tick(link.expiresAtMs - lab.clockMs - 1);

    expect((await lab.revert(link)).kind).toBe("reverted");
  });
});

describe("a link of one account never touches another", () => {
  it("using P's link leaves Q's address, password, sessions and own link whole", async () => {
    const p = await Lab.withVerifiedAccount();
    const pLink = await p.changeAddressTo("p-away@example.md");
    const qEmail = "q@example.md";
    const qHash = passwordHashOf(777);
    const created = await p.accounts.createUnverified(
      newAccount(qEmail, qHash),
    );
    if (created.kind !== "created") throw new Error("Q was refused");
    const verifyHash = sha256Of("verify-q");
    await p.accounts.issueToken({
      accountId: created.accountId,
      purpose: "verify-email",
      tokenHash: verifyHash,
      expiresAt: p.nowPlus(ONE_HOUR_MS),
    });
    await p.accounts.confirmEmail({
      tokenHash: verifyHash,
      accountId: created.accountId,
      verifiedPasswordHash: qHash,
    });
    p.tick();
    const qSession = sha256Of("session-q");
    await p.sessions.create({
      tokenHash: qSession,
      accountId: created.accountId,
      expectedPasswordHash: qHash,
      absoluteExpiresAt: p.nowPlus(REVERT_LIFETIME_MS),
    });
    const qChange = sha256Of("change-q");
    await p.accounts.issueEmailChangeToken({
      accountId: created.accountId,
      verifiedPasswordHash: qHash,
      newEmail: "q-moved@example.md",
      newEmailNormalForm: "q-moved@example.md",
      tokenHash: qChange,
      expiresAt: p.nowPlus(ONE_HOUR_MS),
    });
    const qUndo = sha256Of("undo-q");
    p.tick();
    await p.accounts.confirmEmailChange({
      tokenHash: qChange,
      revertTokenHash: qUndo,
      revertExpiresAt: p.nowPlus(REVERT_LIFETIME_MS),
    });
    p.tick();
    const qSessionAfterChange = sha256Of("session-q-2");
    await p.sessions.create({
      tokenHash: qSessionAfterChange,
      accountId: created.accountId,
      expectedPasswordHash: qHash,
      absoluteExpiresAt: p.nowPlus(REVERT_LIFETIME_MS),
    });
    const qPendingReset = sha256Of("reset-q");
    await p.accounts.issueToken({
      accountId: created.accountId,
      purpose: "reset-password",
      tokenHash: qPendingReset,
      expiresAt: p.nowPlus(ONE_HOUR_MS),
    });
    const qPendingChange = sha256Of("pending-change-q");
    await p.accounts.issueEmailChangeToken({
      accountId: created.accountId,
      verifiedPasswordHash: qHash,
      newEmail: "q-pending@example.md",
      newEmailNormalForm: "q-pending@example.md",
      tokenHash: qPendingChange,
      expiresAt: p.nowPlus(ONE_HOUR_MS),
    });
    p.tick();
    const qChangedAt = p.accounts.passwordChangedAtOf(created.accountId);

    expect((await p.revert(pLink)).kind).toBe("reverted");

    const qNow = await p.accounts.findById(created.accountId);
    expect(qNow).toMatchObject({
      kind: "found",
      account: { email: "q-moved@example.md", passwordHash: qHash },
    });
    expect(p.accounts.passwordChangedAtOf(created.accountId)).toEqual(
      qChangedAt,
    );
    expect(await p.isSessionLive(qSessionAfterChange)).toBe(true);
    expect(await p.accounts.findRevertAddress(qUndo)).toMatchObject({
      kind: "found",
      accountId: created.accountId,
      email: qEmail,
    });
    const qRows = p.accounts
      .heldTokens()
      .filter(({ accountId }) => accountId === created.accountId);
    expect(
      qRows
        .filter(({ usedAt }) => usedAt === undefined)
        .map(({ tokenHash }) => tokenHash)
        .sort(),
    ).toEqual([qUndo, qPendingReset, qPendingChange].sort());
  });
});

describe("every reachable takeover of the address a live link restores leaves the link whole", () => {
  it("fails for another account's register, confirm and request, and the revert then succeeds", async () => {
    const lab = await Lab.withVerifiedAccount();
    const link = await lab.changeAddressTo("away@example.md");

    expect(
      await lab.accounts.createUnverified(
        newAccount(HOME_ADDRESS, passwordHashOf(901)),
      ),
    ).toEqual({ kind: "address-reserved" });

    const rival = await lab.accounts.createUnverified(
      newAccount("rival@example.md", passwordHashOf(902)),
    );
    if (rival.kind !== "created") throw new Error("rival refused");
    const rivalVerify = sha256Of("verify-rival");
    await lab.accounts.issueToken({
      accountId: rival.accountId,
      purpose: "verify-email",
      tokenHash: rivalVerify,
      expiresAt: lab.nowPlus(ONE_HOUR_MS),
    });
    await lab.accounts.confirmEmail({
      tokenHash: rivalVerify,
      accountId: rival.accountId,
      verifiedPasswordHash: passwordHashOf(902),
    });
    lab.tick();
    const rivalChange = sha256Of("rival-change");
    const issued = await lab.accounts.issueEmailChangeToken({
      accountId: rival.accountId,
      verifiedPasswordHash: passwordHashOf(902),
      newEmail: HOME_ADDRESS,
      newEmailNormalForm: HOME_ADDRESS,
      tokenHash: rivalChange,
      expiresAt: lab.nowPlus(ONE_HOUR_MS),
    });
    expect(issued.kind).toBe("issued");
    lab.tick();

    const rivalConfirm = await lab.accounts.confirmEmailChange({
      tokenHash: rivalChange,
      revertTokenHash: sha256Of("rival-undo"),
      revertExpiresAt: lab.nowPlus(REVERT_LIFETIME_MS),
    });

    expect(rivalConfirm).toEqual({ kind: "invalid" });
    expect(await lab.accounts.findByNormalForm(HOME_ADDRESS)).toEqual({
      kind: "none",
    });
    expect((await lab.revert(link)).kind).toBe("reverted");
    expect(await lab.currentAddress()).toBe(HOME_ADDRESS);
  });
});
