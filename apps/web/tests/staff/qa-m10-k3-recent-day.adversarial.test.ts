// Adversarial QA of how the list writes "seen" and "changed again": the day by its word or its date and the minute, on the
// shop's wall (Europe/Chisinau), held over every instant within days of both clock changes and against an oracle that does
// not share the code's way of counting days.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, describe, expect, it } from "vitest";

import type { AppLocale } from "@/i18n/routing";
import { recentDayAndTimeOf } from "@/staff/staff-kitchen-dates";

const SHOP_TIME_ZONE = "Europe/Chisinau";
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const WORDS = {
  ro: { today: "azi", yesterday: "ieri" },
  ru: { today: "сегодня", yesterday: "вчера" },
} as const satisfies Record<AppLocale, { today: string; yesterday: string }>;
const LOCALES = Object.keys(WORDS) as AppLocale[];

function wallPartsOf(instantMs: number) {
  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: SHOP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instantMs))
      .map((part) => [part.type, part.value] as const),
  );
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.get(type) ?? "";
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/** The wall's date as a count of days, found from the parts of the wall and not from any offset. */
function wallDayOf(instantMs: number): number {
  const { year, month, day } = wallPartsOf(instantMs);
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY;
}

function expectedWriting(
  instantMs: number,
  nowMs: number,
  locale: AppLocale,
): string {
  const writtenMs = Math.min(instantMs, nowMs);
  const daysAgo = wallDayOf(nowMs) - wallDayOf(writtenMs);
  const { year, month, day, hour, minute } = wallPartsOf(writtenMs);
  const dayText =
    daysAgo === 0
      ? WORDS[locale].today
      : daysAgo === 1
        ? WORDS[locale].yesterday
        : `${day}.${month}.${year}`;
  return `${dayText}, ${hour}:${minute}`;
}

/** Every instant, to the hour, at which the shop's wall changes its offset in 2026 and 2027: found, never written down. */
function clockChanges(): readonly number[] {
  const offsetAt = (instantMs: number) => {
    const { year, month, day, hour, minute } = wallPartsOf(instantMs);
    const wallMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
    return wallMs - instantMs;
  };
  const changes: number[] = [];
  const end = Date.UTC(2028, 0, 1);
  for (let hourMs = Date.UTC(2026, 0, 1); hourMs < end; hourMs += MS_PER_HOUR) {
    if (offsetAt(hourMs) !== offsetAt(hourMs - MS_PER_HOUR)) {
      changes.push(hourMs);
    }
  }
  return changes;
}

const CLOCK_CHANGES = clockChanges();

describe("the clock changes the oracle finds", () => {
  it("are the four of 2026 and 2027, so the sweep below crosses both kinds", () => {
    expect(CLOCK_CHANGES).toHaveLength(4);
  });
});

describe("a recent event over the days around a change of the shop's clock", () => {
  const aroundAChange = fc.record({
    change: fc.constantFrom(...CLOCK_CHANGES),
    nowOffsetMinutes: fc.integer({ min: -3 * 24 * 60, max: 3 * 24 * 60 }),
    ageMinutes: fc.integer({ min: -60, max: 4 * 24 * 60 }),
    locale: fc.constantFrom(...LOCALES),
  });

  propertyTest.prop([aroundAChange], { numRuns: 2000 })(
    "is written as the oracle writes it",
    ({ change, nowOffsetMinutes, ageMinutes, locale }) => {
      const nowMs = change + nowOffsetMinutes * MS_PER_MINUTE;
      const instantMs = nowMs - ageMinutes * MS_PER_MINUTE;

      const written = recentDayAndTimeOf(
        new Date(instantMs).toISOString(),
        nowMs,
        locale,
      );

      expect(written).toBe(expectedWriting(instantMs, nowMs, locale));
    },
  );

  const aroundMidnight = fc.record({
    midnightMs: fc
      .integer({ min: 0, max: 400 })
      .map(
        (dayOffset) =>
          Date.UTC(2026, 9, 1) + dayOffset * MS_PER_DAY - 3 * MS_PER_HOUR,
      ),
    locale: fc.constantFrom(...LOCALES),
  });

  propertyTest.prop([aroundMidnight], { numRuns: 400 })(
    "turns from yesterday to today at the minute the wall turns midnight, never an hour away",
    ({ midnightMs, locale }) => {
      const wallMidnightMs = Array.from(
        { length: 48 },
        (_, hour) => midnightMs + hour * MS_PER_HOUR,
      ).find((ms) => {
        const { hour, minute } = wallPartsOf(ms);
        return hour === "00" && minute === "00";
      });
      expect(wallMidnightMs).toBeDefined();
      const midnight = wallMidnightMs ?? 0;
      const nowMs = midnight + 12 * MS_PER_HOUR;

      const justAfter = recentDayAndTimeOf(
        new Date(midnight).toISOString(),
        nowMs,
        locale,
      );
      const justBefore = recentDayAndTimeOf(
        new Date(midnight - MS_PER_MINUTE).toISOString(),
        nowMs,
        locale,
      );

      expect(justAfter).toBe(`${WORDS[locale].today}, 00:00`);
      expect(justBefore.startsWith(`${WORDS[locale].yesterday}, 23:59`)).toBe(
        true,
      );
    },
  );

  it.each(LOCALES)(
    "writes an instant a minute after the read time, across the shop's midnight, as today at the read time in %s",
    (locale) => {
      const nowMs = Date.parse("2026-10-21T20:59:30.000Z");
      const afterMidnight = new Date(nowMs + MS_PER_MINUTE).toISOString();

      expect(recentDayAndTimeOf(afterMidnight, nowMs, locale)).toBe(
        `${WORDS[locale].today}, 23:59`,
      );
    },
  );

  it.each(LOCALES)(
    "keeps the hour of the night the clock goes back in %s (04:00 summer time is 03:00 winter time)",
    (locale) => {
      const nowMs = Date.parse("2026-10-25T10:00:00.000Z");

      expect(
        recentDayAndTimeOf("2026-10-24T21:00:00.000Z", nowMs, locale),
      ).toBe(`${WORDS[locale].today}, 00:00`);
      expect(
        recentDayAndTimeOf("2026-10-24T20:59:00.000Z", nowMs, locale),
      ).toBe(`${WORDS[locale].yesterday}, 23:59`);
    },
  );
});

describe("a recent event whatever clock the browser keeps", () => {
  const originalZone = process.env.TZ;

  afterEach(() => {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  });

  it.each(["Pacific/Kiritimati", "America/Los_Angeles", "Pacific/Pago_Pago"])(
    "is written the same in %s as on the shop's own zone",
    (browserZone) => {
      const nowMs = Date.parse("2026-10-21T12:00:00.000Z");
      const instants = [
        "2026-10-21T06:05:00.000Z",
        "2026-10-20T21:30:00.000Z",
        "2026-10-20T07:05:00.000Z",
        "2026-10-19T07:05:00.000Z",
      ];
      process.env.TZ = SHOP_TIME_ZONE;
      const onShopZone = instants.map((instant) =>
        recentDayAndTimeOf(instant, nowMs, "ro"),
      );

      process.env.TZ = browserZone;
      const onBrowserZone = instants.map((instant) =>
        recentDayAndTimeOf(instant, nowMs, "ro"),
      );

      expect(onBrowserZone).toEqual(onShopZone);
    },
  );
});
