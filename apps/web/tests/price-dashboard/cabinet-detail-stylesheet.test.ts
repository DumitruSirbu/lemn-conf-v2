// Reads the stylesheet's text (no layout runs here) for what a thumb and a narrow screen need from a cabinet's page: every
// control at least a touch target tall with a visible ring, the save bar fixed at the foot of a phone, each width of the
// table a card there, and nothing that would make a 390 px page scroll sideways.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(
    import.meta.dirname,
    "../../src/price-dashboard/cabinet-detail.module.css",
  ),
  "utf8",
);
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";
const DESKTOP = "@media (min-width: 900px)";

function heightOf(className: string): number {
  const [height] = valuesFor(css, className, "min-height");
  if (height === undefined) throw new Error(`.${className} has no min-height`);
  return height === TOUCH_TARGET ? 44 : Number.parseFloat(height);
}

describe("what a thumb must hit", () => {
  it.each(["back", "switch", "tierChoice", "inlineLink"])(
    "declares .%s at least 44 px tall",
    (className) => {
      expect(heightOf(className)).toBeGreaterThanOrEqual(44);
    },
  );

  it("draws a visible ring on every control that takes focus", () => {
    for (const control of ["back", "switch", "inlineLink"]) {
      const hasRing = css
        .split("}")
        .some(
          (rule) =>
            rule.includes(`.${control}:focus-visible`) &&
            rule.includes("outline: 2px"),
        );

      expect(hasRing, `${control} has a focus ring`).toBe(true);
    }
    expect(css).toContain(".tierChoice:has(:focus-visible)");
  });
});

describe("one markup, two layouts", () => {
  it("stacks the cabinet above its price on a phone and puts them side by side from 1200 px", () => {
    expect(
      declarationsFor(css, "columns", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "flex"],
      ["@media (min-width: 1200px)", "grid"],
    ]);
  });

  it("fixes the save bar at the foot of a phone and nowhere else", () => {
    expect(
      declarationsFor(css, "actions", "position").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[PHONE, "sticky"]]);
    expect(
      declarationsFor(css, "actions", "bottom").map((d) => [d.media, d.value]),
    ).toEqual([[PHONE, "0"]]);
  });

  it("keeps the save bar last in the price column on a phone, so it stays pinned down to the table", () => {
    expect(
      declarationsFor(css, "actions", "order").map((d) => [d.media, d.value]),
    ).toEqual([[PHONE, "1"]]);
    expect(css.match(/(?<![-\w])order:/g)).toHaveLength(1);
  });

  it("leaves room under a control focused on a phone for the pinned save bar", () => {
    const margins = declarationsFor(css, "switch", "scroll-margin-bottom");

    expect(margins.map((d) => d.media)).toEqual([PHONE]);
    expect(Number.parseFloat(margins[0]?.value ?? "0")).toBeGreaterThanOrEqual(
      69,
    );
    expect(css).toMatch(
      /\.fields input,\s*\.switch,\s*\.tierChoice input\s*\{[^}]*scroll-margin-bottom/,
    );
  });

  it("draws each width of the table as a card on a phone, with the column titles kept for screen readers", () => {
    expect(
      declarationsFor(css, "previewTable", "display").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[PHONE, "block"]]);
    expect(declarationsFor(css, "previewTable", "position")).toEqual([]);
    expect(css).toMatch(/\.previewTable thead\s*\{[^}]*clip-path/);
    expect(css).toMatch(
      /\.previewTable td::before\s*\{[^}]*attr\(data-label\)/,
    );
  });
});

describe("a narrow screen", () => {
  it("scrolls nothing sideways but the price table, inside its own box and only from 900 px", () => {
    expect(
      declarationsFor(css, "previewScroll", "overflow-x").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[DESKTOP, "auto"]]);
    expect(css.match(/overflow(-x)?:\s*(auto|scroll)/g)).toHaveLength(1);
  });

  it("fixes no width on the page", () => {
    expect(css).not.toMatch(/(?<![-\w(,])width:\s*\d{3,}px/);
  });

  it("lets a long name wrap instead of widening the page", () => {
    expect(valuesFor(css, "title", "overflow-wrap")).toEqual(["anywhere"]);
    expect(valuesFor(css, "aboutColumn", "min-width")).toEqual(["0"]);
  });

  it("draws the marks it needs, so no glyph is text", () => {
    expect(valuesFor(css, "back", "content")).toEqual(['"\\2039" / ""']);
    expect(valuesFor(css, "inlineLink", "content")).toEqual(['"\\2192" / ""']);
  });
});
