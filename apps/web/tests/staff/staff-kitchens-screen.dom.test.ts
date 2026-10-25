// @vitest-environment happy-dom
//
// The staff list as a person meets it (Lot 3 frames S2A to S2F, DS2A to DS2F): every state of the list, the filters that
// ask for it, the pages that walk it, and the guarantees that hold whatever a client typed into a name or an address.
// The server is a stand-in for `fetch`; the catalogue is the shipped one, and the words are compared with its keys.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import type { StaffShellContext } from "@/staff/staff-shell";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { valuesFor } from "../support/css-declarations";
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
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  STAFF_KITCHENS_PAGE_SIZE,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  rowsOfPage,
  staffKitchenIdOf,
  wireDraft,
  wireList,
  wireRow,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: STAFF_ADDRESS,
  navigation: ["kitchens"],
};
const SETTLE_MS = 500;
const COUNT = '[data-testid="staff-kitchens-count"]';
const ROWS = '[data-testid="staff-kitchen-row"]';
const TABLE = '[data-testid="staff-kitchens-table"]';
const CARDS = '[data-testid="staff-kitchens-cards"]';
const FOOT = '[data-testid="staff-kitchens-foot"]';

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  assigned = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
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

function wordsOf(locale: TestLocale) {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchens",
  });
}

/** What the list route answers; every other address is the account area's session read. */
function listAnswers(
  answer: (request: RecordedRequest) => ServerAnswer | "hold" | "offline",
): void {
  server.script((request) => {
    if (request.url.pathname === "/api/staff/kitchens") {
      return answer(request);
    }
    return {
      body: {
        state: "signed-in",
        email: STAFF_ADDRESS,
        capabilities: ["design.read.any", "account.manage.own"],
      },
    };
  });
}

function listRequests(): RecordedRequest[] {
  return server.requests.filter(
    ({ url }) => url.pathname === "/api/staff/kitchens",
  );
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
    createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
    locale,
  );
  await settle();
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function searchInput(): HTMLInputElement {
  return requireIn<HTMLInputElement>(container(), 'input[type="search"]');
}

function statusSelect(): HTMLSelectElement {
  return requireIn<HTMLSelectElement>(container(), "select");
}

function chooseSegment(label: string): void {
  const radio = allIn<HTMLInputElement>(
    container(),
    'input[type="radio"]',
  ).find((candidate) => candidate.closest("label")?.textContent === label);
  if (radio === undefined) throw new Error(`no segment says "${label}"`);
  click(radio);
}

function pressEnterInSearch(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    searchInput().dispatchEvent(event);
  });
  return event;
}

async function search(text: string): Promise<void> {
  typeInto(searchInput(), text);
  await pass(SETTLE_MS);
}

function rowTexts(): string[] {
  return allIn(container(), ROWS).map((row) => row.textContent);
}

describe("while the first page is out (frame S2A)", () => {
  it("draws skeleton rows and a live region that says the kitchens are loading, with the filters in place", async () => {
    listAnswers(() => "hold");

    await mount();

    expect(
      requireIn(container(), '[data-testid="staff-kitchens-skeleton"]'),
    ).not.toBeNull();
    expect(requireIn(container(), '[role="status"]').textContent).toBe(
      roMessages.staffKitchens.loading,
    );
    expect(searchInput()).not.toBeNull();
    expect(allIn(container(), 'input[type="radio"]')).toHaveLength(3);
  });
});

describe("the rows on a phone (frame S2B, mobile)", () => {
  beforeEach(async () => {
    listAnswers(() => ({
      body: wireList(
        [
          wireRow(1),
          wireRow(2, { requestStatus: "contacted" }),
          wireRow(3, { isHidden: true, requestStatus: "closed" }),
          wireRow(4, { client: null, requestStatus: "offer-sent" }),
          wireRow(5, { requestStatus: "rejected-by-a-future-build" }),
          wireDraft(6),
        ],
        { total: 143 },
      ),
    }));
    await mount();
  });

  it("draws one card per kitchen and no table", () => {
    expect(allIn(container(), `${CARDS} ${ROWS}`)).toHaveLength(6);
    expect(container().querySelector(TABLE)).toBeNull();
  });

  it("tells the total as the sentence of the segment, and the order", () => {
    expect(requireIn(container(), COUNT).textContent).toBe(
      wordsOf("ro")("countSent", { count: 143 }),
    );
    expect(container().textContent).toContain(
      roMessages.staffKitchens.sortSent,
    );
  });

  it("says sent and draft as words", () => {
    const cards = allIn(container(), ROWS);

    expect(cards[0]?.textContent).toContain(roMessages.staffKitchens.badgeSent);
    expect(cards[5]?.textContent).toContain(
      roMessages.staffKitchens.badgeDraft,
    );
    expect(cards[5]?.textContent).not.toContain(
      roMessages.staffKitchens.badgeSent,
    );
  });

  it("says a hidden kitchen is hidden, as a word beside the sent one", () => {
    const hidden = allIn(container(), ROWS)[2];

    expect(hidden?.textContent).toContain(roMessages.staffKitchens.badgeHidden);
    expect(hidden?.textContent).toContain(roMessages.staffKitchens.badgeSent);
    expect(hidden?.textContent).toContain(
      roMessages.staffKitchens.statusClosed,
    );
  });

  it("says each status as its word, and a draft has none", () => {
    const cards = allIn(container(), ROWS);

    expect(cards[0]?.textContent).toContain(roMessages.staffKitchens.statusNew);
    expect(cards[1]?.textContent).toContain(
      roMessages.staffKitchens.statusContacted,
    );
    expect(cards[3]?.textContent).toContain(
      roMessages.staffKitchens.statusOfferSent,
    );
    for (const word of [
      roMessages.staffKitchens.statusNew,
      roMessages.staffKitchens.statusContacted,
      roMessages.staffKitchens.statusOfferSent,
      roMessages.staffKitchens.statusClosed,
      roMessages.staffKitchens.statusUnrecognised,
    ]) {
      expect(cards[5]?.textContent).not.toContain(word);
    }
  });

  it("tells a status this build does not name as its own neutral badge and never as a new request", () => {
    const card = allIn(container(), ROWS)[4];
    const badge = requireIn(card ?? container(), '[data-kind="status"]');

    expect(badge.textContent).toBe(roMessages.staffKitchens.statusUnrecognised);
    expect(badge.getAttribute("data-status")).toBe("unrecognised");
    expect(card?.textContent).not.toContain(roMessages.staffKitchens.statusNew);
  });

  it("says a kitchen with no account has none, instead of an address", () => {
    const card = allIn(container(), ROWS)[3];

    expect(card?.textContent).toContain(roMessages.staffKitchens.noAccount);
    expect(card?.textContent).not.toContain("client4@example.test");
  });

  it("shows the profile's address, name and phone as unconfirmed, and the sent day on the shop's clock", () => {
    const text = allIn(container(), ROWS)[0]?.textContent ?? "";

    expect(text).toContain("client1@example.test");
    expect(text).toContain("Client 1");
    expect(text).toContain("+37369000001");
    expect(text).toContain(roMessages.staffKitchens.phoneUnverified);
    expect(text).toContain(wordsOf("ro")("sentOn", { date: "17.10.2026" }));
  });

  it("tells a draft by the day it was changed, with no sent day", () => {
    const text = allIn(container(), ROWS)[5]?.textContent ?? "";
    const modified = new Intl.RelativeTimeFormat("ro", {
      numeric: "auto",
    }).format(-2, "day");

    expect(text).toContain(wordsOf("ro")("modifiedAgo", { when: modified }));
  });

  it("leads each card to the kitchen's page in the same language, by a link named for the whole kitchen", () => {
    const link = requireIn<HTMLAnchorElement>(
      allIn(container(), ROWS)[0] ?? container(),
      "a",
    );

    expect(link.getAttribute("href")).toBe(
      `/ro/staff/kitchens/${staffKitchenIdOf(1)}`,
    );
    expect(link.getAttribute("aria-label")).toBe(
      wordsOf("ro")("openNamed", { name: "Bucatarie 1" }),
    );
    expect(link.textContent).toBe(roMessages.staffKitchens.open);
  });

  it("draws the thumbnail as a decoration with no name", () => {
    const thumbnails = allIn(container(), `${ROWS} [aria-hidden="true"]`);

    expect(thumbnails.length).toBeGreaterThanOrEqual(6);
  });
});

describe("the rows on a desktop (frames DS2B to DS2B3)", () => {
  beforeEach(async () => {
    listAnswers(() => ({
      body: wireList([wireRow(1), wireDraft(2), wireRow(3, { client: null })], {
        total: 143,
      }),
    }));
    await mount({ width: "desktop" });
  });

  it("draws a table named for the list, with the nine columns of the frame, and no cards", () => {
    const columns = allIn(container(), `${TABLE} thead th`).map(
      (header) => header.textContent,
    );

    expect(container().querySelector(CARDS)).toBeNull();
    expect(requireIn(container(), TABLE).getAttribute("aria-label")).toBe(
      roMessages.staffKitchens.title,
    );
    expect(columns).toEqual([
      roMessages.staffKitchens.columnImage,
      roMessages.staffKitchens.columnKitchen,
      roMessages.staffKitchens.columnClient,
      roMessages.staffKitchens.columnPhone,
      roMessages.staffKitchens.columnState,
      roMessages.staffKitchens.statusLabel,
      roMessages.staffKitchens.columnSentAt,
      roMessages.staffKitchens.columnModified,
      roMessages.staffKitchens.columnAction,
    ]);
  });

  it("puts a dash in the status and the sent day of a draft, which has neither", () => {
    const cells = allIn(container(), `${TABLE} tbody tr:nth-child(2) td`).map(
      (cell) => cell.textContent,
    );

    expect(cells[4]).toBe(roMessages.staffKitchens.noValue);
    expect(cells[5]).toBe(roMessages.staffKitchens.noValue);
  });

  it("names the kitchen in the row's header cell", () => {
    const header = requireIn(
      container(),
      `${TABLE} tbody tr:nth-child(1) th[scope="row"]`,
    );

    expect(header.textContent).toBe("Bucatarie 1");
  });

  it("says a kitchen with no account has none, and has no phone to show", () => {
    const cells = allIn(container(), `${TABLE} tbody tr:nth-child(3) td`).map(
      (cell) => cell.textContent,
    );

    expect(cells[1]).toBe(roMessages.staffKitchens.noAccount);
    expect(cells[2]).toBe(roMessages.staffKitchens.noValue);
  });
});

describe("the dates and the status of a row", () => {
  it("tells the sent day on the shop's clock: a kitchen sent at half past midnight in Chisinau is sent that day, not the day before in UTC", async () => {
    listAnswers(() => ({
      body: wireList([wireRow(1, { sentAt: "2026-10-17T21:30:00.000Z" })], {
        total: 1,
      }),
    }));
    await mount();

    expect(requireIn(container(), ROWS).textContent).toContain(
      wordsOf("ro")("sentOn", { date: "18.10.2026" }),
    );
  });

  it.each([["desktop"], ["phone"]] as const)(
    "shows no status for a draft even when the server names one, on a %s",
    async (width) => {
      listAnswers(() => ({
        body: wireList([wireDraft(1, { requestStatus: "contacted" })], {
          total: 1,
        }),
      }));
      await mount({ width });

      expect(requireIn(container(), ROWS).textContent).not.toContain(
        roMessages.staffKitchens.statusContacted,
      );
    },
  );
});

describe("a long name and a hostile one", () => {
  const LONG_NAME = `Kitchen ${"with a very long name ".repeat(40)}`.trim();

  it("keeps the whole name as the text and as the link's name; only the stylesheet clips it", async () => {
    listAnswers(() => ({
      body: wireList([wireRow(1, { name: LONG_NAME })], { total: 1 }),
    }));
    await mount({ width: "desktop" });

    const header = requireIn(container(), `${TABLE} th[scope="row"]`);
    const link = requireIn(container(), `${ROWS} a`);

    expect(header.textContent).toBe(LONG_NAME);
    expect(link.getAttribute("aria-label")).toBe(
      wordsOf("ro")("openNamed", { name: LONG_NAME }),
    );
  });

  it.each([["desktop"], ["phone"]] as const)(
    "draws markup, a right-to-left override and an address that looks like a tag as text only, on a %s",
    async (width) => {
      const NAME = '<img src=x onerror="document.title=1">Cuisine';
      const EMAIL = "<b>a</b>@x.test";
      const NAME_WITH_OVERRIDE = "Ana \u202Eevil";
      listAnswers(() => ({
        body: wireList(
          [
            wireRow(1, {
              name: NAME,
              client: {
                email: EMAIL,
                name: NAME_WITH_OVERRIDE,
                phone: "<i>1</i>",
              },
            }),
          ],
          { total: 1 },
        ),
      }));
      await mount({ width });

      const row = requireIn(container(), ROWS);

      expect(row.querySelector("img, b, i, script")).toBeNull();
      expect(row.textContent).toContain(NAME);
      expect(row.textContent).toContain(EMAIL);
      expect(row.textContent).toContain(NAME_WITH_OVERRIDE);
      expect(row.textContent).toContain("<i>1</i>");
    },
  );

  it("draws a kitchen nobody named by the name its room generates, and says so plainly when it cannot", async () => {
    listAnswers(() => ({
      body: wireList(
        [wireRow(1, { name: null }), wireRow(2, { name: "  ", design: null })],
        { total: 2 },
      ),
    }));
    await mount();

    const [generated, plain] = rowTexts();

    expect(generated).not.toContain(roMessages.staffKitchens.unnamedKitchen);
    expect(generated?.length).toBeGreaterThan(0);
    expect(plain).toContain(roMessages.staffKitchens.unnamedKitchen);
  });
});

describe("a segment with nothing in it (frames S2C, S2C2)", () => {
  it.each([
    ["sent", roMessages.staffKitchens.segmentSent, "sent"],
    ["drafts", roMessages.staffKitchens.segmentDrafts, "drafts"],
    ["all", roMessages.staffKitchens.segmentAll, "all"],
  ] as const)(
    "tells %s as one sentence and no action",
    async (_name, label, key) => {
      listAnswers(() => ({ body: wireList([], { total: 0 }) }));
      await mount();
      if (key !== "sent") {
        chooseSegment(label);
        await settle();
      }

      const empty = requireIn(
        container(),
        '[data-testid="staff-kitchens-empty"]',
      );
      const words = {
        sent: [
          roMessages.staffKitchens.emptySentTitle,
          roMessages.staffKitchens.emptySentBody,
        ],
        drafts: [
          roMessages.staffKitchens.emptyDraftsTitle,
          roMessages.staffKitchens.emptyDraftsBody,
        ],
        all: [
          roMessages.staffKitchens.emptyAllTitle,
          roMessages.staffKitchens.emptyAllBody,
        ],
      }[key];

      expect(empty.textContent).toBe(words.join(""));
      expect(empty.querySelector("button, a")).toBeNull();
    },
  );
});

describe("a search or a status that matched nothing (frame S2D)", () => {
  it("names the search as text, keeps the box as typed, and drops the search with the one button", async () => {
    listAnswers((request) => ({
      body: wireList(request.url.searchParams.has("q") ? [] : [wireRow(1)], {
        total: request.url.searchParams.has("q") ? 0 : 1,
      }),
    }));
    await mount();
    await search("popa.vasile");

    const none = requireIn(
      container(),
      '[data-testid="staff-kitchens-no-results"]',
    );
    expect(none.textContent).toContain(
      wordsOf("ro")("noResultsTitle", { query: "popa.vasile" }),
    );
    expect(searchInput().value).toBe("popa.vasile");

    click(byWords(none, "button", roMessages.staffKitchens.searchClear));
    await settle();

    expect(searchInput().value).toBe("");
    expect(listRequests().at(-1)?.url.searchParams.has("q")).toBe(false);
    expect(allIn(container(), ROWS)).toHaveLength(1);
  });

  it("draws a search made of markup as text", async () => {
    listAnswers((request) => ({
      body: wireList(request.url.searchParams.has("q") ? [] : [wireRow(1)], {
        total: request.url.searchParams.has("q") ? 0 : 1,
      }),
    }));
    await mount();
    await search("<img src=x onerror=alert(1)>");

    const none = requireIn(
      container(),
      '[data-testid="staff-kitchens-no-results"]',
    );

    expect(none.querySelector("img")).toBeNull();
    expect(none.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("tells a status with nothing in it, and shows every status again with the one button", async () => {
    listAnswers((request) => ({
      body: wireList(
        request.url.searchParams.has("status") ? [] : [wireRow(1)],
        { total: request.url.searchParams.has("status") ? 0 : 1 },
      ),
    }));
    await mount();
    act(() => {
      statusSelect().value = "closed";
      statusSelect().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    const none = requireIn(
      container(),
      '[data-testid="staff-kitchens-no-results"]',
    );
    expect(none.textContent).toContain(
      roMessages.staffKitchens.noResultsStatusTitle,
    );

    click(byWords(none, "button", roMessages.staffKitchens.clearStatus));
    await settle();

    expect(statusSelect().value).toBe("");
    expect(listRequests().at(-1)?.url.searchParams.has("status")).toBe(false);
  });
});

describe("a page that cannot be had (frame S2E)", () => {
  it("tells a 503 in the account's own words, keeps the filters, and asks again only when the person presses the button", async () => {
    listAnswers(() => UNAVAILABLE_ANSWER);
    await mount();

    expect(requireIn(container(), '[role="alert"]').textContent).toContain(
      roMessages.accountForm.unavailableTitle,
    );
    expect(searchInput()).not.toBeNull();
    await pass(30 * 60 * 1000);
    expect(listRequests()).toHaveLength(1);

    click(byWords(container(), "button", roMessages.accountForm.retry));
    await settle();

    expect(listRequests()).toHaveLength(2);
  });

  it("tells a 429 as the account's rate-limit sentence with a countdown, and asks nothing when it ends", async () => {
    listAnswers(() => RATE_LIMITED_ANSWER(90));
    await mount();

    const notice = requireIn(container(), '[data-tone="warning"]');
    expect(notice.textContent).toContain(
      roMessages.accountForm.rateLimitedCountdown.split("<strong>")[0] ?? "",
    );

    await pass(95_000);

    expect(requireIn(container(), '[data-tone="info"]').textContent).toBe(
      roMessages.accountForm.rateLimitedReady,
    );
    expect(listRequests()).toHaveLength(1);
  });

  it("tells an answer with no connection as the account's offline notice", async () => {
    listAnswers(() => "offline");
    await mount();

    expect(requireIn(container(), '[role="alert"]').textContent).toContain(
      roMessages.accountForm.offlineTitle,
    );
  });
});

describe("the session (frame S2F)", () => {
  it("draws the session sheet over the page on a 401 (frame S2F), leaves nowhere and draws no list", async () => {
    listAnswers(() => UNAUTHENTICATED_ANSWER);

    await mount();

    expect(assigned).toEqual([]);
    expect(
      container().querySelector('[data-testid="staff-session-sheet"]'),
    ).not.toBeNull();
    expect(container().querySelector(ROWS)).toBeNull();
  });

  it("opens the login page of the page's own language from the sheet, in a new tab", async () => {
    listAnswers(() => UNAUTHENTICATED_ANSWER);

    await mount({ locale: "ru" });

    const link = requireIn(
      container(),
      '[data-testid="staff-session-sign-in"]',
    );
    expect(link.getAttribute("href")).toBe(
      "/ru/account/login?reason=session-expired",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("draws the forbidden screen inside the staff frame on a 403, never an expired session", async () => {
    listAnswers(() => FORBIDDEN_ANSWER);

    await mount();

    expect(container().textContent).toContain(
      roMessages.accountForbidden.title,
    );
    expect(container().textContent).not.toContain(
      roMessages.sessionExpiredSheet.title,
    );
    expect(assigned).toEqual([]);
    expect(
      container().querySelector('[data-testid="staff-role-chip"]'),
    ).not.toBeNull();
  });
});

describe("the filters", () => {
  beforeEach(async () => {
    listAnswers(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await mount();
    server.requests.length = 0;
  });

  it("offers the three segments with Trimise chosen, as a group named by its label", () => {
    const group = requireIn(container(), "fieldset");
    const radios = allIn<HTMLInputElement>(group, 'input[type="radio"]');

    expect(requireIn(group, "legend").textContent).toBe(
      roMessages.staffKitchens.filterSegment,
    );
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      roMessages.staffKitchens.segmentSent,
      roMessages.staffKitchens.segmentDrafts,
      roMessages.staffKitchens.segmentAll,
    ]);
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
  });

  it("labels the search box for the client's name or address, and keeps it out of any history", () => {
    const label = requireIn(container(), `label[for="${searchInput().id}"]`);
    const form = requireIn<HTMLFormElement>(container(), 'form[role="search"]');

    expect(label.textContent).toBe(roMessages.staffKitchens.searchLabel);
    expect(label.textContent).toContain("numele clientului");
    expect(searchInput().getAttribute("placeholder")).toBe(
      roMessages.staffKitchens.searchPlaceholder,
    );
    expect(searchInput().getAttribute("autocomplete")).toBe("off");
    expect(searchInput().hasAttribute("name")).toBe(false);
    expect(form.hasAttribute("action")).toBe(false);
    expect(form.hasAttribute("method")).toBe(false);
  });

  it("shows the clear button only while the box holds something, named for what it does", () => {
    expect(
      container().querySelector(
        `button[aria-label="${roMessages.staffKitchens.searchClear}"]`,
      ),
    ).toBeNull();

    typeInto(searchInput(), "ana");

    expect(
      byWords(container(), "button", roMessages.staffKitchens.searchClear),
    ).not.toBeNull();
  });

  it("asks 500 ms after the last keystroke and not before, from the box", async () => {
    typeInto(searchInput(), "ana");
    await pass(SETTLE_MS - 1);
    expect(listRequests()).toHaveLength(0);

    await pass(1);

    expect(listRequests()).toHaveLength(1);
    expect(listRequests()[0]?.url.searchParams.get("q")).toBe("ana");
  });

  it("asks at once on Enter, takes the key so the browser submits nothing, and then asks nothing more", async () => {
    typeInto(searchInput(), "ana");

    const event = pressEnterInSearch();
    await settle();
    await pass(SETTLE_MS * 2);

    expect(event.defaultPrevented).toBe(true);
    expect(listRequests()).toHaveLength(1);
  });

  it("takes a submit of the search form without leaving the page", async () => {
    typeInto(searchInput(), "ana");
    const submit = new Event("submit", { bubbles: true, cancelable: true });

    act(() => {
      requireIn(container(), "form").dispatchEvent(submit);
    });
    await settle();

    expect(submit.defaultPrevented).toBe(true);
    expect(listRequests()).toHaveLength(1);
  });

  it("does not ask on Enter during an input method's composition", async () => {
    typeInto(searchInput(), "ana");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      searchInput().dispatchEvent(event);
    });
    await settle();

    expect(listRequests()).toHaveLength(0);
  });

  it("names a search that is too long, beside the box, and sends nothing", async () => {
    typeInto(searchInput(), "a".repeat(101));
    await pass(SETTLE_MS);

    const problem = requireIn(container(), 'p[role="alert"]');

    expect(problem.textContent).toBe(
      wordsOf("ro")("searchTooLong", { max: 100 }),
    );
    expect(searchInput().getAttribute("aria-invalid")).toBe("true");
    expect(searchInput().getAttribute("aria-describedby")).toBe(problem.id);
    expect(listRequests()).toHaveLength(0);
  });

  it("lists the five choices of the status, the first being every status", () => {
    const options = allIn<HTMLOptionElement>(statusSelect(), "option");

    expect(options.map((option) => option.textContent)).toEqual([
      roMessages.staffKitchens.statusAll,
      roMessages.staffKitchens.statusNew,
      roMessages.staffKitchens.statusContacted,
      roMessages.staffKitchens.statusOfferSent,
      roMessages.staffKitchens.statusClosed,
    ]);
    expect(
      container().querySelector(`label[for="${statusSelect().id}"]`)
        ?.textContent,
    ).toBe(roMessages.staffKitchens.statusLabel);
  });

  it("is enabled under Trimise, without its hint", () => {
    expect(statusSelect().disabled).toBe(false);
    expect(container().textContent).not.toContain(
      roMessages.staffKitchens.statusOnlyForSent,
    );
  });

  it.each([
    [roMessages.staffKitchens.segmentDrafts],
    [roMessages.staffKitchens.segmentAll],
  ])(
    "disables the status under %s, and says why in words the select points to",
    async (label) => {
      chooseSegment(label);
      await settle();

      const hint = byWords(
        container(),
        "span",
        roMessages.staffKitchens.statusOnlyForSent,
      );
      expect(statusSelect().disabled).toBe(true);
      expect(statusSelect().getAttribute("aria-describedby")).toBe(hint.id);
    },
  );

  it("drops the status when the segment changes: the select shows every status and the request carries none", async () => {
    act(() => {
      statusSelect().value = "contacted";
      statusSelect().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(listRequests().at(-1)?.url.searchParams.get("status")).toBe(
      "contacted",
    );

    chooseSegment(roMessages.staffKitchens.segmentDrafts);
    await settle();
    chooseSegment(roMessages.staffKitchens.segmentSent);
    await settle();

    expect(statusSelect().value).toBe("");
    for (const request of listRequests().slice(-2)) {
      expect(request.url.searchParams.has("status")).toBe(false);
    }
  });
});

describe("the pages on a desktop (frame S2B)", () => {
  beforeEach(async () => {
    listAnswers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body: wireList(rowsOfPage(page, STAFF_KITCHENS_PAGE_SIZE), {
          total: 143,
          page,
        }),
      };
    });
    await mount({ width: "desktop" });
  });

  it("tells which kitchens are shown out of how many", () => {
    expect(requireIn(container(), FOOT).textContent).toContain(
      wordsOf("ro")("showing", { from: 1, to: 20, total: 143 }),
    );
  });

  it("numbers the pages, names each, marks the one shown and disables the way back from the first", () => {
    const nav = requireIn(
      container(),
      `nav[aria-label="${roMessages.staffKitchens.pagesLabel}"]`,
    );
    const buttons = allIn<HTMLButtonElement>(nav, "button");

    expect(buttons[0]?.getAttribute("aria-label")).toBe(
      roMessages.staffKitchens.previousPage,
    );
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons.at(-1)?.getAttribute("aria-label")).toBe(
      roMessages.staffKitchens.nextPage,
    );
    expect(buttons.at(-1)?.disabled).toBe(false);
    expect(
      allIn(nav, '[aria-current="page"]').map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([wordsOf("ro")("pageNumber", { page: 1 })]);
    expect(
      byWords(nav, "button", wordsOf("ro")("pageNumber", { page: 8 })),
    ).not.toBeNull();
  });

  it("replaces the rows with the page chosen, and moves focus to the count so the new place is read", async () => {
    const nav = requireIn(
      container(),
      `nav[aria-label="${roMessages.staffKitchens.pagesLabel}"]`,
    );

    click(byWords(nav, "button", wordsOf("ro")("pageNumber", { page: 3 })));
    await settle();

    expect(listRequests().at(-1)?.url.searchParams.get("page")).toBe("3");
    expect(allIn(container(), ROWS)).toHaveLength(STAFF_KITCHENS_PAGE_SIZE);
    expect(rowTexts()[0]).toContain("Bucatarie 41");
    expect(document.activeElement).toBe(requireIn(container(), COUNT));
    expect(requireIn(container(), FOOT).textContent).toContain(
      wordsOf("ro")("showing", { from: 41, to: 60, total: 143 }),
    );
  });

  it("does not carry the move of focus over to a later answer when the page chosen could not be had", async () => {
    const nav = requireIn(
      container(),
      `nav[aria-label="${roMessages.staffKitchens.pagesLabel}"]`,
    );
    listAnswers(() => UNAVAILABLE_ANSWER);
    click(byWords(nav, "button", wordsOf("ro")("pageNumber", { page: 3 })));
    await settle();
    listAnswers((request) => ({
      body: wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
        total: 143,
        page: Number(request.url.searchParams.get("page")),
      }),
    }));

    click(byWords(container(), "button", roMessages.accountForm.retry));
    await settle();

    expect(document.activeElement).not.toBe(requireIn(container(), COUNT));
  });

  it("goes to the next page by the arrow", async () => {
    click(byWords(container(), "button", roMessages.staffKitchens.nextPage));
    await settle();

    expect(listRequests().at(-1)?.url.searchParams.get("page")).toBe("2");
  });

  it("draws no 'load more' on a desktop", () => {
    expect(container().textContent).not.toContain(
      roMessages.staffKitchens.loadMore,
    );
  });
});

describe("the pages on a phone: load more", () => {
  beforeEach(async () => {
    listAnswers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body: wireList(rowsOfPage(page, page === 3 ? 5 : 20), {
          total: 45,
          page,
        }),
      };
    });
    await mount();
  });

  it("draws the button and no page numbers", () => {
    expect(
      byWords(container(), "button", roMessages.staffKitchens.loadMore),
    ).not.toBeNull();
    expect(container().querySelector("nav button")).toBeNull();
  });

  it("adds the next page below, and counts the kitchens shown out of the total", async () => {
    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();

    expect(allIn(container(), ROWS)).toHaveLength(40);
    expect(requireIn(container(), FOOT).textContent).toContain(
      wordsOf("ro")("showing", { from: 1, to: 40, total: 45 }),
    );
  });

  it("puts focus on the first kitchen the page added", async () => {
    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();

    expect(document.activeElement?.getAttribute("href")).toBe(
      `/ro/staff/kitchens/${staffKitchenIdOf(21)}`,
    );
  });

  it("takes the button away once the last page is in", async () => {
    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();
    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();

    expect(container().textContent).not.toContain(
      roMessages.staffKitchens.loadMore,
    );
    expect(allIn(container(), ROWS)).toHaveLength(45);
  });

  it("keeps the button reachable and busy while the page is out, and ignores a press then", async () => {
    listAnswers(() => "hold");
    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();
    const button = byWords(
      container(),
      "button",
      roMessages.staffKitchens.loadingMore,
    );

    click(button);
    await settle();

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(server.held).toHaveLength(1);
  });

  it("says why the page could not be had beside the button, keeping the rows", async () => {
    listAnswers(() => UNAVAILABLE_ANSWER);
    click(byWords(container(), "button", roMessages.staffKitchens.loadMore));
    await settle();

    expect(allIn(container(), ROWS)).toHaveLength(20);
    expect(requireIn(container(), '[role="alert"]').textContent).toContain(
      roMessages.accountForm.unavailableTitle,
    );
  });
});

describe("in Russian", () => {
  it("draws the Russian words, and the list's links lead to the Russian page", async () => {
    listAnswers(() => ({
      body: wireList([wireRow(1), wireDraft(2)], { total: 2 }),
    }));

    await mount({ locale: "ru" });

    expect(requireIn(container(), "h1").textContent).toBe(
      ruMessages.staffKitchens.title,
    );
    expect(container().textContent).toContain(
      ruMessages.staffKitchens.badgeSent,
    );
    expect(requireIn(container(), `${ROWS} a`).getAttribute("href")).toBe(
      `/ru/staff/kitchens/${staffKitchenIdOf(1)}`,
    );
  });
});

describe("the stylesheet source declares the targets a thumb must hit (reads the CSS text; no layout runs here)", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../../src/staff/staff-kitchens.module.css"),
    "utf8",
  );
  const TOUCH_TARGET = "var(--touch-target)";

  it.each(["searchClear", "pageButton", "pageGap", "open", "stateAction"])(
    "declares %s at least a touch target wide and tall",
    (name) => {
      const width = [
        ...valuesFor(css, name, "min-width"),
        ...valuesFor(css, name, "width"),
      ];
      const height = [
        ...valuesFor(css, name, "min-height"),
        ...valuesFor(css, name, "height"),
      ];

      expect(width).toContain(TOUCH_TARGET);
      expect(height).toContain(TOUCH_TARGET);
    },
  );

  it("declares a segment, the search box, the status and 'load more' at least 48 px tall", () => {
    expect(valuesFor(css, "segmentFace", "min-height")).toEqual(["48px"]);
    expect(valuesFor(css, "searchControl", "min-height")).toEqual(["48px"]);
    expect(valuesFor(css, "statusSelect", "min-height")).toEqual(["48px"]);
    expect(valuesFor(css, "moreButton", "min-height")).toEqual(["48px"]);
  });

  it("clips a name to two lines by the stylesheet alone", () => {
    expect(valuesFor(css, "clamped", "-webkit-line-clamp")).toEqual(["2"]);
  });
});
