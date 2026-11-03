// Reads the sources for what must never reach a browser or a production build: the invented counts, the server-only source,
// and the dependency direction between the screens and the modules every kind of item shares. These are absence claims over
// source text, each with the rule it guards named in its title; the behaviour itself is proved by the tests of the source.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const DASHBOARD_ROOT = join(SOURCE_ROOT, "price-dashboard");
const USE_CLIENT = /^\s*["']use client["']/m;
const SERVER_ONLY_FIRST = 'import "server-only";';

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
  it("has the materials screens' client modules to look at", () => {
    expect(clientModules).toEqual(
      expect.arrayContaining([
        "price-dashboard/material-list.tsx",
        "price-dashboard/material-edit.tsx",
        "price-dashboard/use-material-desk.ts",
        "price-dashboard/use-material-usage.ts",
      ]),
    );
  });

  it("reaches no invented count and no server-only source from any client module, however far its imports go", () => {
    const leaks = clientModules.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) =>
          /(^|\/)material-(sample|source)\.tsx?$/.test(module),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(leaks).toEqual([]);
  });

  it("names the invented counts from the source and from nothing else, in a dynamic import", () => {
    const importers = relativeSources
      .filter(({ text }) => /material-sample["']/.test(text))
      .map(({ relative }) => relative);
    const source = sourceOf(join(DASHBOARD_ROOT, "material-source.ts"));

    expect(importers).toEqual(["price-dashboard/material-source.ts"]);
    expect(source).toMatch(/await import\("\.\/material-sample"\)/);
    expect(source).not.toMatch(/^\s*import\s[^;]*material-sample/m);
  });

  it("is named by the list's page and a material's page and by nothing else, the source that is server-only", () => {
    const importers = relativeSources
      .filter(({ text }) => /material-source["']/.test(text))
      .map(({ relative }) => relative)
      .sort();

    expect(importers).toEqual([
      "app/[locale]/staff/catalog/materials/[tierId]/page.tsx",
      "app/[locale]/staff/catalog/materials/page.tsx",
    ]);
  });

  it("opens with the server-only import, before any other import can run, and a copy without it is caught", () => {
    const text = readFileSync(
      join(DASHBOARD_ROOT, "material-source.ts"),
      "utf8",
    );

    expect(text.startsWith(SERVER_ONLY_FIRST)).toBe(true);
    expect(
      text.replace(SERVER_ONLY_FIRST, "").startsWith(SERVER_ONLY_FIRST),
    ).toBe(false);
  });
});

describe("what the materials screens may read", () => {
  it("reads the dashboard's state through the one admitted read, and writes nothing from a render", () => {
    const source = sourceOf(join(DASHBOARD_ROOT, "material-source.ts"));

    expect(source).toMatch(/readStateOrNothing/);
    expect(source).not.toMatch(
      /readDashboardForStaff|touchCurrentSession|commitAuditRow|readDashboardStateForAdmittedPage/,
    );
  });

  it("reads no usage in a production build: the figure of one is never a default of the usage hook", () => {
    const hook = sourceOf(join(DASHBOARD_ROOT, "use-material-usage.ts"));

    expect(hook).not.toMatch(/(designCount|count)\s*(\?\?|\|\|)\s*\d/);
    expect(hook).not.toMatch(/designCount\s*:\s*\d/);
  });
});

describe("the dependency direction", () => {
  it("never runs from a module every kind of item shares to the materials screens", () => {
    const shared = [
      "price-dashboard/item-dialogs.tsx",
      "price-dashboard/use-item-availability.ts",
      "price-dashboard/item-flows.ts",
      "price-dashboard/item-lifecycle-model.ts",
      "price-dashboard/item-lifecycle-client.ts",
      "price-dashboard/item-lifecycle-words.ts",
      "price-dashboard/item-lifecycle-stand-in-client.ts",
      "price-dashboard/default-item-lifecycle-client.ts",
    ];

    const upward = shared.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) =>
          /price-dashboard\/(material|use-material)/.test(module),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(upward).toEqual([]);
  });

  it("names no hardware in the materials screens, which share with the hardware screens only what is for every kind of item", () => {
    const screens = relativeSources
      .filter(({ relative }) =>
        /^price-dashboard\/(material|use-material|item-row-menu)/.test(
          relative,
        ),
      )
      .filter(({ relative }) => !relative.endsWith(".css"));

    const offenders = screens
      .filter(({ text }) =>
        /hardware-(model|names|paths|list|edit|create|parts)|use-hardware/.test(
          text,
        ),
      )
      .map(({ relative }) => relative);

    expect(screens.length).toBeGreaterThan(8);
    expect(offenders).toEqual([]);
  });
});
