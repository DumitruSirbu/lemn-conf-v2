import {
  SESSION_TOUCH_INTERVAL_SECONDS,
  requireSessionTokenHash,
  requireValidNewSession,
  requireValidSessionLookupRequest,
} from "./session-store.js";
import type {
  IdleLifetimeSecondsByRole,
  NewSession,
  SessionAccount,
  SessionCreation,
  SessionLookup,
  SessionLookupRequest,
  SessionStore,
} from "./session-store.js";
import { FakeAccountStore } from "./fake-account-store.js";

const MILLISECONDS_PER_SECOND = 1_000;

/** A session row. `revokedAt` and `lastSeenAt` are the only fields any method changes after insert. */
export interface HeldSession {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly createdAt: Date;
  readonly absoluteExpiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | undefined;
}

export interface FakeSessionStoreOptions {
  /** The database's clock. A test passes its own to cross an expiry. */
  readonly now?: () => Date;
  /** The `accounts` side of the join: the account's current role, address and verification, or `undefined` when it has
   *  no row. `createFakeAccountAndSessionStores` wires it to a `FakeAccountStore`. */
  readonly accountOf: (accountId: string) => SessionAccount | undefined;
  /** The account's current `password_hash`, or `undefined` when it has no row: what `create` compares. */
  readonly passwordHashOf: (accountId: string) => string | undefined;
  /** The account's `password_changed_at`, or `undefined` when it has no row: a session created before it is not live. */
  readonly passwordChangedAtOf: (accountId: string) => Date | undefined;
}

/**
 * In-memory `SessionStore` with `NeonSessionStore`'s contract: the same refusals, the same liveness rule (unrevoked,
 * before the absolute expiry, seen within the role's idle lifetime, created no earlier than the account's last password
 * change), a touch of a live session at most once per interval that never moves the absolute expiry, and the same atomicity (each method finishes before the next starts). It cannot stand for a
 * retry after a lost acknowledgement, which has no in-memory counterpart.
 */
export class FakeSessionStore implements SessionStore {
  private readonly sessionsByHash = new Map<string, HeldSession>();
  private readonly now: () => Date;
  private readonly accountOf: (accountId: string) => SessionAccount | undefined;
  private readonly passwordHashOf: (accountId: string) => string | undefined;
  private readonly passwordChangedAtOf: (accountId: string) => Date | undefined;

  constructor({
    now = () => new Date(),
    accountOf,
    passwordHashOf,
    passwordChangedAtOf,
  }: FakeSessionStoreOptions) {
    this.now = now;
    this.accountOf = accountOf;
    this.passwordHashOf = passwordHashOf;
    this.passwordChangedAtOf = passwordChangedAtOf;
  }

  create(session: NewSession): Promise<SessionCreation> {
    return settle(() => {
      requireValidNewSession(session);
      const existing = this.sessionsByHash.get(session.tokenHash);
      if (existing !== undefined)
        return createdIfSameLiveSession(existing, session);
      const currentHash = this.passwordHashOf(session.accountId);
      if (currentHash === undefined) return { kind: "refused" };
      if (currentHash !== session.expectedPasswordHash) {
        return { kind: "stale" };
      }
      const at = this.now();
      this.sessionsByHash.set(session.tokenHash, {
        tokenHash: session.tokenHash,
        accountId: session.accountId,
        createdAt: at,
        absoluteExpiresAt: session.absoluteExpiresAt,
        lastSeenAt: at,
        revokedAt: undefined,
      });
      return { kind: "created" };
    });
  }

  findLive(request: SessionLookupRequest): Promise<SessionLookup> {
    return settle(() => {
      requireValidSessionLookupRequest(request);
      const live = this.liveSessionOf(request);
      if (live === undefined) return { kind: "none" };
      return {
        kind: "live",
        account: live.account,
        lastSeenAt: live.held.lastSeenAt,
      };
    });
  }

  touch(request: SessionLookupRequest): Promise<void> {
    return settle(() => {
      requireValidSessionLookupRequest(request, "touch a session");
      const held = this.liveSessionOf(request)?.held;
      if (held === undefined || !this.isDueForTouch(held)) return;
      held.lastSeenAt = this.now();
    });
  }

  revoke(tokenHash: string): Promise<void> {
    return settle(() => {
      requireSessionTokenHash(tokenHash, "revoke a session");
      const held = this.sessionsByHash.get(tokenHash);
      if (held !== undefined) held.revokedAt ??= this.now();
    });
  }

  revokeAllForAccount(accountId: string): Promise<void> {
    return settle(() => {
      this.revokeSessionsOf(accountId, this.now());
    });
  }

  /** The seam `FakeAccountStore.completeReset` calls (`revokeSessionsOf`): the same write as `revokeAllForAccount`, at
   *  the instant the reset chose. */
  revokeSessionsOf(accountId: string, at: Date): void {
    for (const held of this.sessionsByHash.values()) {
      if (held.accountId === accountId) held.revokedAt ??= at;
    }
  }

  /** Every session row, revoked or not. */
  heldSessions(): readonly HeldSession[] {
    return [...this.sessionsByHash.values()].map((held) => ({ ...held }));
  }

  /** The session and its account when the request's hash names a live one: the one test `findLive` and `touch` share. */
  private liveSessionOf({
    tokenHash,
    idleLifetimeSeconds,
  }: SessionLookupRequest):
    | { readonly held: HeldSession; readonly account: SessionAccount }
    | undefined {
    const held = this.sessionsByHash.get(tokenHash);
    const account = held && this.accountOf(held.accountId);
    if (held === undefined || account === undefined) return undefined;
    return this.isLive(held, account, idleLifetimeSeconds)
      ? { held, account }
      : undefined;
  }

  private isLive(
    held: HeldSession,
    account: SessionAccount,
    idleLifetimeSeconds: IdleLifetimeSecondsByRole,
  ): boolean {
    const nowMs = this.now().getTime();
    const idleEndsMs =
      held.lastSeenAt.getTime() +
      idleLifetimeSeconds[account.role] * MILLISECONDS_PER_SECOND;
    return (
      held.revokedAt === undefined &&
      held.absoluteExpiresAt.getTime() > nowMs &&
      this.isCreatedSincePasswordChange(held) &&
      idleEndsMs > nowMs
    );
  }

  private isCreatedSincePasswordChange(held: HeldSession): boolean {
    const passwordChangedAt = this.passwordChangedAtOf(held.accountId);
    return (
      passwordChangedAt !== undefined &&
      held.createdAt.getTime() >= passwordChangedAt.getTime()
    );
  }

  private isDueForTouch(held: HeldSession): boolean {
    const intervalMs = SESSION_TOUCH_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND;
    return held.lastSeenAt.getTime() < this.now().getTime() - intervalMs;
  }
}

/** The two fakes joined as the database joins their tables: sessions read the account store's current accounts, and a
 *  completed reset revokes the session store's rows at the reset's own instant. */
export function createFakeAccountAndSessionStores(
  now: () => Date = () => new Date(),
): {
  readonly accounts: FakeAccountStore;
  readonly sessions: FakeSessionStore;
} {
  const accounts: FakeAccountStore = new FakeAccountStore({
    now,
    revokeSessionsOf: (accountId, at) => {
      sessions.revokeSessionsOf(accountId, at);
    },
  });
  const sessions = new FakeSessionStore({
    now,
    accountOf: (accountId) => accounts.sessionAccountOf(accountId),
    passwordHashOf: (accountId) => accounts.passwordHashOf(accountId),
    passwordChangedAtOf: (accountId) => accounts.passwordChangedAtOf(accountId),
  });
  return { accounts, sessions };
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

/** The table's `on conflict do nothing`: a hash already held answers created only for the very same live session. */
function createdIfSameLiveSession(
  existing: HeldSession,
  session: NewSession,
): SessionCreation {
  const isSame =
    existing.accountId === session.accountId &&
    existing.revokedAt === undefined;
  return isSame ? { kind: "created" } : { kind: "refused" };
}
