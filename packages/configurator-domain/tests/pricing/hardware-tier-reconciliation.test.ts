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
//
// **Restated by wave 6T-a, and restated rather than extended** (ADR 0092 Amendment C). The seeded
// kitchen carries 16 push-to-open fronts, not zero, so the hardware **line** is ADR 0070's two
// columns *plus a push column that record never published*. The split that follows from it runs
// through the whole file:
//
// - **The hinge and drawer terms stay literal**, because they are what reconciles against ADR 0070's
//   own owner-derived columns and 74 and 5 do not move.
// - **The push term is computed from the book** — `16 × the tier's declared rate` — because the
//   three push rates are drafted placeholders with no supplier source, and a test typing the product
//   would make one load-bearing in exactly the way ADR 0092 decision 3 forbids.
// - **No tier ordering is asserted anywhere in this file.** At 16 latches the drafted rates put
//   Hettich above Blum, inverting ADR 0070's own totals; Amendment C rules that neither ordering is
//   pinned while the magnitudes are drafted.
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
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

/** The three counts, pinned as numbers because they are product facts derived from the design and
 *  the catalogue and answerable without any amount (ADR 0092 Amendment C). Everything the file
 *  computes from the book is multiplied by one of them. */
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

  /**
   * The hardware-only column of ADR 0092 decision 6's table, on the line a customer is shown —
   * **hinges and drawers as literals, latches from the book**.
   *
   * The literal is the sum of the two columns the test above reconciles against ADR 0070, and it
   * stays a literal for the same reason they do. The push term is `16 × the tier's own declared
   * rate`, so replacing a drafted rate with a measured one moves the book and moves no expectation.
   */
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

  /** **The Standard tier stopped being zero**, which is the customer-visible half of ADR 0092
   *  decision 15's interim. Pinned from the failing side: a wave that reverted the baseline without
   *  saying so goes red here rather than in a total nobody reads. */
  it("bills the default hardware tier rather than including it", () => {
    const defaultTier = tierOf(BOOK.hardware.defaultTierId);

    expect(hardwareLineAt(BOOK.hardware.defaultTierId).amountMinor).toBe(
      130_240 +
        320_000 +
        SEEDED_MECHANISM_COUNTS.pushToOpen * defaultTier.perPushToOpenMinor,
    );
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
 * **The defect ADR 0070 exists to remove, asserted on the line a customer is billed on.**
 *
 * A push-to-open front carries hinges, runners and a latch and **no handle at all**, so the
 * superseded per-handle quantity billed a kitchen where every front is push-to-open at exactly
 * zero. `hardware-mechanisms.test.ts` pins the counts; this pins the price, because the count being
 * right is not the same statement as the money reaching the line.
 *
 * **The fixture is a genuine push kitchen and is named for what it is.** Its predecessor stamped
 * `push` onto every placement including `hood-600`, `open-shelf-600`, `fridge-free-700` and both
 * corner returns — bodies whose definitions permit no mode — so it exercised the *opposite*
 * direction of the defect while claiming to demonstrate this one (ADR 0092 Amendment C).
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

  /** 39 of the kitchen's 41 opening fronts. The two that keep their bars are `base-corner-x-900`'s
   *  leaf and `wall-corner-return-570`'s: both declare `canHandle: false` and both stand below the
   *  top row, so no recorded mode reaches them and the slot does not hide them either. */
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
 * **The other direction, from the failing side** (ADR 0092 decision 3, Amendment C).
 *
 * `wall-corner-return-570` declares `canHandle: false` beside `carriesHandles(1)` and one door leaf:
 * its bar is built and, below the top row, visible. A hand-edited or migrated document recording
 * `handle: "push"` on it does not take that bar away in the scene, so it must not be billed a latch
 * either — and the count that read the recorded mode billed one.
 *
 * A fixture that only stamps `push` on `canHandle: true` bodies cannot witness this, which is why
 * it is a design of its own rather than a case added to the one above.
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
 * **What the rates relate to each other, and deliberately not which tier is dearest.**
 *
 * A *"the seeded kitchen orders Standard, Hettich, Blum"* assertion stood here and is **deleted
 * rather than updated** (ADR 0092 Amendment C). At 16 latches the drafted push rates put Hettich
 * (11 340 MDL) above Blum (11 335), inverting the order ADR 0070's own totals table states — so
 * whichever order a test pinned would be pinning a placeholder with no supplier source, in one
 * direction or the other. Neither is asserted until the owner supplies the three real figures.
 */
describe("the tier rates relate to each other in ways the book itself decides", () => {
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

  /** **The book's own quantifier for when the order inverts, and it has three terms.** Hettich
   *  prices below Standard exactly when a design's drawer saving outweighs both its hinge surcharge
   *  and its latch surcharge. The two-term form — *"drawers > 4.81 × hinges"* — was derived at zero
   *  push mechanisms and is false in general now that the seeded kitchen carries 16: Hettich's
   *  drafted push rate sits **above** Standard's, so every latch pushes Hettich further up
   *  (ADR 0092 decision 12, Amendment C).
   *
   *  Every coefficient is read from the book and none is restated beside it, so the derivation
   *  survives the owner replacing the drafted push figures — the value 5.71 does not. */
  it("inverts only where the drawer saving outweighs the hinge and latch surcharges", () => {
    const standard = tierOf("hardware.standard");
    const hettich = tierOf("hardware.soft-close");
    const hingeSurchargeMinor = hettich.perHingeMinor - standard.perHingeMinor;
    const pushSurchargeMinor =
      hettich.perPushToOpenMinor - standard.perPushToOpenMinor;
    const drawerSavingMinor = standard.perDrawerMinor - hettich.perDrawerMinor;

    // Hettich costs more per hinge and per latch and less per drawer, which is what makes an
    // inversion possible at all. All three signs are the precondition, not the conclusion.
    expect(hingeSurchargeMinor).toBeGreaterThan(0);
    expect(pushSurchargeMinor).toBeGreaterThan(0);
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

    // **The witness survives the third term** (ADR 0092 decision 12, Amendment C): it stands at
    // `y0` 0 and records no mode, so it carries 3 drawers, 0 hinges and 0 latches and the latch
    // surcharge multiplies by nothing. The delta is the same −4 200 it was at zero push.
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
