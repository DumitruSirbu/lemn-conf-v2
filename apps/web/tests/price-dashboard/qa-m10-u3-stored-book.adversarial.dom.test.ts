// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, a stored book the page did not make. The page is held to what a typed value can do; this
// holds it to what an active version can already be. `parsePriceBook` has no catalogue, so it takes a book that prices a
// width at or below zero, and any version published before the A-7b judgement existed may be one. The page's own stated
// design (`cabinet-detail-model.ts`: "a defect of ours, so the page is not drawn rather than wrong") and the list's
// (`cabinet-price-unreadable`) are to survive it. `formatLei` throws on a price that is not a count of bani, and the
// preview's `isDrawable` guard is applied to the new column only, so the active column reaches it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parsePriceBook,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  BASE_RULE,
  mountDetail,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { cabinetNamesOf, stateOf } from "./dashboard-state-fixture";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

let mounted: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

function bookWith(patch: Record<string, number>): PriceBook {
  const book = {
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
      rule.ruleId === BASE_RULE
        ? { ...rule, formula: { ...rule.formula, ...patch } }
        : rule,
    ),
  };
  const parsed = parsePriceBook(book);
  if (!parsed.ok)
    throw new Error(`the book is refused: ${parsed.failure.code}`);
  return parsed.book;
}

function pageHolding(book: PriceBook) {
  const base = stateOf();
  return {
    state: { ...base, active: { ...base.active, book } },
    cabinetNames: cabinetNamesOf(book),
  };
}

describe("an active version that prices a width of the base cabinet at or below zero (a stored book, not a typed one)", () => {
  it.each([
    ["an anchor of 5 bani under steps of 150 lei", { anchorMinor: 5 }],
    [
      "an anchor of 1 234,57 lei under the same steps",
      { anchorMinor: 123_457 },
    ],
    ["a minus step of 18 000 lei", { perStepNarrowerMinor: 1_800_000 }],
  ])(
    "%s: the page is drawn without throwing (in the unavailable notice if it cannot be drawn whole), never as a render error",
    async (_name, patch) => {
      const book = bookWith(patch);

      mounted = await mountDetail(BASE_RULE, { page: pageHolding(book) });

      expect(mounted.container.textContent.length).toBeGreaterThan(0);
      expect(mounted.container.textContent).not.toMatch(/-\d/);
    },
  );
});

describe("a stored book at the other end", () => {
  it("draws the base cabinet whose steps are all zero, with a table that is the anchor at every width", async () => {
    const book = bookWith({
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
      perExtraDoorLeafMinor: 0,
    });

    mounted = await mountDetail(BASE_RULE, { page: pageHolding(book) });

    const cells = Array.from(
      mounted.container.querySelectorAll('tbody td[data-role="active"]'),
    ).map((cell) => cell.textContent.trim());
    expect(new Set(cells.filter((_cell, index) => index % 3 === 0)).size).toBe(
      1,
    );
  });
});
