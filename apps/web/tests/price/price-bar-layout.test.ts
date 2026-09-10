// The layout half of the 390 × 844 gate. `price-bar-viewport.test.ts` asserts that every body
// projects above the bar's band; that only means anything while the bar is a **flow sibling** of the
// stage rather than an overlay on it, and no type spans that hop — it is a stylesheet.
//
// So these read the two files as text, exactly as `finish-swatch-colors.test.ts` does for the
// swatch hexes: the reserved height is published once from TypeScript, and the one property that
// would silently break the gate — positioning the bar over the scene — is refused by name.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  KITCHEN_L_BODY_CATALOG,
  OVERFLOWING_KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { PRICE_BAR_RESERVED_HEIGHT_PX } from "@/price/price-bar-layout";
import { describePriceBar, type PricedBar } from "@/price/price-bar-model";
import {
  PSEUDO_LOCALE_CLOSING_MARK,
  PSEUDO_LOCALE_EXPANSION,
  PSEUDO_LOCALE_OPENING_MARK,
  pseudoLocalizeCatalogue,
  stressableLetterCountOf,
} from "@/i18n/pseudo-locale";

import { CATALOGUES, contentFor, requireLeafAt } from "../support/catalogues";

const PRICE_DIRECTORY = resolve(import.meta.dirname, "../../src/price");
const CONFIGURE_DIRECTORY = resolve(
  import.meta.dirname,
  "../../src/app/configurator/configure",
);

const componentSource = readFileSync(
  resolve(PRICE_DIRECTORY, "price-bar.tsx"),
  "utf8",
);
const breakdownStylesheet = readFileSync(
  resolve(PRICE_DIRECTORY, "price-breakdown.module.css"),
  "utf8",
);

const barStylesheet = readFileSync(
  resolve(PRICE_DIRECTORY, "price-bar.module.css"),
  "utf8",
);

/** The declarations only. This file's own commentary names the property it forbids, which is
 *  exactly the false positive a text guard has to rule out. */
const barDeclarations = barStylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
const screenStylesheet = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure.module.css"),
  "utf8",
);
const panelStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../src/panel/editor-panel.module.css"),
  "utf8",
);
/** The flagged total's own stylesheet since ADR 0104 decision 8b, which is where the caution palette
 *  the assertions below compare against now lives. The palette did not change; the surface did. */
const flaggedTotalStylesheet = readFileSync(
  resolve(PRICE_DIRECTORY, "flagged-total-warning.module.css"),
  "utf8",
);

/** The `color` and `background` a rule paints with, which is all these assertions compare. */
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

describe("the bar's reserved height reaches the stylesheet from one constant", () => {
  it("is published as a custom property by the component", () => {
    expect(componentSource).toContain(
      '"--price-bar-height": `${String(PRICE_BAR_RESERVED_HEIGHT_PX)}px`',
    );
  });

  it("is read back by the stylesheet as a floor, not a fixed height", () => {
    expect(barStylesheet).toContain("min-height: var(--price-bar-height);");
  });

  it("keeps no literal copy of the number", () => {
    expect(barStylesheet).not.toContain(
      `${String(PRICE_BAR_RESERVED_HEIGHT_PX)}px`,
    );
  });
});

// ADR 0065 decision 8, at the one place the fix for the mobile flag put the two sentences on one
// surface: §9's sheet now carries both the rejection banner and the flagged total.
describe("the flag never wears the refusal's colours", () => {
  it("paints the footer flag in the bar's caution palette, from the same two values", () => {
    expect(paletteOf(panelStylesheet, "footerPriceWarning")).toEqual(
      paletteOf(flaggedTotalStylesheet, "warning"),
    );
  });

  it("keeps it clear of the rejection banner's palette on the same sheet", () => {
    // The adjacency decision 8 exists to police: *your edit did not happen* and *your edit happened,
    // and here is what the number contains* are opposite statements. In one red on one sheet the
    // customer cannot tell which they are reading.
    expect(paletteOf(panelStylesheet, "footerPriceWarning")).not.toEqual(
      paletteOf(panelStylesheet, "rejection"),
    );
  });
});

describe("the bar is placed beside the scene, never over it", () => {
  it("takes a grid area of its own on the screen", () => {
    expect(screenStylesheet).toContain("grid-area: price;");
    expect(screenStylesheet).toContain("grid-area: stage;");
  });

  it("leaves the scene's own box unpositioned, so nothing can be drawn inside it", () => {
    // §9's sheet is anchored to the screen and covers the bar; the stage is a plain grid area. If
    // the stage became a positioning context again, the sheet would stop at the bar's top edge and
    // the strip of scene above it would collapse.
    expect(screenStylesheet).toMatch(/\.screen \{[^}]*position: relative;/s);
    expect(screenStylesheet).not.toMatch(/\.stage \{[^}]*position:/s);
  });

  it("puts no text of its own on the screen", () => {
    // The owner's 2026-09-03 ruling dropped the separator from the unchanged label. A separator
    // injected by a pseudo-element would survive that edit invisibly — the string would be right in
    // `ro.json` and wrong on screen — so the stylesheet is held to declaring no `content` at all.
    expect(barDeclarations).not.toMatch(/[^-]content:/);
  });

  it("is never positioned out of flow", () => {
    // The one edit that would break the gate above while leaving every other test green: an
    // absolutely positioned bar sits over the scene, and the scene's box stops being what is left.
    expect(barDeclarations).not.toMatch(/position:\s*(absolute|fixed)/);
  });
});

// **Wave 6B-i's length stress, on the first of the two surfaces the plan names.**
//
// Romanian is the source and it is a short language; the languages this product will be translated
// into run 30–50 % longer. `src/i18n/pseudo-locale.ts` makes that visible before a translator has
// been paid, and the bar is where it shows: the label, the figure and ADR 0065's flagged sentence
// share one row on a 390 px phone.
//
// The stressed catalogue is driven through the **real** model rather than compared as strings, so
// what is asserted is the sentence the bar would actually be handed.
describe("the bar under a translation 40 % longer than its Romanian source", () => {
  /** The transform's opening and closing marks, which belong to no sentence. */
  const MARK_CHARACTERS = 2;
  const stressedContent = contentFor(
    "ro",
    pseudoLocalizeCatalogue(CATALOGUES[0][1]),
  );
  const stressedBar = describePriceBar({
    content: stressedContent,
    pricing: priceDesign({
      design: OVERFLOWING_KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    }),
  });

  /** The bar in the state that puts the most text in the row: priced, and flagged. */
  function pricedBar(): PricedBar {
    if (stressedBar.kind !== "priced")
      throw new Error(`the fixture priced as ${stressedBar.kind}`);
    return stressedBar;
  }

  it("is really stressed, so nothing below is a claim about the short sentence", () => {
    const source = requireLeafAt(CATALOGUES[0][1], "price.startingPrefix");

    // The two marks are excluded, so the growth claimed is the sentence's own; and the proportion
    // is of the letters a translator writes rather than of the whole string, which for a leaf with
    // arguments in it would be asking the tool to pad an argument name.
    expect(
      stressedContent.price.startingPrefix.length - MARK_CHARACTERS,
    ).toBeGreaterThanOrEqual(
      source.length +
        Math.ceil(stressableLetterCountOf(source) * PSEUDO_LOCALE_EXPANSION),
    );
  });

  it("hands the bar every stressed sentence whole, cutting nothing on the way", () => {
    // Both marks, on both sentences: a surface that truncated would keep the opening mark and lose
    // the closing one, which is exactly what the marks are for.
    for (const sentence of [
      pricedBar().figure.label,
      pricedBar().figure.amountText,
      pricedBar().overflowWarning,
    ]) {
      expect(sentence).toContain(PSEUDO_LOCALE_OPENING_MARK);
      expect(sentence).toContain(PSEUDO_LOCALE_CLOSING_MARK);
    }
  });

  it("reserves its band as a floor and declares nothing that would cut the longer line", () => {
    // The reserve is already asserted to be a `min-height` above. What this adds is the other half:
    // a longer sentence has to be able to *spend* that floor, so the bar may declare no ceiling and
    // no truncation. `text-overflow` is included because an ellipsis is a cut with a nicer glyph.
    expect(barStylesheet).toContain("min-height: var(--price-bar-height);");
    for (const ceiling of [
      "max-height:",
      "overflow: hidden",
      "white-space: nowrap",
      "text-overflow:",
      "line-clamp:",
    ]) {
      expect(barDeclarations, ceiling).not.toContain(ceiling);
    }
  });
});

/** **The two surfaces state the same figure and must state it the same way.** The bar and the
 *  breakdown sheet's footer both render one `PriceFigure`, within a tap of each other, and until
 *  2026-09-10 they disagreed: the bar said *"de la 86 000 MDL"* on one baseline while the footer
 *  stacked `DE LA` above the amount in small letter-spaced capitals. The owner ruled them
 *  consistent.
 *
 *  Nothing caught that drift, because no case asserted either treatment — which is why this one
 *  exists rather than a note. It reads both stylesheets and requires the *same* three properties,
 *  so bringing one back into line by editing only the other fails here. */
describe("the sheet's footer figure and the bar's figure are one treatment", () => {
  const ruleFor = (sheet: string, selector: string): string => {
    const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(sheet);
    if (match?.[1] === undefined) throw new Error(`no ${selector} rule found`);
    return match[1];
  };

  it("lays both out as a baseline-aligned row rather than a stack", () => {
    for (const [name, sheet] of [
      ["bar", barStylesheet],
      ["breakdown", breakdownStylesheet],
    ] as const) {
      const figure = ruleFor(sheet, ".figure");
      expect(figure, name).toContain("flex-direction: row");
      expect(figure, name).toContain("align-items: baseline");
      expect(figure, name).not.toContain("flex-direction: column");
    }
  });

  it("sets the prefix regular and the amount bold, at one size, in both", () => {
    // The owner's second ruling of 2026-09-10: the prefix qualifies the figure and should not
    // compete with it, so weight is what separates them and size is what joins them.
    for (const [name, labelRule, amountRule] of [
      [
        "bar",
        ruleFor(barStylesheet, ".label"),
        ruleFor(barStylesheet, ".amount"),
      ],
      [
        "breakdown",
        ruleFor(breakdownStylesheet, ".figureLabel"),
        ruleFor(breakdownStylesheet, ".figureAmount"),
      ],
    ] as const) {
      expect(labelRule, name).toContain("400 21px/1");
      expect(labelRule, name).toContain("text-transform: lowercase");
      expect(labelRule, name).not.toContain("uppercase");
      expect(amountRule, name).toContain("700 21px/1");
    }
  });

  it("keeps `lowercase` off the container, which would take `MDL` down with it", () => {
    for (const [name, sheet] of [
      ["bar", barStylesheet],
      ["breakdown", breakdownStylesheet],
    ] as const) {
      expect(ruleFor(sheet, ".figure"), name).not.toContain("text-transform");
    }
  });
});
