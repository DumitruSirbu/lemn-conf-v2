// Adversarial QA: production fabricates no price and no sample. The publish sample and its client are test support, so
// nothing the app is built from may name them or reach into tests/, from a browser module or a server one, however far the
// imports go.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SAMPLE_MODULE = /(^|\/)publish-sample[^/]*\.tsx?$/;
const OTHER_INVENTED = /(^|\/)shipped-price-book\.tsx?$/;
const NAMES_A_SAMPLE_OR_TESTS =
  /(from|import)\s*\(?\s*["'][^"']*(publish-sample|\/tests\/|^tests\/|@\/tests)/;

const modules = filesUnder(SOURCE_ROOT)
  .filter((path) => /\.tsx?$/.test(path))
  .map((path) => path.slice(SOURCE_ROOT.length + 1));

describe("what the app is built from", () => {
  it("has modules to guard, and none of them is a sample", () => {
    expect(modules.length).toBeGreaterThan(200);
    expect(modules.filter((path) => SAMPLE_MODULE.test(path))).toEqual([]);
  });

  it("imports no sample, and nothing from tests/, in any module of the app", () => {
    const importers = modules.filter((path) =>
      NAMES_A_SAMPLE_OR_TESTS.test(
        readFileSync(join(SOURCE_ROOT, path), "utf8"),
      ),
    );

    expect(importers).toEqual([]);
  });

  it("reaches no sample or invented price from the publish page, the version page or the pages that read for them", () => {
    const entries = [
      "price-dashboard/publish-page.tsx",
      "price-dashboard/version-detail.tsx",
      "price-dashboard/publish-source.ts",
      "price-dashboard/use-publish-desk.ts",
      "price-dashboard/fetching-publish-client.ts",
      "lib/server/staff/staff-page.ts",
    ];

    const leaks = entries.flatMap((entry) =>
      importClosureOf(entry)
        .filter(
          (module) => SAMPLE_MODULE.test(module) || OTHER_INVENTED.test(module),
        )
        .map((module) => `${entry} -> ${module}`),
    );

    expect(leaks).toEqual([]);
  });

  it("reaches no sample from any module of the app under src/app, the routes and pages a build ships", () => {
    const entries = modules.filter((path) => path.startsWith("app/"));

    const leaks = entries.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) => SAMPLE_MODULE.test(module))
        .map((module) => `${entry} -> ${module}`),
    );

    expect(entries.length).toBeGreaterThan(20);
    expect(leaks).toEqual([]);
  });
});
