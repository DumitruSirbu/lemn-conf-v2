import "server-only";

import type { RateLimitStore } from "@lemnaria/persistence";
import { NeonRateLimitStore } from "@lemnaria/persistence";

let rateLimitStore: RateLimitStore | undefined;

/**
 * The rate-limit store's one instance, made on first use and never at import or build, so no connection is opened
 * where no limit is asked. A request that reaches it with no `DATABASE_URL` is unavailable, which the limiter answers.
 * It is a module of its own: what a test fakes is the database, and the files that mock `repository.ts` whole must
 * not take the limiter's store with it.
 */
export function getRateLimitStore(): RateLimitStore {
  rateLimitStore ??= new NeonRateLimitStore();
  return rateLimitStore;
}
