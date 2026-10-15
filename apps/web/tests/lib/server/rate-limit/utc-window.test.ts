import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { secondsToWindowEnd } from "@/lib/server/rate-limit/chisinau-day";
import {
  MINUTES_PER_DAY,
  utcWindowOf,
} from "@/lib/server/rate-limit/utc-window";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

const SEED = 10_102_026;
const NUMBER_OF_RUNS = 1000;
const MIN_PER_ARM = 100;
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
const SIXTY = 60;
const TEN = 10;

/** Every length the window may have: the divisors of a day. */
const MINUTES_THAT_TILE_THE_DAY = [
  1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 32, 36, 40, 45, 48,
  60, 72, 80, 90, 96, 120, 144, 160, 180, 240, 288, 360, 480, 720, 1440,
];

function edgesOf(instant: string, minutes: number): [string, string] {
  const { startsAt, endsAt } = utcWindowOf(new Date(instant), minutes);
  return [startsAt.toISOString(), endsAt.toISOString()];
}

describe("utcWindowOf: the edges of a window of whole minutes on the UTC clock", () => {
  it("gives the clock hour for sixty minutes, from its first millisecond to its last", () => {
    const hour = ["2026-07-15T12:00:00.000Z", "2026-07-15T13:00:00.000Z"];

    expect(edgesOf("2026-07-15T12:00:00.000Z", SIXTY)).toEqual(hour);
    expect(edgesOf("2026-07-15T12:34:56.789Z", SIXTY)).toEqual(hour);
    expect(edgesOf("2026-07-15T12:59:59.999Z", SIXTY)).toEqual(hour);
  });

  it("starts the next hour at the old one's end, which belongs to the next and not to the old", () => {
    expect(edgesOf("2026-07-15T13:00:00.000Z", SIXTY)).toEqual([
      "2026-07-15T13:00:00.000Z",
      "2026-07-15T14:00:00.000Z",
    ]);
  });

  it("gives a minute's edge to the minute it starts: 12:34:59.999 and 12:35:00.000 are two windows", () => {
    expect(edgesOf("2026-07-15T12:34:59.999Z", 1)).toEqual([
      "2026-07-15T12:34:00.000Z",
      "2026-07-15T12:35:00.000Z",
    ]);
    expect(edgesOf("2026-07-15T12:35:00.000Z", 1)).toEqual([
      "2026-07-15T12:35:00.000Z",
      "2026-07-15T12:36:00.000Z",
    ]);
  });

  it("gives ten-minute windows that begin on the ten-minute marks of the hour", () => {
    expect(edgesOf("2026-07-15T12:09:59.999Z", TEN)).toEqual([
      "2026-07-15T12:00:00.000Z",
      "2026-07-15T12:10:00.000Z",
    ]);
    expect(edgesOf("2026-07-15T12:10:00.000Z", TEN)).toEqual([
      "2026-07-15T12:10:00.000Z",
      "2026-07-15T12:20:00.000Z",
    ]);
    expect(edgesOf("2026-07-15T12:59:59.999Z", TEN)).toEqual([
      "2026-07-15T12:50:00.000Z",
      "2026-07-15T13:00:00.000Z",
    ]);
  });

  it("carries a window over midnight in UTC, and its length is a day for 1,440 minutes", () => {
    expect(edgesOf("2026-07-15T23:30:00.000Z", SIXTY)).toEqual([
      "2026-07-15T23:00:00.000Z",
      "2026-07-16T00:00:00.000Z",
    ]);
    expect(edgesOf("2026-07-15T23:30:00.000Z", MINUTES_PER_DAY)).toEqual([
      "2026-07-15T00:00:00.000Z",
      "2026-07-16T00:00:00.000Z",
    ]);
  });

  it("is the same on the days the Chisinau clock changes, since it knows no zone", () => {
    expect(edgesOf("2026-03-29T01:30:00.000Z", SIXTY)).toEqual([
      "2026-03-29T01:00:00.000Z",
      "2026-03-29T02:00:00.000Z",
    ]);
    expect(edgesOf("2026-10-25T01:30:00.000Z", SIXTY)).toEqual([
      "2026-10-25T01:00:00.000Z",
      "2026-10-25T02:00:00.000Z",
    ]);
  });

  it("windows an instant before the epoch by the same rule", () => {
    expect(edgesOf("1969-12-31T23:59:59.999Z", SIXTY)).toEqual([
      "1969-12-31T23:00:00.000Z",
      "1970-01-01T00:00:00.000Z",
    ]);
  });

  it("answers a fresh window each call, so no caller moves another's edges", () => {
    const instant = new Date("2026-07-15T12:00:00Z");
    const first = utcWindowOf(instant, SIXTY);

    first.startsAt.setTime(0);

    expect(utcWindowOf(instant, SIXTY).startsAt.toISOString()).toBe(
      "2026-07-15T12:00:00.000Z",
    );
  });
});

describe("utcWindowOf: what it refuses", () => {
  it.each([
    ["nought", 0],
    ["a negative", -60],
    ["a fraction", 7.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["seven, which does not divide a day", 7],
    ["a day and a minute", MINUTES_PER_DAY + 1],
    ["two days", 2 * MINUTES_PER_DAY],
  ])(
    "throws a RangeError for %s minutes, naming no value",
    (_label, minutes) => {
      let thrown: unknown;
      try {
        utcWindowOf(new Date("2026-07-15T12:00:00Z"), minutes);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(RangeError);
      expect((thrown as RangeError).message).not.toMatch(/[0-9]/);
    },
  );

  it("throws a RangeError for an instant that is no date", () => {
    expect(() => utcWindowOf(new Date(Number.NaN), SIXTY)).toThrow(RangeError);
  });
});

type Where = "first millisecond" | "last millisecond" | "inside";

interface Sample {
  readonly ms: number;
  readonly minutes: number;
  readonly where: Where;
}

/** An instant in a window of any length a day divides by, chosen at the window's two edges as often as inside it. */
const SAMPLES: fc.Arbitrary<Sample> = fc
  .tuple(
    fc.constantFrom(...MINUTES_THAT_TILE_THE_DAY),
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.constantFrom<Where>("first millisecond", "last millisecond", "inside"),
    fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
  )
  .map(([minutes, windowIndex, where, fraction]) => {
    const lengthMs = minutes * MINUTE_MS;
    const offsets: Record<Where, number> = {
      "first millisecond": 0,
      "last millisecond": lengthMs - 1,
      inside: Math.floor(fraction * lengthMs),
    };
    return { ms: windowIndex * lengthMs + offsets[where], minutes, where };
  });

function countedByWhere(): Record<Where, number> {
  return { "first millisecond": 0, "last millisecond": 0, inside: 0 };
}

describe("utcWindowOf: windows tile the clock, over every length a day divides by", () => {
  it("holds the instant, one length wide, from a multiple of its length, the next beginning at its end", () => {
    const seen = countedByWhere();
    fc.assert(
      fc.property(SAMPLES, ({ ms, minutes, where }) => {
        const lengthMs = minutes * MINUTE_MS;
        const window = utcWindowOf(new Date(ms), minutes);
        const next = utcWindowOf(window.endsAt, minutes);

        expect(window.startsAt.getTime()).toBeLessThanOrEqual(ms);
        expect(ms).toBeLessThan(window.endsAt.getTime());
        expect(window.endsAt.getTime() - window.startsAt.getTime()).toBe(
          lengthMs,
        );
        expect(window.startsAt.getTime() % lengthMs).toBe(0);
        expect(next.startsAt.getTime()).toBe(window.endsAt.getTime());
        seen[where] += 1;
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(Object.values(seen).every((count) => count >= MIN_PER_ARM)).toBe(
      true,
    );
  });

  it("puts each window's edges on the clock: whole minutes, and on the marks for a length dividing the hour", () => {
    const seen = { dividesTheHour: 0, longerThanTheHour: 0 };
    fc.assert(
      fc.property(SAMPLES, ({ ms, minutes }) => {
        const { startsAt } = utcWindowOf(new Date(ms), minutes);
        const minuteOfDay =
          startsAt.getUTCHours() * SIXTY + startsAt.getUTCMinutes();

        expect(startsAt.getUTCSeconds()).toBe(0);
        expect(startsAt.getUTCMilliseconds()).toBe(0);
        expect(minuteOfDay % minutes).toBe(0);
        seen[SIXTY % minutes === 0 ? "dividesTheHour" : "longerThanTheHour"] +=
          1;
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(seen.dividesTheHour).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(seen.longerThanTheHour).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });
});

describe("the seconds to the end of a UTC window", () => {
  it("is the whole length at the first millisecond and one at the last, for the hour", () => {
    const start = Date.parse("2026-07-15T12:00:00.000Z");
    const window = utcWindowOf(new Date(start), SIXTY);

    expect(secondsToWindowEnd(window, new Date(start))).toBe(SIXTY * SIXTY);
    expect(secondsToWindowEnd(window, new Date(start + 1))).toBe(SIXTY * SIXTY);
    expect(
      secondsToWindowEnd(
        window,
        new Date(start + SIXTY * SIXTY * SECOND_MS - 1),
      ),
    ).toBe(1);
  });

  it("counts down a ten-minute window one second at a time, from 600 to 1, each value reached", () => {
    const start = Date.parse("2026-07-15T12:10:00.000Z");
    const window = utcWindowOf(new Date(start), TEN);
    const waits = new Set<number>();

    for (let second = 0; second < TEN * SIXTY; second += 1) {
      waits.add(
        secondsToWindowEnd(window, new Date(start + second * SECOND_MS)),
      );
    }

    expect(waits.size).toBe(TEN * SIXTY);
    expect(Math.min(...waits)).toBe(1);
    expect(Math.max(...waits)).toBe(TEN * SIXTY);
  });

  it("is from 1 to the window's length for every instant of every length, with a floor on each end", () => {
    const seen = countedByWhere();
    fc.assert(
      fc.property(SAMPLES, ({ ms, minutes, where }) => {
        const window = utcWindowOf(new Date(ms), minutes);
        const wait = secondsToWindowEnd(window, new Date(ms));

        expect(Number.isInteger(wait)).toBe(true);
        expect(wait).toBeGreaterThanOrEqual(1);
        expect(wait).toBeLessThanOrEqual(minutes * SIXTY);
        if (where === "first millisecond") expect(wait).toBe(minutes * SIXTY);
        if (where === "last millisecond") expect(wait).toBe(1);
        seen[where] += 1;
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(Object.values(seen).every((count) => count >= MIN_PER_ARM)).toBe(
      true,
    );
  });
});

describe("utc-window.ts", () => {
  const source = readSource("lib/server/rate-limit/utc-window.ts");

  it("reads source: takes the instant it is handed and names no clock, environment, build mode or zone", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(
      /Date\.now|new Date\(\)|performance\.|Intl\.|timeZone|console\./,
    );
  });
});
