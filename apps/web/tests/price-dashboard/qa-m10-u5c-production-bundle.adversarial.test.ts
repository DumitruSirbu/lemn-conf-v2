// Adversarial QA: production fabricates no price and no sample. Nothing in the app imports the publish sample or its
// client, from a browser module or a server one, however far the imports go; only the sample's own files and tests do.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SAMPLE_MODULE = /(^|\/)publish-sample[^/]*\.tsx?$/;
const OTHER_INVENTED = /(^|\/)shipped-price-book\.tsx?$/;

const modules = filesUnder(SOURCE_ROOT)
  .filter((path) => /\.tsx?$/.test(path))
  .map((path) => path.slice(SOURCE_ROOT.length + 1));
const sampleModules = modules.filter((path) => SAMPLE_MODULE.test(path));

describe("what the app is built from", () => {
  it("has sample modules to guard, the client of the sample among them", () => {
    expect(sampleModules).toContain("price-dashboard/publish-sample.ts");
    expect(sampleModules).toContain("price-dashboard/publish-sample-client.ts");
  });

  it("imports no sample module from a module that is not itself a sample", () => {
    const importers = modules
      .filter((path) => !SAMPLE_MODULE.test(path))
      .filter((path) => {
        const code = readFileSync(join(SOURCE_ROOT, path), "utf8");
        return /(from|import)\s*\(?\s*["'][^"']*publish-sample/.test(code);
      });

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
