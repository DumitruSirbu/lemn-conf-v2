import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src",
);
const THE_OPENER = "open-database.ts";

/**
 * Sites that still open a connection or parse a connection string themselves, each owed to the slice that migrates it.
 * The census compares this list to the source exactly: migrating a site turns it red until its entry is deleted here,
 * and a site not listed turns it red at once.
 */
const SITES_OWED_TO_THE_OPENER: readonly {
  readonly site: string;
  readonly owedBy: string;
}[] = [
  { site: "migrate.ts: new Client()", owedBy: "8B S2" },
  { site: "migrate.ts: new URL()", owedBy: "8B S2" },
  { site: "migrate-status.ts: neon()", owedBy: "8B S2" },
  { site: "delete-designs-for-tests.ts: neon()", owedBy: "8B S3" },
  { site: "delete-designs-for-tests.ts: neon()", owedBy: "8B S3" },
  { site: "test-database-url.ts: new URL()", owedBy: "8B S3" },
  { site: "test-database-url.ts: new URL()", owedBy: "8B S3" },
];

const CONSTRUCTED_NAMES: ReadonlySet<string> = new Set(["URL", "Client"]);
const CALLED_NAME = "neon";

/** The connection sites in `source`, as `neon()`, `new URL()` and `new Client()`; comments and strings never count. */
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
  if (
    ts.isCallExpression(node) &&
    calleeNameOf(node.expression) === CALLED_NAME
  )
    return "neon()";
  if (!ts.isNewExpression(node)) return undefined;
  const name = calleeNameOf(node.expression);
  return name !== undefined && CONSTRUCTED_NAMES.has(name)
    ? `new ${name}()`
    : undefined;
}

function calleeNameOf(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  return ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : undefined;
}

function sitesOutsideTheOpener(): string[] {
  return readdirSync(SOURCE_DIRECTORY)
    .filter((name) => name.endsWith(".ts") && name !== THE_OPENER)
    .flatMap((name) =>
      connectionSitesIn(readFileSync(join(SOURCE_DIRECTORY, name), "utf8")).map(
        (site) => `${name}: ${site}`,
      ),
    )
    .sort();
}

describe("the connection-opening census (8B, criterion 3)", () => {
  it("finds the opener's own call, so the scan reads real source", () => {
    const opener = readFileSync(join(SOURCE_DIRECTORY, THE_OPENER), "utf8");

    expect(connectionSitesIn(opener)).toContain("neon()");
  });

  it("finds no neon(), new URL() or new Client() outside the opener except the sites owed to it", () => {
    const owed = SITES_OWED_TO_THE_OPENER.map(({ site }) => site).sort();

    expect(sitesOutsideTheOpener()).toEqual(owed);
  });

  it("owes every listed site to a named slice", () => {
    expect(
      SITES_OWED_TO_THE_OPENER.filter(({ owedBy }) => owedBy === ""),
    ).toEqual([]);
  });
});

describe("what the census recognises", () => {
  it.each([
    ["a bare neon call", "const sql = neon(url);", ["neon()"]],
    ["a namespaced neon call", "driver.neon(url);", ["neon()"]],
    ["new URL", "const u = new URL(url);", ["new URL()"]],
    ["new Client", "const c = new Client(url);", ["new Client()"]],
    ["a namespaced new Client", "new pg.Client(url);", ["new Client()"]],
    ["a call in a comment", "// neon(url)\n/* new URL(url) */", []],
    ["a call in a string", 'const text = "neon(url) new URL(url)";', []],
    ["an unrelated constructor", "new Map(); new URLSearchParams();", []],
  ])("%s", (_name, source, expected) => {
    expect(connectionSitesIn(source)).toEqual(expected);
  });
});
