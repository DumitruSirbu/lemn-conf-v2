// Reads the sources for what must never reach a browser or a production build: the invented counts, the stand-in client and
// the server-only source. These are absence claims over source text, each with the rule it guards named in its title; the
// behaviour itself is proved by the tests of the clients and of the source.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const DASHBOARD_ROOT = join(SOURCE_ROOT, "price-dashboard");
const USE_CLIENT = /^\s*["']use client["']/m;

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const sourceOf = (path: string): string =>
  withoutComments(readFileSync(path, "utf8"));
const relativeSources = filesUnder(SOURCE_ROOT).map((path) => ({
  relative: path.slice(SOURCE_ROOT.length + 1),
  text: sourceOf(path),
}));

const clientModules = filesUnder(SOURCE_ROOT)
  .filter((path) => USE_CLIENT.test(readFileSync(path, "utf8").slice(0, 400)))
  .map((path) => path.slice(SOURCE_ROOT.length + 1));

describe("what a browser is sent (reads source)", () => {
  it("has the hardware screens' client modules to look at", () => {
    expect(clientModules).toContain("price-dashboard/hardware-list.tsx");
    expect(clientModules).toContain("price-dashboard/hardware-edit.tsx");
    expect(clientModules).toContain("price-dashboard/use-item-availability.ts");
  });

  it("reaches no invented count and no server-only source from any client module, however far its imports go", () => {
    const leaks = clientModules.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) =>
          /(^|\/)hardware-(sample|source)\.tsx?$/.test(module),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(leaks).toEqual([]);
  });

  it("names the invented counts from the source and from nothing else, in a dynamic import", () => {
    const importers = relativeSources
      .filter(({ text }) => /hardware-sample["']/.test(text))
      .map(({ relative }) => relative);
    const source = sourceOf(join(DASHBOARD_ROOT, "hardware-source.ts"));

    expect(importers).toEqual(["price-dashboard/hardware-source.ts"]);
    expect(source).toMatch(/await import\("\.\/hardware-sample"\)/);
    expect(source).not.toMatch(/^\s*import\s[^;]*hardware-sample/m);
  });

  it("is named by the three hardware pages, the list, a class and the creation form, and by nothing else, the source that is server-only", () => {
    const importers = relativeSources
      .filter(({ text }) => /hardware-source["']/.test(text))
      .map(({ relative }) => relative)
      .sort();

    expect(importers).toEqual([
      "app/[locale]/staff/catalog/hardware/[tierId]/page.tsx",
      "app/[locale]/staff/catalog/hardware/new/page.tsx",
      "app/[locale]/staff/catalog/hardware/page.tsx",
    ]);
  });
});

describe("the stand-in client (reads source)", () => {
  it("is loaded by the default client alone, and by no static import anywhere", () => {
    const importers = relativeSources
      .filter(({ text }) => /item-lifecycle-stand-in-client["']/.test(text))
      .map(({ relative }) => relative)
      .sort();
    const staticImport =
      /^\s*import\s(?!type\b)[^;]*from\s*["'][^"']*item-lifecycle-stand-in-client["']/m;
    const staticImporters = relativeSources
      .filter(({ text }) => staticImport.test(text))
      .map(({ relative }) => relative);

    expect(importers).toEqual([
      "price-dashboard/default-item-lifecycle-client.ts",
    ]);
    expect(staticImporters).toEqual([]);
  });

  it("decides on the literal the bundler replaces, before it names the stand-in", () => {
    const client = sourceOf(
      join(DASHBOARD_ROOT, "default-item-lifecycle-client.ts"),
    );

    expect(client).toMatch(/process\.env\.NODE_ENV\s*===\s*"production"/);
    expect(client).not.toMatch(/isProductionBuild/);
    expect(client.indexOf("production")).toBeLessThan(
      client.indexOf("await import("),
    );
  });
});
