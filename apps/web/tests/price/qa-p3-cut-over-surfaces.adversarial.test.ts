// Adversarial QA for wave P3 on the web side: the one measured deepening set reaches every price surface, the surfaces
// agree to the figure at both depths, a design the cut-over book cannot price leaves the settings sheet whole, and two
// gaps the cut-over leaves are named where they are (the breakdown sheet and the review do not print the depth line).
//
// `cut-over-surfaces.test.ts` holds each surface against a second evaluation of the domain query. This file adds what
// that cannot see: a surface that measured the set a different way would still agree with its own second evaluation, so
// the composition itself is read from source; and a surface that priced alone would pass its own check while
// disagreeing with the rest, so the figures are compared across surfaces.
import { listedDepthLineOf } from "../support/listed-depth-line";
import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  snapshotSubmission,
  type Design,
  type PricedDesign,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { seedFakePriceStores } from "@/lib/server/price-book-test-seed";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import { describePriceBar } from "@/price/price-bar-model";
import {
  offerTiersAgainstBook,
  priceAgainstBook,
  priceFloorOf,
  type ActivePriceBook,
} from "@/price/price-book-root";
import { shippedDeepeningRows } from "@/price/deepening-rows";
import { describeStartingPrice } from "@/price/starting-price";
import { describeReview } from "@/review/review-model";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";

import {
  readSource,
  sourceFilesMatching,
} from "../lib/server/server-source-support";
import roMessages from "../../src/messages/ro.json";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { ro } from "../support/romanian-content";
import {
  VARIED_ARMS,
  variedKitchensOf,
  withTiers,
  TIER_PAIRS,
} from "../support/varied-kitchens";

/** The first word of the ruled depth line ("{word} 700 mm · adaos …"), read from the message file and not typed
 *  here. */
const DEPTH_LINE_WORD = roMessages.priceBreakdown.depthLine.split(" ")[0] ?? "";

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

async function readRoot(): Promise<ActivePriceBook> {
  const root = await readActivePriceBook(await seedFakePriceStores());
  if (root.kind !== "active") throw new Error("the seeded book was not read");
  return root;
}

function atDepth(design: Design, depthMm: number): Design {
  return {
    ...design,
    settings: { ...design.settings, cabinetDepthMm: depthMm },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 1. One composition: the set is measured in one module and every caller passes that module's answer.
// ---------------------------------------------------------------------------------------------------------------

describe("the deepening set has one measurement and one hand-over, read from source", () => {
  const SRC_FILES_NAMING_DEEPENING = sourceFilesMatching(
    /deepeningRows|measureDeepeningRows/,
  );

  it("is measured in one module of the application, and only there", () => {
    const measuring = sourceFilesMatching(/measureDeepeningRows\s*\(/).filter(
      (path) =>
        /measureDeepeningRows\s*\(/.test(withoutComments(readSource(path))),
    );

    expect(measuring).toEqual(["price/deepening-rows.ts"]);
  });

  it("is handed to the query by `shippedDeepeningRows()` or passed through a request, and never built in place", () => {
    const handedOver: string[] = [];
    for (const path of SRC_FILES_NAMING_DEEPENING) {
      const code = withoutComments(readSource(path));
      for (const match of code.matchAll(/deepeningRows\s*:\s*([^,}\n]+)/g)) {
        handedOver.push(`${path}: ${(match[1] ?? "").trim()}`);
      }
    }

    expect(handedOver.length).toBeGreaterThanOrEqual(4);
    for (const entry of handedOver) {
      expect(
        /: (?:shippedDeepeningRows\(\)|request\.deepeningRows|ReadonlySet<string>;?)$/.test(
          entry,
        ) || entry.endsWith("ReadonlySet<string>"),
        entry,
      ).toBe(true);
    }
  });

  it("is not forgotten by a module that prices: every caller of the query or the snapshot names the set", () => {
    const callers = sourceFilesMatching(
      /\b(?:priceDesign|snapshotSubmission)\s*\(/,
    ).filter((path) =>
      /\b(?:priceDesign|snapshotSubmission)\s*\(/.test(
        withoutComments(readSource(path)),
      ),
    );

    expect(callers.sort()).toEqual([
      "lib/server/contact/prepare-submission.ts",
      "price/price-book-root.ts",
      "price/whole-kitchen-tiers.ts",
    ]);
    for (const path of callers) {
      expect(withoutComments(readSource(path)), path).toMatch(/deepeningRows/);
    }
  });

  it("is measured once and kept, so no surface can see a different set from another's", () => {
    expect(shippedDeepeningRows()).toBe(shippedDeepeningRows());
    expect([...shippedDeepeningRows()].sort()).toEqual(
      [...MEASURED_DEEPENING_ROWS].sort(),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Every surface answers one figure, at both depths, for varied kitchens under every tier pair.
// ---------------------------------------------------------------------------------------------------------------

describe("every surface names one total for one kitchen, at both depths", () => {
  const SAMPLED = VARIED_ARMS.flatMap((arm) =>
    variedKitchensOf(arm).slice(0, 6),
  );

  it("sweeps kitchens of every room shape, so the agreement is not one kitchen's", () => {
    expect(
      new Set(SAMPLED.map(({ design }) => design.room.shape)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(SAMPLED.length).toBeGreaterThanOrEqual(18);
  });

  it.each([DEFAULT_CABINET_DEPTH_MM, DEEP_CABINET_DEPTH_MM])(
    "at %i mm the bar, the breakdown, the review, the account card and the staff view, the settings baseline and the contact snapshot print one total",
    async (depthMm) => {
      const root = await readRoot();
      let kitchensWithADepthLine = 0;

      for (const [index, { design: composed }] of SAMPLED.entries()) {
        const tiers = TIER_PAIRS[index % TIER_PAIRS.length];
        if (tiers === undefined) throw new Error("no tier pair");
        const design = atDepth(withTiers(composed, tiers), depthMm);
        const catalog = buildKitchenLBodyCatalog(depthMm);
        const groups = projectDesignForDisplay(design, catalog);
        const pricing: PricingResult = priceAgainstBook(root, design, catalog);
        if (!pricing.ok)
          throw new Error(`${pricing.failure.code}: ${pricing.failure.detail}`);
        const { totalMinor } = pricing.priced;
        const label = `${String(index)} ${design.room.shape} at ${String(depthMm)}`;

        const bar = describePriceBar({ content: ro, pricing });
        const breakdown = describePriceBreakdown({
          content: ro,
          pricing,
          groups,
        });
        const review = describeReview({ content: ro, design, pricing, groups });
        if (
          bar.kind !== "priced" ||
          breakdown.kind !== "available" ||
          review.kind !== "available"
        ) {
          throw new Error(`${label}: a surface had no price`);
        }
        const figure = describeStartingPrice({ totalMinor, copy: ro.price });
        const snapshot = snapshotSubmission({
          design,
          catalog,
          book: root.book,
          pricingVersion: root.book.version,
          deepeningRows: MEASURED_DEEPENING_ROWS,
        });

        expect(bar.figure.amountText, label).toBe(figure.amountText);
        expect(breakdown.figure.amountText, label).toBe(figure.amountText);
        expect(review.figure.amountText, label).toBe(figure.amountText);
        expect(
          priceFloorOf(root, design)?.totalMinor,
          `${label} account and staff`,
        ).toBe(totalMinor);
        expect(
          offerTiersAgainstBook(root, design, catalog).material.tierIds,
          label,
        ).toEqual(root.book.material.tiers.map((tier) => tier.tierId));
        if (snapshot.ok)
          expect(snapshot.snapshot.priced.totalMinor, `${label} snapshot`).toBe(
            totalMinor,
          );
        else expect(snapshot.refusal.code, label).toBe("BODIES_PAST_WALL");

        const hasADepthLine = pricing.priced.lines.some(
          (line) => line.kind === "depth",
        );
        expect(hasADepthLine, label).toBe(
          depthMm === DEEP_CABINET_DEPTH_MM &&
            hasAManufacturerDeepener(pricing),
        );
        if (hasADepthLine) kitchensWithADepthLine += 1;
      }

      expect(kitchensWithADepthLine > 0).toBe(
        depthMm === DEEP_CABINET_DEPTH_MM,
      );
    },
  );

  function hasAManufacturerDeepener(pricing: PricingResult): boolean {
    if (!pricing.ok) return false;
    return pricing.priced.lines.some(
      (line) =>
        line.kind === "cabinet" &&
        line.suppliedBy === "manufacturer" &&
        MEASURED_DEEPENING_ROWS.has(line.pricedAsBuildId),
    );
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 3. A design the cut-over book cannot price leaves the settings sheet whole (P3-d), and a width no listed size reaches
//    is such a design.
// ---------------------------------------------------------------------------------------------------------------

describe("P3-d: a refused price takes the numbers off the sheet and never the choice", () => {
  /** The seeded kitchen with its hob-and-two-drawers base made wider than the one size that row is made in. */
  function withAnOverWideHob(): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.body.buildId === "base-hob-2drawer-600"
          ? { ...placement, body: { ...placement.body, widthMm: 700 } }
          : placement,
      ),
    };
  }

  it("refuses the over-wide fixed-size body with NO_PRICE_FOR_SIZE, naming the placement, and prices no kitchen", async () => {
    const root = await readRoot();
    const design = withAnOverWideHob();

    const pricing = priceAgainstBook(
      root,
      design,
      buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    );

    expect(pricing.ok).toBe(false);
    if (pricing.ok) return;
    expect(pricing.failure.code).toBe("NO_PRICE_FOR_SIZE");
    expect(pricing.failure.placementId).toBeDefined();
    expect(pricing).not.toHaveProperty("priced");
  });

  it("shows no bar figure and no breakdown for it, and a review that cannot be sent", async () => {
    const root = await readRoot();
    const design = withAnOverWideHob();
    const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
    const pricing = priceAgainstBook(root, design, catalog);
    const groups = projectDesignForDisplay(design, catalog);

    expect(describePriceBar({ content: ro, pricing }).kind).not.toBe("priced");
    expect(
      describePriceBreakdown({
        content: ro,
        pricing,
        groups,
      }).kind,
    ).toBe("unavailable");
    expect(
      describeReview({ content: ro, design, pricing, groups }),
    ).toMatchObject({
      kind: "unavailable",
      submit: { kind: "refused", code: "PRICING_FAILED" },
    });
  });

  it("still offers every tier of both groups, with no amount on any, so the customer can still choose", async () => {
    const root = await readRoot();
    const design = withAnOverWideHob();
    const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);

    const offer = offerTiersAgainstBook(root, design, catalog);

    expect(offer.material.tierIds).toEqual(
      root.book.material.tiers.map((tier) => tier.tierId),
    );
    expect(offer.hardware.tierIds).toEqual(
      root.book.hardware.tiers.map((tier) => tier.tierId),
    );
    for (const group of [offer.material, offer.hardware]) {
      for (const tier of group.tiers)
        expect(tier.deltaMinor, tier.tierId).toBeUndefined();
    }
  });

  it("renders every tier's name on the sheet it describes for that design", async () => {
    const root = await readRoot();
    const design = withAnOverWideHob();
    const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
    const view: GlobalSettingsView = describeGlobalSettings({
      deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
      content: ro,
      pricing: priceAgainstBook(root, design, catalog),
      offer: offerTiersAgainstBook(root, design, catalog),
      groups: projectDesignForDisplay(design, catalog),
      applied: design.settings ?? {},
      pending: design.settings ?? {},
      chosenColourCount: 0,
    });

    for (const group of view.groups) {
      expect(group.options.length).toBeGreaterThan(0);
      for (const option of group.options)
        expect(option.deltaText, option.tierId).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. The depth line is priced, totalled and printed by the breakdown sheet (Q1); the review's half is Q1b's.
// ---------------------------------------------------------------------------------------------------------------

describe("the depth line at 700 mm: what the screens print of a line the total counts", () => {
  async function breakdownAtDepth() {
    const root = await readRoot();
    const design = atDepth(KITCHEN_L_DESIGN, DEEP_CABINET_DEPTH_MM);
    const catalog = buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM);
    const pricing = priceAgainstBook(root, design, catalog);
    const view = describePriceBreakdown({
      content: ro,
      pricing,
      groups: projectDesignForDisplay(design, catalog),
    });
    if (view.kind !== "available" || !pricing.ok)
      throw new Error("no breakdown");
    return { view, pricing };
  }

  it("is a row of the breakdown model, which is the part that exists", async () => {
    const { view, pricing } = await breakdownAtDepth();
    const line = pricing.priced.lines.find(
      (candidate) => candidate.kind === "depth",
    );

    expect(line).toBeDefined();
    expect(listedDepthLineOf(view)?.key).toBe(line?.lineId);
  });

  // The gap P3 named is closed by Q1: the sheet prints the model's depth line, so its rows account for the figure.
  it("the breakdown sheet prints the depth line the figure counts, with the priced line's own amount", async () => {
    const { view } = await breakdownAtDepth();

    const markup = renderToStaticMarkup(
      createElement(PriceBreakdownSurface, {
        id: "breakdown",
        view,
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain(`${String(DEEP_CABINET_DEPTH_MM)} mm`);
    expect(markup).toContain(listedDepthLineOf(view)?.amountText ?? "never");
    expect(markup).toContain(DEPTH_LINE_WORD);
  });

  it("prints every other row beside it", async () => {
    const { view } = await breakdownAtDepth();

    const markup = renderToStaticMarkup(
      createElement(PriceBreakdownSurface, {
        id: "breakdown",
        view,
        onClose: () => undefined,
      }),
    );

    for (const row of view.wholeKitchenRows)
      expect(markup).toContain(row.label);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. P3-c: a snapshot stored before the cut-over is read, and shown, as stored.
// ---------------------------------------------------------------------------------------------------------------

describe("P3-c: a stored pre-cut-over snapshot reaches the review as written, never recomputed", () => {
  // Written as JSON so nothing here can type it into today's shape: a flat material line, a hardware line that is not a
  // whole ten lei, and a total that is the retired book's exact sum. The design is the one body it priced.
  const STORED = `{
    "currency": "MDL", "pricingVersion": "sample-2026-09", "status": "estimate", "amountsProvisional": true,
    "lines": [
      { "lineId": "placement:p0:cabinet", "kind": "cabinet", "ruleId": "cabinet.base-sink", "placementId": "p0",
        "buildId": "base-sink-800", "pricedAsBuildId": "base-sink", "label": "base-sink", "widthMm": 800,
        "suppliedBy": "manufacturer", "quantity": 1, "unitAmountMinor": 485600, "amountMinor": 485600 },
      { "lineId": "kitchen:hardware", "kind": "hardware", "ruleId": "hardware.standard", "tierId": "hardware.standard",
        "name": "Standard", "description": "d", "quantity": 1, "unitAmountMinor": 1760, "amountMinor": 1760 },
      { "lineId": "kitchen:material", "kind": "material", "ruleId": "material.painted-mdf", "tierId": "material.painted-mdf",
        "name": "MDF", "description": "d", "quantity": 1, "unitAmountMinor": 900000, "amountMinor": 900000 }
    ],
    "totalMinor": 1387360, "overflowingPlacementIds": [], "totalIsFlagged": false
  }`;

  const design: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.id === "p0",
    ),
  };

  it("shows the stored total and every stored line as they were written, with no depth row and no rounding of its own", () => {
    const stored = JSON.parse(STORED) as PricedDesign;
    const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
    const groups = projectDesignForDisplay(design, catalog);

    const review = describeReview({
      content: ro,
      design,
      pricing: { ok: true, priced: stored },
      groups,
    });

    expect(review.kind).toBe("available");
    if (review.kind !== "available") return;
    expect(review.figure).toEqual(
      describeStartingPrice({ totalMinor: stored.totalMinor, copy: ro.price }),
    );
    expect(review).not.toHaveProperty("depthLine");
    expect(JSON.stringify(stored)).toBe(JSON.stringify(JSON.parse(STORED)));
    expect(review.wholeKitchenRows.map((row) => row.key)).toEqual([
      "kitchen:hardware",
      "kitchen:material",
    ]);
  });
});
