// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the cabinet list: every
// interactive box at least a touch target tall, the card layout on a phone and the table from 900 px, the staff frame's own
// breakpoint, and nothing that would make a 390 px page scroll sideways.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(
    import.meta.dirname,
    "../../src/price-dashboard/cabinet-list.module.css",
  ),
  "utf8",
);
const TOUCH_TARGET = "var(--touch-target)";
const DESKTOP = "@media (min-width: 900px)";

function pixelsOf(className: string, property: string): number[] {
  return valuesFor(css, className, property).map((value) =>
    Number.parseFloat(value),
  );
}

describe("what a thumb must hit", () => {
  it.each([
    ["groupHeader", "min-height"],
    ["filterToggle", "min-height"],
    ["emptyAction", "min-height"],
    ["searchControl", "min-height"],
  ])("declares .%s at least 44 px tall", (className, property) => {
    const [height] = pixelsOf(className, property);

    expect(height).toBeGreaterThanOrEqual(44);
  });

  it("declares the clear button a touch target wide and tall", () => {
    expect(valuesFor(css, "searchClear", "width")).toEqual([TOUCH_TARGET]);
    expect(valuesFor(css, "searchClear", "height")).toEqual([TOUCH_TARGET]);
  });

  it("draws a visible ring on every control that can take focus", () => {
    for (const control of [
      "searchClear",
      "filterToggle",
      "emptyAction",
      "groupHeader",
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
    expect(css).toContain(".searchControl:focus-within");
  });
});

describe("one markup, two layouts", () => {
  it("is a two-column card on a phone and the table's four columns from 900 px", () => {
    expect(
      declarationsFor(css, "row", "grid-template-columns").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "56px minmax(0, 1fr)"],
      [DESKTOP, "var(--row-columns)"],
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
});

describe("a narrow screen", () => {
  it("lets every column shrink below its content, so a long name wraps instead of widening the page", () => {
    expect(css).toMatch(
      /--row-columns: .*minmax\(0, 1\.6fr\).*minmax\(0, 1fr\).*minmax\(0, 1\.2fr\)/,
    );
    expect(valuesFor(css, "rowName", "min-width")).toEqual(["0"]);
    expect(valuesFor(css, "name", "overflow-wrap")).toEqual(["anywhere"]);
    expect(valuesFor(css, "emptyTitle", "overflow-wrap")).toEqual(["anywhere"]);
  });

  it("scrolls nothing sideways and fixes no width on the page", () => {
    expect(css).not.toMatch(/overflow(-x)?:\s*(auto|scroll)/);
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/);
  });

  it("keeps a closed group out of the layout whatever display its list declares", () => {
    expect(css).toMatch(/\.rows\[hidden\]\s*\{\s*display:\s*none/);
  });
});
