import type {
  RateLimitStore,
  RateLimitWindow,
  WindowTotals,
} from "@lemnaria/persistence";

import {
  chisinauDateOf,
  chisinauDayOf,
  LONGEST_DAY_SECONDS,
} from "@/lib/server/rate-limit/chisinau-day";
import { MINT_DAILY_FIGURE } from "@/lib/server/rate-limit/limit-policy";

const MS_PER_HOUR = 3_600_000;
const SECONDS_PER_HOUR = 3600;

/** The oldest cutoff: the longest a Chișinău day lasts, so the first step removes whatever has been expired for a
 *  whole day and the days that ended last are read before they reach it. */
const OLDEST_CUTOFF_HOURS_BEFORE_NOW = LONGEST_DAY_SECONDS / SECONDS_PER_HOUR;

/** The newest cutoff. A window that ended less than this long ago is never removed, whatever the clock says. */
const NEWEST_CUTOFF_HOURS_BEFORE_NOW = 1;

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

/** One step of a night. A read's failure is written down and the night goes on; a prune's ends it. */
interface PruneStep {
  readonly run: () => Promise<number>;
  readonly endsTheRunWhenItFails: boolean;
}

const NONE_REMOVED = 0;

/**
 * Reads the totals of the two Chișinău days that ended last, oldest first, and removes expired windows with the
 * store's own statement, its cutoff stepped forward an hour at a time from twenty-five hours before the clock to one
 * hour before it, oldest first: so a day's totals are written before its rows go, unless its read failed, and nothing
 * that ended less than an hour ago ever does. A day with no bucket left writes no line: no line means no rows were
 * left. A read that fails, the naming of its day included, is written down and the prune still runs, since a table
 * that only grows is what the steps are for; a prune step that fails ends the run. Either way the night is `failed`,
 * so it is seen, and what the earlier steps removed stands.
 */
export async function pruneRateLimits(
  request: PruneRequest,
): Promise<PruneOutcome> {
  const steps = stepsOf(request);
  let removedAtLeast = 0;
  let hasFailed = false;
  for (const [index, step] of steps.entries()) {
    try {
      removedAtLeast += await step.run();
    } catch {
      hasFailed = true;
      reportFailedStep(request, { step: index + 1, steps, removedAtLeast });
      if (step.endsTheRunWhenItFails) break;
    }
  }
  return { status: hasFailed ? "failed" : "pruned", removedAtLeast };
}

function reportFailedStep(
  { report }: PruneRequest,
  {
    step,
    steps,
    removedAtLeast,
  }: { step: number; steps: readonly PruneStep[]; removedAtLeast: number },
): void {
  report({
    event: "rate-limit-prune-failed",
    step,
    stepCount: steps.length,
    removedAtLeast,
  });
}

function stepsOf(request: PruneRequest): PruneStep[] {
  const reads = ENDED_DAYS_AGO.map(
    (daysAgo): PruneStep => ({
      run: () => readTotalsOf(daysAgo, request),
      endsTheRunWhenItFails: false,
    }),
  );
  const prunes = cutoffsOf(request.instant).map(
    (cutoff): PruneStep => ({
      run: () => request.store.pruneExpired(cutoff),
      endsTheRunWhenItFails: true,
    }),
  );
  return [...reads, ...prunes];
}

/** The ended days read, oldest first: the day before the one that holds the instant, and the one before that. */
const ENDED_DAYS_AGO: readonly number[] = [2, 1];

/** The day that ended `daysAgo` days before the one holding the instant. Naming a day throws where the runtime cannot
 *  name the zone, so it is done inside the step that needs it. */
function endedDayOf(instant: Date, daysAgo: number): RateLimitWindow {
  let day = chisinauDayOf(instant);
  for (let ended = 0; ended < daysAgo; ended += 1) {
    day = chisinauDayOf(new Date(day.startsAt.getTime() - 1));
  }
  return day;
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
  daysAgo: number,
  { store, instant, report }: PruneRequest,
): Promise<number> {
  const day = endedDayOf(instant, daysAgo);
  const totals: WindowTotals = await store.totalsOfWindow(
    day,
    MINT_DAILY_FIGURE,
  );
  if (totals.buckets === 0) return NONE_REMOVED;
  report({
    event: "rate-limit-day-totals",
    date: chisinauDateOf(day.startsAt),
    buckets: totals.buckets,
    aboveFigure: totals.aboveFigure,
    largestCount: totals.largestCount,
  });
  return NONE_REMOVED;
}
