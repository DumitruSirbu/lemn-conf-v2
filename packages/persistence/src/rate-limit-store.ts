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

export function identityFor(key: string, startsAtMs: number): string {
  return `${key}@${String(startsAtMs)}`;
}
