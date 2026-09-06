// Frames 2D / D2D's breakdown, as a value and as markup.
//
// The wave's first criterion is the one that shapes this file: the rows **are** wave 6A's groups
// rendered, and *deleting the projection call must break the surface rather than merely change it*.
// A test that only compared the rendered order against the projection's would pass with the
// projection deleted and the price lines read directly — they arrive in the same order, because
// pricing reads the same projection. So the criterion is asserted as a **refusal**: with no groups
// there are no rows and a priced body nobody placed is an error, not a shorter list.
//
// The rendered half is here rather than in a browser because it is markup produced from a value:
// `renderToStaticMarkup` is what wave 6C's own state assertions use, and for the same reason —
// "the amount reads *inclus*" is a claim about what is on the page, and a value assertion cannot
// see a `0` rendered beside it.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DisplayGroup,
  type PriceLine,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import {
  describePriceBreakdown,
  PriceBreakdownDivergenceError,
  type AvailableBreakdown,
} from "@/price/price-breakdown-model";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import { describeRoundedAmount } from "@/price/starting-price";

function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
}

function groupsOf(design: Design): readonly DisplayGroup[] {
  return projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG);
}

const SHIPPED_PRICING = priceOf(KITCHEN_L_DESIGN);
const SHIPPED_GROUPS = groupsOf(KITCHEN_L_DESIGN);

/** The shipped design, described. Throws rather than returning a union so every assertion below
 *  reads the available shape without narrowing it again. */
function shippedBreakdown(
  pricing: PricingResult = SHIPPED_PRICING,
  groups: readonly DisplayGroup[] = SHIPPED_GROUPS,
): AvailableBreakdown {
  const view = describePriceBreakdown({ pricing, groups });
  if (view.kind !== "available")
    throw new Error("the seeded design was expected to price");
  return view;
}

/** The same result with some of its lines removed — the way an empty whole-kitchen section is
 *  produced without hand-building a `PricedDesign` that no query ever returned. */
function withLines(
  pricing: PricingResult,
  lines: readonly PriceLine[],
): PricingResult {
  if (!pricing.ok) throw new Error("expected a priced result to rewrite");
  return { ok: true, priced: { ...pricing.priced, lines } };
}

/** Every rendered row, in the order the markup puts them. */
function renderedRows(view: AvailableBreakdown): {
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

describe("the rows are wave 6A's groups, rendered", () => {
  it("names every placement the projection holds, and no other", () => {
    const view = shippedBreakdown();

    expect(
      view.groups.flatMap((group) => group.rows.map((row) => row.key)),
      // BUILD → OPERATE → CHECK: the projection's own population, flattened the same way.
    ).toEqual(
      SHIPPED_GROUPS.flatMap((group) =>
        group.entries.map((entry) => entry.placementId),
      ),
    );
  });

  it("takes each line's words from the projection's entry, never from the price line", () => {
    // `describeBodyLabelAt`'s answer (ADR 0033) and the entry's own width — which is what makes the
    // panel header, the scene and this surface say the same words about one body.
    const view = shippedBreakdown();

    expect(
      view.groups.flatMap((group) => group.rows.map((row) => row.label)),
    ).toEqual(
      SHIPPED_GROUPS.flatMap((group) =>
        group.entries.map((entry) =>
          ro.priceBreakdown.placementLabel(entry.label, entry.widthMm),
        ),
      ),
    );
  });

  it("names a body and its width, in frame 2D's own words", () => {
    // The literal the composition above cannot fail on. This row is byte-identical to the one the
    // frame draws — the mockup's other names predate ADR 0033's merge and the catalogue's since,
    // but this body was never renamed, so the frame and the shipped label are the same string.
    const labels = shippedBreakdown().groups.flatMap((group) =>
      group.rows.map((row) => row.label),
    );

    expect(labels).toContain("Nișă mașină de spălat vase 600");
  });

  it("heads each group with its wall and its band, from the group itself", () => {
    const view = shippedBreakdown();

    expect(view.groups.map((group) => group.heading)).toEqual(
      SHIPPED_GROUPS.map((group) =>
        ro.priceBreakdown.groupHeading(
          group.wall,
          ro.priceBreakdown.bandHeadings[group.band],
        ),
      ),
    );
    // The literal the composition above cannot fail on: frame 2D's own first heading.
    expect(view.groups[0]?.heading).toBe("Perete A · bază");
  });

  it("produces no group at all for a design of nothing but empty space", () => {
    const view = shippedBreakdown(withLines(SHIPPED_PRICING, []), []);

    expect(view.groups).toEqual([]);
  });
});

describe("deleting the projection call breaks the surface rather than shortening it", () => {
  it("refuses to render when the priced design holds a body no group does", () => {
    // This is the criterion, stated as the thing that goes wrong without the projection: every
    // cabinet line is still there, in the right order, with the right label — and there is no list.
    expect(() =>
      describePriceBreakdown({ pricing: SHIPPED_PRICING, groups: [] }),
    ).toThrow(PriceBreakdownDivergenceError);
  });

  it("refuses to render when a group holds a body the priced design does not", () => {
    const cabinetLines = SHIPPED_PRICING.ok
      ? SHIPPED_PRICING.priced.lines.filter((line) => line.kind !== "cabinet")
      : [];

    expect(() =>
      describePriceBreakdown({
        pricing: withLines(SHIPPED_PRICING, cabinetLines),
        groups: SHIPPED_GROUPS,
      }),
    ).toThrow(PriceBreakdownDivergenceError);
  });

  it("names the placements it could not build a row for", () => {
    // A refusal that does not say which body diverged sends the next reader to the whole design.
    const firstPlacementId = SHIPPED_GROUPS[0]?.entries[0]?.placementId ?? "";

    expect(() =>
      describePriceBreakdown({ pricing: SHIPPED_PRICING, groups: [] }),
    ).toThrow(firstPlacementId);
  });
});

describe("the whole-kitchen section, which is data", () => {
  it("follows every placement row", () => {
    const view = shippedBreakdown();
    const rows = renderedRows(view);
    const lastPlacementLabel = view.groups.at(-1)?.rows.at(-1)?.label;

    expect(rows.findIndex((row) => row.label === lastPlacementLabel)).toBe(
      rows.length - view.wholeKitchenRows.length - 1,
    );
  });

  /** **Every row here is book data rendered, and none of it is a component's words.** The two
   *  accessory rows arrived at wave 6T2 with no change to this surface beyond a category word — the
   *  seeded kitchen holds a sink under a wall cabinet, so it earns both extras. */
  it("renders the tiers and accessories the book produced, named from the book", () => {
    expect(shippedBreakdown().wholeKitchenRows.map((row) => row.label)).toEqual(
      [
        "Feronerie · Standard",
        "Material · PAL melaminat",
        "Accesorii · Protecție de aluminiu pentru corpul spălătorului",
        "Accesorii · Uscător de vase",
      ],
    );
  });

  /** The trap ADR 0092 decision 11 names by hand: with `isWholeKitchenLine` left as
   *  `kind !== "cabinet"` the accessory rows still appear and their category word is `undefined`.
   *  Asserted on the **rendered** breakdown rather than on the predicate, because the predicate
   *  compiles either way. */
  it("renders no row whose category word is missing", () => {
    for (const row of shippedBreakdown().wholeKitchenRows) {
      expect(row.label).not.toContain("undefined");
    }
  });

  it("renders nothing at all when the book produced no whole-kitchen line", () => {
    const cabinetOnly = SHIPPED_PRICING.ok
      ? SHIPPED_PRICING.priced.lines.filter((line) => line.kind === "cabinet")
      : [];
    const view = shippedBreakdown(withLines(SHIPPED_PRICING, cabinetOnly));

    expect(view.wholeKitchenRows).toEqual([]);
    expect(
      renderToStaticMarkup(
        createElement(PriceBreakdownSurface, {
          id: "breakdown",
          view,
          onClose: () => undefined,
        }),
      ),
    ).not.toContain("price-breakdown-whole-kitchen");
  });

  it("grows a row from a line alone, with no change to this surface's code", () => {
    // The slot's whole point: what is included is an open product question (frame 2D's own caption
    // says so), and answering it later must be a change to the book, not to a component.
    const extraTier: PriceLine = {
      lineId: "line.hardware.invented",
      kind: "hardware",
      ruleId: "rule.hardware.invented",
      tierId: "hardware.invented",
      name: "Feronerie inventată",
      description: "A tier no book holds, standing in for one added later.",
      quantity: 1,
      unitAmountMinor: 700_000,
      amountMinor: 700_000,
    };
    const grown = SHIPPED_PRICING.ok
      ? [...SHIPPED_PRICING.priced.lines, extraTier]
      : [];

    expect(
      shippedBreakdown(withLines(SHIPPED_PRICING, grown)).wholeKitchenRows.at(
        -1,
      ),
    ).toEqual({
      key: "line.hardware.invented",
      label: "Feronerie · Feronerie inventată",
      amountText: "7 000",
    });
  });
});

describe("what an amount reads as", () => {
  it("reads inclus for a tier that costs nothing extra, never 0", () => {
    const rows = renderedRows(shippedBreakdown());
    const material = rows.find((row) => row.label.startsWith("Material · "));

    expect(material?.amount).toBe("inclus");
    expect(rows.map((row) => row.amount)).not.toContain("0");
  });

  it("rounds a line up to the thousand, through the one rounding site", () => {
    const view = shippedBreakdown();
    const firstRow = view.groups[0]?.rows[0];
    const firstLine = SHIPPED_PRICING.ok
      ? SHIPPED_PRICING.priced.lines.find(
          (line) =>
            line.kind === "cabinet" && line.placementId === firstRow?.key,
        )
      : undefined;

    expect(firstRow?.amountText).toBe(
      describeRoundedAmount(firstLine?.amountMinor ?? -1),
    );
  });

  it("prints no currency on a line — the surface states it once, on the figure", () => {
    const rows = renderedRows(shippedBreakdown());

    for (const row of rows) expect(row.amount, row.label).not.toContain("MDL");
    expect(shippedBreakdown().figure.amountText).toContain("MDL");
  });
});

describe("the figure at the foot of the sheet", () => {
  it("is the design's own total, prefixed De la", () => {
    const view = shippedBreakdown();

    expect(view.figure.label).toBe(ro.price.startingPrefix);
    expect(view.figure.amountText).toBe(
      SHIPPED_PRICING.ok
        ? `${describeRoundedAmount(SHIPPED_PRICING.priced.totalMinor)} MDL`
        : "",
    );
  });

  it("carries the flagged-total warning when the design overflows, wherever a total is shown", () => {
    // ADR 0065 decision 6. This surface shows a total, so it asks the same question the bar and
    // §9's footer ask — a surface that builds a figure without asking is how the flag went missing
    // from the one total a mobile customer could see.
    const view = shippedBreakdown(
      priceOf(overflowingDesign()),
      groupsOf(overflowingDesign()),
    );

    expect(view.overflowWarning).toBe(ro.price.overflowingTotalWarning);
  });

  it("leaves it absent, not empty, when nothing overflows", () => {
    expect(shippedBreakdown().overflowWarning).toBeUndefined();
  });
});

describe("a pricing failure", () => {
  it("offers no breakdown at all — not an empty one, not a zeroed one", () => {
    const failed = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-not-this-one`,
    });

    expect(
      describePriceBreakdown({ pricing: failed, groups: SHIPPED_GROUPS }),
    ).toEqual({ kind: "unavailable" });
  });
});

/** The seeded design with one body pushed past the end of its wall, exactly as wave 6C's own
 *  suites produce a flagged total. */
function overflowingDesign(): Design {
  const [first, ...rest] = KITCHEN_L_DESIGN.placements;
  if (!first) throw new Error("the seeded design has no placements");
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      { ...first, wall: "A", alongMm: KITCHEN_L_DESIGN.room.widthMm + 500 },
      ...rest,
    ],
  };
}
