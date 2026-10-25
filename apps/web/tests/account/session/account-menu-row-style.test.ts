// The menu's rows, the staff area's entry among them, are drawn from one class. The smallest touch target a row may have
// and the ring a keyboard user sees on it are the stylesheet's, so they are read from its text: a DOM test lays nothing
// out and would pass whatever the rule said.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MINIMUM_TOUCH_TARGET_PX = 44;
const STYLESHEET = readFileSync(
  resolve(__dirname, "../../../src/account/account.module.css"),
  "utf8",
);

function ruleBodyOf(selector: string): string {
  const start = STYLESHEET.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return STYLESHEET.slice(start, STYLESHEET.indexOf("}", start));
}

describe("a row of the account menu", () => {
  it("is at least 44 px tall, the smallest touch target", () => {
    const minHeight = /min-height:\s*(\d+)px/.exec(ruleBodyOf(".menuRow"));

    expect(Number(minHeight?.[1])).toBeGreaterThanOrEqual(
      MINIMUM_TOUCH_TARGET_PX,
    );
  });

  it("draws a visible ring when the keyboard is on it", () => {
    const ring = ruleBodyOf(".menuRow:focus-visible");

    expect(ring).toMatch(/outline:\s*2px solid var\(--accent\)/);
  });
});
