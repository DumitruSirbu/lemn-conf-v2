// Adversarial QA on wave W4's top bar (`901d1cf`, `2a35b9f`, `a453d11`, `73cac86`, `3949ecb`) and
// on the owner's 2026-09-07 ruling: **48 px on mobile, 76 px on desktop, 21 px of canvas.**
//
// `top-bar-box.test.ts` reads the four desktop declarations out of the stylesheet and adds them up,
// so its 76 is **derived and not a twin** — mutating `.header`'s padding or `.locale`'s height takes
// it red, which this file's report records. What that arithmetic cannot see is what this file
// attacks:
//
//   1. **A fifth child.** `childHeights` models four class names by hand. Nothing ties that list to
//      the markup, so an element added to the `<header>` — a locale *button* when M6B wave 6B-i
//      wires one, a material chip, anything — would be silently outside the sum while the sum went
//      on reading as the band's height.
//   2. **The stylesheet's own prose.** `configure.module.css` says the 76 is *"`17.5 + 40 + 17.5` of
//      padding around the chip, plus the 1 px rule"*. ADR 0082's context names a comment stating a
//      layout claim no test holds as the way this project inherited its last containment defect.
//   3. **The price cell on a *flagged* design.** The row's height is the taller of the header and
//      the price cell, and the cell's arithmetic there stops at the figure. ADR 0065 puts a wrapped
//      sentence in that cell, and ADR 0082 Amendment A's own lesson is that *"a containment
//      assertion evaluated only on the input that cannot falsify it is not a gate"* — the flagged
//      design is precisely the input that was not measured.
//   4. **The e2e's page-pixel constants**, which were re-measured against this band in a browser
//      (`3949ecb`) and now carry a 121 px canvas origin that nothing ties back to the CSS.
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
const stylesheet = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure.module.css"),
  "utf8",
);
const priceBarStylesheet = readFileSync(
  resolve(SOURCE_ROOT, "price/price-bar.module.css"),
  "utf8",
);
const globals = readFileSync(resolve(SOURCE_ROOT, "app/globals.css"), "utf8");
const desktopRailSpec = readFileSync(
  resolve(import.meta.dirname, "../../../e2e/editor-rail.desktop.e2e.spec.ts"),
  "utf8",
);

const DESKTOP_BRANCH_OPENER = "@media (min-width: 900px) {";

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declarationsOf(css: string, rule: string): string {
  return (
    new RegExp(`\\.${rule} \\{([^}]*)\\}`).exec(withoutComments(css))?.[1] ?? ""
  );
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

function required(value: number | undefined, what: string): number {
  if (value === undefined) throw new Error(`${what} declares no pixel value`);
  return value;
}

const [MOBILE_CSS, DESKTOP_CSS] = ((): readonly [string, string] => {
  const at = stylesheet.indexOf(DESKTOP_BRANCH_OPENER);
  if (at < 0) throw new Error("the screen declares no desktop branch");
  return [stylesheet.slice(0, at), stylesheet.slice(at)];
})();

/** The desktop band, by the same four declarations `top-bar-box.test.ts` sums, read again here so
 *  the comparisons below stand on the stylesheet rather than on that file's answer. */
const DESKTOP_HEADER_PADDING_PX = required(
  pixelsOf(declarationsOf(DESKTOP_CSS, "header"), "padding"),
  ".header's desktop padding",
);
const DESKTOP_CHIP_HEIGHT_PX = required(
  pixelsOf(declarationsOf(DESKTOP_CSS, "locale"), "height"),
  ".locale's desktop height",
);
const HEADER_RULE_PX = required(
  pixelsOf(declarationsOf(MOBILE_CSS, "header"), "border-bottom"),
  ".header's rule",
);
const DESKTOP_HEADER_HEIGHT_PX =
  2 * DESKTOP_HEADER_PADDING_PX + DESKTOP_CHIP_HEIGHT_PX + HEADER_RULE_PX;

describe("the arithmetic models the band the markup actually draws", () => {
  /** The class names the `<header>` element applies directly to its own children — the boxes an
   *  `align-items: center` row takes its height from. `.localeCode` and `.localeCaret` are inside
   *  the chip and are not among them. */
  function headerChildClassNames(): readonly string[] {
    const header = /<header[\s\S]*?<\/header>/.exec(screenSource)?.[0];
    if (!header) throw new Error("no header element in the screen's source");
    const withoutChip = header.replace(
      /<span className=\{styles\.locale\}[\s\S]*?<\/span>\s*<\/span>/,
      "<span className={styles.locale}></span>",
    );
    return [...withoutChip.matchAll(/className=\{styles\.(\w+)\}/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => name !== "header");
  }

  // **The non-vacuity `top-bar-box.test.ts` cannot state for itself.** Its `childHeights` names four
  // classes as a literal; this is what keeps that literal honest. A fifth child — the locale
  // *button* M6B wave 6B-i is going to wire, most obviously — would otherwise be taller than the
  // chip with nothing red.
  it("draws exactly the four boxes the height sum measures", () => {
    expect([...headerChildClassNames()].sort()).toEqual([
      "back",
      "locale",
      "stepPill",
      "title",
      "wordmark",
    ]);
  });

  // The stylesheet states the sum in prose twice — once in `.header`'s own comment and once in the
  // desktop branch — and the prose is what the next reader will trust. ADR 0082's context is
  // explicit that a layout claim no test holds is how the last containment defect was inherited.
  it("declares the numbers its own comment says it declares", () => {
    const claim =
      /`([\d.]+) \+ (\d+) \+ ([\d.]+)` of padding around the chip,\s*\n?\s*\*? ?plus the (\d+) px rule/.exec(
        stylesheet,
      );
    if (!claim)
      throw new Error(
        "the desktop branch no longer states its own arithmetic in prose",
      );

    expect(Number(claim[1]), "the comment's leading inset").toBe(
      DESKTOP_HEADER_PADDING_PX,
    );
    expect(Number(claim[2]), "the comment's chip").toBe(DESKTOP_CHIP_HEIGHT_PX);
    expect(Number(claim[3]), "the comment's trailing inset").toBe(
      DESKTOP_HEADER_PADDING_PX,
    );
    expect(Number(claim[4]), "the comment's rule").toBe(HEADER_RULE_PX);
  });
});

describe("the price cell, on the design the ruling was not measured against", () => {
  /** The desktop price cell's outer height with `lines` wrapped lines of ADR 0065's flagged-total
   *  sentence in it — the element `price-bar.tsx` renders as `price-bar-overflow`, which
   *  `top-bar-box.test.ts`'s own price-cell arithmetic stops short of.
   *
   *  `.flagRegion` is `display: contents`, so the warning is a direct flex child of `.bar` beside
   *  the figure and the taller of the two sets the cell. */
  function priceCellHeightPx(lines: number): number {
    const bar = declarationsOf(
      priceBarStylesheet.slice(
        priceBarStylesheet.indexOf(DESKTOP_BRANCH_OPENER),
      ),
      "bar",
    );
    const barPadding = required(pixelsOf(bar, "padding"), ".bar's padding");
    const rule = required(
      pixelsOf(bar, "border-bottom"),
      ".bar's desktop rule",
    );
    const figure =
      required(
        pixelsOf(declarationsOf(priceBarStylesheet, "figure"), "gap"),
        ".figure's gap",
      ) +
      fontOf(declarationsOf(priceBarStylesheet, "label")).sizePx +
      fontOf(declarationsOf(priceBarStylesheet, "amount")).sizePx;

    const warning = declarationsOf(priceBarStylesheet, "overflow");
    const { sizePx, lineHeight } = fontOf(warning);
    const warningHeight =
      lines === 0
        ? 0
        : 2 * required(pixelsOf(warning, "padding"), ".overflow's padding") +
          lines * sizePx * lineHeight;

    return 2 * barPadding + Math.max(figure, warningHeight) + rule;
  }

  it("agrees with the sibling file's own figure when nothing is flagged", () => {
    // The bridge between the two derivations: `top-bar-box.test.ts` pins the unflagged cell at 53.5,
    // so a reading here that quietly measured something else could not go on to say anything about
    // the flagged one.
    expect(priceCellHeightPx(0)).toBe(53.5);
  });

  // **The boundary, stated as a number rather than as a hope.** The header is the taller of the two
  // grid items — which is the whole property `top-bar-box.test.ts`'s price-cell test exists to
  // establish — only while the flagged sentence stays inside this many lines. Past it the *price
  // cell* sets the desktop row, the band is no longer the ruled 76, and the canvas pays more than
  // the 21 px the owner accepted, on a design the customer reaches by making one cabinet too wide.
  //
  // Two is what the six declarations currently buy. It is asserted so that a padding or type-scale
  // edit that spends the margin is met here, and it is *not* a claim about how many lines the
  // Romanian sentence takes at `max-width: 320px` — only a browser can say that, and no test in
  // this repository does.
  it("absorbs exactly two wrapped lines of the flagged-total warning", () => {
    const absorbed = [0, 1, 2, 3, 4, 5].filter(
      (lines) => priceCellHeightPx(lines) <= DESKTOP_HEADER_HEIGHT_PX,
    );

    expect(Math.max(...absorbed)).toBe(2);
    expect(priceCellHeightPx(3)).toBeGreaterThan(DESKTOP_HEADER_HEIGHT_PX);
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
    stripPx: number;
    canvasPx: number;
    viewportPx: number;
  } {
    const found =
      /Measured at 1440 × (\d+) on 2026-09-08: (\d+) \+ (\d+) \+ (\d+) = (\d+)/.exec(
        desktopRailSpec,
      );
    if (!found)
      throw new Error("the spec no longer states its band arithmetic");
    return {
      headerPx: Number(found[2]),
      stripPx: Number(found[3]),
      canvasPx: Number(found[4]),
      viewportPx: Number(found[5]),
    };
  }

  // The link nothing else holds: the e2e's page-pixel origin is a *CSS* fact, and every click
  // coordinate in three specs was found against it. A padding edit here silently invalidates four
  // measured taps and two pixel patches in a suite this machine cannot run.
  it("starts the canvas where the stylesheets put it", () => {
    // The strip's own band, and derived for the same reason the header's is: `--touch-target` is
    // the floor `global-settings.module.css` gives the chips and the trigger, and the rule is the
    // band's own. `45 = 44 + 1` is what the e2e spec's prose says it measured.
    const stripPx =
      required(pixelsOf(globals, "--touch-target"), "--touch-target") +
      required(
        pixelsOf(declarationsOf(MOBILE_CSS, "settingsRow"), "border-bottom"),
        ".settingsRow's rule",
      );

    expect(documentedCanvasOriginY()).toBe(DESKTOP_HEADER_HEIGHT_PX + stripPx);
  });

  it("accounts for every pixel of the viewport it was measured at", () => {
    const { headerPx, stripPx, canvasPx, viewportPx } = documentedBands();

    expect(headerPx).toBe(DESKTOP_HEADER_HEIGHT_PX);
    expect(headerPx + stripPx).toBe(documentedCanvasOriginY());
    expect(headerPx + stripPx + canvasPx).toBe(viewportPx);
  });

  // The discipline `3949ecb` states for itself — *"the middle of their measured bands rather than
  // 25-30 px from an edge"* — and the one thing about a browser measurement that can be checked
  // without a browser: every tap must lie on the canvas the same file says exists.
  it("puts every tap inside the canvas box the spec declares", () => {
    const { viewportPx } = documentedBands();
    const originY = documentedCanvasOriginY();
    const taps = [
      ...desktopRailSpec.matchAll(/const (\w+) = \{ x: (\d+), y: (\d+) \};/g),
    ];
    expect(taps.length, "the spec declares no taps at all").toBe(4);

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
  it("zeroes the header's automatic minimum, as its sibling band does", () => {
    expect(declarationsOf(MOBILE_CSS, "settingsRow")).toContain(
      "min-width: 0;",
    );
    expect(
      `${declarationsOf(MOBILE_CSS, "header")}${declarationsOf(DESKTOP_CSS, "header")}`,
    ).toContain("min-width: 0;");
  });
});
