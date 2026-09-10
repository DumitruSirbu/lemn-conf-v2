// The top bar refreshed against the owner's own frames, and what it costs the scene.
//
// `.screen` is a `100dvh` grid whose only flexible row is the stage, so every pixel the top bar takes
// is a pixel the canvas loses. **ADR 0104 changes what this file reads, and the change is the point
// of the wave.** Until it, the desktop band's 76 px was *arithmetic* — `17.5 + 40 + 17.5 + 1` of
// padding around the locale chip — which reached frame D2A's declared number by a different route.
// That route is closed: the frame's own `Verifică designul` is **48 px** and does not fit inside 40,
// so the band takes D2A's declared `height: 76px` with no padding-block, and this file reads the
// declaration and then holds every cell's content under it.
//
// **The mobile band is still a sum**, because frame 2A declares no height at all: it is padding plus
// the tallest child plus the rule. Only the tallest child changed — from the locale chip to the
// settings chip the frame draws beside it.
//
// No type spans that arithmetic — it is a stylesheet — so this file reads the declarations back out
// as text and adds them up, exactly as `price-bar-layout.test.ts` reads the bar's own. The browser
// measurement of the same claims is `tests/e2e/top-bar.e2e.spec.ts` and its desktop twin; this is the
// half that fails in CI on a machine with no browser.
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
/** The settings pill's own stylesheet. **New to this file with ADR 0104 decision 2**: the pill is a
 *  cell of the top bar now, and on mobile it is the row's tallest child — so the band's height
 *  cannot be computed without it. */
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

/** What the band measured before the refresh: `16 + 14` (the back link's line) `+ 9 + 3` (the gap
 *  and the progress bar) `+ 12 + 1`. It is quoted in `price-bar.module.css` as the budget the
 *  desktop price cell's padding was chosen against, so it is a number two files agree on rather than
 *  one this test invented. */
const HEIGHT_AT_BASE_COMMIT_PX = 55;

/** Frame D2A's own declaration — `height: 76px` on the band, taken as written (ADR 0104's
 *  re-derivation of the owner's 2026-09-07 ruling). */
const RULED_DESKTOP_HEIGHT_PX = 76;

/** What the ruling spends on desktop, stated as a number so it cannot be spent twice. */
const RULED_CANVAS_COST_PX = 21;

/** **What the withdrawn settings strip gives back**, measured in a browser at `6d53d38` before this
 *  wave touched anything: the strip's own desktop row was 45.00 px at 900, 1000, 1100, 1440 and
 *  1920, and the canvas began at y = 121 at every one of them. ADR 0094 accepted that cost
 *  knowingly; ADR 0104 decision 2 withdraws the row that charged it. */
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
 * Everything a class declares, comments stripped — these stylesheets' commentary names properties
 * and numbers they do not declare, which is precisely the false positive a text guard has to rule
 * out.
 *
 * **Every block whose selector list names the class, not only its own rule.** The top bar's five
 * cells share one rule for the paint they have in common — the paper and the band's rule — and a
 * reader that only matched `.nav {` would report that shared declaration as absent, which is a guard
 * lying about a stylesheet rather than reading it.
 */
function declarationsOf(css: string, rule: string): string {
  const flattened = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // The desktop branch is one `@media` block wrapping the rules this reads. Dropping the opener
    // leaves a flat list of rules, which is all the matcher below can walk.
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
  // A rule may name its own line box rather than inline it — `.back` declares `--back-line: 17px`
  // and spends it twice, on the glyph and on the negative margin that keeps its 44 px target from
  // changing what the row lays out. Resolved here so the reader still sees one number.
  const named = /font:\s*\d+\s+var\((--[\w-]+)\)/.exec(declarations)?.[1];
  if (named !== undefined) return pixelsOf(declarations, named);
  return pixelsOf(declarations, "font-size");
}

/**
 * A rule as the shell in question renders it: the desktop branch's declarations layered over the
 * base ones, or the base ones alone.
 *
 * Returned as a reader rather than a merged string, because the two blocks may each declare the
 * same property and "the desktop value if there is one" is the only merge that means anything.
 */
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
 * The settings pill's outer height — frame D2A's declared `height: 40px` on desktop, and on mobile
 * its border, padding and **its own tallest child**.
 *
 * That last clause is where the plan's arithmetic was wrong and the stylesheet is right: the chip's
 * tallest child is the **swatch** at 14 px, not the 11 px label line, so frame 2A's chip is
 * `1 + 7 + 14 + 7 + 1 = 30` rather than 27 — and the band it sets is 53 rather than 50. The number is
 * derived here rather than pinned, so the frame's own declarations remain the source.
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
 * The price cell's own content.
 *
 * **The figure is one line, on both shells** — frame D2A's `de la 101 000 MDL`, which the owner
 * ruled onto the phone as well on 2026-09-09 — so the label and the amount sit *beside* each other
 * and the taller of the two is the line, not their sum. On desktop the breakdown's control stands
 * under that line, which is frame D2A's own column.
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

/** The mobile band's own outer height: its vertical padding twice, its tallest child, and the rule
 *  beneath it. **Frame 2A declares no height**, so the band *is* this sum — which is why the mobile
 *  half of this file still adds up and the desktop half no longer does. */
function mobileHeaderHeight(): number {
  const cell = ruleReader("nav", "mobile");
  const tallestChild = Math.max(...Object.values(childHeights("mobile")));
  return (
    2 * cell(verticalPaddingOf) +
    tallestChild +
    cell((block) => pixelsOf(block, "border-bottom"))
  );
}

/** The desktop band's **declared** height, read off `.screen`'s own row track rather than summed.
 *  Frame D2A declares `height: 76px` and the 48 px CTA does not fit inside the sum that used to
 *  reach the same number. */
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
    // `11 + 30 + 11` plus the rule. The tallest child is the settings chip the frame draws in this
    // row — `1 + 7 + 14 + 7 + 1`, the swatch setting it rather than the label — where it used to be
    // the 25 px locale chip. **The phone's scene pays 5 px for it**, and gets the 76 px settings band
    // ADR 0104 decision 2 withdraws in exchange.
    expect(mobileHeaderHeight()).toBe(53);
    expect(mobileHeaderHeight()).toBeLessThan(HEIGHT_AT_BASE_COMMIT_PX);
  });

  it("takes the settings chip as its tallest child on mobile, which is what sets that 53", () => {
    // Non-vacuity for the sum above: it is only the band's height while the chip is what the band
    // sizes to. Named per shell rather than assumed, because the two frames draw different things
    // tallest — see the desktop case below.
    const heights = childHeights("mobile");

    expect(Math.max(...Object.values(heights))).toBe(heights.settingsPill);
  });

  it("is frame D2A's own declared 76 px on desktop, and no longer a sum that reaches it", () => {
    // **The derivation dies and the number survives** (ADR 0104). The band used to be
    // `17.5 + 40 + 17.5 + 1` of padding around the locale chip; frame D2A's `Verifică designul` is
    // 48 px and does not fit inside 40, so the row declares the frame's own height and every cell
    // stretches into it.
    expect(declaredDesktopBandHeight()).toBe(RULED_DESKTOP_HEIGHT_PX);
    expect(declarationsOf(DESKTOP_CSS, "nav")).toContain("padding-block: 0;");
  });

  it("holds every cell's own content inside that declared height", () => {
    // What the sum used to prove, restated for a declared box and over **five** cells rather than
    // two: a control taller than the band would overflow it silently, where before it would have
    // grown the band and shown up as a canvas cost.
    const heights = childHeights("desktop");

    expect(Object.keys(heights).length).toBe(7);
    for (const [child, height] of Object.entries(heights))
      expect(height, child).toBeLessThanOrEqual(RULED_DESKTOP_HEIGHT_PX);
  });

  it("names the child that killed the desktop sum, and it is not the locale chip", () => {
    // **The frame's own arithmetic, stated.** The withdrawn derivation was `17.5 + 40 + 17.5 + 1`
    // around the 40 px locale chip. Frame D2A's `Verifică designul` is **48**, so it does not fit
    // inside 40 and the band could not go on being that sum. The tallest child is named rather than
    // assumed, because that is the assumption the old case made and this wave broke.
    const heights = childHeights("desktop");

    expect(Math.max(...Object.values(heights))).toBe(heights.reviewCta);
    expect(heights.reviewCta).toBe(48);
    expect(heights.reviewCta).toBeGreaterThan(heights.locale ?? 0);
  });

  it("costs the desktop canvas exactly the 21 px the ruling accepted, and no more", () => {
    // The cost is asserted rather than described, so a later edit that quietly spends a
    // twenty-second pixel of scene fails here.
    expect(declaredDesktopBandHeight() - HEIGHT_AT_BASE_COMMIT_PX).toBe(
      RULED_CANVAS_COST_PX,
    );
  });

  it("gives the desktop canvas back more than the band ever cost it, because the strip's row is gone", () => {
    // The sibling claim ADR 0104 decision 10 makes, in the two numbers that make it: the band still
    // costs 21 px against the base commit, and the withdrawn strip returns the 45 px it charged at
    // every desktop width. Measured in a browser before the wave, and the stylesheet half of the
    // proof is that no rule for that band exists any more.
    expect(declarationsOf(stylesheet, "settingsRow")).toBe("");
    expect(STRIP_BAND_AT_BASE_COMMIT_PX - RULED_CANVAS_COST_PX).toBe(24);
  });

  it("stretches every top-bar cell to the ruled band, so the bar keeps one unbroken rule", () => {
    // Each of the five cells draws the same `border-bottom`, and across the top bar the five are
    // read as one line. A cell that centred itself would hang its rule at its own box's foot and
    // break the line in two.
    expect(declarationsOf(DESKTOP_CSS, "priceRow")).toContain(
      "align-items: stretch;",
    );
    // A grid item stretches into its row by default; what would break the rule is a cell opting out
    // of that, so what is asserted is that none of the five does.
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
    // The half that was protecting something and still is: a band that scrolled would hide a control
    // rather than report it. The *height* half now holds for mobile only — the desktop row declares
    // frame D2A's own, deliberately, and `declaredDesktopBandHeight` above reads it.
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
  it("renders no progress segments and declares no rule for them", () => {
    expect(screenSource).not.toContain("styles.progress");
    expect(screenSource).not.toContain("styles.headerRow");
    expect(declarationsOf(stylesheet, "progress")).toBe("");
    expect(declarationsOf(stylesheet, "headerRow")).toBe("");
  });

  it("lays the band out as one row rather than a column", () => {
    // The five cells are grid items of the screen now, so "one row" is the screen's own template:
    // one row for the whole top bar, with the three mobile cells side by side in it.
    const screen = declarationsOf(MOBILE_CSS, "screen");

    expect(screen).toContain('"nav      settings locale"');
    expect(screen).not.toContain("flex-direction: column;");
    expect(declarationsOf(MOBILE_CSS, "nav")).toContain("display: flex;");
    expect(declarationsOf(MOBILE_CSS, "nav")).toContain("align-items: center;");
  });

  it("truncates the title on mobile instead of growing the band or evicting the chip", () => {
    // A flex item's automatic minimum size is its min-content width, so `min-width: 0` is what makes
    // the ellipsis reachable at all — without it a long title pushes the locale chip off the screen
    // rather than being cut.
    const title = declarationsOf(MOBILE_CSS, "title");

    expect(title).toContain("flex: 1;");
    expect(title).toContain("min-width: 0;");
    expect(title).toContain("overflow: hidden;");
    expect(title).toContain("text-overflow: ellipsis;");
    expect(title).toContain("white-space: nowrap;");
  });

  it("keeps the locale chip out of the flexible space on both shells", () => {
    // **The mechanism changed with the structure and the property did not.** The chip used to be
    // pushed to the right-hand end by `margin-left: auto` inside a flex header; it is a grid item of
    // its own now, and what keeps it out of the slack is its track being `auto` on both shells while
    // the settings track takes the residue.
    expect(declarationsOf(MOBILE_CSS, "locale")).toContain("flex: 0 0 auto;");
    expect(declarationsOf(MOBILE_CSS, "screen")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto auto;",
    );
    expect(declarationsOf(DESKTOP_CSS, "screen")).toContain(
      "grid-template-columns: auto minmax(0, 1fr) auto auto auto;",
    );
  });

  it("shows exactly one of the back control and the wordmark per shell, and a third state", () => {
    // §10.1's one permitted fork, taken in CSS: two markup branches would be two copies of the row.
    expect(declarationsOf(MOBILE_CSS, "wordmark")).toContain("display: none;");
    expect(declarationsOf(DESKTOP_CSS, "back")).toContain("display: none;");
    expect(declarationsOf(DESKTOP_CSS, "wordmark")).toContain(
      "display: block;",
    );
    // **The third state, ruled by the owner on 2026-09-09** (ADR 0104 decision 8, give C): the
    // wordmark also leaves the desktop row when the fit model says the pill can no longer show one
    // whole setting name beside it. It is a data attribute on the screen and **not** a width
    // threshold — criterion 4i — and it is scoped to the nav so the hidden probe the decision is
    // measured from keeps its own width.
    expect(DESKTOP_CSS).toContain(
      '.screen[data-wordmark="dropped"] .nav .wordmark',
    );
    expect(screenSource).toContain(
      'data-wordmark={topBar.isWordmarkDrawn ? "drawn" : "dropped"}',
    );
  });

  it("declares no width threshold of its own, at any point in the file", () => {
    // ADR 0094 criterion 4i, met as written rather than argued around: the only `@media` in this
    // stylesheet is the shell fork the application already had. Every other decision — the label
    // count, the gaps, the wordmark — is a comparison against a measured width.
    expect(stylesheet.match(/@media/g)).toHaveLength(1);
    expect(stylesheet).toContain(DESKTOP_BRANCH_OPENER);
  });
});

describe("the step number has one source", () => {
  it("resolves the pill and the sentence from one pair of step arguments", () => {
    // The two constants this used to read moved into ICU arguments in 6B-d, and the module that
    // held them was deleted in 6B-f. The invariant is unchanged and is checked where it now lives:
    // both catalogue leaves are resolved with the *same* `{ step, totalSteps }`, so the pill and the
    // caption cannot state two different progressions.
    const stepArguments = [
      ...contentSource.matchAll(
        /translate\("configure\.(?:step|stepPill)", (\{ step: \d+, totalSteps: \d+ \})\)/g,
      ),
    ].map(([, values]) => values);

    expect(stepArguments).toHaveLength(2);
    expect(new Set(stepArguments).size).toBe(1);
  });

  it("draws the same numbers in both, so the two cannot disagree", () => {
    // The behavioural half of the source check above: whatever the constants are set to, the pill
    // and the caption state them in the same order.
    const digitsOf = (copy: string): readonly string[] =>
      copy.match(/\d+/g) ?? [];

    expect(digitsOf(ro.configure.stepPill)).toEqual(
      digitsOf(ro.configure.step),
    );
    expect(digitsOf(ro.configure.stepPill)).toHaveLength(2);
  });

  it("keeps the sentence as the pill's accessible name", () => {
    // The pill draws "2/4", which read aloud is two numbers and a slash. The caption it replaced
    // said "Pasul 2 din 4", and that is what the accessibility tree keeps.
    expect(screenSource).toContain("aria-label={content.configure.step}");
    expect(screenSource).toContain("{content.configure.stepPill}");
  });
});

describe("the locale chip is the control that switches locale", () => {
  /** **The chip left the header with ADR 0104 decision 2** — it is a grid item of its own, so frame
   *  D2A can place it after the CTA while frame 2A keeps it in the header row — so the cell is what
   *  is read rather than the header. */
  function localeCellSource(): string {
    const cell = /styles\.locale}>[\s\S]*?<\/div>/.exec(screenSource)?.[0];
    if (!cell) throw new Error("no locale cell in the screen's source");
    return cell;
  }

  it("is a link to the other locale, at the path the customer is already on", () => {
    // **Wave 6B-i, and it replaces this file's own "drawn and inert" check.** A locale here *is* a
    // URL, so the control is an anchor rather than a scripted button: it is shareable, it works with
    // JavaScript off, and the browser gives it the focus ring and the keyboard activation this
    // stylesheet declares for nothing. The href being the current path is what keeps the switch a
    // change of language rather than of place — `tests/i18n/locale-switch.test.ts` drives that end.
    const cell = localeCellSource();

    expect(cell).toContain("styles.localeChip");
    expect(cell).toContain("<Link");
    expect(cell).toContain("href={localeSwitch.pathname}");
    expect(cell).toContain("locale={localeSwitch.locale}");
    expect(cell).not.toContain("<button");
    expect(cell).not.toContain("onClick");
    expect(cell).not.toContain('role="button"');
  });

  it("is named by a sentence rather than by the two letters it draws", () => {
    // `RO` read aloud names neither the language of the page nor the language the link leads to, and
    // which of the two the chip shows would otherwise be carried by its colour alone.
    expect(localeCellSource()).toContain(
      "aria-label={content.configure.localeSwitch}",
    );
  });

  it("keeps the frames' painted box and takes its touch target beside it", () => {
    // §10.1's 44 px, taken vertically only: the painted chip stays 25 px on mobile and 40 on
    // desktop, and a horizontally grown hit area would make ADR 0082 decision 1's clip predicate
    // report this control as truncated.
    const hitArea = /\.localeChip::after \{([^}]*)\}/.exec(stylesheet)?.[1];
    if (!hitArea) throw new Error("the chip declares no hit area");

    expect(hitArea).toContain("inset-inline: 0;");
    expect(hitArea).toContain(
      "inset-block: calc((100% - var(--touch-target)) / 2);",
    );
    expect(localeChipHeight("mobile")).toBe(25);
    expect(localeChipHeight("desktop")).toBe(40);
  });

  it("draws the caret the frames draw, and hides it from a screen reader", () => {
    expect(screenSource).toContain("▾");
    expect(declarationsOf(MOBILE_CSS, "localeCaret")).not.toBe("");
  });
});
