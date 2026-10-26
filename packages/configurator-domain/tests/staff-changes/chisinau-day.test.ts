// M10 K1: the Europe/Chisinau calendar day that names a digest's day (ADR 0178 A-13).
//
// The boundaries are asserted at local midnight, on both sides, because that is where a fixed-offset implementation
// goes wrong. They do not depend on the hour the clocks change, only on the offset either side of it.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { chisinauDayKey } from "../../src/staff-changes/chisinau-day.js";

function dayKeyOf(isoInstant: string): string {
  return chisinauDayKey(Date.parse(isoInstant));
}

describe("the day key in winter and in summer", () => {
  it("is the local date, UTC+2 in winter: 22:00 UTC is already the next day", () => {
    expect(dayKeyOf("2026-01-15T21:59:59.999Z")).toBe("2026-01-15");
    expect(dayKeyOf("2026-01-15T22:00:00.000Z")).toBe("2026-01-16");
  });

  it("is the local date, UTC+3 in summer: 21:00 UTC is already the next day", () => {
    expect(dayKeyOf("2026-07-15T20:59:59.999Z")).toBe("2026-07-15");
    expect(dayKeyOf("2026-07-15T21:00:00.000Z")).toBe("2026-07-16");
  });

  it("changes year at local midnight, not at UTC midnight", () => {
    expect(dayKeyOf("2026-12-31T21:59:59.999Z")).toBe("2026-12-31");
    expect(dayKeyOf("2026-12-31T22:00:00.000Z")).toBe("2027-01-01");
  });

  it("names the digest's 08:00 local run, whichever offset is in force, as the day it runs", () => {
    expect(dayKeyOf("2026-07-15T05:00:00.000Z")).toBe("2026-07-15");
    expect(dayKeyOf("2026-01-15T06:00:00.000Z")).toBe("2026-01-15");
  });
});

describe("the spring change day, 2026-03-29: the day is 23 hours long", () => {
  it("starts at 22:00 UTC the evening before, still on winter time", () => {
    expect(dayKeyOf("2026-03-28T21:59:59.999Z")).toBe("2026-03-28");
    expect(dayKeyOf("2026-03-28T22:00:00.000Z")).toBe("2026-03-29");
  });

  it("holds the hour the clocks skip: an instant inside it is the change day", () => {
    expect(dayKeyOf("2026-03-29T00:30:00.000Z")).toBe("2026-03-29");
  });

  it("ends at 21:00 UTC, one hour earlier than a winter day, on summer time", () => {
    expect(dayKeyOf("2026-03-29T20:59:59.999Z")).toBe("2026-03-29");
    expect(dayKeyOf("2026-03-29T21:00:00.000Z")).toBe("2026-03-30");
  });
});

describe("the autumn change day, 2026-10-25: the day is 25 hours long", () => {
  it("starts at 21:00 UTC the evening before, still on summer time", () => {
    expect(dayKeyOf("2026-10-24T20:59:59.999Z")).toBe("2026-10-24");
    expect(dayKeyOf("2026-10-24T21:00:00.000Z")).toBe("2026-10-25");
  });

  it("holds the hour the clocks repeat: an instant inside it is the change day", () => {
    expect(dayKeyOf("2026-10-25T00:30:00.000Z")).toBe("2026-10-25");
  });

  it("ends at 22:00 UTC, one hour later than a summer day, on winter time", () => {
    expect(dayKeyOf("2026-10-25T21:59:59.999Z")).toBe("2026-10-25");
    expect(dayKeyOf("2026-10-25T22:00:00.000Z")).toBe("2026-10-26");
  });
});

describe("the day key's shape", () => {
  it("is YYYY-MM-DD with the month and day padded", () => {
    expect(dayKeyOf("2026-02-03T12:00:00.000Z")).toBe("2026-02-03");
  });

  it("is read from the time zone, not from the machine: the same instant gives the same key", () => {
    const instant = Date.parse("2026-05-01T22:30:00.000Z");

    expect(chisinauDayKey(instant)).toBe("2026-05-02");
  });

  it("refuses NaN and an instant beyond the representable range, naming the function", () => {
    const refused = [Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1];

    for (const value of refused) {
      expect(() => chisinauDayKey(value)).toThrow(
        /chisinauDayKey.*not an instant/,
      );
    }
  });
});

describe("the day key over any instant", () => {
  const instants = fc.integer({
    min: Date.UTC(2020, 0, 1),
    max: Date.UTC(2035, 0, 1),
  });
  const DAY_KEY_SHAPE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  propertyTest.prop([instants])("has the shape YYYY-MM-DD", (instantMs) => {
    expect(chisinauDayKey(instantMs)).toMatch(DAY_KEY_SHAPE);
  });

  propertyTest.prop([instants, fc.integer({ min: 0, max: 72 * 3_600_000 })])(
    "never goes backwards as time moves forward",
    (instantMs, elapsedMs) => {
      const earlier = chisinauDayKey(instantMs);
      const later = chisinauDayKey(instantMs + elapsedMs);

      expect(later >= earlier).toBe(true);
    },
  );

  propertyTest.prop([instants])(
    "moves at most one day in an hour, even over a clock change",
    (instantMs) => {
      const now = instantMs;
      const anHourLater = instantMs + 3_600_000;

      const firstDay = Date.parse(`${chisinauDayKey(now)}T00:00:00Z`);
      const nextDay = Date.parse(`${chisinauDayKey(anHourLater)}T00:00:00Z`);

      expect(nextDay - firstDay).toBeLessThanOrEqual(24 * 3_600_000);
    },
  );
});
