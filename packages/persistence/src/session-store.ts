import { ROLES } from "@lemnaria/configurator-domain";
import type { Role } from "@lemnaria/configurator-domain";

import { requireSha256Digest } from "./sha256-digest.js";

/** A session's `last_seen_at` is written at most this often (ADR 0169 decision 3), which bounds the table's writes. */
export const SESSION_TOUCH_INTERVAL_SECONDS = 60 * 60;

export type SessionStoreOperation =
  | "create a session"
  | "look up a session"
  | "touch a session"
  | "revoke a session"
  | "revoke the sessions of an account";

/** The database refused, did not answer, or answered with something that is not the row this port reads. Its `cause`
 *  is a `ReducedCause` (ADR 0146 B3), never the driver's own error, and its message holds no hash or address. */
export class SessionStoreError extends Error {
  readonly operation: SessionStoreOperation;

  constructor(operation: SessionStoreOperation, options?: ErrorOptions) {
    super(
      `The session store could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "SessionStoreError";
    this.operation = operation;
  }
}

/** How long a session may go unseen before it ends, per role. The caller owns the figures (owner Q-L1: client 30 days,
 *  operator and administrator 12 hours); the store only applies the one that matches the account's current role. */
export type IdleLifetimeSecondsByRole = Readonly<Record<Role, number>>;

/** `tokenHash` is the SHA-256 of the cookie's value; the value itself never reaches the store. The absolute expiry is
 *  fixed here and never extended. */
export interface NewSession {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly absoluteExpiresAt: Date;
}

/** `refused` is an account that does not exist, or a token hash already held by another account or already revoked. */
export type SessionCreation =
  | { readonly kind: "created" }
  | { readonly kind: "refused" };

export interface SessionLookupRequest {
  readonly tokenHash: string;
  readonly idleLifetimeSeconds: IdleLifetimeSecondsByRole;
}

/** The account as the session's request reads it. `role` is the account's current role, so a demotion takes effect on
 *  the next request. */
export interface SessionAccount {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly isEmailVerified: boolean;
}

/** Tagged, never `null`. `none` covers an unknown, revoked, absolutely expired and idle-expired session alike. */
export type SessionLookup =
  | {
      readonly kind: "live";
      readonly account: SessionAccount;
      readonly lastSeenAt: Date;
    }
  | { readonly kind: "none" };

/**
 * The port for sessions (ADR 0169 decision 3). A session is live while it is not revoked, before its absolute expiry,
 * and seen within its role's idle lifetime. Nothing here sets a cookie: `touch` writes the database alone, and only a
 * route handler calls it. No method deletes a row, and none writes `token_hash`, `account_id`, `created_at` or
 * `absolute_expires_at` after insert.
 */
export interface SessionStore {
  create(session: NewSession): Promise<SessionCreation>;
  /** One read joining the account, so the role, address and verification are the account's current ones. */
  findLive(request: SessionLookupRequest): Promise<SessionLookup>;
  /** Marks the session seen now, only if it is live and was last seen more than `SESSION_TOUCH_INTERVAL_SECONDS` ago.
   *  It never extends the absolute expiry. */
  touch(tokenHash: string): Promise<void>;
  /** Idempotent: an unknown or already revoked session changes nothing. */
  revoke(tokenHash: string): Promise<void>;
  /** Revokes every unrevoked session of the account, the caller's own included. */
  revokeAllForAccount(accountId: string): Promise<void>;
}

export function requireValidNewSession(session: NewSession): void {
  requireSessionTokenHash(session.tokenHash, "create a session");
  if (
    session.absoluteExpiresAt instanceof Date &&
    !Number.isNaN(session.absoluteExpiresAt.getTime())
  ) {
    return;
  }
  throw new Error(
    "Refusing to create a session: its absolute expiry must be a valid instant. The table would refuse the row.",
  );
}

export function requireValidSessionLookupRequest(
  request: SessionLookupRequest,
): void {
  requireSessionTokenHash(request.tokenHash, "look up a session");
  for (const role of Object.keys(ROLES)) {
    requireIdleLifetime(request.idleLifetimeSeconds, role);
  }
}

export function requireSessionTokenHash(
  tokenHash: unknown,
  operation: string,
): void {
  requireSha256Digest(tokenHash, "session token hash", operation);
}

function requireIdleLifetime(
  lifetimes: Readonly<Record<string, unknown>>,
  role: string,
): void {
  const seconds = lifetimes[role];
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return;
  }
  throw new Error(
    `Refusing to look up a session: the idle lifetime of the ${role} role must be a positive number of seconds.`,
  );
}
