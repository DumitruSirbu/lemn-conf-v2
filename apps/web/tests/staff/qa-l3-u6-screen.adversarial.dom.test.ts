// @vitest-environment happy-dom
//
// Adversarial reading of the audit screen (wave L3-U6): text that somebody else wrote reaches the table, the cards and the
// menus as text and nothing else, in both widths and both languages; the foot says which rows are shown in digits that no
// grouping can change; the rows count says "de" from twenty; the phone's "more" waits for the person through a limit and
// a refused session; and a refusal of the role after a filter leaves nothing of the log on screen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  byWords,
  click,
  requireIn,
  typeInto,
  type TestLocale,
} from "../support/render-with-intl";
import {
  auditAccountIdOf,
  auditEventsFrom,
  wireAuditEvent,
  wireAuditPage,
} from "../support/staff-audit-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
} from "../support/staff-kitchens-wire";
import { resolveStaffSessionExpired } from "@/staff/staff-session-expiry";

import {
  CARDS,
  ROWS,
  SHOWING,
  TABLE,
  setUpAuditHarness,
  type AuditHarness,
  type Width,
} from "./qa-l3-u6-harness.adversarial";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const WIDTHS: readonly Width[] = ["desktop", "phone"];
const FOOT_NUMBERS = '[data-testid="staff-audit-foot"] nav';
const ISOLATE_OPEN = String.fromCodePoint(0x2068);
const ISOLATE_CLOSE = String.fromCodePoint(0x2069);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const POP_ISOLATE = String.fromCodePoint(0x2069);
const NUL = String.fromCodePoint(0);
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

let harness: AuditHarness;

beforeEach(() => {
  harness = setUpAuditHarness();
});

afterEach(() => {
  harness.tearDown();
});

function fenced(typed: string): string {
  return `${ISOLATE_OPEN}${typed.replace(BIDI_CONTROLS, "")}${ISOLATE_CLOSE}`;
}

function occurrencesOf(text: string, part: string): number {
  return text.split(part).length - 1;
}

function pageOf(
  events: readonly unknown[],
  overrides: Parameters<typeof wireAuditPage>[1] = {},
) {
  return { body: wireAuditPage(events, overrides) };
}

function tagNamesIn(root: ParentNode): string[] {
  return allIn(root, "*").map((element) => element.tagName);
}

const HOSTILE_TEXTS: readonly (readonly [string, string])[] = [
  ["a script element", "<script>alert(1)</script>"],
  ["an event handler", '"><img src=x onerror=alert(1)>'],
  ["a right-to-left override", `ana${RIGHT_TO_LEFT_OVERRIDE}evil@mail.md`],
  [
    "a closing isolate followed by an override",
    `x${POP_ISOLATE}${RIGHT_TO_LEFT_OVERRIDE}y`,
  ],
  ["ICU braces", "{count, plural, one {# a} other {# b}} {name} '{' }"],
  ["ten thousand characters", "ab".repeat(5000)],
  ["a newline and a NUL", `line1\nline2${NUL}end`],
  ["an entity", "&lt;b&gt; &amp; &#x3C;"],
  ["a link with a script", "javascript:alert(1)"],
  ["a prototype name", "__proto__"],
];

describe.each(LOCALES)("text somebody else wrote, in %s", (locale) => {
  describe.each(WIDTHS)("on a %s", (width) => {
    async function mountOneRow(typed: string): Promise<HTMLElement> {
      harness.answers(() =>
        pageOf([
          wireAuditEvent(1, {
            actor: { id: auditAccountIdOf(2), email: typed },
            subject: { email: typed },
            kitchen: { id: "k".repeat(21), name: typed },
            entry: { kind: "unrecognised", action: typed },
          }),
        ]),
      );
      await harness.mount({ locale, width });
      return requireIn(harness.container(), ROWS);
    }

    it.each(HOSTILE_TEXTS)(
      "draws %s as text in the four places a row holds it, builds no element from it, and puts it in no attribute",
      async (_label, typed) => {
        const row = await mountOneRow("benign");
        const benignTags = tagNamesIn(row);
        harness.unmount();

        const hostileRow = await mountOneRow(typed);
        const container = harness.container();

        expect(occurrencesOf(hostileRow.textContent, fenced(typed))).toBe(4);
        expect(tagNamesIn(hostileRow)).toEqual(benignTags);
        expect(container.innerHTML).not.toContain("<script");
        expect(
          container.querySelector("img, script, iframe, object, embed"),
        ).toBeNull();
        expect(hostileRow.querySelector("a")).toBeNull();
        const stripped = typed.replace(BIDI_CONTROLS, "");
        for (const element of allIn(container, "*")) {
          for (const attribute of Array.from(element.attributes)) {
            expect(
              attribute.value,
              `${element.tagName} ${attribute.name}`,
            ).not.toContain(stripped.slice(0, 8) === "" ? "\u0001" : stripped);
          }
        }
      },
    );

    it.each(HOSTILE_TEXTS)(
      "offers %s in the person's menu as text between the isolate marks, once",
      async (_label, typed) => {
        await mountOneRow(typed);

        const options = allIn<HTMLOptionElement>(
          harness.personSelect(),
          "option",
        );

        expect(options.map(({ textContent }) => textContent)).toEqual([
          CATALOGUES[locale].staffAudit.filterPersonAll,
          fenced(typed),
        ]);
        expect(options[1]?.value).toBe(auditAccountIdOf(2));
      },
    );

    it("shows the account id of nobody as a word on the page", async () => {
      await mountOneRow("benign");

      expect(harness.container().textContent).not.toContain(
        auditAccountIdOf(2),
      );
    });
  });
});

describe.each(LOCALES)("the foot, in %s", (locale) => {
  const words = CATALOGUES[locale].staffKitchens.showing;
  const showing = (from: number, to: number, total: number): string =>
    words
      .replace("{from, number, ::group-off}", String(from))
      .replace("{to, number, ::group-off}", String(to))
      .replace("{total, number, ::group-off}", String(total));

  it.each([
    ["the first page of many", 1, 1204, 25, 1, 25],
    ["a log of one row", 1, 1, 1, 1, 1],
    ["exactly one full page", 1, 25, 25, 1, 25],
    ["one row more than a page", 1, 26, 25, 1, 25],
    ["the last row alone on its page", 2, 26, 1, 26, 26],
    ["the last, partial page", 49, 1204, 4, 1201, 1204],
    ["a total that grouping would break up", 3, 12345, 25, 51, 75],
    ["a total of ten thousand", 400, 10000, 25, 9976, 10000],
  ])(
    "reads %s as a–b of n in digits, the same whatever the grouping of the language",
    async (_label, page, total, count, from, to) => {
      harness.answers(() =>
        pageOf(auditEventsFrom((page - 1) * 25 + 1, count), { total, page }),
      );
      await harness.mount({ locale, width: "desktop" });

      expect(requireIn(harness.container(), SHOWING).textContent).toBe(
        showing(from, to, total),
      );
    },
  );

  it("draws no foot and no numbers for an empty log", async () => {
    harness.answers(() => pageOf([], { total: 0 }));
    await harness.mount({ locale, width: "desktop" });

    expect(
      harness.container().querySelector('[data-testid="staff-audit-foot"]'),
    ).toBeNull();
    expect(harness.container().querySelector(FOOT_NUMBERS)).toBeNull();
  });

  it.each([
    [2, 1, ["1", "2"]],
    [8, 4, ["1", "2", "3", "4", "5", "6", "7", "8"]],
    [9, 1, ["1", "2", "…", "9"]],
    [9, 9, ["1", "…", "8", "9"]],
    [9, 5, ["1", "…", "4", "5", "6", "…", "9"]],
    [120, 1, ["1", "2", "…", "120"]],
    [120, 120, ["1", "…", "119", "120"]],
  ])(
    "numbers %s pages, standing on page %s, as %j",
    async (pageCount, current, expected) => {
      harness.answers(() =>
        pageOf(auditEventsFrom((current - 1) * 25 + 1, 25), {
          total: pageCount * 25,
          page: current,
        }),
      );
      await harness.mount({ locale, width: "desktop" });

      const slots = allIn(
        requireIn(harness.container(), FOOT_NUMBERS),
        "li",
      ).slice(1, -1);
      expect(
        slots.map((slot) =>
          slot.querySelector("button") === null ? "…" : slot.textContent,
        ),
      ).toEqual(expected);
    },
  );

  it.each([
    [26, ["1", "2"]],
    [1204, ["1", "2", "…", "49"]],
    [201, ["1", "2", "…", "9"]],
  ])(
    "counts a last page that is only part of one as a page: a log of %s rows is numbered %j",
    async (total, expected) => {
      harness.answers(() => pageOf(auditEventsFrom(1, 25), { total }));
      await harness.mount({ locale, width: "desktop" });

      const slots = allIn(
        requireIn(harness.container(), FOOT_NUMBERS),
        "li",
      ).slice(1, -1);
      expect(
        slots.map((slot) =>
          slot.querySelector("button") === null ? "…" : slot.textContent,
        ),
      ).toEqual(expected);
    },
  );

  it("offers no number for a log that fits on one page, on a desktop, and no 'more' on a phone", async () => {
    harness.answers(() => pageOf(auditEventsFrom(1, 25), { total: 25 }));
    await harness.mount({ locale, width: "desktop" });
    expect(harness.container().querySelector(FOOT_NUMBERS)).toBeNull();
    harness.unmount();

    await harness.mount({ locale, width: "phone" });

    expect(
      allIn(harness.container(), "button").map(
        ({ textContent }) => textContent,
      ),
    ).not.toContain(CATALOGUES[locale].staffKitchens.loadMore);
  });
});

describe("the words for a number of rows", () => {
  /* eslint-disable no-restricted-syntax -- an independent oracle for the plural rule of the catalogue under test: no leaf of the catalogue can supply the expectation of its own plural expression. */
  function romanianRows(count: number): string {
    if (count === 1) return `${String(count)} rând`;
    return count === 0 || count % 100 < 20
      ? `${String(count)} rânduri`
      : `${String(count)} de rânduri`;
  }

  /* eslint-enable no-restricted-syntax */

  function russianRows(count: number): string {
    const lastDigit = count % 10;
    const lastTwo = count % 100;
    if (lastDigit === 1 && lastTwo !== 11) return `${String(count)} строка`;
    const isFew =
      lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
    return isFew ? `${String(count)} строки` : `${String(count)} строк`;
  }

  const COUNTS = Array.from({ length: 26 }, (_, count) => count);

  it.each([
    ["ro", romanianRows, "pagina 1 · "],
    ["ru", russianRows, "страница 1 · "],
  ] as const)(
    "tells every count of 0 to 25 of a viewed page by the rule of %s, through the whole page",
    async (locale, expectedRows, prefix) => {
      harness.answers(() =>
        pageOf(
          COUNTS.map((rowCount, index) =>
            wireAuditEvent(index + 1, {
              kitchen: null,
              subject: null,
              entry: {
                kind: "recognised",
                action: "audit-viewed",
                detail: {
                  page: 1,
                  rowCount,
                  hasActorFilter: false,
                  hasActionFilter: false,
                  hasDateFilter: false,
                },
              },
            }),
          ),
          { total: COUNTS.length, pageSize: 26 },
        ),
      );
      await harness.mount({ locale, width: "desktop" });

      const told = allIn(harness.container(), ROWS).map(
        (row) => allIn(row, "td")[3]?.textContent ?? "",
      );

      expect(told).toEqual(
        COUNTS.map((count) => `${prefix}${expectedRows(count)}`),
      );
    },
  );

  it("agrees with the plural categories of the language, so the rule above is the language's and not the author's", () => {
    const romanian = new Intl.PluralRules("ro");
    for (const count of COUNTS) {
      const category = romanian.select(count);
      const told = romanianRows(count);
      expect(told.includes(" de "), String(count)).toBe(category === "other");
    }
  });
});

describe("the days a person types", () => {
  it.each([
    ["the day the clocks go forward", "2026-03-29"],
    ["the day the clocks go back", "2026-10-25"],
    ["the first day the log keeps", "2000-01-01"],
    ["the last day the log keeps", "9998-12-31"],
    ["a leap day", "2028-02-29"],
  ])("asks for %s as the very day the field holds", async (_label, day) => {
    harness.answers(() => pageOf(auditEventsFrom(1, 2)));
    await harness.mount({ width: "desktop" });
    const [from, to] = harness.dayInputs();

    typeInto(from, day);
    await harness.settle();
    typeInto(to, day);
    await harness.settle();

    expect(harness.queries()).toEqual([
      { page: "1" },
      { page: "1", from: day },
      { page: "1", from: day, to: day },
    ]);
  });

  it.each([
    ["the day before the first year", "1999-12-31"],
    ["the first day after the last year", "9999-01-01"],
  ])("asks for nothing for %s, and says why", async (_label, day) => {
    harness.answers(() => pageOf(auditEventsFrom(1, 2)));
    await harness.mount({ width: "desktop" });
    const [from] = harness.dayInputs();

    typeInto(from, day);
    await harness.settle();

    expect(harness.queries()).toEqual([{ page: "1" }]);
    expect(
      requireIn(harness.container(), '[data-testid="staff-audit-date-problem"]')
        .textContent,
    ).toContain("2000–9998");
  });

  it("asks for the log without a day when a day is emptied again", async () => {
    harness.answers(() => pageOf(auditEventsFrom(1, 2)));
    await harness.mount({ width: "desktop" });
    const [from] = harness.dayInputs();
    typeInto(from, "2026-10-01");
    await harness.settle();

    typeInto(from, "");
    await harness.settle();

    expect(harness.queries().at(-1)).toEqual({ page: "1" });
  });

  it("names the years of the log in digits only, in both languages", () => {
    for (const locale of LOCALES) {
      const words = CATALOGUES[locale].staffAudit.dayInvalid;
      expect(words.match(/::group-off/gu)).toHaveLength(2);
    }
  });
});

describe.each(LOCALES)("the 'more' of a phone, in %s", (locale) => {
  const kit = CATALOGUES[locale].accountForm;
  const moreWords = CATALOGUES[locale].staffKitchens.loadMore;

  async function mountLog(): Promise<void> {
    harness.answers((request) =>
      request.url.searchParams.get("page") === "1"
        ? pageOf(auditEventsFrom(1, 25), { total: 60 })
        : pageOf(auditEventsFrom(25, 25), { total: 60, page: 2 }),
    );
    await harness.mount({ locale, width: "phone" });
  }

  it("waits out a limit, ignores the presses of the wait, and asks nothing when the wait ends", async () => {
    await mountLog();
    harness.answers(() => RATE_LIMITED_ANSWER(90));
    click(byWords(harness.container(), "button", moreWords));
    await harness.settle();
    expect(harness.auditRequests()).toHaveLength(2);

    const waiting = byWords(harness.container(), "button", moreWords);
    expect(waiting.getAttribute("aria-disabled")).toBe("true");
    click(waiting);
    click(waiting);
    await harness.settle();
    await harness.pass(95_000);
    await harness.pass(6 * 60 * 60 * 1000);

    expect(harness.auditRequests()).toHaveLength(2);
    expect(
      byWords(harness.container(), "button", moreWords).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(allIn(harness.container(), ROWS)).toHaveLength(25);
  });

  it("asks again, once per press, after a service that was down", async () => {
    await mountLog();
    harness.answers(() => UNAVAILABLE_ANSWER);
    click(byWords(harness.container(), "button", moreWords));
    await harness.settle();
    expect(
      requireIn(harness.container(), '[role="alert"]').textContent,
    ).toContain(kit.unavailableTitle);
    await harness.pass(3 * 60 * 60 * 1000);
    expect(harness.auditRequests()).toHaveLength(2);

    harness.answers(() =>
      pageOf(auditEventsFrom(25, 25), { total: 60, page: 2 }),
    );
    click(byWords(harness.container(), "button", moreWords));
    await harness.settle();

    expect(harness.auditRequests()).toHaveLength(3);
    expect(allIn(harness.container(), ROWS)).toHaveLength(49);
  });

  it("is a session sheet and a button that stays busy on a refused session, and one page more once the person is back", async () => {
    await mountLog();
    harness.answers(() => UNAUTHENTICATED_ANSWER);
    click(byWords(harness.container(), "button", moreWords));
    await harness.settle();
    expect(harness.auditRequests()).toHaveLength(2);

    harness.answers(() =>
      pageOf(auditEventsFrom(25, 25), { total: 60, page: 2 }),
    );
    resolveStaffSessionExpired();
    await harness.settle();
    resolveStaffSessionExpired();
    await harness.settle();

    expect(harness.auditRequests()).toHaveLength(3);
    expect(allIn(harness.container(), ROWS)).toHaveLength(49);
  });
});

describe("a refusal of the role after the page was drawn", () => {
  it.each(LOCALES)(
    "takes every row and every filter off the page when a later filter is answered 403, in %s",
    async (locale) => {
      let isRefused = false;
      harness.answers(() =>
        isRefused ? FORBIDDEN_ANSWER : pageOf(auditEventsFrom(1, 5)),
      );
      await harness.mount({ locale, width: "desktop" });
      expect(allIn(harness.container(), ROWS)).toHaveLength(5);
      isRefused = true;

      await harness.choose(harness.actionSelect(), "note-added");

      expect(harness.container().querySelector(TABLE)).toBeNull();
      expect(harness.container().querySelector(CARDS)).toBeNull();
      expect(allIn(harness.container(), ROWS)).toHaveLength(0);
      expect(harness.selects()).toHaveLength(0);
      expect(allIn(harness.container(), "h1")).toHaveLength(1);
      expect(allIn(harness.container(), "main")).toHaveLength(1);
    },
  );
});

describe("a limit with a wait, however long", () => {
  const kit = CATALOGUES.ro.accountForm;

  it.each([
    ["half a minute", "30", 30],
    ["ten minutes", "600", 600],
    ["an hour", "3600", 3600],
    ["two hours", "7200", 7200],
    ["a day", "86400", 86_400],
  ])(
    "keeps 'try again' off for the whole of %s, ignores a press in it, wakes at its end, and asks nothing by itself",
    async (_label, retryAfter, seconds) => {
      harness.answers(() => RATE_LIMITED_ANSWER(Number(retryAfter)));
      await harness.mount({ locale: "ro", width: "desktop" });
      const retryButton = () =>
        byWords(harness.container(), "button", kit.retry);

      await harness.pass((seconds - 5) * 1000);
      expect(retryButton().getAttribute("aria-disabled")).toBe("true");
      click(retryButton());
      await harness.settle();
      expect(harness.auditRequests()).toHaveLength(1);

      await harness.pass(10 * 1000);
      expect(retryButton().getAttribute("aria-disabled")).toBeNull();
      await harness.pass(48 * 60 * 60 * 1000);
      expect(harness.auditRequests()).toHaveLength(1);

      harness.answers(() => pageOf(auditEventsFrom(1, 2)));
      click(retryButton());
      await harness.settle();
      expect(harness.auditRequests()).toHaveLength(2);
      expect(allIn(harness.container(), ROWS)).toHaveLength(2);
    },
  );

  it.each([
    ["no Retry-After", undefined],
    ["a word", "later"],
    ["a negative number", "-30"],
    ["a date in the past", "Wed, 21 Oct 2015 07:28:00 GMT"],
  ])(
    "never leaves 'try again' stuck off for %s",
    async (_label, retryAfter) => {
      harness.answers(() => ({
        status: 429,
        body: { status: "rate-limited" },
        headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
      }));
      await harness.mount({ locale: "ro", width: "desktop" });

      const retry = byWords(harness.container(), "button", kit.retry);

      expect(retry.getAttribute("aria-disabled")).toBeNull();
      expect(
        requireIn(harness.container(), '[role="status"], [role="alert"]'),
      ).not.toBeNull();
      await harness.pass(6 * 60 * 60 * 1000);
      expect(harness.auditRequests()).toHaveLength(1);
    },
  );
});

describe("a whole visit to the page", () => {
  it.each(LOCALES)(
    "writes nothing anywhere: no cookie, no title, no storage, no history, no beacon, no console, whatever is chosen, in %s",
    async (locale) => {
      const cookieDescriptor = Object.getOwnPropertyDescriptor(
        Document.prototype,
        "cookie",
      );
      const cookieWrite = vi.fn();
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () => "",
        set: cookieWrite,
      });
      const titleBefore = document.title;
      const spies = [
        vi.spyOn(window.history, "pushState"),
        vi.spyOn(window.history, "replaceState"),
        vi.spyOn(Storage.prototype, "setItem"),
        vi.spyOn(Storage.prototype, "removeItem"),
        vi.spyOn(Storage.prototype, "clear"),
        vi.spyOn(console, "log"),
        vi.spyOn(console, "warn"),
        vi.spyOn(console, "error"),
        vi.spyOn(console, "info"),
        vi.spyOn(console, "debug"),
      ];
      const beacon = vi.fn();
      Object.defineProperty(navigator, "sendBeacon", {
        value: beacon,
        configurable: true,
      });
      harness.answers((request) =>
        pageOf(auditEventsFrom(1, 25), {
          total: 200,
          page: Number(request.url.searchParams.get("page")),
        }),
      );

      try {
        await harness.mount({ locale, width: "desktop" });
        await harness.choose(harness.actionSelect(), "note-added");
        const [from, to] = harness.dayInputs();
        typeInto(from, "2026-10-01");
        await harness.settle();
        typeInto(to, "2026-10-31");
        await harness.settle();
        click(
          byWords(
            harness.container(),
            "button",
            CATALOGUES[locale].staffKitchens.pageNumber.replace(
              "{page, number, ::group-off}",
              "2",
            ),
          ),
        );
        await harness.settle();
        typeInto(to, "2026-09-01");
        await harness.settle();

        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
        expect(cookieWrite).not.toHaveBeenCalled();
        expect(beacon).not.toHaveBeenCalled();
        expect(document.title).toBe(titleBefore);
        expect(harness.location.assign).not.toHaveBeenCalled();
      } finally {
        if (cookieDescriptor === undefined) {
          Reflect.deleteProperty(document, "cookie");
        } else {
          Object.defineProperty(document, "cookie", cookieDescriptor);
        }
      }
    },
  );
});
