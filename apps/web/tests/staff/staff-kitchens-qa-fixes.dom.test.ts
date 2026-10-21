// @vitest-environment happy-dom
//
// What the staff list owes the person after the QA of wave L3-U2: a way out of a page past the end of a list that shrank, focus
// that goes where the person put it, a retry that waits for a limit, one row for one kitchen, and a count written like the foot
// under it. The adversarial files hold the cases that found each; these hold the rules the fixes added.
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { staffKitchenListFrom } from "@/staff/use-staff-kitchens";

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
  COUNT,
  FOOT,
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

function pageButtonCalled(page: number): HTMLButtonElement {
  return byWords<HTMLButtonElement>(
    harness.container(),
    "nav button",
    `Pagina ${String(page)}`,
  );
}

function pageParamsRequested(): string[] {
  return harness
    .listRequests()
    .map(({ url }) => url.searchParams.get("page") ?? "");
}

describe("a page past the end of a list that shrank", () => {
  it("asks once for the last page that exists, draws it, and puts focus on the count", async () => {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body:
          page === 1
            ? wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
                total: 100,
                page,
              })
            : page === 5
              ? wireList([], { total: 41, page })
              : wireList(rowsOfPage(page, 1), { total: 41, page }),
      };
    });
    await harness.mount({ width: "desktop" });
    harness.server.requests.length = 0;

    click(pageButtonCalled(5));
    await harness.settle();

    expect(pageParamsRequested()).toEqual(["5", "3"]);
    expect(allIn(harness.container(), ROWS)).toHaveLength(1);
    expect(document.activeElement).toBe(requireIn(harness.container(), COUNT));
  });

  it("does not ask again when the last page it asked for is itself empty: it draws a state the person can act on", async () => {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body:
          page === 1
            ? wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
                total: 100,
                page,
              })
            : wireList([], { total: 41, page }),
      };
    });
    await harness.mount({ width: "desktop" });
    harness.server.requests.length = 0;

    click(pageButtonCalled(5));
    await harness.settle();
    await harness.pass(60_000);

    expect(pageParamsRequested()).toEqual(["5", "3"]);
    expect(allIn(harness.container(), ROWS)).toHaveLength(0);
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchens-empty"]'),
    ).toHaveLength(1);
  });

  it("draws the empty state, and asks for no other page, when the list has emptied altogether", async () => {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body:
          page === 1
            ? wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
                total: 100,
                page,
              })
            : wireList([], { total: 0, page }),
      };
    });
    await harness.mount({ width: "desktop" });
    harness.server.requests.length = 0;

    click(pageButtonCalled(5));
    await harness.settle();

    expect(pageParamsRequested()).toEqual(["5"]);
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchens-empty"]'),
    ).toHaveLength(1);
  });
});

describe("a page jump whose answer finds focus somewhere the person moved it", () => {
  it("lands without taking focus out of the search box", async () => {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return page === 3
        ? "hold"
        : {
            body: wireList(rowsOfPage(page, STAFF_KITCHENS_PAGE_SIZE), {
              total: 143,
              page,
            }),
          };
    });
    await harness.mount({ width: "desktop" });
    click(pageButtonCalled(3));
    await harness.settle();
    const input = requireIn<HTMLInputElement>(
      harness.container(),
      'input[type="search"]',
    );
    input.focus();

    harness.server.held[0]?.answer({
      body: wireList(rowsOfPage(3, STAFF_KITCHENS_PAGE_SIZE), {
        total: 143,
        page: 3,
      }),
    });
    await harness.settle();

    expect(allIn(harness.container(), ROWS)).toHaveLength(
      STAFF_KITCHENS_PAGE_SIZE,
    );
    expect(document.activeElement).toBe(input);
  });
});

describe("a page jump that another action replaced", () => {
  it("leaves focus alone when the answer of the action that replaced it lands on the document", async () => {
    harness.answers((request) => {
      const { searchParams } = request.url;
      const page = Number(searchParams.get("page"));
      return page === 3 && searchParams.get("segment") === "sent"
        ? "hold"
        : {
            body: wireList(rowsOfPage(page, STAFF_KITCHENS_PAGE_SIZE), {
              total: 143,
              page,
            }),
          };
    });
    await harness.mount({ width: "desktop" });
    click(pageButtonCalled(3));
    await harness.settle();
    const drafts = allIn<HTMLInputElement>(
      harness.container(),
      'input[type="radio"]',
    )[1];
    click(drafts ?? harness.container());
    drafts?.blur();
    await harness.settle();

    expect(document.activeElement).toBe(document.body);
  });
});

describe("the retry of a page that a limit refused", () => {
  it("is off while the wait counts down, and sends nothing when pressed", async () => {
    harness.answers(() => RATE_LIMITED_ANSWER(90));
    await harness.mount();
    const retry = byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      roMessages.accountForm.retry,
    );

    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(retry.hasAttribute("disabled")).toBe(false);
    click(retry);
    await harness.settle();
    expect(harness.listRequests()).toHaveLength(1);
  });

  it("wakes when the wait ends, and asks nothing until it is pressed", async () => {
    harness.answers(() => RATE_LIMITED_ANSWER(90));
    await harness.mount();

    await harness.pass(91_000);
    const retry = byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      roMessages.accountForm.retry,
    );

    expect(retry.hasAttribute("aria-disabled")).toBe(false);
    expect(harness.listRequests()).toHaveLength(1);
    click(retry);
    await harness.settle();
    expect(harness.listRequests()).toHaveLength(2);
  });

  it("is on for a service that is down, which states no wait", async () => {
    harness.answers(() => ({
      status: 503,
      body: { status: "unavailable" },
    }));
    await harness.mount();

    const retry = byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      roMessages.accountForm.retry,
    );

    expect(retry.hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("the filter a press took away", () => {
  it("returns focus to the status select when the button that shows every status is pressed", async () => {
    harness.answers((request) => ({
      body: wireList(
        request.url.searchParams.has("status") ? [] : [wireRow(1)],
        { total: request.url.searchParams.has("status") ? 0 : 1 },
      ),
    }));
    await harness.mount();
    const select = requireIn<HTMLSelectElement>(harness.container(), "select");
    select.value = "closed";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await harness.settle();
    const none = requireIn(
      harness.container(),
      '[data-testid="staff-kitchens-no-results"]',
    );
    const show = byWords<HTMLButtonElement>(
      none,
      "button",
      roMessages.staffKitchens.clearStatus,
    );
    show.focus();

    click(show);
    await harness.settle();

    expect(document.activeElement).toBe(select);
  });
});

describe("a kitchen named twice in one page", () => {
  it("is read once, where it first stands", () => {
    const first = wireRow(1, { name: "first" });
    const again = wireRow(1, { name: "again" });

    const list = staffKitchenListFrom(
      wireList([first, wireRow(2), again], { total: 3 }),
    );

    expect(list?.kitchens.map(({ id, name }) => [id, name])).toEqual([
      [staffKitchenIdOf(1), "first"],
      [staffKitchenIdOf(2), "Bucatarie 2"],
    ]);
  });

  it("is drawn once", async () => {
    harness.answers(() => ({
      body: wireList([wireRow(1), wireRow(2), wireRow(1)], { total: 3 }),
    }));
    await harness.mount();

    expect(allIn(harness.container(), ROWS)).toHaveLength(2);
  });
});

describe("a long list's count", () => {
  it("is written without a thousands separator, like the foot under it", async () => {
    harness.answers(() => ({
      body: wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
        total: 12345,
        page: 1,
      }),
    }));
    await harness.mount({ width: "desktop" });

    const count = requireIn(harness.container(), COUNT).textContent;
    const foot = requireIn(harness.container(), FOOT).textContent;

    expect(count).toContain("12345");
    expect(foot).toContain("12345");
    expect(count).not.toMatch(/12\D345/);
  });
});
