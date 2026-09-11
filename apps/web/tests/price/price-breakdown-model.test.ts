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

import { ro } from "../support/romanian-content";
import { RULED_CURRENCY_CODE } from "../support/ruled-price-copy";
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
  const view = describePriceBreakdown({
    content: ro,
    pricing,
    groups,
  });
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

/** The seeded placements the book says the manufacturer does not supply — the hood and the
 *  free-standing fridge — read off the priced lines rather than named here, so the expectation
 *  follows the book instead of a list somebody kept up to date by hand. */
function customerSuppliedPlacementIds(): readonly string[] {
  if (!SHIPPED_PRICING.ok) return [];
  return SHIPPED_PRICING.priced.lines.flatMap((line) =>
    line.kind === "cabinet" && line.suppliedBy === "customer"
      ? [line.placementId]
      : [],
  );
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
          ro.priceBreakdown.placementLabel(
            ro.bodyLabel(entry.label),
            entry.widthMm,
          ),
        ),
      ),
    );
  });

  it("carries a row for the dishwasher housing at 600, named through the catalogue", () => {
    // Frame 2D draws this row for the dishwasher housing at 600. The composition above cannot fail
    // on which *entry* is named, so this one names it — through the catalogue, because under a
    // second locale the same row is the same entry and a different sentence. Its wording is pinned
    // once, in the copy lock.
    const labels = shippedBreakdown().groups.flatMap((group) =>
      group.rows.map((row) => row.label),
    );

    expect(labels).toContain(
      ro.priceBreakdown.placementLabel(
        ro.bodyLabel({ kind: "entry", buildId: "base-dishwasher" }),
        600,
      ),
    );
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
    // The composition above cannot fail on which wall or band the first group carries; this names
    // both, read from the catalogue so a retranslation is not a false red.
    expect(view.groups[0]?.heading).toBe(
      ro.priceBreakdown.groupHeading("A", ro.priceBreakdown.bandHeadings.base),
    );
  });

  // **Superseded by M6-AUD-014's ruling** (owner, 2026-09-09). This case used to assert that a
  // kitchen of nothing but empty space produced an available breakdown with zero groups. It now has
  // no breakdown at all: there is no price to explain, and an available-but-empty one would render
  // the two whole-kitchen tiers *inclus* over a kitchen with nothing in it, which reads as a costed
  // answer. The bar carries the owner's prompt instead.
  it("offers no breakdown at all for a design of nothing but empty space", () => {
    const view = describePriceBreakdown({
      content: ro,
      pricing: withLines(SHIPPED_PRICING, []),
      groups: [],
    });

    expect(view.kind).toBe("unavailable");
    // Non-vacuity: the same call on the shipped design is available, so "unavailable" is a statement
    // about the empty kitchen and not about this helper.
    expect(
      describePriceBreakdown({
        content: ro,
        pricing: SHIPPED_PRICING,
        groups: SHIPPED_GROUPS,
      }).kind,
    ).toBe("available");
  });
});

describe("deleting the projection call breaks the surface rather than shortening it", () => {
  it("refuses to render when the priced design holds a body no group does", () => {
    // This is the criterion, stated as the thing that goes wrong without the projection: every
    // cabinet line is still there, in the right order, with the right label — and there is no list.
    expect(() =>
      describePriceBreakdown({
        content: ro,
        pricing: SHIPPED_PRICING,
        groups: [],
      }),
    ).toThrow(PriceBreakdownDivergenceError);
  });

  it("refuses to render when a group holds a body the priced design does not", () => {
    const cabinetLines = SHIPPED_PRICING.ok
      ? SHIPPED_PRICING.priced.lines.filter((line) => line.kind !== "cabinet")
      : [];

    expect(() =>
      describePriceBreakdown({
        content: ro,
        pricing: withLines(SHIPPED_PRICING, cabinetLines),
        groups: SHIPPED_GROUPS,
      }),
    ).toThrow(PriceBreakdownDivergenceError);
  });

  it("names the placements it could not build a row for", () => {
    // A refusal that does not say which body diverged sends the next reader to the whole design.
    const firstPlacementId = SHIPPED_GROUPS[0]?.entries[0]?.placementId ?? "";

    expect(() =>
      describePriceBreakdown({
        content: ro,
        pricing: SHIPPED_PRICING,
        groups: [],
      }),
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
    const { wholeKitchenCategories, wholeKitchenLabel } = ro.priceBreakdown;

    expect(shippedBreakdown().wholeKitchenRows.map((row) => row.label)).toEqual(
      [
        wholeKitchenLabel(wholeKitchenCategories.hardware, "Standard"),
        wholeKitchenLabel(wholeKitchenCategories.material, "PAL melaminat"),
        wholeKitchenLabel(
          wholeKitchenCategories.accessory,
          ro.bookText("", "priceBook.accessory.sink-protective-cover.name"),
        ),
        wholeKitchenLabel(
          wholeKitchenCategories.accessory,
          ro.bookText("", "priceBook.accessory.dish-drying-rack.name"),
        ),
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
      name: "An invented tier",
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
      label: ro.priceBreakdown.wholeKitchenLabel(
        ro.priceBreakdown.wholeKitchenCategories.hardware,
        "An invented tier",
      ),
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

  it("reads nu este inclus on a body the manufacturer does not supply", () => {
    // The owner's ruling of 2026-09-10: the hood and the free-standing fridge are drawn and
    // displayed, and are not part of the price. *"inclus"* over a fridge told the customer Lemnaria
    // was giving them one.
    //
    // The expected population is read off the **priced lines'** own `suppliedBy`, so this fails if
    // the surface prints the sentence over the wrong body as loudly as if it printed none.
    const notSuppliedKeys = customerSuppliedPlacementIds();
    const rowsByKey = new Map(
      shippedBreakdown()
        .groups.flatMap((group) => group.rows)
        .map((row) => [row.key, row.amountText]),
    );

    expect(notSuppliedKeys.length).toBe(2);
    for (const key of notSuppliedKeys)
      expect(rowsByKey.get(key), key).toBe(ro.priceBreakdown.notIncluded);
  });

  it("keeps every other zero at inclus, so the two zeros never print the same word", () => {
    // **The defect this pairing exists to catch.** An experiment that keyed the wording off
    // `amount === 0` put *"nu este inclus"* on the melamine row, which is free and genuinely is
    // included. Nothing but a declared appliance may carry the new sentence.
    const notSuppliedKeys = new Set(customerSuppliedPlacementIds());
    const rows = shippedBreakdown().groups.flatMap((group) => group.rows);
    const included = renderedRows(shippedBreakdown()).filter(
      (row) => row.amount === ro.priceBreakdown.included,
    );

    expect(ro.priceBreakdown.included).not.toBe(ro.priceBreakdown.notIncluded);
    // Not vacuous: the material tier is free, so at least one row genuinely reads *inclus*.
    expect(included.length).toBeGreaterThan(0);
    for (const row of rows) {
      if (notSuppliedKeys.has(row.key)) continue;
      expect(row.amountText, row.key).not.toBe(ro.priceBreakdown.notIncluded);
    }
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

    // The negative half reads the ruled literal on purpose — see `ruled-price-copy.ts`: derived
    // from the book it would chase a changed currency and stop looking for the old one. The
    // positive half is built from the leaf that owns the join since wave 6B-g.
    const currencyTheLeafCarries = ro.price.amountWithCurrency("").trim();

    for (const row of rows)
      expect(row.amount, row.label).not.toContain(RULED_CURRENCY_CODE);
    // Not vacuous: a leaf that dropped the currency would satisfy `toContain("")`.
    expect(currencyTheLeafCarries).not.toBe("");
    expect(shippedBreakdown().figure.amountText).toContain(
      currencyTheLeafCarries,
    );
  });
});

describe("the figure at the foot of the sheet", () => {
  it("is the design's own total, prefixed De la", () => {
    const view = shippedBreakdown();

    expect(view.figure.label).toBe(ro.price.startingPrefix);
    // Built from `price.amountWithCurrency`, the leaf that owns the join since wave 6B-g. That the
    // leaf is genuinely consulted rather than mirrored is proved in `amount-with-currency-seam`.
    expect(view.figure.amountText).toBe(
      SHIPPED_PRICING.ok
        ? ro.price.amountWithCurrency(
            describeRoundedAmount(SHIPPED_PRICING.priced.totalMinor),
          )
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
      describePriceBreakdown({
        content: ro,
        pricing: failed,
        groups: SHIPPED_GROUPS,
      }),
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
