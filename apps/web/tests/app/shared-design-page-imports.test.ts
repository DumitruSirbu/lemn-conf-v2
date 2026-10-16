import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SHARE_PAGE = "app/[locale]/s/[token]/page.tsx";

/** The modules that could authorise or probe a write (ADR 0114 G5). */
const WRITE_CAPABLE_MODULES = [
  "lib/server/visitor.ts",
  "lib/server/write-token.ts",
  "persistence/fetch-configuration-repository.ts",
];

const SPECIFIER =
  /\b(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;
const RESOLVABLE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

const CLIENT_BOUNDARY = /^\s*["']use client["']/;

/**
 * Paths under `src`, relative to it, of every local module `entry` reaches on the server through static or dynamic
 * imports. A `"use client"` module is reached but not entered: what it imports runs in the browser, where the view
 * holds `canWrite: false` and no credential.
 */
function importClosureOf(entry: string): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [entry];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (reached.has(next)) continue;
    reached.add(next);
    pending.push(...localImportsOf(next));
  }
  return reached;
}

function localImportsOf(path: string): string[] {
  const text = readFileSync(join(SOURCE_ROOT, path), "utf8");
  if (CLIENT_BOUNDARY.test(text)) return [];
  return [...text.matchAll(SPECIFIER)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .map((specifier) => resolvedLocalPath(specifier, path))
    .filter((resolved): resolved is string => resolved !== undefined);
}

function resolvedLocalPath(
  specifier: string,
  importer: string,
): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(SOURCE_ROOT, dirname(importer), specifier)
      : undefined;
  if (base === undefined) return undefined;
  const file = RESOLVABLE_SUFFIXES.map((suffix) => `${base}${suffix}`).find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  return file === undefined ? undefined : relative(SOURCE_ROOT, file);
}

describe("the share page's server import closure (reads source)", () => {
  it("reaches none of the modules that could authorise a write", () => {
    const closure = importClosureOf(SHARE_PAGE);

    for (const module of WRITE_CAPABLE_MODULES) {
      expect(closure).not.toContain(module);
    }
  });

  it("control: the walk reaches the repository module the page asks both lookups of", () => {
    expect(importClosureOf(SHARE_PAGE)).toContain("lib/server/repository.ts");
  });

  it("control: the walk reaches the client view and stops there", () => {
    const closure = importClosureOf(SHARE_PAGE);

    expect(closure).toContain("app/s/[token]/shared-design-view.tsx");
    expect(closure).not.toContain(
      "app/configurator/configure/configure-screen.tsx",
    );
  });

  it("control: the walk reaches visitor.ts from a module known to import it", () => {
    expect(importClosureOf("lib/server/load-owned-design.ts")).toContain(
      "lib/server/visitor.ts",
    );
  });
});
