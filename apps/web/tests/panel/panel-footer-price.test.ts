// §9 item 7's footer — *price · Șterge corpul · Gata* — which the shipped `PanelFooter` did not
// carry until wave 6C. Gate O1 later made the refused and ordinary prefixes byte-identical.
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

import { ro } from "../support/romanian-content";
import { describePanel, type PanelFooter } from "@/panel/panel-model";
import { describeStartingPrice } from "@/price/starting-price";

import { occupiedMeta, REFUSAL } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";
import { PAL_KITCHEN } from "../support/panel-material";

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

function panelFor(
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): Extract<ReturnType<typeof describePanel>, { kind: "open" }> {
  const meta = occupiedMeta();
  const panel = describePanel({
    content: ro,
    material: PAL_KITCHEN,
    meta,
    offers: [],
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
    ...overrides,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

function footerFor(
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): PanelFooter {
  return panelFor(overrides).footer;
}

describe("the footer price", () => {
  it("renders the current design's total, prefixed De la", () => {
    if (!SEEDED_PRICE.ok)
      throw new Error("expected the seeded design to price");

    expect(ro.price.startingPrefix).toBe("De la");
    expect(footerFor({ pricing: SEEDED_PRICE }).price).toEqual(
      describeStartingPrice({
        totalMinor: SEEDED_PRICE.priced.totalMinor,
        copy: ro.price,
      }),
    );
  });

  it("is labelled and figured identically whether or not a refusal stands", () => {
    // **The relabelling is withdrawn** (owner, 2026-09-09): this footer used to call the figure
    // *"De la neschimbat"* while a refusal stood, and §9's own banner — three rows above it, on this
    // very surface — already says the edit was refused. What survives is the half that was always
    // the point: **a refusal moves nothing**, now asserted over the whole figure rather than over
    // its amount alone, because the label no longer moves either.
    const quiet = footerFor({ pricing: SEEDED_PRICE });
    const refused = footerFor({ pricing: SEEDED_PRICE, rejection: REFUSAL });

    expect(refused.price).toEqual(quiet.price);
    expect(refused.price?.label).toBe(ro.price.startingPrefix);
    // **Non-vacuity, and it is also the ruling's own reason**: the refusal is in force on this very
    // surface, three rows up, saying in a sentence what the second label used to restate.
    expect(
      panelFor({ pricing: SEEDED_PRICE, rejection: REFUSAL }).sections,
    ).toContainEqual({
      kind: "rejection",
      // 6B-e: the engine publishes the code; the sentence is the catalogue's.
      message: ro.rejection(REFUSAL),
    });
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
