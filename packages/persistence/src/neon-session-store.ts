import { isRole } from "@lemnaria/configurator-domain";

import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import {
  SESSION_TOUCH_INTERVAL_SECONDS,
  SessionStoreError,
  requireSessionTokenHash,
  requireValidNewSession,
  requireValidSessionLookupRequest,
} from "./session-store.js";
import type {
  NewSession,
  SessionCreation,
  SessionLookup,
  SessionLookupRequest,
  SessionStore,
  SessionStoreOperation,
} from "./session-store.js";

/**
 * `SessionStore` on Neon Postgres, over `account_sessions` joined to `accounts` (migrations `0012`, `0013`). Every
 * query is a tagged-template `sql`, which parameterises values, and each method is **one statement**, so it is atomic.
 *
 * The statements write only what the application role is granted: INSERT of a session and UPDATE of `last_seen_at` and
 * `revoked_at`. None deletes, and none writes `token_hash`, `account_id`, `created_at` or `absolute_expires_at` after
 * insert. Every time comparison uses the database's clock.
 *
 * Every write is safe to repeat after a lost acknowledgement: a second `create` finds its own live row, and a second
 * `touch` finds a fresh `last_seen_at`; a second revocation finds nothing unrevoked.
 */
export class NeonSessionStore implements SessionStore {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /** The row is inserted from a `select` of its account, so an account that is gone inserts nothing and raises no
   *  foreign-key error. Repeating it after a lost acknowledgement finds its own live row and answers created. */
  async create(session: NewSession): Promise<SessionCreation> {
    requireValidNewSession(session);
    const { tokenHash, accountId } = session;
    const absoluteExpiresAt = session.absoluteExpiresAt.toISOString();
    const rows = await queryRows("create a session", () =>
      retryOnTransientFailure(
        () => this.sql`
          with inserted as (
            insert into account_sessions (token_hash, account_id, absolute_expires_at)
            select ${tokenHash}, a.id, ${absoluteExpiresAt}::timestamptz
            from accounts a where a.id = ${accountId}
            on conflict (token_hash) do nothing
            returning token_hash
          )
          select token_hash from inserted
          union
          select token_hash from account_sessions
          where token_hash = ${tokenHash} and account_id = ${accountId} and revoked_at is null
        `,
      ),
    );
    return rows.length === 0 ? { kind: "refused" } : { kind: "created" };
  }

  /**
   * Live is three conditions in the one `where`: not revoked, before the absolute expiry, and `last_seen_at` plus the
   * idle lifetime of the account's **current** role still ahead. The lifetimes travel as one JSON object keyed by role
   * name, so a role with no figure reads as null, the comparison is not true, and the session is not live.
   * `last_seen_at` is read as epoch milliseconds in text, so the driver's rendering of a timestamp never matters.
   */
  async findLive({
    tokenHash,
    idleLifetimeSeconds,
  }: SessionLookupRequest): Promise<SessionLookup> {
    requireValidSessionLookupRequest({ tokenHash, idleLifetimeSeconds });
    const lifetimes = JSON.stringify(idleLifetimeSeconds);
    const rows = await queryRows("look up a session", () =>
      retryOnTransientFailure(
        () => this.sql`
          select a.id, a.email, a.role,
            (a.email_verified_at is not null) as is_email_verified,
            (extract(epoch from s.last_seen_at) * 1000)::bigint::text as last_seen_ms
          from account_sessions s
          join accounts a on a.id = s.account_id
          where s.token_hash = ${tokenHash}
            and s.revoked_at is null
            and s.absolute_expires_at > now()
            and s.last_seen_at
              + ((${lifetimes}::jsonb ->> a.role)::double precision * interval '1 second') > now()
        `,
      ),
    );
    return lookupFrom(rows);
  }

  /** Writes only a session that is unrevoked and before its absolute expiry, and whose `last_seen_at` is older than the
   *  interval. The idle lifetime is not asked here: a touch follows a `findLive` in the same request. */
  async touch(tokenHash: string): Promise<void> {
    requireSessionTokenHash(tokenHash, "touch a session");
    await queryRows("touch a session", () =>
      retryOnTransientFailure(
        () => this.sql`
          update account_sessions
          set last_seen_at = now()
          where token_hash = ${tokenHash}
            and revoked_at is null
            and absolute_expires_at > now()
            and last_seen_at < now() - (${SESSION_TOUCH_INTERVAL_SECONDS}::double precision * interval '1 second')
          returning token_hash
        `,
      ),
    );
  }

  async revoke(tokenHash: string): Promise<void> {
    requireSessionTokenHash(tokenHash, "revoke a session");
    await queryRows("revoke a session", () =>
      retryOnTransientFailure(
        () => this.sql`
          update account_sessions
          set revoked_at = now()
          where token_hash = ${tokenHash} and revoked_at is null
          returning token_hash
        `,
      ),
    );
  }

  async revokeAllForAccount(accountId: string): Promise<void> {
    await queryRows("revoke the sessions of an account", () =>
      retryOnTransientFailure(
        () => this.sql`
          update account_sessions
          set revoked_at = now()
          where account_id = ${accountId} and revoked_at is null
          returning token_hash
        `,
      ),
    );
  }
}

/** The rows of a statement, or the store error. A failure leaves as a store error holding a built cause (ADR 0146 B3),
 *  and the driver's own error is thrown by nothing here. */
async function queryRows(
  operation: SessionStoreOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<readonly Record<string, unknown>[]> {
  let reply: unknown;
  try {
    reply = await runQuery();
  } catch (failure) {
    throw new SessionStoreError(operation, reducedCauseOf(failure));
  }
  return plainRowsOf(reply, operation);
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(
  reply: unknown,
  operation: SessionStoreOperation,
): readonly Record<string, unknown>[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw new SessionStoreError(operation);
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw new SessionStoreError(operation);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lookupFrom(rows: readonly Record<string, unknown>[]): SessionLookup {
  const [row, ...others] = rows;
  if (row === undefined) return { kind: "none" };
  if (others.length > 0) throw new SessionStoreError("look up a session");
  return liveSessionFrom(row);
}

function liveSessionFrom(row: Record<string, unknown>): SessionLookup {
  const { id, email, role, is_email_verified, last_seen_ms } = row;
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof is_email_verified !== "boolean" ||
    typeof role !== "string" ||
    !isRole(role) ||
    typeof last_seen_ms !== "string"
  ) {
    throw new SessionStoreError("look up a session");
  }
  return {
    kind: "live",
    account: { id, email, role, isEmailVerified: is_email_verified },
    lastSeenAt: instantFromEpochMilliseconds(last_seen_ms),
  };
}

function instantFromEpochMilliseconds(text: string): Date {
  const milliseconds = Number(text);
  if (!Number.isSafeInteger(milliseconds)) {
    throw new SessionStoreError("look up a session");
  }
  return new Date(milliseconds);
}
