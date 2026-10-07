// A class a component names and its stylesheet does not define is an unstyled element and no
// error anywhere. The groups stood 0 px apart because `styles.groups` was one. This reads every file that imports
// the review's stylesheet and fails on any class it names that the stylesheet does not define, for every class.
//
// It also pins the spacing frame 3A uses between the blocks it draws, because a rule that exists can still be empty.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../../src");
const STYLESHEET_PATH = join(SRC, "app/d/[id]/review/review.module.css");
const STYLESHEET_IMPORT = /from\s+["'][^"']*review\.module\.css["']/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every class the stylesheet defines, in any selector. */
function classesDefinedIn(css: string): Set<string> {
  return new Set(
    [...withoutComments(css).matchAll(/\.([A-Za-z_][\w-]*)/g)].flatMap(
      (match) => (match[1] === undefined ? [] : [match[1]]),
    ),
  );
}

/** Every class a module names through the imported `styles` object, as `styles.name` or `styles["name"]`. */
function classesNamedIn(source: string): string[] {
  const dotted = [...source.matchAll(/\bstyles\.([A-Za-z_]\w*)/g)];
  const bracketed = [...source.matchAll(/\bstyles\[\s*["']([\w-]+)["']\s*\]/g)];
  return [...dotted, ...bracketed].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

const STYLESHEET = readFileSync(STYLESHEET_PATH, "utf8");
const DEFINED = classesDefinedIn(STYLESHEET);
const IMPORTERS = sourceFilesUnder(SRC)
  .map((path) => ({
    name: relative(SRC, path),
    source: readFileSync(path, "utf8"),
  }))
  .filter(({ source }) => STYLESHEET_IMPORT.test(source));

describe("every class the review's files name is one its stylesheet defines", () => {
  it("is read from the files that really import the stylesheet", () => {
    expect(IMPORTERS.map(({ name }) => name).sort()).toEqual([
      "app/d/[id]/review/review-screen.tsx",
      "review/review-groups.tsx",
      "review/review-scene.tsx",
    ]);
    expect(DEFINED.size).toBeGreaterThan(30);
  });

  it.each(IMPORTERS)(
    "$name names no class the stylesheet lacks",
    ({ source }) => {
      const named = classesNamedIn(source);

      expect(named.length).toBeGreaterThan(0);
      expect(named.filter((name) => !DEFINED.has(name))).toEqual([]);
    },
  );

  it("would have caught the missing `groups`", () => {
    const withoutGroups = classesDefinedIn(
      STYLESHEET.replace(/\.groups\b/g, ".renamedAway"),
    );
    const screen = IMPORTERS.find(({ name }) =>
      name.endsWith("review-screen.tsx"),
    );

    expect(
      classesNamedIn(screen?.source ?? "").filter(
        (name) => !withoutGroups.has(name),
      ),
    ).toEqual(["groups"]);
  });
});

describe("the spacing frame 3A draws", () => {
  const css = withoutComments(STYLESHEET);

  /** The declarations of the first rule whose selector list names `selector`. */
  function ruleBody(selector: string): string {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = (match[1] ?? "").split(",").map((part) => part.trim());
      if (selectors.includes(selector)) return match[2] ?? "";
    }
    throw new Error(`no rule for ${selector}`);
  }

  it.each([
    [".body", "gap: 15px"],
    [".groups", "gap: 15px"],
    [".group", "gap: 10px"],
    [".rows", "gap: 10px"],
  ])("gives %s `%s`", (selector, declaration) => {
    expect(ruleBody(selector)).toContain(declaration);
  });

  it("stacks the groups, so that their gap applies", () => {
    expect(ruleBody(".groups")).toContain("flex-direction: column");
  });
});
