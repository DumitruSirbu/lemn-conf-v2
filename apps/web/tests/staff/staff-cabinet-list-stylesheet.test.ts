// What the cabinet list's stylesheet declares, read from its text (no layout runs here): the group headers and the
// expand-all button are touch targets, a closed panel stays closed whatever `display` its class sets, and the classes the
// component names exist (W6c-2).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { valuesFor } from "../support/css-declarations";

const SOURCE_ROOT = join(import.meta.dirname, "../../src/staff");
const css = readFileSync(
  join(SOURCE_ROOT, "staff-cabinet-list.module.css"),
  "utf8",
);
const component = readFileSync(
  join(SOURCE_ROOT, "staff-cabinet-list.tsx"),
  "utf8",
);
const MINIMUM_GROUP_HEADER_HEIGHT = "52px";

describe("the cabinet list stylesheet", () => {
  it("makes each group header at least 52 px tall, which is above the 44 px touch target", () => {
    expect(valuesFor(css, "groupButton", "min-height")).toEqual([
      MINIMUM_GROUP_HEADER_HEIGHT,
    ]);
  });

  it("makes the expand-all button at least the touch target tall", () => {
    expect(valuesFor(css, "toggleAll", "min-height")).toEqual([
      "var(--touch-target)",
    ]);
  });

  it("keeps a closed panel out of the page although its class sets a display", () => {
    expect(valuesFor(css, "rows", "display")).toEqual(["flex", "none"]);
    expect(css).toMatch(/\.rows\[hidden\]\s*\{\s*display:\s*none;/u);
  });

  it("names every class the component takes from it", () => {
    const named = [...component.matchAll(/styles\.(\w+)/gu)].map(
      (match) => match[1],
    );

    expect(named.length).toBeGreaterThan(0);
    for (const name of new Set(named)) {
      expect(css, `.${String(name)}`).toMatch(
        new RegExp(`\\.${String(name)}\\b`, "u"),
      );
    }
  });
});
