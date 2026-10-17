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
}

/**
 * In-memory `SessionStore` with `NeonSessionStore`'s contract: the same refusals, the same liveness rule (unrevoked,
 * before the absolute expiry, seen within the role's idle lifetime), a touch at most once per interval that never moves
 * the absolute expiry, and the same atomicity (each method finishes before the next starts). It cannot stand for a
 * retry after a lost acknowledgement, which has no in-memory counterpart.
 */
export class FakeSessionStore implements SessionStore {
  private readonly sessionsByHash = new Map<string, HeldSession>();
  private readonly now: () => Date;
  private readonly accountOf: (accountId: string) => SessionAccount | undefined;

  constructor({ now = () => new Date(), accountOf }: FakeSessionStoreOptions) {
    this.now = now;
    this.accountOf = accountOf;
  }

  create(session: NewSession): Promise<SessionCreation> {
    return settle(() => {
      requireValidNewSession(session);
      const existing = this.sessionsByHash.get(session.tokenHash);
      if (existing !== undefined)
        return createdIfSameLiveSession(existing, session);
      if (this.accountOf(session.accountId) === undefined) {
        return { kind: "refused" };
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
      const held = this.sessionsByHash.get(request.tokenHash);
      const account = held && this.accountOf(held.accountId);
      if (held === undefined || account === undefined) return { kind: "none" };
      if (!this.isLive(held, account, request.idleLifetimeSeconds)) {
        return { kind: "none" };
      }
      return { kind: "live", account, lastSeenAt: held.lastSeenAt };
    });
  }

  touch(tokenHash: string): Promise<void> {
    return settle(() => {
      requireSessionTokenHash(tokenHash, "touch a session");
      const held = this.sessionsByHash.get(tokenHash);
      if (held === undefined || !this.isTouchable(held)) return;
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
      idleEndsMs > nowMs
    );
  }

  private isTouchable(held: HeldSession): boolean {
    const nowMs = this.now().getTime();
    const intervalMs = SESSION_TOUCH_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND;
    return (
      held.revokedAt === undefined &&
      held.absoluteExpiresAt.getTime() > nowMs &&
      held.lastSeenAt.getTime() < nowMs - intervalMs
    );
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
