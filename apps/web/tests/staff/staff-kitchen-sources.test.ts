// What the staff kitchen's source files may and may not hold, read from their text as syntax: no word a person reads is
// written into a component (the words are the catalogue's), nothing builds markup from a string, nothing makes an address or a
// phone a link, nothing keeps what was read, the hook has no timer to ask again with, and the picture never reaches the
// editor. Nothing runs here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SCREEN_FILES = [
  "staff/staff-kitchen-page.tsx",
  "staff/staff-kitchen-states.tsx",
  "staff/staff-kitchen-request.tsx",
  "staff/staff-kitchen-client.tsx",
  "staff/staff-kitchen-card.tsx",
  "staff/staff-kitchen-facts.ts",
  "staff/staff-kitchen-dates.ts",
  "staff/bidi-isolate.ts",
  "staff/staff-kitchen-view.tsx",
  "staff/use-staff-kitchen.ts",
  "staff/staff-read-request.ts",
  "app/[locale]/staff/kitchens/[id]/page.tsx",
  "staff/staff-notes.tsx",
  "staff/staff-status-control.tsx",
  "staff/unhide-banner.tsx",
  "staff/staff-session-sheet.tsx",
  "staff/staff-session-expiry.ts",
  "staff/use-note-composer.ts",
  "staff/use-status-control.ts",
  "staff/use-unhide.ts",
  "staff/use-one-write-at-a-time.ts",
  "staff/staff-note-rules.ts",
] as const;
const HOOK_FILE = "staff/use-staff-kitchen.ts";
const READ_FILE = "staff/staff-read-request.ts";
/** The files that make a request or hold what was typed: none of them may ask again, wait, or keep a note. */
const WRITING_FILES = [
  "staff/use-note-composer.ts",
  "staff/use-status-control.ts",
  "staff/use-unhide.ts",
  "staff/use-one-write-at-a-time.ts",
  "staff/staff-session-expiry.ts",
  "staff/staff-notes.tsx",
  "staff/staff-status-control.tsx",
  "staff/unhide-banner.tsx",
  "staff/staff-session-sheet.tsx",
] as const;
const VIEW_FILE = "staff/staff-kitchen-view.tsx";

/** Attributes whose value a person reads or hears. */
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

function stringLiteralsIn(file: ts.SourceFile): string[] {
  return collect(file, (node) =>
    ts.isStringLiteralLike(node) ? node.text : undefined,
  );
}

function importsOf(file: ts.SourceFile): string[] {
  return collect(file, (node) =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined,
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
    expect(
      stringLiteralsIn(file).filter((text) => NON_ASCII_LETTER.test(text)),
    ).toEqual([]);
  });

  it("builds no markup from a string", () => {
    const attributes = collect(file, (node) =>
      ts.isJsxAttribute(node) ? node.name.getText() : undefined,
    );
    const properties = collect(file, (node) =>
      ts.isIdentifier(node) ? node.text : undefined,
    );

    expect(attributes).not.toContain("dangerouslySetInnerHTML");
    expect(properties).not.toContain("innerHTML");
    expect(properties).not.toContain("outerHTML");
    expect(properties).not.toContain("insertAdjacentHTML");
  });

  it("makes no link to write or to call", () => {
    const links = stringLiteralsIn(file).filter((text) =>
      /^(mailto|tel|sms):/i.test(text.trim()),
    );

    expect(links).toEqual([]);
  });

  it("keeps nothing in the browser and reads no cookie", () => {
    const names = collect(file, (node) =>
      ts.isIdentifier(node) ? node.text : undefined,
    );
    const cookieReads = collect(file, (node) =>
      ts.isPropertyAccessExpression(node) && node.name.text === "cookie"
        ? node.getText()
        : undefined,
    );

    expect(names.filter((name) => KEEPING_NAMES.has(name))).toEqual([]);
    expect(cookieReads).toEqual([]);
  });

  it("navigates by the plain anchor and the full load, never the soft navigation of the site's router", () => {
    const imports = importsOf(file);

    expect(imports).not.toContain("next/link");
    expect(imports).not.toContain("@/i18n/navigation");
  });
});

describe("the hook", () => {
  const file = parse(HOOK_FILE);

  it("has no timer, so nothing it does can ask again on its own", () => {
    const names = collect(file, (node) =>
      ts.isIdentifier(node) ? node.text : undefined,
    );

    expect(names.filter((name) => TIMER_NAMES.has(name))).toEqual([]);
  });

  it("asks for nothing itself: the one module that reads for staff does, and it is a GET", () => {
    const names = collect(file, (node) =>
      ts.isIdentifier(node) ? node.text : undefined,
    );

    expect(names).not.toContain("fetch");
    expect(importsOf(file)).toContain("./staff-read-request");
  });
});

describe.each(WRITING_FILES)(
  "%s, which writes or holds what was typed",
  (relative) => {
    const file = parse(relative);

    it("has no timer, so nothing it does can be asked again on its own", () => {
      const names = collect(file, (node) =>
        ts.isIdentifier(node) ? node.text : undefined,
      );

      expect(names.filter((name) => TIMER_NAMES.has(name))).toEqual([]);
    });

    it("calls `fetch` nowhere: a write goes through the one sender, which states the referrer policy", () => {
      const calls = collect(file, (node) =>
        ts.isCallExpression(node) && node.expression.getText() === "fetch"
          ? node.getText()
          : undefined,
      );

      expect(calls).toEqual([]);
    });

    it("writes to neither the address nor the history", () => {
      const names = collect(file, (node) =>
        ts.isIdentifier(node) ? node.text : undefined,
      );

      for (const forbidden of ["pushState", "replaceState", "hash", "search"]) {
        expect(names).not.toContain(forbidden);
      }
    });
  },
);

describe("the module that reads for staff", () => {
  const file = parse(READ_FILE);

  it("asks with `fetch` once, in one place, always by GET and always stating the referrer policy", () => {
    const calls = collect(file, (node) =>
      ts.isCallExpression(node) && node.expression.getText() === "fetch"
        ? node.getText()
        : undefined,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('method: "GET"');
    expect(calls[0]).toContain("referrerPolicy: NO_REFERRER_POLICY");
  });

  it("has no timer, so nothing it does can ask again on its own", () => {
    const names = collect(file, (node) =>
      ts.isIdentifier(node) ? node.text : undefined,
    );

    expect(names.filter((name) => TIMER_NAMES.has(name))).toEqual([]);
  });
});

describe("the picture", () => {
  const file = parse(VIEW_FILE);

  it("reaches neither the editor screen, its panel, its price bar nor the editor's canvas", () => {
    const imports = importsOf(file);

    for (const editorModule of [
      "@/app/configurator/configure/configure-screen",
      "@/panel/editor-panel",
      "@/price/price-bar",
      "@/scene/kitchen-canvas",
    ]) {
      expect(imports).not.toContain(editorModule);
    }
  });

  it("draws the review's picture, which is the view-only canvas", () => {
    expect(importsOf(file)).toContain("@/review/review-scene");
  });

  it("mounts no `<ConfigureScreen>` of any variant", () => {
    const mounts = collect(file, (node) =>
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === "ConfigureScreen"
        ? node.getText()
        : undefined,
    );

    expect(mounts).toEqual([]);
  });
});
