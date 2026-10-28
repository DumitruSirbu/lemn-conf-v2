// The review lists, and totals, what the breakdown and the price bar show the customer for the same kitchen.
//
// Three sources stand on the expected side and none of them is the review: the rows written out from the JSON
// catalogues and the priced lines through no content resolver (`raw-catalogue-text.ts`), what
// `describePriceBreakdown` prints, and what `describePriceBar` prints. The order is checked on the review's own
// keys against the design's placements, so a review that reordered what it was handed is seen.
import { fc, test } from "@fast-check/vitest";
import {
  DEEP_CABINET_DEPTH_MM,
  findOverflowingPlacementIds,
  type DesignPlacement,
  type DisplayEntry,
  type PricedDesign,
  type PriceLine,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { describePriceBar } from "@/price/price-bar-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import { describeReview, type AvailableReview } from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import {
  priceAndProject,
  type PricedKitchen,
} from "../support/generated-kitchens";
import {
  fillLeaf,
  rawBodyNameOf,
  rawRoundedAmountOf,
  type RawCatalogue,
} from "../support/raw-catalogue-text";
import {
  OVERFLOW_MAKERS,
  TIER_PAIRS,
  VARIED_ARMS,
  VARIED_U_ARM,
  variedKitchensOf,
  withTiers,
  type VariedArm,
} from "../support/varied-kitchens";

const KITCHEN_FLOOR_PER_ARM = 80;
const OVERFLOWING_FLOOR_PER_ARM = 400;
const ROWS_WRITTEN_BY_HAND_FLOOR = 0.9;
const UNEQUAL_SUM_FLOOR_PER_ARM = 20;
const TWO_ROW_GROUP_FLOOR = 40;

const WALL_RANK: Readonly<Record<string, number>> = { A: 0, B: 1, C: 2 };
const BAND_RANK: Readonly<Record<string, number>> = {
  base: 0,
  wall: 1,
  column: 2,
};

const kitchensByArm = new Map<string, readonly PricedKitchen[]>();

/** Every composed kitchen of the arm as generated, then each made to overflow in each way it can. */
function kitchensOf(arm: VariedArm): readonly PricedKitchen[] {
  const cached = kitchensByArm.get(arm.name);
  if (cached !== undefined) return cached;
  const fitting = variedKitchensOf(arm);
  const overflowing = fitting.flatMap((kitchen) =>
    OVERFLOW_MAKERS.flatMap((maker) => {
      const made = maker.make(kitchen);
      return made === undefined ? [] : [priceAndProject(made.design)];
    }),
  );
  const kitchens = [...fitting, ...deepened(fitting), ...overflowing];
  kitchensByArm.set(arm.name, kitchens);
  return kitchens;
}

/** The same composed kitchens built at the deep depth and priced again, so the sweep reaches the depth line. */
function deepened(
  kitchens: readonly PricedKitchen[],
): readonly PricedKitchen[] {
  return kitchens.map(({ design }) =>
    priceAndProject({
      ...design,
      settings: { ...design.settings, cabinetDepthMm: DEEP_CABINET_DEPTH_MM },
    }),
  );
}

function pricedOf(kitchen: PricedKitchen): PricedDesign {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  return kitchen.pricing.priced;
}

const contents = new Map<string, Content>();

function contentOf(catalogue: RawCatalogue): Content {
  const cached = contents.get(catalogue.locale);
  if (cached !== undefined) return cached;
  const content = contentFor(catalogue.locale, catalogue.messages);
  contents.set(catalogue.locale, content);
  return content;
}

const reviewsByKitchen = new WeakMap<
  PricedKitchen,
  Map<string, AvailableReview>
>();

/** Described once per kitchen and locale: the sweep reads each review from several tests. */
function reviewIn(
  catalogue: RawCatalogue,
  kitchen: PricedKitchen,
): AvailableReview {
  const reviews =
    reviewsByKitchen.get(kitchen) ?? new Map<string, AvailableReview>();
  reviewsByKitchen.set(kitchen, reviews);
  const cached = reviews.get(catalogue.locale);
  if (cached !== undefined) return cached;

  const view = describeReview({
    content: contentOf(catalogue),
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a review");
  reviews.set(catalogue.locale, view);
  return view;
}

const RAW_CATALOGUES: readonly RawCatalogue[] = CATALOGUES.map(
  ([locale, messages]) => ({ locale, messages }),
);

function firstOf<T>(items: readonly T[], what: string): T {
  const [first] = items;
  if (first === undefined) throw new Error(`no ${what}`);
  return first;
}

/** Where a claim is about order or arithmetic and not about wording, one language is enough. */
const ROMANIAN = firstOf(RAW_CATALOGUES, "catalogue");

function rawAmountOf(catalogue: RawCatalogue, line: PriceLine): string {
  if (line.kind === "cabinet" && line.suppliedBy === "customer") {
    return fillLeaf(catalogue, "priceBreakdown.notIncluded");
  }
  if (line.amountMinor === 0)
    return fillLeaf(catalogue, "priceBreakdown.included");
  return rawRoundedAmountOf(line.amountMinor);
}

function cabinetLineOf(priced: PricedDesign, placementId: string): PriceLine {
  const lines = priced.lines.filter(
    (line) => line.kind === "cabinet" && line.placementId === placementId,
  );
  const [line] = lines;
  if (line === undefined || lines.length !== 1) {
    throw new Error(`${placementId} is priced ${String(lines.length)} times`);
  }
  return line;
}

/** `undefined` where the body's name is one the raw reader does not write on its own. */
function rawRowLabelOf(
  catalogue: RawCatalogue,
  entry: DisplayEntry,
): string | undefined {
  const bodyLabel = rawBodyNameOf(catalogue, entry.label);
  if (bodyLabel === undefined) return undefined;
  return fillLeaf(catalogue, "priceBreakdown.placementLabel", {
    bodyLabel,
    widthMm: entry.widthMm,
  });
}

interface PrintedRow {
  readonly key: string;
  readonly label: string | undefined;
  readonly amountText: string;
}

interface PrintedGroup {
  readonly key: string;
  readonly heading: string;
  readonly rows: readonly PrintedRow[];
}

function rawGroupsOf(
  catalogue: RawCatalogue,
  kitchen: PricedKitchen,
): readonly PrintedGroup[] {
  return kitchen.groups.map((group) => ({
    key: `${group.wall}-${group.band}`,
    heading: fillLeaf(catalogue, "priceBreakdown.groupHeading", {
      wall: group.wall,
      bandWord: fillLeaf(
        catalogue,
        `priceBreakdown.bandHeadings.${group.band}`,
      ),
    }),
    rows: group.entries.map((entry) => ({
      key: entry.placementId,
      label: rawRowLabelOf(catalogue, entry),
      amountText: rawAmountOf(
        catalogue,
        cabinetLineOf(pricedOf(kitchen), entry.placementId),
      ),
    })),
  }));
}

/** The review's groups with a label blanked wherever the raw side left it unwritten, so the two compare whole. */
function printedAgainst(
  expected: readonly PrintedGroup[],
  review: AvailableReview,
): readonly PrintedGroup[] {
  return review.groups.map((group, groupIndex) => ({
    key: group.key,
    heading: group.heading,
    rows: group.rows.map((row, rowIndex) => ({
      key: row.key,
      label:
        expected[groupIndex]?.rows[rowIndex]?.label === undefined
          ? undefined
          : row.label,
      amountText: row.amountText,
    })),
  }));
}

function rawWholeKitchenRowsOf(
  catalogue: RawCatalogue,
  priced: PricedDesign,
): readonly PrintedRow[] {
  return priced.lines.flatMap((line) => {
    // The depth line is not a whole-kitchen row: the breakdown publishes it as the row of its own, `depthRow`, and the
    // review does not carry it yet (see "the depth line at 700 mm" below). It is skipped here by name so that a new
    // line kind with no word still fails this sweep, which a blanket `kind !== "cabinet"` would not.
    if (line.kind === "depth") return [];
    if (line.kind === "cabinet") return [];
    const tierName =
      line.nameKey === undefined
        ? line.name
        : fillLeaf(catalogue, line.nameKey);
    return [
      {
        key: line.lineId,
        label: fillLeaf(catalogue, "priceBreakdown.wholeKitchenLabel", {
          categoryWord: fillLeaf(
            catalogue,
            `priceBreakdown.wholeKitchenCategories.${line.kind}`,
          ),
          tierName,
        }),
        amountText: rawAmountOf(catalogue, line),
      },
    ];
  });
}

function rawFigureOf(catalogue: RawCatalogue, totalMinor: number) {
  return {
    label: fillLeaf(catalogue, "price.startingPrefix"),
    amountText: fillLeaf(catalogue, "price.amountWithCurrency", {
      amount: rawRoundedAmountOf(totalMinor),
    }),
  };
}

function placementOf(kitchen: PricedKitchen, id: string): DesignPlacement {
  const placement = kitchen.design.placements.find(
    (candidate) => candidate.id === id,
  );
  if (placement === undefined) throw new Error(`no placement ${id}`);
  return placement;
}

function rankOfGroupKey(key: string): number {
  const [wall = "", band = ""] = key.split("-");
  const wallRank = WALL_RANK[wall];
  const bandRank = BAND_RANK[band];
  if (wallRank === undefined || bandRank === undefined) {
    throw new Error(`${key} names no wall and band`);
  }
  return wallRank * 10 + bandRank;
}

function isStrictlyAscending(values: readonly number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value > (values[index - 1] ?? value),
  );
}

/** Lower row first, and along the wall within a row; never the reverse. */
function readsRowMajor(placements: readonly DesignPlacement[]): boolean {
  return placements.every((placement, index) => {
    const previous = placements[index - 1];
    if (previous === undefined) return true;
    return (
      placement.y0Mm > previous.y0Mm ||
      (placement.y0Mm === previous.y0Mm &&
        placement.alongMm >= previous.alongMm)
    );
  });
}

describe.each(VARIED_ARMS)("over varied $name kitchens", (arm) => {
  const fitting = variedKitchensOf(arm);
  const kitchens = kitchensOf(arm);

  it("sweeps enough kitchens, fitting and overflowing, under every tier pair the book offers", () => {
    const tierPairs = new Set(
      fitting.map(
        ({ design }) =>
          `${design.settings?.materialTierId ?? ""}/${design.settings?.hardwareTierId ?? ""}`,
      ),
    );

    expect(fitting.length).toBeGreaterThanOrEqual(KITCHEN_FLOOR_PER_ARM);
    expect(kitchens.length - fitting.length).toBeGreaterThanOrEqual(
      OVERFLOWING_FLOOR_PER_ARM,
    );
    expect(tierPairs.size).toBe(TIER_PAIRS.length);
  });

  it("sweeps bodies the customer supplies and full-height columns, not only priced base and hanging rows", () => {
    const withCustomerSupplied = fitting.filter((kitchen) =>
      pricedOf(kitchen).lines.some(
        (line) => line.kind === "cabinet" && line.suppliedBy === "customer",
      ),
    );
    const withColumns = fitting.filter((kitchen) =>
      kitchen.groups.some((group) => group.band === "column"),
    );

    expect(withCustomerSupplied.length).toBeGreaterThanOrEqual(
      KITCHEN_FLOOR_PER_ARM,
    );
    expect(withColumns.length).toBeGreaterThanOrEqual(
      KITCHEN_FLOOR_PER_ARM / 2,
    );
  });

  describe.each(RAW_CATALOGUES)("in $locale", (catalogue) => {
    it("prints the groups, headings, row labels and amounts the catalogue files and priced lines spell out", () => {
      let rows = 0;
      let rowsWrittenByHand = 0;
      for (const kitchen of kitchens) {
        const expected = rawGroupsOf(catalogue, kitchen);
        const review = reviewIn(catalogue, kitchen);

        expect(printedAgainst(expected, review)).toEqual(expected);
        expect(review.wholeKitchenRows).toEqual(
          rawWholeKitchenRowsOf(catalogue, pricedOf(kitchen)),
        );
        const labels = expected.flatMap((group) =>
          group.rows.map((row) => row.label),
        );
        rows += labels.length;
        rowsWrittenByHand += labels.filter(
          (label) => label !== undefined,
        ).length;
      }

      expect(rowsWrittenByHand / rows).toBeGreaterThanOrEqual(
        ROWS_WRITTEN_BY_HAND_FLOOR,
      );
    });

    it("prints group for group and row for row what the breakdown prints", () => {
      for (const kitchen of kitchens) {
        const review = reviewIn(catalogue, kitchen);
        const breakdown = describePriceBreakdown({
          content: contentOf(catalogue),
          pricing: kitchen.pricing,
          groups: kitchen.groups,
        });
        if (breakdown.kind !== "available")
          throw new Error("expected a breakdown");

        expect(review.groups).toEqual(breakdown.groups);
        expect(review.wholeKitchenRows).toEqual(breakdown.wholeKitchenRows);
      }
    });

    it("shows the figure the price bar and the breakdown show, the catalogue's own words around the rounded total", () => {
      for (const kitchen of kitchens) {
        const content = contentOf(catalogue);
        const review = reviewIn(catalogue, kitchen);
        const bar = describePriceBar({ content, pricing: kitchen.pricing });
        const breakdown = describePriceBreakdown({
          content,
          pricing: kitchen.pricing,
          groups: kitchen.groups,
        });
        if (bar.kind !== "priced" || breakdown.kind !== "available") {
          throw new Error("expected a priced bar and a breakdown");
        }

        expect(review.figure).toEqual(
          rawFigureOf(catalogue, pricedOf(kitchen).totalMinor),
        );
        expect(review.figure).toEqual(bar.figure);
        expect(review.figure).toEqual(breakdown.figure);
      }
    });

    it("carries the past-the-wall warning exactly when the price bar does, and when a body is past its wall", () => {
      for (const kitchen of kitchens) {
        const review = reviewIn(catalogue, kitchen);
        const bar = describePriceBar({
          content: contentOf(catalogue),
          pricing: kitchen.pricing,
        });
        if (bar.kind !== "priced") throw new Error("expected a priced bar");
        const isPastAWall =
          findOverflowingPlacementIds(kitchen.design).length > 0;

        expect(review.overflowWarning).toBe(bar.overflowWarning);
        expect(review.overflowWarning !== undefined).toBe(isPastAWall);
        if (isPastAWall) {
          expect(review.overflowWarning).toBe(
            fillLeaf(catalogue, "price.overflowingTotalWarning"),
          );
        }
      }
    });
  });

  describe("the depth line at 700 mm (M10 P3 and Q1b: the breakdown and the review both carry it)", () => {
    const deepKitchens = deepened(fitting);
    const withADepthLine = deepKitchens.filter((kitchen) =>
      pricedOf(kitchen).lines.some((line) => line.kind === "depth"),
    );

    it("sweeps enough kitchens that earn a depth line, and none at the default depth", () => {
      expect(withADepthLine.length).toBeGreaterThanOrEqual(
        KITCHEN_FLOOR_PER_ARM / 2,
      );
      for (const kitchen of fitting) {
        expect(
          pricedOf(kitchen).lines.some((line) => line.kind === "depth"),
        ).toBe(false);
      }
    });

    it("prints the depth line in the breakdown as a row of its own, at the amount the line carries, and nowhere in the whole-kitchen rows", () => {
      for (const kitchen of deepKitchens) {
        const line = pricedOf(kitchen).lines.find(
          (candidate) => candidate.kind === "depth",
        );
        const breakdown = describePriceBreakdown({
          content: contentOf(ROMANIAN),
          pricing: kitchen.pricing,
          groups: kitchen.groups,
        });
        if (breakdown.kind !== "available")
          throw new Error("expected a breakdown");

        if (line === undefined) {
          expect(breakdown.depthRow).toBeUndefined();
          continue;
        }
        expect(breakdown.depthRow).toEqual({
          key: line.lineId,
          depthMm: DEEP_CABINET_DEPTH_MM,
          amountText:
            line.amountMinor === 0
              ? fillLeaf(ROMANIAN, "priceBreakdown.included")
              : rawRoundedAmountOf(line.amountMinor),
        });
        expect(breakdown.wholeKitchenRows.map((row) => row.key)).not.toContain(
          line.lineId,
        );
      }
    });

    it("leaves no line the total counts unshown in the breakdown: every priced line is a row or the depth row", () => {
      for (const kitchen of deepKitchens) {
        const breakdown = describePriceBreakdown({
          content: contentOf(ROMANIAN),
          pricing: kitchen.pricing,
          groups: kitchen.groups,
        });
        if (breakdown.kind !== "available")
          throw new Error("expected a breakdown");
        const shown = new Set([
          ...breakdown.groups.flatMap((group) =>
            group.rows.map((row) => row.key),
          ),
          ...breakdown.wholeKitchenRows.map((row) => row.key),
          ...(breakdown.depthRow === undefined ? [] : [breakdown.depthRow.key]),
        ]);
        const unshown = pricedOf(kitchen)
          .lines.map((line) =>
            line.kind === "cabinet" ? line.placementId : line.lineId,
          )
          .filter((key) => !shown.has(key));

        expect(unshown).toEqual([]);
      }
    });

    it("carries the depth row the breakdown carries, verbatim, on every kitchen that earns the line and on none that does not", () => {
      for (const kitchen of deepKitchens) {
        const review = reviewIn(ROMANIAN, kitchen);
        const breakdown = describePriceBreakdown({
          content: contentOf(ROMANIAN),
          pricing: kitchen.pricing,
          groups: kitchen.groups,
        });
        if (breakdown.kind !== "available")
          throw new Error("expected a breakdown");

        expect(review.depthRow).toEqual(breakdown.depthRow);
        expect(review.groups).toEqual(breakdown.groups);
        expect(review.wholeKitchenRows).toEqual(breakdown.wholeKitchenRows);
      }
      for (const kitchen of fitting) {
        expect(reviewIn(ROMANIAN, kitchen)).not.toHaveProperty("depthRow");
      }
    });

    it("leaves no line the figure counts unlisted in the review: every priced line is a body row, a whole-kitchen row or the depth row", () => {
      for (const kitchen of deepKitchens) {
        const review = reviewIn(ROMANIAN, kitchen);
        const listed = new Set([
          ...review.groups.flatMap((group) => group.rows.map((row) => row.key)),
          ...review.wholeKitchenRows.map((row) => row.key),
          ...(review.depthRow === undefined ? [] : [review.depthRow.key]),
        ]);
        const unlisted = pricedOf(kitchen)
          .lines.map((line) =>
            line.kind === "cabinet" ? line.placementId : line.lineId,
          )
          .filter((key) => !listed.has(key));

        expect(unlisted).toEqual([]);
      }
    });
  });

  it("reads wall A, then B, then C, and base, hanging, column within a wall, each pair once", () => {
    for (const kitchen of kitchens) {
      const catalogue = ROMANIAN;
      const ranks = reviewIn(catalogue, kitchen).groups.map((group) =>
        rankOfGroupKey(group.key),
      );

      expect(isStrictlyAscending(ranks)).toBe(true);
    }
  });

  it("lists under a wall only bodies standing on it, every body once, and no wall without a body", () => {
    for (const kitchen of kitchens) {
      const catalogue = ROMANIAN;
      const { groups } = reviewIn(catalogue, kitchen);
      const listedIds = groups.flatMap((group) =>
        group.rows.map((row) => row.key),
      );

      for (const group of groups) {
        expect(group.rows.length).toBeGreaterThan(0);
        for (const row of group.rows) {
          expect(
            group.key.startsWith(`${placementOf(kitchen, row.key).wall}-`),
          ).toBe(true);
        }
      }
      expect([...listedIds].sort()).toEqual(
        kitchen.design.placements.map(({ id }) => id).sort(),
      );
      expect(new Set(groups.map((group) => group.key.charAt(0)))).toEqual(
        new Set(kitchen.design.placements.map(({ wall }) => wall)),
      );
    }
  });

  it("lists a group's lower row left to right before its upper row", () => {
    let groupsOfTwoRows = 0;
    for (const kitchen of kitchens) {
      const catalogue = ROMANIAN;
      for (const group of reviewIn(catalogue, kitchen).groups) {
        const placements = group.rows.map((row) =>
          placementOf(kitchen, row.key),
        );

        expect(readsRowMajor(placements)).toBe(true);
        if (new Set(placements.map(({ y0Mm }) => y0Mm)).size > 1) {
          groupsOfTwoRows += 1;
        }
      }
    }

    expect(groupsOfTwoRows).toBeGreaterThanOrEqual(
      arm.walls.length > 1 ? TWO_ROW_GROUP_FLOOR : 0,
    );
  });

  it("totals the priced design, where a sum of the rounded rows would print another figure", () => {
    const catalogue = ROMANIAN;
    const whereTheSumDiffers = fitting.filter((kitchen) => {
      const priced = pricedOf(kitchen);
      const summedRows = priced.lines.reduce(
        (sum, line) => sum + Math.ceil(line.amountMinor / 100_000) * 100_000,
        0,
      );
      return (
        rawRoundedAmountOf(summedRows) !== rawRoundedAmountOf(priced.totalMinor)
      );
    });

    expect(whereTheSumDiffers.length).toBeGreaterThanOrEqual(
      UNEQUAL_SUM_FLOOR_PER_ARM,
    );
    for (const kitchen of whereTheSumDiffers) {
      expect(reviewIn(catalogue, kitchen).figure).toEqual(
        rawFigureOf(catalogue, pricedOf(kitchen).totalMinor),
      );
    }
  });

  it("re-prices one kitchen under each tier pair, the figure following the price bar each time", () => {
    const [catalogue] = RAW_CATALOGUES;
    const [kitchen] = fitting;
    if (catalogue === undefined || kitchen === undefined) {
      throw new Error("no kitchen to re-price");
    }
    const content = contentOf(catalogue);
    const figures = TIER_PAIRS.map((tiers) => {
      const repriced = priceAndProject(withTiers(kitchen.design, tiers));
      const bar = describePriceBar({ content, pricing: repriced.pricing });
      if (bar.kind !== "priced") throw new Error("expected a priced bar");

      expect(reviewIn(catalogue, repriced).figure).toEqual(bar.figure);
      return bar.figure.amountText;
    });

    expect(new Set(figures).size).toBeGreaterThan(1);
  });
});

describe("over varied U kitchens, wall C", () => {
  it("is listed, with a body under it, in every one", () => {
    const catalogue = ROMANIAN;
    const kitchens = kitchensOf(VARIED_U_ARM);

    expect(kitchens.length).toBeGreaterThanOrEqual(KITCHEN_FLOOR_PER_ARM);
    for (const kitchen of kitchens) {
      const wallC = reviewIn(catalogue, kitchen).groups.filter((group) =>
        group.key.startsWith("C-"),
      );

      expect(wallC.length).toBeGreaterThanOrEqual(1);
      expect(wallC.every((group) => group.rows.length > 0)).toBe(true);
    }
  });
});

describe("a row's label when the projection and the priced line disagree about a body", () => {
  const kitchen = firstOf(variedKitchensOf(VARIED_U_ARM), "U kitchen");
  const DISAGREEING_WIDTH_MM = 1234;

  function firstRowLabelOf(changed: PricedKitchen): string {
    const label = reviewIn(ROMANIAN, changed).groups[0]?.rows[0]?.label;
    if (label === undefined) throw new Error("the review lists no row");
    return label;
  }

  it("follows the projection's width", () => {
    const changed: PricedKitchen = {
      ...kitchen,
      groups: kitchen.groups.map((group, groupIndex) => ({
        ...group,
        entries: group.entries.map((entry, entryIndex) =>
          groupIndex === 0 && entryIndex === 0
            ? { ...entry, widthMm: DISAGREEING_WIDTH_MM }
            : entry,
        ),
      })),
    };

    expect(firstRowLabelOf(changed)).toContain(String(DISAGREEING_WIDTH_MM));
  });

  it("ignores the priced line's width", () => {
    const priced = pricedOf(kitchen);
    const changed: PricedKitchen = {
      ...kitchen,
      pricing: {
        ok: true,
        priced: {
          ...priced,
          lines: priced.lines.map((line) =>
            line.kind === "cabinet"
              ? { ...line, widthMm: DISAGREEING_WIDTH_MM }
              : line,
          ),
        },
      },
    };

    expect(firstRowLabelOf(changed)).toBe(firstRowLabelOf(kitchen));
  });
});

describe("the figure at a rounding boundary", () => {
  const [kitchen] = variedKitchensOf(VARIED_U_ARM);
  if (kitchen === undefined) throw new Error("no U kitchen");
  const THOUSAND_MDL_IN_MINOR = 100_000;

  const totalsAroundAThousand = fc
    .tuple(
      fc.integer({ min: 1, max: 4000 }),
      fc.constantFrom(-1, 0, 1, 99_999, 50_000),
    )
    .map(([thousands, offset]) => thousands * THOUSAND_MDL_IN_MINOR + offset);

  test.prop([totalsAroundAThousand, fc.constantFrom(...RAW_CATALOGUES)], {
    numRuns: 400,
    seed: 8_031_977,
  })(
    "is the price bar's, rounded up to the thousand and never down",
    (totalMinor, catalogue) => {
      const repriced: PricedKitchen = {
        ...kitchen,
        pricing: { ok: true, priced: { ...pricedOf(kitchen), totalMinor } },
      };
      const bar = describePriceBar({
        content: contentOf(catalogue),
        pricing: repriced.pricing,
      });
      if (bar.kind !== "priced") throw new Error("expected a priced bar");
      const { figure } = reviewIn(catalogue, repriced);
      const shownMdl = Number(figure.amountText.replace(/\D/g, ""));

      expect(figure).toEqual(bar.figure);
      expect(figure).toEqual(rawFigureOf(catalogue, totalMinor));
      expect(shownMdl * 100).toBeGreaterThanOrEqual(totalMinor);
      expect(shownMdl * 100 - totalMinor).toBeLessThan(THOUSAND_MDL_IN_MINOR);
    },
  );

  it.each([
    [8_600_000, "86 000"],
    [8_600_001, "87 000"],
    [8_599_999, "86 000"],
    [100_000_000, "1 000 000"],
    [1, "1 000"],
  ])("prints %i minor units as %s", (totalMinor, amount) => {
    const catalogue = ROMANIAN;
    const repriced: PricedKitchen = {
      ...kitchen,
      pricing: { ok: true, priced: { ...pricedOf(kitchen), totalMinor } },
    };

    expect(reviewIn(catalogue, repriced).figure.amountText).toBe(
      `${amount} MDL`,
    );
  });
});
