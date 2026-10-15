// Adversarial QA on the top bar (ADR 0104): the declared desktop band holds every cell the markup draws, the price
// cell cannot grow on a flagged design, and the e2e's page-pixel constants agree with the CSS. Every number is read
// out of the stylesheets, never written here, for the reason `top-bar-box.test.ts` gives.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../../../src");
const CONFIGURE_DIRECTORY = resolve(SOURCE_ROOT, "app/configurator/configure");

const screenSource = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure-screen.tsx"),
  "utf8",
);
/** The band's fifth cell, a component of its own: the menu is positioned against the cell, so the two live in one
 *  file. */
const localeMenuSource = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "locale-menu.tsx"),
  "utf8",
);
const stylesheet = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure.module.css"),
  "utf8",
);
const priceBarStylesheet = readFileSync(
  resolve(SOURCE_ROOT, "price/price-bar.module.css"),
  "utf8",
);
const desktopScenePoints = readFileSync(
  resolve(import.meta.dirname, "../../../e2e/support/desktop-scene-points.ts"),
  "utf8",
);

const desktopRailSpec = readFileSync(
  resolve(import.meta.dirname, "../../../e2e/editor-rail.desktop.e2e.spec.ts"),
  "utf8",
);

const DESKTOP_BRANCH_OPENER = "@media (min-width: 900px) {";

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Everything a class declares, from **every** block whose selector list names it: the top bar's
 *  five cells share one rule for the paint they have in common, and a reader that matched only
 *  `.nav {` would report that shared declaration as absent. Pseudo-elements are excluded — frame
 *  D2A's dividers are `::before`s and their declarations are not the cell's. */
function declarationsOf(css: string, rule: string): string {
  const flattened = withoutComments(css).replace(/@media[^{]*\{/g, "");
  const named = new RegExp(`\\.${rule}(?![\\w-]|::)`);
  return [...flattened.matchAll(/([^{}]*)\{([^}]*)\}/g)]
    .filter(([, selectors]) => named.test(selectors ?? ""))
    .map(([, , declarations]) => declarations ?? "")
    .join("");
}

function pixelsOf(declarations: string, property: string): number | undefined {
  const found = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`).exec(
    declarations,
  )?.[1];
  const pixels = /(-?[\d.]+)px/.exec(found ?? "")?.[1];
  return pixels === undefined ? undefined : Number(pixels);
}

/** The two lengths of a `font: <weight> <size>/<line-height> <family>` shorthand, which every rule
 *  in these two files spells that way. */
function fontOf(declarations: string): {
  sizePx: number;
  lineHeight: number;
} {
  const found = /font:\s*\d+\s+([\d.]+)px\/([\d.]+)\s/.exec(declarations);
  if (!found?.[1] || !found[2])
    throw new Error("no font shorthand this reading can use");
  return { sizePx: Number(found[1]), lineHeight: Number(found[2]) };
}

const [MOBILE_CSS, DESKTOP_CSS] = ((): readonly [string, string] => {
  const at = stylesheet.indexOf(DESKTOP_BRANCH_OPENER);
  if (at < 0) throw new Error("the screen declares no desktop branch");
  return [stylesheet.slice(0, at), stylesheet.slice(at)];
})();

/** The desktop band, read rather than summed (ADR 0104): `.screen`'s desktop row track holds frame D2A's declared
 *  `height: 76px`. Read again here so the comparisons stand on the stylesheet and not on `top-bar-box.test.ts`. */
const DESKTOP_HEADER_HEIGHT_PX = ((): number => {
  const rows = /grid-template-rows:\s*([^;]+);/.exec(
    declarationsOf(DESKTOP_CSS, "screen"),
  )?.[1];
  const declared = /(\d+(?:\.\d+)?)px/.exec(rows ?? "")?.[1];
  if (declared === undefined)
    throw new Error("the desktop screen declares no fixed top-bar row");
  return Number(declared);
})();

describe("the declared band models the row the markup actually draws", () => {
  /** The class names the top bar's own cells are given in the screen's source, read from the markup so a sixth cell
   *  added later is outside `top-bar-box.test.ts`'s model and inside this. */
  function topBarCellClassNames(): readonly string[] {
    const beforeTheStage = screenSource.slice(
      0,
      screenSource.indexOf("styles.stage"),
    );
    // The locale cell is `<LocaleMenu />`'s own markup, so its file is read beside the screen's; leaving it out would
    // pass over a cell this check stopped seeing.
    return [
      ...new Set(
        [
          ...`${beforeTheStage}${localeMenuSource}`.matchAll(
            /className=\{styles\.(\w+)\}/g,
          ),
        ].map((match) => match[1] ?? ""),
      ),
    ]
      .filter((name) => name !== "screen")
      .sort();
  }

  // `top-bar-box.test.ts` names the cells and their children as literals; this keeps those literals honest.
  it("draws exactly the cells and controls the height check models", () => {
    expect(topBarCellClassNames()).toEqual([
      "back",
      // The 3D chunk's loading placeholder, declared before the stage in the source this reads.
      "loading",
      "locale",
      "localeCaret",
      "localeChip",
      "localeCode",
      // The open menu is absolutely positioned and takes no flow height, so the height model may leave it out and this
      // list may not.
      "localeList",
      "nav",
      "settings",
      "stepPill",
      "title",
      "wordmark",
    ]);
  });

  // The frame's number is declared once and the cells take no vertical padding of their own, so the declared height
  // is the whole story rather than a floor something else can raise.
  it("declares the frame's height once, and lets no cell add to it", () => {
    expect(DESKTOP_HEADER_HEIGHT_PX).toBe(76);
    expect(stylesheet.match(/grid-template-rows:\s*76px/g)).toHaveLength(1);
    expect(declarationsOf(DESKTOP_CSS, "nav")).toContain("padding-block: 0;");
  });
});

describe("the price cell, on the design the ruling was not measured against", () => {
  /** The desktop price cell's outer height. It has one value: ADR 0104 decision 8b moved the flagged sentence out of
   *  this cell onto the scene, so a flag has nothing to grow. */
  function priceCellHeightPx(): number {
    const desktopBar = declarationsOf(
      priceBarStylesheet.slice(
        priceBarStylesheet.indexOf(DESKTOP_BRANCH_OPENER),
      ),
      "bar",
    );
    // Absent reads as none, which is true here: frame D2A gives the price column no inset; the band's declared height
    // centres it.
    const barPadding = pixelsOf(desktopBar, "padding") ?? 0;
    // One line on both shells (frame D2A's inline `de la 101 000 MDL`): the label stands beside the amount and the
    // taller
    // of the two is the line.
    const figure = Math.max(
      fontOf(declarationsOf(priceBarStylesheet, "label")).sizePx,
      fontOf(declarationsOf(priceBarStylesheet, "amount")).sizePx,
    );
    return 2 * barPadding + figure;
  }

  it("fits inside the declared band with room to spare, so it cannot set the row", () => {
    expect(priceCellHeightPx()).toBeLessThan(DESKTOP_HEADER_HEIGHT_PX);
  });

  // The flagged sentence left the bar (ADR 0104 decision 8b), so the cell cannot grow on a flag at all: nothing in
  // this stylesheet renders it, and the header draws identically on a flagged design and a seeded one.
  it("carries no flagged-total sentence at all, which is what retires the 9.28 px", () => {
    expect(priceBarStylesheet).not.toMatch(/^\.overflow \{/m);
    expect(withoutComments(priceBarStylesheet)).not.toContain("flagRegion");
    expect(
      readFileSync(resolve(SOURCE_ROOT, "price/price-bar.tsx"), "utf8"),
    ).not.toContain("styles.overflow");
  });

  it("keeps that sentence on a surface the top bar's height does not depend on", () => {
    // Non-vacuity: the sentence still exists and is drawn over the scene, where growing costs the canvas no layout.
    const scene = readFileSync(
      resolve(SOURCE_ROOT, "price/flagged-total-warning.module.css"),
      "utf8",
    );

    expect(scene).toContain("#fdf6ec");
    expect(
      readFileSync(
        resolve(SOURCE_ROOT, "price/flagged-total-warning.tsx"),
        "utf8",
      ),
    ).toContain("price-bar-overflow");
    expect(screenSource).toContain("<FlaggedTotalWarning />");
    expect(screenSource.indexOf("<FlaggedTotalWarning />")).toBeGreaterThan(
      screenSource.indexOf("styles.sceneFooter"),
    );
  });
});

describe("the desktop click constants the browser measured", () => {
  /** One `const NAME = <number>;` from the e2e spec, so the assertions below quote the spec rather
   *  than repeating it. */
  function constantIn(source: string, name: string): number {
    const found = new RegExp(`const ${name} = (\\d+);`).exec(source)?.[1];
    if (found === undefined)
      throw new Error(`${name} is no longer declared in the spec`);
    return Number(found);
  }

  /** The canvas origin the spec documents in the one sentence `clickScene` states it, which every page-pixel constant
   *  in that file was found against. */
  function documentedCanvasOriginY(): number {
    const found = /starts \*\*(\d+) px\*\* below the top of the screen/.exec(
      desktopRailSpec,
    )?.[1];
    if (found === undefined)
      throw new Error("the spec no longer states where the canvas starts");
    return Number(found);
  }

  function documentedBands(): {
    headerPx: number;
    canvasPx: number;
    viewportPx: number;
  } {
    const found =
      /Measured at 1440 × (\d+) on 2026-09-09: (\d+) \+ (\d+) = (\d+)/.exec(
        desktopRailSpec,
      );
    if (!found)
      throw new Error("the spec no longer states its band arithmetic");
    return {
      headerPx: Number(found[2]),
      canvasPx: Number(found[3]),
      viewportPx: Number(found[4]),
    };
  }

  // The e2e's page-pixel origin is a CSS fact and every click coordinate in three specs was found against it; a
  // padding edit here would silently invalidate them in a suite this machine cannot run.
  it("starts the canvas where the stylesheets put it", () => {
    // There is no second band: the canvas begins at the bottom of the one declared row (ADR 0104 decision 2).
    expect(documentedCanvasOriginY()).toBe(DESKTOP_HEADER_HEIGHT_PX);
  });

  it("accounts for every pixel of the viewport it was measured at", () => {
    const { headerPx, canvasPx, viewportPx } = documentedBands();

    expect(headerPx).toBe(DESKTOP_HEADER_HEIGHT_PX);
    expect(headerPx).toBe(documentedCanvasOriginY());
    expect(headerPx + canvasPx).toBe(viewportPx);
  });

  // Every tap must lie on the canvas the same file says exists, the one thing about a browser measurement that can be
  // checked without a browser.
  it("puts every tap inside the canvas box the spec declares", () => {
    const { viewportPx } = documentedBands();
    // The canvas's top edge is the stylesheet's declared row, not the spec's sentence about it: read from the
    // sentence, both sides of the comparison come from the e2e folder and a taller band moves neither.
    const originY = DESKTOP_HEADER_HEIGHT_PX;
    // Every point in `tests/e2e/support/desktop-scene-points.ts` is scanned, including the origin of each measured
    // pixel
    // box: a corner off the canvas frames nothing. The module carries a second group for the narrowed-room document,
    // since
    // a canvas constant is a function of the room it was measured on.
    const taps = [
      ...desktopScenePoints.matchAll(
        /(\w+)(?::\s*\w+)?\s*[=:]\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)/g,
      ),
    ];
    expect(
      taps.length,
      "the desktop scene points module declares no points at all",
    ).toBe(8);

    for (const [, name, x, y] of taps) {
      expect(Number(y), `${name ?? ""} above the canvas`).toBeGreaterThan(
        originY,
      );
      expect(Number(y), `${name ?? ""} below the canvas`).toBeLessThan(
        viewportPx,
      );
      expect(Number(x), `${name ?? ""} past the viewport`).toBeLessThan(
        constantIn(desktopRailSpec, "VIEWPORT_WIDTH_PX"),
      );
    }
  });
});

describe("nothing on the desktop top bar can grow past its own column", () => {
  // ADR 0082 decision 1, as amended: an invariant of the row, not a width that happens to fit today's labels.
  it("zeroes every top-bar cell's automatic minimum, so none can grow past its track", () => {
    // A grid item's automatic minimum size is its min-content size, so an item that does not zero it overflows the
    // track
    // it stands in. The nav's is give D (the title ellipsises); the settings item's keeps the pill inside its track.
    for (const cell of ["nav", "settings", "priceRow"])
      expect(
        `${declarationsOf(MOBILE_CSS, cell)}${declarationsOf(DESKTOP_CSS, cell)}`,
        cell,
      ).toContain("min-width: 0;");
  });

  it("leaves the title as the last thing that gives, and never the pill", () => {
    // Give D's order (ADR 0104 decision 8): the ladder, then the gaps, then the wordmark, and only then the title;
    // `flex: 0 1 auto` is what makes the title shrinkable at all.
    expect(declarationsOf(DESKTOP_CSS, "title")).toContain("flex: 0 1 auto;");
    expect(declarationsOf(MOBILE_CSS, "title")).toContain(
      "text-overflow: ellipsis;",
    );
  });
});
