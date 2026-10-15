import {
  RateLimitWindowConflictError,
  identityOf,
  requireValidBuckets,
  requireValidInstant,
  requireValidTotalsRequest,
} from "./rate-limit-store.js";
import type {
  RateLimitBucket,
  RateLimitStore,
  RateLimitWindow,
  WindowTotals,
} from "./rate-limit-store.js";

interface CountedWindow {
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  hits: number;
}

/** In-memory `RateLimitStore` for tests that need the port's contract without a database. It keys a count by bucket
 *  and window start and expires a window at its end, as `NeonRateLimitStore` does. */
export class FakeRateLimitStore implements RateLimitStore {
  private readonly windowsByIdentity = new Map<string, CountedWindow>();

  // eslint-disable-next-line @typescript-eslint/require-await -- a rejected promise for a refusal, as the Neon store gives.
  async recordHits(
    buckets: readonly RateLimitBucket[],
  ): Promise<readonly number[]> {
    requireValidBuckets(buckets);
    this.requireStoredEndsToAgree(buckets);
    return buckets.map((bucket) => this.addHit(bucket));
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see recordHits.
  async pruneExpired(now: Date): Promise<number> {
    requireValidInstant(now);
    const expired = [...this.windowsByIdentity].filter(
      ([, window]) => window.endsAtMs <= now.getTime(),
    );
    for (const [identity] of expired) this.windowsByIdentity.delete(identity);
    return expired.length;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see recordHits.
  async totalsOfWindow(
    window: RateLimitWindow,
    figure: number,
  ): Promise<WindowTotals> {
    requireValidTotalsRequest(window, figure);
    const held = [...this.windowsByIdentity.values()].filter(
      (counted) =>
        counted.startsAtMs === window.startsAt.getTime() &&
        counted.endsAtMs === window.endsAt.getTime(),
    );
    return {
      buckets: held.length,
      aboveFigure: held.filter((counted) => counted.hits > figure).length,
      largestCount: held.reduce(
        (largest, counted) => Math.max(largest, counted.hits),
        0,
      ),
    };
  }

  private requireStoredEndsToAgree(buckets: readonly RateLimitBucket[]): void {
    const disagrees = buckets.some((bucket) => {
      const stored = this.windowsByIdentity.get(identityOf(bucket));
      return (
        stored !== undefined &&
        stored.endsAtMs !== bucket.window.endsAt.getTime()
      );
    });
    if (disagrees) throw new RateLimitWindowConflictError();
  }

  private addHit(bucket: RateLimitBucket): number {
    const identity = identityOf(bucket);
    const counted = this.windowsByIdentity.get(identity) ?? {
      startsAtMs: bucket.window.startsAt.getTime(),
      endsAtMs: bucket.window.endsAt.getTime(),
      hits: 0,
    };
    counted.hits += 1;
    this.windowsByIdentity.set(identity, counted);
    return counted.hits;
  }
}
