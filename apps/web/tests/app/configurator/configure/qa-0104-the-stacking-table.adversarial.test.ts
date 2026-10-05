// Asserts `configure.module.css`'s stacking table as an ordering between layers, computed from the stylesheets' own
// declarations so a number moved in one file cannot leave the table saying something else. A `z-index` other than
// `auto` on a grid or flex item establishes a stacking context even while `position: static`; every cell is a grid
// item of `.screen`, so a surface nested in a cell paints no higher than the cell, whatever it declares for itself.
// The declarations are read back as text, as `top-bar-box.test.ts` does; the browser half is `elementFromPoint`
// inside the overlap.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = resolve(import.meta.dirname, "../../../../src");

const STYLESHEETS = {
  configure: read("app/configurator/configure/configure.module.css"),
  rail: read("panel/editor-panel.module.css"),
  breakdown: read("price/price-breakdown.module.css"),
  priceBar: read("price/price-bar.module.css"),
  settings: read("settings/global-settings.module.css"),
};

function read(relativePath: string): string {
  return readFileSync(resolve(SOURCE, relativePath), "utf8");
}

/** Comments are stripped before any rule is read: these files' prose names the very classes below, so a parser that
 *  kept it would read a rule's number against a neighbour's name. */
function withoutComments(stylesheet: string): string {
  return stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The `z-index` a class ends up with: the last matching block wins, the cascade's answer at equal specificity
 * (`.settings` is declared twice on purpose). Throws rather than defaulting, since answering `0` for a class that left
 * the table would turn a moved layer into a passing comparison.
 */
function zIndexOf(stylesheet: string, className: string): number {
  const declared = [
    ...withoutComments(stylesheet).matchAll(/(?:^|\n)([^{}@]+?)\{([^{}]*)\}/g),
  ].filter(([, selectors]) => namesTheClass(selectors ?? "", className));
  const withZIndex = declared
    .map(([, , body]) => /z-index:\s*(-?\d+)\s*;/.exec(body ?? "")?.[1])
    .filter((value): value is string => value !== undefined);
  const last = withZIndex.at(-1);
  if (last === undefined) {
    throw new Error(
      `No rule in this stylesheet declares a z-index for .${className}.`,
    );
  }
  return Number(last);
}

/**
 * The first block's number, which is the mobile shell's: `zIndexOf` takes the last (the desktop media query's), and the
 * price cell declares a different layer per shell. Kept separate so the mobile half cannot rot unwatched.
 */
function baseZIndexOf(stylesheet: string, className: string): number {
  const declared = [
    ...withoutComments(stylesheet).matchAll(/(?:^|\n)([^{}@]+?)\{([^{}]*)\}/g),
  ].filter(([, selectors]) => namesTheClass(selectors ?? "", className));
  const first = declared
    .map(([, , body]) => /z-index:\s*(-?\d+)\s*;/.exec(body ?? "")?.[1])
    .find((value): value is string => value !== undefined);
  if (first === undefined) {
    throw new Error(
      `No rule in this stylesheet declares a z-index for .${className}.`,
    );
  }
  return Number(first);
}

/** `.settings` must not match `.settingsRow`, and a selector list is comma-separated. */
function namesTheClass(selectors: string, className: string): boolean {
  return selectors
    .split(",")
    .some((selector) => new RegExp(`\\.${className}(?![\\w-])`).test(selector));
}

/** The five layers the table names, each read from the file that declares it. */
const LAYER = {
  nav: zIndexOf(STYLESHEETS.configure, "nav"),
  locale: zIndexOf(STYLESHEETS.configure, "locale"),
  actions: zIndexOf(STYLESHEETS.configure, "actions"),
  priceCell: zIndexOf(STYLESHEETS.configure, "priceRow"),
  settingsItem: zIndexOf(STYLESHEETS.configure, "settings"),
  rail: zIndexOf(STYLESHEETS.rail, "shell"),
  /** What the popover declares for itself, which is not what it paints at; read so the two can be compared. */
  breakdownDeclares: zIndexOf(STYLESHEETS.breakdown, "anchor"),
  priceBar: zIndexOf(STYLESHEETS.priceBar, "bar"),
} as const;

/** A surface paints no higher than the cell it is nested in; the breakdown's popover lives inside the price cell. */
const BREAKDOWN_POPOVER_PAINTS_AT = Math.min(
  LAYER.breakdownDeclares,
  LAYER.priceCell,
);

describe("the premise — every layer the table names still declares a number", () => {
  /** Non-vacuity for every comparison below: each figure is read from a stylesheet, and a rule that stopped declaring
   *  one makes `zIndexOf` throw. Pinned as a set so a layer that changed number shows in this file's diff. */
  it("reads the numbers the head comment's table writes down", () => {
    expect(LAYER).toEqual({
      nav: 2,
      locale: 6,
      actions: 2,
      priceCell: 5,
      settingsItem: 7,
      rail: 4,
      breakdownDeclares: 6,
      priceBar: 2,
    });
  });

  /** The breakdown's surface is a descendant of the price cell, so the cell's context bounds it; read off the
   *  markup. */
  it("mounts the breakdown inside the price cell", () => {
    const screen = read("app/configurator/configure/configure-screen.tsx");
    const priceCell = /styles\.priceRow[\s\S]*?<\/div>/.exec(screen)?.[0] ?? "";

    expect(priceCell).toContain("<PriceBreakdown");
  });
});

describe("what the restructure bought, and which must stay bought", () => {
  /** The price cell must sit above `.actions`: tied at the band's shared `2` it loses on tree order, and the action row
   *  covers the open sheet's close button at 390 x 844. */
  it("puts the price cell above the action row, and not level with it", () => {
    expect(LAYER.priceCell).toBeGreaterThan(LAYER.actions);
  });

  /** The settings sheet is modal on **both** shells, so its scrim has to cover every one of them. */
  it("puts the settings item above every other layer on the screen", () => {
    for (const [name, layer] of Object.entries(LAYER)) {
      if (name === "settingsItem") continue;
      expect(LAYER.settingsItem, name).toBeGreaterThan(layer);
    }
  });

  /** Asked of the cell, not `.bar`'s own `2`: `.bar` is nested in `.priceRow` and paints at the cell's layer. Mobile
   *  only: on desktop the price cell deliberately stands above the rail so the breakdown's popover clears the panel,
   *  whereas on mobile §9 is a sheet covering the band, so the rail wins. */
  it("keeps §9's rail above the band it overlaps when a cabinet is selected, on mobile", () => {
    expect(LAYER.rail).toBeGreaterThan(LAYER.nav);
    expect(LAYER.rail).toBeGreaterThan(
      baseZIndexOf(STYLESHEETS.configure, "priceRow"),
    );
  });

  /**
   * The mobile half of the price cell, which `LAYER.priceCell` (the last declaration, the desktop one) no longer sees.
   * Above `.actions`, or the open breakdown sheet's `Închide` is covered and only a reload gets out; below §9's panel,
   * which covers the band the bar stands in on this shell.
   */
  it("leaves the mobile price cell between the action row and §9's sheet", () => {
    const mobilePriceCell = baseZIndexOf(STYLESHEETS.configure, "priceRow");

    expect(mobilePriceCell).toBe(3);
    expect(mobilePriceCell).toBeGreaterThan(LAYER.actions);
    expect(mobilePriceCell).toBeLessThan(LAYER.rail);
    // And the two shells really do differ, so this case is not a second reading of the same number.
    expect(mobilePriceCell).not.toBe(LAYER.priceCell);
  });
});

describe("the table's fourth row, checked against the table's own rule", () => {
  /**
   * The head comment places the breakdown's popover above §9's rail, but a surface nested in a cell paints no
   * higher than that cell and the popover is nested in the price cell. So `price-breakdown.module.css`'s own number
   * only matters while the price cell does not cap it below the rail.
   */
  it("lets the popover paint above the rail, which is what the table claims", () => {
    expect(
      BREAKDOWN_POPOVER_PAINTS_AT,
      `the breakdown's popover declares ${String(LAYER.breakdownDeclares)} but is nested in the ` +
        `price cell, which declares ${String(LAYER.priceCell)}, so it paints at ` +
        `${String(BREAKDOWN_POPOVER_PAINTS_AT)} — under §9's rail at ${String(LAYER.rail)}`,
    ).toBeGreaterThan(LAYER.rail);
  });

  /** The same claim from the other end: lowering the rail instead of raising the cell would still pass. */
  it("leaves no layer between the price cell and the popover's own declaration", () => {
    expect(LAYER.rail).not.toBeGreaterThan(LAYER.priceCell);
  });
});

describe("the same rule, reaching the locale cell's new menu", () => {
  /** The list is a child of `.locale`, so the cell's context bounds it exactly as the price cell bounds the breakdown's
   *  popover; read off the markup. */
  it("mounts the language list inside the locale cell", () => {
    const menu = read("app/configurator/configure/locale-menu.tsx");
    const cell = /styles\.locale}[\s\S]*?<\/div>/.exec(menu)?.[0] ?? "";

    expect(cell).toContain("styles.localeList");
  });

  /** At the band's shared `2` the menu would drop over §9's desktop rail at `4` and paint under it whenever a
   *  cabinet is selected: a dropdown that opens into nothing. */
  it("lets the open menu paint above the rail it drops over", () => {
    expect(
      LAYER.locale,
      `the language menu is nested in the locale cell, which declares ${String(LAYER.locale)}, so ` +
        `it paints at that layer — and §9's rail is at ${String(LAYER.rail)}`,
    ).toBeGreaterThan(LAYER.rail);
  });

  /** And it stays under the one surface that must cover everything: the settings sheet is modal on
   *  both shells, so a menu above its scrim would be operable behind a modal. */
  it("keeps the menu under the settings sheet's scrim", () => {
    expect(LAYER.locale).toBeLessThan(LAYER.settingsItem);
  });
});
