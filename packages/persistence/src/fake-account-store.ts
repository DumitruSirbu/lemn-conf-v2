import type { Role } from "@lemnaria/configurator-domain";

import { requireAccountIdShape } from "./account-id-shape.js";
import {
  EMAIL_CHANGE_REVERT_PURPOSE,
  profileColumnWritesOf,
  requireValidAddressReservationQuestion,
  requireValidEmailChangeConfirmation,
  requireValidEmailChangeRetirement,
  requireValidEmailChangeRevert,
  requireValidEmailChangeTokenToIssue,
  requireValidEmailConfirmation,
  requireValidLiveTokenLookup,
  requireValidNewAccount,
  requireValidPasswordChange,
  requireValidPasswordRehash,
  requireValidPasswordReset,
  requireValidProfileUpdate,
  requireValidRegistrationReplacement,
  requireValidTokenToIssue,
} from "./account-store.js";
import type {
  AccountCreation,
  AccountLookup,
  AccountStore,
  AddressReservationQuestion,
  EmailChangeConfirmation,
  EmailChangeOutcome,
  EmailChangeRevert,
  EmailChangeRevertOutcome,
  EmailChangeTokenToIssue,
  EmailConfirmation,
  EmailConfirmationOutcome,
  EmailTokenPurpose,
  LiveTokenLookup,
  NewAccount,
  PasswordChange,
  PasswordChangeOutcome,
  PasswordRehash,
  PasswordRehashOutcome,
  PasswordReset,
  PasswordResetOutcome,
  ProfileLookup,
  ProfileUpdate,
  ProfileUpdateOutcome,
  RegistrationReplacement,
  RegistrationReplacementOutcome,
  StoredAccount,
  TokenIssueOutcome,
  TokenToIssue,
} from "./account-store.js";
import { generateAccountId } from "./generate-account-id.js";
import type { SessionAccount } from "./session-store.js";

/** An account as the table holds it. `role` is `client` unless a test sets it: the application role cannot write any
 *  other. */
interface HeldAccount {
  readonly id: string;
  readonly email: string;
  readonly emailNormalForm: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly locale: string;
  readonly privacyNoticeVersion: string;
  readonly phone: NewAccount["phone"];
  readonly name: string | undefined;
  readonly address: string | undefined;
  readonly emailVerifiedAt: Date | undefined;
  readonly passwordChangedAt: Date;
}

/** A token row. `issuedAt` stands for `created_at`. The address pair is set on an `email-change` row (the address to
 *  change to) and on an `email-change-revert` row (the address left). */
export interface HeldEmailToken {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly purpose: EmailTokenPurpose;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly newEmail?: string;
  readonly newEmailNormalForm?: string;
  usedAt: Date | undefined;
}

export interface FakeAccountStoreOptions {
  /** The database's clock. A test passes its own to cross an expiry. */
  readonly now?: () => Date;
  /**
   * What `completeReset`, `changePassword` and `confirmEmailChange` do to the account's sessions. The session store is a separate port, so its fake passes a
   * function that sets `revoked_at` on its own rows; with none, a reset revokes nothing.
   */
  readonly revokeSessionsOf?: (accountId: string, at: Date) => void;
}

/**
 * In-memory `AccountStore` with `NeonAccountStore`'s contract: the same refusals, the same newest-live-token rule
 * (unused, unexpired, no newer unused sibling by issue time, then token hash), the same retirement of siblings on use,
 * and the same atomicity (each method finishes before the next starts). It cannot stand for a retry after a lost
 * acknowledgement, which has no in-memory counterpart.
 */
export class FakeAccountStore implements AccountStore {
  private readonly accountsById = new Map<string, HeldAccount>();
  private readonly tokensByHash = new Map<string, HeldEmailToken>();
  private readonly now: () => Date;
  private readonly revokeSessionsOf: (accountId: string, at: Date) => void;

  constructor({
    now = () => new Date(),
    revokeSessionsOf,
  }: FakeAccountStoreOptions = {}) {
    this.now = now;
    this.revokeSessionsOf = revokeSessionsOf ?? (() => undefined);
  }

  findByNormalForm(emailNormalForm: string): Promise<AccountLookup> {
    return settle(() => lookupOf(this.accountWithNormalForm(emailNormalForm)));
  }

  findById(accountId: string): Promise<AccountLookup> {
    return settle(() => {
      requireAccountIdShape(accountId, "look up an account");
      return lookupOf(this.accountsById.get(accountId));
    });
  }

  findProfile(accountId: string): Promise<ProfileLookup> {
    return settle(() => {
      requireAccountIdShape(accountId, "read a profile");
      const held = this.accountsById.get(accountId);
      if (held === undefined) return { kind: "none" };
      return {
        kind: "found",
        profile: {
          name: held.name ?? null,
          address: held.address ?? null,
          phone: held.phone?.entered ?? null,
        },
      };
    });
  }

  updateProfile(update: ProfileUpdate): Promise<ProfileUpdateOutcome> {
    return settle(() => {
      requireValidProfileUpdate(update);
      const held = this.accountsById.get(update.accountId);
      if (held === undefined) return { kind: "none" };
      const writes = profileColumnWritesOf(update.changes);
      const { phone } = update.changes;
      this.accountsById.set(held.id, {
        ...held,
        name:
          writes.name === undefined ? held.name : (writes.name ?? undefined),
        address:
          writes.address === undefined
            ? held.address
            : (writes.address ?? undefined),
        phone: phone === undefined ? held.phone : heldPhoneOf(phone),
      });
      return { kind: "saved" };
    });
  }

  changePassword(change: PasswordChange): Promise<PasswordChangeOutcome> {
    return settle(() => {
      requireValidPasswordChange(change);
      const held = this.accountsById.get(change.accountId);
      if (held?.passwordHash !== change.expectedPasswordHash) {
        return { kind: "stale" };
      }
      const at = this.now();
      this.accountsById.set(held.id, {
        ...held,
        passwordHash: change.passwordHash,
        passwordChangedAt: at,
      });
      this.revokeSessionsOf(held.id, at);
      this.retireEmailTokensOf(held.id, at);
      return { kind: "changed" };
    });
  }

  findByLiveToken(lookup: LiveTokenLookup): Promise<AccountLookup> {
    return settle(() => {
      requireValidLiveTokenLookup(lookup);
      const token = this.liveToken(lookup.tokenHash, lookup.purpose);
      return lookupOf(token && this.accountsById.get(token.accountId));
    });
  }

  createUnverified(account: NewAccount): Promise<AccountCreation> {
    return settle(() => {
      requireValidNewAccount(account);
      if (this.accountWithNormalForm(account.emailNormalForm) !== undefined) {
        return { kind: "address-taken" };
      }
      if (this.isReservedExcept(account.emailNormalForm, undefined)) {
        return { kind: "address-reserved" };
      }
      const accountId = generateAccountId();
      this.accountsById.set(
        accountId,
        heldAccountOf(accountId, account, this.now()),
      );
      return { kind: "created", accountId };
    });
  }

  replaceUnverifiedRegistration(
    replacement: RegistrationReplacement,
  ): Promise<RegistrationReplacementOutcome> {
    return settle(() => {
      requireValidRegistrationReplacement(replacement);
      const held = this.accountWithNormalForm(replacement.emailNormalForm);
      if (held === undefined || held.emailVerifiedAt !== undefined) {
        return { kind: "not-replaceable" };
      }
      this.accountsById.set(held.id, {
        ...held,
        passwordHash: replacement.passwordHash,
        phone: replacement.phone,
        locale: replacement.locale,
        privacyNoticeVersion: replacement.privacyNoticeVersion,
      });
      return { kind: "replaced", accountId: held.id };
    });
  }

  issueToken(token: TokenToIssue): Promise<TokenIssueOutcome> {
    return settle(() => {
      requireValidTokenToIssue(token);
      const existing = this.tokensByHash.get(token.tokenHash);
      if (existing !== undefined) return issuedIfSameToken(existing, token);
      if (!this.accountsById.has(token.accountId)) return { kind: "refused" };
      this.tokensByHash.set(token.tokenHash, {
        tokenHash: token.tokenHash,
        accountId: token.accountId,
        purpose: token.purpose,
        issuedAt: this.now(),
        expiresAt: token.expiresAt,
        usedAt: undefined,
      });
      return { kind: "issued" };
    });
  }

  issueEmailChangeToken(
    token: EmailChangeTokenToIssue,
  ): Promise<TokenIssueOutcome> {
    return settle(() => {
      requireValidEmailChangeTokenToIssue(token);
      const existing = this.tokensByHash.get(token.tokenHash);
      if (existing !== undefined) {
        return issuedIfSameToken(existing, {
          accountId: token.accountId,
          purpose: "email-change",
        });
      }
      const account = this.accountsById.get(token.accountId);
      const isIssuable =
        account?.emailVerifiedAt !== undefined &&
        account.passwordHash === token.verifiedPasswordHash;
      if (!isIssuable) return { kind: "refused" };
      this.tokensByHash.set(token.tokenHash, {
        tokenHash: token.tokenHash,
        accountId: token.accountId,
        purpose: "email-change",
        issuedAt: this.now(),
        expiresAt: token.expiresAt,
        newEmail: token.newEmail,
        newEmailNormalForm: token.newEmailNormalForm,
        usedAt: undefined,
      });
      return { kind: "issued" };
    });
  }

  retireEmailChangeTokens(accountId: string): Promise<void> {
    return settle(() => {
      requireValidEmailChangeRetirement(accountId);
      const at = this.now();
      for (const token of this.tokensByHash.values()) {
        const isEmailChangeOfAccount =
          token.accountId === accountId && token.purpose === "email-change";
        if (isEmailChangeOfAccount) token.usedAt ??= at;
      }
    });
  }

  confirmEmail(
    confirmation: EmailConfirmation,
  ): Promise<EmailConfirmationOutcome> {
    return settle(() => {
      requireValidEmailConfirmation(confirmation);
      const account = this.accountsById.get(confirmation.accountId);
      const token = this.liveToken(confirmation.tokenHash, "verify-email");
      const isConfirmable =
        account !== undefined &&
        token?.accountId === account.id &&
        account.passwordHash === confirmation.verifiedPasswordHash;
      if (!isConfirmable) return { kind: "invalid" };
      const at = this.now();
      this.useTokenAndRetireSiblings(token, at);
      this.accountsById.set(account.id, {
        ...account,
        emailVerifiedAt: account.emailVerifiedAt ?? at,
      });
      return { kind: "confirmed" };
    });
  }

  confirmEmailChange(
    confirmation: EmailChangeConfirmation,
  ): Promise<EmailChangeOutcome> {
    return settle(() => {
      requireValidEmailChangeConfirmation(confirmation);
      const token = this.liveToken(confirmation.tokenHash, "email-change");
      const account = token && this.accountsById.get(token.accountId);
      if (account === undefined || !this.isChangeableBy(token, account)) {
        return { kind: "invalid" };
      }
      if (this.tokensByHash.has(confirmation.revertTokenHash)) {
        throw new Error(
          "FakeAccountStore: the revert token hash is already held.",
        );
      }
      const at = this.now();
      this.retireEmailTokensOf(account.id, at);
      this.tokensByHash.set(confirmation.revertTokenHash, {
        tokenHash: confirmation.revertTokenHash,
        accountId: account.id,
        purpose: EMAIL_CHANGE_REVERT_PURPOSE,
        issuedAt: at,
        expiresAt: confirmation.revertExpiresAt,
        newEmail: account.email,
        newEmailNormalForm: account.emailNormalForm,
        usedAt: undefined,
      });
      this.accountsById.set(account.id, {
        ...account,
        email: token.newEmail ?? account.email,
        emailNormalForm: token.newEmailNormalForm ?? account.emailNormalForm,
      });
      this.revokeSessionsOf(account.id, at);
      return {
        kind: "changed",
        accountId: account.id,
        previous: { email: account.email, locale: account.locale },
      };
    });
  }

  revertEmailChange(
    revert: EmailChangeRevert,
  ): Promise<EmailChangeRevertOutcome> {
    return settle(() => {
      requireValidEmailChangeRevert(revert);
      const token = this.liveRevertToken(revert.tokenHash);
      const account = token && this.accountsById.get(token.accountId);
      if (account === undefined || !this.isRevertableBy(token, account)) {
        return { kind: "invalid" };
      }
      const at = this.now();
      this.retireTokensForRevertWith(token, at);
      this.accountsById.set(account.id, {
        ...account,
        email: token.newEmail ?? account.email,
        emailNormalForm: token.newEmailNormalForm ?? account.emailNormalForm,
        passwordHash: revert.passwordHash,
        passwordChangedAt: at,
      });
      this.revokeSessionsOf(account.id, at);
      return {
        kind: "reverted",
        accountId: account.id,
        email: token.newEmail ?? account.email,
        locale: account.locale,
      };
    });
  }

  isAddressReserved(question: AddressReservationQuestion): Promise<boolean> {
    return settle(() => {
      requireValidAddressReservationQuestion(question);
      return this.isReservedExcept(
        question.emailNormalForm,
        question.exceptAccountId,
      );
    });
  }

  completeReset(reset: PasswordReset): Promise<PasswordResetOutcome> {
    return settle(() => {
      requireValidPasswordReset(reset);
      const token = this.liveToken(reset.tokenHash, "reset-password");
      const account = token && this.accountsById.get(token.accountId);
      if (token === undefined || account?.emailVerifiedAt === undefined) {
        return { kind: "invalid" };
      }
      const at = this.now();
      this.retireEmailTokensOf(account.id, at);
      this.accountsById.set(account.id, {
        ...account,
        passwordHash: reset.passwordHash,
        passwordChangedAt: at,
      });
      this.revokeSessionsOf(account.id, at);
      return { kind: "password-changed" };
    });
  }

  replacePasswordHash(rehash: PasswordRehash): Promise<PasswordRehashOutcome> {
    return settle(() => {
      requireValidPasswordRehash(rehash);
      const held = this.accountsById.get(rehash.accountId);
      if (held?.passwordHash !== rehash.expectedPasswordHash)
        return { kind: "stale" };
      this.accountsById.set(held.id, {
        ...held,
        passwordHash: rehash.passwordHash,
      });
      return { kind: "replaced" };
    });
  }

  /** The `accounts` side of a session lookup: the account's current role, address and verification. */
  sessionAccountOf(accountId: string): SessionAccount | undefined {
    const held = this.accountsById.get(accountId);
    if (held === undefined) return undefined;
    return {
      id: held.id,
      email: held.email,
      role: held.role,
      isEmailVerified: held.emailVerifiedAt !== undefined,
    };
  }

  /** The account's current `password_hash`, which a session's creation compares. */
  passwordHashOf(accountId: string): string | undefined {
    return this.accountsById.get(accountId)?.passwordHash;
  }

  /** The account's `password_changed_at`, which a session's liveness compares with its own creation. */
  passwordChangedAtOf(accountId: string): Date | undefined {
    return this.accountsById.get(accountId)?.passwordChangedAt;
  }

  /** Every account the table would hold. */
  heldAccounts(): readonly StoredAccount[] {
    return [...this.accountsById.values()].map((held) => storedAccountOf(held));
  }

  /** Every token row, used or not. */
  heldTokens(): readonly HeldEmailToken[] {
    return [...this.tokensByHash.values()].map((token) => ({ ...token }));
  }

  /** Test-only, and not on the `AccountStore` port: the application role cannot write a role, so a test seeds one. */
  setRoleOf(accountId: string, role: Role): void {
    const held = this.accountsById.get(accountId);
    if (held === undefined) {
      throw new Error("FakeAccountStore.setRoleOf: no such account");
    }
    this.accountsById.set(accountId, { ...held, role });
  }

  private accountWithNormalForm(
    emailNormalForm: string,
  ): HeldAccount | undefined {
    return [...this.accountsById.values()].find(
      (held) => held.emailNormalForm === emailNormalForm,
    );
  }

  /** Neon's consume predicate beyond liveness: a verified account, a token issued no earlier than its last password
   *  change, an address on the row, and no other account holding or having reserved that address. */
  private isChangeableBy(
    token: HeldEmailToken | undefined,
    account: HeldAccount,
  ): token is HeldEmailToken {
    if (
      token?.newEmail === undefined ||
      token.newEmailNormalForm === undefined
    ) {
      return false;
    }
    return (
      account.emailVerifiedAt !== undefined &&
      token.issuedAt.getTime() >= account.passwordChangedAt.getTime() &&
      this.isAddressFreeFor(token.newEmailNormalForm, account.id)
    );
  }

  /** Neon's revert predicate beyond liveness: a verified account, an address on the row, and no other account holding or
   *  having reserved that address. Neither the newest-token rule nor the password-change binding applies. */
  private isRevertableBy(
    token: HeldEmailToken | undefined,
    account: HeldAccount,
  ): token is HeldEmailToken {
    if (
      token?.newEmail === undefined ||
      token.newEmailNormalForm === undefined
    ) {
      return false;
    }
    return (
      account.emailVerifiedAt !== undefined &&
      this.isAddressFreeFor(token.newEmailNormalForm, account.id)
    );
  }

  private isAddressFreeFor(
    emailNormalForm: string,
    accountId: string,
  ): boolean {
    const holder = this.accountWithNormalForm(emailNormalForm);
    const isHeldByAnother = holder !== undefined && holder.id !== accountId;
    return (
      !isHeldByAnother && !this.isReservedExcept(emailNormalForm, accountId)
    );
  }

  /** A live undo link of an account other than `exceptAccountId` names the address. `undefined` excepts no account. */
  private isReservedExcept(
    emailNormalForm: string,
    exceptAccountId: string | undefined,
  ): boolean {
    const nowMs = this.now().getTime();
    return [...this.tokensByHash.values()].some(
      (token) =>
        token.purpose === EMAIL_CHANGE_REVERT_PURPOSE &&
        token.usedAt === undefined &&
        token.expiresAt.getTime() > nowMs &&
        token.newEmailNormalForm === emailNormalForm &&
        token.accountId !== exceptAccountId,
    );
  }

  /** An undo link is valid while unused and unexpired, however many newer tokens of its purpose the account holds. */
  private liveRevertToken(tokenHash: string): HeldEmailToken | undefined {
    const token = this.tokensByHash.get(tokenHash);
    if (token?.purpose !== EMAIL_CHANGE_REVERT_PURPOSE) return undefined;
    if (token.usedAt !== undefined) return undefined;
    return token.expiresAt.getTime() > this.now().getTime() ? token : undefined;
  }

  /** Unused, unexpired, of this purpose, and with no newer unused token of its account and purpose. */
  private liveToken(
    tokenHash: string,
    purpose: EmailTokenPurpose,
  ): HeldEmailToken | undefined {
    const token = this.tokensByHash.get(tokenHash);
    if (token?.purpose !== purpose || token.usedAt !== undefined)
      return undefined;
    if (token.expiresAt.getTime() <= this.now().getTime()) return undefined;
    return this.hasNewerUnusedSibling(token) ? undefined : token;
  }

  private hasNewerUnusedSibling(token: HeldEmailToken): boolean {
    return [...this.tokensByHash.values()].some(
      (other) =>
        other.accountId === token.accountId &&
        other.purpose === token.purpose &&
        other.usedAt === undefined &&
        isIssuedAfter(other, token),
    );
  }

  /** Every unused token of the account, of any purpose but the undo link of an address change, is marked used. */
  private retireEmailTokensOf(accountId: string, at: Date): void {
    for (const token of this.tokensByHash.values()) {
      const isRetirable =
        token.accountId === accountId &&
        token.purpose !== EMAIL_CHANGE_REVERT_PURPOSE;
      if (isRetirable) token.usedAt ??= at;
    }
  }

  /** The oldest wins: the used link, every other unused token that is not an undo link, and every undo link issued
   *  after it are marked used; an earlier undo link stays valid. */
  private retireTokensForRevertWith(used: HeldEmailToken, at: Date): void {
    for (const token of this.tokensByHash.values()) {
      const isSameAccount = token.accountId === used.accountId;
      const isRetirable =
        token.purpose !== EMAIL_CHANGE_REVERT_PURPOSE ||
        token === used ||
        isIssuedAfter(token, used);
      if (isSameAccount && isRetirable) token.usedAt ??= at;
    }
  }

  private useTokenAndRetireSiblings(token: HeldEmailToken, at: Date): void {
    for (const other of this.tokensByHash.values()) {
      const isSibling =
        other.accountId === token.accountId && other.purpose === token.purpose;
      if (isSibling) other.usedAt ??= at;
    }
  }
}

/**
 * Neon's `(created_at, token_hash) > (...)`. Two tokens issued in the same clock tick are ordered by hash, which is a
 * coin flip with respect to issue order: a test that needs one token to supersede another advances its clock between
 * the two issues.
 */
function isIssuedAfter(
  candidate: HeldEmailToken,
  token: HeldEmailToken,
): boolean {
  const byTime = candidate.issuedAt.getTime() - token.issuedAt.getTime();
  return byTime === 0 ? candidate.tokenHash > token.tokenHash : byTime > 0;
}

/** A rejected promise for a refusal, as the Neon store's `async` methods give, without an `async` body that awaits
 *  nothing. */
function settle<Outcome>(compute: () => Outcome): Promise<Outcome> {
  try {
    return Promise.resolve(compute());
  } catch (failure) {
    return Promise.reject(
      failure instanceof Error ? failure : new Error("Unknown failure"),
    );
  }
}

function lookupOf(held: HeldAccount | undefined): AccountLookup {
  if (held === undefined) return { kind: "none" };
  return { kind: "found", account: storedAccountOf(held) };
}

function storedAccountOf(held: HeldAccount): StoredAccount {
  return {
    id: held.id,
    email: held.email,
    passwordHash: held.passwordHash,
    isEmailVerified: held.emailVerifiedAt !== undefined,
    role: held.role,
    locale: held.locale,
  };
}

function heldAccountOf(id: string, account: NewAccount, at: Date): HeldAccount {
  return {
    id,
    email: account.email,
    emailNormalForm: account.emailNormalForm,
    passwordHash: account.passwordHash,
    role: "client",
    locale: account.locale,
    privacyNoticeVersion: account.privacyNoticeVersion,
    phone: account.phone,
    name: undefined,
    address: undefined,
    emailVerifiedAt: undefined,
    passwordChangedAt: at,
  };
}

/** Both columns set or both cleared: the store has already refused a pair that is half of one. */
function heldPhoneOf(
  change: NonNullable<ProfileUpdate["changes"]["phone"]>,
): NewAccount["phone"] {
  if (change.phone === null || change.phoneNormalForm === null) {
    return undefined;
  }
  return { entered: change.phone, normalForm: change.phoneNormalForm };
}

/** The table's `on conflict do nothing`: a hash already held answers issued only for the very same token. */
function issuedIfSameToken(
  existing: HeldEmailToken,
  token: { accountId: string; purpose: EmailTokenPurpose },
): TokenIssueOutcome {
  const isSame =
    existing.accountId === token.accountId &&
    existing.purpose === token.purpose;
  return isSame ? { kind: "issued" } : { kind: "refused" };
}
