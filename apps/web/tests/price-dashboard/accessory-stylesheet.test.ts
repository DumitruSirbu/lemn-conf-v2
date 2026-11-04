// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the accessory pages:
// every interactive box at least a touch target tall, a ring on whatever takes focus, the card layout until 1100 px and the
// table from there (five columns with their titles whole, which a browser measured to fit from a layout width of 1060 px in
// Russian, so the table begins one scrollbar's width later), the column titles read by the cells below that, a row's menu
// floating over the rows wherever a pointer is the input, and nothing that would make a 390 px page scroll sideways. A price
// is never edited in a card.
import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";
import { readItemScreenSheet } from "../support/item-screen-stylesheet";

const css = readItemScreenSheet("accessory.module.css");
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";
const POINTER_WIDTH = "@media (min-width: 900px)";
const TABLE = "@media (min-width: 1100px)";
const PAGE_COLUMNS = "@media (min-width: 1200px)";
const TABLE_FROM_PX = 1100;
/** A classic scrollbar takes up to this much of the layout without moving the width the media query reads. */
const SCROLLBAR_PX = 20;
/** The smallest layout width at which a browser held every Russian title whole and every word unbroken (page width sweep). */
const MEASURED_FITTING_LAYOUT_PX = 1060;
const NAVIGATION_PX = 264;
const CONTENT_MARGINS_PX = 56 * 2;
const REM_PX = 16;
const ROW_PADDING_PX = 14 * 2;
const COLUMN_GAP_PX = 16;
const TABLE_COLUMNS = 5;

describe("what a thumb must hit", () => {
  it.each([
    "back",
    "name",
    "editLink",
    "more",
    "menuEntry",
    "switch",
    "savedLink",
    "addLink",
    "linkAction",
  ])("declares .%s a touch target tall", (className) => {
    const heights = valuesFor(css, className, "min-height");

    expect(heights, className).not.toEqual([]);
    for (const height of heights) {
      expect(["48px", TOUCH_TARGET], className).toContain(height);
    }
  });

  it.each(["editLink", "more", "menuEntry"])(
    "declares .%s a touch target wide",
    (className) => {
      expect(valuesFor(css, className, "min-width")).toEqual([TOUCH_TARGET]);
    },
  );

  it("makes the cabinet type's choice as tall as the fields beside it", () => {
    expect(valuesFor(css, "select", "min-height")).toEqual(["48px"]);
  });

  it("draws a visible ring on every control that can take focus", () => {
    for (const control of [
      "back",
      "name",
      "editLink",
      "more",
      "menuEntry",
      "switch",
      "savedLink",
      "addLink",
      "linkAction",
      "select",
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
  it("is a one-column card until 1100 px and the table's five columns from there, titles and rows on one template", () => {
    const rowColumns = declarationsFor(css, "row", "grid-template-columns");
    const titleColumns = declarationsFor(
      css,
      "columns",
      "grid-template-columns",
    );

    expect(rowColumns.map((d) => [d.media, d.value])).toEqual([
      ["", "minmax(0, 1fr)"],
      [TABLE, "var(--table-columns)"],
    ]);
    expect(titleColumns.map((d) => [d.media, d.value])).toEqual([
      [TABLE, "var(--table-columns)"],
    ]);
    expect(declarationsFor(css, "page", "--table-columns")).toEqual([
      expect.objectContaining({ media: TABLE }),
    ]);
  });

  it("keeps the price and the state at least as wide as the longest title word", () => {
    const [template = ""] = valuesFor(css, "page", "--table-columns");
    const [minimum] = valuesFor(css, "page", "--title-column-min");

    expect(template.match(/minmax\(var\(--title-column-min\)/g)).toHaveLength(
      2,
    );
    expect(Number.parseFloat(minimum ?? "")).toBeGreaterThan(
      Math.ceil((113 / 12) * 9),
    );
  });

  it("starts the table a scrollbar's width after the narrowest layout a browser held its titles whole in, beside the staff frame's navigation", () => {
    const [minimum] = valuesFor(css, "page", "--title-column-min");
    const actionsRem = /minmax\((\d+)rem, 1\.6fr\)\s*$/.exec(
      valuesFor(css, "page", "--table-columns")[0] ?? "",
    )?.[1];
    const actionsPx = Number.parseFloat(actionsRem ?? "") * REM_PX;
    const titledColumnsPx = 2 * Number.parseFloat(minimum ?? "");
    const gapsPx = (TABLE_COLUMNS - 1) * COLUMN_GAP_PX;
    const leftForTheTwoFlexibleColumnsAt = (layoutPx: number) =>
      layoutPx -
      NAVIGATION_PX -
      CONTENT_MARGINS_PX -
      ROW_PADDING_PX -
      gapsPx -
      titledColumnsPx -
      actionsPx;

    expect(actionsPx).toBeGreaterThan(0);
    expect(TABLE_FROM_PX - SCROLLBAR_PX).toBeGreaterThanOrEqual(
      MEASURED_FITTING_LAYOUT_PX,
    );
    expect(
      leftForTheTwoFlexibleColumnsAt(TABLE_FROM_PX - SCROLLBAR_PX),
      "what the name and the rule keep at the table's first width in a window with a scrollbar",
    ).toBeGreaterThanOrEqual(
      leftForTheTwoFlexibleColumnsAt(MEASURED_FITTING_LAYOUT_PX),
    );
  });

  it("shows the column titles only in the table, and keeps each cell's own words for a reader there", () => {
    expect(
      declarationsFor(css, "columns", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "none"],
      [TABLE, "grid"],
    ]);
    expect(declarationsFor(css, "cellLabel", "position")).toEqual([
      expect.objectContaining({ media: TABLE, value: "absolute" }),
    ]);
    expect(declarationsFor(css, "cellLabel", "clip-path")).toEqual([
      expect.objectContaining({ media: TABLE }),
    ]);
  });

  it("stretches the name's link over the whole card on a phone, and only there, with the actions above it", () => {
    expect(declarationsFor(css, "name", "position")).toEqual([
      expect.objectContaining({ media: PHONE, value: "absolute" }),
    ]);
    expect(declarationsFor(css, "rowActions", "z-index")).toEqual([
      expect.objectContaining({ media: PHONE, value: "1" }),
    ]);
    expect(declarationsFor(css, "rowActions", "pointer-events")).toEqual([
      expect.objectContaining({ media: PHONE, value: "none" }),
    ]);
    for (const control of ["editLink", "more", "menu"]) {
      expect(declarationsFor(css, control, "pointer-events"), control).toEqual([
        expect.objectContaining({ media: PHONE, value: "auto" }),
      ]);
    }
  });

  it("floats a row's menu over the rows from 900 px, anchored to the three dots, and keeps it in the flow on a phone", () => {
    expect(declarationsFor(css, "menu", "position")).toEqual([
      expect.objectContaining({ media: POINTER_WIDTH, value: "absolute" }),
    ]);
    expect(
      declarationsFor(css, "rowMenu", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "contents"],
      [POINTER_WIDTH, "flex"],
    ]);
  });

  it("opens the menu to the right of the three dots in a card and to their left in the table", () => {
    expect(
      declarationsFor(css, "menu", "left").map((d) => [d.media, d.value]),
    ).toEqual([
      [POINTER_WIDTH, "calc(100% + 8px)"],
      [TABLE, "auto"],
    ]);
    expect(declarationsFor(css, "menu", "right")).toEqual([
      expect.objectContaining({ media: TABLE, value: "calc(100% + 8px)" }),
    ]);
  });

  it("puts the rule and the price side by side in a card, and an accessory's two columns side by side from 1200 px only", () => {
    expect(
      declarationsFor(css, "cells", "grid-template-columns").map(
        (d) => d.value,
      ),
    ).toEqual(["repeat(2, minmax(0, 1fr))"]);
    expect(
      declarationsFor(css, "editColumns", "flex-direction").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "column"],
      [PAGE_COLUMNS, "row"],
    ]);
  });
});

describe("a narrow screen", () => {
  it("lets a name and a rule wrap instead of widening the page", () => {
    for (const className of [
      "name",
      "title",
      "description",
      "wordsValue",
      "cellValue",
      "cellText",
    ]) {
      expect(valuesFor(css, className, "overflow-wrap"), className).toEqual([
        "anywhere",
      ]);
    }
  });

  it("lets every cell shrink", () => {
    for (const className of [
      "page",
      "rowName",
      "cell",
      "words",
      "fields",
      "editColumn",
    ]) {
      expect(valuesFor(css, className, "min-width"), className).toEqual(["0"]);
    }
  });

  it("scrolls nothing sideways and fixes no width on the page", () => {
    expect(css).not.toMatch(/overflow(-x)?:\s*(auto|scroll)/);
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/);
  });

  it("holds no field in the list: a price is edited on the accessory's own page", () => {
    expect(valuesFor(css, "input", "min-height")).toEqual([]);
  });
});
