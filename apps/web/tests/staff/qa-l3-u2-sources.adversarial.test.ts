// What the staff list's source files may and may not hold, read from their text: no word a person reads is written into a
// component (the words come from the catalogue), nothing builds markup from a string, nothing keeps what a person typed,
// and the stylesheet declares what a hand and a long word need. Nothing runs a layout here: the stylesheet is read as text,
// every declaration of a property on a class (the project's `declarationsFor`), and the TypeScript files are read as syntax.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { declarationsFor, valuesFor } from "../support/css-declarations";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SCREEN_FILES = [
  "staff/staff-kitchens-list.tsx",
  "staff/staff-kitchen-filters.tsx",
  "staff/staff-pagination.tsx",
  "staff/staff-kitchens-states.tsx",
  "staff/use-staff-kitchens.ts",
  "app/[locale]/staff/kitchens/page.tsx",
] as const;
const CSS_PATH = join(SOURCE_ROOT, "staff/staff-kitchens.module.css");

/** Attributes whose value a person reads or hears. */
const SPOKEN_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
]);
const NON_ASCII_LETTER = /[^\p{ASCII}]/u;

function sourceOf(relative: string): string {
  return readFileSync(join(SOURCE_ROOT, relative), "utf8");
}

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile(
    "scanned.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Words written into the code itself, as a person would meet them: text between tags, a spoken attribute's literal, and
 *  any literal holding a letter outside ASCII (every Romanian and Russian word has one or is accompanied by one). */
function writtenWordsIn(code: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim() !== "") {
      found.push(node.text.trim());
    }
    if (
      ts.isJsxAttribute(node) &&
      SPOKEN_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer)
    ) {
      found.push(node.initializer.text);
    }
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      NON_ASCII_LETTER.test(node.text)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(code));
  return found;
}

/** The code with every comment removed, so a rule about what the code does is not tripped by what a comment names. */
function codeWithoutComments(code: string): string {
  const printer = ts.createPrinter({ removeComments: true });
  return printer.printFile(parse(code));
}

/* eslint-disable no-restricted-syntax -- 6B-j allow-list: positive controls for the scan below: sources that hold a Romanian
   letter, which the scan must find, so no catalogue leaf can supply them. */
describe("the scan of written words, on sources whose answer is known", () => {
  it("finds a word between tags, in a spoken attribute and in a literal with a Romanian letter", () => {
    expect(writtenWordsIn("const a = <p>Salut</p>;")).toEqual(["Salut"]);
    expect(writtenWordsIn('const a = <a aria-label="Deschide" />;')).toEqual([
      "Deschide",
    ]);
    expect(writtenWordsIn('const a = "Bucătării";')).toEqual(["Bucătării"]);
    expect(writtenWordsIn("const a = `Кухни ${n}`;")).toEqual(["Кухни "]);
  });

  it("finds nothing in a comment, in a class name, in a role or in a word of a state", () => {
    expect(
      writtenWordsIn(
        '// "Bucătării clienți"\nconst a = <p role="status" className={x} data-kind="sent">{copy.title}</p>;',
      ),
    ).toEqual([]);
  });
});

/* eslint-enable no-restricted-syntax */

describe.each(SCREEN_FILES)("%s", (file) => {
  const code = sourceOf(file);

  it("writes no word a person reads: they all come from the catalogue", () => {
    expect(writtenWordsIn(code)).toEqual([]);
  });

  it("builds no markup from a string, keeps nothing a person typed, and logs nothing", () => {
    const executable = codeWithoutComments(code);

    for (const forbidden of [
      "dangerouslySetInnerHTML",
      "innerHTML",
      "outerHTML",
      "insertAdjacentHTML",
      "document.write",
      "eval(",
      "new Function",
      "localStorage",
      "sessionStorage",
      "document.cookie",
      "sendBeacon",
      "history.",
      "console.",
      "indexedDB",
    ]) {
      expect(executable, forbidden).not.toContain(forbidden);
    }
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(CSS_PATH, "utf8");

  it.each(["clamped", "breakable", "sub", "line"])(
    "lets a word longer than the line break anywhere in .%s",
    (name) => {
      expect(valuesFor(css, name, "overflow-wrap")).toContain("anywhere");
    },
  );

  it.each(["page", "results", "cardInfo"])(
    "lets .%s shrink below the width of a long word",
    (name) => {
      expect(valuesFor(css, name, "min-width")).toContain("0");
    },
  );

  it("breaks the table's cells by the same rule", () => {
    expect(css).toMatch(
      /\.table th,\s*\.table td\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
  });

  it.each([
    "searchClear",
    "statusSelect",
    "open",
    "pageButton",
    "moreButton",
    "stateAction",
  ])("draws a ring on .%s when it has the keyboard's focus", (name) => {
    expect(css).toMatch(
      new RegExp(`\\.${name}:focus-visible\\s*\\{[^}]*outline:\\s*2px solid`),
    );
  });

  it("draws the segment's ring on its face, and the search box's ring around the box that holds the input", () => {
    expect(css).toMatch(
      /\.segmentInput:focus-visible \+ \.segmentFace\s*\{[^}]*outline:\s*2px solid/,
    );
    expect(css).toMatch(
      /\.searchControl:focus-within\s*\{[^}]*outline:\s*2px solid/,
    );
    expect(valuesFor(css, "searchInput", "outline")).toEqual(["none"]);
  });

  it("covers a whole segment with the radio it stands for, so the radio is as big as the face", () => {
    expect(valuesFor(css, "segmentInput", "position")).toEqual(["absolute"]);
    expect(valuesFor(css, "segmentInput", "inset")).toEqual(["0"]);
    expect(valuesFor(css, "segmentInput", "width")).toEqual(["100%"]);
    expect(valuesFor(css, "segmentInput", "height")).toEqual(["100%"]);
    expect(valuesFor(css, "segment", "position")).toEqual(["relative"]);
  });

  it("gives the input inside the search box at least a touch target of height", () => {
    expect(valuesFor(css, "searchInput", "min-height")).toEqual(["44px"]);
  });

  it("turns the table on at the width the script switches at, and at no other", () => {
    const widths = [...css.matchAll(/@media \(min-width:\s*(\d+)px\)/g)].map(
      (match) => match[1],
    );
    const screen = sourceOf("staff/staff-kitchens-list.tsx");

    expect(widths).toEqual(["900"]);
    expect(screen).toContain('"(min-width: 900px)"');
  });

  it("changes no size of a target inside the wide layout", () => {
    for (const name of ["searchClear", "pageButton", "open", "stateAction"]) {
      const inWideLayout = declarationsFor(css, name, "min-height")
        .concat(declarationsFor(css, name, "height"))
        .filter(({ media }) => media !== "");

      expect(inWideLayout, name).toEqual([]);
    }
  });
});
