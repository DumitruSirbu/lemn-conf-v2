// @vitest-environment happy-dom
//
// The audit log as a person meets it (Lot 3 frames S8A to S8E, DS8A to DS8E): every state of the page in Romanian and in
// Russian, the rows a desktop and a phone draw, the labels of the actions, the filters that ask for a page, the pages
// that walk the log, and the guarantees that hold whatever the database or a person put into an address, a name or an
// action code. The server is a stand-in for `fetch`; the catalogue is the shipped one, and the words are compared with its
// keys.
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAFF_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  StaffAuditScreen,
  StaffAuditUnavailableScreen,
} from "@/staff/staff-audit-page";
import {
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  ADMINISTRATOR_ADDRESS,
  CLIENT_ADDRESS,
  OPERATOR_ADDRESS,
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
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES = ["ro", "ru"] as const;
const CONTEXT: StaffShellContext = {
  role: "administrator",
  email: ADMINISTRATOR_ADDRESS,
  navigation: ["kitchens", "audit"],
};
const ISOLATE_OPEN = "\u2068";
const ISOLATE_CLOSE = "\u2069";
const BIDI_CONTROL = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const TABLE = '[data-testid="staff-audit-table"]';
const CARDS = '[data-testid="staff-audit-cards"]';
const ROWS = '[data-testid="staff-audit-row"]';
const SHOWING = '[data-testid="staff-audit-showing"]';
const NOW = new Date("2026-10-21T12:00:00.000Z");

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;
let assigned: string[];
let reloads: number;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  assigned = [];
  reloads = 0;
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
    reload: () => {
      reloads += 1;
    },
  });
  server = installStaffKitchensServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function auditWords(locale: TestLocale) {
  return CATALOGUES[locale].staffAudit;
}

function kitchensWords(locale: TestLocale) {
  return CATALOGUES[locale].staffKitchens;
}

function translatorFor(locale: TestLocale, namespace: "staffAudit") {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace,
  });
}

function pageNumberLabel(locale: TestLocale, page: number): string {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchens",
  })("pageNumber", { page });
}

function showingLine(
  locale: TestLocale,
  range: { from: number; to: number; total: number },
): string {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchens",
  })("showing", range);
}

/** What the audit route answers; every other address is the account area's session read. */
function auditAnswers(
  answer: (request: RecordedRequest) => ServerAnswer | "hold" | "offline",
): void {
  server.script((request) => {
    if (request.url.pathname === "/api/staff/audit") return answer(request);
    return {
      body: {
        state: "signed-in",
        email: ADMINISTRATOR_ADDRESS,
        capabilities: ["audit.read", "account.manage.own"],
      },
    };
  });
}

function pageOf(
  events: readonly unknown[],
  overrides: Parameters<typeof wireAuditPage>[1] = {},
): ServerAnswer {
  return { body: wireAuditPage(events, overrides) };
}

function auditRequests(): RecordedRequest[] {
  return server.requests.filter(
    ({ url }) => url.pathname === "/api/staff/audit",
  );
}

function lastQuery(): Record<string, string> {
  const last = auditRequests().at(-1);
  if (last === undefined) throw new Error("the audit route was not asked");
  return Object.fromEntries(last.url.searchParams);
}

function useWidth(width: "desktop" | "phone"): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width === "desktop",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

async function pass(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
  await settle();
}

async function mount({
  locale = "ro",
  width = "phone",
}: { locale?: TestLocale; width?: "desktop" | "phone" } = {}): Promise<void> {
  useWidth(width);
  screen = mountInCatalogue(
    createElement(StaffAuditScreen, { locale, context: CONTEXT }),
    locale,
  );
  await settle();
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function selects(): HTMLSelectElement[] {
  return allIn<HTMLSelectElement>(container(), "select");
}

function personSelect(): HTMLSelectElement {
  return requireIn<HTMLSelectElement>(container(), "select");
}

function actionSelect(): HTMLSelectElement {
  const second = selects()[1];
  if (second === undefined) throw new Error("no action select");
  return second;
}

function dayInputs(): [HTMLInputElement, HTMLInputElement] {
  const [from, to] = allIn<HTMLInputElement>(container(), 'input[type="date"]');
  if (from === undefined || to === undefined) throw new Error("no day fields");
  return [from, to];
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function typeDay(input: HTMLInputElement, day: string): Promise<void> {
  typeInto(input, day);
  await settle();
}

function rowTexts(): string[] {
  return allIn(container(), ROWS).map((row) => row.textContent);
}

function textWithoutIsolates(text: string): string {
  return text.replaceAll(ISOLATE_OPEN, "").replaceAll(ISOLATE_CLOSE, "");
}

describe.each(LOCALES)("in %s", (locale) => {
  const words = auditWords(locale);
  const account = CATALOGUES[locale].accountForm;

  describe("while the first page is out (frame S8A)", () => {
    it("draws skeleton rows and a live region that says the log is loading, and no table", async () => {
      auditAnswers(() => "hold");
      await mount({ locale, width: "desktop" });

      expect(
        requireIn(container(), '[data-testid="staff-audit-skeleton"]'),
      ).not.toBeNull();
      expect(requireIn(container(), '[role="status"]').textContent).toBe(
        words.loading,
      );
      expect(container().querySelector(TABLE)).toBeNull();
    });

    it("keeps the title, the note that the log cannot be changed, and the filters on screen", async () => {
      auditAnswers(() => "hold");
      await mount({ locale });

      expect(requireIn(container(), "h1").textContent).toBe(words.title);
      expect(container().textContent).toContain(words.readOnlyNote);
      expect(selects()).toHaveLength(2);
      expect(dayInputs()).toHaveLength(2);
    });
  });

  describe("the rows on a desktop (frame DS8B)", () => {
    beforeEach(async () => {
      auditAnswers(() =>
        pageOf(
          [
            wireAuditEvent(1, {
              occurredAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
            }),
          ],
          { total: 1204 },
        ),
      );
      await mount({ locale, width: "desktop" });
    });

    it("draws a table named for the log with the four columns of the frame and no cards", () => {
      const headings = allIn(requireIn(container(), TABLE), "th").map(
        (heading) => heading.textContent,
      );

      expect(headings).toEqual([
        words.columnWhen,
        words.columnWho,
        words.columnAction,
        words.columnObject,
      ]);
      expect(requireIn(container(), TABLE).getAttribute("aria-label")).toBe(
        words.title,
      );
      expect(container().querySelector(CARDS)).toBeNull();
    });

    it("tells when on the shop's clock with how long ago, who by address, what by words, and the kitchen with its client", () => {
      const [row] = allIn(container(), ROWS);
      const time = requireIn(row ?? container(), "time");

      expect(time.getAttribute("datetime")).toBe(
        new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      );
      expect(time.textContent).toBe(
        new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: "Europe/Chisinau",
        }).format(new Date(NOW.getTime() - 5 * 60_000)),
      );
      const cells = allIn(row ?? container(), "td").map(
        (cell) => cell.textContent,
      );
      expect(cells[0]).toContain(
        new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
          -5,
          "minute",
        ),
      );
      expect(cells[1]).toBe(
        `${ISOLATE_OPEN}${OPERATOR_ADDRESS}${ISOLATE_CLOSE}`,
      );
      expect(cells[2]).toBe(words.actionKitchenOpened);
      expect(cells[3]).toBe(
        `${ISOLATE_OPEN}Bucatarie 1${ISOLATE_CLOSE}${ISOLATE_OPEN}${CLIENT_ADDRESS}${ISOLATE_CLOSE}`,
      );
    });

    it("tells which rows are shown of how many, and numbers the pages", () => {
      expect(requireIn(container(), SHOWING).textContent).toBe(
        showingLine(locale, { from: 1, to: 1, total: 1204 }),
      );
      expect(
        allIn(container(), 'button[aria-current="page"]').map(
          (button) => button.textContent,
        ),
      ).toEqual(["1"]);
      expect(
        byWords(container(), "button", kitchensWords(locale).nextPage),
      ).not.toBeNull();
    });
  });

  describe("the rows on a phone (frame S8B, mobile)", () => {
    it("draws one card per row, each fact under its column's name, and no table", async () => {
      auditAnswers(() => pageOf(auditEventsFrom(1, 3)));
      await mount({ locale });

      const cards = allIn(requireIn(container(), CARDS), "li");
      const labels = allIn(cards[0] ?? container(), "dt").map(
        (label) => label.textContent,
      );

      expect(cards).toHaveLength(3);
      expect(labels).toEqual([
        words.columnWhen,
        words.columnWho,
        words.columnAction,
        words.columnObject,
      ]);
      expect(container().querySelector(TABLE)).toBeNull();
    });
  });

  describe("an empty log (frame S8C)", () => {
    it("says so in one sentence, with no filter result and no foot", async () => {
      auditAnswers(() => pageOf([]));
      await mount({ locale });

      const empty = requireIn(container(), '[data-testid="staff-audit-empty"]');
      expect(empty.textContent).toContain(words.emptyTitle);
      expect(empty.textContent).toContain(words.emptyBody);
      expect(container().querySelector(ROWS)).toBeNull();
      expect(
        container().querySelector('[data-testid="staff-audit-foot"]'),
      ).toBeNull();
    });
  });

  describe("filters that matched nothing (frame S8D)", () => {
    it("says so, keeps the filters, and drops all of them with one press", async () => {
      auditAnswers((request) =>
        request.url.searchParams.has("action")
          ? pageOf([])
          : pageOf(auditEventsFrom(1, 2)),
      );
      await mount({ locale });
      await choose(actionSelect(), "audit-viewed");

      const none = requireIn(
        container(),
        '[data-testid="staff-audit-no-results"]',
      );
      expect(none.textContent).toContain(words.noResultsTitle);
      expect(none.textContent).toContain(words.noResultsBody);
      expect(actionSelect().value).toBe("audit-viewed");

      click(byWords(none, "button", words.clearFilters));
      await settle();

      expect(actionSelect().value).toBe("");
      expect(lastQuery()).toEqual({ page: "1" });
      expect(rowTexts()).toHaveLength(2);
    });

    it("sends focus to the first filter when the press that held it has gone", async () => {
      auditAnswers((request) =>
        request.url.searchParams.has("action")
          ? pageOf([])
          : pageOf(auditEventsFrom(1, 2)),
      );
      await mount({ locale });
      await choose(actionSelect(), "audit-viewed");

      click(
        byWords(
          requireIn(container(), '[data-testid="staff-audit-no-results"]'),
          "button",
          words.clearFilters,
        ),
      );
      await settle();

      expect(document.activeElement).toBe(personSelect());
    });
  });

  describe("a page that cannot be had (frame S8E)", () => {
    it("tells a 503 in the account's words and asks again only when the button is pressed", async () => {
      auditAnswers(() => UNAVAILABLE_ANSWER);
      await mount({ locale });

      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        account.unavailableTitle,
      );
      await pass(30 * 60 * 1000);
      expect(auditRequests()).toHaveLength(1);

      click(byWords(container(), "button", account.retry));
      await settle();

      expect(auditRequests()).toHaveLength(2);
    });

    it("tells a 429 with its countdown, keeps the button inert while it runs, and asks nothing when it ends", async () => {
      auditAnswers(() => RATE_LIMITED_ANSWER(90));
      await mount({ locale });

      const retry = byWords(container(), "button", account.retry);
      expect(retry.getAttribute("aria-disabled")).toBe("true");
      click(retry);
      await settle();
      expect(auditRequests()).toHaveLength(1);

      await pass(95_000);

      expect(requireIn(container(), '[data-tone="info"]').textContent).toBe(
        account.rateLimitedReady,
      );
      expect(auditRequests()).toHaveLength(1);
      expect(
        byWords(container(), "button", account.retry).getAttribute(
          "aria-disabled",
        ),
      ).toBeNull();
    });

    it("tells an hour's lockout as the clock time it ends, and still asks nothing", async () => {
      auditAnswers(() => RATE_LIMITED_ANSWER(3600));
      await mount({ locale });

      expect(
        requireIn(container(), '[data-tone="warning"]').textContent,
      ).not.toBe("");
      await pass(30 * 60 * 1000);
      expect(auditRequests()).toHaveLength(1);
    });

    it("tells an answer with no connection as the account's offline notice", async () => {
      auditAnswers(() => "offline");
      await mount({ locale });

      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        account.offlineTitle,
      );
    });

    it("tells a 400 that names a field and a code as a failed request, with no row, and asks nothing again", async () => {
      auditAnswers(() => ({
        status: 400,
        body: {
          status: "invalid-input",
          issues: [{ field: "range", code: "RANGE_INVERTED" }],
        },
      }));
      await mount({ locale });

      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        account.requestFailedTitle,
      );
      expect(container().querySelector(ROWS)).toBeNull();
      await pass(30 * 60 * 1000);
      expect(auditRequests()).toHaveLength(1);
    });

    it("tells an answer it cannot read as a failed request, never as a log", async () => {
      auditAnswers(() => ({ body: { total: 1, page: 1 } }));
      await mount({ locale });

      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        account.requestFailedTitle,
      );
      expect(container().querySelector(ROWS)).toBeNull();
    });
  });

  describe("the session", () => {
    it("draws the session sheet over the page on a 401, leaves nowhere, and asks again once the person is back", async () => {
      let isSignedIn = false;
      auditAnswers(() =>
        isSignedIn ? pageOf(auditEventsFrom(1, 2)) : UNAUTHENTICATED_ANSWER,
      );

      await mount({ locale });

      expect(assigned).toEqual([]);
      expect(
        container().querySelector('[data-testid="staff-session-sheet"]'),
      ).not.toBeNull();
      expect(container().querySelector(ROWS)).toBeNull();

      isSignedIn = true;
      act(() => {
        resolveStaffSessionExpired();
      });
      await settle();

      expect(auditRequests()).toHaveLength(2);
      expect(rowTexts()).toHaveLength(2);
      expect(
        container().querySelector('[data-testid="staff-session-sheet"]'),
      ).toBeNull();
    });

    it("draws the forbidden screen inside the staff frame on a 403, never an expired session", async () => {
      auditAnswers(() => FORBIDDEN_ANSWER);
      await mount({ locale });

      expect(container().textContent).toContain(
        CATALOGUES[locale].accountForbidden.title,
      );
      expect(container().textContent).not.toContain(
        CATALOGUES[locale].sessionExpiredSheet.title,
      );
      expect(
        container().querySelector('[data-testid="staff-role-chip"]'),
      ).not.toBeNull();
    });
  });

  describe("the action filter", () => {
    it("offers every action of the closed list by its words, after the choice of all", async () => {
      auditAnswers(() => pageOf(auditEventsFrom(1, 1)));
      await mount({ locale });

      const options = allIn<HTMLOptionElement>(actionSelect(), "option");

      expect(options.map((option) => option.value)).toEqual([
        "",
        ...STAFF_AUDIT_ACTIONS,
      ]);
      expect(options[0]?.textContent).toBe(words.filterActionAll);
      expect(options.slice(1).map((option) => option.textContent)).toEqual([
        words.actionKitchenOpened,
        words.actionNoteAdded,
        words.actionStatusChanged,
        words.actionKitchenUnhidden,
        words.actionKitchensListed,
        words.actionAuditViewed,
      ]);
    });
  });
});

describe("what each action says (frame S8B)", () => {
  const ENTRIES = [
    ["kitchen-opened", { action: "kitchen-opened", detail: null }],
    ["note-added", { action: "note-added", detail: null }],
    [
      "status-changed",
      { action: "status-changed", detail: { from: "new", to: "contacted" } },
    ],
    ["kitchen-unhidden", { action: "kitchen-unhidden", detail: null }],
    [
      "kitchens-listed",
      {
        action: "kitchens-listed",
        detail: {
          segment: "sent",
          status: null,
          page: 3,
          rowCount: 20,
          hasSearch: true,
        },
      },
    ],
    [
      "audit-viewed",
      {
        action: "audit-viewed",
        detail: {
          page: 2,
          rowCount: 25,
          hasActorFilter: false,
          hasActionFilter: true,
          hasDateFilter: false,
        },
      },
    ],
  ] as const;

  it.each(LOCALES)(
    "gives every action of the closed list its own label in %s, and admits that every one of them has one",
    async (locale) => {
      auditAnswers(() =>
        pageOf(
          ENTRIES.map(([, entry], index) =>
            wireAuditEvent(index + 1, {
              entry: { kind: "recognised", ...entry },
            }),
          ),
        ),
      );
      await mount({ locale, width: "desktop" });
      const words = auditWords(locale);

      const labels = allIn(container(), `${ROWS} td:nth-child(3)`).map(
        (cell) => cell.textContent,
      );

      expect(labels).toEqual([
        words.actionKitchenOpened,
        words.actionNoteAdded,
        words.actionStatusChanged,
        words.actionKitchenUnhidden,
        words.actionKitchensListed,
        words.actionAuditViewed,
      ]);
      expect(new Set(labels).size).toBe(STAFF_AUDIT_ACTIONS.length);
    },
  );

  it.each(LOCALES)(
    "tells a change of status by the words of the two statuses in %s",
    async (locale) => {
      auditAnswers(() =>
        pageOf([
          wireAuditEvent(1, {
            entry: {
              kind: "recognised",
              action: "status-changed",
              detail: { from: "new", to: "contacted" },
            },
          }),
        ]),
      );
      await mount({ locale, width: "desktop" });

      const object = requireIn(container(), `${ROWS} td:nth-child(4)`);

      expect(object.textContent).toContain(
        `${kitchensWords(locale).statusNew} → ${kitchensWords(locale).statusContacted}`,
      );
    },
  );

  it.each(LOCALES)(
    "tells a listed page and a viewed page by codes and counts alone in %s",
    async (locale) => {
      auditAnswers(() =>
        pageOf([
          wireAuditEvent(1, {
            entry: { kind: "recognised", ...ENTRIES[4][1] },
            kitchen: null,
            subject: null,
          }),
          wireAuditEvent(2, {
            entry: { kind: "recognised", ...ENTRIES[5][1] },
            kitchen: null,
            subject: null,
          }),
        ]),
      );
      await mount({ locale, width: "desktop" });
      const say = translatorFor(locale, "staffAudit");
      const rows = (count: number) => say("detailRows", { count });

      const [listed, viewed] = allIn(
        container(),
        `${ROWS} td:nth-child(4)`,
      ).map((cell) => cell.textContent);

      expect(listed).toBe(say("detailPageSearch", { page: 3, rows: rows(20) }));
      expect(viewed).toBe(
        say("detailPageFilters", { page: 2, rows: rows(25) }),
      );
    },
  );

  it("tells a viewed page that carried no filter without the filters' words", async () => {
    auditAnswers(() =>
      pageOf([
        wireAuditEvent(1, {
          entry: {
            kind: "recognised",
            action: "audit-viewed",
            detail: {
              page: 1,
              rowCount: 25,
              hasActorFilter: false,
              hasActionFilter: false,
              hasDateFilter: false,
            },
          },
          kitchen: null,
          subject: null,
        }),
      ]),
    );
    await mount({ width: "desktop" });
    const say = translatorFor("ro", "staffAudit");

    const object = requireIn(container(), `${ROWS} td:nth-child(4)`);

    expect(object.textContent).toBe(
      say("detailPage", { page: 1, rows: say("detailRows", { count: 25 }) }),
    );
  });
});

describe("a code the page does not know", () => {
  const HOSTILE_CODES = [
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "valueOf",
    "kitchen-opened ",
  ] as const;

  it.each(LOCALES)(
    "says the action is unknown in %s and shows the code as text, for a code that is a name every object inherits",
    async (locale) => {
      auditAnswers(() =>
        pageOf(
          HOSTILE_CODES.map((code, index) =>
            wireAuditEvent(index + 1, {
              entry: { kind: "unrecognised", action: code },
            }),
          ),
        ),
      );
      await mount({ locale, width: "desktop" });
      const words = auditWords(locale);

      const cells = allIn(container(), `${ROWS} td:nth-child(3)`).map(
        (cell) => cell.textContent,
      );

      expect(cells).toEqual(
        HOSTILE_CODES.map(
          (code) =>
            `${words.actionUnknown}${ISOLATE_OPEN}${code}${ISOLATE_CLOSE}`,
        ),
      );
    },
  );

  it("never takes a code for a label by the way it is written: a row told as recognised with a code the domain refuses is unknown too", async () => {
    auditAnswers(() =>
      pageOf(
        ["__proto__", "constructor", "toString"].map((code, index) =>
          wireAuditEvent(index + 1, {
            entry: { kind: "recognised", action: code, detail: null },
          }),
        ),
      ),
    );
    await mount({ width: "desktop" });

    const cells = allIn(container(), `${ROWS} td:nth-child(3)`).map(
      (cell) => cell.textContent,
    );

    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(cell).toContain(roMessages.staffAudit.actionUnknown);
      expect(cell).not.toContain("function");
      expect(cell).not.toContain("[object");
    }
  });

  it("draws a row whose detail the domain refuses as an unknown action, and the rest of the page as it is", async () => {
    auditAnswers(() =>
      pageOf([
        wireAuditEvent(1, {
          entry: {
            kind: "recognised",
            action: "status-changed",
            detail: { from: "new", to: "bogus" },
          },
        }),
        wireAuditEvent(2),
      ]),
    );
    await mount({ width: "desktop" });

    const cells = allIn(container(), `${ROWS} td:nth-child(3)`).map(
      (cell) => cell.textContent,
    );

    expect(cells[0]).toContain(roMessages.staffAudit.actionUnknown);
    expect(cells[1]).toBe(roMessages.staffAudit.actionKitchenOpened);
  });
});

describe("a dash where nothing resolves", () => {
  it("shows a dash for an actor whose account is gone, a kitchen the client deleted, and shows no client for a row that names none", async () => {
    auditAnswers(() =>
      pageOf([
        wireAuditEvent(1, {
          actor: { id: auditAccountIdOf(9), email: null },
          kitchen: { id: "k".repeat(21), name: null },
          subject: { email: null },
        }),
        wireAuditEvent(2, { subject: null, kitchen: null }),
      ]),
    );
    await mount({ width: "desktop" });

    const [first, second] = allIn(container(), ROWS);

    expect(allIn(first ?? container(), "td")[1]?.textContent).toBe(
      roMessages.staffKitchens.noValue,
    );
    expect(allIn(first ?? container(), "td")[3]?.textContent).toBe(
      roMessages.staffKitchens.noValue,
    );
    expect(allIn(second ?? container(), "td")[3]?.textContent).toBe(
      roMessages.staffKitchens.noValue,
    );
  });
});

describe("text that somebody else wrote", () => {
  const HOSTILE_ADDRESS = "ana\u202E@mail.md\u2069\u2066x";
  const HOSTILE_NAME =
    "Casa\u2069\u202E tro\u200Fl <img src=x onerror=alert(1)>";

  beforeEach(async () => {
    auditAnswers(() =>
      pageOf([
        wireAuditEvent(1, {
          actor: { id: auditAccountIdOf(2), email: HOSTILE_ADDRESS },
          subject: { email: HOSTILE_ADDRESS },
          kitchen: { id: "k".repeat(21), name: HOSTILE_NAME },
          entry: { kind: "unrecognised", action: "x\u202Ey\u2069z" },
        }),
      ]),
    );
    await mount({ width: "desktop" });
  });

  it("fences an address, a kitchen's name and an unknown code between isolate marks after stripping what reorders text", () => {
    const [row] = allIn(container(), ROWS);

    expect(rowTexts()[0]).toContain(
      `${ISOLATE_OPEN}ana@mail.mdx${ISOLATE_CLOSE}`,
    );
    expect(rowTexts()[0]).toContain(
      `${ISOLATE_OPEN}Casa trol <img src=x onerror=alert(1)>${ISOLATE_CLOSE}`,
    );
    expect(rowTexts()[0]).toContain(`${ISOLATE_OPEN}xyz${ISOLATE_CLOSE}`);
    expect(BIDI_CONTROL.test(textWithoutIsolates(row?.textContent ?? ""))).toBe(
      false,
    );
  });

  it("draws markup in a name as text and builds no element from it", () => {
    expect(container().querySelector("img")).toBeNull();
    expect(container().innerHTML).not.toContain("<img");
  });

  it("offers the person in the menu by the same fenced address", () => {
    const option = allIn(personSelect(), "option")[1];

    expect(option?.textContent).toBe(
      `${ISOLATE_OPEN}ana@mail.mdx${ISOLATE_CLOSE}`,
    );
  });
});

describe("the pages of a desktop log", () => {
  it("asks for the page whose number is pressed, lands focus on the line that says where the rows are, and keeps the filters", async () => {
    auditAnswers((request) =>
      pageOf(
        auditEventsFrom(
          (Number(request.url.searchParams.get("page")) - 1) * 25 + 1,
          25,
        ),
        { total: 1204, page: Number(request.url.searchParams.get("page")) },
      ),
    );
    await mount({ width: "desktop" });
    await choose(actionSelect(), "note-added");

    click(byWords(container(), "button", pageNumberLabel("ro", 2)));
    await settle();

    expect(lastQuery()).toEqual({ page: "2", action: "note-added" });
    expect(document.activeElement).toBe(requireIn(container(), SHOWING));
    expect(requireIn(container(), SHOWING).textContent).toContain("26");
  });

  it("asks once for the last page when the page asked for has been left behind by a log that shrank, and never twice", async () => {
    let shrunk = false;
    auditAnswers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      if (!shrunk) return pageOf(auditEventsFrom(1, 25), { total: 1204 });
      return page === 49
        ? pageOf([], { total: 30, page: 49 })
        : pageOf(auditEventsFrom(26, 5), { total: 30, page });
    });
    await mount({ width: "desktop" });
    shrunk = true;

    click(byWords(container(), "button", pageNumberLabel("ro", 49)));
    await settle();

    expect(
      auditRequests().map(({ url }) => url.searchParams.get("page")),
    ).toEqual(["1", "49", "2"]);
    expect(rowTexts()).toHaveLength(5);
  });

  it("does not follow a correction with another when the log shrank again and the last page is empty too", async () => {
    let isBroken = false;
    auditAnswers((request) => {
      if (!isBroken) return pageOf(auditEventsFrom(1, 25), { total: 1204 });
      const page = Number(request.url.searchParams.get("page"));
      return pageOf([], { total: page === 49 ? 30 : 10, page });
    });
    await mount({ width: "desktop" });
    isBroken = true;

    click(byWords(container(), "button", pageNumberLabel("ro", 49)));
    await settle();

    expect(auditRequests()).toHaveLength(3);
    expect(
      requireIn(container(), '[data-testid="staff-audit-page-unshown"]'),
    ).not.toBeNull();
  });
});

describe("the pages of a phone log", () => {
  it("appends the next page under the rows, shows a row both pages named once, and moves focus to the first row it added", async () => {
    auditAnswers((request) =>
      request.url.searchParams.get("page") === "2"
        ? pageOf(auditEventsFrom(25, 5), { total: 30, page: 2 })
        : pageOf(auditEventsFrom(1, 25), { total: 30 }),
    );
    await mount();

    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();

    expect(lastQuery()).toEqual({ page: "2" });
    expect(allIn(container(), ROWS)).toHaveLength(29);
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.eventId,
    ).toBe(
      auditEventsFrom(26, 1).map((event) => (event as { id: string }).id)[0],
    );
    expect(container().querySelector(TABLE)).toBeNull();
  });

  it("offers no 'load more' once every row is shown", async () => {
    auditAnswers(() => pageOf(auditEventsFrom(1, 3)));
    await mount();

    expect(
      allIn(container(), "button").some(
        (button) => button.textContent === roMessages.staffKitchens.loadMore,
      ),
    ).toBe(false);
  });
});

describe("the filters", () => {
  const OPERATOR = { id: auditAccountIdOf(1), email: OPERATOR_ADDRESS };
  const ADMINISTRATOR = {
    id: auditAccountIdOf(2),
    email: ADMINISTRATOR_ADDRESS,
  };

  beforeEach(async () => {
    auditAnswers((request) => {
      const actor = request.url.searchParams.get("actor");
      const events = [
        wireAuditEvent(1, { actor: OPERATOR }),
        wireAuditEvent(2, { actor: ADMINISTRATOR }),
      ].filter(
        (event) =>
          actor === null || (event.actor as { id: string }).id === actor,
      );
      return pageOf(events);
    });
    await mount();
    server.requests.length = 0;
  });

  function personOptions(): string[] {
    return allIn(personSelect(), "option").map((option) => option.textContent);
  }

  it("offers the people the rows named, each once, by address, after the choice of all", () => {
    expect(personOptions()).toEqual([
      roMessages.staffAudit.filterPersonAll,
      `${ISOLATE_OPEN}${ADMINISTRATOR_ADDRESS}${ISOLATE_CLOSE}`,
      `${ISOLATE_OPEN}${OPERATOR_ADDRESS}${ISOLATE_CLOSE}`,
    ]);
  });

  it("asks for the account's id when a person is chosen, and still offers the others afterwards", async () => {
    await choose(personSelect(), OPERATOR.id);

    expect(lastQuery()).toEqual({ page: "1", actor: OPERATOR.id });
    expect(rowTexts()).toHaveLength(1);
    expect(personOptions()).toHaveLength(3);
    expect(personSelect().value).toBe(OPERATOR.id);

    await choose(personSelect(), ADMINISTRATOR.id);

    expect(lastQuery()).toEqual({ page: "1", actor: ADMINISTRATOR.id });
  });

  it("takes a value that is not a person it has seen for all persons, and asks for no actor", async () => {
    const option = document.createElement("option");
    option.value = auditAccountIdOf(7);
    personSelect().append(option);

    await choose(personSelect(), option.value);

    expect(auditRequests()).toHaveLength(1);
    expect(lastQuery()).toEqual({ page: "1" });
  });

  it("asks for the action by its code, and for all of them by no code", async () => {
    await choose(actionSelect(), "audit-viewed");
    expect(lastQuery()).toEqual({ page: "1", action: "audit-viewed" });

    await choose(actionSelect(), "");
    expect(lastQuery()).toEqual({ page: "1" });
  });

  it("asks for both ends of a range as the days the fields hold, a single day included", async () => {
    const [from, to] = dayInputs();

    await typeDay(from, "2026-10-01");
    expect(lastQuery()).toEqual({ page: "1", from: "2026-10-01" });
    await typeDay(to, "2026-10-01");

    expect(lastQuery()).toEqual({
      page: "1",
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(screen?.container.querySelector('[role="alert"]')).toBeNull();
  });

  it("refuses a range that ends before it begins, says so on both fields, and asks for nothing until it is mended", async () => {
    const [from, to] = dayInputs();
    await typeDay(to, "2026-10-01");
    server.requests.length = 0;

    await typeDay(from, "2026-10-05");

    expect(auditRequests()).toHaveLength(0);
    expect(requireIn(container(), '[role="alert"]').textContent).toBe(
      roMessages.staffAudit.rangeInverted,
    );
    expect(from.getAttribute("aria-invalid")).toBe("true");
    expect(to.getAttribute("aria-invalid")).toBe("true");

    await typeDay(from, "2026-09-30");

    expect(container().querySelector('[role="alert"]')).toBeNull();
    expect(lastQuery()).toEqual({
      page: "1",
      from: "2026-09-30",
      to: "2026-10-01",
    });
  });

  it.each([
    ["a year before the log's first", "1999-12-31"],
    ["a year after its last", "9999-01-01"],
  ])(
    "asks for nothing for %s, and says the days must lie in the years the log keeps",
    async (_label, day) => {
      const [from] = dayInputs();

      await typeDay(from, day);

      expect(auditRequests()).toHaveLength(0);
      expect(requireIn(container(), '[role="alert"]').textContent).toBe(
        translatorFor("ro", "staffAudit")("dayInvalid", {
          first: 2000,
          last: 9998,
        }),
      );
    },
  );

  it("keeps the rows that are on screen while the days are refused", async () => {
    const [from] = dayInputs();

    await typeDay(from, "1999-12-31");

    expect(rowTexts()).toHaveLength(2);
  });

  it("keeps the people it has seen when the filters are dropped with one press, though the page that follows names only one of them", async () => {
    auditAnswers((request) => {
      if (request.url.searchParams.has("action")) return pageOf([]);
      return pageOf([wireAuditEvent(1, { actor: OPERATOR })]);
    });
    await choose(actionSelect(), "audit-viewed");

    click(
      byWords(
        requireIn(container(), '[data-testid="staff-audit-no-results"]'),
        "button",
        roMessages.staffAudit.clearFilters,
      ),
    );
    await settle();

    expect(lastQuery()).toEqual({ page: "1" });
    expect(personOptions()).toEqual([
      roMessages.staffAudit.filterPersonAll,
      `${ISOLATE_OPEN}${ADMINISTRATOR_ADDRESS}${ISOLATE_CLOSE}`,
      `${ISOLATE_OPEN}${OPERATOR_ADDRESS}${ISOLATE_CLOSE}`,
    ]);
  });

  it("keeps the filters out of the address, the history and the browser's storage", async () => {
    const pushed = vi.spyOn(window.history, "pushState");
    const replaced = vi.spyOn(window.history, "replaceState");
    const stored = vi.spyOn(Storage.prototype, "setItem");

    await choose(personSelect(), OPERATOR.id);
    await choose(actionSelect(), "audit-viewed");
    await typeDay(dayInputs()[0], "2026-10-01");

    expect(pushed).not.toHaveBeenCalled();
    expect(replaced).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();
    expect(assigned).toEqual([]);
  });
});

describe("a newer request over an older one", () => {
  it("aborts the request that was out and draws nothing of its late answer", async () => {
    auditAnswers(() => "hold");
    server.honoursAbort = false;
    await mount();
    const [first] = server.held;

    await choose(actionSelect(), "note-added");
    const [, second] = server.held;
    act(() => {
      second?.answer(pageOf(auditEventsFrom(1, 1)));
    });
    await settle();
    act(() => {
      first?.answer(pageOf(auditEventsFrom(10, 4)));
    });
    await settle();

    expect(first?.signal.aborted).toBe(true);
    expect(rowTexts()).toHaveLength(1);
  });
});

describe("a page restored from the back-forward cache", () => {
  it("is loaded again, so a stale log is never shown from memory", async () => {
    auditAnswers(() => pageOf(auditEventsFrom(1, 1)));
    await mount();

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
    });

    expect(reloads).toBe(1);
  });
});

describe.each(LOCALES)(
  "the page when the session store cannot be read, in %s",
  (locale) => {
    const words = auditWords(locale);
    const account = CATALOGUES[locale].accountForm;

    async function mountUnavailable(): Promise<void> {
      useWidth("phone");
      screen = mountInCatalogue(
        createElement(StaffAuditUnavailableScreen, { locale }),
        locale,
      );
      await settle();
    }

    it("is headed by the log's title, tells the service is not there, and draws no staff frame and asks nothing", async () => {
      await mountUnavailable();

      expect(requireIn(container(), "h1").textContent).toBe(words.title);
      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        account.unavailableTitle,
      );
      expect(
        container().querySelector('[data-testid="staff-role-chip"]'),
      ).toBeNull();
      expect(auditRequests()).toHaveLength(0);
    });

    it("asks for the page itself again when the one button is pressed", async () => {
      await mountUnavailable();

      click(byWords(container(), "button", account.retry));

      expect(reloads).toBe(1);
    });
  },
);
