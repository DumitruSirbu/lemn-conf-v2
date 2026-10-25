// What the staff kitchen page can reach, read from the source as syntax (wave L3-U3). A page that holds a client's kitchen and
// contact for a member of staff must not be able to write, send, keep or say them: so the four files carry no name that does,
// and the editor, its panel and its price bar are not merely absent from their imports but out of everything they import.
// Nothing runs here.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const FILES = [
  "staff/staff-kitchen-page.tsx",
  "staff/staff-kitchen-view.tsx",
  "staff/use-staff-kitchen.ts",
  "staff/staff-read-request.ts",
  "app/[locale]/staff/kitchens/[id]/page.tsx",
] as const;
const SERVER_PAGE = "app/[locale]/staff/kitchens/[id]/page.tsx";
const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"] as const;

/** Modules that make a kitchen editable, or price it as a bar the person can act on, or write one. */
const EDITING_MODULES = [
  "app/configurator/configure/configure-screen.tsx",
  "panel/editor-panel.tsx",
  "price/price-bar.tsx",
] as const;

/** Names that send, keep or say something outside the page. */
const FORBIDDEN_NAMES = new Set([
  "console",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "sendBeacon",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "BroadcastChannel",
  "postMessage",
  "clipboard",
  "pushState",
  "replaceState",
  "setTimeout",
  "setInterval",
  "requestIdleCallback",
]);
const WRITING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Calls on a store that change it. */
const STORE_WRITES = new Set(["setState", "getState", "dispatch", "apply"]);

function parse(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readFileSync(join(SOURCE_ROOT, relativePath), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function specifiersOf(file: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function resolveInSource(from: string, specifier: string): string | undefined {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    base = relative(SOURCE_ROOT, join(SOURCE_ROOT, dirname(from), specifier));
  } else {
    return undefined;
  }
  if (/\.(css|json)$/.test(base)) return undefined;
  return EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => existsSync(join(SOURCE_ROOT, candidate)),
  );
}

/** Every source module a file reaches by an import, a re-export or a lazy import, at any depth. */
function reachableFrom(entry: string): Set<string> {
  const reached = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || reached.has(current)) continue;
    reached.add(current);
    for (const specifier of specifiersOf(parse(current))) {
      const next = resolveInSource(current, specifier);
      if (next !== undefined) queue.push(next);
    }
  }
  return reached;
}

function namesIn(file: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("what the page reaches, at any depth", () => {
  it.each(FILES)(
    "%s reaches no part of the editor, its panel or its price bar",
    (entry) => {
      const reached = reachableFrom(entry);

      expect(EDITING_MODULES.filter((module) => reached.has(module))).toEqual(
        [],
      );
    },
  );

  it.each(FILES.filter((entry) => entry !== SERVER_PAGE))(
    "%s, which runs in the browser, reaches no module of the server side",
    (entry) => {
      const reached = [...reachableFrom(entry)].filter((module) =>
        module.startsWith("lib/server/"),
      );

      expect(reached).toEqual([]);
    },
  );

  it("finds the modules it is looking for, so an empty answer above means something", () => {
    const reached = reachableFrom("staff/staff-kitchen-view.tsx");

    expect(reached.has("review/review-scene.tsx")).toBe(true);
    expect(reached.has("store/configurator-store.ts")).toBe(true);
    expect(reached.size).toBeGreaterThan(10);
  });
});

describe.each(FILES)("%s", (relativePath) => {
  const file = parse(relativePath);

  it("holds no name that sends, keeps or says what it was given, and no timer", () => {
    expect(namesIn(file).filter((name) => FORBIDDEN_NAMES.has(name))).toEqual(
      [],
    );
  });

  it("holds no writing method of HTTP", () => {
    const methods: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isStringLiteralLike(node) &&
        WRITING_METHODS.has(node.text.toUpperCase())
      ) {
        methods.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(methods).toEqual([]);
  });

  it("calls no method of a store that changes or reaches into it, other than the helper that seeds the read-only view", () => {
    const calls: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        STORE_WRITES.has(node.name.text) &&
        node.expression.getText() !== "standAt"
      ) {
        calls.push(node.getText());
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(calls).toEqual([]);
  });

  it("makes a request only in the one module that reads for staff, only by `fetch`, and a page, a view or a hook makes none", () => {
    const fetches = namesIn(file).filter((name) => name === "fetch").length;

    expect(fetches).toBe(
      relativePath === "staff/staff-read-request.ts" ? 1 : 0,
    );
  });

  it("reads no part of the address or the cookie jar to carry a kitchen in or out", () => {
    const text = file.getFullText();

    expect(text).not.toMatch(
      /document\.cookie|location\.(hash|search|href)|window\.open|URLSearchParams/,
    );
  });
});
