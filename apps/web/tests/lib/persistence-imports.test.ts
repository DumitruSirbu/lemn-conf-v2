// The Postgres driver must not reach the browser.
//
// `@lemnaria/persistence` is the only package allowed to import a Postgres driver, and its package
// entry re-exports `NeonConfigurationRepository` — so a single *value* import from it in a module
// the client bundle reaches would pull `@neondatabase/serverless` in behind it. That is a bundle
// several hundred kilobytes larger, shipped to every customer, for a module that can never run
// there.
//
// Nothing today does it: WEB-003 added `DesignRevision` to four client-side modules and every one
// of those imports is `import type`, which TypeScript erases. This asserts that rather than leaving
// it to the next person to notice, because the failure is invisible — the app still works, and the
// only symptom is a larger bundle nobody is measuring.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEB_SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src",
);

const PERSISTENCE_PACKAGE = "@lemnaria/persistence";

/**
 * Where a value import is legitimate: modules that only ever execute on the server.
 *
 * `lib/server/` is marked by the `server-only` package, and a route handler under `app/api/` is a
 * server entry point by Next's own routing contract. Everything else in `src/` is reachable from a
 * client component, directly or through the module graph.
 */
function mayImportTheDriver(relativePath: string): boolean {
  return (
    relativePath.startsWith("lib/server/") ||
    (relativePath.startsWith("app/api/") && relativePath.endsWith("route.ts"))
  );
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Every `import … from "@lemnaria/persistence"` statement in one file, whole.
 *
 * `[^;]` rather than `[\s\S]` is what keeps a match inside **one** statement: the lazy any-character
 * form starts at the file's first `import` and swallows every statement before this one, which made
 * the sweep report unrelated modules and — worse — would have read another package's specifiers as
 * this one's. `m` anchors each match to the start of a line, which is where every import in this
 * codebase begins; the multi-line specifier list the formatter produces contains no `;`, so it is
 * matched whole.
 */
function persistenceImportsIn(source: string): string[] {
  const statements = source.match(
    /^import[^;]*?from\s+"@lemnaria\/persistence";/gm,
  );
  return statements ?? [];
}

/** Whether an import statement brings in nothing but types — either `import type { … }`, or the
 *  inline form where every named specifier carries its own `type` keyword. */
function importsTypesOnly(statement: string): boolean {
  if (/^import\s+type\b/.test(statement)) return true;
  const named = /\{([\s\S]*)\}/.exec(statement)?.[1];
  if (named === undefined) return false;
  return named
    .split(",")
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier !== "")
    .every((specifier) => /^type\s/.test(specifier));
}

describe("the Postgres driver stays out of the client bundle", () => {
  const files = sourceFilesUnder(WEB_SOURCE_DIR).map((path) => ({
    relativePath: relative(WEB_SOURCE_DIR, path).replaceAll("\\", "/"),
    source: readFileSync(path, "utf8"),
  }));

  it("finds the source tree and the imports it is asserting about", () => {
    // Without this the sweep below is vacuously green on a directory that moved, or on a matcher
    // that quietly stopped matching anything.
    expect(files.length).toBeGreaterThan(20);
    const clientStatements = files
      .filter(({ relativePath }) => !mayImportTheDriver(relativePath))
      .flatMap(({ source }) => persistenceImportsIn(source));
    expect(clientStatements.length).toBeGreaterThan(0);
  });

  it("imports only types from the persistence package outside server-only modules", () => {
    const offenders = files
      .filter(({ relativePath }) => !mayImportTheDriver(relativePath))
      .flatMap(({ relativePath, source }) =>
        persistenceImportsIn(source)
          .filter((statement) => !importsTypesOnly(statement))
          .map((statement) => `${relativePath}: ${statement}`),
      );

    expect(offenders).toEqual([]);
  });

  it("recognises a value import as one, so the sweep above is not vacuous", () => {
    // The assertion is a negative, and a negative over a predicate that never fires is worth
    // nothing. These are the three shapes the check has to tell apart.
    expect(
      importsTypesOnly(
        `import { NeonConfigurationRepository } from "${PERSISTENCE_PACKAGE}";`,
      ),
    ).toBe(false);
    expect(
      importsTypesOnly(
        `import { isDesignRevision, type DesignRevision } from "${PERSISTENCE_PACKAGE}";`,
      ),
    ).toBe(false);
    expect(
      importsTypesOnly(
        `import type { DesignRevision } from "${PERSISTENCE_PACKAGE}";`,
      ),
    ).toBe(true);
    // And one statement is read as one: the matcher must not run together with the import above it.
    const twoStatements =
      `import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";\n` +
      `import type { DesignRevision } from "${PERSISTENCE_PACKAGE}";`;
    expect(persistenceImportsIn(twoStatements)).toEqual([
      `import type { DesignRevision } from "${PERSISTENCE_PACKAGE}";`,
    ]);
  });

  it("still sees the server-only modules that do import values, so the carve-out is real", () => {
    const serverValueImporters = files
      .filter(({ relativePath }) => mayImportTheDriver(relativePath))
      .filter(({ source }) =>
        persistenceImportsIn(source).some(
          (statement) => !importsTypesOnly(statement),
        ),
      )
      .map(({ relativePath }) => relativePath);

    // If this ever empties, the carve-out above is excusing nothing and the exemption should go.
    expect(serverValueImporters).not.toEqual([]);
  });
});
