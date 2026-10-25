// What the audit page's source files may and may not hold, read from their text as syntax: no word a person reads is
// written into a component (the words are the catalogue's), nothing builds markup from a string, nothing keeps what was
// read or the filters chosen, the hook has no timer to ask again with (every page served is a row of the log), and an
// action's words are asked of a `Map` and never found by indexing, because a code from the database may be any name.
// Nothing runs here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SCREEN_FILES = [
  "app/[locale]/staff/audit/page.tsx",
  "staff/staff-audit-page.tsx",
  "staff/staff-audit-rows.tsx",
  "staff/staff-audit-filters.tsx",
  "staff/use-staff-audit.ts",
  "staff/staff-audit-states.tsx",
  "staff/staff-audit-days.ts",
  "staff/staff-audit-listing.ts",
  "staff/staff-audit-request.ts",
  "staff/staff-audit-wire-reading.ts",
] as const;
const HOOK_FILE = "staff/use-staff-audit.ts";
const ROWS_FILE = "staff/staff-audit-rows.tsx";

const SPOKEN_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "title",
  "placeholder",
  "alt",
]);
/** Every Romanian and Russian word holds a letter that is not ASCII, or sits beside one that is. */
const NON_ASCII_LETTER = /(?=\P{ASCII})\p{L}/u;
const KEEPING_NAMES = new Set(["localStorage", "sessionStorage", "indexedDB"]);
const TIMER_NAMES = new Set(["setTimeout", "setInterval"]);
const ADDRESS_WRITING_NAMES = [
  "pushState",
  "replaceState",
  "hash",
  "search",
  "href",
];

function parse(relative: string): ts.SourceFile {
  return ts.createSourceFile(
    relative,
    readFileSync(join(SOURCE_ROOT, relative), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function collect<Found>(
  file: ts.SourceFile,
  pick: (node: ts.Node) => Found | undefined,
): Found[] {
  const found: Found[] = [];
  const visit = (node: ts.Node): void => {
    const picked = pick(node);
    if (picked !== undefined) found.push(picked);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function identifiersIn(file: ts.SourceFile): string[] {
  return collect(file, (node) =>
    ts.isIdentifier(node) ? node.text : undefined,
  );
}

describe.each(SCREEN_FILES)("%s", (relative) => {
  const file = parse(relative);

  it("writes no word a person reads: JSX text and spoken attributes come from the catalogue", () => {
    const written = collect(file, (node) => {
      if (ts.isJsxText(node) && node.text.trim() !== "") {
        return node.text.trim();
      }
      if (
        ts.isJsxAttribute(node) &&
        SPOKEN_ATTRIBUTES.has(node.name.getText()) &&
        node.initializer !== undefined &&
        ts.isStringLiteral(node.initializer)
      ) {
        return node.initializer.text;
      }
      return undefined;
    });

    expect(written).toEqual([]);
  });

  it("holds no literal with a letter outside ASCII: no Romanian or Russian word is written into the code", () => {
    const literals = collect(file, (node) =>
      ts.isStringLiteralLike(node) ? node.text : undefined,
    );

    expect(literals.filter((text) => NON_ASCII_LETTER.test(text))).toEqual([]);
  });

  it("builds no markup from a string", () => {
    const attributes = collect(file, (node) =>
      ts.isJsxAttribute(node) ? node.name.getText() : undefined,
    );

    expect(attributes).not.toContain("dangerouslySetInnerHTML");
    for (const name of ["innerHTML", "outerHTML", "insertAdjacentHTML"]) {
      expect(identifiersIn(file)).not.toContain(name);
    }
  });

  it("logs nothing: a row of the log is a person's doing and is not written anywhere but the screen", () => {
    expect(identifiersIn(file)).not.toContain("console");
  });

  it("keeps nothing in the browser, reads no cookie, and writes to neither the address nor the history", () => {
    const names = identifiersIn(file);
    const cookieReads = collect(file, (node) =>
      ts.isPropertyAccessExpression(node) && node.name.text === "cookie"
        ? node.getText()
        : undefined,
    );

    expect(names.filter((name) => KEEPING_NAMES.has(name))).toEqual([]);
    expect(cookieReads).toEqual([]);
    for (const forbidden of ADDRESS_WRITING_NAMES) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("makes no link to write or to call, and no link at all to a kitchen or a person", () => {
    const links = collect(file, (node) =>
      ts.isStringLiteralLike(node) && /^(mailto|tel|sms):/i.test(node.text)
        ? node.text
        : undefined,
    );
    const anchors = collect(file, (node) =>
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === "a"
        ? node.getText()
        : undefined,
    );

    expect(links).toEqual([]);
    expect(anchors).toEqual([]);
  });

  it("navigates by the plain anchor, never the soft navigation of the site's router", () => {
    const imports = collect(file, (node) =>
      ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined,
    );

    expect(imports).not.toContain("next/link");
    expect(imports).not.toContain("@/i18n/navigation");
  });
});

describe("the hook", () => {
  const file = parse(HOOK_FILE);

  it("has no timer, so nothing it does can ask again on its own", () => {
    expect(identifiersIn(file).filter((name) => TIMER_NAMES.has(name))).toEqual(
      [],
    );
  });

  it("asks for nothing itself: the one module that reads for staff does, and it is a GET", () => {
    expect(identifiersIn(file)).not.toContain("fetch");
  });
});

describe("the rows", () => {
  const file = parse(ROWS_FILE);

  it("ask the words of an action of a `Map`, and index nothing by a code that came from the log", () => {
    const labelCalls = collect(file, (node) =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText().endsWith("actionLabels")
        ? node.expression.name.text
        : undefined,
    );
    const indexedLabels = collect(file, (node) =>
      ts.isElementAccessExpression(node) &&
      /label/i.test(node.expression.getText())
        ? node.getText()
        : undefined,
    );

    expect(labelCalls).toEqual(["get"]);
    expect(indexedLabels).toEqual([]);
  });
});
