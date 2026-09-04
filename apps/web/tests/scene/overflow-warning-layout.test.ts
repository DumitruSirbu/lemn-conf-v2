// The layout half of the scene warning's 390 × 844 gate. `overflow-warning-viewport.test.ts` asserts
// that every body still projects into a scene the customer can work in once the band takes its
// height; that only means anything while the band is a **flow sibling** of the scene's box rather
// than an overlay on it, and no type spans that hop — it is a stylesheet.
//
// So these read the files as text, exactly as `price-bar-layout.test.ts` does for the price bar: the
// reserved height is published once from TypeScript, the one property that would silently break the
// gate is refused by name, and the two surfaces ADR 0065 decision 8 keeps apart are held apart by
// their palettes.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OVERFLOW_WARNING_RESERVED_HEIGHT_PX } from "@/scene/overflow-warning-layout";

const SOURCE_DIRECTORY = resolve(import.meta.dirname, "../../src");

function read(relativePath: string): string {
  return readFileSync(resolve(SOURCE_DIRECTORY, relativePath), "utf8");
}

const componentSource = read("scene/overflow-warning.tsx");
const warningStylesheet = read("scene/overflow-warning.module.css");
const screenStylesheet = read(
  "app/configurator/configure/configure.module.css",
);
const screenSource = read("app/configurator/configure/configure-screen.tsx");
const barStylesheet = read("price/price-bar.module.css");
const panelStylesheet = read("panel/editor-panel.module.css");

/** The declarations only. Each of these files names in prose the properties its own guard forbids,
 *  which is exactly the false positive a text guard has to rule out. */
const warningDeclarations = warningStylesheet.replace(/\/\*[\s\S]*?\*\//g, "");

/** Code with its comments removed, for the same reason: a guard that reads prose reports the
 *  sentence describing the rule as a breach of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

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

describe("the band's reserved height reaches the stylesheet from one constant", () => {
  it("is published as a custom property by the component", () => {
    expect(componentSource).toContain(
      '"--overflow-warning-height": `${String(OVERFLOW_WARNING_RESERVED_HEIGHT_PX)}px`',
    );
  });

  it("is read back by the stylesheet as a floor, not a fixed height", () => {
    expect(warningStylesheet).toContain(
      "min-height: var(--overflow-warning-height);",
    );
  });

  it("keeps no literal copy of the number", () => {
    expect(warningStylesheet).not.toContain(
      `${String(OVERFLOW_WARNING_RESERVED_HEIGHT_PX)}px`,
    );
  });
});

// **Revised by wave 6G, and the direction is the opposite of what this suite first asserted.** The
// band was a flow row above the scene until 6G added an unconditional settings row: §9's sheet is
// pinned to the viewport, so every band above the stage comes out of the strip of scene left visible
// above it, and a second one took that strip from 83.75 px to 26.81 — under the 44 px touch target
// that makes the sheet dismissable. `scene/overflow-warning-layout.ts` carries the table. So the
// assertions below now hold the band **out of flow**, which is exactly what the earlier ones forbade.
describe("the warning is an overlay on the scene, taking none of its height", () => {
  it("stands inside the viewport, beside the bodies it explains", () => {
    // Wave 6M: the sentence renders in the scene viewport rather than in the header, the panel or a
    // banner elsewhere on the screen.
    expect(screenSource).toMatch(
      /<div className=\{styles\.viewport\}>[\s\S]*<OverflowWarning \/>/,
    );
  });

  it("is pinned to the scene box's bottom edge by the footer stack", () => {
    // Bottom rather than top, and that is the load-bearing half: the clearance problem the flow
    // version measured is *above* the kitchen, where the camera chips live. The bottom edge has no
    // chips and sits directly above the price bar.
    expect(screenStylesheet).toMatch(
      /\.sceneFooter \{[^}]*position: absolute;/s,
    );
    expect(screenStylesheet).toMatch(/\.sceneFooter \{[^}]*bottom: 0;/s);
    expect(screenStylesheet).toMatch(
      /\.sceneFooter \{[^}]*flex-direction: column;/s,
    );
  });

  it("leaves the viewport a single box, so the canvas is its whole height", () => {
    // The conditional-height defect the overlay exists to avoid: a flow band makes the canvas one
    // height for a flagged design and another for an unflagged one, and every canvas tap constant
    // then has two correct values. A positioned viewport with no track for the band has one.
    expect(screenStylesheet).toMatch(/\.viewport \{[^}]*position: relative;/s);
    expect(screenStylesheet).not.toMatch(
      /\.viewport \{[^}]*grid-template-rows/s,
    );
    expect(screenStylesheet).not.toContain(".sceneBox");
  });

  it("stacks below the orbit hint rather than on top of it", () => {
    // The two are both bottom-anchored overlays. Pinned independently the 56 px band would be drawn
    // straight through the hint pill, which sat 16 px off the same edge.
    const footerMarkup =
      /<div className=\{styles\.sceneFooter\}>([\s\S]*?)<\/div>\s*<\/div>/.exec(
        screenSource,
      )?.[1];
    expect(
      footerMarkup,
      "the scene footer stack is not in the markup",
    ).toBeDefined();
    expect(footerMarkup).toContain("scene-hint");
    expect(footerMarkup).toContain("<OverflowWarning />");
    expect(footerMarkup?.indexOf("scene-hint")).toBeLessThan(
      footerMarkup?.indexOf("<OverflowWarning />") ?? -1,
    );
  });

  it("lets a tap reach the cabinets it is drawn over", () => {
    // It stands on the lowest cabinets' plinth line by 6.8–13.7 px (measured in
    // `overflow-warning-viewport.test.ts`), and ADR 0065 requires a marked body to stay selectable.
    expect(screenStylesheet).toMatch(
      /\.sceneFooter \{[^}]*pointer-events: none;/s,
    );
  });

  it("is opaque, because it is read against the kitchen rather than against paper", () => {
    expect(warningDeclarations).toMatch(/background:\s*#fdf6ec;/);
  });

  it("puts no text of its own on the screen", () => {
    // The owner's ruled sentence is in `ro.ts`. A word injected by a pseudo-element would survive an
    // edit to that constant invisibly — right in the content module and wrong on screen.
    expect(warningDeclarations).not.toMatch(/[^-]content:/);
  });
});

describe("the warning never wears the refusal's colours", () => {
  it("paints in the caution palette the flagged total already uses", () => {
    // One visual language for "this design reaches past a wall", read from three surfaces.
    expect(paletteOf(warningStylesheet, "warning")).toEqual(
      paletteOf(barStylesheet, "overflow"),
    );
  });

  it("keeps clear of the rejection banner's palette", () => {
    // ADR 0065 decision 8: *your edit did not happen* and *your edit happened, and its result does
    // not fit* are opposite statements. In one red the customer cannot tell which they are reading.
    expect(paletteOf(warningStylesheet, "warning")).not.toEqual(
      paletteOf(panelStylesheet, "rejection"),
    );
  });
});

// **Swept, not enumerated.** ADR 0065 decision 8 says the scene warning and §9's rejection banner
// must not share a surface, and decision 7b says the scene warning and the flagged total are not
// interchangeable. A guard that *lists* the files forbidden to render the sentence cannot be wrong
// about a file it has never been shown — the forgotten-member shape ADR 0069 decision 4 rejected for
// validation severity — and here the forgotten members arrive on their own: M8's review screen,
// wave 6N's coverage bars, anything that grows a reason to explain an overflow.
//
// So the sweep is over the whole of `src/` and the **allow**-list is one file long.
/** The dotted read, and **not** the bare identifier `overflowWarning`.
 *
 *  The bare one was tried first and is wrong, which is worth recording rather than rediscovering:
 *  `PricedBar.overflowWarning` is the price bar's field for ADR 0065's **flagged total** — a
 *  different sentence, ruled separately, and legitimately carrying the same field name. Sweeping the
 *  identifier flags five files that are doing exactly what they should. The dotted form names the
 *  content key and nothing else.
 *
 *  It does not catch a destructured read (`const { overflowWarning } = ro.configure`). Recorded as a
 *  known hole rather than closed, because the only way to close it is the bare identifier above. */
const SENTENCE_KEY = "configure.overflowWarning";

/** The only module permitted to read the constant, relative to `src/`. */
const SENTENCE_OWNER = "scene/overflow-warning.tsx";
const SENTENCE_ALLOWED = [SENTENCE_OWNER];

/** Every `.ts`/`.tsx` module under `src/`, so a surface added later is swept the day it lands. */
function sourceModulePaths(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    const entries = readdirSync(resolve(SOURCE_DIRECTORY, directory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        found.push(path);
    }
  };
  walk("");
  return found.sort();
}

describe("one surface reads the sentence", () => {
  it("sweeps a source tree big enough for the guard to mean something", () => {
    // Not vacuous: the allow-list is one file among many, and the file it names is really there.
    const paths = sourceModulePaths();

    expect(paths.length).toBeGreaterThan(40);
    for (const allowed of SENTENCE_ALLOWED) expect(paths).toContain(allowed);
  });

  it("is named by the scene warning and by no other module under src/", () => {
    // The bare identifier, so a destructured read (`const { overflowWarning } = ro.configure`) is
    // caught as well as a dotted one. Comments are stripped first for the reason the declaration
    // guard above strips them: this file, and `ro.ts`, name in prose exactly what they forbid in
    // code, and a cross-reference in a doc comment is not a second surface rendering the sentence.
    const trespassers = sourceModulePaths().filter(
      (path) =>
        !SENTENCE_ALLOWED.includes(path) &&
        withoutComments(read(path)).includes(SENTENCE_KEY),
    );

    expect(trespassers).toEqual([]);
  });

  it("is earned by the one allowed module, so the entry is not dead weight", () => {
    expect(withoutComments(read(SENTENCE_OWNER))).toContain(
      `ro.${SENTENCE_KEY}`,
    );
  });
});
