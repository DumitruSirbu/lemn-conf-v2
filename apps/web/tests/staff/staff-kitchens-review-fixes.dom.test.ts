// @vitest-environment happy-dom
//
// What the reviews of the staff list asked for: a table that fits the room it is given, a load-more that waits out a limit,
// ids the list may name that are not design ids, a page that cannot be shown, and a page that reloads when the browser
// restores it from its cache.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { staffKitchenListFrom } from "@/staff/staff-kitchens-wire-reading";

import roMessages from "../../src/messages/ro.json";
import { allIn, byWords, click, requireIn } from "../support/render-with-intl";
import {
  RATE_LIMITED_ANSWER,
  STAFF_KITCHENS_PAGE_SIZE,
  rowsOfPage,
  staffKitchenIdOf,
  wireList,
  wireRow,
} from "../support/staff-kitchens-wire";
import {
  ROWS,
  setUpListHarness,
  type ListHarness,
} from "./qa-l3-u2-harness.adversarial";

let harness: ListHarness;

beforeEach(() => {
  harness = setUpListHarness();
});

afterEach(() => {
  harness.tearDown();
});

describe("the table's columns (reads the CSS text; no layout runs here)", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../../src/staff/staff-kitchens.module.css"),
    "utf8",
  );

  function widthOfColumn(position: number): string {
    const rule = new RegExp(
      `\\.table thead th:nth-child\\(${String(position)}\\) \\{\\s*width: ([^;]+);`,
    ).exec(css);
    if (rule?.[1] === undefined)
      throw new Error(`no width for column ${String(position)}`);
    return rule[1];
  }

  const FIXED_COLUMNS = [1, 7, 8, 9];
  const FLUID_COLUMNS = [2, 3, 4, 5, 6];
  const FRAME_SHARES = [1.5, 1.5, 1, 1.1, 0.95];

  it("fixes the image, sent, changed and action columns at the frame's 88, 104, 128 and 124 px", () => {
    expect(FIXED_COLUMNS.map(widthOfColumn)).toEqual([
      "88px",
      "104px",
      "128px",
      "124px",
    ]);
  });

  it("gives the five fluid columns the frame's shares of exactly what the fixed columns leave, so together they fill the table and no more", () => {
    const fixedPx = FIXED_COLUMNS.map(widthOfColumn)
      .map((width) => Number.parseFloat(width))
      .reduce((total, width) => total + width, 0);
    const widths = FLUID_COLUMNS.map(widthOfColumn).map((width) => {
      const parts = /^calc\(\(100% - (\d+)px\) \* ([\d.]+) \/ ([\d.]+)\)$/.exec(
        width,
      );
      if (parts === null)
        throw new Error(`not a share of the remainder: ${width}`);
      return {
        left: Number(parts[1]),
        share: Number(parts[2]),
        of: Number(parts[3]),
      };
    });

    expect(fixedPx).toBe(444);
    expect(widths.map(({ left }) => left)).toEqual(widths.map(() => fixedPx));
    expect(widths.map(({ share }) => share)).toEqual(FRAME_SHARES);
    const sumOfShares = FRAME_SHARES.reduce((total, share) => total + share, 0);
    expect(widths.map(({ of }) => of)).toEqual(widths.map(() => sumOfShares));
  });

  it("keeps the table inside its container: it scrolls there when the room is narrower than the columns need", () => {
    expect(css).toMatch(/\.tableScroll \{[^}]*overflow-x: auto/);
    expect(css).toMatch(/\.tableScroll \{[^}]*max-width: 100%/);
    expect(css).toMatch(/\.table \{[^}]*min-width: 1000px/);
  });

  it("draws the picture to fit the image column's room instead of past it", () => {
    expect(css).toMatch(/\.table \.thumb \{[^}]*width: 100%/);
  });
});

describe("the table on a desktop", () => {
  it("is in a labelled region the keyboard can scroll", async () => {
    harness.answers(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await harness.mount({ width: "desktop" });

    const region = requireIn(harness.container(), '[role="region"]');

    expect(region.getAttribute("aria-label")).toBe(
      roMessages.staffKitchens.title,
    );
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.querySelector("table")).not.toBeNull();
  });

  it("leaves the picture cell out of what a screen reader reads", async () => {
    harness.answers(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await harness.mount({ width: "desktop" });

    const first = requireIn(harness.container(), `${ROWS} td`);

    expect(first.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("'load more' while a limit counts down", () => {
  function answerPages(): void {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return page >= 2
        ? RATE_LIMITED_ANSWER(90)
        : {
            body: wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
              total: 45,
              page,
            }),
          };
    });
  }

  function loadMoreButton(): HTMLButtonElement {
    return byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      roMessages.staffKitchens.loadMore,
    );
  }

  it("is off while the wait counts down, reachable, and sends nothing when pressed", async () => {
    answerPages();
    await harness.mount();
    click(loadMoreButton());
    await harness.settle();
    const requestsBefore = harness.listRequests().length;

    const button = loadMoreButton();
    click(button);
    await harness.settle();

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(harness.listRequests()).toHaveLength(requestsBefore);
  });

  it("wakes when the wait ends, and asks nothing until it is pressed", async () => {
    answerPages();
    await harness.mount();
    click(loadMoreButton());
    await harness.settle();
    const requestsBefore = harness.listRequests().length;

    await harness.pass(91_000);

    expect(loadMoreButton().hasAttribute("aria-disabled")).toBe(false);
    expect(harness.listRequests()).toHaveLength(requestsBefore);
    click(loadMoreButton());
    await harness.settle();
    expect(harness.listRequests()).toHaveLength(requestsBefore + 1);
  });
});

describe("ids the list may name", () => {
  const LONGEST_ID = "a".repeat(64);

  it.each([
    ["one character", "x"],
    ["a short id", "k123"],
    ["the longest the server lists", LONGEST_ID],
    ["every character an id may hold", "aZ09_-"],
  ])("reads a row whose id is %s", (_label, id) => {
    const list = staffKitchenListFrom(
      wireList([wireRow(1, { id })], { total: 1 }),
    );

    expect(list?.kitchens.map((row) => row.id)).toEqual([id]);
  });

  it.each([
    ["empty", ""],
    ["one character too long", "a".repeat(65)],
    ["a slash", "a/b"],
    ["a dot", "a.b"],
    ["a quote", 'a"b'],
    ["a space", "a b"],
    ["markup", '"><img src=x onerror=alert(1)>'],
    ["a selector", "a],a[href"],
    ["a line break", "a\nb"],
    ["a right-to-left override", "a‮b"],
  ])("refuses the whole page when a row's id holds %s", (_label, id) => {
    expect(
      staffKitchenListFrom(
        wireList([wireRow(1), wireRow(2, { id })], { total: 2 }),
      ),
    ).toBeUndefined();
  });

  it("draws a row whose id is not a design id with its content and without a link, beside a row that has one", async () => {
    harness.answers(() => ({
      body: wireList(
        [wireRow(1), wireRow(2, { id: "short-id", name: "No link kitchen" })],
        { total: 2 },
      ),
    }));
    await harness.mount();

    const [openable, unopenable] = allIn(harness.container(), ROWS);

    expect(openable?.querySelector("a")?.getAttribute("href")).toBe(
      `/ro/staff/kitchens/${staffKitchenIdOf(1)}`,
    );
    expect(unopenable?.textContent).toContain("No link kitchen");
    expect(unopenable?.textContent).toContain("client2@example.test");
    expect(unopenable?.querySelector("a")).toBeNull();
  });

  it("does the same in the table", async () => {
    harness.answers(() => ({
      body: wireList(
        [wireRow(2, { id: "short-id", name: "No link kitchen" })],
        {
          total: 1,
        },
      ),
    }));
    await harness.mount({ width: "desktop" });

    const row = requireIn(harness.container(), ROWS);

    expect(row.textContent).toContain("No link kitchen");
    expect(row.querySelector("a")).toBeNull();
  });

  it("tells a page holding a hostile id as a request that failed, drawing none of it", async () => {
    harness.answers(() => ({
      body: wireList(
        [wireRow(1, { id: '"><img src=x onerror=alert(1)>', name: "Hostile" })],
        { total: 1 },
      ),
    }));
    await harness.mount();

    expect(harness.container().textContent).not.toContain("Hostile");
    expect(harness.container().querySelector("img")).toBeNull();
    expect(
      requireIn(harness.container(), '[role="alert"]').textContent,
    ).toContain(roMessages.accountForm.requestFailedTitle);
  });

  it("puts focus on the first row a page added even when its id is not a design id", async () => {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body: wireList(
          page === 1 ? rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE) : [wireRow(500)],
          { total: 21, page },
        ),
      };
    });
    await harness.mount();

    click(
      byWords(harness.container(), "button", roMessages.staffKitchens.loadMore),
    );
    await harness.settle();

    expect(document.activeElement?.getAttribute("data-row-id")).toBe(
      staffKitchenIdOf(500),
    );
  });
});

describe("a page that holds no kitchen though the list holds some", () => {
  function emptyPageTwo(): void {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body:
          page === 1
            ? wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
                total: 100,
                page,
              })
            : wireList([], { total: 100, page }),
      };
    });
  }

  it("is not told as an empty list: it says the page could not be shown and offers the first page", async () => {
    emptyPageTwo();
    await harness.mount({ width: "desktop" });

    click(byWords(harness.container(), "nav button", "Pagina 2"));
    await harness.settle();

    const unshown = requireIn(
      harness.container(),
      '[data-testid="staff-kitchens-page-unshown"]',
    );
    expect(unshown.textContent).not.toContain(
      roMessages.staffKitchens.emptySentTitle,
    );
    expect(harness.container().textContent).not.toContain(
      roMessages.staffKitchens.emptySentTitle,
    );
    const first = byWords(unshown, "button", roMessages.accountForm.retry);
    harness.server.requests.length = 0;
    harness.answers((request) => ({
      body: wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
        total: 100,
        page: Number(request.url.searchParams.get("page")),
      }),
    }));

    click(first);
    await harness.settle();

    expect(
      harness.listRequests().map(({ url }) => url.searchParams.get("page")),
    ).toEqual(["1"]);
    expect(allIn(harness.container(), ROWS)).toHaveLength(
      STAFF_KITCHENS_PAGE_SIZE,
    );
  });
});

describe("a page restored from the browser's cache", () => {
  function restore(isPersisted: boolean): void {
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: isPersisted });
    act(() => {
      window.dispatchEvent(event);
    });
  }

  it("is loaded again, once, so a list shown to a signed-out person is not shown from memory", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { assign: () => undefined, reload });
    harness.answers(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await harness.mount();

    restore(true);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("is left alone when it was not restored from the cache", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { assign: () => undefined, reload });
    harness.answers(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await harness.mount();

    restore(false);

    expect(reload).not.toHaveBeenCalled();
  });

  it("stops listening when the screen goes away", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { assign: () => undefined, reload });
    harness.answers(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await harness.mount();

    harness.unmount();
    restore(true);

    expect(reload).not.toHaveBeenCalled();
  });
});
