import type {
  RateLimitStore,
  RateLimitWindow,
  WindowTotals,
} from "@lemnaria/persistence";

import {
  chisinauDateOf,
  chisinauDayOf,
} from "@/lib/server/rate-limit/chisinau-day";
import { MINT_DAILY_FIGURE } from "@/lib/server/rate-limit/limit-policy";

const MS_PER_HOUR = 3_600_000;

/** The oldest cutoff: the longest a Chișinău day lasts plus an hour, so the first step removes whatever has been
 *  expired for a whole day and the days that ended last are read before they reach it. */
const OLDEST_CUTOFF_HOURS_BEFORE_NOW = 25;

/** The newest cutoff. A window that ended less than this long ago is never removed, whatever the clock says. */
const NEWEST_CUTOFF_HOURS_BEFORE_NOW = 1;

/** How many ended days are read before any row goes. */
const DAYS_REPORTED = 2;

/** What the prune is handed: the store, the server's own clock as an instant, and where its lines go. It reads no
 *  clock and no environment, and no value a request carried can reach it. */
export interface PruneRequest {
  readonly store: Pick<RateLimitStore, "pruneExpired" | "totalsOfWindow">;
  readonly instant: Date;
  readonly report: (line: PruneLine) => void;
}

/** The only two lines it writes: a day's totals as a date and three counts, and a failed step as its place. No key,
 *  subject, block, secret or error text. */
export type PruneLine =
  | {
      readonly event: "rate-limit-day-totals";
      readonly date: string;
      readonly buckets: number;
      readonly aboveFigure: number;
      readonly largestCount: number;
    }
  | {
      readonly event: "rate-limit-prune-failed";
      readonly step: number;
      readonly stepCount: number;
      readonly removedAtLeast: number;
    };

/** `removedAtLeast` is a lower bound: a statement repeated after a lost reply may have removed rows the repeat did
 *  not count. A failure leaves the earlier steps' removals standing. */
export type PruneOutcome =
  | { readonly status: "pruned"; readonly removedAtLeast: number }
  | { readonly status: "failed"; readonly removedAtLeast: number };

type PruneStep = () => Promise<number>;

/**
 * Reads the totals of the two Chișinău days that ended last, one line each and oldest first, and only then removes
 * expired windows with the store's own statement, its cutoff stepped forward an hour at a time from twenty-five hours
 * before the clock to one hour before it, oldest first: so a day's totals are written before its rows go, and nothing
 * that ended less than an hour ago ever does. The first step that fails ends the run and is written down; what the
 * earlier steps removed stands.
 */
export async function pruneRateLimits(
  request: PruneRequest,
): Promise<PruneOutcome> {
  const steps = stepsOf(request);
  let removedAtLeast = 0;
  for (const [index, step] of steps.entries()) {
    try {
      removedAtLeast += await step();
    } catch {
      request.report({
        event: "rate-limit-prune-failed",
        step: index + 1,
        stepCount: steps.length,
        removedAtLeast,
      });
      return { status: "failed", removedAtLeast };
    }
  }
  return { status: "pruned", removedAtLeast };
}

function stepsOf(request: PruneRequest): PruneStep[] {
  const reads = endedDaysOf(request.instant).map(
    (day): PruneStep =>
      () =>
        readTotalsOf(day, request),
  );
  const prunes = cutoffsOf(request.instant).map(
    (cutoff): PruneStep =>
      () =>
        request.store.pruneExpired(cutoff),
  );
  return [...reads, ...prunes];
}

/** The two days before the one that holds the instant, oldest first. */
function endedDaysOf(instant: Date): RateLimitWindow[] {
  const days: RateLimitWindow[] = [];
  let day = chisinauDayOf(instant);
  for (let ended = 0; ended < DAYS_REPORTED; ended += 1) {
    day = chisinauDayOf(new Date(day.startsAt.getTime() - 1));
    days.unshift(day);
  }
  return days;
}

/** One instant for each hour from the oldest cutoff to the newest, oldest first. */
function cutoffsOf(instant: Date): Date[] {
  const cutoffs: Date[] = [];
  for (
    let hours = OLDEST_CUTOFF_HOURS_BEFORE_NOW;
    hours >= NEWEST_CUTOFF_HOURS_BEFORE_NOW;
    hours -= 1
  ) {
    cutoffs.push(new Date(instant.getTime() - hours * MS_PER_HOUR));
  }
  return cutoffs;
}

async function readTotalsOf(
  day: RateLimitWindow,
  { store, report }: PruneRequest,
): Promise<number> {
  const totals: WindowTotals = await store.totalsOfWindow(
    day,
    MINT_DAILY_FIGURE,
  );
  report({
    event: "rate-limit-day-totals",
    date: chisinauDateOf(day.startsAt),
    buckets: totals.buckets,
    aboveFigure: totals.aboveFigure,
    largestCount: totals.largestCount,
  });
  return 0;
}
