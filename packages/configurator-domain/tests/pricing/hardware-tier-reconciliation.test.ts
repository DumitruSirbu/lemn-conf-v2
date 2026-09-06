// **Wave 6T's reconciliation: the sample hardware rates against ADR 0070's own totals table**
// (ADR 0092 decision 6).
//
// ADR 0070's figures were derived by the owner **before the front declarations existed** — from a
// hinge count and a drawer count arrived at by hand. That independence is the only reason this file
// means anything: it is not the book restated, it is two derivations of one number meeting. **If
// they disagree the declaration is wrong and the wave stops**; the expected figures are not adjusted
// to whatever the code produces (ADR 0028 is on record for what that costs).
//
// **The hardware-only column is 6T's, and the sink column is not.** ADR 0092 Amendment A moved the
// two sink extras to wave 6T2, so the `510_240` / `1_002_000` / `1_033_500` totals are 6T2's check
// and naming one here would be a criterion this wave fails by construction.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import type { HardwareTier } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";

const BOOK = SAMPLE_PRICE_BOOK;
const CATALOG = KITCHEN_L_BODY_CATALOG;

const SEEDED_ENTRIES = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  CATALOG,
).flatMap((group) => group.entries);

/** ADR 0070's hinge and drawer columns, in **lei**, exactly as the owner wrote them — the whole
 *  seeded kitchen at each tier. Kept in lei rather than converted here so a reader can put this
 *  table beside the ADR's without arithmetic. */
const ADR_0070_TOTALS_LEI = {
  "hardware.standard": { hinges: 1_300, drawers: 3_200 },
  "hardware.soft-close": { hinges: 6_290, drawers: 3_130 },
  "hardware.premium": { hinges: 5_550, drawers: 4_185 },
} as const;

const BANI_PER_LEU = 100;

/** **Standard's hinge column is rounded and the other two are not.** 74 hinges at 17.60 lei is
 *  1 302.40, which the owner wrote as 1 300 — so the reconciliation lands 2.40 lei above ADR 0070's
 *  Standard row and exactly on Hettich's and Blum's. Stated as a per-tier tolerance rather than
 *  applied silently, because a tolerance that covers every tier would hide a rate that is simply
 *  wrong. */
const ROUNDING_ALLOWANCE_MINOR: Readonly<Record<string, number>> = {
  "hardware.standard": 240,
  "hardware.soft-close": 0,
  "hardware.premium": 0,
};

function tierOf(tierId: string): HardwareTier {
  const tier = BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no "${tierId}"`);
  return tier;
}

/** The hardware line the shipped query publishes for the seeded kitchen at this tier. Read off
 *  `priceDesign` rather than recomposed, so what is reconciled is what a customer would be shown. */
function hardwareLineAt(tierId: string) {
  const result = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    selections: { hardwareTierId: tierId },
  });
  if (!result.ok)
    throw new Error(`seeded design refused: ${result.failure.code}`);

  const line = result.priced.lines.find(
    (candidate) => candidate.kind === "hardware",
  );
  if (!line) throw new Error("the seeded design published no hardware line");
  return line;
}

describe("the seeded kitchen's mechanisms are ADR 0070's own count", () => {
  it("counts 74 hinges, 5 drawers and no push-to-open", () => {
    expect(countHardwareMechanisms(SEEDED_ENTRIES, CATALOG)).toEqual({
      hinges: 74,
      drawers: 5,
      pushToOpen: 0,
    });
  });
});

describe("the sample rates reconcile to ADR 0070's totals table", () => {
  it.each(Object.keys(ADR_0070_TOTALS_LEI))(
    "prices %s within the owner's own rounding of the ADR's hinge and drawer columns",
    (tierId) => {
      const columns =
        ADR_0070_TOTALS_LEI[tierId as keyof typeof ADR_0070_TOTALS_LEI];
      const mechanisms = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);
      const tier = tierOf(tierId);

      expect(tier.perHingeMinor * mechanisms.hinges).toBe(
        columns.hinges * BANI_PER_LEU + (ROUNDING_ALLOWANCE_MINOR[tierId] ?? 0),
      );
      expect(tier.perDrawerMinor * mechanisms.drawers).toBe(
        columns.drawers * BANI_PER_LEU,
      );
    },
  );

  /** The hardware-only column of ADR 0092 decision 6's table, on the line a customer is shown. */
  it.each([
    ["hardware.standard", 450_240],
    ["hardware.soft-close", 942_000],
    ["hardware.premium", 973_500],
  ] as const)(
    "publishes %s as one line of %i minor",
    (tierId, expectedMinor) => {
      const line = hardwareLineAt(tierId);

      expect(line.quantity).toBe(1);
      expect(line.unitAmountMinor).toBe(expectedMinor);
      expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
    },
  );

  /** **The Standard tier stopped being zero**, which is the customer-visible half of ADR 0092
   *  decision 15's interim. Pinned from the failing side: a wave that reverted the baseline without
   *  saying so goes red here rather than in a total nobody reads. */
  it("bills the default hardware tier rather than including it", () => {
    expect(hardwareLineAt(BOOK.hardware.defaultTierId).amountMinor).toBe(
      450_240,
    );
    expect(tierOf(BOOK.hardware.defaultTierId).description).not.toMatch(
      /incluse? în preț/i,
    );
  });
});

/**
 * **The defect ADR 0070 exists to remove, asserted on the line a customer is billed on.**
 *
 * A `handle: "push"` body carries hinges, runners and a latch and **no handle at all**, so the
 * superseded per-handle quantity billed a kitchen where every front is push-to-open at exactly
 * zero. `hardware-mechanisms.test.ts` pins the counts; this pins the price, because the count being
 * right is not the same statement as the money reaching the line.
 */
describe("a push-to-open kitchen's hardware is not zero", () => {
  const PUSH_EVERYWHERE = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, handle: "push" as const },
    })),
  };

  function pushHardwareAmountAt(tierId: string): number {
    const result = priceDesign({
      design: PUSH_EVERYWHERE,
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
      selections: { hardwareTierId: tierId },
    });
    if (!result.ok)
      throw new Error(`push kitchen refused: ${result.failure.code}`);
    const line = result.priced.lines.find(
      (candidate) => candidate.kind === "hardware",
    );
    if (!line) throw new Error("the push kitchen published no hardware line");
    return line.amountMinor;
  }

  it.each(["hardware.standard", "hardware.soft-close", "hardware.premium"])(
    "bills %s the latches on top of the hinges and drawers it already carries",
    (tierId) => {
      const tier = tierOf(tierId);
      const seeded = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);

      // 36 leaves plus 5 drawers: one latch on every front that opens (ADR 0092 decision 3).
      expect(pushHardwareAmountAt(tierId)).toBe(
        hardwareLineAt(tierId).amountMinor + tier.perPushToOpenMinor * (36 + 5),
      );
      expect(pushHardwareAmountAt(tierId)).toBeGreaterThan(0);
      expect(seeded.pushToOpen).toBe(0);
    },
  );
});

describe("the tier order is a fact about the rates, not about their names", () => {
  /** **A sample-data edit can silently reorder Hettich and Blum.** This kitchen is hinge-dominated,
   *  so Blum's cheaper hinge cannot overcome Hettich's understated drawer here — and a drawer-heavy
   *  design swaps them, which is exactly why the order is pinned on the shipped kitchen and the
   *  inversion is pinned separately as a witness rather than asserted away. */
  it("orders the seeded kitchen Standard, then Hettich, then Blum", () => {
    expect(
      BOOK.hardware.tiers.map(
        (tier) => hardwareLineAt(tier.tierId).amountMinor,
      ),
    ).toEqual([450_240, 942_000, 973_500]);
  });

  /** ADR 0070's Hettich drawer figure is a **runners-only** product line while Standard's and
   *  Blum's are complete boxes, and the owner ruled it stays that way: *"for Hettich use it as it
   *  is"*. A wave that quietly makes the three comparable has overturned a decision, and this is
   *  what it would have to change to do so. */
  it("keeps Hettich's drawer rate understated against both complete-box tiers", () => {
    expect(tierOf("hardware.soft-close").perDrawerMinor).toBeLessThan(
      tierOf("hardware.standard").perDrawerMinor,
    );
    expect(tierOf("hardware.soft-close").perDrawerMinor).toBeLessThan(
      tierOf("hardware.premium").perDrawerMinor,
    );
  });

  /** The book's own quantifier for when the order inverts, derived from the rates rather than
   *  restated beside them: Hettich prices below Standard exactly when a design's drawers outweigh
   *  its hinges by the ratio of the two rate gaps. On the shipped rates that is 4.81…, so the
   *  seeded kitchen's 5 drawers against 74 hinges is nowhere near it and a single `base-3drawer` is
   *  past it — which is the witness wave 6W is opened by. */
  it("inverts only where drawers outweigh hinges by the rates' own ratio", () => {
    const standard = tierOf("hardware.standard");
    const hettich = tierOf("hardware.soft-close");
    const hingeSurchargeMinor = hettich.perHingeMinor - standard.perHingeMinor;
    const drawerSavingMinor = standard.perDrawerMinor - hettich.perDrawerMinor;
    const drawersPerHingeToInvert = hingeSurchargeMinor / drawerSavingMinor;

    // Hettich costs more per hinge and less per drawer, which is what makes an inversion possible
    // at all. Both signs are the precondition, not the conclusion.
    expect(hingeSurchargeMinor).toBeGreaterThan(0);
    expect(drawerSavingMinor).toBeGreaterThan(0);
    expect(drawersPerHingeToInvert).toBeCloseTo(4.814, 3);

    const seeded = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);
    expect(seeded.drawers).toBeLessThan(
      drawersPerHingeToInvert * seeded.hinges,
    );
  });

  /** **The negative-delta witness, pinned as a passing test** (ADR 0092 decision 12). A design of
   *  one `base-3drawer` carries three drawers and no hinge, so it is past the ratio above and
   *  Hettich prices *below* the default tier. Wave 6W owns what a customer should be shown for it;
   *  6T owns that the number is on record and is not discovered again by accident. */
  it("prices a lone base-3drawer at Hettich below Standard", () => {
    const design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          id: "solo",
          wall: "A" as const,
          alongMm: 1300,
          y0Mm: 0,
          body: { buildId: "base-3drawer", widthMm: 600, heightMm: 820 },
        },
      ],
    };
    const hardwareAmountAt = (tierId: string): number => {
      const result = priceDesign({
        design,
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: BOOK.version,
        selections: { hardwareTierId: tierId },
      });
      if (!result.ok)
        throw new Error(`base-3drawer refused: ${result.failure.code}`);
      const line = result.priced.lines.find(
        (candidate) => candidate.kind === "hardware",
      );
      if (!line) throw new Error("no hardware line");
      return line.amountMinor;
    };

    expect(
      hardwareAmountAt("hardware.soft-close") -
        hardwareAmountAt(BOOK.hardware.defaultTierId),
    ).toBe(-4_200);
  });
});
