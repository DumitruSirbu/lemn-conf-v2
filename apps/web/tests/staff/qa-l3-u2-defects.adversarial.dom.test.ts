// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U2 (the staff kitchens list): cases that expose a production defect. Each test below is
// expected to FAIL against the wave as committed (2d8e1673, 9090f263, 5d94f355); the assertion is what the screen owes the
// person, and it must not be weakened to turn the file green. The green gap tests live in the sibling
// `qa-l3-u2-*.adversarial.dom.test.ts` files so that they can be committed and run on their own.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allIn,
  byWords,
  click,
  requireIn,
  typeInto,
} from "../support/render-with-intl";
import {
  RATE_LIMITED_ANSWER,
  STAFF_KITCHENS_PAGE_SIZE,
  rowsOfPage,
  wireList,
} from "../support/staff-kitchens-wire";
import roMessages from "../../src/messages/ro.json";
import {
  FOOT,
  SEARCH_SETTLE_MS,
  inputOfSearch,
  radiosOf,
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

/** A list of `total` kitchens whose every page is full; page numbers follow the request. */
function answerWithPages(total: number): void {
  harness.answers((request) => {
    const page = Number(request.url.searchParams.get("page"));
    return {
      body: wireList(rowsOfPage(page, STAFF_KITCHENS_PAGE_SIZE), {
        total,
        page,
      }),
    };
  });
}

function pageButtonCalled(page: number): HTMLButtonElement {
  return byWords<HTMLButtonElement>(
    harness.container(),
    "nav button",
    `Pagina ${String(page)}`,
  );
}

describe("a page past the end of a list that shrank (a client deleted a kitchen between two requests)", () => {
  function shrinkAfterFirstPage(): void {
    harness.answers((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return page === 1
        ? {
            body: wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
              total: 21,
              page,
            }),
          }
        : { body: wireList([], { total: 20, page }) };
    });
  }

  /** The ways out the foot or the empty-state words offer: an enabled button, or an empty state. */
  function waysBackToTheList(): HTMLElement[] {
    const container = harness.container();
    const inFoot = allIn(container, `${FOOT} button:not(:disabled)`);
    const emptyStates = allIn(
      container,
      '[data-testid="staff-kitchens-empty"], [data-testid="staff-kitchens-no-results"]',
    );
    return [...inFoot, ...emptyStates];
  }

  it("leaves the person on a desktop a way back to the first page", async () => {
    shrinkAfterFirstPage();
    await harness.mount({ width: "desktop" });

    click(pageButtonCalled(2));
    await harness.settle();

    expect(
      waysBackToTheList(),
      "the page answered no rows, yet the foot offers no way to page 1 and no empty state is drawn",
    ).not.toHaveLength(0);
  });
});

describe("a page jump that another action replaced", () => {
  function holdPageThree(): void {
    harness.answers((request) => {
      const { searchParams } = request.url;
      const page = Number(searchParams.get("page"));
      if (
        page === 3 &&
        !searchParams.has("q") &&
        searchParams.get("segment") === "sent"
      ) {
        return "hold";
      }
      return {
        body: wireList(rowsOfPage(page, STAFF_KITCHENS_PAGE_SIZE), {
          total: 143,
          page,
        }),
      };
    });
  }

  it("does not pull focus out of the search box when the answer of the search arrives", async () => {
    holdPageThree();
    await harness.mount({ width: "desktop" });
    click(pageButtonCalled(3));
    await harness.settle();
    const input = inputOfSearch(harness.container());

    input.focus();
    typeInto(input, "ana");
    await harness.pass(SEARCH_SETTLE_MS);

    expect(document.activeElement).toBe(input);
  });

  it("does not pull focus out of the segment the person chose when its answer arrives", async () => {
    holdPageThree();
    await harness.mount({ width: "desktop" });
    click(pageButtonCalled(3));
    await harness.settle();
    const drafts = radiosOf(harness.container())[1];
    if (drafts === undefined) throw new Error("no second segment");

    drafts.focus();
    click(drafts);
    await harness.settle();

    expect(document.activeElement).toBe(drafts);
  });
});

describe("clearing the search", () => {
  beforeEach(async () => {
    answerWithPages(143);
    await harness.mount({ width: "desktop" });
  });

  it("returns focus to the search box, which the removed button had", async () => {
    const input = inputOfSearch(harness.container());
    typeInto(input, "ana");
    const clear = byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      roMessages.staffKitchens.searchClear,
    );
    clear.focus();

    click(clear);
    await harness.settle();

    expect(document.activeElement).toBe(input);
  });

  it("returns focus to the search box when the clear button of an empty result is pressed", async () => {
    harness.answers((request) => ({
      body: wireList(
        request.url.searchParams.has("q")
          ? []
          : rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE),
        { total: request.url.searchParams.has("q") ? 0 : 143 },
      ),
    }));
    const input = inputOfSearch(harness.container());
    typeInto(input, "popa");
    await harness.pass(SEARCH_SETTLE_MS);
    const none = requireIn(
      harness.container(),
      '[data-testid="staff-kitchens-no-results"]',
    );
    const clear = byWords<HTMLButtonElement>(
      none,
      "button",
      roMessages.staffKitchens.searchClear,
    );
    clear.focus();

    click(clear);
    await harness.settle();

    expect(document.activeElement).toBe(input);
  });
});

describe("a rate-limit wait that is still counting down", () => {
  it("keeps the retry button off until the wait ends, as the account area's own buttons stay off", async () => {
    harness.answers(() => RATE_LIMITED_ANSWER(90));
    await harness.mount();
    const retry = byWords<HTMLButtonElement>(
      harness.container(),
      "button",
      roMessages.accountForm.retry,
    );

    click(retry);
    await harness.settle();

    expect(harness.listRequests()).toHaveLength(1);
  });
});

describe("a change of width while a loaded row holds the focus request", () => {
  it("does not take focus back from where the person has moved it", async () => {
    answerWithPages(45);
    await harness.mount({ width: "phone" });
    click(
      byWords(harness.container(), "button", roMessages.staffKitchens.loadMore),
    );
    await harness.settle();
    const input = inputOfSearch(harness.container());
    input.focus();

    harness.viewport.resizeTo("desktop");
    await harness.settle();

    expect(document.activeElement).toBe(input);
  });
});
