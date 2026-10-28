// Adversarial QA for Q1b on the review model. At 700 mm, under any percentage a book may state (0 to the cap) and any room
// the generator composes, the review lists the depth line the total counts: the breakdown's key and amount, worded by the
// percent the priced line carries (never a book's), directly after the material row, and every line the total counts is
// listed exactly once, so the listed amounts are the priced ones and add to the total (A-1).
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  DEEP_CABINET_DEPTH_MM,
  generateKitchen,
  MAX_DEEP_CABINET_PERCENT,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import {
  describeReview,
  listWholeKitchenRows,
  type AvailableReview,
} from "@/review/review-model";

import { CATALOGUES, contentFor } from "../support/catalogues";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  builtDeep,
  depthLineOf,
  pricedKitchenAtPercent,
  pricedOf,
  printedAmountOf,
  required,
  sumOfLines,
} from "../support/deep-priced-kitchens";
import type { PricedKitchen } from "../support/generated-kitchens";
import { codeOf, importClosureOf } from "../support/source-import-closure";
import { TIER_PAIRS, VARIED_ARMS, withTiers } from "../support/varied-kitchens";

const GENERATED_AT = "2026-10-07T12:00:00.000Z";
const PROPERTY_SEED = 8_102_029;
const RUNS_PER_ARM = 120;
const MATERIAL_KEY = "kitchen:material";
const DEPTH_KEY = "kitchen:depth";

const CONTENTS: readonly Content[] = CATALOGUES.map(([locale, messages]) =>
  contentFor(locale, messages),
);

const ROMANIAN_CONTENT = required(CONTENTS[0], "a content");

function availableReviewOf(
  kitchen: PricedKitchen,
  content: Content,
): AvailableReview {
  const view = describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a review");
  return view;
}

const percents = fc.oneof(
  { arbitrary: fc.constantFrom(0, 1, 99, MAX_DEEP_CABINET_PERCENT), weight: 2 },
  {
    arbitrary: fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
    weight: 3,
  },
);

interface Case {
  readonly kitchen: PricedKitchen;
  readonly percent: number;
}

/** A kitchen the generator composed for the room, built at 700 mm and priced under a book stating `percent`. */
function caseOf(
  room: Parameters<typeof generateKitchen>[0]["room"],
  tierAt: number,
  percent: number,
): Case | undefined {
  const generated = generateKitchen({
    room,
    occurredAt: GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
  const tiers = TIER_PAIRS[tierAt % TIER_PAIRS.length];
  if (!generated.ok || tiers === undefined) return undefined;
  const kitchen = pricedKitchenAtPercent(
    withTiers(builtDeep(generated.design), tiers),
    percent,
  );
  return kitchen.pricing.ok ? { kitchen, percent } : undefined;
}

describe.each(VARIED_ARMS)(
  "over generated $name rooms at 700 mm, under every percent",
  (arm) => {
    const seen = { withDepth: 0, atZero: 0, atCap: 0, withPositiveAmount: 0 };

    propertyTest.prop(
      [arm.sampledRooms, fc.nat(TIER_PAIRS.length - 1), percents],
      { numRuns: RUNS_PER_ARM, seed: PROPERTY_SEED },
    )(
      "lists the breakdown's depth row, worded by the line's percent, after the material row, with every priced line once",
      (room, tierAt, percent) => {
        const made = caseOf(room, tierAt, percent);
        if (made === undefined) return;
        const priced = pricedOf(made.kitchen);
        const hasDepthLine = priced.lines.some((l) => l.kind === "depth");
        if (hasDepthLine) seen.withDepth += 1;
        if (hasDepthLine && percent === 0) seen.atZero += 1;
        if (hasDepthLine && percent === MAX_DEEP_CABINET_PERCENT)
          seen.atCap += 1;

        for (const content of CONTENTS) {
          const review = availableReviewOf(made.kitchen, content);
          const breakdown = describePriceBreakdown({
            content,
            pricing: made.kitchen.pricing,
            groups: made.kitchen.groups,
          });
          if (breakdown.kind !== "available") throw new Error("breakdown");
          const listed = listWholeKitchenRows(review);

          expect(review.depthRow === undefined).toBe(!hasDepthLine);
          expect(breakdown.depthRow === undefined).toBe(!hasDepthLine);
          expect(review.groups).toEqual(breakdown.groups);
          expect(review.wholeKitchenRows).toEqual(breakdown.wholeKitchenRows);
          expectEveryPricedLineListedOnce(listed, review, priced, content);
          if (!hasDepthLine) {
            expect(listed).toBe(review.wholeKitchenRows);
            continue;
          }

          const line = depthLineOf(priced);
          const depthAt = listed.findIndex((row) => row.key === DEPTH_KEY);
          expect(review.depthRow?.key).toBe(breakdown.depthRow?.key);
          expect(review.depthRow?.amountText).toBe(
            breakdown.depthRow?.amountText,
          );
          expect(line.deepCabinetPercent).toBe(percent);
          expect(line.depthMm).toBe(DEEP_CABINET_DEPTH_MM);
          expect(listed[depthAt]).toEqual({
            key: DEPTH_KEY,
            label: content.priceBreakdown.depthLine(
              DEEP_CABINET_DEPTH_MM,
              percent,
            ),
            amountText: printedAmountOf(line, content),
            scope: content.priceBreakdown.depthLineScope,
          });
          expect(listed[depthAt - 1]?.key).toBe(MATERIAL_KEY);
          expect(listed.filter((row) => row.scope !== undefined)).toHaveLength(
            1,
          );
          expect(listed.filter((row) => row.key !== DEPTH_KEY)).toEqual(
            review.wholeKitchenRows,
          );
          if (percent === 0) {
            expect(line.amountMinor).toBe(0);
            expect(review.depthRow?.amountText).toBe(
              content.priceBreakdown.included,
            );
          }
          if (line.amountMinor > 0) seen.withPositiveAmount += 1;
        }
      },
    );

    it("exercised the depth line, 0 %, the cap and a positive uplift (the property is not vacuous)", () => {
      expect(seen.withDepth).toBeGreaterThanOrEqual(40);
      expect(seen.atZero).toBeGreaterThanOrEqual(1);
      expect(seen.atCap).toBeGreaterThanOrEqual(1);
      expect(seen.withPositiveAmount).toBeGreaterThanOrEqual(20);
    });
  },
);

function expectEveryPricedLineListedOnce(
  listed: AvailableReview["wholeKitchenRows"],
  review: AvailableReview,
  priced: PricedDesign,
  content: Content,
): void {
  const rows = [...review.groups.flatMap((group) => group.rows), ...listed];
  const pricedKeys = priced.lines.map((line) =>
    line.kind === "cabinet" ? line.placementId : line.lineId,
  );

  expect(rows.map((row) => row.key).sort()).toEqual([...pricedKeys].sort());
  for (const line of priced.lines) {
    const key = line.kind === "cabinet" ? line.placementId : line.lineId;
    expect(rows.find((row) => row.key === key)?.amountText).toBe(
      printedAmountOf(line, content),
    );
  }
  expect(sumOfLines(priced)).toBe(priced.totalMinor);
}

describe("the stored percent wins over any book, on the review model", () => {
  const made = caseOf(
    { shape: "L", widthMm: 3560, depthMm: 2830, heightMm: 2600 },
    0,
    12,
  );
  if (made === undefined) throw new Error("a deep L kitchen was composed");
  const { kitchen } = made;

  it("words the depth row with whatever percent the line carries, for every percent a book may state", () => {
    const priced = pricedOf(kitchen);
    for (let percent = 0; percent <= MAX_DEEP_CABINET_PERCENT; percent += 1) {
      const stamped: PricedKitchen = {
        ...kitchen,
        pricing: {
          ok: true,
          priced: {
            ...priced,
            lines: priced.lines.map((line) =>
              line.kind === "depth"
                ? { ...line, deepCabinetPercent: percent }
                : line,
            ),
          },
        },
      };
      const review = availableReviewOf(stamped, ROMANIAN_CONTENT);

      expect(review.depthRow?.label).toBe(
        ROMANIAN_CONTENT.priceBreakdown.depthLine(
          DEEP_CABINET_DEPTH_MM,
          percent,
        ),
      );
    }
  });

  it("holds no book: nothing the review model reaches names a price book, a pricing call, or the active book", () => {
    const closure = importClosureOf("review/review-model.ts");
    const naming =
      /\b(priceDesign|SAMPLE_PRICE_BOOK|usePriceBook|getActivePriceBook|PriceBookProvider)\b|price-book/;

    expect(closure).toContain("review/review-model.ts");
    expect(closure.filter((file) => naming.test(codeOf(file)))).toEqual([]);
  });
});
