// @vitest-environment happy-dom
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NO_PRICE_BOOK,
  offerTiersAgainstBook,
  priceAgainstBook,
  priceFloorOf,
  UnreadablePriceBookError,
} from "@/price/price-book-root";
import { usePricedDesign } from "@/price/use-priced-design";

import { renderHook } from "../support/render-hook";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

// With no book to price from (A-10, criterion R-b) every price surface answers a refusal and none renders a figure.

const CATALOG = buildKitchenLBodyCatalog(600);

describe("pricing with no active price book", () => {
  it("is a refusal that names no figure, where the same kitchen prices under a book", () => {
    expect(
      priceAgainstBook(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN, CATALOG).ok,
    ).toBe(true);

    const refused = priceAgainstBook(NO_PRICE_BOOK, KITCHEN_L_DESIGN, CATALOG);

    expect(refused.ok).toBe(false);
    expect(refused).not.toHaveProperty("priced");
  });

  it("gives a stored kitchen's card no price", () => {
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, KITCHEN_L_DESIGN)).toBeDefined();
    expect(priceFloorOf(NO_PRICE_BOOK, KITCHEN_L_DESIGN)).toBeUndefined();
  });

  it("is a refusal in the editor's price hook, from the root the page supplied", () => {
    const withBook = renderHook(usePricedDesign);
    const withoutBook = renderHook(
      usePricedDesign,
      (children) => children,
      NO_PRICE_BOOK,
    );

    expect(withBook.result.current.ok).toBe(true);
    expect(withoutBook.result.current.ok).toBe(false);
    withBook.unmount();
    withoutBook.unmount();
  });

  it("is a refusal where no page supplied a provider at all, so an unwrapped tree cannot price from a book of its own", () => {
    let seen: ReturnType<typeof usePricedDesign> | undefined;
    function Probe() {
      seen = usePricedDesign();
      return null;
    }

    renderToStaticMarkup(createElement(Probe));

    expect(seen?.ok).toBe(false);
  });

  it("has no tier offer to give, and says so as the book fault it is (the settings sheet's open question)", () => {
    expect(() =>
      offerTiersAgainstBook(NO_PRICE_BOOK, KITCHEN_L_DESIGN, CATALOG),
    ).toThrow(UnreadablePriceBookError);
  });
});
