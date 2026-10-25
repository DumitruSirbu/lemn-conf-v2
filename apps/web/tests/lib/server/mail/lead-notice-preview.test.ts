import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREVIEW_DIR,
  IGNORED_REPORTS_DIR,
  PreviewDirectoryRefused,
  previewDirectoryFor,
  REPOSITORY_ROOT,
} from "../../../preview/preview-directory";

const PREVIEW_SPEC = join(
  import.meta.dirname,
  "../../../preview/lead-notice.preview.ts",
);
const FIXTURES = join(import.meta.dirname, "lead-notice-fixtures.ts");
const SOURCE_ROOT = join(import.meta.dirname, "../../../../src");
const BUILDER = "lib/server/mail/lead-notification.ts";

/** What can send, or read a mail setting: none of it may reach the preview. */
const SENDING_MODULES = [
  "lib/server/mail/gmail-mail-sender.ts",
  "lib/server/mail/smtp-mail-sender.ts",
  "lib/server/mail/smtp-transport.ts",
  "lib/server/mail/create-mail-sender.ts",
  "lib/server/mail/select-mail-sender.ts",
  "lib/server/mail/fake-mail-sender.ts",
  "lib/server/mail/mail-configuration.ts",
  "lib/server/mail/smtp-answer.ts",
];

const RESOLVABLE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function specifiersOf(path: string): string[] {
  return ts
    .preProcessFile(readFileSync(path, "utf8"), true, true)
    .importedFiles.map(({ fileName }) => fileName);
}

/** Every local module `entry` imports, test-side and under `src` alike, itself included; packages are not followed. */
function everyModuleReachedFrom(entry: string): string[] {
  const reached = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (reached.has(file)) continue;
    reached.add(file);
    pending.push(...localImportsOf(file));
  }
  return [...reached].sort();
}

function localImportsOf(importer: string): string[] {
  return specifiersOf(importer).flatMap((specifier) => {
    const resolved = localFileOf(importer, specifier);
    return resolved === undefined ? [] : [resolved];
  });
}

function localFileOf(importer: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return [
    base,
    ...RESOLVABLE_SUFFIXES.map((suffix) => `${base}${suffix}`),
  ].find((path) => existsSync(path) && statSync(path).isFile());
}

function sourceModulesOf(reached: readonly string[]): string[] {
  return reached
    .filter((path) => path.startsWith(`${SOURCE_ROOT}/`))
    .map((path) => relative(SOURCE_ROOT, path));
}

describe("the owner's preview", () => {
  it("reads source: reaches the route's builder and its fixtures, and no module that sends, reads a mail setting or loads the mail library", () => {
    const reached = everyModuleReachedFrom(PREVIEW_SPEC);
    const sourceModules = sourceModulesOf(reached);

    expect(sourceModules).toContain(BUILDER);
    expect(reached).toContain(FIXTURES);
    expect(
      sourceModules.filter((path) => SENDING_MODULES.includes(path)),
    ).toEqual([]);
    expect(
      reached.filter((path) => specifiersOf(path).includes("nodemailer")),
    ).toEqual([]);
  });

  it("control: the same walk from a mail test that sends finds the adapter and the mail library", () => {
    const reached = everyModuleReachedFrom(
      join(import.meta.dirname, "gmail-mail-sender.test.ts"),
    );

    expect(sourceModulesOf(reached)).toContain(
      "lib/server/mail/gmail-mail-sender.ts",
    );
    expect(
      reached.filter((path) => specifiersOf(path).includes("nodemailer")),
    ).not.toEqual([]);
  });

  it("writes into the ignored reports folder when no folder is named", () => {
    expect(previewDirectoryFor(undefined)).toBe(DEFAULT_PREVIEW_DIR);
    expect(previewDirectoryFor("")).toBe(DEFAULT_PREVIEW_DIR);
    expect(DEFAULT_PREVIEW_DIR.startsWith(`${IGNORED_REPORTS_DIR}/`)).toBe(
      true,
    );
  });

  it.each([
    ["the repository itself", "."],
    ["a tracked folder", "apps/web/tests"],
    ["a folder named like the reports one beside it", "testing-reports-x"],
  ])("refuses %s", (_label, inside) => {
    expect(() => previewDirectoryFor(join(REPOSITORY_ROOT, inside))).toThrow(
      PreviewDirectoryRefused,
    );
  });

  it("accepts a folder outside the repository, and one under the reports folder", () => {
    const outside = join(REPOSITORY_ROOT, "..", "lead-notice-preview");
    const reports = join(IGNORED_REPORTS_DIR, "owner");

    expect(previewDirectoryFor(outside)).toBe(outside);
    expect(previewDirectoryFor(reports)).toBe(reports);
  });
});
