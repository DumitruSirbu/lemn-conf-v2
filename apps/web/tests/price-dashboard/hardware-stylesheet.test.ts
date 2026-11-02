// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the hardware pages: every
// interactive box at least a touch target tall, a ring on whatever takes focus, the card layout until 1200 px and the table
// from there (seven columns do not fit beside the staff frame's navigation any sooner), the column titles read by the cells
// below that, and nothing that would make a 390 px page scroll sideways. A price is never edited in a card.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(import.meta.dirname, "../../src/price-dashboard/hardware.module.css"),
  "utf8",
);
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";
const TABLE = "@media (min-width: 1200px)";

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
  it("is a one-column card until 1200 px and the table's seven columns from there", () => {
    expect(
      declarationsFor(css, "row", "grid-template-columns").map((d) => d.media),
    ).toEqual(["", TABLE]);
    expect(declarationsFor(css, "row", "grid-template-columns")[0]?.value).toBe(
      "minmax(0, 1fr)",
    );
    expect(
      declarationsFor(css, "row", "grid-template-columns")[1]?.value,
    ).toContain("repeat(var(--rate-count), minmax(0, 1fr))");
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

  it("puts a class's two columns side by side only in the table's width", () => {
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
