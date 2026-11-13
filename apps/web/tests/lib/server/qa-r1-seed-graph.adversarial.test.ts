import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Adversarial QA for M10 wave R1's review round: "the seed is loaded only by dynamic import". A production build's module
// graph is the static imports from every route and page; if the seeding helper (the one module that names the sample book)
// is in it, the sample ships with the code however the store is selected. The walk is repeated with dynamic imports
// counted, as the control that shows the walker can see the helper at all.

const SOURCE_ROOT = resolve(import.meta.dirname, "../../../src");
const SEEDING_HELPER = join(SOURCE_ROOT, "lib/server/price-book-test-seed.ts");
const STATIC_IMPORT =
  /(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const ENTRY =
  /(?:^|\/)(?:page|route|layout|loading|error|not-found)\.tsx?$|^(?:proxy|instrumentation)\.ts$/;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function resolveModule(
  specifier: string,
  importer: string,
): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
  );
}

function importsOf(path: string, isDynamicCounted: boolean): string[] {
  const source = withoutComments(readFileSync(path, "utf8"));
  const patterns = isDynamicCounted
    ? [STATIC_IMPORT, DYNAMIC_IMPORT]
    : [STATIC_IMPORT];
  return patterns
    .flatMap((pattern) => [...source.matchAll(pattern)])
    .map((match) => match[1] ?? match[2] ?? "")
    .flatMap((specifier) => resolveModule(specifier, path) ?? []);
}

function reachableFrom(
  entries: readonly string[],
  isDynamicCounted: boolean,
): Set<string> {
  const seen = new Set<string>();
  const pending = [...entries];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...importsOf(next, isDynamicCounted));
  }
  return seen;
}

describe("what a production build can reach", () => {
  const entries = filesUnder(SOURCE_ROOT).filter((path) =>
    ENTRY.test(path.slice(SOURCE_ROOT.length + 1)),
  );

  it("walks real entries: the pages, the routes and the price reader", () => {
    expect(entries.length).toBeGreaterThan(40);
    expect(reachableFrom(entries, false)).toContain(
      join(SOURCE_ROOT, "lib/server/active-price-book.ts"),
    );
  });

  it("does not reach the seeding helper, or any module that names the sample book, by a static import", () => {
    const reached = reachableFrom(entries, false);

    const namingTheSample = [...reached].filter((path) =>
      /\bSAMPLE_PRICE_BOOK/.test(withoutComments(readFileSync(path, "utf8"))),
    );

    expect(reached.has(SEEDING_HELPER)).toBe(false);
    expect(namingTheSample).toEqual([]);
  });

  it("reaches the seeding helper once dynamic imports are counted, so the walk could have seen it", () => {
    expect(reachableFrom(entries, true).has(SEEDING_HELPER)).toBe(true);
  });

  it("is imported dynamically from one module alone", () => {
    const importers = filesUnder(SOURCE_ROOT).filter((path) =>
      withoutComments(readFileSync(path, "utf8")).includes(
        "price-book-test-seed",
      ),
    );

    expect(importers.map((path) => path.slice(SOURCE_ROOT.length + 1))).toEqual(
      ["lib/server/price-stores.ts"],
    );
  });
});
