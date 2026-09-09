// **Adversarial QA of ADR 0104's re-derived stacking order.**
//
// `configure.module.css`'s head writes the order down as a table and gives the reason it had to be
// re-derived: *"this is the property that took 44 of 58 e2e specs down in wave 6K-b3 and it is being
// re-decided by the restructure."* The table reads:
//
//     | nav, settings' own paint, actions, locale | 2 |
//     | the price cell                            | 3 |
//     | §9's desktop rail                         | 4 |
//     | the breakdown's popover                   | 6 |
//     | the settings item, its scrim, its sheet    | 7 |
//
// and beside it the rule that makes it a table rather than a list, stated exactly and correctly:
//
// > **a `z-index` other than `auto` on a *grid or flex item* establishes a stacking context even
// > while that item is `position: static`. Every cell above is a grid item of `.screen`, so every
// > number above is a context and not a level in one shared stack: a surface nested in a cell can
// > only ever paint as high as *the cell*, whatever it declares for itself.**
//
// **The table's fourth row does not survive its own rule.** The breakdown's popover is nested inside
// the price cell — `configure-screen.tsx` puts `<PriceBreakdown />` in `.priceRow`, and
// `price-breakdown.module.css`'s desktop `.anchor` is a flex item of it — so by the rule above the
// highest it can paint is **the price cell's 3**, and §9's rail declares **4**. The `6` in the table
// is the number the popover declares for itself and is exactly the number the rule says not to read.
//
// This file asserts the table **as an ordering between layers**, computed from the four stylesheets'
// own declarations rather than restated, so a number moved in one file cannot leave the table saying
// something else. There is no type spanning that arithmetic — it is CSS — so the declarations are
// read back as text, which is the shape `top-bar-box.test.ts` and `price-bar-layout.test.ts` already
// use for the same reason. The browser half of the same claim is `elementFromPoint` inside the
// overlap; this is the half that runs on a machine with no browser.
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

/** Comments are stripped before any rule is read. These files carry long prose blocks that name the
 *  very classes below — the price cell's own comment says *"it has to clear `.actions`"* — so a
 *  parser that kept them would read a rule's number against a neighbour's name. */
function withoutComments(stylesheet: string): string {
  return stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The `z-index` a class ends up with, read out of the stylesheet's own declarations.
 *
 * **The last matching block wins**, which is the cascade's answer for the rules this file reads:
 * every one of them is a single class selector at equal specificity, and `.settings` is declared
 * twice on purpose — once with the band's shared `2` and once with its own `7`.
 *
 * Throws rather than defaulting: a class that has stopped declaring a `z-index` has left the table,
 * and answering `0` for it would turn a moved layer into a passing comparison.
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
 * **The *first* block's number, which is the mobile shell's.**
 *
 * `zIndexOf` above takes the last, which is the cascade's answer at the width the desktop media
 * query applies at — and since 2026-09-09 the price cell declares a different layer per shell, so
 * "the last one" is only half the table. Read separately rather than by widening `zIndexOf`, because
 * the two answers are about two shells and collapsing them into one number is what would let the
 * mobile half rot unwatched.
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
  /** **What the popover declares for itself**, which the file's own rule says is not what it paints
   *  at. Read so the two can be compared rather than conflated. */
  breakdownDeclares: zIndexOf(STYLESHEETS.breakdown, "anchor"),
  priceBar: zIndexOf(STYLESHEETS.priceBar, "bar"),
} as const;

/** **The cell a surface is nested in is the highest it can paint** — the rule the head comment
 *  states, applied. The breakdown's popover lives inside the price cell. */
const BREAKDOWN_POPOVER_PAINTS_AT = Math.min(
  LAYER.breakdownDeclares,
  LAYER.priceCell,
);

describe("the premise — every layer the table names still declares a number", () => {
  /** **Non-vacuity for every comparison below** (ADR 0093): each figure is read out of a
   *  stylesheet, and a rule that stopped declaring one would make `zIndexOf` throw rather than let
   *  an ordering pass over a default. Pinned as a set so a layer that quietly changed number is
   *  visible in the diff of this file. */
  it("reads the numbers the head comment's table writes down", () => {
    expect(LAYER).toEqual({
      nav: 2,
      locale: 2,
      actions: 2,
      priceCell: 5,
      settingsItem: 7,
      rail: 4,
      breakdownDeclares: 6,
      priceBar: 2,
    });
  });

  /** The structural fact the whole file rests on: the breakdown's surface is a descendant of the
   *  price cell, so the cell's context bounds it. Read off the markup rather than assumed. */
  it("mounts the breakdown inside the price cell", () => {
    const screen = read("app/configurator/configure/configure-screen.tsx");
    const priceCell = /styles\.priceRow[\s\S]*?<\/div>/.exec(screen)?.[0] ?? "";

    expect(priceCell).toContain("<PriceBreakdown");
  });
});

describe("what the restructure bought, and which must stay bought", () => {
  /** `0efcbbd`'s fix: at the band's shared `2` the price cell tied with `.actions` and lost on tree
   *  order, which put the action row over the open sheet and left its close button unreachable at
   *  390 x 844. */
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

  /** **The price half is asked of the cell, not of `.bar`'s own number.** `.bar` declares `2`, but it
   *  is nested in `.priceRow` and so paints at *the cell's* layer — the rule this whole file exists
   *  to state. Comparing against the `2` would pass while saying nothing about what a customer sees.
   *
   *  It is the **mobile** cell, and the shell is named because the desktop one deliberately goes the
   *  other way: at `5` the price cell stands *above* the rail, which is what lets the breakdown's
   *  popover clear the panel. On mobile §9 is a sheet that covers the band, so the rail must win. */
  it("keeps §9's rail above the band it overlaps when a cabinet is selected, on mobile", () => {
    expect(LAYER.rail).toBeGreaterThan(LAYER.nav);
    expect(LAYER.rail).toBeGreaterThan(
      baseZIndexOf(STYLESHEETS.configure, "priceRow"),
    );
  });

  /**
   * **The mobile half of the price cell, which `LAYER.priceCell` no longer sees.** That figure is
   * the last declaration in the file and so is the desktop one; the base rule is the phone's, and it
   * carries `0efcbbd`'s close-button fix.
   *
   * Both bounds matter and they point opposite ways. Above `.actions` is what puts the open
   * breakdown sheet over the action row — without it the sheet's `Închide` is covered and the only
   * way out of the sheet is a reload. Below §9's panel is what keeps the price bar *under* the
   * editor sheet, which on this shell covers the band the bar stands in: the desktop cell is raised
   * past the panel and the phone's must not follow it there.
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
   * **The finding.** The head comment places the breakdown's popover above §9's rail, and the same
   * comment's own rule says a surface nested in a cell paints no higher than that cell. The popover
   * is nested in the price cell, which declares `3`; the rail declares `4`.
   *
   * At `55c0a9b~1` this held, and by the rule rather than in spite of it: `.priceRow` declared **no
   * `z-index` at all**, so it established no context and the desktop `.anchor`'s own `6` reached the
   * root stacking context — above the rail, exactly as `price-breakdown.module.css` still says it
   * does. The restructure gave the cell a number, first `2` and then `3`, and capped the popover
   * with it.
   *
   * Reproduced in isolation in headless Chromium at 1440 x 900 with nothing but these declarations:
   * `elementFromPoint` inside the two boxes' overlap returns the rail.
   */
  it("lets the popover paint above the rail, which is what the table claims", () => {
    expect(
      BREAKDOWN_POPOVER_PAINTS_AT,
      `the breakdown's popover declares ${String(LAYER.breakdownDeclares)} but is nested in the ` +
        `price cell, which declares ${String(LAYER.priceCell)}, so it paints at ` +
        `${String(BREAKDOWN_POPOVER_PAINTS_AT)} — under §9's rail at ${String(LAYER.rail)}`,
    ).toBeGreaterThan(LAYER.rail);
  });

  /** The same claim from the other end, so a fix that lowered the rail instead of raising the cell
   *  is still a fix and this file still passes. */
  it("leaves no layer between the price cell and the popover's own declaration", () => {
    expect(LAYER.rail).not.toBeGreaterThan(LAYER.priceCell);
  });
});
