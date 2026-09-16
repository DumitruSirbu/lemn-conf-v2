// Adversarial QA on the top bar, re-pointed by ADR 0104 — **53 px on mobile, frame D2A's declared
// 76 px on desktop, and the withdrawn settings strip's 45 px back.**
//
// **Two of this file's attacks died with the sum they attacked, and they are recorded rather than
// deleted.** The desktop band used to be `17.5 + 40 + 17.5 + 1` of padding around the locale chip,
// so this file guarded the sum's blind spots: a fifth child outside the modelled four, and the
// stylesheet's own prose restating the arithmetic. ADR 0104 takes frame D2A's **declared**
// `height: 76px` instead — the frame's 48 px CTA does not fit inside 40 — so there is no sum to
// have a blind spot and no prose to check against one. What replaces them is stronger and is the
// property the sum was standing in for: **every cell's content fits inside the declared band**, over
// the five cells the markup draws rather than the four a literal named.
//
// What this file still attacks, and all of it survives the restructure:
//
//   1. **A cell outside the model.** `top-bar-box.test.ts`'s `childHeights` names classes by hand.
//      Nothing ties that list to the markup, so a control added to the row would be silently outside
//      the check while the check went on reading as the band's contents.
//   2. **The price cell on a *flagged* design** — ADR 0082 Amendment A's own lesson, that *"a
//      containment assertion evaluated only on the input that cannot falsify it is not a gate"*. The
//      answer changed rather than the question: the owner ruled ADR 0065's sentence out of the cell
//      (ADR 0104 decision 8b), so what is asserted now is that **nothing in this cell can grow on a
//      flag at all** — which is what makes the header identical on both designs.
//   3. **The e2e's page-pixel constants**, re-measured against this band in a browser and carrying a
//      canvas origin that nothing else ties back to the CSS.
//
// Every number below is read out of the stylesheets, never written here, for the reason
// `top-bar-box.test.ts` gives: no type spans this arithmetic.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../../../src");
const CONFIGURE_DIRECTORY = resolve(SOURCE_ROOT, "app/configurator/configure");

const screenSource = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure-screen.tsx"),
  "utf8",
);
/** The band's fifth cell, which is a component of its own since the owner's 2026-09-10 dropdown
 *  ruling: the menu is positioned against the cell, so the two live in one file. */
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

/** The desktop band, **read rather than summed** (ADR 0104): frame D2A declares `height: 76px` and
 *  `.screen`'s desktop row track is where that declaration lives. Read again here so the comparisons
 *  below stand on the stylesheet rather than on `top-bar-box.test.ts`'s answer. */
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
  /** The class names the top bar's own cells are given in the screen's source — the five boxes the
   *  declared row has to hold. Read from the markup rather than listed here, which is the whole
   *  point: a sixth cell added later is outside `top-bar-box.test.ts`'s model and inside this. */
  function topBarCellClassNames(): readonly string[] {
    const beforeTheStage = screenSource.slice(
      0,
      screenSource.indexOf("styles.stage"),
    );
    // The locale cell is `<LocaleMenu />`'s own markup rather than the screen's, so its file is read
    // beside the screen's. The cell is still a grid item of the band and its classes still have to be
    // accounted for; leaving them out would let this check pass over a cell it stopped seeing.
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

  // **The non-vacuity `top-bar-box.test.ts` cannot state for itself.** Its height check names the
  // cells and their children as literals; this is what keeps those literals honest.
  it("draws exactly the cells and controls the height check models", () => {
    expect(topBarCellClassNames()).toEqual([
      "back",
      // The 3D chunk's loading placeholder, which stands where the canvas will be and is declared
      // before the stage in the source this reads.
      "loading",
      "locale",
      "localeCaret",
      "localeChip",
      "localeCode",
      // The open menu. It is absolutely positioned, so it takes no flow height in the band — which is
      // exactly why the height model may leave it out and this list may not.
      "localeList",
      "nav",
      "settings",
      "stepPill",
      "title",
      "wordmark",
    ]);
  });

  // The claim that replaces the withdrawn prose check: the frame's number is declared once, in one
  // place, and the cells take no vertical padding of their own — which is what makes the declared
  // height the whole story rather than a floor something else can raise.
  it("declares the frame's height once, and lets no cell add to it", () => {
    expect(DESKTOP_HEADER_HEIGHT_PX).toBe(76);
    expect(stylesheet.match(/grid-template-rows:\s*76px/g)).toHaveLength(1);
    expect(declarationsOf(DESKTOP_CSS, "nav")).toContain("padding-block: 0;");
  });
});

describe("the price cell, on the design the ruling was not measured against", () => {
  /** The desktop price cell's outer height. **It has one value now**, and that is the point of ADR
   *  0104 decision 8b: the owner ruled ADR 0065's flagged sentence out of this cell and onto the
   *  scene, so there is no wrapped sentence left in it for a flag to grow. */
  function priceCellHeightPx(): number {
    const desktopBar = declarationsOf(
      priceBarStylesheet.slice(
        priceBarStylesheet.indexOf(DESKTOP_BRANCH_OPENER),
      ),
      "bar",
    );
    // **Absent reads as none**, and here that is the truth rather than a fallback: frame D2A gives
    // the price column no inset of its own — the band's declared height is what centres it and the
    // row's `column-gap` is what spaces it.
    const barPadding = pixelsOf(desktopBar, "padding") ?? 0;
    // **One line, both shells** — the owner's price ruling of 2026-09-09 put frame D2A's inline
    // `de la 101 000 MDL` on the phone too, so the label stands beside the amount and the taller of
    // the two is the line rather than their sum.
    const figure = Math.max(
      fontOf(declarationsOf(priceBarStylesheet, "label")).sizePx,
      fontOf(declarationsOf(priceBarStylesheet, "amount")).sizePx,
    );
    return 2 * barPadding + figure;
  }

  it("fits inside the declared band with room to spare, so it cannot set the row", () => {
    expect(priceCellHeightPx()).toBeLessThan(DESKTOP_HEADER_HEIGHT_PX);
  });

  // **The attack, re-pointed at the answer rather than dropped.** It used to measure how many
  // wrapped lines of the flagged sentence this cell could absorb before it set the row — two, and
  // `1cc86d8` paid 9.28 px of canvas for the third. The owner's ruling of 2026-09-09 takes the
  // sentence out of the bar, so the honest assertion is that **the cell cannot grow on a flag at
  // all**: nothing in this stylesheet renders that sentence, and the header therefore draws
  // identically on a flagged design and a seeded one.
  it("carries no flagged-total sentence at all, which is what retires the 9.28 px", () => {
    expect(priceBarStylesheet).not.toMatch(/^\.overflow \{/m);
    expect(withoutComments(priceBarStylesheet)).not.toContain("flagRegion");
    expect(
      readFileSync(resolve(SOURCE_ROOT, "price/price-bar.tsx"), "utf8"),
    ).not.toContain("styles.overflow");
  });

  it("keeps that sentence on a surface the top bar's height does not depend on", () => {
    // Non-vacuity for the case above: the sentence still exists and is still rendered — it is drawn
    // over the scene, where growing costs the canvas no layout at all.
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

  /** The canvas origin the spec documents in prose, in the one sentence `clickScene` states it —
   *  the number every page-pixel constant in that file was found against. */
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

  // The link nothing else holds: the e2e's page-pixel origin is a *CSS* fact, and every click
  // coordinate in three specs was found against it. A padding edit here silently invalidates four
  // measured taps and two pixel patches in a suite this machine cannot run.
  it("starts the canvas where the stylesheets put it", () => {
    // **There is no second band to add any more** (ADR 0104 decision 2). The canvas begins at the
    // bottom of the one declared row, which is the whole of the desktop chrome.
    expect(documentedCanvasOriginY()).toBe(DESKTOP_HEADER_HEIGHT_PX);
  });

  it("accounts for every pixel of the viewport it was measured at", () => {
    const { headerPx, canvasPx, viewportPx } = documentedBands();

    expect(headerPx).toBe(DESKTOP_HEADER_HEIGHT_PX);
    expect(headerPx).toBe(documentedCanvasOriginY());
    expect(headerPx + canvasPx).toBe(viewportPx);
  });

  // The discipline `3949ecb` states for itself — *"the middle of their measured bands rather than
  // 25-30 px from an edge"* — and the one thing about a browser measurement that can be checked
  // without a browser: every tap must lie on the canvas the same file says exists.
  it("puts every tap inside the canvas box the spec declares", () => {
    const { viewportPx } = documentedBands();
    const originY = documentedCanvasOriginY();
    // **The taps moved on 2026-09-16 and this scan followed them.** They were four literals in
    // `editor-rail.desktop.e2e.spec.ts`; three specs each carried their own identical copies, and
    // M7 wave 7H made the camera a function of the room, so all of them went stale in one pass.
    // They now live once in `tests/e2e/support/desktop-scene-points.ts`, which also carries a
    // second group for the narrowed-room document — a canvas constant is a function of the room it
    // was measured on, and a suite driving two documents needs two sets.
    //
    // Every point in that module is scanned, including the origin of each measured pixel box: a box
    // whose corner is off the canvas frames nothing, which is the same failure this guard exists to
    // catch for a tap.
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
  // ADR 0082 decision 1, as amended: *"an invariant of the row, not a width that happens to fit
  // today's labels"* — and its mechanism, which `.settingsRow` states in its own comment: a grid
  // item's automatic minimum size is its min-content size, so an item in a `minmax(0, 1fr)` track
  // overflows that track unless it is zeroed.
  //
  // `.header` sits in exactly that track on desktop and declares no `min-width: 0`, and its title
  // is `flex: 0 0 auto` there — so no child can absorb a longer string and the band cannot shrink
  // to its column. It fits today's Romanian at 900 px, which a browser gate measures; what it does
  // not survive is a longer word, which M6B's whole purpose is to introduce.
  it("zeroes every top-bar cell's automatic minimum, so none can grow past its track", () => {
    // ADR 0082 decision 1 as amended, over the five cells that replaced the two: a grid item's
    // automatic minimum size is its min-content size, so an item that does not zero it overflows the
    // track it stands in. The nav's is give D — the title ellipsises rather than taking the pill's
    // residue — and the settings item's is what keeps the pill inside its own track.
    for (const cell of ["nav", "settings", "priceRow"])
      expect(
        `${declarationsOf(MOBILE_CSS, cell)}${declarationsOf(DESKTOP_CSS, cell)}`,
        cell,
      ).toContain("min-width: 0;");
  });

  it("leaves the title as the last thing that gives, and never the pill", () => {
    // Give D's order, ruled by ADR 0104 decision 8: the ladder, then the gaps, then the wordmark,
    // and only then the title. `flex: 0 1 auto` is what makes the title shrinkable at all, and the
    // ellipsis declarations it inherits are frame 2A's own.
    expect(declarationsOf(DESKTOP_CSS, "title")).toContain("flex: 0 1 auto;");
    expect(declarationsOf(MOBILE_CSS, "title")).toContain(
      "text-overflow: ellipsis;",
    );
  });
});
