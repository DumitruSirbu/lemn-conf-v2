// What the hardware screens' source files may reach. The guards in `hardware-sources.test.ts` say "server-only" in a
// title and never read the line; the guards that allow the dashboard's server-side readers trust the files they name.
// Here: each opens with the line, a copy without it is caught, no module a browser loads is or reaches a server-only
// module, no customer page reaches the hardware source, the invented counts are written in one file only, and the
// modules meant for every kind of item name no kind of hardware.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { codeOf, importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const HARDWARE_SOURCE = "price-dashboard/hardware-source.ts";
const FIRST_IMPORT_IS_SERVER_ONLY = /^import\s+["']server-only["'];?\s*$/m;
const USE_CLIENT = /^\s*["']use client["']/m;

const allSources = filesUnder(SOURCE_ROOT).map((path) =>
  relative(SOURCE_ROOT, path),
);
const textOf = (path: string) => readFileSync(join(SOURCE_ROOT, path), "utf8");
const isMarkedServerOnly = (path: string) =>
  FIRST_IMPORT_IS_SERVER_ONLY.test(textOf(path));

describe("the hardware source", () => {
  it("opens with the server-only import, before any other import can run", () => {
    const firstImport = /^import\s.*$/m.exec(textOf(HARDWARE_SOURCE))?.[0];

    expect(firstImport).toBe('import "server-only";');
  });

  it("is caught by the check above when the import is taken out, so the check can fail", () => {
    const stripped = textOf(HARDWARE_SOURCE).replace(
      FIRST_IMPORT_IS_SERVER_ONLY,
      "",
    );

    expect(FIRST_IMPORT_IS_SERVER_ONLY.test(stripped)).toBe(false);
    expect(/^import\s.*$/m.exec(stripped)?.[0]).not.toBe(
      'import "server-only";',
    );
  });

  it("is named by no module that has a 'use client' line, nor by any module outside the three hardware pages", () => {
    const namers = allSources.filter(
      (path) =>
        path !== HARDWARE_SOURCE && codeOf(path).includes("hardware-source"),
    );

    expect(namers.some((path) => USE_CLIENT.test(textOf(path)))).toBe(false);
    expect(namers.sort()).toEqual([
      "app/[locale]/staff/catalog/hardware/[tierId]/page.tsx",
      "app/[locale]/staff/catalog/hardware/new/page.tsx",
      "app/[locale]/staff/catalog/hardware/page.tsx",
    ]);
  });
});

describe("the read of the state for an admitted page", () => {
  const ADMITTED_STATE_READ = "price-dashboard/admitted-state-read.ts";

  it("opens with the server-only import, and is named by the sources that read for a page and by nothing else", () => {
    const firstImport = /^import\s.*$/m.exec(textOf(ADMITTED_STATE_READ))?.[0];
    const namers = allSources.filter(
      (path) =>
        path !== ADMITTED_STATE_READ &&
        codeOf(path).includes("admitted-state-read"),
    );

    expect(firstImport).toBe('import "server-only";');
    expect(namers.sort()).toEqual([
      "price-dashboard/cabinet-list-source.ts",
      "price-dashboard/item-page-read.ts",
    ]);
  });
});

describe("what a browser loads", () => {
  const clientModules = allSources.filter((path) =>
    USE_CLIENT.test(textOf(path)),
  );

  it("has client modules to look at, the hardware screens' among them", () => {
    expect(clientModules).toEqual(
      expect.arrayContaining([
        "price-dashboard/hardware-list.tsx",
        "price-dashboard/hardware-edit.tsx",
        "price-dashboard/hardware-create.tsx",
        "price-dashboard/use-hardware-creation.ts",
        "price-dashboard/use-hardware-rate-editing.ts",
        "price-dashboard/use-hardware-desk.ts",
      ]),
    );
  });

  it("reaches no module marked server-only and nothing under lib/server, from any client module of the dashboard, however far its imports go", () => {
    const leaks = clientModules
      .filter((path) => path.startsWith("price-dashboard/"))
      .flatMap((entry) =>
        importClosureOf(entry)
          .filter(
            (module) =>
              isMarkedServerOnly(module) || module.startsWith("lib/server/"),
          )
          .map((module) => `${entry} -> ${module}`),
      );

    expect(leaks).toEqual([]);
  });

  it("holds no invented usage count in the closure of any page a customer can open", () => {
    const customerPages = allSources.filter(
      (path) =>
        path.startsWith("app/") &&
        /(^|\/)(page|layout|route)\.tsx?$/.test(path) &&
        !path.includes("/staff/") &&
        !path.startsWith("app/api/staff/"),
    );

    const leaks = customerPages.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) =>
          /price-dashboard\/(hardware-sample|hardware-source|material-sample|material-source|item-lifecycle-stand-in-client)\.tsx?$/.test(
            module,
          ),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(customerPages.length).toBeGreaterThan(5);
    expect(leaks).toEqual([]);
  });

  it("does not reach the stand-in's counts from the stand-in: it holds no figure of its own, so a build that includes it names no count", () => {
    const closure = importClosureOf(
      "price-dashboard/item-lifecycle-stand-in-client.ts",
    );

    expect(closure.filter((module) => /sample|source/.test(module))).toEqual(
      [],
    );
    expect(
      codeOf("price-dashboard/item-lifecycle-stand-in-client.ts"),
    ).not.toMatch(/designCount\s*:\s*\d/);
  });
});

describe("the invented counts", () => {
  it("are written as a number in one file for each kind of item, which is the one its server-only source loads outside a production build", () => {
    const writers = allSources.filter((path) =>
      /designCount\s*:\s*\d/.test(codeOf(path)),
    );

    expect(writers).toEqual([
      "price-dashboard/accessory-sample.ts",
      "price-dashboard/hardware-sample.ts",
      "price-dashboard/material-sample.ts",
    ]);
  });

  it("are not a default of any seam in the lifecycle's modules: a missing count is never a number", () => {
    const lifecycleModules = allSources.filter((path) =>
      /price-dashboard\/(item-lifecycle|item-flows|use-item-availability|use-hardware-desk|use-accessory-desk|use-material-desk|use-material-usage|default-item)/.test(
        path,
      ),
    );

    const offenders = lifecycleModules.filter((path) =>
      /(designCount|count)\s*(\?\?|\|\|)\s*\d/.test(codeOf(path)),
    );

    expect(lifecycleModules.length).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });
});

describe("the modules meant for every kind of item", () => {
  const kindAgnostic = [
    "price-dashboard/item-dialogs.tsx",
    "price-dashboard/use-item-availability.ts",
    "price-dashboard/item-flows.ts",
    "price-dashboard/item-lifecycle-model.ts",
    "price-dashboard/item-lifecycle-client.ts",
    "price-dashboard/item-lifecycle-words.ts",
    "price-dashboard/item-lifecycle-stand-in-client.ts",
    "price-dashboard/default-item-lifecycle-client.ts",
  ];

  it.each(kindAgnostic)(
    "%s names no hardware: no tier, no class, no mechanism, no hardware kind",
    (path) => {
      expect(codeOf(path)).not.toMatch(
        /hardware|["']tierId["']|perHinge|perDrawer|perLift|HardwareTier|feronerie/i,
      );
    },
  );

  it("imports nothing of the hardware screens: the dependency runs from a screen to the dialogs and never back", () => {
    const upward = kindAgnostic.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) =>
          /price-dashboard\/(hardware|use-hardware)/.test(module),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(upward).toEqual([]);
  });
});
