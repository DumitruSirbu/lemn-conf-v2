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

/** What one hit is counted against: `key` is the SHA-256 digest of the bucket's identity, never the identity itself. */
export interface RateLimitBucket {
  readonly key: string;
  readonly window: RateLimitWindow;
}

export type RateLimitOperation = "record hits" | "prune expired windows";

export interface RateLimitStore {
  /**
   * Adds one hit to every bucket in one round trip and returns each bucket's count in its own window, in the order
   * given. A count includes this hit and comes from that window's row alone. Rejects with `RateLimitStoreError`
   * when the database gives no trustworthy answer; the caller refuses the request rather than counting it.
   */
  recordHits(buckets: readonly RateLimitBucket[]): Promise<readonly number[]>;
  /** Deletes every window that ended at or before `now` and returns how many rows went. Safe to run again. */
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

/** The one place a request's buckets are checked, by the Neon store and the fake alike. */
export function requireValidBuckets(buckets: readonly RateLimitBucket[]): void {
  const identities = new Set<string>();
  for (const bucket of buckets) {
    requireSha256Digest(bucket.key, "rate-limit bucket key", "count a hit");
    requireNonEmptyWindow(bucket.window);
    const identity = identityOf(bucket);
    if (identities.has(identity)) throw new Error(DUPLICATE_BUCKET_REFUSAL);
    identities.add(identity);
  }
}

/** Postgres refuses an upsert that reaches one row twice, and a count for a bucket listed twice has no single answer. */
const DUPLICATE_BUCKET_REFUSAL =
  "Refusing to count a hit: one request lists the same bucket in the same window twice, so its count would be ambiguous.";

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
  return `${key}@${String(window.startsAt.getTime())}`;
}

interface HitRow {
  bucket_key: string;
  window_start: Date | string;
  hits: unknown;
}

interface RemovedRow {
  removed: unknown;
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
   * 1…N once each. Rows go in `order by` key, so two requests sharing buckets lock them in the same order and cannot
   * deadlock. It names `rate_limit_counters` alone.
   */
  async recordHits(
    buckets: readonly RateLimitBucket[],
  ): Promise<readonly number[]> {
    requireValidBuckets(buckets);
    if (buckets.length === 0) return [];

    const keys = buckets.map((bucket) => bucket.key);
    const starts = buckets.map((bucket) =>
      bucket.window.startsAt.toISOString(),
    );
    const ends = buckets.map((bucket) => bucket.window.endsAt.toISOString());
    const rows = await failAsStoreError<HitRow>("record hits", () =>
      retryOnTransientFailure(() =>
        refusingToRepeatAnEmptyReply(
          () => this.sql`
            insert into rate_limit_counters as counter (bucket_key, window_start, window_end, hits)
            select hit.bucket_key, hit.window_start, hit.window_end, 1
            from unnest(${keys}::text[], ${starts}::timestamptz[], ${ends}::timestamptz[])
              as hit (bucket_key, window_start, window_end)
            order by hit.bucket_key, hit.window_start
            on conflict (bucket_key, window_start)
            do update set hits = counter.hits + 1
            returning counter.bucket_key, counter.window_start, counter.hits
          `,
        ),
      ),
    );

    return countsInRequestOrder(buckets, rows);
  }

  /** Repeating a delete is harmless, so any transient failure is repeated. */
  async pruneExpired(now: Date): Promise<number> {
    requireValidInstant(now);

    const rows = await failAsStoreError<RemovedRow>(
      "prune expired windows",
      () =>
        retryOnTransientFailure(
          () => this.sql`
            with removed as (
              delete from rate_limit_counters
              where window_end <= ${now.toISOString()}::timestamptz
              returning 1
            )
            select count(*)::int as removed from removed
          `,
        ),
    );

    return removedCountOf(rows);
  }
}

/** An empty reply can follow a hit that already committed, and repeating it would count that hit twice. Only the
 *  proxy's cold-start refusal, which ran nothing, is safe to repeat (ADR 0145 decision 1). */
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

/** Every driver failure leaves as a `RateLimitStoreError` holding a built cause, as ADR 0146 B3 requires. */
async function failAsStoreError<Row>(
  operation: RateLimitOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<Row[]> {
  const reply = await runKeepingNothingTheDriverThrew(operation, runQuery);
  if (!Array.isArray(reply)) throw new RateLimitStoreError(operation);
  return reply as Row[];
}

async function runKeepingNothingTheDriverThrew(
  operation: RateLimitOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<unknown> {
  try {
    return await runQuery();
  } catch (error) {
    const failure =
      error instanceof UnrepeatableFailure ? error.original : error;
    throw new RateLimitStoreError(operation, reducedCauseOf(failure));
  }
}

function countsInRequestOrder(
  buckets: readonly RateLimitBucket[],
  rows: readonly HitRow[],
): number[] {
  const hitsByIdentity = new Map(
    rows.map((row) => [
      `${row.bucket_key}@${String(new Date(row.window_start).getTime())}`,
      row.hits,
    ]),
  );
  return buckets.map((bucket) => {
    const hits = hitsByIdentity.get(identityOf(bucket));
    if (!isHitCount(hits)) throw new RateLimitStoreError("record hits");
    return hits;
  });
}

function removedCountOf(rows: readonly RemovedRow[]): number {
  const removed = rows[0]?.removed;
  if (!isRemovedCount(removed)) {
    throw new RateLimitStoreError("prune expired windows");
  }
  return removed;
}

/** A hit that was just counted is at least 1: a zero or a fraction is not a count. */
function isHitCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function isRemovedCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
