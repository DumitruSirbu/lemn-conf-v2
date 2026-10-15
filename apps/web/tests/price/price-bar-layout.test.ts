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
const barDeclarations = withoutComments(barStylesheet);
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
/** The third and fourth surfaces `describeStartingPrice` feeds. Neither is a price module, and that
 *  is exactly why they were left behind when the first two were brought into line. */
const settingsStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../src/settings/global-settings.module.css"),
  "utf8",
);

/** The `color` and `background` a rule paints with, which is all these assertions compare. Read out
 *  of the base cascade through the one extractor below, so a Prettier reflow cannot make this
 *  disagree with the figure cases about what counts as a rule. */
function paletteOf(stylesheet: string, ruleName: string): [string, string] {
  const block = declarationsOf(baseCascadeOf(stylesheet), `.${ruleName}`);
  if (block === "") throw new Error(`no .${ruleName} rule to read`);
  const colour = /(?<!-)color:\s*([^;]+);/.exec(block)?.[1];
  const background = /background:\s*([^;]+);/.exec(block)?.[1];
  if (!colour || !background)
    throw new Error(`.${ruleName} declares no colour pair`);
  return [colour.trim(), background.trim()];
}

/** One cascade a browser can be in: the rules outside every `@media`, and each block's own rules.
 *  A declaration in `base` is in force in all of them; one in a block is in force in that block
 *  only, on top of the base. */
interface StyleContext {
  readonly query: string;
  readonly css: string;
}

const BASE_CONTEXT_QUERY = "base";

function withoutComments(stylesheet: string): string {
  return stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
}

function baseCascadeOf(stylesheet: string): string {
  const base = contextsOf(stylesheet)[0];
  if (base === undefined) throw new Error("the stylesheet has no base cascade");
  return base.css;
}

/** Every context the stylesheet declares, base first. Brace-walked rather than matched, because a
 *  regex for `@media … { … }` stops at the first inner `}` and would hand back a truncated block —
 *  the same first-match blindness this file's figure cases exist to rule out. */
function contextsOf(stylesheet: string): readonly StyleContext[] {
  const css = withoutComments(stylesheet);
  const blocks: StyleContext[] = [];
  let base = "";
  let cursor = 0;

  while (cursor < css.length) {
    const start = css.indexOf("@media", cursor);
    if (start === -1) {
      base += css.slice(cursor);
      break;
    }
    base += css.slice(cursor, start);
    const open = css.indexOf("{", start);
    if (open === -1) throw new Error("an @media rule opens no block");
    const close = closingBraceAt(css, open);
    blocks.push({
      query: css.slice(start, open).trim(),
      css: css.slice(open + 1, close),
    });
    cursor = close + 1;
  }

  return [{ query: BASE_CONTEXT_QUERY, css: base }, ...blocks];
}

function closingBraceAt(css: string, open: number): number {
  let depth = 0;
  for (let cursor = open; cursor < css.length; cursor += 1) {
    if (css[cursor] === "{") depth += 1;
    else if (css[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  throw new Error("an @media rule is never closed");
}

/** **Every** declaration the cascade makes for one selector, in source order — not the first rule
 *  that matches. A selector list counts for each name in it, and whitespace between the name and
 *  the brace is the formatter's business rather than this file's. */
function declarationsOf(css: string, selector: string): string {
  const blocks: string[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = (rule[1] ?? "").split(",").map((each) => each.trim());
    if (names.includes(selector)) blocks.push(rule[2] ?? "");
  }
  return blocks.join("\n");
}

/** The weight and size a span ends up set in, once the declarations are read in order and the last
 *  one wins — which is what a browser does and what a single-match reader cannot do. */
interface Typeface {
  readonly weight: string;
  readonly size: string;
}

function typefaceOf(declarations: string, selector: string): Typeface {
  let weight: string | undefined;
  let size: string | undefined;

  for (const [, property, value] of declarations.matchAll(
    /([a-z-]+):\s*([^;]+);/g,
  )) {
    if (property === "font") {
      const declared = (value ?? "").trim();
      const shorthand = /^(\d+)\s+([\d.]+px)/.exec(declared);
      if (!shorthand)
        throw new Error(
          `${selector}'s font shorthand is unreadable: ${declared}`,
        );
      weight = shorthand[1];
      size = shorthand[2];
    } else if (property === "font-size") size = (value ?? "").trim();
    else if (property === "font-weight") weight = (value ?? "").trim();
  }

  if (weight === undefined || size === undefined)
    throw new Error(`${selector} is never given a weight and a size`);
  return { weight, size };
}

describe("the bar's reserved height reaches the stylesheet from one constant", () => {
  // That the component publishes it is read off the rendered bar's own `style`, in
  // `price-bar-states.adversarial.test.ts` ("publishes the reserved height on the bar it renders"): the literal
  // kept in a constant nothing renders reads the same in the source as one that is published.

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

/** **Four surfaces state the same figure, and they must state it the same way.**
 *
 *  `describeStartingPrice` feeds the price bar, the breakdown sheet's footer, the global settings
 *  sheet's footer and the editor panel's footer. Until 2026-09-10 the bar said *"de la 86 000 MDL"*
 *  on one baseline while the other three stacked `DE LA` above the amount in small letter-spaced
 *  capitals; the owner ruled them consistent, and the first fix reached two of the four because
 *  nobody counted the callers.
 *
 *  **What is asserted is the invariant, not the numbers.** Per surface and per media context: the
 *  label and the amount are set at the same size, the label at 400 and the amount at 700. A
 *  responsive override that moves both stays green; one that moves either alone fails — which is the
 *  defect a first-match reader could not see, and there was one: a pre-existing desktop rule left
 *  `price-breakdown.module.css` rendering the prefix at 21 px over an amount at 20.
 */
const FIGURE_SURFACES = [
  {
    name: "the price bar",
    stylesheet: barStylesheet,
    container: ".figure",
    label: ".label",
    amount: ".amount",
  },
  {
    name: "the breakdown sheet's footer",
    stylesheet: breakdownStylesheet,
    container: ".figure",
    label: ".figureLabel",
    amount: ".figureAmount",
  },
  {
    name: "the global settings sheet's footer",
    stylesheet: settingsStylesheet,
    container: ".figure",
    label: ".figureLabel",
    amount: ".figureAmount",
  },
  {
    name: "the editor panel's footer",
    stylesheet: panelStylesheet,
    container: ".footerPrice",
    label: ".footerPriceLabel",
    amount: ".footerPriceAmount",
  },
] as const;

type FigureSurface = (typeof FIGURE_SURFACES)[number];

/** The declarations in force for one span in one context: the base cascade first, then the block's
 *  own, which is the order a browser resolves them in. */
function resolvedFor(
  surface: FigureSurface,
  context: StyleContext,
  selector: string,
): string {
  const base = declarationsOf(baseCascadeOf(surface.stylesheet), selector);
  return context.query === BASE_CONTEXT_QUERY
    ? base
    : `${base}\n${declarationsOf(context.css, selector)}`;
}

describe("every surface that states the starting price states it one way", () => {
  it.each(FIGURE_SURFACES)(
    "lays $name out as a baseline row rather than a stack",
    (surface) => {
      for (const context of contextsOf(surface.stylesheet)) {
        const container = resolvedFor(surface, context, surface.container);

        expect(container, context.query).toContain("flex-direction: row");
        expect(container, context.query).toContain("align-items: baseline");
        expect(container, context.query).not.toContain(
          "flex-direction: column",
        );
      }
    },
  );

  it.each(FIGURE_SURFACES)(
    "sets $name's prefix regular and its amount bold, at one size, in every media context",
    (surface) => {
      // The owner's second ruling of 2026-09-10: the prefix qualifies the figure and must not
      // compete with it, so weight is what separates the two spans and size is what joins them.
      for (const context of contextsOf(surface.stylesheet)) {
        const label = typefaceOf(
          resolvedFor(surface, context, surface.label),
          surface.label,
        );
        const amount = typefaceOf(
          resolvedFor(surface, context, surface.amount),
          surface.amount,
        );

        expect(label.weight, `${surface.name} @ ${context.query}`).toBe("400");
        expect(amount.weight, `${surface.name} @ ${context.query}`).toBe("700");
        expect(label.size, `${surface.name} @ ${context.query}`).toBe(
          amount.size,
        );
      }
    },
  );

  it.each(FIGURE_SURFACES)(
    "keeps `lowercase` on $name's label alone, where it cannot take `MDL` down with it",
    (surface) => {
      for (const context of contextsOf(surface.stylesheet)) {
        expect(
          resolvedFor(surface, context, surface.container),
          context.query,
        ).not.toContain("text-transform");
      }
      expect(
        declarationsOf(baseCascadeOf(surface.stylesheet), surface.label),
      ).toContain("text-transform: lowercase");
    },
  );

  /** **The case that keeps the three above honest.** The reader they were written with used
   *  `RegExp(…).exec()` — first match only — so a `@media` override was invisible to it and every
   *  claim passed over a stylesheet that broke all three one query down. If a future edit made the
   *  reader blind again, the cases would go quiet rather than red; this one goes red, because it
   *  requires the sweep to actually find the overrides that exist. */
  it("reads past the base cascade, so the cases above are not blind to an override", () => {
    const overriding = FIGURE_SURFACES.filter((surface) =>
      contextsOf(surface.stylesheet)
        .filter((context) => context.query !== BASE_CONTEXT_QUERY)
        .some(
          (context) =>
            declarationsOf(context.css, surface.label) !== "" ||
            declarationsOf(context.css, surface.amount) !== "",
        ),
    ).map((surface) => surface.name);

    expect(overriding).toContain("the breakdown sheet's footer");
    expect(overriding).toContain("the global settings sheet's footer");
  });
});
