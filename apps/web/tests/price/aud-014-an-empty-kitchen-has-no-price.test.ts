// **M6-AUD-014, ruled by the owner on 2026-09-09: an empty kitchen is valid and has no price.**
//
// A design with zero placements is schema-valid, prices successfully, and used to read
// `De la 0 MDL`. Zero is the one figure a customer reads as a promise, and the milestone recorded
// that no wording or behaviour had been ruled for it.
//
// The owner chose the middle of three contracts. **Zero placements stay valid** — loadable,
// shareable, refused at no seam, which is what M7 needs the day it produces an empty or failed
// proposal — and the surfaces say there is no price instead of printing one. The sentence is the
// owner's own.
//
// Three things are asserted here, because each fails differently:
//
//   1. The bar shows the prompt and **no figure at all**, so no amount is left to read as free.
//   2. The breakdown is **not offered**: an available-but-empty one would render the two
//      whole-kitchen tiers *inclus* over a kitchen with nothing in it, which is a costed-looking
//      answer to a question nobody can ask yet.
//   3. The document itself is **not refused** anywhere. That is the half of the ruling a copy test
//      cannot see, and the half that separates this contract from "empty is invalid".
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
  parsePriceBook,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  validateDesignForCatalog,
  DesignSchema,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { ro as content } from "../support/romanian-content";
import { describePriceBar } from "@/price/price-bar-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";

const CABINET_DEPTH_MM = 600;
const catalog = buildKitchenLBodyCatalog(CABINET_DEPTH_MM);

/** The shipped kitchen with every body removed and nothing else changed — the frozen map goes with
 *  them, because a recorded space standing where nothing stands is a different document and a
 *  different question (backlog 50). */
const EMPTY_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: [],
  emptyColumns: [],
  columnExtents: [],
};

function priceOf(design: Design): PricingResult {
  const parsed = parsePriceBook(SAMPLE_PRICE_BOOK);
  if (!parsed.ok) throw new Error("the sample book did not parse");
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    design,
    catalog,
    book: parsed.book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function barFor(design: Design) {
  return describePriceBar({ pricing: priceOf(design), content });
}

function breakdownFor(design: Design) {
  return describePriceBreakdown({
    deepCabinetPercent: undefined,
    content,
    pricing: priceOf(design),
    groups: projectDesignForDisplay(design, catalog),
  });
}

describe("an empty kitchen, priced", () => {
  it("still prices successfully — the ruling is about presentation, not about a failure", () => {
    // Non-vacuity for everything below, and the distinction the whole finding turns on: this is not
    // a pricing refusal wearing a new coat. The query succeeds and answers zero.
    const priced = priceOf(EMPTY_DESIGN);
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.priced.totalMinor).toBe(0);
    expect(priced.priced.lines.some((line) => line.kind === "cabinet")).toBe(
      false,
    );
  });

  it("shows the owner's prompt in place of a figure, and no amount anywhere", () => {
    const view = barFor(EMPTY_DESIGN);

    expect(view.kind).toBe("empty");
    if (view.kind !== "empty") return;
    // The wording is pinned once, in the copy lock. What is left is the half a lock cannot see: the
    // bar reaches for the prompt leaf, and the prompt names no number and no price prefix.
    expect(view.prompt).toBe(ro.price.emptyKitchenPrompt);
    expect(view.prompt).not.toMatch(/\d/);
    expect(view.prompt).not.toContain(ro.price.startingPrefix);
  });

  it("offers no breakdown, so no tier is rendered inclus over an empty kitchen", () => {
    expect(breakdownFor(EMPTY_DESIGN).kind).toBe("unavailable");
  });

  it("is refused by nothing — the half of the ruling that is not copy", () => {
    // Valid against the schema, and clean against the catalogue-aware gate that runs at both the
    // load and the write seam. This is what "empty is a valid transitional state" means in code, and
    // it is what would have to change had the owner ruled empty invalid instead.
    expect(DesignSchema.safeParse(EMPTY_DESIGN).success).toBe(true);
    expect(validateDesignForCatalog(EMPTY_DESIGN, catalog)).toEqual([]);
  });
});

describe("a kitchen with cabinets is untouched by any of it", () => {
  it("still shows a figure with the ruled prefix", () => {
    const view = barFor(KITCHEN_L_DESIGN);

    expect(view.kind).toBe("priced");
    if (view.kind !== "priced") return;
    expect(view.figure.label).toBe(ro.price.startingPrefix);
    expect(view.figure.amountText).toMatch(/\d/);
  });

  it("still offers its breakdown", () => {
    expect(breakdownFor(KITCHEN_L_DESIGN).kind).toBe("available");
  });

  it("turns empty the moment the last cabinet goes, and back when one returns", () => {
    // The transition rather than the two end states: a surface that decided this once at load would
    // pass both cases above and strand a customer who deletes everything.
    const oneCabinet: Design = {
      ...EMPTY_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.slice(0, 1),
    };

    expect(barFor(oneCabinet).kind).toBe("priced");
    expect(barFor(EMPTY_DESIGN).kind).toBe("empty");
    expect(barFor(oneCabinet).kind).toBe("priced");
  });
});
