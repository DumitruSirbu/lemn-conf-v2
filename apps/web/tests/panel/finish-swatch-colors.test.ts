// The swatch chip promises the customer the colour the front will wear, so the panel must paint the
// adapter's `FINISH_COLORS` and not a copy of them. The seam is a stylesheet, which cannot import a
// constant: `editor-panel.tsx` publishes the colours as custom properties on the shell and the
// stylesheet reads them back. Nothing in the type system spans that hop, so the hazard is a future
// edit quietly re-inlining a hex into the CSS — where it would look right until the adapter's table
// changed and the chip started lying about the finish it sells.
//
// These tests read both files as text because that is the only place the hop is visible.
import { FINISH_COLORS } from "@lemnaria/three-adapter";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PANEL_DIRECTORY = resolve(import.meta.dirname, "../../src/panel");

function readPanelSource(fileName: string): string {
  return readFileSync(resolve(PANEL_DIRECTORY, fileName), "utf8");
}

const componentSource = readPanelSource("editor-panel.tsx");
const stylesheetSource = readPanelSource("editor-panel.module.css");

const SOLID_FINISH_KEYS = Object.keys(
  FINISH_COLORS,
) as (keyof typeof FINISH_COLORS)[];

describe("the panel publishes the adapter's finish colours to its stylesheet", () => {
  it.each(SOLID_FINISH_KEYS)(
    "publishes --finish-%s from the constant",
    (key) => {
      expect(componentSource).toContain(
        `"--finish-${key}": FINISH_COLORS.${key}`,
      );
    },
  );

  it.each(SOLID_FINISH_KEYS)(
    "paints the %s swatch from that property",
    (key) => {
      expect(stylesheetSource).toContain(`background: var(--finish-${key});`);
    },
  );

  it.each(SOLID_FINISH_KEYS)("keeps no literal copy of the %s hex", (key) => {
    expect(stylesheetSource.toLowerCase()).not.toContain(
      FINISH_COLORS[key].toLowerCase(),
    );
  });
});
