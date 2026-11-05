// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the hardware pages: every
// interactive box at least a touch target tall, a ring on whatever takes focus, the card layout until 1440 px and the table
// from there (the state column holds its widest Russian chips only from 1434 px, measured in a browser), the
// column titles read by the cells below that, a row's menu floating over the rows wherever a pointer is the input, and nothing
// that would make a 390 px page scroll sideways. A price is never edited in a card.
import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";
import { readItemScreenSheet } from "../support/item-screen-stylesheet";

const css = readItemScreenSheet("hardware.module.css");
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";
const POINTER_WIDTH = "@media (min-width: 900px)";
const TABLE = "@media (min-width: 1440px)";
const EDIT_COLUMNS = "@media (min-width: 1200px)";
const RATE_TITLE_WORD_PX = 113;
const WIDEST_STATE_CHIP_PX = 88;

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

  it("declares the buttons that are links at least 44 px tall", () => {
    for (const value of valuesFor(css, "linkAction", "min-height")) {
      expect(Number.parseFloat(value)).toBeGreaterThanOrEqual(44);
    }
    expect(valuesFor(css, "linkAction", "min-height")).not.toEqual([]);
  });

  it("draws a visible ring on every control that can take focus", () => {
    for (const control of [
      "addLink",
      "linkAction",
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
  it("is a one-column card until 1440 px and the table's eight columns from there, titles and rows on one template", () => {
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

  it("keeps each rate column at least as wide as the widest title word, and the table's columns on that minimum", () => {
    const [template] = valuesFor(css, "page", "--table-columns");
    const [minimum] = valuesFor(css, "page", "--rate-column-min");

    expect(template?.replaceAll(/\s+/g, " ")).toContain(
      "repeat(var(--rate-count), minmax(var(--rate-column-min), 1fr))",
    );
    expect(Number.parseFloat(minimum ?? "")).toBeGreaterThan(
      RATE_TITLE_WORD_PX,
    );
  });

  it("keeps the state column at least as wide as its widest chip, so a window a scrollbar narrows still holds it", () => {
    const [template] = valuesFor(css, "page", "--table-columns");
    const [minimum] = valuesFor(css, "page", "--state-column-min");

    expect(template?.replaceAll(/\s+/g, " ")).toContain(
      "minmax(var(--state-column-min), 1.2fr)",
    );
    expect(Number.parseFloat(minimum ?? "")).toBeGreaterThan(
      WIDEST_STATE_CHIP_PX,
    );
  });

  it("shows the column titles only in the table, and keeps each cell's own words for a reader there", () => {
    expect(
      declarationsFor(css, "columns", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "none"],
      [TABLE, "grid"],
    ]);
    expect(declarationsFor(css, "rateLabel", "position")).toEqual([
      expect.objectContaining({ media: TABLE, value: "absolute" }),
    ]);
    expect(declarationsFor(css, "rateLabel", "clip-path")).toEqual([
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
    expect(
      declarationsFor(css, "rowMenu", "position").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      [POINTER_WIDTH, "relative"],
      [TABLE, "static"],
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

  it("opens the menu of a table row below the row and left of its actions, so it covers neither the row's own chips nor the next row's three dots", () => {
    expect(
      declarationsFor(css, "menu", "top").map((d) => [d.media, d.value]),
    ).toEqual([
      [POINTER_WIDTH, "0"],
      [TABLE, "calc(100% + 4px)"],
    ]);
    expect(
      declarationsFor(css, "rowActions", "position").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      [PHONE, "relative"],
      [TABLE, "relative"],
    ]);
    expect(
      declarationsFor(css, "rowActions", "align-self").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[TABLE, "stretch"]]);
  });

  it("puts the rates two by two on a phone and in a row once a card is wide enough", () => {
    expect(
      declarationsFor(css, "rates", "grid-template-columns").map(
        (d) => d.value,
      ),
    ).toEqual([
      "repeat(2, minmax(0, 1fr))",
      "repeat(var(--rate-count), minmax(0, 1fr))",
    ]);
  });

  it("puts a class's two columns side by side from 1200 px only", () => {
    expect(
      declarationsFor(css, "editColumns", "flex-direction").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "column"],
      [EDIT_COLUMNS, "row"],
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
      "rateValue",
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
      "rate",
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

  it("holds no field in the list: a price is edited on the class's own page", () => {
    expect(valuesFor(css, "input", "min-height")).toEqual([]);
  });
});
