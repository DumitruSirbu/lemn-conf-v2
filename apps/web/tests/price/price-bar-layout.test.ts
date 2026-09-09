// The layout half of the 390 × 844 gate. `price-bar-viewport.test.ts` asserts that every body
// projects above the bar's band; that only means anything while the bar is a **flow sibling** of the
// stage rather than an overlay on it, and no type spans that hop — it is a stylesheet.
//
// So these read the two files as text, exactly as `finish-swatch-colors.test.ts` does for the
// swatch hexes: the reserved height is published once from TypeScript, and the one property that
// would silently break the gate — positioning the bar over the scene — is refused by name.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PRICE_BAR_RESERVED_HEIGHT_PX } from "@/price/price-bar-layout";

const PRICE_DIRECTORY = resolve(import.meta.dirname, "../../src/price");
const CONFIGURE_DIRECTORY = resolve(
  import.meta.dirname,
  "../../src/app/configurator/configure",
);

const componentSource = readFileSync(
  resolve(PRICE_DIRECTORY, "price-bar.tsx"),
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
    // `ro.ts` and wrong on screen — so the stylesheet is held to declaring no `content` at all.
    expect(barDeclarations).not.toMatch(/[^-]content:/);
  });

  it("is never positioned out of flow", () => {
    // The one edit that would break the gate above while leaving every other test green: an
    // absolutely positioned bar sits over the scene, and the scene's box stops being what is left.
    expect(barDeclarations).not.toMatch(/position:\s*(absolute|fixed)/);
  });
});
