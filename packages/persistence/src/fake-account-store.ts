import type { Role } from "@lemnaria/configurator-domain";

import {
  requireValidEmailConfirmation,
  requireValidLiveTokenLookup,
  requireValidNewAccount,
  requireValidPasswordRehash,
  requireValidPasswordReset,
  requireValidRegistrationReplacement,
  requireValidTokenToIssue,
} from "./account-store.js";
import type {
  AccountCreation,
  AccountLookup,
  AccountStore,
  EmailConfirmation,
  EmailConfirmationOutcome,
  EmailTokenPurpose,
  LiveTokenLookup,
  NewAccount,
  PasswordRehash,
  PasswordRehashOutcome,
  PasswordReset,
  PasswordResetOutcome,
  RegistrationReplacement,
  RegistrationReplacementOutcome,
  StoredAccount,
  TokenIssueOutcome,
  TokenToIssue,
} from "./account-store.js";
import { generateAccountId } from "./generate-account-id.js";

/** An account as the table holds it. `role` is always `client`: the application role cannot write any other. */
interface HeldAccount {
  readonly id: string;
  readonly email: string;
  readonly emailNormalForm: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly locale: string;
  readonly privacyNoticeVersion: string;
  readonly phone: NewAccount["phone"];
  readonly emailVerifiedAt: Date | undefined;
  readonly passwordChangedAt: Date;
}

/** A token row. `issueOrder` stands for `created_at`: a later issue is newer even inside one clock tick. */
export interface HeldEmailToken {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly purpose: EmailTokenPurpose;
  readonly issueOrder: number;
  readonly expiresAt: Date;
  usedAt: Date | undefined;
}

export interface FakeAccountStoreOptions {
  /** The database's clock. A test passes its own to cross an expiry. */
  readonly now?: () => Date;
  /**
   * What `completeReset` does to the account's sessions. The session store (wave L4b) is a separate port, so its fake
   * passes a function that sets `revoked_at` on its own rows; with none, the fake only records the call, readable
   * through `sessionRevocations()`.
   */
  readonly revokeSessionsOf?: (accountId: string, at: Date) => void;
}

/** An account whose sessions a reset revoked, and when. */
export interface SessionRevocation {
  readonly accountId: string;
  readonly at: Date;
}

/**
 * In-memory `AccountStore` with `NeonAccountStore`'s contract: the same refusals, the same newest-live-token rule
 * (unused, unexpired, no newer unused sibling), the same retirement of siblings on use, and the same atomicity (each
 * method finishes before the next starts). It cannot stand for a retry after a lost acknowledgement, which has no
 * in-memory counterpart.
 */
export class FakeAccountStore implements AccountStore {
  private readonly accountsById = new Map<string, HeldAccount>();
  private readonly tokensByHash = new Map<string, HeldEmailToken>();
  private readonly revocations: SessionRevocation[] = [];
  private issuedTokenCount = 0;
  private readonly now: () => Date;
  private readonly revokeSessionsOf: (accountId: string, at: Date) => void;

  constructor({
    now = () => new Date(),
    revokeSessionsOf,
  }: FakeAccountStoreOptions = {}) {
    this.now = now;
    this.revokeSessionsOf =
      revokeSessionsOf ??
      ((accountId, at) => {
        this.revocations.push({ accountId, at });
      });
  }

  findByNormalForm(emailNormalForm: string): Promise<AccountLookup> {
    return settle(() => lookupOf(this.accountWithNormalForm(emailNormalForm)));
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
      this.issuedTokenCount += 1;
      this.tokensByHash.set(token.tokenHash, {
        tokenHash: token.tokenHash,
        accountId: token.accountId,
        purpose: token.purpose,
        issueOrder: this.issuedTokenCount,
        expiresAt: token.expiresAt,
        usedAt: undefined,
      });
      return { kind: "issued" };
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

  completeReset(reset: PasswordReset): Promise<PasswordResetOutcome> {
    return settle(() => {
      requireValidPasswordReset(reset);
      const token = this.liveToken(reset.tokenHash, "reset-password");
      const account = token && this.accountsById.get(token.accountId);
      if (token === undefined || account?.emailVerifiedAt === undefined) {
        return { kind: "invalid" };
      }
      const at = this.now();
      this.useTokenAndRetireSiblings(token, at);
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

  /** Every account the table would hold. */
  heldAccounts(): readonly StoredAccount[] {
    return [...this.accountsById.values()].map((held) => storedAccountOf(held));
  }

  /** Every token row, used or not. */
  heldTokens(): readonly HeldEmailToken[] {
    return [...this.tokensByHash.values()].map((token) => ({ ...token }));
  }

  /** The resets that revoked an account's sessions, when no `revokeSessionsOf` was passed. */
  sessionRevocations(): readonly SessionRevocation[] {
    return [...this.revocations];
  }

  private accountWithNormalForm(
    emailNormalForm: string,
  ): HeldAccount | undefined {
    return [...this.accountsById.values()].find(
      (held) => held.emailNormalForm === emailNormalForm,
    );
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
        other.issueOrder > token.issueOrder,
    );
  }

  private useTokenAndRetireSiblings(token: HeldEmailToken, at: Date): void {
    for (const other of this.tokensByHash.values()) {
      const isSibling =
        other.accountId === token.accountId && other.purpose === token.purpose;
      if (isSibling) other.usedAt ??= at;
    }
  }
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
    emailVerifiedAt: undefined,
    passwordChangedAt: at,
  };
}

/** The table's `on conflict do nothing`: a hash already held answers issued only for the very same token. */
function issuedIfSameToken(
  existing: HeldEmailToken,
  token: TokenToIssue,
): TokenIssueOutcome {
  const isSame =
    existing.accountId === token.accountId &&
    existing.purpose === token.purpose;
  return isSame ? { kind: "issued" } : { kind: "refused" };
}
