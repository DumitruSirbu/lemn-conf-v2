import { ROLES } from "@lemnaria/configurator-domain";
import type { Role } from "@lemnaria/configurator-domain";

import { requirePasswordHashShape } from "./password-hash-shape.js";
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
 *  fixed here and never extended. `expectedPasswordHash` is the hash the caller verified (a login binds the session to
 *  the hash it holds **after** any rehash): the session is created only while the account still holds it. */
export interface NewSession {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly expectedPasswordHash: string;
  readonly absoluteExpiresAt: Date;
}

/**
 * Only `created` is a session. `stale` is an account whose hash was no longer `expectedPasswordHash` when the statement
 * began; `refused` is every other case with no session: an account that does not exist, a token hash another account
 * (or a revoked row) already holds, **and a reset or rehash that committed while the statement waited on the account's
 * row lock**, since the re-check after that wait finds nothing to insert and the `stale` arm reads the statement's
 * earlier snapshot. The two are therefore not a reliable diagnosis, and a caller treats **every result other than
 * `created` as a failed sign-in that holds no session**, never as a signed-in response.
 */
export type SessionCreation =
  | { readonly kind: "created" }
  | { readonly kind: "stale" }
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
 * seen within its role's idle lifetime, and created no earlier than the account's last password change. Nothing here
 * sets a cookie: `touch` writes the database alone, and only a route handler calls it. No method deletes a row, and
 * none writes `token_hash`, `account_id`, `created_at` or `absolute_expires_at` after insert.
 */
export interface SessionStore {
  create(session: NewSession): Promise<SessionCreation>;
  /** One read joining the account, so the role, address and verification are the account's current ones. */
  findLive(request: SessionLookupRequest): Promise<SessionLookup>;
  /** Marks the session seen now, only if it is live **by the same test as `findLive`** (so an idle-expired session is
   *  never revived) and was last seen more than `SESSION_TOUCH_INTERVAL_SECONDS` ago. It never extends the absolute
   *  expiry. */
  touch(request: SessionLookupRequest): Promise<void>;
  /** Idempotent: an unknown or already revoked session changes nothing. */
  revoke(tokenHash: string): Promise<void>;
  /** Revokes every unrevoked session of the account, the caller's own included. */
  revokeAllForAccount(accountId: string): Promise<void>;
}

export function requireValidNewSession(session: NewSession): void {
  requireSessionTokenHash(session.tokenHash, "create a session");
  requirePasswordHashShape(session.expectedPasswordHash, "create a session");
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

/** `findLive` and `touch` ask the same question of the same request, so each names itself in the refusal. */
export function requireValidSessionLookupRequest(
  request: SessionLookupRequest,
  operation: "look up a session" | "touch a session",
): void {
  requireSessionTokenHash(request.tokenHash, operation);
  for (const role of Object.keys(ROLES)) {
    requireIdleLifetime(request.idleLifetimeSeconds, role, operation);
  }
}

export function requireSessionTokenHash(
  tokenHash: unknown,
  operation: SessionStoreOperation,
): void {
  requireSha256Digest(tokenHash, "session token hash", operation);
}

function requireIdleLifetime(
  lifetimes: Readonly<Record<string, unknown>>,
  role: string,
  operation: SessionStoreOperation,
): void {
  const seconds = lifetimes[role];
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return;
  }
  throw new Error(
    `Refusing to ${operation}: the idle lifetime of the ${role} role must be a positive number of seconds.`,
  );
}
