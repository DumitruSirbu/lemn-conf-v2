// The text of a price-dashboard item screen's stylesheet together with the shared sheet it composes from, which is what
// the browser applies. A screen's own file alone no longer holds the rules every item screen draws alike.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIRECTORY = join(import.meta.dirname, "../../src/price-dashboard");
export const SHARED_SHEET_NAME = "item-screen.module.css";

export function readItemScreenSheet(screenSheetName: string): string {
  return `${readSheet(SHARED_SHEET_NAME)}\n${readSheet(screenSheetName)}`;
}

/** The classes of the shared sheet that a screen's own sheet has not taken with `composes`. */
export function sharedClassesNotComposed(screenSheetName: string): string[] {
  const composed = new Set(
    [
      ...readSheet(screenSheetName).matchAll(
        /composes:\s*(\w+)\s+from\s+"\.\/item-screen\.module\.css"/g,
      ),
    ].map((match) => match[1]),
  );
  return classesOf(readSheet(SHARED_SHEET_NAME)).filter(
    (className) => !composed.has(className),
  );
}

function classesOf(css: string): string[] {
  const selectorsOnly = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{[^{}]*\}/g, "{}");
  return [
    ...new Set(
      [...selectorsOnly.matchAll(/\.([A-Za-z_]\w*)/g)].map((match) => match[1]),
    ),
  ].filter((className): className is string => className !== undefined);
}

function readSheet(name: string): string {
  return readFileSync(join(SOURCE_DIRECTORY, name), "utf8");
}
