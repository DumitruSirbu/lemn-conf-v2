import { describe, expect, it } from "vitest";

import { clockTimeOf, isToldOnALaterDay } from "@/i18n/clock-time";

const MS_PER_MINUTE = 60_000;

function localInstant(hours: number, minutes: number, seconds = 0): number {
  return new Date(2026, 9, 10, hours, minutes, seconds).getTime();
}

describe("clockTimeOf", () => {
  it.each([
    [14, 5, 0, "14:05"],
    [0, 0, 0, "00:00"],
    [9, 3, 0, "09:03"],
    [23, 59, 0, "23:59"],
  ])(
    "tells %i:%i:%i as %s on a 24-hour clock with both parts padded",
    (hours, minutes, seconds, told) => {
      expect(clockTimeOf(localInstant(hours, minutes, seconds))).toBe(told);
    },
  );

  it("rounds a part of a minute up, so the time told is never before the instant", () => {
    expect(clockTimeOf(localInstant(14, 5, 1))).toBe("14:06");
    expect(clockTimeOf(localInstant(14, 5, 59))).toBe("14:06");
  });

  it("carries past the hour and past midnight", () => {
    expect(clockTimeOf(localInstant(13, 59, 30))).toBe("14:00");
    expect(clockTimeOf(localInstant(23, 59, 30))).toBe("00:00");
  });

  it("tells the next minute that is not before the instant, never a later one, over every second of an hour", () => {
    // From 08:00 for an hour, so no instant crosses midnight and the time told is read on the instant's own day.
    const start = localInstant(8, 0);
    for (let second = 0; second <= 3600; second += 1) {
      const instant = start + second * 1000;
      const told = clockTimeOf(instant);
      expect(told).toMatch(/^\d{2}:\d{2}$/);
      const [hours, minutes] = told.split(":").map(Number);
      const toldAt = new Date(2026, 9, 10, hours ?? 0, minutes ?? 0).getTime();
      expect(toldAt).toBeGreaterThanOrEqual(instant);
      expect(toldAt - instant).toBeLessThan(MS_PER_MINUTE);
    }
  });
});

describe("isToldOnALaterDay", () => {
  const SECONDS_PER_DAY = 86_400;

  it("is false for a wait that ends later the same local day", () => {
    const now = localInstant(10, 0);

    expect(isToldOnALaterDay(now + 3600 * 1000, now)).toBe(false);
    expect(isToldOnALaterDay(localInstant(23, 59), now)).toBe(false);
  });

  it("is true for a wait of exactly a day, the longest a limit's Retry-After asks", () => {
    for (const [hours, minutes] of [
      [0, 0],
      [10, 30],
      [23, 59],
    ] as const) {
      const now = localInstant(hours, minutes);

      expect(isToldOnALaterDay(now + SECONDS_PER_DAY * 1000, now)).toBe(true);
    }
  });

  it("is true for a short wait that crosses local midnight, and false the second before", () => {
    const now = localInstant(23, 30);

    expect(isToldOnALaterDay(localInstant(23, 59, 0), now)).toBe(false);
    expect(isToldOnALaterDay(now + 30 * 60 * 1000, now)).toBe(true);
  });

  it("reads the day of the time that is told, which rounds the minute up across midnight", () => {
    const now = localInstant(23, 0);
    const lastSecondOfTheDay = localInstant(23, 59, 30);

    expect(clockTimeOf(lastSecondOfTheDay)).toBe("00:00");
    expect(isToldOnALaterDay(lastSecondOfTheDay, now)).toBe(true);
  });

  it("is false for an instant that is already past", () => {
    const now = localInstant(10, 0);

    expect(isToldOnALaterDay(now - SECONDS_PER_DAY * 1000, now)).toBe(false);
  });
});
