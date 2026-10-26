// Adversarial QA of M10 wave U1, the guards that read the sources: the invented cabinet list can reach nobody in a
// production build, the dashboard's code never rounds or re-formats a price the way the customer's figure does, every
// address the menu links to has a page and the proxy knows it, and the phone's bar keeps its focus order.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { BUILT_CATALOG_PAGES } from "@/price-dashboard/catalog-pages";
import { CATALOG_PAGES } from "@/staff/staff-paths";

import { declarationsFor } from "../support/css-declarations";
import { filesUnder } from "../support/files-under";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const DASHBOARD_ROOT = join(SOURCE_ROOT, "price-dashboard");
const CATALOG_ROUTES = join(SOURCE_ROOT, "app/[locale]/staff/catalog");

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sourceOf = (path: string): string =>
  withoutComments(readFileSync(path, "utf8"));

describe("the invented cabinet list can reach nobody in a production build", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is imported by the list's source and by no other module of the application", () => {
    const importers = filesUnder(SOURCE_ROOT)
      .filter((path) => /cabinet-list-sample["']/.test(sourceOf(path)))
      .map((path) => path.slice(SOURCE_ROOT.length + 1));

    expect(importers).toEqual(["price-dashboard/cabinet-list-source.ts"]);
  });

  it("decides on the literal the bundler replaces, so a production build holds the branch and not the sample", () => {
    const source = sourceOf(join(DASHBOARD_ROOT, "cabinet-list-source.ts"));

    expect(source).toMatch(/process\.env\.NODE_ENV\s*===\s*"production"/);
    expect(source).not.toMatch(/process\.env\[/);
    expect(source).not.toMatch(/NEXT_PUBLIC|VERCEL|LEMNARIA_/);
  });

  it("answers unavailable in production, every time, however often it is asked", async () => {
    vi.stubEnv("NODE_ENV", "production");

    for (let ask = 0; ask < 3; ask += 1) {
      expect(await readCabinetList()).toEqual({ kind: "unavailable" });
    }
  });

  it.each(["development", "test"])(
    "answers the sample in a %s build, which no deployed site is",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);

      expect((await readCabinetList()).kind).toBe("ready");
    },
  );
});

describe("the dashboard's code never rounds or re-formats a price", () => {
  const dashboardSources = filesUnder(DASHBOARD_ROOT).map((path) => ({
    name: path.slice(DASHBOARD_ROOT.length + 1),
    source: sourceOf(path),
  }));

  it("reads at least the files the wave added", () => {
    const names = dashboardSources.map((file) => file.name);

    expect(names).toContain("format-lei.ts");
    expect(names).toContain("cabinet-list-rows.tsx");
  });

  it.each(dashboardSources.map((file) => [file.name, file.source]))(
    "%s names no rounding verb, no locale number formatter and no float parse",
    (_name, source) => {
      expect(source).not.toMatch(/Math\.(round|ceil|floor|trunc)\b/);
      expect(source).not.toMatch(/Intl\.NumberFormat|toLocaleString|toFixed/);
      expect(source).not.toMatch(/parseFloat|Number\.parseFloat/);
    },
  );
});

describe("every address the menu links to has a page, and the proxy knows every page that exists", () => {
  const routeDirectories = readdirSync(CATALOG_ROUTES, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name);

  it("has a page.tsx in each directory the menu links to", () => {
    for (const page of BUILT_CATALOG_PAGES) {
      expect(existsSync(join(CATALOG_ROUTES, page, "page.tsx")), page).toBe(
        true,
      );
    }
  });

  it("holds no route directory the proxy would not mark: each is a page of the closed list", () => {
    for (const directory of routeDirectories) {
      expect(CATALOG_PAGES as readonly string[], directory).toContain(
        directory,
      );
    }
  });

  it("keeps the proxy's own list of sections equal to the plan's closed list, in the same order", () => {
    const proxySource = readFileSync(join(SOURCE_ROOT, "proxy.ts"), "utf8");
    const list =
      /STAFF_CATALOG_SECTIONS: readonly string\[\] = \[([^\]]*)\]/.exec(
        proxySource,
      );
    const spelled = [...(list?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(spelled).toEqual([...CATALOG_PAGES]);
  });
});

describe("the staff bar on a phone", () => {
  const css = readFileSync(join(SOURCE_ROOT, "staff/staff.module.css"), "utf8");

  it("does not reorder the pending-prices link on screen: Tab must reach it where the eye does (WCAG 2.4.3)", () => {
    expect(declarationsFor(css, "pendingChip", "order")).toEqual([]);
  });

  it("keeps every link and button it draws at least a touch target tall", () => {
    for (const control of ["pendingChip", "navItem"]) {
      const [height] = declarationsFor(css, control, "min-height").map(
        (declaration) => declaration.value,
      );
      const pixels =
        height === "var(--touch-target)"
          ? 44
          : Number.parseFloat(height ?? "0");

      expect(pixels, control).toBeGreaterThanOrEqual(44);
    }
  });
});
