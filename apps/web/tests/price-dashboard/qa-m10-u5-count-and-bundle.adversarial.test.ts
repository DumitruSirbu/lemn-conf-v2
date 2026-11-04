// Adversarial QA of M10 wave U5: the invented prices and the server-only price sources must not travel to a browser. The
// source test only looks at the direct importers of the sample; this follows a client component's imports to them.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const USE_CLIENT = /^\s*["']use client["']/m;
const SERVER_ONLY_OR_INVENTED =
  /(^|\/)(publish-sample|publish-sample-client|publish-source|cabinet-list-source|shipped-price-book)\.tsx?$|^lib\/server\//;

describe("what a browser is sent", () => {
  const clientModules = filesUnder(SOURCE_ROOT)
    .filter((path) => USE_CLIENT.test(readFileSync(path, "utf8").slice(0, 400)))
    .map((path) => path.slice(SOURCE_ROOT.length + 1));

  it("has client modules to look at", () => {
    expect(clientModules.length).toBeGreaterThan(50);
    expect(clientModules).toContain("price-dashboard/publish-page.tsx");
    expect(clientModules).toContain("price-dashboard/version-detail.tsx");
  });

  it("reaches no invented price, no server-only module and no price source from any client module, however far its imports go", () => {
    const leaks = clientModules.flatMap((entry) =>
      importClosureOf(entry)
        .filter((module) => SERVER_ONLY_OR_INVENTED.test(module))
        .map((module) => `${entry} -> ${module}`),
    );

    expect(leaks).toEqual([]);
  });
});
