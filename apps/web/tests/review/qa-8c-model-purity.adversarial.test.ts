// The review model reaches no React, store, route or component at run time, by any form of import.
//
// The module graph is read with the TypeScript parser, not a pattern over the text, so the forms a pattern
// misses are followed: a bare `import "x"`, a dynamic `import("x")`, a `require("x")`, a single-quoted
// specifier, and an `import { type A, b }` that carries a value beside its type. An import the compiler erases
// (`import type`) loads nothing and is left out, which is what lets `i18n/content.ts` name next-intl's types.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../src");
const MODEL = resolve(SRC, "review/review-model.ts");

function isErasedImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function isErasedExport(node: ts.ExportDeclaration): boolean {
  const clause = node.exportClause;
  return (
    node.isTypeOnly ||
    (clause !== undefined &&
      ts.isNamedExports(clause) &&
      clause.elements.length > 0 &&
      clause.elements.every((element) => element.isTypeOnly))
  );
}

function isLoadingCall(node: ts.CallExpression): boolean {
  return (
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === "require")
  );
}

type Reading = "loaded at run time" | "named at all";

function isRead(isErased: boolean, reading: Reading): boolean {
  return reading === "named at all" || !isErased;
}

function specifierOf(node: ts.Node, reading: Reading): string | undefined {
  if (ts.isImportDeclaration(node) && isRead(isErasedImport(node), reading)) {
    return ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined;
  }
  if (ts.isExportDeclaration(node) && isRead(isErasedExport(node), reading)) {
    return node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined;
  }
  if (ts.isCallExpression(node) && isLoadingCall(node)) {
    const [argument] = node.arguments;
    return argument !== undefined && ts.isStringLiteralLike(argument)
      ? argument.text
      : "<computed>";
  }
  return undefined;
}

/** Every module this source loads when it runs, in any syntactic form. */
function loadedSpecifiersOf(source: string): readonly string[] {
  return specifiersOf(source, "loaded at run time");
}

function specifiersOf(source: string, reading: Reading): readonly string[] {
  const file = ts.createSourceFile(
    "module.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    const specifier = specifierOf(node, reading);
    if (specifier !== undefined) specifiers.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return specifiers;
}

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (base === undefined) return undefined;
  const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
    (candidate) => existsSync(candidate) && /\.[a-z]+$/.test(candidate),
  );
  if (found === undefined) throw new Error(`cannot resolve ${specifier}`);
  return found;
}

interface LoadedClosure {
  readonly files: readonly string[];
  readonly packages: readonly string[];
}

function closureOf(
  entry: string,
  reading: Reading = "loaded at run time",
): LoadedClosure {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file) || !/\.tsx?$/.test(file)) continue;
    files.add(file);
    for (const specifier of specifiersOf(readFileSync(file, "utf8"), reading)) {
      const local = resolveLocal(file, specifier);
      if (local === undefined) packages.add(specifier);
      else pending.push(local);
    }
  }
  return {
    files: [...files].map((file) => file.slice(SRC.length + 1)).sort(),
    packages: [...packages].sort(),
  };
}

const UI_LOCATIONS =
  /^(?:store|app|components)\/|\.tsx$|(?:^|\/)use-[^/]+\.ts$/;

function declaresAClientModule(file: string): boolean {
  return /^\s*["']use client["']/.test(
    readFileSync(resolve(SRC, file), "utf8"),
  );
}

describe("what the review model loads at run time", () => {
  const closure = closureOf(MODEL);

  it("is, of all packages, the domain alone", () => {
    expect(closure.packages).toEqual(["@lemnaria/configurator-domain"]);
  });

  it("is no store, route, component, hook or client module, however deep", () => {
    expect(closure.files.filter((file) => UI_LOCATIONS.test(file))).toEqual([]);
    expect(closure.files.filter(declaresAClientModule)).toEqual([]);
  });

  it("includes the breakdown's row builder and the price figure, so the walk went somewhere", () => {
    expect(closure.files).toEqual(
      expect.arrayContaining([
        "price/price-breakdown-model.ts",
        "price/starting-price.ts",
        "review/review-model.ts",
      ]),
    );
  });
});

describe("what the review model names, counting the imports the compiler erases", () => {
  const closure = closureOf(MODEL, "named at all");

  it("reaches the content resolver, whose types it is written against", () => {
    expect(closure.files).toContain("i18n/content.ts");
  });

  it("is still no store, route, component, hook or client module", () => {
    expect(closure.files.filter((file) => UI_LOCATIONS.test(file))).toEqual([]);
    expect(closure.files.filter(declaresAClientModule)).toEqual([]);
  });

  it("is, beyond the domain, only the translator's types", () => {
    expect(closure.packages).toEqual([
      "@lemnaria/configurator-domain",
      "next-intl",
    ]);
  });
});

describe("the walk that reads the model's imports", () => {
  it.each([
    ['import "react";', ["react"]],
    ["import React from 'react';", ["react"]],
    ['const store = await import("zustand");', ["zustand"]],
    ['const next = require("next/navigation");', ["next/navigation"]],
    ['export * from "react-dom";', ["react-dom"]],
    ['import { type FC, useMemo } from "react";', ["react"]],
    ["const name = 'react'; await import(name);", ["<computed>"]],
    ['import\n  { useStore }\n  from\n  "zustand";', ["zustand"]],
  ])("sees what %s loads", (source, loaded) => {
    expect(loadedSpecifiersOf(source)).toEqual(loaded);
  });

  it.each([
    'import type { FC } from "react";',
    'import { type FC, type ReactNode } from "react";',
    'export type { FC } from "react";',
    'type Loaded = typeof import("react");',
    '// import "react";\nconst text = \'import "react"\';',
  ])("sees that %s loads nothing", (source) => {
    expect(loadedSpecifiersOf(source)).toEqual([]);
  });

  it("finds React and a client module behind the price bar, which is not a pure model", () => {
    const priceBar = closureOf(resolve(SRC, "price/price-bar.tsx"));

    expect(priceBar.packages).toContain("react");
    expect(priceBar.files.filter((file) => UI_LOCATIONS.test(file))).toContain(
      "price/price-bar.tsx",
    );
  });

  it("finds the store behind the pricing hook, which the model must not reach", () => {
    const pricingHook = closureOf(resolve(SRC, "price/use-priced-design.ts"));

    expect(pricingHook.packages).toContain("react");
    expect(pricingHook.files.filter((file) => UI_LOCATIONS.test(file))).toEqual(
      expect.arrayContaining([
        "price/use-priced-design.ts",
        "store/configurator-store.ts",
      ]),
    );
  });
});
