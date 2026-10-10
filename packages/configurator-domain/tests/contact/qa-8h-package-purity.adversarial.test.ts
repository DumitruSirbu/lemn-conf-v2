// Wave 8H, criterion 8: the package reads no clock, generates no id and imports nothing outside itself.
// A scan of every source file, with the scanner held to sources that break each rule.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const SOURCE_ROOT = path.join(PACKAGE_ROOT, "src");
const CONTACT_ROOT = path.join(SOURCE_ROOT, "contact");

interface SourceFile {
  readonly file: string;
  readonly code: string;
}

interface Finding {
  readonly file: string;
  readonly what: string;
}

/** Block and line comments removed, so prose that names a clock is not read as code that reads one. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function sourcesUnder(root: string): readonly SourceFile[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .map((file) => ({
      file: path.relative(PACKAGE_ROOT, file),
      code: withoutComments(readFileSync(file, "utf8")),
    }));
}

/** Parsing a timestamp that was handed in reads no clock; every other use of `Date` does or can. */
const DATE_USE = /\bDate\b(?!\.parse\()/;

const AMBIENT_SOURCES: readonly (readonly [string, RegExp])[] = [
  ["a clock through Date", DATE_USE],
  ["a clock through performance", /\bperformance\b/],
  ["randomness or an id through crypto", /\bcrypto\b/],
  ["randomness through Math.random", /\bMath\s*\.\s*random\b/],
  ["an id through randomUUID or nanoid", /\brandomUUID\b|\bnanoid\b/],
  ["the process", /\bprocess\s*\.\s*(env|hrtime|uptime|argv|pid)\b/],
  ["a timer", /\bset(Timeout|Interval|Immediate)\b/],
  ["the network", /\bfetch\s*\(|\bXMLHttpRequest\b/],
  ["the global object", /\bglobalThis\b|\bwindow\s*\.|\bglobal\s*\./],
];

const SPECIFIER_FORMS: readonly RegExp[] = [
  /\bfrom\s*["'`]([\w@.:/-]+)["'`]/g,
  /\bimport\s*["'`]([\w@.:/-]+)["'`]/g,
  /\bimport\s*\(\s*["'`]([\w@.:/-]+)["'`]/g,
  /\brequire\s*\(\s*["'`]([\w@.:/-]+)["'`]/g,
];

const COMPUTED_SPECIFIER = /\b(import|require)\s*\(\s*(?!["'`])[^)\s]/;

function specifiersOf(code: string): readonly string[] {
  return SPECIFIER_FORMS.flatMap((form) =>
    [...code.matchAll(form)].map((match) => match[1] ?? ""),
  );
}

function declaredDependencies(): readonly string[] {
  const manifest = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
  ) as { readonly dependencies?: Readonly<Record<string, string>> };
  return Object.keys(manifest.dependencies ?? {});
}

function isDeclared(specifier: string, declared: readonly string[]): boolean {
  return declared.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
}

function staysInsideSource(file: string, specifier: string): boolean {
  const resolved = path.resolve(PACKAGE_ROOT, path.dirname(file), specifier);
  return resolved.startsWith(`${SOURCE_ROOT}${path.sep}`);
}

function ambientFindings(sources: readonly SourceFile[]): readonly Finding[] {
  return sources.flatMap(({ file, code }) =>
    AMBIENT_SOURCES.filter(([, pattern]) => pattern.test(code)).map(
      ([what]) => ({ file, what }),
    ),
  );
}

function importFindings(
  sources: readonly SourceFile[],
  declared: readonly string[],
): readonly Finding[] {
  return sources.flatMap(({ file, code }) => [
    ...specifiersOf(code)
      .filter((specifier) =>
        specifier.startsWith(".")
          ? !staysInsideSource(file, specifier)
          : !isDeclared(specifier, declared),
      )
      .map((specifier) => ({ file, what: `imports ${specifier}` })),
    ...(COMPUTED_SPECIFIER.test(code)
      ? [{ file, what: "imports a computed specifier" }]
      : []),
  ]);
}

function scanned(code: string): readonly SourceFile[] {
  return [{ file: "src/contact/probe.ts", code: withoutComments(code) }];
}

describe("8H criterion 8: the scanner refuses what it claims to", () => {
  it.each([
    ["Date.now()", "const at = Date.now();"],
    ["new Date()", "const at = new Date();"],
    ["new Date(text)", "const at = new Date(text).getTime();"],
    ["Date as a value", "const clock = Date;"],
    ["performance.now()", "const at = performance.now();"],
    ["crypto.randomUUID()", "const id = crypto.randomUUID();"],
    ["Math.random()", "const roll = Math.random();"],
    ["Math . random", "const roll = Math\n  .random();"],
    ["process.hrtime", "const at = process.hrtime.bigint();"],
    ["a timer", "setTimeout(() => {}, 1);"],
    ["fetch", 'await fetch("https://example.md");'],
    ["globalThis", 'const clock = globalThis["Date"];'],
    [
      "a clock after a comment on the same line",
      "const a = 1; /* fine */ const b = Date.now();",
    ],
  ])("finds %s", (_name, code) => {
    expect(ambientFindings(scanned(code))).not.toEqual([]);
  });

  it.each([
    [
      "Date.parse of a stored timestamp",
      "const at = Date.parse(design.createdAt);",
    ],
    [
      "a clock named only in a comment",
      "// never Date.now() here\nconst a = 1; /* nor Math.random() */",
    ],
    ["a field called updatedAt", "const { updatedAt, randomSeed } = design;"],
  ])("passes %s", (_name, code) => {
    expect(ambientFindings(scanned(code))).toEqual([]);
  });

  it.each([
    ["a Node builtin", 'import { randomUUID } from "node:crypto";'],
    ["an undeclared package", 'import { nanoid } from "nanoid";'],
    ["another workspace package", 'import { x } from "@lemnaria/persistence";'],
    ["a wrapped import", 'import {\n  a,\n  b,\n} from\n  "luxon";'],
    ["a bare import", 'import "server-only";'],
    ["a dynamic import", 'const m = await import("uuid");'],
    ["a require", 'const m = require("uuid");'],
    ["a re-export", 'export * from "date-fns";'],
    [
      "a path out of the package",
      'import { x } from "../../../persistence/src/index.js";',
    ],
    [
      "a path into the package's tests",
      'import { x } from "../../tests/support/room-input.js";',
    ],
    ["a computed specifier", "const m = await import(name);"],
    ["a subpath of an undeclared package", 'import { z } from "zodiac/v4";'],
  ])("finds %s", (_name, code) => {
    expect(importFindings(scanned(code), ["zod"])).not.toEqual([]);
  });

  it.each([
    ["the declared dependency", 'import { z } from "zod";'],
    ["a subpath of it", 'import { z } from "zod/v4";'],
    ["a sibling", 'import { a } from "./phone-number.js";'],
    [
      "a file one level up, inside the source",
      'import type { Design } from "../design.js";',
    ],
  ])("passes %s", (_name, code) => {
    expect(importFindings(scanned(code), ["zod"])).toEqual([]);
  });
});

describe("8H criterion 8: the package's own source", () => {
  const sources = sourcesUnder(SOURCE_ROOT);
  const contactSources = sourcesUnder(CONTACT_ROOT);

  it("is read whole, the contact module included", () => {
    expect(sources.length).toBeGreaterThan(60);
    expect(
      contactSources.map(({ file }) => path.basename(file)).sort(),
    ).toEqual([
      "contact-fields.ts",
      "contact-submission.ts",
      "index.ts",
      "input-checks.ts",
      "payload-digest.ts",
      "phone-number.ts",
      "submission-eligibility.ts",
      "submission-snapshot.ts",
    ]);
  });

  it("declares zod and nothing else to import", () => {
    expect(declaredDependencies()).toEqual(["zod"]);
  });

  it("reads no clock, no randomness, no process, no timer and no network", () => {
    expect(ambientFindings(sources)).toEqual([]);
  });

  it("imports nothing but its own files and its declared dependency", () => {
    expect(importFindings(sources, declaredDependencies())).toEqual([]);
  });

  it("names no Date at all in the contact module, not even to parse one", () => {
    const naming = contactSources.filter(({ code }) => /\bDate\b/.test(code));

    expect(naming).toEqual([]);
  });

  it("takes no timestamp and no id as an output of the contact module", () => {
    const minting = contactSources.filter(({ code }) =>
      /\b(createdAt|submittedAt|occurredAt|receivedAt|generate[A-Z]\w*Id)\b/.test(
        code,
      ),
    );

    expect(minting).toEqual([]);
  });
});
