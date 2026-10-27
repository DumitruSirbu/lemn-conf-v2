// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from the publish pages: every
// interactive box at least a touch target tall, a ring on whatever takes focus, the card layout on a phone and the table from
// 900 px (the staff frame's own breakpoint), the column titles read by the cells on a phone, and nothing that makes a 390 px
// page scroll sideways.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(import.meta.dirname, "../../src/price-dashboard/publish.module.css"),
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

  it("puts the panel beside the rows only from 900 px, and the publish bar at the foot of a phone", () => {
    expect(
      declarationsFor(css, "layout", "grid-template-columns").map(
        (d) => d.media,
      ),
    ).toEqual([DESKTOP]);
    expect(
      declarationsFor(css, "actionBar", "position").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "sticky"],
      [DESKTOP, "static"],
    ]);
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

  it("scrolls nothing sideways and fixes no width on the page", () => {
    expect(css).not.toMatch(/overflow(-x)?:\s*(auto|scroll)/);
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/);
  });

  it("keeps a closed bulk row's members out of the layout whatever display their list declares", () => {
    expect(css).toMatch(/\.members\[hidden\]\s*\{\s*display:\s*none/);
  });
});
