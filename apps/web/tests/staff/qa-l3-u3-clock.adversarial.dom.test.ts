// @vitest-environment happy-dom
//
// The clock of the staff kitchen page (wave L3-U3): every date it prints is the day and the minute on the shop's wall, in
// Chisinau, whatever clock the staff member's browser keeps. The expected strings are written out by hand from the zone's rules
// (UTC+2 in winter, UTC+3 from the last Sunday of March at 03:00 to the last Sunday of October at 04:00), not computed with
// the formatter the page uses, and the page is drawn under browser clocks on the far side of the world as well as at home. A
// time the zone has twice (the repeated hour of 25 October) reads the same both times, and a time it never has (the skipped
// hour of 29 March) is not printed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allIn, requireIn, type TestLocale } from "../support/render-with-intl";
import {
  wireChangedStatus,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";

import {
  PAGE,
  setUpScreenHarness,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const LOCALES: readonly TestLocale[] = ["ro", "ru"];
/** Browser clocks far from Chisinau: a day ahead, a day behind, and the one with no daylight saving. */
const BROWSER_ZONES = [
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "America/Los_Angeles",
  "UTC",
] as const;

/** instant -> the day and the minute on the Chisinau wall, as `dd.mm.yyyy, hh:mm`, and the day alone. */
const WALL: readonly (readonly [string, string, string, string])[] = [
  [
    "the minute before the clocks go forward",
    "2026-03-29T00:59:00.000Z",
    "29.03.2026, 02:59",
    "29.03.2026",
  ],
  [
    "the minute they go forward",
    "2026-03-29T01:00:00.000Z",
    "29.03.2026, 04:00",
    "29.03.2026",
  ],
  [
    "the half hour after",
    "2026-03-29T01:30:00.000Z",
    "29.03.2026, 04:30",
    "29.03.2026",
  ],
  [
    "the last minute before they go back",
    "2026-10-24T23:59:00.000Z",
    "25.10.2026, 02:59",
    "25.10.2026",
  ],
  [
    "the first pass of the repeated hour",
    "2026-10-25T00:30:00.000Z",
    "25.10.2026, 03:30",
    "25.10.2026",
  ],
  [
    "the second pass of the repeated hour",
    "2026-10-25T01:30:00.000Z",
    "25.10.2026, 03:30",
    "25.10.2026",
  ],
  [
    "the end of the repeated hour",
    "2026-10-25T02:00:00.000Z",
    "25.10.2026, 04:00",
    "25.10.2026",
  ],
  [
    "midnight on the wall in summer",
    "2026-10-24T21:00:00.000Z",
    "25.10.2026, 00:00",
    "25.10.2026",
  ],
  [
    "the last minute of a summer day",
    "2026-06-30T20:59:59.999Z",
    "30.06.2026, 23:59",
    "30.06.2026",
  ],
  [
    "the first minute of the next day",
    "2026-06-30T21:00:00.000Z",
    "01.07.2026, 00:00",
    "01.07.2026",
  ],
  [
    "new year's eve in winter",
    "2026-12-31T21:59:59.999Z",
    "31.12.2026, 23:59",
    "31.12.2026",
  ],
  [
    "the new year in winter",
    "2026-12-31T22:00:00.000Z",
    "01.01.2027, 00:00",
    "01.01.2027",
  ],
  [
    "an offset instead of Z",
    "2026-10-21T12:00:00+03:00",
    "21.10.2026, 12:00",
    "21.10.2026",
  ],
];

/** The words that tell an age that lies ahead, not behind: "in" and "within" in each language. */
const FUTURE_WORDS = ["peste", "через"];

let harness: ScreenHarness;
let browserZoneAtStart: string | undefined;

beforeEach(() => {
  browserZoneAtStart = process.env.TZ;
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
  if (browserZoneAtStart === undefined) {
    Reflect.deleteProperty(process.env, "TZ");
  } else {
    process.env.TZ = browserZoneAtStart;
  }
});

function wireAt(instant: string): Record<string, unknown> {
  return wireKitchen({
    kitchen: { sentAt: instant },
    request: { reference: "LEM-1", sentAt: instant },
    status: wireChangedStatus("contacted"),
  });
}

describe.each(LOCALES)("the dates of the page in %s", (locale) => {
  describe.each(BROWSER_ZONES)("in a browser whose clock is %s", (zone) => {
    beforeEach(() => {
      process.env.TZ = zone;
    });

    it("keeps the browser's clock really changed, so the cases below tell the shop's clock from it", () => {
      const winterNoonInChisinau = Date.parse("2026-01-01T10:00:00.000Z");
      const hourInBrowser = new Date(winterNoonInChisinau).getHours();

      expect(hourInBrowser).not.toBe(12);
    });

    it.each(WALL)(
      "prints %s as the shop's wall: the request's minute, and the day under the title",
      async (_, instant, minute, day) => {
        harness.answers(() => ({
          body: wireKitchen({
            kitchen: { sentAt: instant },
            request: { reference: "LEM-1", sentAt: instant },
          }),
        }));

        await harness.mount({ locale });

        const page = requireIn(harness.container(), PAGE);
        expect(
          requireIn(page, '[data-testid="staff-kitchen-request"] p')
            .textContent,
        ).toContain(`LEM-1, ${minute}.`);
        expect(requireIn(page, "header p").textContent).toContain(`· ${day}`);
      },
    );

    it.each(WALL)(
      "prints %s as the shop's wall in the last change of the status",
      async (_, instant, minute) => {
        harness.answers(() => ({
          body: wireKitchen({
            status: {
              value: "closed",
              changedBy: { email: "s@lemnaria.md", name: "S" },
              changedAt: instant,
            },
          }),
        }));

        await harness.mount({ locale });

        expect(
          requireIn(
            harness.container(),
            '[data-testid="staff-kitchen-last-change"]',
          ).textContent,
        ).toContain(`, ${minute}`);
      },
    );
  });

  describe("instants at the edge of what a date can be", () => {
    it.each([
      ["the epoch", "1970-01-01T00:00:00.000Z", "01.01.1970, 03:00"],
      [
        "a day before the epoch",
        "1969-12-31T00:00:00.000Z",
        "31.12.1969, 03:00",
      ],
      [
        "the last day of the year 9999",
        "9999-12-31T23:59:59.999Z",
        "01.01.10000, 01:59",
      ],
      [
        "the latest instant a date can hold",
        "+275760-09-13T00:00:00.000Z",
        "13.09.275760, 03:00",
      ],
    ])("prints %s without a failure", async (_, instant, minute) => {
      harness.answers(() => ({ body: wireAt(instant) }));

      await harness.mount({ locale });

      expect(
        requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-request"] p',
        ).textContent,
      ).toContain(minute);
      expect(allIn(harness.container(), "h1")).toHaveLength(1);
    });
  });

  describe("the age of a draft, told against the clock of the page", () => {
    const AGES: readonly (readonly [string, string])[] = [
      ["an hour in the future", "2026-10-21T13:00:00.000Z"],
      ["a year in the future", "2027-10-21T12:00:00.000Z"],
      ["the latest instant a date can hold", "+275760-09-13T00:00:00.000Z"],
    ];

    it.each(AGES)(
      "tells %s as now, never as a negative or a future age",
      async (_, instant) => {
        harness.answers(() => ({
          body: wireDraftKitchen({ kitchen: { updatedAt: instant } }),
        }));

        await harness.mount({ locale });

        const sub = requireIn(harness.container(), "header p").textContent;
        expect(sub).toContain(locale === "ro" ? "acum" : "сейчас");
        expect(sub).not.toMatch(/-\d/);
        for (const futureWord of FUTURE_WORDS) {
          expect(sub.includes(futureWord), futureWord).toBe(false);
        }
      },
    );

    it("tells the epoch as a number of years, and a minute ago as minutes", async () => {
      harness.answers(() => ({
        body: wireDraftKitchen({
          kitchen: { updatedAt: "1970-01-01T00:00:00.000Z" },
        }),
      }));
      await harness.mount({ locale });
      expect(requireIn(harness.container(), "header p").textContent).toContain(
        locale === "ro" ? "acum 56 de ani" : "56 лет назад",
      );
      harness.unmount();

      harness.answers(() => ({
        body: wireDraftKitchen({
          kitchen: { updatedAt: "2026-10-21T11:55:00.000Z" },
        }),
      }));
      await harness.mount({ locale });

      expect(requireIn(harness.container(), "header p").textContent).toContain(
        locale === "ro" ? "acum 5 minute" : "5 минут назад",
      );
    });
  });
});
