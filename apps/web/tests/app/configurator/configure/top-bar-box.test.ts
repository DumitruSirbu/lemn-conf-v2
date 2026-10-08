// `.screen` is a `100dvh` grid whose only flexible row is the stage, so every pixel the top bar takes is a pixel the
// canvas loses. The desktop band is frame D2A's declared `height: 76px` (ADR 0104); the mobile band is a sum, since
// frame 2A declares no height.
// A stylesheet has no type to span this arithmetic, so the declarations are read back out as text and added up, as
// `price-bar-layout.test.ts` does; the browser measurement is `tests/e2e/top-bar.e2e.spec.ts` and its desktop twin.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ro } from "../../../support/romanian-content";

const CONFIGURE_DIRECTORY = resolve(
  import.meta.dirname,
  "../../../../src/app/configurator/configure",
);

const screenSource = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure-screen.tsx"),
  "utf8",
);
const stylesheet = readFileSync(
  resolve(CONFIGURE_DIRECTORY, "configure.module.css"),
  "utf8",
);
const priceBarStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../../../src/price/price-bar.module.css"),
  "utf8",
);
/** The settings pill's stylesheet: a top-bar cell, and on mobile the row's tallest child, so the band's height cannot
 *  be computed without it. */
const settingsStylesheet = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../src/settings/global-settings.module.css",
  ),
  "utf8",
);

const contentSource = readFileSync(
  resolve(import.meta.dirname, "../../../../src/i18n/content.ts"),
  "utf8",
);

/** The band's height before the refresh: `16 + 14 + 9 + 3 + 12 + 1`, also quoted in `price-bar.module.css` as the
 *  budget the desktop price cell's padding was chosen against. */
const HEIGHT_AT_BASE_COMMIT_PX = 55;

/** Frame D2A's own declaration, `height: 76px` on the band, taken as written (ADR 0104). */
const RULED_DESKTOP_HEIGHT_PX = 76;

/** What the ruling spends on desktop, stated as a number so it cannot be spent twice. */
const RULED_CANVAS_COST_PX = 21;

/** What the withdrawn settings strip gave back: its desktop row measured 45.00 px at every width from 900 to 1920
 *  (ADR 0094 decision 2, withdrawn by ADR 0104 decision 2). */
const STRIP_BAND_AT_BASE_COMMIT_PX = 45;

/** The `@media (min-width: 900px)` branch is the desktop shell; everything above it is the mobile
 *  one. Split rather than parsed, because a nested-brace parser is more machinery than one
 *  breakpoint's worth of stylesheet deserves. */
const DESKTOP_BRANCH_OPENER = "@media (min-width: 900px) {";

function splitAtBreakpoint(css: string): readonly [string, string] {
  const at = css.indexOf(DESKTOP_BRANCH_OPENER);
  if (at < 0) throw new Error("the screen declares no desktop branch");
  return [css.slice(0, at), css.slice(at)];
}

const [MOBILE_CSS, DESKTOP_CSS] = splitAtBreakpoint(stylesheet);
const [MOBILE_SETTINGS_CSS, DESKTOP_SETTINGS_CSS] =
  splitAtBreakpoint(settingsStylesheet);

/**
 * Everything a class declares, comments stripped (they name properties and numbers they do not declare).
 * Every block whose selector list names the class counts, not only its own rule: the five cells share one rule for
 * their common paint, and matching only `.nav {` would report it absent.
 */
function declarationsOf(css: string, rule: string): string {
  const flattened = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // The desktop branch is one `@media` block; dropping its opener leaves a flat list of rules the matcher can walk.
    .replace(/@media[^{]*\{/g, "");
  // The class itself, never a pseudo-element on it: `.locale::before` is frame D2A's divider, and a
  // reader that took it for `.locale` would report the divider's own declarations as the cell's.
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

/** The first length in a `padding` shorthand, which in every rule here is the vertical one. */
function verticalPaddingOf(declarations: string): number | undefined {
  return pixelsOf(declarations, "padding");
}

/** A rule's font size, from either spelling: the `font` shorthand the base rules use or the
 *  `font-size` override the desktop branch adds. Every rule in this header sets `line-height: 1`,
 *  so the font size *is* the line box's height. */
function fontSizeOf(declarations: string): number | undefined {
  const shorthand = /font:\s*\d+\s+([\d.]+)px\s*\//.exec(declarations)?.[1];
  if (shorthand !== undefined) return Number(shorthand);
  // A rule may name its own line box (`.back` declares `--back-line: 17px`); resolved here so the reader sees one
  // number.
  const named = /font:\s*\d+\s+var\((--[\w-]+)\)/.exec(declarations)?.[1];
  if (named !== undefined) return pixelsOf(declarations, named);
  return pixelsOf(declarations, "font-size");
}

/** A rule as the shell renders it: the desktop branch's declarations layered over the base ones. Returned as a reader
 *  because both blocks may declare the same property and the desktop value is the one that wins. */
function ruleReader(
  rule: string,
  shell: "mobile" | "desktop",
  sheets: readonly [string, string] = [MOBILE_CSS, DESKTOP_CSS],
): (read: (declarations: string) => number | undefined) => number {
  const base = declarationsOf(sheets[0], rule);
  const override = shell === "desktop" ? declarationsOf(sheets[1], rule) : "";
  return (read) => {
    const value = read(override) ?? read(base);
    if (value === undefined)
      throw new Error(`.${rule} declares no value this reading can use`);
    return value;
  };
}

const SETTINGS_SHEETS = [MOBILE_SETTINGS_CSS, DESKTOP_SETTINGS_CSS] as const;

/** The locale chip's outer height: the frame's own fixed `height` where it sets one, and otherwise
 *  its border, padding and the code's line box. */
function localeChipHeight(shell: "mobile" | "desktop"): number {
  const chip = ruleReader("localeChip", shell);
  const fixed =
    shell === "desktop"
      ? pixelsOf(declarationsOf(DESKTOP_CSS, "localeChip"), "height")
      : undefined;
  if (fixed !== undefined) return fixed;

  const border = chip((block) => pixelsOf(block, "border"));
  const padding = chip(verticalPaddingOf);
  const code = ruleReader("localeCode", shell)(fontSizeOf);
  return 2 * border + 2 * padding + code;
}

/**
 * The settings pill's outer height: frame D2A's declared `height: 40px` on desktop; on mobile its border, padding and
 * its own tallest child, which is the 14 px swatch, not the 11 px label. Derived rather than pinned, so the frame's
 * declarations stay the source.
 */
function settingsPillHeight(shell: "mobile" | "desktop"): number {
  const pill = ruleReader("pill", shell, SETTINGS_SHEETS);
  const fixed =
    shell === "desktop"
      ? pixelsOf(declarationsOf(DESKTOP_SETTINGS_CSS, "pill"), "height")
      : undefined;
  if (fixed !== undefined) return fixed;

  const border = pill((block) => pixelsOf(block, "border"));
  const padding = pill(verticalPaddingOf);
  const swatch = ruleReader(
    "swatch",
    shell,
    SETTINGS_SHEETS,
  )((block) => pixelsOf(block, "height"));
  const label = pill(fontSizeOf);
  return 2 * border + 2 * padding + Math.max(swatch, label);
}

/** The review CTA's outer height, which frame D2A declares directly. */
function reviewCtaHeight(shell: "mobile" | "desktop"): number {
  return ruleReader("reviewCta", shell)((block) => pixelsOf(block, "height"));
}

/**
 * The price cell's own content. The figure is one line on both shells (frame D2A's `de la 101 000 MDL`), so the label
 * and amount sit beside each other and the taller is the line; on desktop the breakdown's control stands under it.
 */
function priceCellHeight(shell: "mobile" | "desktop"): number {
  const label = fontSizeOf(declarationsOf(priceBarStylesheet, "label")) ?? 0;
  const amount = fontSizeOf(declarationsOf(priceBarStylesheet, "amount")) ?? 0;
  const figure = Math.max(label, amount);
  if (shell === "mobile") return figure;
  const column =
    pixelsOf(declarationsOf(DESKTOP_CSS, "priceColumn"), "gap") ?? 0;
  const control =
    fontSizeOf(
      declarationsOf(
        readFileSync(
          resolve(
            import.meta.dirname,
            "../../../../src/price/price-breakdown.module.css",
          ),
          "utf8",
        ),
        "trigger",
      ),
    ) ?? 0;
  return figure + column + control;
}

/** Every child of the top bar's five cells, by the cell it stands in — the whole row, which is what
 *  the band's height is a function of. The slot the shell hides is left out: `.wordmark` is
 *  `display: none` on mobile, `.back` is on desktop, and `.backAction` is drawn only in frame 2A's
 *  bottom bar. */
function childHeights(shell: "mobile" | "desktop"): Record<string, number> {
  const step = ruleReader("stepPill", shell);
  return {
    [shell === "mobile" ? "back" : "wordmark"]: ruleReader(
      shell === "mobile" ? "back" : "wordmark",
      shell,
    )(fontSizeOf),
    stepPill: 2 * step(verticalPaddingOf) + step(fontSizeOf),
    title: ruleReader("title", shell)(fontSizeOf),
    settingsPill: settingsPillHeight(shell),
    locale: localeChipHeight(shell),
    ...(shell === "desktop"
      ? { reviewCta: reviewCtaHeight(shell), price: priceCellHeight(shell) }
      : {}),
  };
}

/** The mobile band's outer height: vertical padding twice, the tallest child and the rule beneath. Frame 2A declares
 *  no height, so the band is this sum. */
function mobileHeaderHeight(): number {
  const cell = ruleReader("nav", "mobile");
  const tallestChild = Math.max(...Object.values(childHeights("mobile")));
  return (
    2 * cell(verticalPaddingOf) +
    tallestChild +
    cell((block) => pixelsOf(block, "border-bottom"))
  );
}

/** The desktop band's declared height, read off `.screen`'s row track rather than summed: the 48 px CTA does not fit
 *  inside the sum that once reached 76. */
function declaredDesktopBandHeight(): number {
  const rows = /grid-template-rows:\s*([^;]+);/.exec(
    declarationsOf(DESKTOP_CSS, "screen"),
  )?.[1];
  const declared = /(\d+(?:\.\d+)?)px/.exec(rows ?? "")?.[1];
  if (declared === undefined)
    throw new Error("the desktop screen declares no fixed top-bar row");
  return Number(declared);
}

describe("the top bar's box, which the scene pays for", () => {
  it("is frame 2A's own 53 px on mobile, one child taller than the band it replaced", () => {
    // `11 + 30 + 11` plus the rule. The tallest child is the settings chip (`1 + 7 + 14 + 7 + 1`, the swatch setting
    // it).
    expect(mobileHeaderHeight()).toBe(53);
    expect(mobileHeaderHeight()).toBeLessThan(HEIGHT_AT_BASE_COMMIT_PX);
  });

  it("takes the settings chip as its tallest child on mobile, which is what sets that 53", () => {
    // Non-vacuity for the sum above: it is the band's height only while the settings chip is what the band sizes to.
    const heights = childHeights("mobile");

    expect(Math.max(...Object.values(heights))).toBe(heights.settingsPill);
  });

  it("is frame D2A's own declared 76 px on desktop, and no longer a sum that reaches it", () => {
    // The old `17.5 + 40 + 17.5 + 1` sum cannot hold the 48 px `Verifică designul`, so the row declares the frame's own
    // height and every cell stretches into it (ADR 0104).
    expect(declaredDesktopBandHeight()).toBe(RULED_DESKTOP_HEIGHT_PX);
    expect(declarationsOf(DESKTOP_CSS, "nav")).toContain("padding-block: 0;");
  });

  it("holds every cell's own content inside that declared height", () => {
    // A control taller than the declared band would overflow it silently, where a sum would have grown the band.
    const heights = childHeights("desktop");

    expect(Object.keys(heights).length).toBe(7);
    for (const [child, height] of Object.entries(heights))
      expect(height, child).toBeLessThanOrEqual(RULED_DESKTOP_HEIGHT_PX);
  });

  it("names the child that killed the desktop sum, and it is not the locale chip", () => {
    // The tallest child is named rather than assumed: the withdrawn sum assumed the 40 px locale chip.
    const heights = childHeights("desktop");

    expect(Math.max(...Object.values(heights))).toBe(heights.reviewCta);
    expect(heights.reviewCta).toBe(48);
    expect(heights.reviewCta).toBeGreaterThan(heights.locale ?? 0);
  });

  it("gives the desktop canvas back more than the band ever cost it, because the strip's row is gone", () => {
    // The band still costs 21 px against the base commit and the withdrawn strip returns the 45 px it charged (ADR 0104
    // decision 10); no rule for that band exists any more.
    expect(declarationsOf(stylesheet, "settingsRow")).toBe("");
    expect(STRIP_BAND_AT_BASE_COMMIT_PX - RULED_CANVAS_COST_PX).toBe(24);
  });

  it("stretches every top-bar cell to the ruled band, so the bar keeps one unbroken rule", () => {
    // A cell that centred itself would hang its rule at its own box's foot and break the one line the five cells draw.
    expect(declarationsOf(DESKTOP_CSS, "priceRow")).toContain(
      "align-items: stretch;",
    );
    // A grid item stretches by default; what would break the rule is a cell opting out, so none of the five may.
    for (const cell of ["nav", "settings", "locale", "priceRow", "actions"]) {
      const declarations = `${declarationsOf(MOBILE_CSS, cell)}${declarationsOf(DESKTOP_CSS, cell)}`;
      expect(declarations, cell).not.toContain("align-self:");
    }
  });

  it("draws one rule under the whole band, from every cell that stands in it", () => {
    const rule = "border-bottom: 1px solid var(--line-soft);";

    for (const cell of ["nav", "settings", "locale"])
      expect(declarationsOf(MOBILE_CSS, cell), cell).toContain(rule);
    // The price and the actions join the band on desktop only; on mobile they are the bottom bar.
    for (const cell of ["priceRow", "actions"])
      expect(declarationsOf(DESKTOP_CSS, cell), cell).toContain(rule);
  });

  it("declares no height on the mobile band, and no scrolling on either", () => {
    // A band that scrolled would hide a control rather than report it; the desktop row declares frame D2A's height on
    // purpose.
    expect(declarationsOf(MOBILE_CSS, "nav")).not.toMatch(
      /(?:^|[;\s])(?:min-)?height:/,
    );
    for (const css of [MOBILE_CSS, DESKTOP_CSS]) {
      for (const cell of ["nav", "settings", "locale"])
        expect(declarationsOf(css, cell), cell).not.toMatch(
          /overflow(?:-[xy])?:/,
        );
    }
  });
});

describe("the row the refreshed frames replaced", () => {
  it("lays the band out as one row rather than a column", () => {
    // The five cells are grid items of the screen, so "one row" is the screen's own template.
    const screen = declarationsOf(MOBILE_CSS, "screen");

    expect(screen).toContain('"nav      settings locale"');
    expect(screen).not.toContain("flex-direction: column;");
    expect(declarationsOf(MOBILE_CSS, "nav")).toContain("display: flex;");
    expect(declarationsOf(MOBILE_CSS, "nav")).toContain("align-items: center;");
  });

  it("truncates the title on mobile instead of growing the band or evicting the chip", () => {
    // A flex item's minimum size is its min-content width, so `min-width: 0` is what makes the ellipsis reachable.
    const title = declarationsOf(MOBILE_CSS, "title");

    expect(title).toContain("flex: 1;");
    expect(title).toContain("min-width: 0;");
    expect(title).toContain("overflow: hidden;");
    expect(title).toContain("text-overflow: ellipsis;");
    expect(title).toContain("white-space: nowrap;");
  });

  it("keeps the locale chip out of the flexible space on both shells", () => {
    // The chip is its own grid item; its track is `auto` on both shells while the settings track takes the residue.
    expect(declarationsOf(MOBILE_CSS, "locale")).toContain("flex: 0 0 auto;");
    expect(declarationsOf(MOBILE_CSS, "screen")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto auto;",
    );
    expect(declarationsOf(DESKTOP_CSS, "screen")).toContain(
      "grid-template-columns: auto minmax(0, 1fr) auto auto auto;",
    );
  });

  it("shows the wordmark on desktop only, the top bar's back control on both, and a third state", () => {
    // §10.1's one permitted fork, taken in CSS: two markup branches would be two copies of the row. The bottom bar's
    // `.backAction` stays the phone's.
    expect(declarationsOf(MOBILE_CSS, "wordmark")).toContain("display: none;");
    expect(declarationsOf(DESKTOP_CSS, "back")).not.toContain("display: none;");
    expect(declarationsOf(DESKTOP_CSS, "backAction")).toContain(
      "display: none;",
    );
    expect(declarationsOf(DESKTOP_CSS, "wordmark")).toContain(
      "display: block;",
    );
    // The third state (ADR 0104 decision 8): the wordmark also leaves the desktop row when the fit model says the pill
    // cannot show one whole setting name beside it. It is a data attribute, not a width threshold (criterion 4i), and
    // is
    // scoped to the nav so the hidden probe keeps its own width.
    expect(DESKTOP_CSS).toContain(
      '.screen[data-wordmark="dropped"] .nav .wordmark',
    );
    expect(screenSource).toContain(
      'data-wordmark={topBar.isWordmarkDrawn ? "drawn" : "dropped"}',
    );
  });

  it("declares a margin on the desktop back control that cancels the nav gap (a declaration pin; the measured effect is the e2e containment test's)", () => {
    // `top-bar-fit.ts` counts three nav gaps; a fourth would move give B's ruled savings. The
    // control's margin cancels the flex gap that follows it, whichever of the two spacings is drawn.
    expect(declarationsOf(DESKTOP_CSS, "back")).toContain(
      "var(--top-bar-nav-gap) * -1",
    );
  });

  it("declares no width threshold of its own, at any point in the file", () => {
    // ADR 0094 criterion 4i: the only `@media` is the shell fork the application already had; every other decision is a
    // comparison against a measured width.
    expect(stylesheet.match(/@media/g)).toHaveLength(1);
    expect(stylesheet).toContain(DESKTOP_BRANCH_OPENER);
  });
});

describe("the step number has one source", () => {
  it("resolves the pill and the sentence from one pair of step arguments", () => {
    // Both catalogue leaves are resolved with the same `{ step, totalSteps }`, so the pill and the caption cannot state
    // two progressions.
    const stepArguments = [
      ...contentSource.matchAll(
        /translate\("configure\.(?:step|stepPill)", (\{ step: \d+, totalSteps: \d+ \})\)/g,
      ),
    ].map(([, values]) => values);

    expect(stepArguments).toHaveLength(2);
    expect(new Set(stepArguments).size).toBe(1);
  });

  it("draws the same numbers in both, so the two cannot disagree", () => {
    const digitsOf = (copy: string): readonly string[] =>
      copy.match(/\d+/g) ?? [];

    expect(digitsOf(ro.configure.stepPill)).toEqual(
      digitsOf(ro.configure.step),
    );
    expect(digitsOf(ro.configure.stepPill)).toHaveLength(2);
  });

  // That the pill's accessible name is the sentence is a fact about the rendered element, so it is checked on one:
  // `tests/i18n/locale-menu.dom.test.ts`, "names the step pill with the sentence, and draws only the two numbers".
});

describe("the locale chip is the control that opens the language menu", () => {
  /** The menu is positioned against the cell, so the cell and the popover that fills it are one component. */
  const menuSource = readFileSync(
    resolve(CONFIGURE_DIRECTORY, "locale-menu.tsx"),
    "utf8",
  );

  it("stands in the row as its own grid item and nothing else", () => {
    // `.locale` is a direct child of `.screen`, which the two shells' `grid-template-areas` require.
    expect(screenSource).toContain("<LocaleMenu />");
    expect(screenSource).not.toContain("styles.locale}");
    expect(menuSource).toContain("<div className={styles.locale}");
  });

  // What the trigger is, what it is named and what its caret says to a screen reader are attributes of the rendered
  // control, and `tests/i18n/locale-menu.dom.test.ts` reads them off it ("the control a screen reader and a keyboard
  // get"). This file keeps to the box.

  it("hangs the menu off the cell without letting it leave the phone's viewport", () => {
    // §10.1's picking gate is 390 px and this cell is last in the row on both shells: the list is anchored to its
    // trailing edge and bounded by the paper it stands on.
    const list = /\.localeList \{([^}]*)\}/.exec(stylesheet)?.[1];
    if (!list) throw new Error("the menu declares no box");

    expect(list).toContain("position: absolute;");
    expect(list).toContain("top: 100%;");
    expect(list).toContain("inset-inline-end: 14px;");
    expect(list).toContain("max-width: calc(100vw - 28px);");
  });

  it("gives every choice §10.1's own touch target", () => {
    // No frame fixes this row's box, so the 44 px target is the row itself rather than an overlay beside it.
    expect(declarationsOf(MOBILE_CSS, "localeOption")).toContain(
      "min-height: var(--touch-target);",
    );
  });

  it("keeps the frames' painted box and takes its touch target beside it", () => {
    // §10.1's 44 px is taken vertically only: a horizontally grown hit area would make ADR 0082 decision 1's clip
    // predicate report the control as truncated.
    const hitArea = /\.localeChip::after \{([^}]*)\}/.exec(stylesheet)?.[1];
    if (!hitArea) throw new Error("the chip declares no hit area");

    expect(hitArea).toContain("inset-inline: 0;");
    expect(hitArea).toContain(
      "inset-block: calc((100% - var(--touch-target)) / 2);",
    );
    expect(localeChipHeight("mobile")).toBe(25);
    expect(localeChipHeight("desktop")).toBe(40);
  });

  // A flag identifies a language but cannot say which is current: `aria-current` and weight/colour carry that, and this
  // fails if the weight leaves with the dot.
  it("still marks the current language once the dot is gone", () => {
    expect(declarationsOf(MOBILE_CSS, "localeOptionCurrent")).toContain(
      "font-weight: 700;",
    );
    expect(menuSource).toContain('aria-current={choice.isCurrent ? "true"');
    expect(stylesheet).not.toMatch(/\.localeOption(Current)?::before/);
  });

  it("sizes the flag beside each name, and gives the white band an edge", () => {
    // The flags are locale data (`i18n/locale-flags.tsx`), so the one `svg` a choice contains is selected by element.
    // Russia's white band needs an edge on `--paper`, drawn as a `box-shadow` so it cannot move the endonyms.
    const flag = /\.localeOption svg \{([^}]*)\}/.exec(stylesheet)?.[1];
    if (!flag) throw new Error("the choice's flag declares no box");

    expect(flag).toContain("flex: 0 0 auto;");
    expect(flag).toMatch(/box-shadow: 0 0 0 1px/);
  });
});
