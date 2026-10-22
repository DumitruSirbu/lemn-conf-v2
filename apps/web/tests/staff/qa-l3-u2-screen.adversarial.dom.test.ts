// @vitest-environment happy-dom
//
// The staff list as drawn, under the inputs a developer's examples do not reach: every combination of the badges a row can
// carry, strings no client should be able to store but that the screen must still draw as text, the order a keyboard walks the
// filters in, the window of page numbers and the "a to b of n" line at the edges, the width that changes under a mounted
// list, and a server render that must agree with its hydration. The server is the project's stand-in for `fetch`.
import fc from "fast-check";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import { StaffPagination } from "@/staff/staff-pagination";
import type { StaffKitchensListing } from "@/staff/use-staff-kitchens";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
} from "../support/render-with-intl";
import {
  RATE_LIMITED_ANSWER,
  STAFF_KITCHENS_PAGE_SIZE,
  rowsOfPage,
  staffKitchenIdOf,
  wireDraft,
  wireList,
  wireRow,
} from "../support/staff-kitchens-wire";
import {
  CARDS,
  FOOT,
  ROWS,
  SEARCH_SETTLE_MS,
  STAFF_ADDRESS,
  TABLE,
  inputOfSearch,
  radiosOf,
  setUpListHarness,
  type ListHarness,
  type Width,
} from "./qa-l3-u2-harness.adversarial";

const WORDS = roMessages.staffKitchens;

/** The line "a to b of n" with its digits written out, from the catalogue's own sentence. */
function showingLine(
  messages: typeof roMessages,
  digits: { from: number; to: number; total: number },
): string {
  return messages.staffKitchens.showing
    .replace("{from, number, ::group-off}", String(digits.from))
    .replace("{to, number, ::group-off}", String(digits.to))
    .replace("{total, number, ::group-off}", String(digits.total));
}

let harness: ListHarness;

beforeEach(() => {
  harness = setUpListHarness();
});

afterEach(() => {
  harness.tearDown();
});

function rowElements(): HTMLElement[] {
  return allIn(harness.container(), ROWS);
}

/** The pages of `total` kitchens as the server cuts them, the last one short. */
function answerWithPages(total: number, pageSize = STAFF_KITCHENS_PAGE_SIZE) {
  harness.answers((request) => {
    const page = Number(request.url.searchParams.get("page"));
    const rowsOnPage = Math.max(
      0,
      Math.min(pageSize, total - (page - 1) * pageSize),
    );
    return {
      body: wireList(rowsOfPage(page, rowsOnPage), { total, page, pageSize }),
    };
  });
}

describe("every badge a row can carry", () => {
  const STATUS_WORDS = [
    ["new", WORDS.statusNew],
    ["contacted", WORDS.statusContacted],
    ["offer-sent", WORDS.statusOfferSent],
    ["closed", WORDS.statusClosed],
    ["a-word-from-a-later-build", WORDS.statusUnrecognised],
    [null, undefined],
  ] as const;
  const COMBINATIONS = [true, false].flatMap((isSent) =>
    [true, false].flatMap((isHidden) =>
      STATUS_WORDS.map(([status, word]) => ({
        isSent,
        isHidden,
        status,
        word,
      })),
    ),
  );

  it.each([["desktop"], ["phone"]] as const)(
    "is told in words, and only the words the row's facts allow, for each of %s's rows",
    async (width: Width) => {
      harness.answers(() => ({
        body: wireList(
          COMBINATIONS.map(({ isSent, isHidden, status }, index) =>
            wireRow(index + 1, {
              isSent,
              isHidden,
              sentAt: isSent ? "2026-10-17T09:30:00.000Z" : null,
              requestStatus: status,
            }),
          ),
          { total: COMBINATIONS.length },
        ),
      }));
      await harness.mount({ width });

      const rows = rowElements();
      expect(rows).toHaveLength(COMBINATIONS.length);
      COMBINATIONS.forEach(({ isSent, isHidden, status, word }, index) => {
        const row = rows[index];
        if (row === undefined) throw new Error("a row is missing");
        const label = JSON.stringify({ isSent, isHidden, status });
        const kinds = (kind: string) =>
          allIn(row, `[data-kind="${kind}"]`).map((badge) => badge.textContent);

        expect(kinds("sent"), label).toEqual(isSent ? [WORDS.badgeSent] : []);
        expect(kinds("draft"), label).toEqual(isSent ? [] : [WORDS.badgeDraft]);
        expect(kinds("hidden"), label).toEqual(
          isHidden ? [WORDS.badgeHidden] : [],
        );
        const statusBadges = allIn(row, '[data-kind="status"]');
        const isStatusShown = isSent && word !== undefined;
        expect(
          statusBadges.map((badge) => badge.textContent),
          label,
        ).toEqual(isStatusShown ? [word] : []);
        if (isStatusShown && status !== null) {
          expect(statusBadges[0]?.getAttribute("data-status"), label).toBe(
            status === "a-word-from-a-later-build" ? "unrecognised" : status,
          );
        }
        if (status !== "new" || !isSent) {
          expect(row.textContent, label).not.toContain(WORDS.statusNew);
        }
      });
    },
  );
});

describe("text no client should be able to store", () => {
  const TEN_THOUSAND = "Ж".repeat(10_000);
  const PAYLOADS = [
    ["a script element", "<script>alert(document.cookie)</script>"],
    ["an image with a handler", '"><img src=x onerror=alert(1)>'],
    ["an entity", "&lt;b&gt;&amp;#x3C;"],
    ["message-format syntax", "{name} {0, plural, other {#}} '{' }"],
    ["a right-to-left override with no end", "Ana \u202Eevil.exe"],
    ["isolates and marks", "\u2066a\u2069\u200F\u061C b"],
    ["a line break, a tab and a NUL", "one\ntwo\tthree\u0000four"],
    [
      "a family emoji joined by zero-width joiners",
      "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}",
    ],
    [
      "a Romanian word longer than any line",
      "Supercalifragilisticexpialidociosinternationalizarii".repeat(8),
    ],
    [
      "a Russian word longer than any line",
      "Достопримечательностьнеобыкновеннаяпревосходительство".repeat(8),
    ],
    ["ten thousand letters", TEN_THOUSAND],
  ] as const;

  async function mountWith(
    payload: string,
    width: Width,
  ): Promise<HTMLElement> {
    harness.answers(() => ({
      body: wireList(
        [
          wireRow(1, {
            name: payload,
            client: { email: payload, name: payload, phone: payload },
          }),
        ],
        { total: 1 },
      ),
    }));
    await harness.mount({ width });
    return requireIn(harness.container(), ROWS);
  }

  async function benignStructure(width: Width): Promise<number> {
    const row = await mountWith("plain", width);
    const count = row.querySelectorAll("*").length;
    harness.unmount();
    return count;
  }

  it.each(
    PAYLOADS.flatMap(([label, payload]) =>
      (["desktop", "phone"] as const).map(
        (width) => [label, payload, width] as const,
      ),
    ),
  )(
    "draws %s as text only, with the whole of it in the name and the link, on a %s",
    async (_label, payload, width) => {
      const structure = await benignStructure(width);
      harness.server.requests.length = 0;

      const row = await mountWith(payload, width);

      expect(row.querySelectorAll("*").length).toBe(structure);
      expect(
        row.querySelector("script, img, iframe, svg, style, form"),
      ).toBeNull();
      expect(row.textContent).toContain(payload);
      const links = allIn<HTMLAnchorElement>(row, "a");
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        `/ro/staff/kitchens/${staffKitchenIdOf(1)}`,
      ]);
      expect(links[0]?.getAttribute("aria-label")).toBe(`Deschide ${payload}`);
      expect(requireIn(row, "[title]").getAttribute("title")).toBe(payload);
    },
  );

  it("draws a search made of an override and markup as text in the empty result, and keeps the box as it was typed", async () => {
    harness.answers((request) => ({
      body: wireList(request.url.searchParams.has("q") ? [] : [wireRow(1)], {
        total: request.url.searchParams.has("q") ? 0 : 1,
      }),
    }));
    await harness.mount();
    const text = '<b onclick="x()">\u202Eana</b>';

    typeInto(inputOfSearch(harness.container()), text);
    await harness.pass(SEARCH_SETTLE_MS);

    const none = requireIn(
      harness.container(),
      '[data-testid="staff-kitchens-no-results"]',
    );
    expect(none.querySelector("b")).toBeNull();
    expect(none.textContent).toContain(text);
    expect(inputOfSearch(harness.container()).value).toBe(text);
  });
});

describe("dates a clock or a data error could make strange", () => {
  const STRANGE_INSTANTS = [
    [
      "in the future, after the moment the page was read",
      "2026-10-23T12:00:00.000Z",
    ],
    ["at the start of the epoch", "1970-01-01T00:00:00.000Z"],
    ["before the common era", "-000001-01-01T00:00:00.000Z"],
    ["at the far end of the calendar", "9999-12-31T23:59:59.999Z"],
  ] as const;

  it.each(
    STRANGE_INSTANTS.flatMap(([label, instant]) =>
      (["desktop", "phone"] as const).map(
        (width) => [label, instant, width] as const,
      ),
    ),
  )(
    "tells a kitchen changed and sent %s in words that hold no 'NaN', 'undefined' or 'Invalid', on a %s",
    async (_label, instant, width) => {
      harness.answers(() => ({
        body: wireList(
          [
            wireRow(1, { updatedAt: instant, sentAt: instant }),
            wireDraft(2, { updatedAt: instant }),
          ],
          { total: 2 },
        ),
      }));
      await harness.mount({ width });

      const rows = rowElements();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.textContent).not.toMatch(/NaN|undefined|Invalid|null/);
      }
    },
  );
});

describe("a client and a phone that are missing", () => {
  it.each([["desktop"], ["phone"]] as const)(
    "tells a client with only an address by the address alone, and a missing phone in words, on a %s",
    async (width: Width) => {
      harness.answers(() => ({
        body: wireList(
          [
            wireRow(1, {
              client: { email: "solo@x.test", name: null, phone: null },
            }),
            wireRow(2, { client: null }),
          ],
          { total: 2 },
        ),
      }));
      await harness.mount({ width });

      const [withAddress, withoutAccount] = rowElements();
      expect(withAddress?.textContent).toContain("solo@x.test");
      expect(withAddress?.textContent).not.toContain("null");
      expect(withAddress?.textContent).toContain(
        width === "phone" ? WORDS.noPhone : WORDS.noValue,
      );
      expect(withoutAccount?.textContent).toContain(WORDS.noAccount);
      expect(withoutAccount?.textContent).not.toContain("@");
      expect(withAddress?.textContent).not.toContain(WORDS.noAccount);
    },
  );
});

describe("the filters, walked by a keyboard", () => {
  beforeEach(async () => {
    answerWithPages(60);
    await harness.mount({ width: "desktop" });
  });

  it("puts the three segments in one group and one place of the tab order, before the search, the status and the rows", () => {
    const container = harness.container();
    const radios = radiosOf(container);
    const search = inputOfSearch(container);
    const select = requireIn<HTMLSelectElement>(container, "select");
    const firstLink = requireIn(container, `${ROWS} a`);

    expect(radios).toHaveLength(3);
    expect(new Set(radios.map(({ name }) => name)).size).toBe(1);
    expect(radios[0]?.name).not.toBe("");
    expect(radios.filter(({ checked }) => checked)).toHaveLength(1);
    const inOrder = [radios[0], radios[2], search, select, firstLink];
    for (let at = 1; at < inOrder.length; at += 1) {
      const previous = inOrder[at - 1];
      const next = inOrder[at];
      if (previous === undefined || next === undefined) {
        throw new Error("an element is missing");
      }
      expect(
        previous.compareDocumentPosition(next) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `element ${String(at)} follows element ${String(at - 1)}`,
      ).not.toBe(0);
    }
    expect(
      allIn(container, "[tabindex]").every(
        (element) => Number(element.getAttribute("tabindex")) <= 0,
      ),
    ).toBe(true);
  });

  it("puts the clear button after the search box it clears, and makes it a button that submits nothing", () => {
    const search = inputOfSearch(harness.container());
    typeInto(search, "ana");

    const clear = byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      WORDS.searchClear,
    );

    expect(clear.type).toBe("button");
    expect(
      search.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("asks for nothing when a segment's value was changed behind the screen's back", async () => {
    const [, drafts] = radiosOf(harness.container());
    if (drafts === undefined) throw new Error("no second segment");
    harness.server.requests.length = 0;

    drafts.value = "everything-and-more";
    click(drafts);
    await harness.settle();

    expect(harness.listRequests()).toHaveLength(0);
  });

  it("names a search of 101 characters outside the basic plane beside the box, and withdraws the name at 100", async () => {
    const search = inputOfSearch(harness.container());
    harness.server.requests.length = 0;

    typeInto(search, "\u{1F600}".repeat(101));
    await harness.pass(SEARCH_SETTLE_MS);
    expect(requireIn(harness.container(), '[role="alert"]').textContent).toBe(
      roMessages.staffKitchens.searchTooLong.replace(
        "{max, number, ::group-off}",
        "100",
      ),
    );
    expect(harness.listRequests()).toHaveLength(0);

    typeInto(search, "\u{1F600}".repeat(100));
    await harness.pass(SEARCH_SETTLE_MS);
    expect(harness.container().querySelector('p[role="alert"]')).toBeNull();
    expect(search.getAttribute("aria-invalid")).toBeNull();
    expect(harness.listRequests()).toHaveLength(1);
  });

  it("keeps the message for a search that cannot be asked for when a segment is chosen, and asks without it", async () => {
    const search = inputOfSearch(harness.container());
    typeInto(search, "a".repeat(101));
    await harness.pass(SEARCH_SETTLE_MS);
    harness.server.requests.length = 0;

    click(radiosOf(harness.container())[1] ?? search);
    await harness.settle();

    expect(harness.listRequests()).toHaveLength(1);
    expect(harness.listRequests()[0]?.url.searchParams.has("q")).toBe(false);
    expect(harness.container().querySelector('p[role="alert"]')).not.toBeNull();
    expect(search.value).toBe("a".repeat(101));
  });
});

describe("the window of page numbers on a desktop", () => {
  function nav(): HTMLElement {
    return requireIn(
      harness.container(),
      `nav[aria-label="${WORDS.pagesLabel}"]`,
    );
  }

  function numbersDrawn(): number[] {
    return allIn(nav(), "button")
      .map((button) => Number(button.textContent))
      .filter((page) => page > 0);
  }

  it("draws no numbers for one page, and says which kitchens are shown", async () => {
    answerWithPages(20);
    await harness.mount({ width: "desktop" });

    expect(harness.container().querySelector(`${FOOT} nav`)).toBeNull();
    expect(requireIn(harness.container(), FOOT).textContent).toContain(
      showingLine(roMessages, { from: 1, to: 20, total: 20 }),
    );
  });

  it("draws both numbers for two pages, and the last page's one kitchen as 21 to 21", async () => {
    answerWithPages(21);
    await harness.mount({ width: "desktop" });

    expect(numbersDrawn()).toEqual([1, 2]);
    click(byWords(nav(), "button", "Pagina 2"));
    await harness.settle();

    expect(requireIn(harness.container(), FOOT).textContent).toContain(
      showingLine(roMessages, { from: 21, to: 21, total: 21 }),
    );
    expect(
      allIn(nav(), '[aria-current="page"]').map((button) => button.textContent),
    ).toEqual(["2"]);
    expect(
      byWords<HTMLButtonElement>(nav(), "button", WORDS.nextPage).disabled,
    ).toBe(true);
    expect(
      byWords<HTMLButtonElement>(nav(), "button", WORDS.previousPage).disabled,
    ).toBe(false);
  });

  it("draws all eight numbers for eight pages and leaves page 8 out of nine pages until the person is near it", async () => {
    answerWithPages(8 * 20);
    await harness.mount({ width: "desktop" });
    expect(numbersDrawn()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    harness.unmount();

    answerWithPages(9 * 20);
    await harness.mount({ width: "desktop" });
    expect(numbersDrawn()).toEqual([1, 2, 9]);

    click(byWords(nav(), "button", "Pagina 9"));
    await harness.settle();
    expect(numbersDrawn()).toEqual([1, 8, 9]);
  });

  it("does nothing when the number of the page shown is pressed", async () => {
    answerWithPages(60);
    await harness.mount({ width: "desktop" });
    harness.server.requests.length = 0;

    click(byWords(nav(), "button", "Pagina 1"));
    await harness.settle();

    expect(harness.listRequests()).toHaveLength(0);
  });

  it("writes the numbers of a long list without a separator, in both languages", async () => {
    answerWithPages(1204);
    await harness.mount({ width: "desktop" });
    click(byWords(nav(), "button", "Pagina 61"));
    await harness.settle();
    expect(requireIn(harness.container(), FOOT).textContent).toContain(
      showingLine(roMessages, { from: 1201, to: 1204, total: 1204 }),
    );
    harness.unmount();

    await harness.mount({ width: "desktop", locale: "ru" });
    const button = requireIn(
      harness.container(),
      `nav[aria-label="${ruMessages.staffKitchens.pagesLabel}"] button[aria-label="Страница 61"]`,
    );
    click(button);
    await harness.settle();
    expect(requireIn(harness.container(), FOOT).textContent).toContain(
      showingLine(ruMessages as typeof roMessages, {
        from: 1201,
        to: 1204,
        total: 1204,
      }),
    );
  });

  it("counts from the page size the server states, not from twenty", async () => {
    answerWithPages(25, 10);
    await harness.mount({ width: "desktop" });
    expect(numbersDrawn()).toEqual([1, 2, 3]);

    click(byWords(nav(), "button", "Pagina 2"));
    await harness.settle();

    expect(requireIn(harness.container(), FOOT).textContent).toContain(
      showingLine(roMessages, { from: 11, to: 20, total: 25 }),
    );
  });
});

describe("the line 'a to b of n', for every cut of a list", () => {
  function listingOf(
    total: number,
    pageSize: number,
    page: number,
  ): StaffKitchensListing {
    const rows = Math.min(pageSize, total - (page - 1) * pageSize);
    return {
      search: null,
      segment: "sent",
      status: null,
      total,
      pageSize,
      firstPage: page,
      lastPage: page,
      rows: Array.from({ length: rows }, () => ({})) as never,
      readAtMs: 0,
      focusRequest: undefined,
    };
  }

  it("draws the first, the last, the current page and its neighbours among 120, and marks only the current one", () => {
    const mounted = mountInCatalogue(
      createElement(StaffPagination, {
        listing: listingOf(2400, 20, 60),
        more: { kind: "idle" },
        isDesktop: true,
        onGoToPage: () => undefined,
        onLoadMore: () => undefined,
      }),
    );

    const numbers = allIn(mounted.container, "button")
      .map((button) => button.textContent)
      .filter((text) => text !== "");
    expect(numbers).toEqual(["1", "59", "60", "61", "120"]);
    expect(
      allIn(mounted.container, '[aria-current="page"]').map(
        (button) => button.textContent,
      ),
    ).toEqual(["60"]);
    expect(allIn(mounted.container, '[aria-hidden="true"]')).toHaveLength(2);
    mounted.unmount();
  });

  it("labels a page number of four digits without a separator", () => {
    const mounted = mountInCatalogue(
      createElement(StaffPagination, {
        listing: listingOf(20_000, 20, 1000),
        more: { kind: "idle" },
        isDesktop: true,
        onGoToPage: () => undefined,
        onLoadMore: () => undefined,
      }),
    );

    expect(
      allIn(mounted.container, "button").map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toContain("Pagina 1000");
    mounted.unmount();
  });

  it("states the first and last kitchen of every page of every list, never past the total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 100 }),
        fc.nat(),
        (total, pageSize, pick) => {
          const pageCount = Math.ceil(total / pageSize);
          const page = (pick % pageCount) + 1;
          const mounted = mountInCatalogue(
            createElement(StaffPagination, {
              listing: listingOf(total, pageSize, page),
              more: { kind: "idle" },
              isDesktop: true,
              onGoToPage: () => undefined,
              onLoadMore: () => undefined,
            }),
          );
          try {
            const from = (page - 1) * pageSize + 1;
            const to = Math.min(page * pageSize, total);
            expect(
              requireIn(mounted.container, "p").textContent,
              `${String(total)} in pages of ${String(pageSize)}, page ${String(page)}`,
            ).toBe(showingLine(roMessages, { from, to, total }));
            if (pageCount > 1) {
              expect(
                allIn(mounted.container, '[aria-current="page"]').map(
                  (button) => button.textContent,
                ),
              ).toEqual([String(page)]);
            }
          } finally {
            mounted.unmount();
          }
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe("a width that changes under a mounted list", () => {
  beforeEach(async () => {
    answerWithPages(45);
    await harness.mount({ width: "phone" });
  });

  it("swaps the cards for the table and the button for the numbers, and back, with the same kitchens", () => {
    const idsOf = () =>
      rowElements().map((row) => requireIn(row, "a").getAttribute("href"));
    const phoneIds = idsOf();
    expect(harness.container().querySelector(CARDS)).not.toBeNull();

    harness.viewport.resizeTo("desktop");
    expect(harness.container().querySelector(TABLE)).not.toBeNull();
    expect(harness.container().querySelector(CARDS)).toBeNull();
    expect(
      harness.container().querySelector(`${FOOT} nav button`),
    ).not.toBeNull();
    expect(idsOf()).toEqual(phoneIds);

    harness.viewport.resizeTo("phone");
    expect(harness.container().querySelector(CARDS)).not.toBeNull();
    expect(harness.container().querySelector(`${FOOT} nav`)).toBeNull();
    expect(idsOf()).toEqual(phoneIds);
  });

  it("listens to the width while the list is shown and stops when the screen goes away", () => {
    expect(harness.viewport.liveListeners()).toBeGreaterThan(0);

    harness.unmount();

    expect(harness.viewport.liveListeners()).toBe(0);
  });
});

describe("a browser with no way to ask the width", () => {
  it("draws the phone's cards and throws nothing", async () => {
    answerWithPages(3);
    vi.stubGlobal("matchMedia", undefined);

    await harness.mount();

    expect(harness.container().querySelector(CARDS)).not.toBeNull();
    expect(harness.container().querySelector(TABLE)).toBeNull();
  });
});

describe("the server's render and its hydration", () => {
  function screenElement() {
    return createElement(NextIntlClientProvider, {
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(StaffKitchensScreen, {
        locale: "ro",
        context: {
          role: "operator",
          email: STAFF_ADDRESS,
          navigation: ["kitchens"],
        },
      }),
    });
  }

  it("holds the skeleton and neither the table, the cards nor a page control, whatever width the browser has", () => {
    harness.viewport.resizeTo("desktop");

    const html = renderToString(screenElement());

    expect(html).toContain('data-testid="staff-kitchens-skeleton"');
    expect(html).not.toContain('data-testid="staff-kitchens-table"');
    expect(html).not.toContain('data-testid="staff-kitchens-cards"');
    expect(html).not.toContain('data-testid="staff-kitchens-foot"');
  });

  it("hydrates on a desktop with no complaint, and then draws the table", async () => {
    harness.viewport.resizeTo("desktop");
    answerWithPages(45);
    const complaints = vi.spyOn(console, "error");
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = renderToString(screenElement());

    act(() => {
      hydrateRoot(host, screenElement());
    });
    await harness.settle();

    expect(complaints).not.toHaveBeenCalled();
    expect(host.querySelector(TABLE)).not.toBeNull();
    expect(host.querySelector(CARDS)).toBeNull();
  });
});

describe("what the person typed, at the screen", () => {
  it("reaches no storage, cookie, beacon, history, address or title, on the way to an answer or to a failure", async () => {
    const stored = [
      vi.spyOn(window.localStorage, "setItem"),
      vi.spyOn(window.sessionStorage, "setItem"),
      vi.spyOn(window.history, "pushState"),
      vi.spyOn(window.history, "replaceState"),
    ];
    const cookieWrites = vi.fn();
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: cookieWrites,
    });
    const logged = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: beacon,
    });
    const secret = "ana.popescu@mail.md";
    harness.answers((request) =>
      request.url.searchParams.has("q")
        ? "offline"
        : { body: wireList([wireRow(1)]) },
    );
    await harness.mount();
    const titleBefore = document.title;

    typeInto(inputOfSearch(harness.container()), secret);
    await harness.pass(SEARCH_SETTLE_MS);
    harness.answers(() => RATE_LIMITED_ANSWER(60));
    click(byWords(harness.container(), "button", roMessages.accountForm.retry));
    await harness.pass(120_000);

    for (const spy of [...stored, ...logged, beacon, cookieWrites]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(document.title).toBe(titleBefore);
    const mentioning = harness.server.requests.filter(({ url }) =>
      url.href.includes("ana"),
    );
    expect(mentioning.length).toBeGreaterThan(0);
    for (const { url } of mentioning) {
      expect(url.pathname).toBe("/api/staff/kitchens");
      expect(url.searchParams.get("q")).toBe(secret);
    }
    for (const request of harness.server.requests) {
      expect(request.init.body).toBeUndefined();
      expect(JSON.stringify(request.init.headers ?? {})).not.toContain("ana");
    }
  });
});
