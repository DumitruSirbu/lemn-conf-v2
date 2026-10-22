// The age told beside a staff date counts its days on the shop's wall (Europe/Chisinau), the clock the date itself is
// written on, whatever zone the browser keeps. Each case is run with the browser set to zones a day or more away from it.
import { afterEach, describe, expect, it } from "vitest";

import { shopRelativeAgeOf } from "@/staff/staff-kitchen-dates";

const BROWSER_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "Europe/Chisinau",
] as const;

/** (label, the event, the moment it is read, whole days apart on the shop's calendar). */
const SHOP_DAYS = [
  [
    "a late evening, read 1 day later at 23:30 shop time",
    "2026-10-20T20:00:00Z",
    "2026-10-21T21:30:00Z",
    2,
  ],
  [
    "a late evening, read 25 hours later at 04:00 shop time",
    "2026-10-19T23:30:00Z",
    "2026-10-21T01:00:00Z",
    1,
  ],
  [
    "a morning, read the next morning",
    "2026-10-20T03:00:00Z",
    "2026-10-21T09:00:00Z",
    1,
  ],
  [
    "across the clocks going back",
    "2026-10-23T20:30:00Z",
    "2026-10-26T20:30:00Z",
    3,
  ],
  [
    "the 25-hour day, 00:30 to 23:45 on the same date",
    "2026-10-24T21:30:00Z",
    "2026-10-25T21:45:00Z",
    1,
  ],
] as const;

const zoneBeforeTests = process.env.TZ;

afterEach(() => {
  if (zoneBeforeTests === undefined) delete process.env.TZ;
  else process.env.TZ = zoneBeforeTests;
});

describe("shopRelativeAgeOf", () => {
  describe.each(BROWSER_ZONES)("in a browser whose clock is %s", (zone) => {
    it.each(SHOP_DAYS)(
      "counts the days on the shop's wall for %s",
      (_label, event, now, days) => {
        process.env.TZ = zone;

        const age = shopRelativeAgeOf(Date.parse(event), Date.parse(now));

        expect(age).toEqual({ value: -days, unit: "day" });
      },
    );
  });

  it("keeps the clock units for anything under a day, as the browser's age does", () => {
    process.env.TZ = "Pacific/Pago_Pago";
    const now = Date.parse("2026-10-21T12:00:00Z");

    expect(shopRelativeAgeOf(now - 90 * 60_000, now)).toEqual({
      value: -1,
      unit: "hour",
    });
    expect(shopRelativeAgeOf(now - 5 * 60_000, now)).toEqual({
      value: -5,
      unit: "minute",
    });
    expect(shopRelativeAgeOf(now + 60_000, now)).toEqual({
      value: 0,
      unit: "second",
    });
  });
});
