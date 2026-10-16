// Reads source and stylesheet. Claims that a rendered page in a DOM with no layout cannot make: every control the screen
// adds is a 44 px target, nothing on it moves (so there is no motion to reduce), the column and the pinned foot are the
// review's, a long reference wraps, no way out of the screen is prefetched or a step back, and the stylesheet defines
// every class the markup names. The behaviour each protects is proved in the dom tests.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { valuesFor } from "../support/css-declarations";

const DONE_SOURCE_DIRECTORY = join(import.meta.dirname, "../../src/done");
const STYLESHEET = readFileSync(
  join(DONE_SOURCE_DIRECTORY, "done.module.css"),
  "utf8",
);

function componentSources(): Record<string, string> {
  return Object.fromEntries(
    readdirSync(DONE_SOURCE_DIRECTORY)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => [
        name,
        readFileSync(join(DONE_SOURCE_DIRECTORY, name), "utf8"),
      ]),
  );
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function classesDefinedIn(css: string): Set<string> {
  return new Set(
    [...withoutComments(css).matchAll(/\.([A-Za-z_][\w-]*)/g)].flatMap(
      (match) => (match[1] === undefined ? [] : [match[1]]),
    ),
  );
}

function classesNamedBy(sources: Record<string, string>): string[] {
  return Object.values(sources).flatMap((source) =>
    [...source.matchAll(/\bstyles\.([A-Za-z_]\w*)/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  );
}

describe("the confirmation's stylesheet", () => {
  it("defines every class the markup names", () => {
    const defined = classesDefinedIn(STYLESHEET);
    const named = classesNamedBy(componentSources());

    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((name) => !defined.has(name))).toEqual([]);
  });

  it.each([
    ["copyButton", "min-height", "var(--touch-target)"],
    ["copyButton", "min-width", "var(--touch-target)"],
    ["reviewLink", "min-height", "var(--touch-target)"],
    ["backToDesign", "min-height", "48px"],
    ["whatsappAction", "min-height", "52px"],
  ])("makes .%s at least 44 px by its %s", (className, property, expected) => {
    expect(valuesFor(STYLESHEET, className, property)).toEqual([expected]);
  });

  it("resolves the touch target token to 44 px", () => {
    const globals = readFileSync(
      join(import.meta.dirname, "../../src/app/globals.css"),
      "utf8",
    );

    expect(globals).toMatch(/--touch-target:\s*44px/);
  });

  it("caps the page in a centred 640 px column, as the review does", () => {
    expect(valuesFor(STYLESHEET, "screen", "max-width")).toEqual(["640px"]);
    expect(valuesFor(STYLESHEET, "screen", "margin-inline")).toEqual(["auto"]);
  });

  it("pins the foot at the viewport's bottom, in the flow", () => {
    expect(valuesFor(STYLESHEET, "bottom", "position")).toEqual(["sticky"]);
    expect(valuesFor(STYLESHEET, "bottom", "bottom")).toEqual(["0"]);
  });

  it("draws nothing fixed", () => {
    expect(withoutComments(STYLESHEET)).not.toMatch(/position:\s*fixed/);
  });

  it("moves nothing, so there is no motion to ignore a reduced-motion setting", () => {
    const css = withoutComments(STYLESHEET);

    expect(css).not.toMatch(/\b(?:transition|animation|@keyframes)\b/);
    expect(css).not.toMatch(/scroll-behavior/);
  });

  it.each(["reference", "heading", "summary"])(
    "lets .%s wrap a value of any length inside the column",
    (className) => {
      expect(valuesFor(STYLESHEET, className, "overflow-wrap")).toEqual([
        "anywhere",
      ]);
    },
  );

  it("makes the reference selectable as one", () => {
    expect(valuesFor(STYLESHEET, "reference", "user-select")).toEqual(["all"]);
  });

  it.each([
    ["designLink", "white-space", "nowrap"],
    ["designLink", "overflow", "hidden"],
    ["designLink", "text-overflow", "ellipsis"],
    ["designLink", "user-select", "all"],
    ["linkText", "min-width", "0"],
  ])(
    "keeps a long design address on one line inside the card: .%s's %s is %s",
    (className, property, expected) => {
      expect(valuesFor(STYLESHEET, className, property)).toEqual([expected]);
    },
  );

  it.each(["disc", "barMark"])(
    "draws the check of .%s from the stylesheet, so that no text carries it",
    (className) => {
      expect(valuesFor(STYLESHEET, className, "content")).toEqual([
        String.raw`"\2713"`,
      ]);
    },
  );
});

describe("the confirmation's components", () => {
  it("prefetch no link", () => {
    const settings = Object.values(componentSources()).flatMap((source) =>
      [...source.matchAll(/prefetch=\{[^}]*\}/g)].map((match) => match[0]),
    );

    expect(settings).toEqual(["prefetch={false}"]);
  });

  it.each(["router.back", "history.back", "history.go", "useRouter"])(
    "name %j in no file",
    (text) => {
      const named = Object.entries(componentSources())
        .filter(([, source]) => source.includes(text))
        .map(([name]) => name);

      expect(named).toEqual([]);
    },
  );
});
