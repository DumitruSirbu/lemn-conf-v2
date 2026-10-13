import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

function fileFor(importer: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return EXTENSIONS.map((extension) => `${base}${extension}`).find((path) =>
    existsSync(path),
  );
}

function importsOf(file: string): string[] {
  return ts
    .preProcessFile(readFileSync(file, "utf8"), true, true)
    .importedFiles.map(({ fileName }) => fileFor(file, fileName))
    .filter((path): path is string => path !== undefined);
}

/**
 * Every module under `apps/web/src` that `entry` imports, itself included, through static and dynamic imports and
 * type imports alike (an over-count, which is the safe side for an absence claim). Paths are relative to `src`, and
 * stylesheets and packages are not followed.
 */
export function importClosureOf(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [join(SOURCE_ROOT, entry)];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...importsOf(file));
  }
  return [...seen].map((path) => relative(SOURCE_ROOT, path)).sort();
}

/** The text of a module under `src` with its comments taken out, so a word in a comment is not a call. */
export function codeOf(path: string): string {
  return readFileSync(join(SOURCE_ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
