// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the materials pages:
// every interactive box at least a touch target tall, a ring on whatever takes focus, the card layout until 1200 px and
// the table from there (five columns with their titles whole, which do not fit beside the staff frame's navigation any
// sooner, by the arithmetic below, not by a measurement in a browser), the column titles read by the cells below that,
// a row's menu floating over the rows wherever a pointer is the input, and nothing that would make a 390 px page scroll
// sideways. A surcharge is never edited in a card.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(import.meta.dirname, "../../src/price-dashboard/material.module.css"),
  "utf8",
);
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";
const POINTER_WIDTH = "@media (min-width: 900px)";
const TABLE = "@media (min-width: 1200px)";
/**
 * The staff frame's navigation and the content's margins, from `staff.module.css`: what the table's width is taken
 * from.
 */
const NAVIGATION_PX = 264;
const CONTENT_MARGINS_PX = 56 * 2;
const REM_PX = 16;
const ROW_PADDING_PX = 14 * 2;
const COLUMN_GAP_PX = 16;
const TABLE_COLUMNS = 5;
/**
 * A Russian column title at 11 px uppercase with its letter-spacing: the measured width of "Направляющие" (113 px,
 * twelve letters, in the hardware stylesheet's test) scaled to the nine letters of "Состояние", the longest word of
 * these titles. */
const LONGEST_TITLE_WORD_PX = Math.ceil((113 / 12) * 9);
/** What the first column wants for a name and a line of description at the narrowest the table is drawn. */
const MATERIAL_COLUMN_WANTS_PX = 180;

describe("what a thumb must hit", () => {
  it.each([
    "back",
    "name",
    "editLink",
    "more",
    "menuEntry",
    "switch",
    "savedLink",
  ])("declares .%s a touch target tall", (className) => {
    const heights = valuesFor(css, className, "min-height");

    expect(heights, className).not.toEqual([]);
    for (const height of heights) expect(height, className).toBe(TOUCH_TARGET);
  });

  it.each(["editLink", "more", "menuEntry"])(
    "declares .%s a touch target wide",
    (className) => {
      expect(valuesFor(css, className, "min-width")).toEqual([TOUCH_TARGET]);
    },
  );

  it("draws a visible ring on every control that can take focus", () => {
    for (const control of [
      "back",
      "name",
      "editLink",
      "more",
      "menuEntry",
      "switch",
      "savedLink",
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
  it("is a one-column card until 1200 px and the table's five columns from there, titles and rows on one template", () => {
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

  it("keeps every column that carries a title at least as wide as the longest title word", () => {
    const [template = ""] = valuesFor(css, "page", "--table-columns");
    const [minimum] = valuesFor(css, "page", "--title-column-min");

    expect(template.replaceAll(/\s+/g, " ")).toContain(
      "minmax(var(--title-column-min), 1.2fr)",
    );
    expect(template.match(/var\(--title-column-min\)/g)).toHaveLength(3);
    expect(Number.parseFloat(minimum ?? "")).toBeGreaterThan(
      LONGEST_TITLE_WORD_PX,
    );
  });

  it("starts the table only where the five columns fit with their titles whole, beside the staff frame's navigation", () => {
    const [minimum] = valuesFor(css, "page", "--title-column-min");
    const actionsRem = /minmax\((\d+)rem, 1\.6fr\)\s*$/.exec(
      valuesFor(css, "page", "--table-columns")[0] ?? "",
    )?.[1];
    const actionsPx = Number.parseFloat(actionsRem ?? "") * REM_PX;
    const titledColumnsPx = 3 * Number.parseFloat(minimum ?? "");
    const contentAtTableStartPx =
      1200 - NAVIGATION_PX - CONTENT_MARGINS_PX - ROW_PADDING_PX;
    const gapsPx = (TABLE_COLUMNS - 1) * COLUMN_GAP_PX;

    expect(actionsPx).toBeGreaterThan(0);
    expect(
      contentAtTableStartPx - gapsPx - titledColumnsPx - actionsPx,
      "what is left for the material column at 1200 px",
    ).toBeGreaterThanOrEqual(MATERIAL_COLUMN_WANTS_PX);
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
  });

  it("lets a press through the actions' empty space to the stretched link on a phone, and gives it back to each control and the open menu", () => {
    expect(declarationsFor(css, "rowActions", "pointer-events")).toEqual([
      expect.objectContaining({ media: PHONE, value: "none" }),
    ]);
    for (const control of ["editLink", "more", "menu"]) {
      expect(declarationsFor(css, control, "pointer-events"), control).toEqual([
        expect.objectContaining({ media: PHONE, value: "auto" }),
      ]);
    }
  });

  it("floats a row's menu over the rows from 900 px, anchored to the three dots, below the dialogs, and keeps it in the flow on a phone", () => {
    expect(declarationsFor(css, "menu", "position")).toEqual([
      expect.objectContaining({ media: POINTER_WIDTH, value: "absolute" }),
    ]);
    expect(declarationsFor(css, "rowMenu", "position")).toEqual([
      expect.objectContaining({ media: POINTER_WIDTH, value: "relative" }),
    ]);
    expect(
      declarationsFor(css, "rowMenu", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "contents"],
      [POINTER_WIDTH, "flex"],
    ]);
    expect(declarationsFor(css, "menu", "z-index")).toEqual([
      expect.objectContaining({ media: POINTER_WIDTH, value: "2" }),
    ]);
  });

  it("opens the menu to the right of the three dots in a card and to their left in the table, and gives it a readable width", () => {
    expect(
      declarationsFor(css, "menu", "left").map((d) => [d.media, d.value]),
    ).toEqual([
      [POINTER_WIDTH, "calc(100% + 8px)"],
      [TABLE, "auto"],
    ]);
    expect(declarationsFor(css, "menu", "right")).toEqual([
      expect.objectContaining({ media: TABLE, value: "calc(100% + 8px)" }),
    ]);
    expect(valuesFor(css, "menu", "min-width")).toEqual(["15rem"]);
    expect(valuesFor(css, "menu", "max-width")).toEqual(["20rem"]);
  });

  it("puts the surcharge and the colours side by side in a card, and a material's two columns side by side from the table's width only", () => {
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
      [TABLE, "row"],
    ]);
  });
});

describe("a narrow screen", () => {
  it("lets a name wrap instead of widening the page", () => {
    for (const className of [
      "name",
      "title",
      "description",
      "wordsValue",
      "cellValue",
      "factValue",
      "exampleLine",
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
      "fact",
    ]) {
      expect(valuesFor(css, className, "min-width"), className).toEqual(["0"]);
    }
  });

  it("scrolls nothing sideways and fixes no width on the page", () => {
    expect(css).not.toMatch(/overflow(-x)?:\s*(auto|scroll)/);
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/);
  });

  it("holds no field in the list: a surcharge is edited on the material's own page", () => {
    expect(valuesFor(css, "input", "min-height")).toEqual([]);
  });
});
