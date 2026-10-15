import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { isNeonDbError } from "./open-database.js";
import {
  RateLimitStoreError,
  RateLimitWindowConflictError,
  identityFor,
  identityOf,
  requireValidBuckets,
  requireValidInstant,
  requireValidTotalsRequest,
} from "./rate-limit-store.js";
import type {
  RateLimitBucket,
  RateLimitOperation,
  RateLimitStore,
  RateLimitWindow,
  WindowTotals,
} from "./rate-limit-store.js";
import {
  isTransientFailure,
  retryOnTransientFailure,
} from "./retry-on-transient-failure.js";

interface HitRow {
  bucket_key: string;
  window_start: Date | string;
  hits: unknown;
}

interface RemovedRow {
  removed: unknown;
}

interface TotalsRow {
  buckets: unknown;
  above_figure: unknown;
  largest_count: unknown;
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

  /**
   * Three numbers over the rows of one window, chosen by its exact start and end: hour rows and day rows share the
   * table, and a day's totals must not hold an hour's. A read, so any transient failure is repeated.
   */
  async totalsOfWindow(
    window: RateLimitWindow,
    figure: number,
  ): Promise<WindowTotals> {
    requireValidTotalsRequest(window, figure);

    const rows = await queryRows<TotalsRow>("total a window", () =>
      retryOnTransientFailure(
        () => this.sql`
            select
              count(*)::int as buckets,
              (count(*) filter (where hits > ${figure}))::int as above_figure,
              coalesce(max(hits), 0)::int as largest_count
            from rate_limit_counters
            where window_start = ${window.startsAt.toISOString()}::timestamptz
              and window_end = ${window.endsAt.toISOString()}::timestamptz
          `,
      ),
    );

    return totalsFrom(rows);
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

function totalsFrom(rows: readonly TotalsRow[]): WindowTotals {
  const row = rows[0];
  const buckets = row?.buckets;
  const aboveFigure = row?.above_figure;
  const largestCount = row?.largest_count;
  if (
    rows.length !== 1 ||
    !isCountOfAtLeast(NONE_REMOVED, buckets) ||
    !isCountOfAtLeast(NONE_REMOVED, aboveFigure) ||
    !isCountOfAtLeast(NONE_REMOVED, largestCount) ||
    aboveFigure > buckets
  ) {
    throw new RateLimitStoreError("total a window");
  }
  return { buckets, aboveFigure, largestCount };
}

/** A hit that was just counted is at least 1, and a prune may remove none: a fraction or a text is no count. */
const FIRST_HIT = 1;
const NONE_REMOVED = 0;

function isCountOfAtLeast(minimum: number, value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= minimum
  );
}
