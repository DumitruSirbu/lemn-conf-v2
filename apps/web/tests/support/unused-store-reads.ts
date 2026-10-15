import type { RateLimitStore } from "@lemnaria/persistence";

/** The store's two methods a limiter test double never calls, so a double names only the one it answers with. */
export const UNUSED_STORE_READS: Pick<
  RateLimitStore,
  "pruneExpired" | "totalsOfWindow"
> = {
  pruneExpired: () => Promise.resolve(0),
  totalsOfWindow: () =>
    Promise.resolve({ buckets: 0, aboveFigure: 0, largestCount: 0 }),
};
