// **The breakdown's owner-ruled copy, pinned by literals and traced to where it was ruled.**
//
// Copy is the one thing in this project that cannot be re-derived from the code: a wrong number
// eventually surfaces in a measurement, a reworded sentence surfaces only in front of a customer.
// So the assertions here are literal, and each one also asserts the string is present in the frame
// that ruled it — a pin that would hold for any wording is not a pin, which is the defect wave 6A4
// shipped and this file exists not to repeat.
//
// **And the same rule asserted where a string sweep cannot see it: against rendered output.**
//
// "No surface says the rounded lines add up to the rounded total" has **one** rule, one pattern and
// one exception list — all three in `tests/support/ruled-price-copy.ts`, read by this file and by
// `starting-price.adversarial.test.ts` alike. What differs is where each asks the question. The
// other guard sweeps the strings in `ro.*`; that cannot see a figure composed at render time from
// numbers, because such a thing need not appear in copy at all. A rule and a bare `7 000` with no
// label is exactly the subtotal the criterion forbids, and it carries no word to sweep.
//
// So the sweep below is the **least** important of the three assertions. The one that matters is
// structural rather than lexical: **every digit on the page traces to a row or to the one figure.**
// A subtotal is an extra number whatever produced it and whatever it is called, so it fails that
// count — and it fails it whether the extra amount was invented in the component or added to the
// view by the model.
//
// **Which layer is safe by construction, and which two are not.** Written down because a structural
// guarantee nobody has recorded is one a later refactor removes without knowing it was load-bearing.
//
//   - `PriceBreakdownSurface` **cannot** render an unlabelled computed number. `AvailableBreakdown`
//     has no number-typed field anywhere — every leaf of it is a `string` — the component's props
//     are `{ id, ref, view, onClose }`, and it imports no pricing module and no copy module. It is
//     handed no number, so it has nothing to add. That is a real guarantee, not a test result, and
//     it is the reason the surface is not where a subtotal would come from.
//   - `PriceBreakdown`, the **container**, can. It holds `pricing: PricingResult` in scope and
//     renders JSX, so `<span>{pricing.priced.totalMinor + x}</span>` would compile and lint clean.
//   - `describePriceBreakdown`, the **model**, can. It could sum two lines, put the result through
//     `describeRoundedAmount`, and hand the surface one more ordinary `amountText`. The view being
//     number-free stops the component, not the model. **The model does no arithmetic today — no
//     `+` on any amount, only `map` and `filter` — but that is a property of the current code and
//     not of its types.**
//
// The count assertion exists for the second and third of those. It is built from the rows and the
// figure rather than from the view as a whole, so an amount the model invented as a new field
// cannot justify its own presence on the page.
//
// **The word sweep this replaced would have caught neither route**, which is why it is kept here as
// the last line rather than the first: a subtotal composed from numbers carries no word to sweep.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import {
  describePriceBreakdown,
  type AvailableBreakdown,
} from "@/price/price-breakdown-model";

import {
  RULED_TO_CONTAIN_A_SUM_WORD,
  SUM_CLAIM_WORDS,
} from "../support/ruled-price-copy";

/** Frame 2D itself. The mobile file is the priority surface and the only one carrying every frame;
 *  D2D draws the same sheet as a popover and its own disclaimer stops one clause short — see
 *  `ro.priceBreakdown.disclaimer` for why the fuller sentence is the one that ships. */
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

/** Re-derived rather than imported, so an agreement here is not an agreement with itself — the same
 *  discipline `starting-price.adversarial.test.ts` keeps with the same number. */
const ROUNDING_STEP_MDL = 1000;

/** The seeded design's breakdown, as the application builds it. */
function shippedBreakdown(): AvailableBreakdown {
  const view = describePriceBreakdown({
    pricing: priceDesign({
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

/** What a customer reads. Tags are stripped because an attribute is not copy and a class name is
 *  not a number. */
function visibleText(markup: string): string {
  return markup.replaceAll(/<[^>]*>/g, " ");
}

/** Every number a reader sees, in the order they see it. A grouped amount is **one** token —
 *  *"95 000"* is a figure, not a 95 beside a 000 — which is what lets an extra number be counted as
 *  an extra rather than disappearing into the grouping. */
function numberTokens(text: string): string[] {
  return text.match(/\d+(?: \d{3})*/g) ?? [];
}

/** Every number the surface is *entitled* to show, built from the rows and the one figure and from
 *  nothing else. Deliberately not "every number anywhere in the view": an extra amount added to the
 *  model as a new field would then justify itself, which is one of the two ways a subtotal can
 *  arrive. */
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

/** The `color` and `background` a rule paints with — the same reading `price-bar-layout.test.ts`
 *  does, so the third site is compared to the two it has to match rather than to a repeated hex. */
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
  it("heads the surface with frame 2D's title", () => {
    expect(ro.priceBreakdown.title).toBe("De ce acest preț");
    expect(FRAME_2D).toContain("De ce acest preț");
  });

  it("states the exclusions and the on-site measurement, verbatim", () => {
    // ADR 0036 decision 3 rides on the worktop clause: the worktop influences neither geometry nor
    // price, which is why wave 6K's depth control adds no price line. Weaken this sentence and that
    // reasoning loses the only place it is written down for a customer.
    expect(ro.priceBreakdown.disclaimer).toBe(
      "Preț de pornire, rotunjit în sus la mia de lei. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare.",
    );
    expect(FRAME_2D).toContain(ro.priceBreakdown.disclaimer);
  });

  it("names all three exclusions, so a copy edit cannot quietly drop one", () => {
    for (const excluded of ["transport", "blat", "electrocasnice"])
      expect(ro.priceBreakdown.disclaimer, excluded).toContain(excluded);
  });

  it("carries the rounding footnote that says the amounts do not add up", () => {
    expect(ro.priceBreakdown.note).toBe(
      "Toate sumele sunt prețuri de pornire, rotunjite în sus. Nu constituie ofertă comercială.",
    );
    expect(FRAME_2D).toContain(ro.priceBreakdown.note);
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
    // **`accessory` joined the record at wave 6T2**, and the key is what that wave is about: the
    // breakdown selected these rows by *"not a cabinet"*, so an accessory line found no word here
    // and rendered `undefined · Uscător de vase` while compiling (ADR 0092 decision 11). The word
    // itself is drafted copy, not ruled — frames 2D / D2D show no accessory row.
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
    // **The assertion that closes the purely numeric subtotal**: a rule and a bare `7 000` with no
    // label carries nothing to sweep for, and it still fails here, because it is a number nothing
    // accounts for. Order as well as count, which is free and says the rows did not merely happen
    // to total the right quantity of digits.
    const view = shippedBreakdown();

    expect(numberTokens(visibleText(renderedMarkup(view)))).toEqual(
      accountedForNumbers(view),
    );
  });

  it("would catch a subtotal that carries no words at all", () => {
    // The counterfactual, and the reason the assertion above is not vacuous. Nothing about this
    // element is lexically wrong — it is a number, and that is the whole problem with it.
    const view = shippedBreakdown();

    expect(
      numberTokens(visibleText(`${renderedMarkup(view)}<span>7 000</span>`)),
    ).not.toEqual(accountedForNumbers(view));
  });

  it("shows a figure the rendered rows do not add up to, by more than a whole step", () => {
    // The *reason* the rule exists, asserted on what is actually on the page rather than on the
    // priced lines behind it. Each amount is rounded up on its own, so a customer adding the rows
    // lands somewhere else entirely — and no element may present itself as their sum.
    const view = shippedBreakdown();
    const text = visibleText(renderedMarkup(view));
    const amountsOf = (tokens: string[]): number[] =>
      tokens.map((token) => Number(token.replaceAll(" ", "")));

    const rowTotal = amountsOf(
      [...view.groups.flatMap((group) => group.rows), ...view.wholeKitchenRows]
        .map((row) => row.amountText)
        .filter((amountText) => amountText !== ro.priceBreakdown.included),
    ).reduce((running, amount) => running + amount, 0);
    const figure = amountsOf(numberTokens(view.figure.amountText))[0] ?? 0;

    expect(text).toContain(view.figure.amountText);
    expect(rowTotal).toBeGreaterThan(figure + ROUNDING_STEP_MDL);
  });

  it("puts no sum-family word on the surface outside the two sentences ruled to carry one", () => {
    // The lexical axis, and the least of the three: it reads the **one** word list and the **one**
    // exception list the string-level guard reads, so the rule has a single set of literals however
    // many places assert it.
    //
    // The words only, not the `+` and `=` the copy sweep also refuses — the catalogue ships
    // *"Coloană cuptor + microunde"*, so a legitimate plus sign reaches this page from the
    // projection. `ruled-price-copy.ts` records why that difference is real rather than a
    // convenience.
    let text = visibleText(renderedMarkup());
    for (const ruled of RULED_TO_CONTAIN_A_SUM_WORD)
      text = text.replace(ruled, "");

    expect(text).not.toMatch(SUM_CLAIM_WORDS);
  });

  it("still reaches both excluded sentences on the surface, so neither exception has gone stale", () => {
    // The other half of an exception, and the half that rots quietly. Here the exclusion is a
    // `String.replace`, so a ruled sentence that stopped being rendered would make the strip a
    // no-op and leave the sweep passing about a surface it is no longer describing. The string
    // guard keeps the same assertion in its own terms; now that the list is shared, an exception
    // that died would otherwise die silently in two places at once.
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
    // The same claim the model suite makes, through the other entry point: `describePriceBreakdown`
    // is a second path a figure label can reach, and the figure is the bar's restated — reading it
    // as a sum of the lines is exactly what its label has to prevent.
    expect(shippedBreakdown()).toMatchObject({
      figure: { label: ro.price.startingPrefix },
    });
  });
});

describe("the flagged total wears the caution palette on this surface too", () => {
  it("paints it from the same two values the bar and §9's footer use", () => {
    // ADR 0065 decision 8, at its third site. The two shipped ones are held to each other by
    // `price-bar-layout.test.ts`; this is the third, and a third set of hexes nobody compares is how
    // one of them drifts into the refusal's red.
    // The bar's own copy of the palette moved with the sentence: ADR 0104 decision 8b took it out
    // of the top bar and onto the scene, so the pair is read from the surface it is now painted on.
    expect(
      paletteOf(readStylesheet("price-breakdown.module.css"), "overflow"),
    ).toEqual(
      paletteOf(readStylesheet("flagged-total-warning.module.css"), "warning"),
    );
  });
});
