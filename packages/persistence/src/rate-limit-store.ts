import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { isNeonDbError } from "./open-database.js";
import {
  isTransientFailure,
  retryOnTransientFailure,
} from "./retry-on-transient-failure.js";
import { requireSha256Digest } from "./sha256-digest.js";

/** A fixed, half-open window `[startsAt, endsAt)`: an instant equal to `endsAt` belongs to the next window, and the
 *  window is expired from `endsAt` on. The caller chooses it, since a calendar day is not always 24 hours. */
export interface RateLimitWindow {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * What one hit is counted against. `key` is the SHA-256 digest of an encoding of the policy's name and the subject in
 * which the name comes from a closed set written in code and the subject cannot be mistaken for any part of a name, so
 * equal encodings come only from equal pairs. Keeping that is the caller's: a key belongs to one policy, and two
 * policies never state different ends for one key and start.
 */
export interface RateLimitBucket {
  readonly key: string;
  readonly window: RateLimitWindow;
}

export type RateLimitOperation = "record hits" | "prune expired windows";

export interface RateLimitStore {
  /**
   * Adds one hit to every bucket in one round trip and returns each bucket's count in its own window, in the order
   * given. A count includes this hit and comes from that window's row alone. A count may err high, when a repeated
   * statement counts a hit twice, and between prunes of that window never low: a hit for a window the prune has
   * removed starts again at 1. Rejects with `RateLimitStoreError` when the database gives no trustworthy answer, and
   * with `RateLimitWindowConflictError` when a bucket's stored window ends elsewhere than the request says; the caller
   * refuses the request either way, and the second counts none of its buckets. An empty list is refused as invalid,
   * since no counts would read as nothing over the limit.
   */
  recordHits(buckets: readonly RateLimitBucket[]): Promise<readonly number[]>;
  /** Deletes every window that ended at or before `now` and returns how many rows went; after a repeated statement
   *  that number is a lower bound. Safe to run again. */
  pruneExpired(now: Date): Promise<number>;
}

/** The database did not give a count: it refused the statement, did not answer, or answered with something that is
 *  not a count. Its `cause`, when present, is a `ReducedCause`, never the driver's own error. */
export class RateLimitStoreError extends Error {
  readonly operation: RateLimitOperation;

  constructor(operation: RateLimitOperation, options?: ErrorOptions) {
    super(
      `The rate-limit store could not ${operation}: the database gave no trustworthy answer, so no count was produced.`,
      options,
    );
    this.name = "RateLimitStoreError";
    this.operation = operation;
  }
}

/** A hit stated a window end that differs from the one already stored for its key and start: the caller's mistake,
 *  not the database's silence. Nothing of the request was counted. Its message names no key and no window. */
export class RateLimitWindowConflictError extends Error {
  constructor() {
    super(
      "Refusing to count a hit: a bucket's window was already recorded with a different end, so no hit of this " +
        "request was counted.",
    );
    this.name = "RateLimitWindowConflictError";
  }
}

/** Postgres refuses an upsert that reaches one row twice, and a count for a bucket listed twice has no single answer. */
const DUPLICATE_BUCKET_REFUSAL =
  "Refusing to count a hit: one request lists the same bucket in the same window twice, so its count would be ambiguous.";

const NO_BUCKET_REFUSAL =
  "Refusing to count a hit: a request lists no bucket, and no counts would read as nothing over the limit.";

/** The one place a request's buckets are checked, by the Neon store and the fake alike. */
export function requireValidBuckets(buckets: readonly RateLimitBucket[]): void {
  if (buckets.length === 0) throw new Error(NO_BUCKET_REFUSAL);
  const identities = new Set<string>();
  for (const bucket of buckets) {
    requireSha256Digest(bucket.key, "rate-limit bucket key", "count a hit");
    requireNonEmptyWindow(bucket.window);
    const identity = identityOf(bucket);
    if (identities.has(identity)) throw new Error(DUPLICATE_BUCKET_REFUSAL);
    identities.add(identity);
  }
}

export function requireValidInstant(instant: Date): void {
  if (Number.isNaN(instant.getTime())) {
    throw new Error(
      "Refusing to use the rate-limit store: an instant is not a valid date.",
    );
  }
}

function requireNonEmptyWindow({ startsAt, endsAt }: RateLimitWindow): void {
  requireValidInstant(startsAt);
  requireValidInstant(endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error(
      "Refusing to count a hit: a window must end after it starts.",
    );
  }
}

/** A bucket's window as the table keys it: the digest and the window's start in milliseconds. */
export function identityOf({ key, window }: RateLimitBucket): string {
  return identityFor(key, window.startsAt.getTime());
}

function identityFor(key: string, startsAtMs: number): string {
  return `${key}@${String(startsAtMs)}`;
}

interface HitRow {
  bucket_key: string;
  window_start: Date | string;
  hits: unknown;
}

interface RemovedRow {
  removed: unknown;
}

interface HitColumns {
  readonly keys: string[];
  readonly starts: string[];
  readonly ends: string[];
}

/** `RateLimitStore` on Neon Postgres, counting in `rate_limit_counters` (migration `0007`). */
export class NeonRateLimitStore implements RateLimitStore {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * One statement for every bucket: an upsert is atomic per row, so N concurrent hits on one bucket and window return
   * 1…N once each. The prune's locking read under `order by` takes its rows in that order, which Postgres documents;
   * that an insert takes its select's rows in the select's order is observed, not documented (see ADR 0149), and it
   * is what keeps a hit and a prune from waiting on each other in a cycle.
   *
   * A hit stating a different end than the stored row sets that row's end to its start, which the table's own window
   * check refuses: the whole statement fails and no bucket of the request is counted.
   */
  async recordHits(
    buckets: readonly RateLimitBucket[],
  ): Promise<readonly number[]> {
    requireValidBuckets(buckets);
    const columns = columnsOf(buckets);

    const rows = await queryRows<HitRow>("record hits", () =>
      retryOnTransientFailure(() =>
        refusingToRepeatAnEmptyReply(() => this.upsertHits(columns)),
      ),
    );

    return countsInRequestOrder(buckets, rows);
  }

  private upsertHits({ keys, starts, ends }: HitColumns) {
    return this.sql`
            insert into rate_limit_counters as counter (bucket_key, window_start, window_end, hits)
            select hit.bucket_key, hit.window_start, hit.window_end, 1
            from unnest(${keys}::text[], ${starts}::timestamptz[], ${ends}::timestamptz[])
              as hit (bucket_key, window_start, window_end)
            order by hit.bucket_key, hit.window_start
            on conflict (bucket_key, window_start)
            do update set
              hits = counter.hits + 1,
              window_end = case
                when counter.window_end = excluded.window_end then counter.window_end
                else counter.window_start
              end
            returning counter.bucket_key, counter.window_start, counter.hits
          `;
  }

  /** Locks the expired rows by key, then start, as a hit does: two statements locking shared rows in different orders
   *  deadlock. Repeating a delete is harmless, so any transient failure is repeated. */
  async pruneExpired(now: Date): Promise<number> {
    requireValidInstant(now);

    const rows = await queryRows<RemovedRow>("prune expired windows", () =>
      retryOnTransientFailure(
        () => this.sql`
            with expired as (
              select bucket_key, window_start from rate_limit_counters
              where window_end <= ${now.toISOString()}::timestamptz
              order by bucket_key, window_start
              for update
            ), removed as (
              delete from rate_limit_counters as counter
              using expired
              where counter.bucket_key = expired.bucket_key
                and counter.window_start = expired.window_start
              returning 1
            )
            select count(*)::int as removed from removed
          `,
      ),
    );

    return removedCountOf(rows);
  }
}

function columnsOf(buckets: readonly RateLimitBucket[]): HitColumns {
  return {
    keys: buckets.map((bucket) => bucket.key),
    starts: buckets.map((bucket) => bucket.window.startsAt.toISOString()),
    ends: buckets.map((bucket) => bucket.window.endsAt.toISOString()),
  };
}

/**
 * A repeated hit can be counted twice, so a count may err high (see ADR 0149). The repeat is accepted after a
 * cold-start refusal, so the first request after the database slept is not refused. It is not made after an empty
 * reply, which follows a reply that began well, so the hit most likely landed.
 */
async function refusingToRepeatAnEmptyReply<Result>(
  query: () => PromiseLike<Result>,
): Promise<Result> {
  try {
    return await query();
  } catch (error) {
    if (isTransientFailure(error) && !isNeonDbError(error)) {
      throw new UnrepeatableFailure(error);
    }
    throw error;
  }
}

/** Carries a failure past `retryOnTransientFailure`, which would otherwise repeat it. Never leaves this module. */
class UnrepeatableFailure extends Error {
  readonly original: unknown;

  constructor(original: unknown) {
    super("A failure that must not be repeated.");
    this.original = original;
  }
}

/** The rows of a statement, or the typed error: a failure, or a reply that is not a list of rows, never leaves as
 *  anything else. */
async function queryRows<Row>(
  operation: RateLimitOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<Row[]> {
  const reply = await runTranslatingFailures(operation, runQuery);
  if (!Array.isArray(reply) || !reply.every(isObject)) {
    throw new RateLimitStoreError(operation);
  }
  return reply as Row[];
}

/** Every driver failure leaves as a store error holding a built cause, as ADR 0146 B3 requires. */
async function runTranslatingFailures(
  operation: RateLimitOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<unknown> {
  try {
    return await runQuery();
  } catch (error) {
    const failure =
      error instanceof UnrepeatableFailure ? error.original : error;
    throw storeFailureFrom(operation, failure);
  }
}

function storeFailureFrom(
  operation: RateLimitOperation,
  failure: unknown,
): Error {
  return isWindowEndConflict(failure)
    ? new RateLimitWindowConflictError()
    : new RateLimitStoreError(operation, reducedCauseOf(failure));
}

const WINDOW_CHECK_VIOLATION = "23514";
const WINDOW_CHECK_NAME = "rate_limit_counters_window_is_not_empty";

function isWindowEndConflict(failure: unknown): boolean {
  return (
    isNeonDbError(failure) &&
    failure.code === WINDOW_CHECK_VIOLATION &&
    failure.constraint === WINDOW_CHECK_NAME
  );
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function countsInRequestOrder(
  buckets: readonly RateLimitBucket[],
  rows: readonly HitRow[],
): number[] {
  const hitsByIdentity = new Map(
    rows.map((row) => [
      identityFor(row.bucket_key, new Date(row.window_start).getTime()),
      row.hits,
    ]),
  );
  return buckets.map((bucket) => {
    const hits = hitsByIdentity.get(identityOf(bucket));
    if (!isCountOfAtLeast(FIRST_HIT, hits)) {
      throw new RateLimitStoreError("record hits");
    }
    return hits;
  });
}

function removedCountOf(rows: readonly RemovedRow[]): number {
  const removed = rows[0]?.removed;
  if (!isCountOfAtLeast(NONE_REMOVED, removed)) {
    throw new RateLimitStoreError("prune expired windows");
  }
  return removed;
}

/** A hit that was just counted is at least 1, and a prune may remove none: a fraction or a text is no count. */
const FIRST_HIT = 1;
const NONE_REMOVED = 0;

function isCountOfAtLeast(minimum: number, value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= minimum
  );
}
