// Adversarial QA of M10 wave U6, the guards that read the sources: the invented defaults reach no browser, the screen
// uses only words the catalogues already hold in both languages, the stylesheet keeps its targets and its order, and the
// menu entry stands where the closed list puts it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readKitchenDefaults } from "@/price-dashboard/kitchen-defaults-source";
import { BUILT_CATALOG_PAGES } from "@/price-dashboard/catalog-pages";
import { CATALOG_PAGES } from "@/staff/staff-paths";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { declarationsFor } from "../support/css-declarations";
import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const DASHBOARD_ROOT = join(SOURCE_ROOT, "price-dashboard");
const USE_CLIENT = /^\s*["']use client["']/m;
const INVENTED_DEFAULTS = /(^|\/)kitchen-defaults-(sample|source)\.tsx?$/;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sourceOf = (path: string): string =>
  withoutComments(readFileSync(path, "utf8"));

describe("what a browser is sent", () => {
  const clientModules = filesUnder(SOURCE_ROOT)
    .filter((path) => USE_CLIENT.test(readFileSync(path, "utf8").slice(0, 400)))
    .map((path) => path.slice(SOURCE_ROOT.length + 1));

  it("has the defaults screen's client modules to look at", () => {
    expect(clientModules).toContain(
      "price-dashboard/kitchen-defaults-page.tsx",
    );
    expect(clientModules).toContain("price-dashboard/use-kitchen-defaults.ts");
  });

  it("reaches no invented default and no defaults source from any client module, however far its imports go", () => {
    const leaks = clientModules.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) => INVENTED_DEFAULTS.test(module))
        .map((module) => `${entry} -> ${module}`),
    );

    expect(leaks).toEqual([]);
  });

  it("names the invented defaults from the page's source and the client's lazy stand-in, and from nothing else", () => {
    const importers = filesUnder(SOURCE_ROOT)
      .filter((path) => /kitchen-defaults-sample["']/.test(sourceOf(path)))
      .map((path) => path.slice(SOURCE_ROOT.length + 1));

    expect(importers).toEqual([
      "price-dashboard/kitchen-defaults-client.ts",
      "price-dashboard/kitchen-defaults-source.ts",
    ]);
  });

  it("is read through the source by the page route and by nothing else", () => {
    const importers = filesUnder(SOURCE_ROOT)
      .filter((path) => /kitchen-defaults-source["']/.test(sourceOf(path)))
      .map((path) => path.slice(SOURCE_ROOT.length + 1));

    expect(importers).toEqual(["app/[locale]/staff/catalog/defaults/page.tsx"]);
  });

  it("decides on the literal the bundler replaces, in the source and in the client", () => {
    for (const file of [
      "kitchen-defaults-source.ts",
      "kitchen-defaults-client.ts",
    ]) {
      const source = sourceOf(join(DASHBOARD_ROOT, file));

      expect(source, file).toMatch(
        /process\.env\.NODE_ENV\s*===\s*"production"/,
      );
      expect(source, file).not.toMatch(/process\.env\[/);
      expect(source, file).not.toMatch(/NEXT_PUBLIC|VERCEL|LEMNARIA_/);
    }
  });
});

describe("the page's source in a production build", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers unavailable every time it is asked and loads no sample", async () => {
    vi.stubEnv("NODE_ENV", "production");

    for (let ask = 0; ask < 3; ask += 1) {
      expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
    }
  });
});

describe("the words the screen uses", () => {
  const screenFiles = [
    "kitchen-defaults-page.tsx",
    "kitchen-defaults-rows.tsx",
    "use-kitchen-defaults.ts",
  ];
  const keysUsed = [
    ...new Set(
      screenFiles.flatMap((file) =>
        [
          ...sourceOf(join(DASHBOARD_ROOT, file)).matchAll(
            /"((?:priceDashboard|panel|finish|priceBook)\.[A-Za-z0-9.-]+)"/g,
          ),
        ].map((match) => match[1] ?? ""),
      ),
    ),
  ];

  function lookUp(catalogue: object, key: string): unknown {
    return key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          typeof node === "object" && node !== null
            ? (node as Record<string, unknown>)[part]
            : undefined,
        catalogue,
      );
  }

  it("finds the keys it is meant to check", () => {
    expect(keysUsed).toContain("priceDashboard.defaults.appliesNote");
    expect(keysUsed).toContain("priceDashboard.defaults.colourReset");
    expect(keysUsed).toContain("priceDashboard.errors.saveFailed");
    expect(keysUsed.length).toBeGreaterThan(15);
  });

  it.each(keysUsed)(
    "%s is a sentence in the Romanian and in the Russian catalogue",
    (key) => {
      for (const [name, catalogue] of [
        ["ro", roMessages],
        ["ru", ruMessages],
      ] as const) {
        const value = lookUp(catalogue, key);

        expect(typeof value, `${name} ${key}`).toBe("string");
        expect(value, `${name} ${key}`).not.toBe("");
      }
    },
  );

  it("has the colour-reset sentence take the two names it is given, in both languages and nothing more", () => {
    for (const catalogue of [roMessages, ruMessages]) {
      const sentence = catalogue.priceDashboard.defaults.colourReset;

      expect(
        [...sentence.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
      ).toEqual(["replacementColour", "unavailableColour"]);
    }
    const rows = sourceOf(join(DASHBOARD_ROOT, "kitchen-defaults-rows.tsx"));
    expect(rows).toMatch(/unavailableColour:\s*nameOfFinish/);
    expect(rows).toMatch(/replacementColour:\s*nameOfFinish/);
  });

  it("writes no sentence of its own: no JSX text in the screen holds a letter", () => {
    for (const file of screenFiles) {
      const path = join(DASHBOARD_ROOT, file);
      const tree = ts.createSourceFile(
        file,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const words: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) {
          words.push(node.text.trim());
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);

      expect(words, file).toEqual([]);
    }
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(
    join(DASHBOARD_ROOT, "kitchen-defaults.module.css"),
    "utf8",
  );
  const globals = readFileSync(join(SOURCE_ROOT, "app/globals.css"), "utf8");

  it("defines the touch target at 44 px or more, the token every control reads", () => {
    const token = /--touch-target:\s*(\d+(?:\.\d+)?)px/.exec(globals);

    expect(Number.parseFloat(token?.[1] ?? "0")).toBeGreaterThanOrEqual(44);
  });

  it("gives no interactive class a smaller box than a target at any width", () => {
    const interactive = [
      "option",
      "optionFace",
      "colourInput",
      "primaryAction",
      "secondaryAction",
      "freeColour",
    ];
    for (const className of interactive) {
      for (const property of ["height", "min-height", "width", "min-width"]) {
        for (const { value, media } of declarationsFor(
          css,
          className,
          property,
        )) {
          const pixels =
            value === "var(--touch-target)" ? 44 : Number.parseFloat(value);

          expect(
            pixels,
            `${className} ${property} ${media}`,
          ).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

  it("keeps the order on screen the order in the document: no reversal, no placement by line or area, no order", () => {
    expect(css).not.toMatch(/(?<![-\w])order:/);
    expect(css).not.toMatch(/row-reverse|column-reverse/);
    expect(css).not.toMatch(/grid-(row|column|area)\b/);
    expect(css).not.toMatch(/grid-template-areas/);
    expect(css).not.toMatch(/position:\s*(fixed|sticky)/);
  });

  it("holds nothing that scrolls sideways or forces a width past a phone's", () => {
    expect(css).not.toMatch(/overflow(-x)?:\s*(auto|scroll)/);
    expect(css).not.toMatch(
      /(?<![-\w])width:\s*(?!var\(--touch-target\)|100%)\d{3,}px/,
    );
  });
});

describe("the menu entry", () => {
  it("stands after cabinets and before publishing in the closed list, as the plan orders the pages", () => {
    const order = CATALOG_PAGES.indexOf("defaults");

    expect(order).toBeGreaterThan(CATALOG_PAGES.indexOf("cabinets"));
    expect(order).toBeLessThan(CATALOG_PAGES.indexOf("publish"));
  });

  it("lists the built pages in the closed list's order and no page twice", () => {
    const positions = BUILT_CATALOG_PAGES.map((page) =>
      CATALOG_PAGES.indexOf(page),
    );

    expect(BUILT_CATALOG_PAGES).toContain("defaults");
    expect(new Set(BUILT_CATALOG_PAGES).size).toBe(BUILT_CATALOG_PAGES.length);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions).not.toContain(-1);
  });
});
