// How long ago a kitchen's card says it was changed (Lot 2 plan, criterion 20 and frame A9C). The age is clock arithmetic
// in the person's time zone, so the zone is pinned here to Chisinau, whose DST transitions fall inside the weeks these
// cases cross.
import { fc } from "@fast-check/vitest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  formatRelativeAge,
  relativeAgeOf,
  type RelativeAge,
} from "@/account/kitchens/relative-age";

import { CATALOGUES } from "../support/catalogues";

const PINNED_ZONE = "Europe/Chisinau";
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

let zoneBeforeTests: string | undefined;

beforeAll(() => {
  zoneBeforeTests = process.env.TZ;
  process.env.TZ = PINNED_ZONE;
});

afterAll(() => {
  if (zoneBeforeTests === undefined) delete process.env.TZ;
  else process.env.TZ = zoneBeforeTests;
});

/** A local wall-clock instant in the pinned zone. `month` is 1-based. */
function localMs(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const NOW_MS = localMs(2026, 6, 15, 12, 0);

function ageAt(secondsAgo: number): RelativeAge {
  return relativeAgeOf(NOW_MS - secondsAgo * MS_PER_SECOND, NOW_MS);
}

describe("the zone this file pins", () => {
  it("is Chisinau, with its DST transitions where the cases below expect them", () => {
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 6, 15, 12).getTimezoneOffset()).toBe(-180);
    const springForward = localMs(2026, 3, 30, 12) - localMs(2026, 3, 28, 12);
    const fallBack = localMs(2026, 10, 26, 12) - localMs(2026, 10, 24, 12);
    expect(springForward).toBe(2 * MS_PER_DAY - MS_PER_HOUR);
    expect(fallBack).toBe(2 * MS_PER_DAY + MS_PER_HOUR);
  });
});

describe("relativeAgeOf: the clock units", () => {
  it.each([
    [0, { value: 0, unit: "second" }],
    [1, { value: 0, unit: "second" }],
    [59, { value: 0, unit: "second" }],
    [60, { value: -1, unit: "minute" }],
    [61, { value: -1, unit: "minute" }],
    [119, { value: -1, unit: "minute" }],
    [120, { value: -2, unit: "minute" }],
    [59 * 60, { value: -59, unit: "minute" }],
    [60 * 60 - 1, { value: -59, unit: "minute" }],
    [60 * 60, { value: -1, unit: "hour" }],
    [2 * 3600 - 1, { value: -1, unit: "hour" }],
    [23 * 3600, { value: -23, unit: "hour" }],
    [24 * 3600 - 1, { value: -23, unit: "hour" }],
  ])("tells %i seconds as %j", (secondsAgo, expected) => {
    expect(ageAt(secondsAgo)).toEqual(expected);
  });

  it("tells a change dated after now as now (the server's clock is ahead of the browser's)", () => {
    expect(relativeAgeOf(NOW_MS + 5 * MS_PER_MINUTE, NOW_MS)).toEqual({
      value: 0,
      unit: "second",
    });
    expect(relativeAgeOf(NOW_MS + 400 * MS_PER_DAY, NOW_MS)).toEqual({
      value: 0,
      unit: "second",
    });
  });

  it("tells a change made this very instant as now", () => {
    expect(relativeAgeOf(NOW_MS, NOW_MS)).toEqual({ value: 0, unit: "second" });
  });

  it("never gives a negative zero or a positive value", () => {
    for (const secondsAgo of [0, 30, 60, 3600, 86_400, 86_400 * 40]) {
      const { value } = ageAt(secondsAgo);
      expect(value).toBeLessThanOrEqual(0);
      expect(Object.is(value, -0) && secondsAgo >= 60).toBe(false);
    }
  });
});

describe("relativeAgeOf: the calendar days", () => {
  it("tells exactly 24 hours as a day", () => {
    expect(ageAt(24 * 3600)).toEqual({ value: -1, unit: "day" });
  });

  it("tells the same wall-clock time two days back as 2 days", () => {
    expect(relativeAgeOf(localMs(2026, 6, 13, 12, 0), NOW_MS)).toEqual({
      value: -2,
      unit: "day",
    });
  });

  it("counts days by the calendar, not by dividing hours: 25 hours across midnight is one day, 47 hours across two midnights is 2", () => {
    const lateEvening = localMs(2026, 6, 14, 22, 0);
    expect(relativeAgeOf(lateEvening, localMs(2026, 6, 15, 23, 0))).toEqual({
      value: -1,
      unit: "day",
    });
    expect(
      relativeAgeOf(localMs(2026, 6, 13, 23, 30), localMs(2026, 6, 15, 22, 30)),
    ).toEqual({ value: -2, unit: "day" });
  });

  it("tells 6 days as days and the seventh as a week", () => {
    expect(relativeAgeOf(localMs(2026, 6, 9, 12), NOW_MS)).toEqual({
      value: -6,
      unit: "day",
    });
    expect(relativeAgeOf(localMs(2026, 6, 8, 12), NOW_MS)).toEqual({
      value: -1,
      unit: "week",
    });
  });

  it("pins the 24-hour edge to the clock, not the calendar: a change 2 hours old across midnight is 2 hours", () => {
    // The doc comment on `relativeAgeOf` says a change at 23:00 reads "yesterday" at 01:00 the next day; the code
    // checks hours before the calendar, so it reads "2 hours". The plan names no rule (it says only "relative date").
    // This pins what the code does so that either side of the mismatch changing is seen.
    expect(
      relativeAgeOf(localMs(2026, 6, 14, 23, 0), localMs(2026, 6, 15, 1, 0)),
    ).toEqual({ value: -2, unit: "hour" });
  });
});

describe("relativeAgeOf across a DST change in the pinned zone", () => {
  it("counts the long autumn day (25 hours) as one calendar day, never zero", () => {
    // 2026-10-25 04:00 -> 03:00: the day has 25 hours, so a change made at 00:30 is 24 h 15 m old by 23:45 on the same
    // calendar date: over a day old by the clock, zero days by the calendar. The age must still read one day.
    const dayStart = localMs(2026, 10, 25, 0, 30);
    const sameDateLateEvening = localMs(2026, 10, 25, 23, 45);
    expect(sameDateLateEvening - dayStart).toBeGreaterThanOrEqual(
      24 * MS_PER_HOUR,
    );
    expect(relativeAgeOf(dayStart, sameDateLateEvening)).toEqual({
      value: -1,
      unit: "day",
    });
  });

  it("tells noon to noon across the autumn change (49 hours) as 2 days", () => {
    expect(
      relativeAgeOf(localMs(2026, 10, 24, 12), localMs(2026, 10, 26, 12)),
    ).toEqual({ value: -2, unit: "day" });
  });

  it("tells noon to noon across the spring change (47 hours) as 2 days", () => {
    expect(
      relativeAgeOf(localMs(2026, 3, 28, 12), localMs(2026, 3, 30, 12)),
    ).toEqual({ value: -2, unit: "day" });
  });

  it("tells noon to noon one day apart as 1 day across the autumn change, and as 23 hours across the spring one", () => {
    // Hours are read off the clock before the calendar is consulted, so the spring day that lost an hour makes
    // "the same time yesterday" 23 hours old. Pinned as the code behaves: the plan names no rule for the boundary.
    expect(
      relativeAgeOf(localMs(2026, 3, 28, 12), localMs(2026, 3, 29, 12)),
    ).toEqual({ value: -23, unit: "hour" });
    expect(
      relativeAgeOf(localMs(2026, 10, 24, 12), localMs(2026, 10, 25, 12)),
    ).toEqual({ value: -1, unit: "day" });
  });

  it("gives the same days for the same wall-clock span whether or not a change lies inside it, week by week", () => {
    for (const weekStart of [
      localMs(2026, 3, 22, 9),
      localMs(2026, 10, 18, 9),
      localMs(2026, 6, 1, 9),
    ]) {
      for (let day = 2; day <= 6; day += 1) {
        const later = new Date(weekStart);
        later.setDate(later.getDate() + day);
        expect(relativeAgeOf(weekStart, later.getTime())).toEqual({
          value: -day,
          unit: "day",
        });
      }
    }
  });
});

describe("relativeAgeOf: weeks, months and years", () => {
  function daysAgo(days: number): RelativeAge {
    const earlier = new Date(NOW_MS);
    earlier.setDate(earlier.getDate() - days);
    return relativeAgeOf(earlier.getTime(), NOW_MS);
  }

  it.each([
    [7, -1, "week"],
    [13, -1, "week"],
    [14, -2, "week"],
    [27, -3, "week"],
    [28, -4, "week"],
    [34, -4, "week"],
    [35, -1, "month"],
    [59, -1, "month"],
    [60, -2, "month"],
    [89, -2, "month"],
    [330, -11, "month"],
    [364, -12, "month"],
    [365, -1, "year"],
    [729, -1, "year"],
    [730, -2, "year"],
  ])("tells %i days ago as %i %s", (days, value, unit) => {
    expect(daysAgo(days)).toEqual({ value, unit });
  });

  it("moves up the ladder only: the unit never goes back to a smaller one as a change gets older", () => {
    const rank = ["second", "minute", "hour", "day", "week", "month", "year"];
    let previousRank = -1;
    for (let hoursAgo = 0; hoursAgo <= 24 * 800; hoursAgo += 1) {
      const age = relativeAgeOf(NOW_MS - hoursAgo * MS_PER_HOUR, NOW_MS);
      const currentRank = rank.indexOf(age.unit);
      expect(currentRank, `${String(hoursAgo)} h`).toBeGreaterThanOrEqual(
        previousRank,
      );
      previousRank = currentRank;
    }
  });

  it("tells days 360 to 364 as twelve months and day 365 as one year (a pin, and a question for the owner)", () => {
    // The ladder is "the largest unit that is at least one", with a year being 365 days and a month 30, so 360 days is
    // twelve months and not yet a year. No document says whether a card should read "12 months" for five days a year; this
    // pins what the code does so that a change to it, either way, is seen and decided.
    for (let days = 360; days <= 364; days += 1) {
      expect(daysAgo(days), `${String(days)} days`).toEqual({
        value: -12,
        unit: "month",
      });
    }
    expect(daysAgo(365)).toEqual({ value: -1, unit: "year" });
    for (let days = 1; days <= 800; days += 1) {
      const age = daysAgo(days);
      if (age.unit === "month" && -age.value > 12) {
        throw new Error(
          `${String(days)} days read as ${String(-age.value)} months`,
        );
      }
    }
  });

  it("is monotone in magnitude within a unit: older never reads as fewer", () => {
    let previous: RelativeAge | undefined;
    for (let days = 1; days <= 800; days += 1) {
      const age = daysAgo(days);
      if (previous?.unit === age.unit) {
        expect(-age.value, `${String(days)} days`).toBeGreaterThanOrEqual(
          -previous.value,
        );
      }
      previous = age;
    }
  });

  it("is deterministic: the same inputs give the same age", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 * 365 * MS_PER_DAY }),
        (elapsedMs) => {
          expect(relativeAgeOf(NOW_MS - elapsedMs, NOW_MS)).toEqual(
            relativeAgeOf(NOW_MS - elapsedMs, NOW_MS),
          );
        },
      ),
    );
  });
});

describe("formatRelativeAge: the platform's words, per language", () => {
  it.each([
    ["ro", { value: 0, unit: "second" }, "acum"],
    ["ro", { value: -1, unit: "day" }, "ieri"],
    ["ro", { value: -3, unit: "day" }, "acum 3 zile"],
    ["ro", { value: -5, unit: "minute" }, "acum 5 minute"],
    ["ru", { value: -1, unit: "day" }, "вчера"],
  ] as const)("tells %s %j as %s", (locale, age, expected) => {
    expect(formatRelativeAge(locale, age)).toBe(expected);
  });

  it("never yields an empty sentence for any age the ladder produces", () => {
    for (const [locale] of CATALOGUES) {
      for (let hoursAgo = 0; hoursAgo <= 24 * 800; hoursAgo += 7) {
        const age = relativeAgeOf(NOW_MS - hoursAgo * MS_PER_HOUR, NOW_MS);
        expect(formatRelativeAge(locale, age).trim()).not.toBe("");
      }
    }
  });
});
