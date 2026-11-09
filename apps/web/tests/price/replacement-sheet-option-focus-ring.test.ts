// The first option of a chooser takes focus while nothing is chosen, so its focus ring must never read as a selection. No
// layout runs here, so this reads the stylesheet's text for the complete list of declarations on `.option`: the ring is an
// outline, the selection is a border, and neither borrows the other's properties.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor } from "../support/css-declarations";

const css = readFileSync(
  join(import.meta.dirname, "../../src/price/replacement-sheet.module.css"),
  "utf8",
);
const globals = readFileSync(
  join(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);

const FOCUS = ".option:focus-visible";
const SELECTED = '.option[data-selected="true"]';

function declared(property: string, selector: string): readonly string[] {
  return declarationsFor(css, "option", property)
    .filter((declaration) => declaration.selector === selector)
    .map(({ value }) => value);
}

describe("an option's focus ring against its selected state", () => {
  it("draws the ring as an outline on keyboard focus, set off the edge, and the selection as a border", () => {
    expect(declared("outline", FOCUS)).toHaveLength(1);
    expect(declared("outline-offset", FOCUS)).toHaveLength(1);
    expect(
      Number.parseFloat(declared("outline-offset", FOCUS)[0] ?? "0"),
    ).toBeGreaterThanOrEqual(2);
    expect(declared("border", SELECTED)).toHaveLength(1);
  });

  it("styles the two with different properties: the ring never sets a border or a fill, the selection never sets an outline", () => {
    for (const property of [
      "border",
      "background",
      "border-color",
      "box-shadow",
    ]) {
      expect(declared(property, FOCUS)).toEqual([]);
    }
    expect(declared("outline", SELECTED)).toEqual([]);
    expect(declared("outline-offset", SELECTED)).toEqual([]);
  });

  it("gives the ring a different line style and colour from the selection's border, so a focused option is not mistaken for a chosen one", () => {
    const ring = declared("outline", FOCUS)[0] ?? "";
    const selectedBorder = declared("border", SELECTED)[0] ?? "";

    expect(ring).toContain("dashed");
    expect(selectedBorder).not.toContain("dashed");
    const colourOf = (value: string) => /var\(--[a-z-]+\)/.exec(value)?.[0];
    expect(colourOf(ring)).toBeDefined();
    expect(colourOf(selectedBorder)).toBeDefined();
    expect(colourOf(ring)).not.toBe(colourOf(selectedBorder));
  });

  it("uses two colours that are different values in the design tokens, not two names for one colour", () => {
    const token = (name: string) =>
      new RegExp(`${name}:\\s*([^;]+);`).exec(globals)?.[1]?.trim();

    expect(token("--ink")).toBeDefined();
    expect(token("--accent")).toBeDefined();
    expect(token("--ink")).not.toBe(token("--accent"));
  });

  it("leaves a struck option with no ring colour of its own to confuse with either, and paints nothing on it that reads as selected", () => {
    const struck = '.option[data-struck="true"]';

    expect(declared("border", struck)).toEqual([]);
    expect(declared("outline", struck)).toEqual([]);
  });
});
