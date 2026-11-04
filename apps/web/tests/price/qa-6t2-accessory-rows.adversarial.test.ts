// **Adversarial QA for wave 6T2's breakdown rows.**
//
// The wave's criterion is that `isWholeKitchenLine` **stops being** `kind !== "cabinet"`, because
// left as a negation it compiles and renders `undefined · <accessory name>`. The shipped assertion
// checks no rendered label contains `undefined` on the seeded design — and it passes with the
// negation restored, because `ro.priceBreakdown.wholeKitchenCategories` gained an `accessory` word in
// the same commit. Verified by mutation: putting `kind !== "cabinet"` back passes all 1 673 web
// tests.
//
// So the criterion is asserted here against the case it is actually about: a **line kind the
// category record has no word for**, which is what the next rule family will be on the day it lands.
// Under the negation such a line is selected and rendered with a hole in its label; under the shipped
// membership test it is not selected at all. This file pins the second.
//
// The rest is what the wave promises the customer, read off **rendered markup** rather than off a
// predicate: no rack row where there is no cabinet above the sink, no *inclus* standing in for one,
// and no accessory row at all in a kitchen with no sink.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignPlacement,
  type DisplayGroup,
  type PriceLine,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import {
  describePriceBreakdown,
  type AvailableBreakdown,
} from "@/price/price-breakdown-model";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
}

function groupsOf(design: Design): readonly DisplayGroup[] {
  return projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG);
}

function breakdownOf(
  pricing: PricingResult,
  groups: readonly DisplayGroup[],
): AvailableBreakdown {
  const view = describePriceBreakdown({
    content: ro,
    pricing,
    groups,
  });
  if (view.kind !== "available")
    throw new Error("the design was expected to price");
  return view;
}

/** Every rendered row's label, in the order the markup puts them — the same reading
 *  `price-breakdown-model.test.ts` does, because a claim about *inclus* and about a missing word is
 *  a claim about what is on the page. */
function renderedLabels(view: AvailableBreakdown): readonly string[] {
  const markup = renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view,
      onClose: () => undefined,
    }),
  );
  return [
    ...markup.matchAll(/data-testid="breakdown-row-label"[^>]*>(.*?)<\/span>/g),
  ].map((match) => match[1] ?? "");
}

function renderedRows(view: AvailableBreakdown): readonly {
  label: string;
  amount: string;
}[] {
  const markup = renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view,
      onClose: () => undefined,
    }),
  );
  return [
    ...markup.matchAll(
      /data-testid="breakdown-row-label"[^>]*>(.*?)<\/span>[\s\S]*?data-testid="breakdown-row-amount"[^>]*>(.*?)<\/span>/g,
    ),
  ].map((match) => ({ label: match[1] ?? "", amount: match[2] ?? "" }));
}

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function placement(
  id: string,
  buildId: string,
  at: {
    readonly alongMm: number;
    readonly y0Mm: number;
    readonly widthMm: number;
    readonly heightMm: number;
  },
): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm: at.alongMm,
    y0Mm: at.y0Mm,
    body: { buildId, widthMm: at.widthMm, heightMm: at.heightMm },
  };
}

const SINK = placement("sink", "base-sink-800", {
  alongMm: 1_300,
  y0Mm: 0,
  widthMm: 800,
  heightMm: 820,
});

const WALL_CABINET_OVER_THE_SINK = placement("host", "wall-2door-800", {
  alongMm: 1_300,
  y0Mm: 1_500,
  widthMm: 800,
  heightMm: 700,
});

const NO_SINK_AT_ALL = placement("drawers", "base-drawer3-600", {
  alongMm: 1_300,
  y0Mm: 0,
  widthMm: 600,
  heightMm: 820,
});

function breakdownFor(
  placements: readonly DesignPlacement[],
): AvailableBreakdown {
  const design = designOf(placements);
  return breakdownOf(priceOf(design), groupsOf(design));
}

/**
 * **The criterion, against the case the shipped assertion cannot see.**
 *
 * A line whose kind the category record has no word for is the shape the *next* rule family arrives
 * in — and it is the only shape that separates the shipped membership test from the negation it
 * replaced. The line below is built by hand because no query can return one: that is the point,
 * since the surface is being asked what it does with a line kind it was not written for.
 */
describe("a line kind with no category word is not rendered with a hole in it", () => {
  /** A whole-kitchen-shaped line wearing a kind that no word exists for. Cast because `PriceLine` is
   *  a closed union today; the cast is the test's subject, not a convenience. */
  const KIND_WITH_NO_WORD = {
    lineId: "kitchen:delivery",
    kind: "delivery",
    ruleId: "delivery.standard",
    name: "Livrare",
    description: "A rule family that does not exist yet",
    quantity: 1,
    unitAmountMinor: 50_000,
    amountMinor: 50_000,
  } as unknown as PriceLine;

  function withTheUnknownLine(): AvailableBreakdown {
    const pricing = priceOf(KITCHEN_L_DESIGN);
    if (!pricing.ok) throw new Error("the seeded design was expected to price");
    return breakdownOf(
      {
        ok: true,
        priced: {
          ...pricing.priced,
          lines: [...pricing.priced.lines, KIND_WITH_NO_WORD],
        },
      },
      groupsOf(KITCHEN_L_DESIGN),
    );
  }

  it("renders no row for it, rather than one labelled undefined", () => {
    const labels = renderedLabels(withTheUnknownLine());

    expect(labels.filter((label) => label.includes("Livrare"))).toEqual([]);
    for (const label of labels) {
      expect(label).not.toContain("undefined");
    }
  });

  /** The rows the surface *does* show are unchanged by its presence, so the omission is a filter and
   *  not a collapse. */
  it("leaves every other row exactly where it was", () => {
    expect(
      withTheUnknownLine().wholeKitchenRows.map((row) => row.label),
    ).toEqual(
      breakdownOf(
        priceOf(KITCHEN_L_DESIGN),
        groupsOf(KITCHEN_L_DESIGN),
      ).wholeKitchenRows.map((row) => row.label),
    );
  });
});

/**
 * **What the customer sees, per design, read off the markup.** The omission is the criterion: an
 * amount of zero renders *inclus*, so a rack the design does not earn must produce **no row** rather
 * than a row saying it is included.
 */
describe("the accessory rows the customer actually reads", () => {
  it("shows both rows for a sink standing under a wall cabinet", () => {
    const labels = renderedLabels(
      breakdownFor([SINK, WALL_CABINET_OVER_THE_SINK]),
    );

    expect(labels).toContain(
      `Accesorii · ${SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.name}`,
    );
    expect(labels).toContain(
      `Accesorii · ${SAMPLE_PRICE_BOOK.accessories.dishDryingRack.name}`,
    );
  });

  it("shows the cover and no rack row at all for a sink with nothing above it", () => {
    const rows = renderedRows(breakdownFor([SINK]));
    const rackName = SAMPLE_PRICE_BOOK.accessories.dishDryingRack.name;

    expect(rows.map((row) => row.label)).toContain(
      `Accesorii · ${SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.name}`,
    );
    expect(rows.filter((row) => row.label.includes(rackName))).toEqual([]);
  });

  it("shows no accessory row at all in a kitchen holding no sink", () => {
    const labels = renderedLabels(breakdownFor([NO_SINK_AT_ALL]));

    expect(
      labels.filter((label) =>
        label.startsWith(ro.priceBreakdown.wholeKitchenCategories.accessory),
      ),
    ).toEqual([]);
  });
});
