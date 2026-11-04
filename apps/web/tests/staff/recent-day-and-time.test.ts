import { describe, expect, it } from "vitest";

import { recentDayAndTimeOf } from "@/staff/staff-kitchen-dates";

// How a recent event is written beside "seen": today and yesterday by their words, an earlier day by its date, and the
// minute, on the shop's clock (Europe/Chisinau), whatever clock the browser keeps.

/** 12:00 UTC on 21 October 2026 is 15:00 on the shop's wall, still the 21st. */
const NOW_MS = Date.parse("2026-10-21T12:00:00.000Z");

describe("a recent event as the frames write it", () => {
  it.each([
    ["ro", "2026-10-21T06:05:00.000Z", "azi, 09:05"],
    ["ro", "2026-10-20T07:05:00.000Z", "ieri, 10:05"],
    ["ro", "2026-10-19T07:05:00.000Z", "19.10.2026, 10:05"],
    ["ru", "2026-10-21T06:05:00.000Z", "сегодня, 09:05"],
    ["ru", "2026-10-20T07:05:00.000Z", "вчера, 10:05"],
    ["ru", "2026-10-19T07:05:00.000Z", "19.10.2026, 10:05"],
  ] as const)("writes %s %s as %s", (locale, instant, written) => {
    expect(recentDayAndTimeOf(instant, NOW_MS, locale)).toBe(written);
  });

  it("counts the day on the shop's wall: 21:30 UTC is already after midnight there", () => {
    expect(recentDayAndTimeOf("2026-10-20T21:30:00.000Z", NOW_MS, "ro")).toBe(
      "azi, 00:30",
    );
  });

  it("keeps the 24-hour clock, so midnight is 00 and never 24", () => {
    expect(recentDayAndTimeOf("2026-10-20T21:05:00.000Z", NOW_MS, "ro")).toBe(
      "azi, 00:05",
    );
  });
});
