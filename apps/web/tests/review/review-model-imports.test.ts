// Criterion 8: the review model is a pure value over its inputs. It reaches no React, no store and no route,
// directly or through anything it imports.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../src");
const MODEL = resolve(SRC, "review/review-model.ts");

const BANNED_PACKAGES = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^zustand($|\/)/,
  /^next($|\/)/,
];
const BANNED_LOCAL_PREFIXES = ["store/", "app/", "components/"];

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function specifiersIn(file: string): readonly string[] {
  return [
    ...codeOf(readFileSync(file, "utf8")).matchAll(
      /^(?:import|export)[^;]*?from\s+"([^"]+)"/gm,
    ),
  ]
    .map((match) => match[1] ?? "")
    .filter((specifier) => !specifier.endsWith(".css"));
}

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (base === undefined) return undefined;
  const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
    existsSync,
  );
  if (found === undefined) throw new Error(`cannot resolve ${specifier}`);
  return found;
}

interface ImportClosure {
  readonly files: ReadonlySet<string>;
  readonly packages: ReadonlySet<string>;
}

function closureOf(entry: string): ImportClosure {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of specifiersIn(file)) {
      const local = resolveLocal(file, specifier);
      if (local === undefined) packages.add(specifier);
      else pending.push(local);
    }
  }
  return { files, packages };
}

function violationsIn(closure: ImportClosure): readonly string[] {
  const relative = (file: string) => file.slice(SRC.length + 1);
  return [
    ...[...closure.packages].filter((specifier) =>
      BANNED_PACKAGES.some((banned) => banned.test(specifier)),
    ),
    ...[...closure.files]
      .map(relative)
      .filter(
        (file) =>
          file.endsWith(".tsx") ||
          BANNED_LOCAL_PREFIXES.some((prefix) => file.startsWith(prefix)),
      ),
  ];
}

describe("the review model's imports", () => {
  it("reach no React, store, route or component, however deep", () => {
    expect(violationsIn(closureOf(MODEL))).toEqual([]);
  });

  it("walks the breakdown and the price figure, so the check is not over an empty closure", () => {
    const relative = [...closureOf(MODEL).files].map((file) =>
      file.slice(SRC.length + 1),
    );

    expect(relative).toEqual(
      expect.arrayContaining([
        "price/price-breakdown-model.ts",
        "price/starting-price.ts",
        "i18n/content.ts",
      ]),
    );
  });

  it("reports a module that does import React, so the check can fail", () => {
    const priceBar = resolve(SRC, "price/price-bar.tsx");

    expect(violationsIn(closureOf(priceBar))).toEqual(
      expect.arrayContaining(["react", "price/price-bar.tsx"]),
    );
  });
});
