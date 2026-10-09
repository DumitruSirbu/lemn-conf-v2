/**
 * The one place the live rate-limit suites are given the years their windows lie in. `pruneExpired` deletes every row
 * that ended at or before its instant, whoever wrote it, so a suite that asserts an exact prune count, or deletes what
 * an interrupted run left, relies on no other writer using its era. A new live suite takes a new era here.
 *
 * The eras are ordered: a prune by the contract suite, at an instant in its own era, also reaches a QA row left behind,
 * and a prune by the QA suite reaches nothing of the contract suite's.
 */
export interface RateLimitTestEra {
  readonly startsAtMs: number;
  readonly endsAtMs: number;
}

/** `qa-8e-rate-limit-live.adversarial.test.ts`. */
export const QA_8E_ERA: RateLimitTestEra = {
  startsAtMs: Date.UTC(1990, 0, 1),
  endsAtMs: Date.UTC(1991, 0, 1),
};

/** `delete-rate-limit-counters-for-tests.live.test.ts`. */
export const COUNTER_DELETE_SUITE_ERA: RateLimitTestEra = {
  startsAtMs: Date.UTC(2010, 0, 1),
  endsAtMs: Date.UTC(2011, 0, 1),
};

/** `neon-rate-limit-store.test.ts` and the contract suite it runs, `rate-limit-store-contract.ts`. */
export const CONTRACT_SUITE_ERA: RateLimitTestEra = {
  startsAtMs: Date.UTC(2001, 0, 1),
  endsAtMs: Date.UTC(2002, 0, 1),
};

/** `neon-rate-limit-totals.live.test.ts`. */
export const TOTALS_SUITE_ERA: RateLimitTestEra = {
  startsAtMs: Date.UTC(2015, 0, 1),
  endsAtMs: Date.UTC(2016, 0, 1),
};
