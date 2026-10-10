import { describe, expect, it } from "vitest";

import { clockTimeOf } from "@/i18n/clock-time";

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

  it("is two digits, a colon and two digits, and never before the instant, over every second of an hour", () => {
    const start = localInstant(8, 0);
    for (let second = 0; second <= 3600; second += 1) {
      const instant = start + second * 1000;
      const told = clockTimeOf(instant);
      expect(told).toMatch(/^\d{2}:\d{2}$/);
      const [hours, minutes] = told.split(":").map(Number);
      const toldAt = new Date(2026, 9, 10, hours ?? 0, minutes ?? 0).getTime();
      const toldOnTheNextDay = toldAt + 24 * 60 * MS_PER_MINUTE;
      expect(Math.max(toldAt, toldOnTheNextDay)).toBeGreaterThanOrEqual(
        instant,
      );
    }
  });
});
