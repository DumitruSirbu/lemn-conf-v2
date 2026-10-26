// Whether the daily digest lists a kitchen (ADR 0178 A-13, as amended by F6; ADR 0062 fifth Amendment point 5).
//
// A pure rule on facts. Whether the kitchen changed after staff saw it is a fact computed in SQL (`isChangedSinceSeen`):
// the revision is opaque above SQL (S-18, A-12), so no revision appears here and none is compared.

import type { RequestStatus } from "../staff/request-status.js";

/** The digest stops listing a kitchen this long after its FIRST send (`designs.sent_at`, OQ-10). */
export const DIGEST_WINDOW_DAYS = 30;

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;

/**
 * A fixed span of 30 x 24 hours, not 30 calendar days: a daylight-saving change inside the window must not move the
 * edge. The edge is exclusive: a kitchen sent exactly this long ago is already out.
 */
export const DIGEST_WINDOW_MS =
  DIGEST_WINDOW_DAYS * HOURS_PER_DAY * MS_PER_HOUR;

/** A kitchen at one of these statuses is no longer listed; the panel's badge stays (frame D10D). */
export const DIGEST_STOPPING_STATUSES = Object.freeze([
  "offer-sent",
  "closed",
] as const satisfies readonly RequestStatus[]);
export type DigestStoppingStatus = (typeof DIGEST_STOPPING_STATUSES)[number];

/** Every instant is epoch milliseconds: the domain holds no `Date` (see `chisinau-day.ts`). */
export interface DigestEligibilityFacts {
  readonly nowMs: number;
  /** The first send's instant; a second send of the same design does not move it. */
  readonly sentAtMs: number;
  /** The status shown for the kitchen (`shownRequestStatus`): a sent kitchen with none saved is `new`. */
  readonly status: RequestStatus;
  /** Whether the kitchen changed after staff last saw it, judged in SQL. */
  readonly isChangedSinceSeen: boolean;
  /** When staff last saw the kitchen; absent while it has never been seen. */
  readonly lastSeenAtMs?: number;
  /** When a digest last held the kitchen; absent while none has. */
  readonly lastDigestedAtMs?: number;
}

/**
 * All four conditions hold. An instant that is not a valid time fails closed: no e-mail is better than a repeated one.
 */
export function isDigestEligible(facts: DigestEligibilityFacts): boolean {
  return (
    hasOnlyValidInstants(facts) &&
    facts.isChangedSinceSeen &&
    !wasDigestedSinceLastSeen(facts) &&
    isWithinDigestWindow(facts) &&
    isStatusDigestible(facts.status)
  );
}

function hasOnlyValidInstants(facts: DigestEligibilityFacts): boolean {
  return [
    facts.nowMs,
    facts.sentAtMs,
    facts.lastSeenAtMs,
    facts.lastDigestedAtMs,
  ].every((instant) => instant === undefined || Number.isFinite(instant));
}

/**
 * "Each kitchen appears once per round of changes, and again only after it has been seen and changed again." A digest
 * held the kitchen in this round when it is at or after the last seen instant, and, for a kitchen never seen, when any
 * digest has held it. A tie counts as held: a repeated e-mail is the worse error.
 */
function wasDigestedSinceLastSeen(facts: DigestEligibilityFacts): boolean {
  const { lastSeenAtMs, lastDigestedAtMs } = facts;
  if (lastDigestedAtMs === undefined) return false;
  if (lastSeenAtMs === undefined) return true;
  return lastDigestedAtMs >= lastSeenAtMs;
}

function isWithinDigestWindow(facts: DigestEligibilityFacts): boolean {
  return facts.nowMs - facts.sentAtMs < DIGEST_WINDOW_MS;
}

function isStatusDigestible(status: RequestStatus): boolean {
  return !DIGEST_STOPPING_STATUSES.some((stopping) => stopping === status);
}
