// **M6-AUD-006 / ADR 0100 decision 5: the copy and the coefficient move together, and neither moves
// alone.**
//
// A 700 mm carcass eats more board and prices identically to a 600 mm one. The owner has ruled the
// shape — one dashboard-editable multiplier on the 600 mm base — and deliberately deferred the work
// (ADR 0100 decision 6). Until it ships, `globalSettings.depthNote` tells the customer that depth
// does not change the estimate, which is **accurate about the code and wrong about furniture**.
//
// The danger the deferral leaves behind is a half-move: somebody edits the sentence to promise a
// depth-dependent price the book cannot produce, or ships a coefficient and leaves the sentence
// standing. This file couples the two so either half alone turns it red, and whoever picks ADR 0100
// up is handed the copy change by a failing test rather than by a reviewer's memory.
//
// **The depth change is made through the shipped command, not by writing 700 into `settings`.**
// `setCabinetDepth` rebuilds every body and renames build ids (`base-drawer3-600` →
// `base-3drawer`), so a document with the number edited in would price identically for the trivial
// reason that nothing moved. The rebuild is asserted below before the amounts are compared.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-08T12:00:00.000Z";
const DEEPER_MM = 700;

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

/** Priced exactly as `usePricedDesign` prices it — same book, same version, same selections — so a
 *  rule that only bites through the hook's path cannot hide from this file. */
function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(design.settings?.cabinetDepthMm ?? 600),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function buildIdsOf(design: Design): readonly string[] {
  return design.placements.map((placement) => placement.body.buildId);
}

describe("depth does not reach an amount, and the sentence that says so", () => {
  const store = createStore();
  const shallow = store.getState().design;
  const atSixHundred = priceOf(shallow);

  store.getState().setCabinetDepth(DEEPER_MM);
  const deep = store.getState().design;
  const atSevenHundred = priceOf(deep);

  it("really deepened the kitchen, so the comparison below is not two copies of one document", () => {
    expect(shallow.settings?.cabinetDepthMm ?? 600).toBe(600);
    expect(deep.settings?.cabinetDepthMm).toBe(DEEPER_MM);
    // The rebuild is the half a hand-edited setting would skip: at least one body left the
    // catalogue row it was standing in.
    expect(buildIdsOf(deep)).not.toEqual(buildIdsOf(shallow));
  });

  it("prices the seeded kitchen at all, so an equality of two refusals cannot pass", () => {
    expect(atSixHundred.ok).toBe(true);
    expect(atSevenHundred.ok).toBe(true);
    if (!atSixHundred.ok) return;
    expect(atSixHundred.priced.lines.length).toBeGreaterThan(0);
    expect(atSixHundred.priced.totalMinor).toBeGreaterThan(0);
  });

  it("charges the same total, line for line, at 700 as at 600", () => {
    if (!atSixHundred.ok || !atSevenHundred.ok) throw new Error("refused");
    expect(atSevenHundred.priced.totalMinor).toBe(
      atSixHundred.priced.totalMinor,
    );
    expect(atSevenHundred.priced.lines.map((line) => line.amountMinor)).toEqual(
      atSixHundred.priced.lines.map((line) => line.amountMinor),
    );
  });

  it("tells the customer exactly that, in the words shipped beside the control", () => {
    // The literal sits beside the constant on purpose (the M6 copy rule): a composed assertion
    // would hold for any wording, including a sentence that has quietly started promising a
    // depth-dependent price. When ADR 0100's coefficient ships, this line and the equality above
    // fail together — which is the coupling decision 5 asks for.
    expect(ro.globalSettings.depthNote).toBe(
      "Adâncimea nu schimbă estimarea — doar dimensiunile corpurilor.",
    );
  });
});
