// @vitest-environment happy-dom
//
// The structure the audit page offers to a screen reader and a keyboard, in every state it can be in and both languages, and
// the clock it tells the rows on (wave L3-U6): one main, one h1, every control named, a table that is a table and cards that
// are a list, the Tab order in the order the page is drawn; every date on the shop's wall in Chisinau whatever clock the
// browser keeps, and an age that is told on the same wall.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  byWords,
  requireIn,
  typeInto,
  type TestLocale,
} from "../support/render-with-intl";
import {
  auditEventsFrom,
  wireAuditEvent,
  wireAuditPage,
} from "../support/staff-audit-wire";
import {
  RATE_LIMITED_ANSWER,
  UNAVAILABLE_ANSWER,
} from "../support/staff-kitchens-wire";

import { required } from "./qa-l3-u6-required.adversarial";
import {
  CARDS,
  PAGE,
  ROWS,
  TABLE,
  setUpAuditHarness,
  type AuditAnswer,
  type AuditHarness,
  type Width,
} from "./qa-l3-u6-harness.adversarial";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const FOCUSABLE =
  'a[href], button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])';

let harness: AuditHarness;
let browserZoneAtStart: string | undefined;

beforeEach(() => {
  browserZoneAtStart = process.env.TZ;
  harness = setUpAuditHarness();
});

afterEach(() => {
  harness.tearDown();
  if (browserZoneAtStart === undefined) {
    Reflect.deleteProperty(process.env, "TZ");
  } else {
    process.env.TZ = browserZoneAtStart;
  }
});

function pageOf(
  events: readonly unknown[],
  overrides: Parameters<typeof wireAuditPage>[1] = {},
): AuditAnswer {
  return { body: wireAuditPage(events, overrides) };
}

function nameOf(element: HTMLElement, root: ParentNode): string {
  const direct = element.getAttribute("aria-label");
  if (direct !== null && direct.trim() !== "") return direct.trim();
  const labelFor =
    element.id === "" ? null : root.querySelector(`label[for="${element.id}"]`);
  if (labelFor !== null) return labelFor.textContent.trim();
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    return labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`[id="${id}"]`)?.textContent.trim() ?? "")
      .join(" ")
      .trim();
  }
  return element.textContent.trim();
}

function headingLevels(root: ParentNode): number[] {
  return allIn(
    root as HTMLElement,
    "h1, h2, h3, h4, h5, h6, [role='heading']",
  ).map((heading) =>
    Number(heading.getAttribute("aria-level") ?? heading.tagName.slice(1)),
  );
}

interface AuditState {
  readonly label: string;
  readonly width: Width;
  readonly answer: () => AuditAnswer;
  readonly after?: () => Promise<void>;
  readonly isFailure: boolean;
}

const STATES: readonly AuditState[] = [
  {
    label: "loading",
    width: "desktop",
    answer: () => "hold",
    isFailure: false,
  },
  {
    label: "rows on a desktop",
    width: "desktop",
    answer: () => pageOf(auditEventsFrom(1, 25), { total: 80 }),
    isFailure: false,
  },
  {
    label: "rows on a phone",
    width: "phone",
    answer: () => pageOf(auditEventsFrom(1, 25), { total: 80 }),
    isFailure: false,
  },
  {
    label: "an empty log",
    width: "desktop",
    answer: () => pageOf([], { total: 0 }),
    isFailure: false,
  },
  {
    label: "filters that matched nothing",
    width: "desktop",
    answer: () => pageOf([], { total: 0 }),
    after: async () => {
      await harness.choose(harness.actionSelect(), "note-added");
    },
    isFailure: false,
  },
  {
    label: "days that are refused",
    width: "desktop",
    answer: () => pageOf(auditEventsFrom(1, 3)),
    after: async () => {
      typeInto(harness.dayInputs()[0], "1999-01-01");
      await harness.settle();
    },
    isFailure: false,
  },
  {
    label: "a range that ends before it begins",
    width: "phone",
    answer: () => pageOf(auditEventsFrom(1, 3)),
    after: async () => {
      typeInto(harness.dayInputs()[0], "2026-10-05");
      await harness.settle();
      typeInto(harness.dayInputs()[1], "2026-10-01");
      await harness.settle();
    },
    isFailure: false,
  },
  {
    label: "a service that is down",
    width: "desktop",
    answer: () => UNAVAILABLE_ANSWER,
    isFailure: true,
  },
  {
    label: "a limit with a wait",
    width: "desktop",
    answer: () => RATE_LIMITED_ANSWER(30),
    isFailure: false,
  },
  {
    label: "a connection that failed",
    width: "phone",
    answer: () => "offline",
    isFailure: true,
  },
  {
    label: "an answer that is not a log",
    width: "desktop",
    answer: () => ({ body: { total: 1 } }),
    isFailure: true,
  },
];

describe.each(LOCALES)("the structure of the page in %s", (locale) => {
  describe.each(STATES)("for $label", (state) => {
    beforeEach(async () => {
      harness.answers(state.answer);
      await harness.mount({ locale, width: state.width });
      await state.after?.();
    });

    it("has the staff frame's one main and one h1, with headings that never skip a level", () => {
      const container = harness.container();
      const levels = headingLevels(container);

      expect(allIn(container, "main, [role='main']")).toHaveLength(1);
      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      expect(levels[0]).toBe(1);
      for (let index = 1; index < levels.length; index += 1) {
        expect(levels[index] ?? 0, levels.join(",")).toBeLessThanOrEqual(
          (levels[index - 1] ?? 0) + 1,
        );
      }
    });

    it("has every id once and every reference to one resolved", () => {
      const container = harness.container();
      const ids = allIn(container, "[id]").map((element) => element.id);

      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
      for (const attribute of [
        "aria-labelledby",
        "aria-describedby",
        "aria-controls",
      ]) {
        for (const element of allIn(container, `[${attribute}]`)) {
          for (const id of (element.getAttribute(attribute) ?? "").split(
            /\s+/,
          )) {
            expect(
              container.querySelector(`[id="${id}"]`),
              `${attribute}=${id}`,
            ).not.toBeNull();
          }
        }
      }
    });

    it("names every control, puts none ahead of the order the page is drawn in, and hides none that can be focused", () => {
      const container = harness.container();

      for (const control of allIn(container, FOCUSABLE)) {
        expect(
          nameOf(control, container),
          control.outerHTML.slice(0, 100),
        ).not.toBe("");
        expect(
          Number(control.getAttribute("tabindex") ?? "0"),
        ).toBeLessThanOrEqual(0);
      }
      for (const button of allIn(container, "button")) {
        expect(button.getAttribute("type")).toBe("button");
      }
      for (const hidden of allIn(container, "[aria-hidden='true']")) {
        expect(allIn(hidden, FOCUSABLE)).toHaveLength(0);
      }
    });

    it("raises one alert for a failure or a refused day, and none for anything else", () => {
      const alerts = allIn(harness.container(), "[role='alert']").length;
      const isDayProblem =
        state.label.startsWith("days") || state.label.startsWith("a range");

      expect(alerts).toBe(state.isFailure || isDayProblem ? 1 : 0);
    });

    it("labels each of the four filters with a label that is attached to it", () => {
      const container = harness.container();
      const controls = allIn(requireIn(container, PAGE), "select, input");

      expect(controls).toHaveLength(4);
      const labels = controls.map(
        (control) =>
          requireIn(container, `label[for="${control.id}"]`).textContent,
      );
      const words = CATALOGUES[locale].staffAudit;
      expect(labels).toEqual([
        words.filterPerson,
        words.filterAction,
        words.filterFrom,
        words.filterTo,
      ]);
    });
  });

  describe("a table", () => {
    beforeEach(async () => {
      harness.answers(() => pageOf(auditEventsFrom(1, 25), { total: 80 }));
      await harness.mount({ locale, width: "desktop" });
    });

    it("is a table with a name, four column headers that say they are for their column, and a region that scrolls and is named", () => {
      const table = requireIn(harness.container(), TABLE);
      const words = CATALOGUES[locale].staffAudit;

      expect(table.getAttribute("aria-label")).toBe(words.title);
      const headers = allIn(table, "th");
      expect(headers.map(({ textContent }) => textContent)).toEqual([
        words.columnWhen,
        words.columnWho,
        words.columnAction,
        words.columnObject,
      ]);
      expect(
        headers.every((header) => header.getAttribute("scope") === "col"),
      ).toBe(true);
      const region = required(table.parentElement);
      expect(region.getAttribute("role")).toBe("region");
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.getAttribute("aria-label")).toBe(words.title);
      for (const row of allIn(table, "tbody tr")) {
        expect(allIn(row, "td")).toHaveLength(4);
      }
    });

    it("is reached by Tab after the four filters and before the numbers, which are a navigation with a name", () => {
      const inPage = allIn(requireIn(harness.container(), PAGE), FOCUSABLE);

      expect(inPage.map((element) => element.tagName)).toEqual([
        "SELECT",
        "SELECT",
        "INPUT",
        "INPUT",
        "DIV",
        "BUTTON",
        "BUTTON",
        "BUTTON",
        "BUTTON",
        "BUTTON",
      ]);
      const numbers = requireIn(
        harness.container(),
        '[data-testid="staff-audit-foot"] nav',
      );
      expect(numbers.getAttribute("aria-label")).toBe(
        CATALOGUES[locale].staffKitchens.pagesLabel,
      );
      expect(
        allIn(numbers, "button").map((button) => nameOf(button, numbers)),
      ).toHaveLength(6);
    });
  });

  describe("the cards", () => {
    beforeEach(async () => {
      harness.answers(() => pageOf(auditEventsFrom(1, 25), { total: 80 }));
      await harness.mount({ locale, width: "phone" });
    });

    it("are one list of items, each a description list of the four columns' names and their values", () => {
      const list = requireIn(harness.container(), CARDS);
      const words = CATALOGUES[locale].staffAudit;

      expect(list.tagName).toBe("UL");
      expect(
        allIn(list, ":scope > *").every((child) => child.tagName === "LI"),
      ).toBe(true);
      const first = requireIn(list, "li");
      expect(allIn(first, "dt").map(({ textContent }) => textContent)).toEqual([
        words.columnWhen,
        words.columnWho,
        words.columnAction,
        words.columnObject,
      ]);
      expect(allIn(first, "dd")).toHaveLength(4);
      expect(allIn(list, "li")).toHaveLength(25);
    });

    it("are reached by Tab after the four filters, and then 'more' alone, a card taking focus only by script", () => {
      const inPage = allIn(requireIn(harness.container(), PAGE), FOCUSABLE);

      expect(inPage.map((element) => element.tagName)).toEqual([
        "SELECT",
        "SELECT",
        "INPUT",
        "INPUT",
        "BUTTON",
      ]);
      expect(
        byWords(
          harness.container(),
          "button",
          CATALOGUES[locale].staffKitchens.loadMore,
        ),
      ).toBe(inPage.at(-1));
      expect(
        allIn(list(), "li").every(
          (card) => card.getAttribute("tabindex") === "-1",
        ),
      ).toBe(true);
    });
  });
});

function list(): HTMLElement {
  return requireIn(harness.container(), CARDS);
}

const BROWSER_ZONES = [
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "America/Los_Angeles",
  "UTC",
] as const;

/** instant -> the minute on the Chisinau wall (UTC+2 in winter, UTC+3 from the last Sunday of March 03:00 to the last Sunday of October 04:00). */
const WALL: readonly (readonly [string, string, string])[] = [
  [
    "the minute before the clocks go forward",
    "2026-03-29T00:59:00.000Z",
    "29.03.2026, 02:59",
  ],
  [
    "the minute they go forward",
    "2026-03-29T01:00:00.000Z",
    "29.03.2026, 04:00",
  ],
  [
    "the last minute before they go back",
    "2026-10-24T23:59:00.000Z",
    "25.10.2026, 02:59",
  ],
  [
    "the first pass of the repeated hour",
    "2026-10-25T00:30:00.000Z",
    "25.10.2026, 03:30",
  ],
  [
    "the second pass of the repeated hour",
    "2026-10-25T01:30:00.000Z",
    "25.10.2026, 03:30",
  ],
  [
    "the end of the repeated hour",
    "2026-10-25T02:00:00.000Z",
    "25.10.2026, 04:00",
  ],
  [
    "midnight on the wall in summer",
    "2026-10-24T21:00:00.000Z",
    "25.10.2026, 00:00",
  ],
  ["the new year in winter", "2026-12-31T22:00:00.000Z", "01.01.2027, 00:00"],
  ["the epoch", "1970-01-01T00:00:00.000Z", "01.01.1970, 03:00"],
  [
    "the latest instant a date can hold",
    "+275760-09-13T00:00:00.000Z",
    "13.09.275760, 03:00",
  ],
];

describe.each(LOCALES)("the dates of the rows in %s", (locale) => {
  describe.each(BROWSER_ZONES)("in a browser whose clock is %s", (zone) => {
    beforeEach(() => {
      process.env.TZ = zone;
    });

    it("keeps the browser's clock really changed, so the cases below tell the shop's clock from it", () => {
      const hourInBrowser = new Date(
        Date.parse("2026-01-01T10:00:00.000Z"),
      ).getHours();

      expect(hourInBrowser).not.toBe(12);
    });

    it.each(WALL)(
      "prints %s as the shop's wall, in the table and on the card",
      async (_label, instant, minute) => {
        harness.answers(() =>
          pageOf([wireAuditEvent(1, { occurredAt: instant })]),
        );

        for (const width of ["desktop", "phone"] as const) {
          await harness.mount({ locale, width });
          const time = requireIn(harness.container(), `${ROWS} time`);

          expect(time.textContent).toBe(minute);
          expect(time.getAttribute("datetime")).toBe(instant);
          harness.unmount();
        }
      },
    );
  });
});

describe("the age told beside a date", () => {
  const SHOP_ZONE = "Europe/Chisinau";

  function shopDayNumber(instantMs: number): number {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
      timeZone: SHOP_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date(instantMs))
      .split("-")
      .map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day) / 86_400_000;
  }

  /** (the event, the moment the page is read): at least a day apart, and straddling midnight on the shop's wall in different ways. */
  const PAIRS = [
    [
      "two shop days after a late evening",
      "2026-10-19T23:30:00.000Z",
      "2026-10-21T01:00:00.000Z",
    ],
    [
      "one shop day after a late evening",
      "2026-10-20T20:00:00.000Z",
      "2026-10-21T21:30:00.000Z",
    ],
    [
      "the next morning, a day and a bit later",
      "2026-10-20T03:00:00.000Z",
      "2026-10-21T09:00:00.000Z",
    ],
    [
      "three shop days across the clocks going back",
      "2026-10-23T20:30:00.000Z",
      "2026-10-26T20:30:00.000Z",
    ],
  ] as const;

  describe.each(["Europe/Chisinau", ...BROWSER_ZONES])(
    "in a browser whose clock is %s",
    (zone) => {
      beforeEach(() => {
        process.env.TZ = zone;
      });

      it.each(PAIRS)(
        "tells the days by the shop's wall, the one the date beside it is on, for %s",
        async (_label, event, now) => {
          vi.setSystemTime(new Date(now));
          harness.answers(() =>
            pageOf([wireAuditEvent(1, { occurredAt: event })]),
          );
          const days =
            shopDayNumber(Date.parse(now)) - shopDayNumber(Date.parse(event));

          await harness.mount({ locale: "ro", width: "desktop" });

          const told = requireIn(harness.container(), `${ROWS} td`).textContent;
          const expected = new Intl.RelativeTimeFormat("ro", {
            numeric: "auto",
          }).format(-days, "day");
          expect(told.endsWith(expected), `${told} / ${expected}`).toBe(true);
        },
      );
    },
  );
});
