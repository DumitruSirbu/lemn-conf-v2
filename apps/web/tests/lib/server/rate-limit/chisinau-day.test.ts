import { describe, expect, it } from "vitest";

import {
  chisinauDayOf,
  LONGEST_DAY_SECONDS,
  secondsToWindowEnd,
} from "@/lib/server/rate-limit/chisinau-day";

import { readSource } from "../server-source-support";

const HOUR_MS = 3_600_000;
const SECOND_MS = 1000;

function windowOf(instant: string): [string, string] {
  const { startsAt, endsAt } = chisinauDayOf(new Date(instant));
  return [startsAt.toISOString(), endsAt.toISOString()];
}

describe("chisinauDayOf: the days the zone changes its clock, as literal instants", () => {
  // Each of these four instants is a local midnight in Chișinău on the runtime's own Intl data.
  const DAYS: readonly [string, string, string, string, number][] = [
    [
      "a 23-hour day, 2026-03-29, from an instant in its middle",
      "2026-03-29T12:00:00Z",
      "2026-03-28T22:00:00.000Z",
      "2026-03-29T21:00:00.000Z",
      23,
    ],
    [
      "a 25-hour day, 2026-10-25, from an instant in its middle",
      "2026-10-25T12:00:00Z",
      "2026-10-24T21:00:00.000Z",
      "2026-10-25T22:00:00.000Z",
      25,
    ],
    [
      "a winter day of 24 hours",
      "2026-01-15T12:00:00Z",
      "2026-01-14T22:00:00.000Z",
      "2026-01-15T22:00:00.000Z",
      24,
    ],
    [
      "a summer day of 24 hours",
      "2026-07-15T12:00:00Z",
      "2026-07-14T21:00:00.000Z",
      "2026-07-15T21:00:00.000Z",
      24,
    ],
  ];

  it.each(DAYS)("gives %s", (_label, instant, startsAt, endsAt, hours) => {
    expect(windowOf(instant)).toEqual([startsAt, endsAt]);
    expect(
      (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / HOUR_MS,
    ).toBe(hours);
  });

  it.each([
    [
      "the first millisecond of the 23-hour day",
      "2026-03-28T22:00:00.000Z",
      "2026-03-28T22:00:00.000Z",
    ],
    [
      "the last millisecond of the 23-hour day",
      "2026-03-29T20:59:59.999Z",
      "2026-03-28T22:00:00.000Z",
    ],
    [
      "the first millisecond of the day after it",
      "2026-03-29T21:00:00.000Z",
      "2026-03-29T21:00:00.000Z",
    ],
    [
      "the first millisecond of the 25-hour day",
      "2026-10-24T21:00:00.000Z",
      "2026-10-24T21:00:00.000Z",
    ],
    [
      "the last millisecond of the 25-hour day",
      "2026-10-25T21:59:59.999Z",
      "2026-10-24T21:00:00.000Z",
    ],
    [
      "the first millisecond of the day after it",
      "2026-10-25T22:00:00.000Z",
      "2026-10-25T22:00:00.000Z",
    ],
  ])(
    "opens the day of %s at its local midnight",
    (_label, instant, startsAt) => {
      expect(windowOf(instant)[0]).toBe(startsAt);
    },
  );

  it("starts the day that follows exactly where one ends", () => {
    const march = chisinauDayOf(new Date("2026-03-29T12:00:00Z"));
    const next = chisinauDayOf(march.endsAt);

    expect(next.startsAt.getTime()).toBe(march.endsAt.getTime());
    expect(next.endsAt.toISOString()).toBe("2026-03-30T21:00:00.000Z");
  });
});

describe("secondsToWindowEnd", () => {
  it.each([
    ["the start of an ordinary day", "2026-01-14T22:00:00.000Z", 86_400],
    ["the start of the 23-hour day", "2026-03-28T22:00:00.000Z", 82_800],
    ["the start of the 25-hour day", "2026-10-24T21:00:00.000Z", 90_000],
    ["the last millisecond of a day", "2026-03-29T20:59:59.999Z", 1],
    ["one second before the end", "2026-03-29T20:59:59.000Z", 1],
    [
      "a millisecond over one second before the end",
      "2026-03-29T20:59:58.999Z",
      2,
    ],
    ["the middle of the 25-hour day", "2026-10-25T09:30:00.000Z", 45_000],
  ])("is %s: %i seconds", (_label, instant, seconds) => {
    const at = new Date(instant);

    expect(secondsToWindowEnd(chisinauDayOf(at), at)).toBe(seconds);
  });

  it("is the longest a day can leave", () => {
    expect(LONGEST_DAY_SECONDS).toBe(90_000);
  });
});

/** The zone's wall clock at an instant, read through Intl by the test itself. */
function wallClock(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(instant);
}

describe("chisinauDayOf: every day across three years", () => {
  const FIRST = Date.parse("2025-01-01T00:00:00Z");
  const LAST = Date.parse("2028-01-01T00:00:00Z");
  const STEP_MS = 7 * HOUR_MS + 23 * 60_000;

  it("holds each instant in a whole day from one local midnight to the next, with a floor on each length", () => {
    const lengths = { 23: 0, 24: 0, 25: 0 };
    const wrong: string[] = [];
    let previous: { startsAt: Date; endsAt: Date } | undefined;
    for (let ms = FIRST; ms < LAST; ms += STEP_MS) {
      const instant = new Date(ms);
      const window = chisinauDayOf(instant);
      const hours =
        (window.endsAt.getTime() - window.startsAt.getTime()) / HOUR_MS;
      const isWholeDay = hours === 23 || hours === 24 || hours === 25;
      const isInside =
        window.startsAt.getTime() <= ms && ms < window.endsAt.getTime();
      const opensAtMidnight = wallClock(window.startsAt).endsWith("00:00:00");
      const closesAtMidnight = wallClock(
        new Date(window.endsAt.getTime() - SECOND_MS),
      ).endsWith("23:59:59");
      const seconds = secondsToWindowEnd(window, instant);
      const isContiguous =
        previous === undefined ||
        window.startsAt.getTime() === previous.startsAt.getTime() ||
        window.startsAt.getTime() === previous.endsAt.getTime();
      if (
        !(
          isWholeDay &&
          isInside &&
          opensAtMidnight &&
          closesAtMidnight &&
          isContiguous &&
          seconds >= 1 &&
          seconds <= LONGEST_DAY_SECONDS
        )
      ) {
        wrong.push(instant.toISOString());
      }
      if (isWholeDay) lengths[hours] += 1;
      previous = window;
    }

    expect(wrong).toEqual([]);
    expect(lengths[23]).toBeGreaterThanOrEqual(3);
    expect(lengths[25]).toBeGreaterThanOrEqual(3);
    expect(lengths[24]).toBeGreaterThanOrEqual(500);
  });

  it("gives equal windows to every instant of one day, at the edges and in the small hours", () => {
    const edges = [
      "2026-03-28T22:00:00.000Z",
      "2026-03-29T01:00:00.000Z",
      "2026-03-29T00:59:59.999Z",
      "2026-03-29T12:00:00.000Z",
      "2026-03-29T20:59:59.999Z",
    ];

    expect(
      new Set(edges.map(windowOf).map((window) => window.join("/"))).size,
    ).toBe(1);
  });
});

describe("chisinau-day.ts", () => {
  const source = readSource("lib/server/rate-limit/chisinau-day.ts");

  it("refuses an instant that is not a date", () => {
    expect(() => chisinauDayOf(new Date(Number.NaN))).toThrow(RangeError);
  });

  it("reads source: reads no clock, no environment, no build mode and imports no dependency", () => {
    expect(source).not.toMatch(/Date\.now|new Date\(\)|performance\./);
    expect(source).not.toMatch(/process\.env|NODE_ENV/);
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual(["@lemnaria/persistence"]);
    expect(source).toMatch(
      /import type \{ RateLimitWindow \} from "@lemnaria\/persistence"/,
    );
  });
});
