// Reconciles the sample hardware rates against ADR 0070's own totals table (ADR 0092 decision 6). ADR 0070's figures
// were derived by the owner before the front declarations existed, so this is two derivations of one number meeting:
// if they disagree the declaration is wrong, and the expected figures are not adjusted to whatever the code produces.
// The seeded kitchen carries push-to-open fronts, so the hardware line is ADR 0070's two columns plus a push column
// that record never published (ADR 0092 Amendment C). The hinge and drawer terms stay literal; the push term is
// computed from the book because the push rates are drafted placeholders, and no tier ordering is asserted anywhere.
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import type { HardwareTier } from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricedDesign } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";

const BOOK = SAMPLE_PRICE_BOOK;
const CATALOG = KITCHEN_L_BODY_CATALOG;

const SEEDED_ENTRIES = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  CATALOG,
).flatMap((group) => group.entries);

/** ADR 0070's hinge and drawer columns in lei, as the owner wrote them for the whole seeded kitchen at each tier, so
 *  a reader can put this table beside the ADR's without arithmetic. */
const ADR_0070_TOTALS_LEI = {
  "hardware.standard": { hinges: 1_300, drawers: 3_200 },
  "hardware.soft-close": { hinges: 6_290, drawers: 3_130 },
  "hardware.premium": { hinges: 5_550, drawers: 4_185 },
} as const;

const BANI_PER_LEU = 100;

/** Standard's hinge column is rounded by the owner: 74 hinges at 17.60 lei is 1 302.40, written as 1 300. A per-tier
 *  tolerance rather than a blanket one, which would hide a rate that is simply wrong. */
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

/** The hardware line the shipped query publishes for the seeded kitchen at this tier, so what is reconciled is what a
 *  customer is shown. */
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

/** The three counts, pinned as numbers: product facts answerable without any amount (ADR 0092 Amendment C). */
const SEEDED_MECHANISM_COUNTS = { hinges: 74, drawers: 5, pushToOpen: 16 };

describe("the seeded kitchen's mechanisms are ADR 0070's own count, plus the column it never published", () => {
  it("counts 74 hinges, 5 drawers and 16 push-to-open", () => {
    expect(countHardwareMechanisms(SEEDED_ENTRIES, CATALOG)).toEqual(
      SEEDED_MECHANISM_COUNTS,
    );
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

  /** The hardware-only column of ADR 0092 decision 6's table, on the line a customer is shown. Hinges and drawers are
   *  literals; the push term is `16 × the tier's declared rate`, so a measured rate moves the book, no expectation. */
  it.each([
    ["hardware.standard", 130_240 + 320_000],
    ["hardware.soft-close", 629_000 + 313_000],
    ["hardware.premium", 555_000 + 418_500],
  ] as const)(
    "publishes %s as one line of hinges, drawers and latches",
    (tierId, hingesAndDrawersMinor) => {
      const line = hardwareLineAt(tierId);

      expect(line.quantity).toBe(1);
      expect(line.unitAmountMinor).toBe(
        hingesAndDrawersMinor +
          SEEDED_MECHANISM_COUNTS.pushToOpen *
            tierOf(tierId).perPushToOpenMinor,
      );
      expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
    },
  );

  /** The Standard tier is billed, not included (ADR 0092 decision 15's interim); pinned so a reverted baseline goes red
   *  here rather than in a total nobody reads. */
  it("bills the default hardware tier rather than including it", () => {
    const defaultTier = tierOf(BOOK.hardware.defaultTierId);

    expect(hardwareLineAt(BOOK.hardware.defaultTierId).amountMinor).toBe(
      130_240 +
        320_000 +
        SEEDED_MECHANISM_COUNTS.pushToOpen * defaultTier.perPushToOpenMinor,
    );
    // A deliberate Romanian literal: a negative claim about the book's own authored prose (ADR 0106 decision 2 keeps it
    // required), which can only be spelled. It lives inside a regex because a diacritic scanner reading only quoted and
    // template strings cannot see it, so the 6B-j rule must scan regex literals too.
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about the book's own authored prose, which ADR 0106 decision 2 keeps required — and it lives in a regex, which is why the third selector exists.
    expect(defaultTier.description).not.toMatch(/incluse? în preț/i);
  });
});

/** The hardware amount `priceDesign` publishes for any design at any tier. */
function hardwareAmountOf(design: Design, tierId: string): number {
  const result = priceDesign({
    design,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    selections: { hardwareTierId: tierId },
  });
  if (!result.ok) throw new Error(`design refused: ${result.failure.code}`);
  const line = result.priced.lines.find(
    (candidate) => candidate.kind === "hardware",
  );
  if (!line) throw new Error("the design published no hardware line");
  return line.amountMinor;
}

const EVERY_TIER_ID = [
  "hardware.standard",
  "hardware.soft-close",
  "hardware.premium",
] as const;

/**
 * ADR 0070's defect, asserted on the billed line: a push-to-open front carries hinges, runners and a latch and no
 * handle, so the superseded per-handle quantity billed an all-push kitchen at zero. `hardware-mechanisms.test.ts`
 * pins the counts; this pins the price. The fixture stamps `push` only where the definition permits a mode (ADR 0092
 * Amendment C).
 */
describe("a push-to-open kitchen's hardware is not zero", () => {
  const PUSH_WHEREVER_PERMITTED: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      CATALOG.get(placement.body.buildId)?.canHandle === true
        ? { ...placement, body: { ...placement.body, handle: "push" as const } }
        : placement,
    ),
  };

  /** Every opening front except two: `base-corner-x-900`'s leaf and `wall-corner-return-570`'s declare
   *  `canHandle: false` and stand below the top row, so no recorded mode reaches them. */
  const PUSH_FRONTS_WHEN_PERMITTED = 39;

  it("counts a latch on every front the customer can choose one for", () => {
    expect(
      countHardwareMechanisms(
        projectDesignForDisplay(PUSH_WHEREVER_PERMITTED, CATALOG).flatMap(
          (group) => group.entries,
        ),
        CATALOG,
      ),
    ).toEqual({
      ...SEEDED_MECHANISM_COUNTS,
      pushToOpen: PUSH_FRONTS_WHEN_PERMITTED,
    });
  });

  it.each(EVERY_TIER_ID)(
    "bills %s the latches on top of the hinges and drawers it already carries",
    (tierId) => {
      const amount = hardwareAmountOf(PUSH_WHEREVER_PERMITTED, tierId);

      expect(amount).toBe(
        hardwareLineAt(tierId).amountMinor +
          tierOf(tierId).perPushToOpenMinor *
            (PUSH_FRONTS_WHEN_PERMITTED - SEEDED_MECHANISM_COUNTS.pushToOpen),
      );
      expect(amount).toBeGreaterThan(0);
    },
  );
});

/**
 * ADR 0092 decision 3, Amendment C: `wall-corner-return-570` declares `canHandle: false` beside `carriesHandles(1)` and
 * one leaf, so its bar is built and visible below the top row. A recorded `handle: "push"` on it does not remove the
 * bar in the scene, so it must not be billed a latch. A fixture stamping `push` only on `canHandle: true` bodies
 * cannot witness this.
 */
describe("a recorded push on a body that permits no mode is billed no latch", () => {
  const RECORDED_PUSH_ON_A_VISIBLE_BAR: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        id: "solo",
        wall: "B" as const,
        alongMm: 615,
        y0Mm: 1_500,
        body: {
          buildId: "wall-corner-return-570",
          widthMm: 570,
          heightMm: 700,
          handle: "push" as const,
        },
      },
    ],
  };

  it("counts its two hinges and no latch", () => {
    expect(
      countHardwareMechanisms(
        projectDesignForDisplay(
          RECORDED_PUSH_ON_A_VISIBLE_BAR,
          CATALOG,
        ).flatMap((group) => group.entries),
        CATALOG,
      ),
    ).toEqual({ hinges: 2, drawers: 0, pushToOpen: 0 });
  });

  it.each(EVERY_TIER_ID)("bills %s for the hinges alone", (tierId) => {
    expect(hardwareAmountOf(RECORDED_PUSH_ON_A_VISIBLE_BAR, tierId)).toBe(
      2 * tierOf(tierId).perHingeMinor,
    );
  });
});

/**
 * What the rates relate to each other, deliberately not which tier is dearest: at 16 latches the drafted push rates
 * put Hettich above Blum, inverting ADR 0070's totals table, so any pinned order would pin a placeholder with no
 * supplier source (ADR 0092 Amendment C).
 */
describe("the tier rates relate to each other in ways the book itself decides", () => {
  /** ADR 0070's Hettich drawer figure is a runners-only product line while Standard's and Blum's are complete boxes,
   *  and the owner ruled it stays that way (ADR 0092); a wave making the three comparable overturns that decision. */
  it("keeps Hettich's drawer rate understated against both complete-box tiers", () => {
    expect(tierOf("hardware.soft-close").perDrawerMinor).toBeLessThan(
      tierOf("hardware.standard").perDrawerMinor,
    );
    expect(tierOf("hardware.soft-close").perDrawerMinor).toBeLessThan(
      tierOf("hardware.premium").perDrawerMinor,
    );
  });

  /** Hettich prices below Standard exactly when a design's drawer saving outweighs both its hinge and latch surcharges
   *  (ADR 0092 decision 12, Amendment C); the two-term form is false once the seeded kitchen carries latches. Every
   *  coefficient is read from the book, so replacing the drafted push figures keeps the derivation valid. */
  it("inverts only where the drawer saving outweighs the hinge and latch surcharges", () => {
    const standard = tierOf("hardware.standard");
    const hettich = tierOf("hardware.soft-close");
    const hingeSurchargeMinor = hettich.perHingeMinor - standard.perHingeMinor;
    const pushSurchargeMinor =
      hettich.perPushToOpenMinor - standard.perPushToOpenMinor;
    const drawerSavingMinor = standard.perDrawerMinor - hettich.perDrawerMinor;

    // Hettich costs more per hinge and less per drawer, which makes an inversion possible: the precondition, not the
    // conclusion. The latch surcharge's sign is deliberately not asserted: the push rates are drafted placeholders
    // (ADR 0092 Amendment C) and the inequality below is sign-agnostic in that term.
    expect(hingeSurchargeMinor).toBeGreaterThan(0);
    expect(drawerSavingMinor).toBeGreaterThan(0);

    const seeded = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);
    const surchargeMinor =
      hingeSurchargeMinor * seeded.hinges +
      pushSurchargeMinor * seeded.pushToOpen;

    expect(drawerSavingMinor * seeded.drawers).toBeLessThan(surchargeMinor);
    expect(
      hardwareAmountOf(KITCHEN_L_DESIGN, "hardware.soft-close"),
    ).toBeGreaterThan(
      hardwareAmountOf(KITCHEN_L_DESIGN, BOOK.hardware.defaultTierId),
    );
  });

  /** The negative-delta witness (ADR 0092 decision 12): a design of one `base-3drawer` carries three drawers and no
   *  hinge, so Hettich prices below the default tier. */
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

    // It stands at `y0` 0 and records no mode, so it carries 3 drawers, 0 hinges and 0 latches and the latch surcharge
    // multiplies by nothing: the delta is the same as at zero push.
    expect(
      countHardwareMechanisms(
        projectDesignForDisplay(design, CATALOG).flatMap(
          (group) => group.entries,
        ),
        CATALOG,
      ),
    ).toEqual({ hinges: 0, drawers: 3, pushToOpen: 0 });
    expect(
      hardwareAmountAt("hardware.soft-close") -
        hardwareAmountAt(BOOK.hardware.defaultTierId),
    ).toBe(-4_200);
  });
});

/**
 * The whole figure (ADR 0092 decision 6, Amendment A, restated by Amendment C): per tier, hinges and drawers, plus the
 * flat sink extras, plus 16 × the tier's declared push rate. The first three terms are literals because they
 * reconcile against owner-derived figures; the push term is not, since the push rates are drafted placeholders with
 * no supplier source (ADR 0092 open input 1).
 */
describe("the seeded kitchen's whole hardware-and-extras figure, per tier", () => {
  /** ADR 0070's hinge and drawer columns, summed; the same literal the hardware-line block above reconciles. */
  const HINGES_AND_DRAWERS_MINOR: Readonly<Record<string, number>> = {
    "hardware.standard": 130_240 + 320_000,
    "hardware.soft-close": 629_000 + 313_000,
    "hardware.premium": 555_000 + 418_500,
  };

  /** ADR 0070's flat "Sink extras 600", identical in all three tier columns, which says the extras sit outside the
   *  tier. */
  const SINK_EXTRAS_MINOR = 60_000;

  function pricedAt(tierId: string): PricedDesign {
    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      book: BOOK,
      pricingVersion: BOOK.version,
      selections: { hardwareTierId: tierId },
    });
    if (!result.ok)
      throw new Error(`seeded design refused: ${result.failure.code}`);
    return result.priced;
  }

  /** Every line that is not a cabinet: the hardware tier, the material tier and the two extras. */
  function unplacedAmountAt(tierId: string): number {
    return pricedAt(tierId)
      .lines.filter((line) => line.kind !== "cabinet")
      .reduce((sum, line) => sum + line.amountMinor, 0);
  }

  it.each(EVERY_TIER_ID)(
    "bills %s its hinges and drawers, its latches, and the flat sink column",
    (tierId) => {
      const hingesAndDrawers = HINGES_AND_DRAWERS_MINOR[tierId];
      if (hingesAndDrawers === undefined)
        throw new Error(`no ADR 0070 column for "${tierId}"`);

      // The default material tier costs nothing, so what this sums is exactly the three terms.
      expect(unplacedAmountAt(tierId)).toBe(
        hingesAndDrawers +
          SINK_EXTRAS_MINOR +
          SEEDED_MECHANISM_COUNTS.pushToOpen *
            tierOf(tierId).perPushToOpenMinor,
      );
    },
  );

  /** The extras are the same in every column, which says they sit outside the tier; derived from each tier's own
   *  accessory lines rather than restated. */
  it("charges the same extras whichever hardware tier is chosen", () => {
    const extrasAt = EVERY_TIER_ID.map((tierId) =>
      pricedAt(tierId)
        .lines.filter((line) => line.kind === "accessory")
        .reduce((sum, line) => sum + line.amountMinor, 0),
    );

    expect(new Set(extrasAt)).toEqual(new Set([SINK_EXTRAS_MINOR]));
  });
});
