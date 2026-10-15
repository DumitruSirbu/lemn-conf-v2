// The swatch chip promises the customer the colour the front will wear, so the panel must paint the
// adapter's own value and not a copy of it. The seam is a stylesheet, which cannot import a
// constant: `editor-panel.tsx` publishes the colour as a custom property on the button and the
// stylesheet reads it back. Nothing in the type system spans that hop, so the hazard is a future
// edit quietly re-inlining a hex into the CSS — where it would look right until the adapter's table
// changed and the chip started lying about the finish it sells.
//
// **Wave 6R made this stronger rather than merely bigger.** There used to be one custom property
// per finish, so the stylesheet held a rule per decor and a seventh decor would have needed one
// more; there is now **one** property carrying **one** hex per chip, and the stylesheet names no
// decor at all. The tests below assert that: not that six rules track six constants, but that no
// rule needs to.
import { PALETTE_ENTRIES, paletteFinish } from "@lemnaria/configurator-domain";
import { swatchOf } from "@lemnaria/three-adapter";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { declarationsFor } from "../support/css-declarations";

const PANEL_DIRECTORY = resolve(import.meta.dirname, "../../src/panel");

function readPanelSource(fileName: string): string {
  return readFileSync(resolve(PANEL_DIRECTORY, fileName), "utf8");
}

const componentSource = readPanelSource("editor-panel.tsx");
const stylesheetSource = readPanelSource("editor-panel.module.css");

const DECORS = PALETTE_ENTRIES.map(
  (entry) => [entry.entryId, swatchOf(paletteFinish(entry.entryId))] as const,
);

describe("the panel publishes the adapter's finish colours to its stylesheet", () => {
  it("publishes the chip's own colour as the one custom property", () => {
    expect(componentSource).toContain(
      '{ "--swatch-colour": chip.swatchColor }',
    );
  });

  // Every background the sheet gives the swatch, in any rule: the plain one and the wood's, and no third. Reading
  // only for the two declarations, a later rule painting the swatch some other colour left both of them in the text.
  it("paints the swatch from that property and from nothing else", () => {
    const backgrounds = declarationsFor(
      stylesheetSource,
      "swatchColor",
      "background",
    );

    expect(backgrounds.map(({ selector }) => selector)).toEqual([
      ".swatchColor",
      '.swatch[data-wood="true"] .swatchColor',
    ]);
    expect(backgrounds[0]?.value).toBe("var(--swatch-colour)");
    for (const property of ["background-color", "background-image"]) {
      expect(
        declarationsFor(stylesheetSource, "swatchColor", property),
      ).toEqual([]);
    }
  });

  it("derives a wood's grain from the same property rather than a second colour", () => {
    // The old oak swatch declared three hexes of its own, because oak had no publishable colour to
    // track. `color-mix` is what replaced them: one declared value, darkened for the stripe.
    const [, grain] = declarationsFor(
      stylesheetSource,
      "swatchColor",
      "background",
    );

    expect(grain?.value).toContain("color-mix(in srgb, var(--swatch-colour)");
    expect(grain?.value.match(/#[0-9a-f]{3,8}\b/gi)).toEqual(["#000"]);
  });

  it.each(DECORS)("keeps no literal copy of %s's hex", (_entryId, swatch) => {
    expect(stylesheetSource.toLowerCase()).not.toContain(
      swatch.color.toLowerCase(),
    );
  });

  it("names no decor in the stylesheet at all", () => {
    // The rule that makes a seventh decor free: a stylesheet that mentions an entry id is a
    // stylesheet that has to be edited when the palette grows, and that edit is where a hex
    // reappears.
    for (const entry of PALETTE_ENTRIES) {
      expect(stylesheetSource).not.toContain(entry.entryId);
    }
  });
});
