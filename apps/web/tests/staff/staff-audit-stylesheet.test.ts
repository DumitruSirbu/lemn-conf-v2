// What the audit page's stylesheet declares, read from its text (no layout runs here): the day fields are as tall as the
// selects beside them and a thumb can hit them, the table is the frame's four columns on a fixed layout and turns on at the
// width the script draws it at, and the classes the components name exist. The page, count, foot and state classes are the
// kitchens list's own and are tested with it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const SOURCE_ROOT = join(import.meta.dirname, "../../src/staff");
const css = readFileSync(join(SOURCE_ROOT, "staff-audit.module.css"), "utf8");
const DESKTOP_MEDIA = "@media (min-width: 900px)";

describe("the audit stylesheet", () => {
  it("declares the day fields at least 48 px tall, as the selects of the list are", () => {
    const listCss = readFileSync(
      join(SOURCE_ROOT, "staff-kitchens.module.css"),
      "utf8",
    );

    expect(valuesFor(css, "dayInput", "min-height")).toEqual(["48px"]);
    expect(valuesFor(listCss, "statusSelect", "min-height")).toEqual(["48px"]);
  });

  it("lays the table out on fixed columns that the window may scroll inside, never wider than the box", () => {
    expect(valuesFor(css, "table", "table-layout")).toEqual(["fixed"]);
    expect(valuesFor(css, "table", "min-width")).toEqual(["760px"]);
  });

  it("turns the wide filter fields and the day fields into the frame's widths from the desktop width", () => {
    const widths = declarationsFor(css, "field", "flex");

    expect(widths.filter(({ media }) => media === DESKTOP_MEDIA)).toHaveLength(
      2,
    );
    expect(css).toContain("calc((100% - 170px) * 1.3 / 4.7)");
    expect(css).toContain("calc((100% - 170px) * 1.2 / 4.7)");
    expect(css).toContain("calc((100% - 170px) * 2.2 / 4.7)");
  });

  it.each([
    ["styles", "staff-audit.module.css"],
    ["listStyles", "staff-kitchens.module.css"],
  ])("names every class the components take from %s", (binding, stylesheet) => {
    const sheet = readFileSync(join(SOURCE_ROOT, stylesheet), "utf8");
    const used = [
      "staff-audit-page.tsx",
      "staff-audit-rows.tsx",
      "staff-audit-filters.tsx",
    ].flatMap((file) =>
      [
        ...readFileSync(join(SOURCE_ROOT, file), "utf8").matchAll(
          new RegExp(`\\b${binding}\\.(\\w+)`, "g"),
        ),
      ].map((match) => match[1] ?? ""),
    );

    expect(used.length).toBeGreaterThan(5);
    for (const name of new Set(used)) {
      expect(sheet, `.${name}`).toMatch(new RegExp(`\\.${name}\\b`));
    }
  });
});
