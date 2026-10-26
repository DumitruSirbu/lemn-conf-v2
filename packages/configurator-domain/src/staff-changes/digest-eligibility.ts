// Whether the daily digest lists a kitchen (ADR 0178 A-13), judged on facts; the revision-based facts come from SQL.

import type { RequestStatus } from "../staff/request-status.js";

/** A kitchen drops out this many days after its first send. */
export const DIGEST_WINDOW_DAYS = 30;

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;

/** Fixed hours, not calendar days, so a clock change inside the window never moves the exclusive edge. */
export const DIGEST_WINDOW_MS =
  DIGEST_WINDOW_DAYS * HOURS_PER_DAY * MS_PER_HOUR;

/** A kitchen at one of these statuses is no longer listed. */
export const DIGEST_STOPPING_STATUSES = Object.freeze([
  "offer-sent",
  "closed",
] as const satisfies readonly RequestStatus[]);
export type DigestStoppingStatus = (typeof DIGEST_STOPPING_STATUSES)[number];

/** Instants are epoch milliseconds: the domain holds no `Date`. */
export interface DigestEligibilityFacts {
  readonly nowMs: number;
  /** The first send's instant. */
  readonly sentAtMs: number;
  readonly status: RequestStatus;
  /** The kitchen's revision differs from the one staff last saw, judged in SQL. */
  readonly isChangedSinceSeen: boolean;
  /** A digest entry exists for a revision greater than the one staff last saw, judged in SQL. */
  readonly isDigestedSinceSeen: boolean;
}

/** An instant that is not finite fails closed: no e-mail is better than a repeated one. */
export function isDigestEligible(facts: DigestEligibilityFacts): boolean {
  return (
    Number.isFinite(facts.nowMs) &&
    Number.isFinite(facts.sentAtMs) &&
    facts.isChangedSinceSeen &&
    !facts.isDigestedSinceSeen &&
    isWithinDigestWindow(facts) &&
    isStatusDigestible(facts.status)
  );
}

function isWithinDigestWindow(facts: DigestEligibilityFacts): boolean {
  return facts.nowMs - facts.sentAtMs < DIGEST_WINDOW_MS;
}

function isStatusDigestible(status: RequestStatus): boolean {
  return !DIGEST_STOPPING_STATUSES.some((stopping) => stopping === status);
}
