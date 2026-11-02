// Reads the stylesheet's text (no layout runs here) for what a thumb needs from the price fields: every box a person
// presses or types in at least a touch target tall, a visible ring on every control that takes focus, and the invalid
// field drawn in the refusal colours so the state is not carried by the message alone.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const css = readFileSync(
  join(import.meta.dirname, "../../src/price-dashboard/price-edit.module.css"),
  "utf8",
);
const TOUCH_TARGET = "var(--touch-target)";
const PHONE = "@media (max-width: 899.98px)";

function heightOf(className: string): number {
  const [height] = valuesFor(css, className, "min-height");
  if (height === undefined) throw new Error(`.${className} has no min-height`);
  return height === TOUCH_TARGET ? 44 : Number.parseFloat(height);
}

describe("what a thumb must hit", () => {
  it.each([
    "control",
    "input",
    "priceButton",
    "action",
    "bulkChoice",
    "bulkSelect",
    "cabinetCheck",
  ])("declares .%s at least 44 px tall", (className) => {
    expect(heightOf(className)).toBeGreaterThanOrEqual(44);
  });

  it("draws a visible ring on every control that can take focus", () => {
    for (const control of ["priceButton", "action", "bulkSelect"]) {
      const hasRing = css
        .split("}")
        .some(
          (rule) =>
            rule.includes(`.${control}:focus-visible`) &&
            rule.includes("outline: 2px"),
        );

      expect(hasRing, `${control} has a focus ring`).toBe(true);
    }
    expect(css).toContain(".control:focus-within");
    expect(css).toContain(".bulkChoice:has(:focus-visible)");
  });
});

describe("what the fields look like", () => {
  it("draws an invalid field in the refusal colours, with a heavier border", () => {
    const rule = css
      .split("}")
      .find((block) => block.includes('.control[data-invalid="true"]'));

    expect(rule).toContain("var(--refusal-surface)");
    expect(rule).toContain("2px solid var(--refusal)");
  });

  it("draws the pencil as a mask, so no glyph is text", () => {
    expect(valuesFor(css, "pencil", "mask")[0]).toContain("data:image/svg+xml");
    expect(css).not.toMatch(/content:\s*"[^"\\/]/);
  });

  it("keeps the price a button in the table, and below 900 px a figure the card's link opens the cabinet from", () => {
    expect(valuesFor(css, "priceButton", "display")).toEqual(["inline-flex"]);
    expect(
      declarationsFor(css, "priceButton", "pointer-events").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([[PHONE, "none"]]);
    expect(
      declarationsFor(css, "pencil", "display").map((d) => [d.media, d.value]),
    ).toEqual([
      ["", "inline-block"],
      [PHONE, "none"],
    ]);
  });
});
