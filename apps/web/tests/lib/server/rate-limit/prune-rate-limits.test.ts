import { FakeRateLimitStore, type RateLimitStore } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import {
  chisinauDateOf,
  chisinauDayOf,
} from "@/lib/server/rate-limit/chisinau-day";
import { MINT_DAILY_FIGURE } from "@/lib/server/rate-limit/limit-policy";
import {
  pruneRateLimits,
  type PruneLine,
  type PruneOutcome,
} from "@/lib/server/rate-limit/prune-rate-limits";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

const HOUR_MS = 3_600_000;
const NOW = new Date("2026-10-09T03:30:00.000Z");
const STEPS_OF_THE_PRUNE = 25;
const TOTALS_READS = 2;

/** Hex keys no other test uses, one per call, so no two buckets are one. */
let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return keyCounter.toString(16).padStart(64, "0");
}

interface Call {
  readonly kind: "totals" | "prune";
  readonly at: Date;
  readonly figure?: number;
}

/** The fake, with every call written down in order and the nth (counting from one) made to fail. */
function recordingStore(failAtCall?: number) {
  const store = new FakeRateLimitStore();
  const calls: Call[] = [];
  const guarded = {
    pruneExpired: async (cutoff: Date) => {
      calls.push({ kind: "prune", at: cutoff });
      failIfDue();
      return store.pruneExpired(cutoff);
    },
    totalsOfWindow: async (
      window: { startsAt: Date; endsAt: Date },
      figure: number,
    ) => {
      calls.push({ kind: "totals", at: window.startsAt, figure });
      failIfDue();
      return store.totalsOfWindow(window, figure);
    },
  } satisfies Pick<RateLimitStore, "pruneExpired" | "totalsOfWindow">;
  function failIfDue(): void {
    if (calls.length === failAtCall)
      throw new Error("postgres://user:KEY-MARKER-9921@host/db");
  }
  return { store, guarded, calls };
}

async function run(
  guarded: Pick<RateLimitStore, "pruneExpired" | "totalsOfWindow">,
  instant: Date = NOW,
): Promise<{ outcome: PruneOutcome; lines: PruneLine[] }> {
  const lines: PruneLine[] = [];
  const outcome = await pruneRateLimits({
    store: guarded,
    instant,
    report: (line) => lines.push(line),
  });
  return { outcome, lines };
}

async function hit(
  store: FakeRateLimitStore,
  window: { startsAt: Date; endsAt: Date },
  times = 1,
) {
  const key = newKey();
  for (let count = 0; count < times; count += 1) {
    await store.recordHits([{ key, window }]);
  }
  return key;
}

/** Whether a bucket's row is still stored, by counting one more hit on it: 1 means it was gone. */
async function isStillCounting(
  store: FakeRateLimitStore,
  key: string,
  window: { startsAt: Date; endsAt: Date },
) {
  const [count] = await store.recordHits([{ key, window }]);
  return (count ?? 0) > 1;
}

describe("pruneRateLimits: the steps of one night, in order", () => {
  it("reads the two days' totals, then prunes from 25 hours before the clock hourly to one hour before", async () => {
    const { guarded, calls } = recordingStore();

    await run(guarded);

    expect(calls.map(({ kind }) => kind)).toEqual([
      ...new Array<string>(TOTALS_READS).fill("totals"),
      ...new Array<string>(STEPS_OF_THE_PRUNE).fill("prune"),
    ]);
    const cutoffs = calls
      .filter(({ kind }) => kind === "prune")
      .map(({ at }) => at.toISOString());
    expect(cutoffs).toEqual(
      Array.from({ length: STEPS_OF_THE_PRUNE }, (_unused, step) =>
        new Date(
          NOW.getTime() - (STEPS_OF_THE_PRUNE - step) * HOUR_MS,
        ).toISOString(),
      ),
    );
    expect(cutoffs[0]).toBe("2026-10-08T02:30:00.000Z");
    expect(cutoffs[STEPS_OF_THE_PRUNE - 1]).toBe("2026-10-09T02:30:00.000Z");
  });

  it("reads the two Chisinau days that ended last, oldest first, against the mint's figure", async () => {
    const { guarded, calls } = recordingStore();

    await run(guarded);

    const reads = calls.filter(({ kind }) => kind === "totals");
    expect(reads.map(({ at }) => at.toISOString())).toEqual(
      ["2026-10-06T21:00:00.000Z", "2026-10-07T21:00:00.000Z"].map(
        (start) => start,
      ),
    );
    expect(reads.map(({ figure }) => figure)).toEqual([
      MINT_DAILY_FIGURE,
      MINT_DAILY_FIGURE,
    ]);
  });

  it.each([
    [
      "an ordinary day",
      "2026-07-15T03:30:00.000Z",
      ["2026-07-13", "2026-07-14"],
    ],
    [
      "the day after the 23-hour day",
      "2026-03-30T03:30:00.000Z",
      ["2026-03-28", "2026-03-29"],
    ],
    [
      "the day after the 25-hour day",
      "2026-10-26T03:30:00.000Z",
      ["2026-10-24", "2026-10-25"],
    ],
    [
      "the instant of a local midnight",
      "2026-10-08T21:00:00.000Z",
      ["2026-10-07", "2026-10-08"],
    ],
    [
      "the last millisecond before a local midnight",
      "2026-10-08T20:59:59.999Z",
      ["2026-10-06", "2026-10-07"],
    ],
  ])(
    "names the days it totals by their dates for %s",
    async (_label, instant, dates) => {
      const { guarded } = recordingStore();

      const { lines } = await run(guarded, new Date(instant));

      const totalled = lines.filter(
        (line) => line.event === "rate-limit-day-totals",
      );
      expect(totalled.map((line) => line.date)).toEqual(dates);
    },
  );

  it("totals each day over the day's own window, whatever its length", async () => {
    const { guarded, calls } = recordingStore();
    const instant = new Date("2026-10-26T03:30:00.000Z");

    await run(guarded, instant);

    const reads = calls.filter(({ kind }) => kind === "totals");
    expect(reads.map(({ at }) => at.toISOString())).toEqual([
      chisinauDayOf(new Date("2026-10-24T12:00:00Z")).startsAt.toISOString(),
      chisinauDayOf(new Date("2026-10-25T12:00:00Z")).startsAt.toISOString(),
    ]);
  });
});

describe("pruneRateLimits: what goes and what stays", () => {
  it("removes what ended an hour before the clock or earlier and keeps what ended less than an hour ago", async () => {
    const { store, guarded } = recordingStore();
    const justUnderAnHour = {
      startsAt: new Date(NOW.getTime() - 2 * HOUR_MS),
      endsAt: new Date(NOW.getTime() - HOUR_MS + 1),
    };
    const exactlyAnHour = {
      startsAt: new Date(NOW.getTime() - 2 * HOUR_MS),
      endsAt: new Date(NOW.getTime() - HOUR_MS),
    };
    const aDayAgo = utcWindowOf(new Date(NOW.getTime() - 26 * HOUR_MS), 60);
    const aWeekAgo = utcWindowOf(new Date(NOW.getTime() - 170 * HOUR_MS), 60);
    const live = utcWindowOf(NOW, 60);
    const kept = await hit(store, justUnderAnHour);
    const keys = {
      exactlyAnHour: await hit(store, exactlyAnHour),
      aDayAgo: await hit(store, aDayAgo),
      aWeekAgo: await hit(store, aWeekAgo),
    };
    const liveKey = await hit(store, live);

    const { outcome } = await run(guarded);

    expect(outcome).toEqual({ status: "pruned", removedAtLeast: 3 });
    expect(await isStillCounting(store, kept, justUnderAnHour)).toBe(true);
    expect(await isStillCounting(store, liveKey, live)).toBe(true);
    expect(
      await isStillCounting(store, keys.exactlyAnHour, exactlyAnHour),
    ).toBe(false);
    expect(await isStillCounting(store, keys.aDayAgo, aDayAgo)).toBe(false);
    expect(await isStillCounting(store, keys.aWeekAgo, aWeekAgo)).toBe(false);
  });

  it("keeps every window ended under an hour ago and every live one, over a sweep of ends, with floors", async () => {
    const { store, guarded } = recordingStore();
    const planted: {
      key: string;
      window: { startsAt: Date; endsAt: Date };
      endedMsAgo: number;
    }[] = [];
    const minutesAgoOfEachEnd = [
      ...Array.from({ length: 180 }, (_unused, step) => step - 120),
      ...Array.from({ length: 250 }, (_unused, step) => 60 + step * 7),
    ];
    for (const minutesAgo of minutesAgoOfEachEnd) {
      const endsAt = new Date(NOW.getTime() - minutesAgo * 60_000);
      const window = { startsAt: new Date(endsAt.getTime() - HOUR_MS), endsAt };
      planted.push({
        key: await hit(store, window),
        window,
        endedMsAgo: minutesAgo * 60_000,
      });
    }
    const arms = { removed: 0, kept: 0 };

    await run(guarded);

    for (const { key, window, endedMsAgo } of planted) {
      const isKept = await isStillCounting(store, key, window);
      expect(isKept).toBe(endedMsAgo < HOUR_MS);
      arms[isKept ? "kept" : "removed"] += 1;
    }
    expect(arms.removed).toBeGreaterThanOrEqual(100);
    expect(arms.kept).toBeGreaterThanOrEqual(100);
  });

  it("says the rows it removed as at least, summed over the steps", async () => {
    const { store, guarded } = recordingStore();
    for (const hoursAgo of [30, 29, 10, 5]) {
      await hit(
        store,
        utcWindowOf(new Date(NOW.getTime() - hoursAgo * HOUR_MS), 60),
      );
    }

    const { outcome } = await run(guarded);

    expect(outcome).toEqual({ status: "pruned", removedAtLeast: 4 });
  });

  it("removes nothing and says none removed for an empty table, in 27 calls", async () => {
    const { guarded, calls } = recordingStore();

    const { outcome } = await run(guarded);

    expect(outcome).toEqual({ status: "pruned", removedAtLeast: 0 });
    expect(calls).toHaveLength(TOTALS_READS + STEPS_OF_THE_PRUNE);
  });

  it("is safe to run again at once: the second run removes nothing and a live count goes on", async () => {
    const { store, guarded } = recordingStore();
    const live = utcWindowOf(NOW, 60);
    const key = await hit(store, live);
    await hit(store, utcWindowOf(new Date(NOW.getTime() - 40 * HOUR_MS), 60));

    const first = await run(guarded);
    const second = await run(guarded);

    expect([first.outcome, second.outcome]).toEqual([
      { status: "pruned", removedAtLeast: 1 },
      { status: "pruned", removedAtLeast: 0 },
    ]);
    expect(await isStillCounting(store, key, live)).toBe(true);
  });
});

describe("pruneRateLimits: the totals' lines", () => {
  it("writes one line for each of the two days, holding the date and three counts and nothing else", async () => {
    const { store, guarded } = recordingStore();
    const lastDay = chisinauDayOf(new Date("2026-10-08T12:00:00Z"));
    const dayBefore = chisinauDayOf(new Date("2026-10-07T12:00:00Z"));
    await hit(store, dayBefore, 2);
    await hit(store, lastDay, 25);
    await hit(store, lastDay, 21);
    await hit(store, lastDay, 3);

    const { lines } = await run(guarded);

    expect(lines).toEqual([
      {
        event: "rate-limit-day-totals",
        date: chisinauDateOf(dayBefore.startsAt),
        buckets: 1,
        aboveFigure: 0,
        largestCount: 2,
      },
      {
        event: "rate-limit-day-totals",
        date: chisinauDateOf(lastDay.startsAt),
        buckets: 3,
        aboveFigure: 2,
        largestCount: 25,
      },
    ]);
    expect(Reflect.ownKeys(lines[0] ?? {})).toEqual([
      "event",
      "date",
      "buckets",
      "aboveFigure",
      "largestCount",
    ]);
  });

  it("reads each day before its rows can go: the older day is totalled though the first step removes it", async () => {
    const { store, guarded } = recordingStore();
    const olderDay = chisinauDayOf(new Date("2026-10-07T12:00:00Z"));
    await hit(store, olderDay, 4);

    const { lines } = await run(guarded);

    expect(olderDay.endsAt.getTime()).toBeLessThan(
      NOW.getTime() - 25 * HOUR_MS,
    );
    expect(lines[0]).toMatchObject({
      date: "2026-10-07",
      buckets: 1,
      largestCount: 4,
    });
    expect(await store.totalsOfWindow(olderDay, MINT_DAILY_FIGURE)).toEqual({
      buckets: 0,
      aboveFigure: 0,
      largestCount: 0,
    });
  });
});

describe("pruneRateLimits: a step that fails", () => {
  it("leaves the first two done and ends at the third, answering failed with the place and no error", async () => {
    const { store, guarded, calls } = recordingStore(3);
    await hit(store, utcWindowOf(new Date(NOW.getTime() - 40 * HOUR_MS), 60));

    const { outcome, lines } = await run(guarded);

    expect(outcome).toEqual({ status: "failed", removedAtLeast: 0 });
    expect(calls.map(({ kind }) => kind)).toEqual([
      "totals",
      "totals",
      "prune",
    ]);
    expect(lines.map((line) => line.event)).toEqual([
      "rate-limit-day-totals",
      "rate-limit-day-totals",
      "rate-limit-prune-failed",
    ]);
    expect(lines[2]).toEqual({
      event: "rate-limit-prune-failed",
      step: 3,
      stepCount: TOTALS_READS + STEPS_OF_THE_PRUNE,
      removedAtLeast: 0,
    });
    expect(JSON.stringify({ outcome, lines })).not.toMatch(
      /MARKER|postgres|KEY/,
    );
  });

  it("keeps what the steps before it removed when a later prune step fails", async () => {
    const { store, guarded, calls } = recordingStore(TOTALS_READS + 3);
    const old = utcWindowOf(new Date(NOW.getTime() - 40 * HOUR_MS), 60);
    const key = await hit(store, old);

    const { outcome } = await run(guarded);

    expect(outcome).toEqual({ status: "failed", removedAtLeast: 1 });
    expect(calls).toHaveLength(TOTALS_READS + 3);
    expect(await isStillCounting(store, key, old)).toBe(false);
  });

  it("stops before any row goes when a day's totals cannot be read, so no day is pruned unreported", async () => {
    const { store, guarded, calls } = recordingStore(1);
    const old = utcWindowOf(new Date(NOW.getTime() - 40 * HOUR_MS), 60);
    const key = await hit(store, old);

    const { outcome, lines } = await run(guarded);

    expect(outcome).toEqual({ status: "failed", removedAtLeast: 0 });
    expect(calls.map(({ kind }) => kind)).toEqual(["totals"]);
    expect(lines).toEqual([
      {
        event: "rate-limit-prune-failed",
        step: 1,
        stepCount: TOTALS_READS + STEPS_OF_THE_PRUNE,
        removedAtLeast: 0,
      },
    ]);
    expect(await isStillCounting(store, key, old)).toBe(true);
  });

  it("asks no step after the one that failed, whichever it is", async () => {
    for (
      let failAt = 1;
      failAt <= TOTALS_READS + STEPS_OF_THE_PRUNE;
      failAt += 1
    ) {
      const { guarded, calls } = recordingStore(failAt);

      const { outcome } = await run(guarded);

      expect(outcome.status).toBe("failed");
      expect(calls).toHaveLength(failAt);
    }
  });
});

describe("pruneRateLimits: where its instant comes from", () => {
  it("steps from the instant it is handed and from nothing else", async () => {
    const later = new Date("2027-01-20T03:30:00.000Z");
    const { guarded, calls } = recordingStore();

    await run(guarded, later);

    const cutoffs = calls
      .filter(({ kind }) => kind === "prune")
      .map(({ at }) => at.getTime());
    expect(cutoffs[0]).toBe(later.getTime() - 25 * HOUR_MS);
    expect(cutoffs[cutoffs.length - 1]).toBe(later.getTime() - HOUR_MS);
  });
});

describe("prune-rate-limits.ts", () => {
  const source = readSource("lib/server/rate-limit/prune-rate-limits.ts");

  it("reads source: takes its instant and its sink from its caller, naming no clock, environment or console", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(
      /Date\.now|new Date\(\)|performance\.|console\./,
    );
  });

  it("reads source: its lines are built from a date and counts alone, with no key, subject or block in reach", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(code).not.toMatch(/bucket_key|\bkey\b|subject|block|secret/i);
  });
});
