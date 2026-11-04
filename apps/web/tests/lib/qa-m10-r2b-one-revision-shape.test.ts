import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const SOURCE_ROOTS = [
  "apps/web/src",
  "packages/configurator-domain/src",
  "packages/persistence/src",
  "packages/three-adapter/src",
];

const THE_ONE_STATEMENT = "packages/configurator-domain/src/revision-shape.ts";

/** Words in a refusal's text that name the widest revision to a person; the text decides nothing. */
const MESSAGE_ONLY = "packages/persistence/src/contact-submission-refusal.ts";

const NINETEEN_DIGIT_RUN = "{0,18}";
const WIDEST_BIGINT = /9_?223_?372_?036_?854_?775_?807/;
const PARSES_A_BIGINT = /\bBigInt\(/;
const MENTIONS_REVISION = /revision/i;

function sourceFiles(): string[] {
  return SOURCE_ROOTS.flatMap((root) =>
    filesUnder(resolve(REPOSITORY_ROOT, root)),
  ).map((path) => relative(REPOSITORY_ROOT, path));
}

function sourceOf(path: string): string {
  return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

function filesThatStateTheRevisionShape(): string[] {
  return sourceFiles().filter((path) => {
    if (path === THE_ONE_STATEMENT || path === MESSAGE_ONLY) return false;
    const source = sourceOf(path);
    return (
      source.includes(NINETEEN_DIGIT_RUN) ||
      WIDEST_BIGINT.test(source) ||
      (MENTIONS_REVISION.test(source) && PARSES_A_BIGINT.test(source))
    );
  });
}

describe("the revision shape has one statement", () => {
  it("is stated in the domain's revision-shape module", () => {
    const source = sourceOf(THE_ONE_STATEMENT);

    expect(source.includes(NINETEEN_DIGIT_RUN)).toBe(true);
    expect(WIDEST_BIGINT.test(source)).toBe(true);
  });

  it("is stated in no other source file: no nineteen-digit pattern, no widest bigint, no bigint parse of a revision", () => {
    expect(filesThatStateTheRevisionShape()).toEqual([]);
  });

  it("is seen by the scan: the roots hold the files that delegate to the one statement", () => {
    const files = sourceFiles();

    expect(files).toContain("packages/persistence/src/design-revision.ts");
    expect(files).toContain(
      "apps/web/src/lib/server/staff/displayed-revision.ts",
    );
    expect(files).toContain(THE_ONE_STATEMENT);
  });
});
