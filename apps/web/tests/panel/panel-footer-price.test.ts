// §9 item 7's footer — *price · Șterge corpul · Gata* — which the shipped `PanelFooter` did not
// carry until wave 6C, and *"De la neschimbat"* beside it while a refusal stands.
//
// The figure is priced through the real query, so this file cannot agree with itself about a total
// the application never produces.
import {
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { describePanel, type PanelFooter } from "@/panel/panel-model";
import { describeStartingPrice } from "@/price/starting-price";

import { occupiedMeta, REFUSAL } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

const SEEDED_PRICE: PricingResult = priceDesign({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
});

const FAILED_PRICE: PricingResult = priceDesign({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-not-this-one`,
});

function footerFor(
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): PanelFooter {
  const meta = occupiedMeta();
  const panel = describePanel({
    meta,
    offers: [],
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
    ...overrides,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel.footer;
}

describe("the footer price", () => {
  it("renders the current design's total, prefixed De la", () => {
    if (!SEEDED_PRICE.ok)
      throw new Error("expected the seeded design to price");

    expect(ro.price.startingPrefix).toBe("De la");
    expect(footerFor({ pricing: SEEDED_PRICE }).price).toEqual(
      describeStartingPrice({
        label: "De la",
        totalMinor: SEEDED_PRICE.priced.totalMinor,
      }),
    );
  });

  it("is labelled unchanged while a refusal stands, with the figure byte-identical", () => {
    const quiet = footerFor({ pricing: SEEDED_PRICE });
    const refused = footerFor({ pricing: SEEDED_PRICE, rejection: REFUSAL });

    expect(ro.price.startingPrefixUnchanged).toBe("De la neschimbat");
    expect(refused.price?.label).toBe("De la neschimbat");
    expect(refused.price?.label).toBe(ro.price.startingPrefixUnchanged);
    expect(refused.price?.amountText).toBe(quiet.price?.amountText);
  });

  it("renders no figure at all when pricing failed", () => {
    expect(FAILED_PRICE.ok).toBe(false);
    expect(footerFor({ pricing: FAILED_PRICE }).price).toBeUndefined();
  });

  it("renders no figure when no price was supplied", () => {
    // The same absence as a failure, deliberately: a footer that filled the gap would be inventing
    // a number, and there is no ruled copy for either case.
    expect(footerFor().price).toBeUndefined();
  });

  it("leaves the rest of §9's footer exactly as it was", () => {
    const footer = footerFor({ pricing: SEEDED_PRICE });

    expect(footer.removeLabel).toBe(ro.panel.remove);
    expect(footer.doneLabel).toBe(ro.panel.done);
    expect(footer.canDelete).toBe(true);
    expect(footer.isRemoveDisabled).toBe(false);
  });
});
