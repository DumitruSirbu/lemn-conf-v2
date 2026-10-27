// Adversarial QA of M10 wave U5: the pending-price count must be one number across the pages that draw it, and the invented
// prices must not travel to a browser. `publish-source.test.ts` only looks at the direct importers of the sample and
// `staff-pending-price-count.test.ts` only at what the staff page is handed; neither compares the number two pages show on
// one build, nor follows a client component's imports to the sample.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_CABINET_LIST } from "@/price-dashboard/cabinet-list-sample";
import { pendingPriceCountOf } from "@/price-dashboard/cabinet-list-model";
import { readPendingPriceCount } from "@/price-dashboard/publish-source";

import { filesUnder } from "../support/files-under";
import { importClosureOf } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const USE_CLIENT = /^\s*["']use client["']/m;
const SERVER_ONLY_OR_INVENTED =
  /(^|\/)(publish-sample|publish-source|cabinet-list-sample|cabinet-list-source|shipped-price-book)\.tsx?$|^lib\/server\//;

describe("the count of waiting prices on one build", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is the same number on the staff pages' frame (kitchens, audit) and on the cabinet list's frame", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const framesCount = await readPendingPriceCount();
    const cabinetListCount = pendingPriceCountOf(SAMPLE_CABINET_LIST.draft);

    expect(cabinetListCount).toBe(framesCount);
  });
});

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
