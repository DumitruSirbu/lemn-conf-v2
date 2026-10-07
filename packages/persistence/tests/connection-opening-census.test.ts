import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src",
);
const THE_OPENER = "open-database.ts";
const DRIVER_PACKAGES: readonly string[] = ["@neondatabase/serverless", "pg"];

/**
 * Sites outside the opener that still import a driver or parse a connection string, each owed to the slice that
 * migrates it. The census compares this list to the source exactly: migrating a site
 * turns it red until its entry is deleted here, and a site not listed turns it red at once.
 */
const SITES_OWED_TO_THE_OPENER: readonly {
  readonly site: string;
  readonly owedBy: string;
}[] = [
  {
    site: "retry-on-transient-failure.ts: imports @neondatabase/serverless",
    owedBy:
      "8B, needs retry-on-transient-failure.ts: NeonDbError for instanceof",
  },
];

/**
 * The sites in `source`: a value import of a driver package (static, re-exported, dynamic with a literal specifier, or
 * `require`) and `new URL(`. A type-only import is not a site. Comments and strings never count. Not found, by
 * design: a dynamic import whose specifier is computed, an alias of the global `URL`, `Reflect.construct`.
 */
function connectionSitesIn(source: string): string[] {
  const file = ts.createSourceFile(
    "scanned.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const sites: string[] = [];
  const visit = (node: ts.Node): void => {
    const site = siteOf(node);
    if (site !== undefined) sites.push(site);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return sites;
}

function siteOf(node: ts.Node): string | undefined {
  const driverImport = driverImportedBy(node);
  if (driverImport !== undefined) return `imports ${driverImport}`;
  const isNewUrl =
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "URL";
  return isNewUrl ? "new URL()" : undefined;
}

function driverImportedBy(node: ts.Node): string | undefined {
  const specifier = valueModuleSpecifierOf(node);
  return specifier !== undefined && isDriverPackage(specifier)
    ? specifier
    : undefined;
}

function isDriverPackage(specifier: string): boolean {
  return DRIVER_PACKAGES.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
}

function valueModuleSpecifierOf(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node))
    return isTypeOnlyImport(node) ? undefined : literalOf(node.moduleSpecifier);
  if (ts.isExportDeclaration(node))
    return node.isTypeOnly ? undefined : literalOf(node.moduleSpecifier);
  if (ts.isImportEqualsDeclaration(node))
    return ts.isExternalModuleReference(node.moduleReference) &&
      !node.isTypeOnly
      ? literalOf(node.moduleReference.expression)
      : undefined;
  if (ts.isCallExpression(node) && isImportOrRequire(node.expression))
    return literalOf(node.arguments[0]);
  return undefined;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  const hasDefaultImport = clause.name !== undefined;
  const bindings = clause.namedBindings;
  return (
    !hasDefaultImport &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function isImportOrRequire(expression: ts.Expression): boolean {
  return (
    expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(expression) && expression.text === "require")
  );
}

function literalOf(node: ts.Node | undefined): string | undefined {
  return node !== undefined && ts.isStringLiteralLike(node)
    ? node.text
    : undefined;
}

/** Every `.ts` file under `directory` at any depth, apart from the opener at the top level, as `path: site` lines. */
function sitesOutsideTheOpener(directory: string): string[] {
  return (readdirSync(directory, { recursive: true }) as string[])
    .filter((path) => path.endsWith(".ts") && path !== THE_OPENER)
    .flatMap((path) =>
      connectionSitesIn(readFileSync(join(directory, path), "utf8")).map(
        (site) => `${path}: ${site}`,
      ),
    )
    .sort();
}

describe("the connection-opening census (8B, rule B5)", () => {
  it("finds the opener's own driver import, so the scan reads real source", () => {
    const opener = readFileSync(join(SOURCE_DIRECTORY, THE_OPENER), "utf8");

    expect(connectionSitesIn(opener)).toContain(
      "imports @neondatabase/serverless",
    );
  });

  it("finds no driver import or new URL() outside the opener except the sites owed to it", () => {
    const owed = SITES_OWED_TO_THE_OPENER.map(({ site }) => site).sort();

    expect(sitesOutsideTheOpener(SOURCE_DIRECTORY)).toEqual(owed);
  });
});

describe("what the census recognises in a source", () => {
  it.each([
    [
      "a named value import",
      'import { neon } from "@neondatabase/serverless";',
      ["imports @neondatabase/serverless"],
    ],
    [
      "an aliased import",
      'import { Pool as Aliased } from "pg";',
      ["imports pg"],
    ],
    ["a default import", 'import pg from "pg";', ["imports pg"]],
    ["a namespace import", 'import * as pg from "pg";', ["imports pg"]],
    ["a side-effect import", 'import "pg";', ["imports pg"]],
    [
      "a subpath import",
      'import { Client } from "pg/lib/client.js";',
      ["imports pg/lib/client.js"],
    ],
    [
      "a re-export",
      'export { neon } from "@neondatabase/serverless";',
      ["imports @neondatabase/serverless"],
    ],
    ["an export-all", 'export * from "pg";', ["imports pg"]],
    [
      "a dynamic import with a literal specifier",
      'const driver = await import("pg");',
      ["imports pg"],
    ],
    ["a require", 'const pg = require("pg");', ["imports pg"]],
    ["an import-equals require", 'import pg = require("pg");', ["imports pg"]],
    [
      "a mixed import of a type and a value",
      'import { type Pool, Client } from "pg";',
      ["imports pg"],
    ],
    ["new URL", "const url = new URL(text);", ["new URL()"]],
  ])("flags %s", (_name, source, expected) => {
    expect(connectionSitesIn(source)).toEqual(expected);
  });

  it.each([
    ["a type-only import", 'import type { Pool } from "pg";'],
    [
      "an import of only inline types",
      'import { type Pool, type Client } from "pg";',
    ],
    ["a type-only re-export", 'export type { Pool } from "pg";'],
    ["a type import expression", 'type Driver = typeof import("pg");'],
    ["a package that is not a driver", 'import { x } from "pgp-helpers";'],
    ["a call in a comment", '// import("pg")\n/* new URL(text) */'],
    [
      "a call in a string",
      'const text = "import pg from \\"pg\\"; new URL(x)";',
    ],
    ["an unrelated constructor", "new Map(); new URLSearchParams();"],
    ["a dynamic import that is not a literal", "await import(name);"],
  ])("does not flag %s", (_name, source) => {
    expect(connectionSitesIn(source)).toEqual([]);
  });
});

describe("what the census finds in a tree", () => {
  const scratch = mkdtempSync(join(tmpdir(), "connection-census-"));

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function writeSource(relativePath: string, source: string): void {
    const path = join(scratch, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }

  it("finds a site in a subdirectory at any depth, and skips the opener only at the top level", () => {
    writeSource(THE_OPENER, 'import { neon } from "@neondatabase/serverless";');
    writeSource(
      "deep/nested/aliased.ts",
      'import { Pool as Aliased } from "pg";',
    );
    writeSource(
      `deep/${THE_OPENER}`,
      'import { neon } from "@neondatabase/serverless";',
    );

    expect(sitesOutsideTheOpener(scratch)).toEqual([
      "deep/nested/aliased.ts: imports pg",
      `deep/${THE_OPENER}: imports @neondatabase/serverless`,
    ]);
  });
});
