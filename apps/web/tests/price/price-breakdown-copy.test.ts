// Literal assertions, each also checked against the frame that ruled the string: a pin that holds for any wording is
// not a pin. The sum-claim rule (`tests/support/ruled-price-copy.ts`) is also asserted on rendered output, which a
// string sweep cannot see: every digit on the page must trace to a row or to the one figure. `PriceBreakdownSurface`
// is handed no number so it cannot add one, but the container and `describePriceBreakdown` can (the model does no
// arithmetic today, a property of the code and not of its types), so the count is built from rows and figure only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";

import { ro } from "../support/romanian-content";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import {
  describePriceBreakdown,
  type AvailableBreakdown,
} from "@/price/price-breakdown-model";

import {
  RULED_TO_CONTAIN_A_SUM_WORD,
  SUM_CLAIM_WORDS,
} from "../support/ruled-price-copy";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";

/** The desktop file, read only for the question mark the owner ruled onto this control; frame 2D (the mobile file,
 *  the only one carrying every frame) draws the wording unpunctuated. */
const DESKTOP_FRAMES = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../docs/design/mockups/Lemnaria Configurator Desktop.dc.html",
  ),
  "utf8",
);

const FRAME_2D = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../docs/design/mockups/Lemnaria Configurator Mobil.dc.html",
  ),
  "utf8",
);

const SURFACE_SOURCE = resolve(import.meta.dirname, "../../src/price");

function readStylesheet(name: string): string {
  return readFileSync(resolve(SURFACE_SOURCE, name), "utf8");
}

/** Re-derived rather than imported, so an agreement here is not an agreement with itself. */
const ROUNDING_STEP_MDL = 1000;

/** What a breakdown row prints where it prints no number, read from the catalogue so a copy edit moves the filter. */
const WORDS_INSTEAD_OF_AN_AMOUNT: readonly string[] = [
  ro.priceBreakdown.included,
  ro.priceBreakdown.notIncluded,
];

/** The seeded design's breakdown, as the application builds it. */
function shippedBreakdown(): AvailableBreakdown {
  const view = describePriceBreakdown({
    deepCabinetPercent: undefined,
    content: ro,
    pricing: priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    }),
    groups: projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  });
  if (view.kind !== "available")
    throw new Error("the seeded design was expected to price");
  return view;
}

function renderedMarkup(view: AvailableBreakdown = shippedBreakdown()): string {
  return renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view,
      onClose: () => undefined,
    }),
  );
}

/** What a customer reads: tags are stripped because an attribute is not copy and a class name is not a number. */
function visibleText(markup: string): string {
  return markup.replaceAll(/<[^>]*>/g, " ");
}

/** Every number a reader sees, in order. A grouped amount is one token (*"95 000"* is a figure), so an extra number
 *  counts as an extra rather than disappearing into the grouping. */
function numberTokens(text: string): string[] {
  return text.match(/\d+(?: \d{3})*/g) ?? [];
}

/** Every number the surface is entitled to show, from the rows and the one figure only: "every number in the view"
 *  would let an amount added to the model as a new field justify itself. */
function accountedForNumbers(view: AvailableBreakdown): string[] {
  const rows = [
    ...view.groups.flatMap((group) => group.rows),
    ...view.wholeKitchenRows,
  ];
  return [
    ...rows.flatMap((row) => [
      ...numberTokens(row.label),
      ...numberTokens(row.amountText),
    ]),
    ...numberTokens(view.figure.amountText),
  ];
}

/** The `color` and `background` a rule paints with, read as `price-bar-layout.test.ts` reads them, so the third site
 *  is compared to the other two rather than to a repeated hex. */
function paletteOf(stylesheet: string, ruleName: string): [string, string] {
  const block = new RegExp(`\\.${ruleName} \\{([^}]*)\\}`).exec(
    stylesheet,
  )?.[1];
  if (!block) throw new Error(`no .${ruleName} rule to read`);
  const colour = /(?<!-)color:\s*([^;]+);/.exec(block)?.[1];
  const background = /background:\s*([^;]+);/.exec(block)?.[1];
  if (!colour || !background)
    throw new Error(`.${ruleName} declares no colour pair`);
  return [colour.trim(), background.trim()];
}

describe("every ruled string, as a literal and in the frame that ruled it", () => {
  it("heads the surface with frame 2D's title, and the owner's question mark", () => {
    // The `?` is an owner ruling that supersedes frame 2D, which draws the wording unpunctuated: the wording is
    // asserted on the frame and the mark on the desktop frames, which punctuate their longer heading likewise.
    expect(ro.priceBreakdown.title).toBe("De ce acest preț?");
    expect(FRAME_2D).toContain("De ce acest preț");
    expect(FRAME_2D).not.toContain("De ce acest preț?");
    expect(DESKTOP_FRAMES).toContain("acest preț?");
  });

  it("carries no caret beside that control any more, on either shell", () => {
    // A caret was decoration (`aria-hidden`); a question mark is punctuation and is read out. One treatment for both
    // shells: frame 2A's `⌃` goes with it.
    const component = readStylesheet("price-breakdown.tsx");

    expect(component).not.toContain("DISCLOSURE_GLYPH");
    expect(component).not.toContain("⌃");
    expect(readStylesheet("price-breakdown.module.css")).not.toContain(
      ".chevron",
    );
  });

  it("states the exclusions and the on-site measurement, verbatim", () => {
    // ADR 0036 decision 3 rides on the worktop clause: the worktop influences neither geometry nor price, so weakening
    // this sentence loses the only customer-facing place that is written.
    expect(ro.priceBreakdown.disclaimer).toBe(
      "Prețul afișat este estimativ. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare.",
    );
    expect(FRAME_2D).toContain(
      "Preț de pornire, rotunjit în sus la mia de lei. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare.",
    );
    expect(FRAME_2D).not.toContain(ro.priceBreakdown.disclaimer);
  });

  it("carries the rounding footnote that says the amounts do not add up", () => {
    expect(ro.priceBreakdown.note).toBe(
      "Pretul afișat este estimativ. Nu reprezintă o ofertă comercială finală. Oferta comercială finală se stabilește doar după măsurarile exacte.",
    );
    expect(FRAME_2D).toContain(
      "Toate sumele sunt prețuri de pornire, rotunjite în sus. Nu constituie ofertă comercială.",
    );
    expect(FRAME_2D).not.toContain(ro.priceBreakdown.note);
  });

  it("closes with frame 2D's own word", () => {
    expect(ro.priceBreakdown.close).toBe("Închide");
    expect(FRAME_2D).toContain(">Închide<");
  });

  it("reads inclus for a tier that costs nothing extra — frame 2E's word", () => {
    expect(ro.priceBreakdown.included).toBe("inclus");
    expect(FRAME_2D).toContain(">inclus<");
  });

  it("heads a group with its wall and its band, in all three bands", () => {
    expect(ro.priceBreakdown.bandHeadings).toEqual({
      base: "bază",
      wall: "suspendate",
      column: "coloane",
    });

    const headings = [
      ro.priceBreakdown.groupHeading("A", ro.priceBreakdown.bandHeadings.base),
      ro.priceBreakdown.groupHeading("A", ro.priceBreakdown.bandHeadings.wall),
      ro.priceBreakdown.groupHeading(
        "B",
        ro.priceBreakdown.bandHeadings.column,
      ),
    ];

    expect(headings).toEqual([
      "Perete A · bază",
      "Perete A · suspendate",
      "Perete B · coloane",
    ]);
    for (const heading of headings)
      expect(FRAME_2D, heading).toContain(heading);
  });

  it("names a whole-kitchen line by its category and the book's tier name", () => {
    // `accessory` is the key that matters: rows were once selected by "not a cabinet", so an accessory line rendered
    // `undefined · Uscător de vase` while compiling (ADR 0092 decision 11). The word is drafted, not ruled.
    expect(ro.priceBreakdown.wholeKitchenCategories).toEqual({
      hardware: "Feronerie",
      material: "Material",
      accessory: "Accesorii",
    });
    expect(
      ro.priceBreakdown.wholeKitchenLabel("Material", "PAL melaminat"),
    ).toBe("Material · PAL melaminat");
    expect(FRAME_2D).toContain("Material · PAL melaminat");
  });

  it("names a placement by its body and its width", () => {
    expect(
      ro.priceBreakdown.placementLabel("Nișă mașină de spălat vase", 600),
    ).toBe("Nișă mașină de spălat vase 600");
    expect(FRAME_2D).toContain("Nișă mașină de spălat vase 600");
  });
});

describe("no surface claims the rounded lines add up to the rounded total", () => {
  it("shows no number that is not a row's or the one figure's", () => {
    // Closes the purely numeric subtotal: a bare `7 000` carries nothing to sweep and still fails, being a number
    // nothing accounts for. Order is asserted as well as count.
    const view = shippedBreakdown();

    expect(numberTokens(visibleText(renderedMarkup(view)))).toEqual(
      accountedForNumbers(view),
    );
  });

  it("would catch a subtotal that carries no words at all", () => {
    // The counterfactual that keeps the assertion above non-vacuous: nothing about this element is lexically wrong.
    const view = shippedBreakdown();

    expect(
      numberTokens(visibleText(`${renderedMarkup(view)}<span>7 000</span>`)),
    ).not.toEqual(accountedForNumbers(view));
  });

  it("shows a figure the rendered rows do not add up to, by more than a whole step", () => {
    // The reason the rule exists, on what is on the page: each amount is rounded up on its own, so a customer adding
    // the rows lands elsewhere and no element may present itself as their sum.
    const view = shippedBreakdown();
    const text = visibleText(renderedMarkup(view));
    const amountsOf = (tokens: string[]): number[] =>
      tokens.map((token) => Number(token.replaceAll(" ", "")));

    const rowTotal = amountsOf(
      [...view.groups.flatMap((group) => group.rows), ...view.wholeKitchenRows]
        .map((row) => row.amountText)
        // Rows that print words, not a number (a free tier reads *inclus*, an unsupplied body *nu este inclus*);
        // summing either gives NaN.
        .filter(
          (amountText) => !WORDS_INSTEAD_OF_AN_AMOUNT.includes(amountText),
        ),
    ).reduce((running, amount) => running + amount, 0);
    const figure = amountsOf(numberTokens(view.figure.amountText))[0] ?? 0;

    expect(text).toContain(view.figure.amountText);
    expect(rowTotal).toBeGreaterThan(figure + ROUNDING_STEP_MDL);
  });

  it("puts no sum-family word on the surface outside the two sentences ruled to carry one", () => {
    // The lexical axis, the least of the three: it reads the one word list and one exception list the string guard
    // reads. Words only, not the `+` and `=`: the catalogue ships *"Coloană cuptor + microunde"*, so a legitimate plus
    // reaches this page (see `ruled-price-copy.ts`).
    let text = visibleText(renderedMarkup());
    for (const ruled of RULED_TO_CONTAIN_A_SUM_WORD)
      text = text.replace(ruled, "");

    expect(text).not.toMatch(SUM_CLAIM_WORDS);
  });

  it("still reaches both excluded sentences on the surface, so neither exception has gone stale", () => {
    // The exclusion is a `String.replace`, so a ruled sentence that stopped rendering would make the strip a no-op and
    // leave the sweep passing about a surface it no longer describes.
    const text = visibleText(renderedMarkup());

    for (const ruled of RULED_TO_CONTAIN_A_SUM_WORD)
      expect(text, ruled).toContain(ruled);
  });

  it("would catch a total row added to the surface", () => {
    let text = visibleText(`${renderedMarkup()}<span>Total</span>`);
    for (const ruled of RULED_TO_CONTAIN_A_SUM_WORD)
      text = text.replace(ruled, "");

    expect(text).toMatch(SUM_CLAIM_WORDS);
  });

  it("labels the figure at the foot De la, never as a total of the rows above it", () => {
    // Through the other entry point: `describePriceBreakdown` is a second path a figure label can reach, and reading
    // the figure as a sum of the lines is what its label has to prevent.
    expect(shippedBreakdown()).toMatchObject({
      figure: { label: ro.price.startingPrefix },
    });
  });
});

describe("the flagged total wears the caution palette on this surface too", () => {
  it("paints it from the same two values the bar and §9's footer use", () => {
    // ADR 0065 decision 8, at its third site: the two shipped ones are held together by `price-bar-layout.test.ts`.
    // The pair is read from `flagged-total-warning.module.css`, where the sentence now lives (ADR 0104 decision 8b).
    expect(
      paletteOf(readStylesheet("price-breakdown.module.css"), "overflow"),
    ).toEqual(
      paletteOf(readStylesheet("flagged-total-warning.module.css"), "warning"),
    );
  });
});
