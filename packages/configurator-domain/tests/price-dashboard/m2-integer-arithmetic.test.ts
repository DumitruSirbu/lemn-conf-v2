// M10 M2: integer arithmetic only (ADR 0177 A-1). The money in these modules comes from the pricing module's own
// functions; none of them rounds, divides or formats a number itself, and a source that did would be a second rounding seam.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const M2_SOURCES = [
  "bulk-change.ts",
  "judge-book.ts",
  "cabinet-preview.ts",
  "priced-row.ts",
  "percent-bounds.ts",
] as const;

const FLOAT_ROUNDING =
  /Math\.(round|floor|ceil|trunc)\b|\.toFixed\(|parseFloat|toLocaleString/;

function sourceOf(fileName: string): string {
  const url = new URL(`../../src/price-dashboard/${fileName}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("the M2 modules' arithmetic", () => {
  it.each(M2_SOURCES)("%s rounds and formats nothing itself", (fileName) => {
    const code = sourceOf(fileName)
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");

    expect(code).not.toMatch(FLOAT_ROUNDING);
  });
});
