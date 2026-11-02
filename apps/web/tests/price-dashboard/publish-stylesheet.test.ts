// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the publish pages: every
// interactive box at least a touch target tall, a ring on whatever takes focus, the card layout on a phone and the table from
// 900 px (the staff frame's own breakpoint), the panel beside the table only where the table keeps its narrowest width, the
// publish bar pinned over the whole page on a phone, the column titles read by the cells on a phone, and nothing that makes
// a 390 px page scroll sideways.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(import.meta.dirname, "../../src/price-dashboard/publish.module.css"),
  "utf8",
);
const frameCss = readFileSync(
  join(import.meta.dirname, "../../src/staff/staff.module.css"),
  "utf8",
);
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";
const DESKTOP = "@media (min-width: 900px)";
const PANEL_BESIDE_TABLE = "@media (min-width: 1260px)";
/** The pinned bar: a 52 px button, 20 px of padding around it and a 1 px rule. */
const PINNED_BAR_HEIGHT_PX = 73;

function pixelsOf(className: string, property: string): number[] {
  return valuesFor(css, className, property).map((value) =>
    Number.parseFloat(value),
  );
}

describe("what a thumb must hit", () => {
  it.each([
    ["back", "min-height"],
    ["inlineLink", "min-height"],
    ["tab", "min-height"],
    ["groupToggle", "min-height"],
    ["textInput", "min-height"],
    ["primary", "min-height"],
    ["secondary", "min-height"],
    ["checkRow", "min-height"],
    ["version", "min-height"],
  ])("declares .%s at least 44 px tall", (className, property) => {
    const declared = valuesFor(css, className, property);

    expect(declared, className).not.toEqual([]);
    for (const value of declared) {
      const height = value === TOUCH_TARGET ? 44 : Number.parseFloat(value);
      expect(height, className).toBeGreaterThanOrEqual(44);
    }
  });

  it.each(["revert", "switch"])(
    "declares .%s a touch target tall, and the arrow a touch target wide",
    (className) => {
      const heights = declarationsFor(css, className, "height")
        .filter((declaration) => declaration.selector === `.${className}`)
        .map((declaration) => declaration.value);

      expect(heights).toEqual([TOUCH_TARGET]);
    },
  );

  it("declares the arrow a touch target wide", () => {
    expect(valuesFor(css, "revert", "width")).toEqual([TOUCH_TARGET]);
    expect(pixelsOf("switch", "width")[0]).toBeGreaterThanOrEqual(44);
  });

  it("draws a visible ring on every control that can take focus", () => {
    for (const control of [
      "back",
      "inlineLink",
      "tab",
      "revert",
      "groupToggle",
      "textInput",
      "primary",
      "switch",
      "checkInput",
    ]) {
      const hasRing = css
        .split("}")
        .some(
          (rule) =>
            rule.includes(`.${control}:focus-visible`) &&
            rule.includes("outline: 2px"),
        );

      expect(hasRing, `${control} has a focus ring`).toBe(true);
    }
  });
});

describe("one markup, two layouts", () => {
  it("is a card with the arrow beside the name on a phone and the table's five columns from 900 px", () => {
    expect(
      declarationsFor(css, "row", "grid-template-columns").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "minmax(0, 1fr) var(--touch-target)"],
      [DESKTOP, "var(--diff-columns)"],
    ]);
  });

  it("shows the column titles only from 900 px", () => {
    expect(
      declarationsFor(css, "columns", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "none"],
      [DESKTOP, "grid"],
    ]);
  });

  it("keeps each cell's own words on a phone and hides them from sight, not from a reader, from 900 px", () => {
    expect(declarationsFor(css, "cellLabel", "position")).toEqual([
      expect.objectContaining({ media: DESKTOP, value: "absolute" }),
    ]);
    expect(declarationsFor(css, "cellLabel", "clip-path")).toEqual([
      expect.objectContaining({ media: DESKTOP }),
    ]);
  });

  it("puts the panel beside the rows only from 1260 px, below them from 900 px", () => {
    expect(
      declarationsFor(css, "layout", "grid-template-columns").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[PANEL_BESIDE_TABLE, "minmax(0, 1fr) 320px"]]);
  });

  it("pins the publish bar at the foot of a phone and nowhere else", () => {
    expect(
      declarationsFor(css, "actionBar", "position").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[PHONE, "sticky"]]);
    expect(
      declarationsFor(css, "actionBar", "bottom").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[PHONE, "0"]]);
  });

  it("lifts the panel's controls into the layout on a phone, so the bar's containing block is the page and not the panel below the list", () => {
    expect(
      declarationsFor(css, "aside", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "flex"],
      [PHONE, "contents"],
    ]);
  });

  it("leaves room under a row or control focused on a phone for the pinned bar", () => {
    for (const className of [
      "row",
      "revert",
      "groupToggle",
      "textInput",
      "switch",
    ]) {
      const margins = declarationsFor(css, className, "scroll-margin-bottom");

      expect(
        margins.map((d) => d.media),
        className,
      ).toEqual([PHONE]);
      expect(
        Number.parseFloat(margins[0]?.value ?? "0"),
        className,
      ).toBeGreaterThanOrEqual(PINNED_BAR_HEIGHT_PX);
    }
  });

  it("shows the phone's line of subtitle on a phone and the desktop's from 900 px", () => {
    expect(
      declarationsFor(css, "subtitleOnPhone", "display").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "block"],
      [DESKTOP, "none"],
    ]);
    expect(
      declarationsFor(css, "subtitleOnDesktop", "display").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "none"],
      [DESKTOP, "block"],
    ]);
  });
});

describe("a narrow screen", () => {
  it("lets a name wrap instead of widening the page", () => {
    expect(valuesFor(css, "name", "overflow-wrap")).toEqual(["anywhere"]);
    expect(valuesFor(css, "title", "overflow-wrap")).toEqual(["anywhere"]);
  });

  it("scrolls nothing sideways but the table, inside its own box and only from 900 px", () => {
    expect(
      declarationsFor(css, "diffScroll", "overflow-x").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[DESKTOP, "auto"]]);
    expect(css.match(/overflow(-x)?:\s*(auto|scroll)/g)).toHaveLength(1);
  });

  it("fixes no width on the page", () => {
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/);
  });

  it("keeps a closed bulk row's members out of the layout whatever display their list declares", () => {
    expect(css).toMatch(/\.members\[hidden\]\s*\{\s*display:\s*none/);
  });
});

describe("a value that does not fit its column", () => {
  it("breaks at spaces and only when a single word is wider than the column, never anywhere in a word", () => {
    expect(valuesFor(css, "cellValue", "overflow-wrap")).toEqual([
      "break-word",
    ]);
    expect(css).not.toMatch(/word-break:\s*break-all/);
  });

  it("draws the dash of an empty cell with an empty alternative, so it is read by nobody", () => {
    expect(css).toMatch(
      /\.cell\[data-empty="true"\] \.cellValue::before\s*\{\s*content:\s*"\\2014" \/ ""/,
    );
  });
});

describe("a table that cannot be squeezed", () => {
  const trackMinimums = [
    "--diff-name-min",
    "--diff-before-min",
    "--diff-after-min",
    "--diff-difference-min",
  ];

  function pixelsOfVariable(name: string): number {
    const [declared] = valuesFor(css, "page", name);
    return Number.parseFloat(declared ?? "NaN");
  }

  function narrowestTablePx(): number {
    const minimums = trackMinimums.map(pixelsOfVariable);
    const sum = minimums.reduce((total, width) => total + width, 0);
    return (
      sum +
      44 +
      4 * pixelsOfVariable("--diff-gap") +
      2 * pixelsOfVariable("--diff-row-inline") +
      pixelsOfVariable("--diff-members-inset")
    );
  }

  it("gives each of the four flexible tracks a minimum width, none of them zero", () => {
    const [columns] = valuesFor(css, "page", "--diff-columns");

    expect(columns).not.toMatch(/minmax\(\s*0/);
    for (const variable of trackMinimums) {
      expect(columns, variable).toContain(`minmax(var(${variable}),`);
      expect(pixelsOfVariable(variable), variable).toBeGreaterThan(0);
    }
  });

  it("makes the table as wide as its tracks, gaps, padding and the members' inset need, so a row never leaves its box", () => {
    const [minWidth] = valuesFor(css, "diff", "min-width");
    const [declaredCalc] = valuesFor(css, "page", "--diff-min-width");

    expect(minWidth).toBe("var(--diff-min-width)");
    for (const variable of [
      ...trackMinimums,
      "--diff-gap",
      "--diff-row-inline",
      "--diff-members-inset",
    ]) {
      expect(declaredCalc, variable).toContain(`var(${variable})`);
    }
    expect(declaredCalc).toContain("var(--touch-target)");
  });

  /** What the staff frame takes from the width of the screen from 900 px: its navigation and the page's side padding. */
  function frameTakesPx(): number {
    const navigation = declarationsFor(frameCss, "nav", "flex").find(
      (d) => d.media === DESKTOP,
    );
    const padding = declarationsFor(frameCss, "content", "padding").find(
      (d) => d.media === DESKTOP,
    );
    const navigationPx = Number.parseFloat(
      navigation?.value.split(" ")[2] ?? "NaN",
    );
    const sidePx = Number.parseFloat(padding?.value.split(" ")[1] ?? "NaN");
    return navigationPx + 2 * sidePx;
  }

  it("fits at 900 px beside the staff navigation, so the table does not scroll where the frame first draws it", () => {
    expect(900 - frameTakesPx()).toBeGreaterThanOrEqual(narrowestTablePx());
  });

  it("puts the panel beside the table only where the table still has its narrowest width", () => {
    const [grid] = valuesFor(css, "layout", "grid-template-columns");
    const [gap] = declarationsFor(css, "layout", "gap")
      .filter((d) => d.media === PANEL_BESIDE_TABLE)
      .map((d) => Number.parseFloat(d.value));
    const panelPx = Number.parseFloat(grid?.split(" ").at(-1) ?? "NaN");

    expect(
      1260 - frameTakesPx() - panelPx - (gap ?? Number.NaN),
    ).toBeGreaterThanOrEqual(narrowestTablePx());
  });
});
