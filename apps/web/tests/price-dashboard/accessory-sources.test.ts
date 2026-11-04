// Reads the sources for what must never reach a browser or a production build from the accessory screens: the invented counts
// and the server-only source. These are absence claims over source text, each with the rule it guards named in its title;
// the behaviour itself is proved by the tests of the source and of the clients.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { codeOf, importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const ACCESSORY_SOURCE = "price-dashboard/accessory-source.ts";
const USE_CLIENT = /^\s*["']use client["']/m;

const allSources = filesUnder(SOURCE_ROOT).map((path) =>
  relative(SOURCE_ROOT, path),
);
const textOf = (path: string) => readFileSync(join(SOURCE_ROOT, path), "utf8");
const clientModules = allSources.filter((path) =>
  USE_CLIENT.test(textOf(path).slice(0, 400)),
);

describe("the accessory source", () => {
  it("opens with the server-only import, before any other import can run", () => {
    const firstImport = /^import\s.*$/m.exec(textOf(ACCESSORY_SOURCE))?.[0];

    expect(firstImport).toBe('import "server-only";');
  });

  it("is named by no module that has a 'use client' line, nor by any module outside the three accessory pages", () => {
    const namers = allSources.filter(
      (path) =>
        path !== ACCESSORY_SOURCE && codeOf(path).includes("accessory-source"),
    );

    expect(namers.some((path) => USE_CLIENT.test(textOf(path)))).toBe(false);
    expect(namers.sort()).toEqual([
      "app/[locale]/staff/catalog/accessories/[accessoryId]/page.tsx",
      "app/[locale]/staff/catalog/accessories/new/page.tsx",
      "app/[locale]/staff/catalog/accessories/page.tsx",
    ]);
  });
});

describe("what a browser is sent", () => {
  it("has the accessory screens' client modules to look at", () => {
    expect(clientModules).toContain("price-dashboard/accessory-list.tsx");
    expect(clientModules).toContain("price-dashboard/accessory-edit.tsx");
    expect(clientModules).toContain("price-dashboard/accessory-create.tsx");
    expect(clientModules).toContain("price-dashboard/use-accessory-desk.ts");
  });

  it("reaches no invented count and no server-only source from any client module, however far its imports go", () => {
    const leaks = clientModules.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) =>
          /(^|\/)accessory-(sample|source)\.tsx?$/.test(module),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(leaks).toEqual([]);
  });

  it("names the invented counts from the source and from nothing else, in a dynamic import", () => {
    const importers = allSources.filter((path) =>
      /accessory-sample["']/.test(codeOf(path)),
    );
    const source = codeOf(ACCESSORY_SOURCE);

    expect(importers).toEqual([ACCESSORY_SOURCE]);
    expect(source).toMatch(/await import\("\.\/accessory-sample"\)/);
    expect(source).not.toMatch(/^\s*import\s[^;]*accessory-sample/m);
  });

  it("writes no count in a module a browser loads: a number beside `designCount` lives in the sample alone", () => {
    const writers = allSources.filter(
      (path) =>
        path.includes("accessory") && /designCount\s*:\s*\d/.test(codeOf(path)),
    );

    expect(writers).toEqual(["price-dashboard/accessory-sample.ts"]);
  });
});

describe("the modules every kind of item shares", () => {
  it("name no screen of the accessories, which are told by the item they are given", () => {
    const shared = [
      "price-dashboard/item-dialogs.tsx",
      "price-dashboard/item-flows.ts",
      "price-dashboard/item-lifecycle-model.ts",
      "price-dashboard/use-item-availability.ts",
    ];

    for (const path of shared) {
      expect(codeOf(path), path).not.toMatch(
        /accessory-(model|list|edit|parts)/,
      );
    }
  });
});
