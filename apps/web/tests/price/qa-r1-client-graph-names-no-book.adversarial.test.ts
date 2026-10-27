import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { sourceFilesMatching } from "../lib/server/server-source-support";

// Adversarial QA for M10 wave R1: "no client module imports a book or `@/lib/server/`". The implementer's check reads the
// modules that carry the "use client" directive; this one walks everything such a module reaches, because a plain module
// a client module imports ships to the browser just the same, and a book (or a database driver) there is the second root
// backlog 176 closed.

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");
const CLIENT_DIRECTIVE =
  /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;
const FORBIDDEN_IN_THE_BROWSER =
  /@\/lib\/server\/|["']server-only["']|\bparsePriceBook\b|\bSAMPLE_PRICE_BOOK|import\s+(?!type\b)[^"';]*?from\s+["']@lemnaria\/persistence["']/;
const IMPORT_SPECIFIER =
  /(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function absoluteOf(specifier: string, importer: string): string | undefined {
  if (specifier.startsWith("@/")) return join(SOURCE_ROOT, specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(importer), specifier);
  return undefined;
}

function resolveModule(base: string): string | undefined {
  return EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => /\.(?:ts|tsx)$/.test(candidate) && existsSync(candidate),
  );
}

function importsOf(path: string): string[] {
  const source = withoutComments(readFileSync(path, "utf8"));
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1] ?? match[2] ?? "")
    .map((specifier) => absoluteOf(specifier, path))
    .flatMap((base) => (base === undefined ? [] : [resolveModule(base)]))
    .filter((found): found is string => found !== undefined);
}

function reachableFrom(entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const pending = [...entries];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...importsOf(next));
  }
  return seen;
}

describe("what the browser is sent", () => {
  const clientEntries = sourceFilesMatching(/./)
    .map((path) => join(SOURCE_ROOT, path))
    .filter((path) => CLIENT_DIRECTIVE.test(readFileSync(path, "utf8")));
  const reached = reachableFrom(clientEntries);

  it("walks a real graph: the price root and the provider are in it", () => {
    expect(clientEntries.length).toBeGreaterThan(50);
    expect(reached).toContain(join(SOURCE_ROOT, "price/price-book-root.ts"));
    expect(reached).toContain(
      join(SOURCE_ROOT, "price/price-book-provider.tsx"),
    );
  });

  it("holds no module that names a server module, the server-only marker, the parser, the sample or a runtime import of the persistence package (a type import is erased)", () => {
    const offenders = [...reached]
      .filter((path) =>
        FORBIDDEN_IN_THE_BROWSER.test(
          withoutComments(readFileSync(path, "utf8")),
        ),
      )
      .map((path) => path.slice(SOURCE_ROOT.length + 1))
      .sort();

    expect(offenders).toEqual([]);
  });

  it("does not reach the server-held process stores or the seeding helper", () => {
    const serverRoots = [
      "lib/server/price-stores.ts",
      "lib/server/price-book-test-seed.ts",
      "lib/server/active-price-book.ts",
    ].map((path) => join(SOURCE_ROOT, path));

    for (const root of serverRoots) expect(reached.has(root), root).toBe(false);
  });
});
