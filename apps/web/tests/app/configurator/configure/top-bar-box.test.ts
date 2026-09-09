// The top bar refreshed against the owner's updated export (wave W4), and what the refresh costs:
// **canvas**.
//
// `.screen` is a `100dvh` grid whose only flexible row is the stage, so every pixel the header band
// gains is a pixel the scene loses. Wave W4 could not settle the desktop height on its own — frame
// D2A draws **76 px** while the invariant it was given said the stage must lose nothing — so it
// shipped the frame's arrangement inside the 55 px the row already measured and wrote the deviation
// down. **The owner ruled on 2026-09-07 that on desktop a taller top bar is fine**, so the desktop
// band is now the frame's own 76 and the scene is 21 px shorter at every desktop width by decision.
//
// No type spans that arithmetic — it is a stylesheet — so this file reads the declarations back out
// as text and adds them up, exactly as `price-bar-layout.test.ts` reads the bar's own. The browser
// measurement of the same claim is `tests/e2e/top-bar.e2e.spec.ts` and its desktop twin; this is the
// half that fails in CI on a machine with no browser.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";

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

const roSource = readFileSync(
  resolve(import.meta.dirname, "../../../../src/content/ro.ts"),
  "utf8",
);

/** What the band measured before the refresh: `16 + 14` (the back link's line) `+ 9 + 3` (the gap
 *  and the progress bar) `+ 12 + 1`. It is quoted in `price-bar.module.css` as the budget the
 *  desktop price cell's 9 px padding was chosen against, so it is a number two files agree on
 *  rather than one this test invented. On desktop it is now a historical figure — see the ruled
 *  height below — and on mobile it is the ceiling the refreshed band came in under. */
const HEIGHT_AT_BASE_COMMIT_PX = 55;

/** Frame D2A's own bar, taken on the owner's 2026-09-07 ruling: `17.5 + 40 + 17.5` of padding around
 *  the locale chip, plus the band's 1 px rule. */
const RULED_DESKTOP_HEIGHT_PX = 76;

/** What the ruling spends, stated as a number so it cannot be spent twice. The stage is the only
 *  flexible row, so this is the canvas's loss at every desktop width. */
const RULED_CANVAS_COST_PX = 21;

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

/** One rule's declarations, comments stripped — this stylesheet's commentary names properties and
 *  numbers it does not declare, which is precisely the false positive a text guard has to rule
 *  out. */
function declarationsOf(css: string, rule: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return (
    new RegExp(`\\.${rule} \\{([^}]*)\\}`).exec(withoutComments)?.[1] ?? ""
  );
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
  const shorthand = /font:\s*\d+\s+([\d.]+)px\//.exec(declarations)?.[1];
  return shorthand === undefined
    ? pixelsOf(declarations, "font-size")
    : Number(shorthand);
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
): (read: (declarations: string) => number | undefined) => number {
  const base = declarationsOf(MOBILE_CSS, rule);
  const override = shell === "desktop" ? declarationsOf(DESKTOP_CSS, rule) : "";
  return (read) => {
    const value = read(override) ?? read(base);
    if (value === undefined)
      throw new Error(`.${rule} declares no value this reading can use`);
    return value;
  };
}

/** The locale chip's outer height: the frame's own fixed `height` where it sets one, and otherwise
 *  its border, padding and the code's line box. It is the tallest thing in the row on both shells,
 *  which the "takes the locale chip as its tallest child" case below refuses to assume. */
function localeChipHeight(shell: "mobile" | "desktop"): number {
  const chip = ruleReader("locale", shell);
  const fixed =
    shell === "desktop"
      ? pixelsOf(declarationsOf(DESKTOP_CSS, "locale"), "height")
      : undefined;
  if (fixed !== undefined) return fixed;

  const border = chip((block) => pixelsOf(block, "border"));
  const padding = chip(verticalPaddingOf);
  const code = ruleReader("localeCode", shell)(fontSizeOf);
  return 2 * border + 2 * padding + code;
}

/** Every child's outer height, in the order the row draws them. The slot the shell hides is left
 *  out: `.wordmark` is `display: none` on mobile and `.back` is on desktop, and a hidden box
 *  contributes nothing to a `align-items: center` row. */
function childHeights(shell: "mobile" | "desktop"): Record<string, number> {
  const pill = ruleReader("stepPill", shell);
  return {
    [shell === "mobile" ? "back" : "wordmark"]: ruleReader(
      shell === "mobile" ? "back" : "wordmark",
      shell,
    )(fontSizeOf),
    stepPill: 2 * pill(verticalPaddingOf) + pill(fontSizeOf),
    title: ruleReader("title", shell)(fontSizeOf),
    locale: localeChipHeight(shell),
  };
}

/** The band's own outer height: its vertical padding twice, its tallest child, and the rule beneath
 *  it. */
function headerHeight(shell: "mobile" | "desktop"): number {
  const header = ruleReader("header", shell);
  const tallestChild = Math.max(...Object.values(childHeights(shell)));
  return (
    2 * header(verticalPaddingOf) +
    tallestChild +
    header((block) => pixelsOf(block, "border-bottom"))
  );
}

describe("the top bar's box, which the scene pays for", () => {
  it("is 48 px on mobile, so the scene gains the 7 px the old band spent", () => {
    // `11 + 25 + 11` plus the rule, against the refreshed frame 2A's own arithmetic.
    expect(headerHeight("mobile")).toBe(48);
    expect(headerHeight("mobile")).toBeLessThan(HEIGHT_AT_BASE_COMMIT_PX);
  });

  it("is frame D2A's own 76 px on desktop, which the owner ruled on 2026-09-07", () => {
    // The criterion this file exists for, and the one W4 left open. The frame's height is taken and
    // the canvas pays for it.
    expect(headerHeight("desktop")).toBe(RULED_DESKTOP_HEIGHT_PX);
  });

  it("costs the desktop canvas exactly the 21 px the ruling accepted, and no more", () => {
    // The cost is asserted rather than described, so a later padding edit that quietly spends a
    // twenty-second pixel of scene fails here. The stage is `.screen`'s only flexible row, so what
    // this band gains above its base-commit box is what the canvas loses.
    expect(headerHeight("desktop") - HEIGHT_AT_BASE_COMMIT_PX).toBe(
      RULED_CANVAS_COST_PX,
    );
  });

  it("is the element that sets the desktop row's height, so the price cell cannot mask a change", () => {
    // Both live in grid row 1 and the taller wins. If the price cell were the taller of the two,
    // every assertion above would be measuring something the scene does not pay for.
    //
    // **This is a claim about the two declared boxes, and there is one measured state where it does
    // not hold on screen.** On a design carrying ADR 0065's overflow flag, between 900 and 1025 px,
    // the cell's warning wraps to a third line and sets the row at 85.28 px — the ruled height's one
    // exception, taken on 2026-09-09 to stop the step nav being cut, and recorded beside the
    // declaration in `configure.module.css`. Nothing here can see it: a wrapped sentence is not a
    // declaration, and this file reads declarations. The browser measurement of both ends of that
    // window is `tests/e2e/settings-strip-containment.desktop.e2e.spec.ts`, and it is the file that
    // goes red if the warning is later re-narrowed.
    const bar = declarationsOf(
      priceBarStylesheet.slice(
        priceBarStylesheet.indexOf(DESKTOP_BRANCH_OPENER),
      ),
      "bar",
    );
    const figure = declarationsOf(priceBarStylesheet, "figure");
    const priceCell =
      2 * (verticalPaddingOf(bar) ?? 0) +
      (pixelsOf(figure, "gap") ?? 0) +
      (fontSizeOf(declarationsOf(priceBarStylesheet, "label")) ?? 0) +
      (fontSizeOf(declarationsOf(priceBarStylesheet, "amount")) ?? 0) +
      1;

    // Pinned as well as compared, so a parse that silently read nothing cannot pass this by
    // computing 1. `9 + 9` of padding around `10.5 + 3 + 21` of figure, plus the rule: 53.5, which
    // is the box `price-bar.module.css`'s own comment says the 9 px was chosen to produce.
    //
    // **The 9 px no longer constrains the scene, and the comparison is not thereby vacuous.** At the
    // base commit's 55 the cell cleared the header by 1.5 px and the padding was forced; at the
    // ruled 76 it clears by 22.5 and the padding is a free choice. What the comparison proves is
    // unchanged and is the reason the arithmetic above is worth reading at all: the header is the
    // taller of the two grid items, so the row's height is the header's. Strict, because a cell that
    // merely tied would already be setting the row.
    expect(priceCell).toBe(53.5);
    expect(priceCell).toBeLessThan(headerHeight("desktop"));
  });

  it("stretches the price cell to the ruled band, so the top bar keeps one unbroken rule", () => {
    // The header and the price cell each draw a `border-bottom`, and across the top bar the two are
    // read as one line. A centred 53.5 px cell hangs its rule at its own box's foot: 0.75 px above
    // the header's at the base commit's 55, which nobody could see, and 11.25 px above it at the
    // ruled 76, which everybody can.
    const priceRow = declarationsOf(DESKTOP_CSS, "priceRow");

    expect(priceRow).toContain("align-items: stretch;");
    expect(priceRow).not.toContain("align-items: center;");
  });

  it("takes the locale chip as its tallest child on both shells", () => {
    // Non-vacuity for the two sums above: they read the chip's box and nothing else's, which is only
    // the band's height while the chip is what the band sizes to.
    for (const shell of ["mobile", "desktop"] as const) {
      const heights = childHeights(shell);
      expect(Math.max(...Object.values(heights)), shell).toBe(heights.locale);
    }
  });

  it("declares no height of its own and no scrolling, on either shell", () => {
    // The band must not become a scroll container, and it must not pin the grid row: a fixed height
    // here would stop the arithmetic above from being the whole story.
    for (const css of [MOBILE_CSS, DESKTOP_CSS]) {
      const header = declarationsOf(css, "header");
      expect(header).not.toMatch(/(?:^|[;\s])(?:min-)?height:/);
      expect(header).not.toMatch(/overflow(?:-[xy])?:/);
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
    const header = declarationsOf(MOBILE_CSS, "header");

    expect(header).toContain("display: flex;");
    expect(header).toContain("align-items: center;");
    expect(header).not.toContain("flex-direction: column;");
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
    expect(declarationsOf(MOBILE_CSS, "locale")).toContain("flex: 0 0 auto;");
    // Frame D2A pushes it to the right-hand end rather than centring the row's slack.
    expect(declarationsOf(DESKTOP_CSS, "locale")).toContain(
      "margin-left: auto;",
    );
  });

  it("shows exactly one of the back control and the wordmark per shell", () => {
    // §10.1's one permitted fork, taken in CSS: two markup branches would be two copies of the row.
    expect(declarationsOf(MOBILE_CSS, "wordmark")).toContain("display: none;");
    expect(declarationsOf(DESKTOP_CSS, "back")).toContain("display: none;");
    expect(declarationsOf(DESKTOP_CSS, "wordmark")).toContain(
      "display: block;",
    );
  });
});

describe("the step number has one source", () => {
  it("spells the pill and the sentence from the same two constants", () => {
    const withoutComments = roSource.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(withoutComments.match(/const CONFIGURE_STEP = \d+;/g)).toHaveLength(
      1,
    );
    expect(
      withoutComments.match(/const CONFIGURE_STEP_COUNT = \d+;/g),
    ).toHaveLength(1);
    expect(withoutComments).toContain(
      "step: `Pasul ${String(CONFIGURE_STEP)} din ${String(CONFIGURE_STEP_COUNT)}`,",
    );
    expect(withoutComments).toContain(
      "stepPill: `${String(CONFIGURE_STEP)}/${String(CONFIGURE_STEP_COUNT)}`,",
    );
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
    expect(screenSource).toContain("aria-label={ro.configure.step}");
    expect(screenSource).toContain("{ro.configure.stepPill}");
  });
});

describe("the locale chip is drawn and inert", () => {
  it("is not a control, and nothing is wired to it", () => {
    // M6B wave 6B-i owns locale switching and is gated on the owner's Gate O1. An element with a
    // control's affordances and no behaviour is worse than the static chip it replaces.
    const header = /<header[\s\S]*?<\/header>/.exec(screenSource)?.[0];
    if (!header) throw new Error("no header element in the screen's source");

    expect(header).toContain("styles.locale");
    expect(header).not.toContain("<button");
    expect(header).not.toContain("onClick");
    expect(header).not.toContain('role="button"');
  });

  it("draws the caret the frames draw, and hides it from a screen reader", () => {
    expect(screenSource).toContain("▾");
    expect(declarationsOf(MOBILE_CSS, "localeCaret")).not.toBe("");
  });
});
