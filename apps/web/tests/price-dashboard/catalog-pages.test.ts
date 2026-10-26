import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUILT_CATALOG_PAGES,
  catalogPagesOpenTo,
} from "@/price-dashboard/catalog-pages";
import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { CATALOG_PAGES } from "@/staff/staff-paths";

const CATALOG_DIRECTORY = join(
  import.meta.dirname,
  "../../src/app/[locale]/staff/catalog",
);

describe("which catalog pages the menu may link to", () => {
  it.each(BUILT_CATALOG_PAGES)(
    "has a page for %s: the menu never links to an address that answers 404",
    (page) => {
      expect(existsSync(join(CATALOG_DIRECTORY, page, "page.tsx"))).toBe(true);
    },
  );

  it("names only pages of the family", () => {
    expect(
      BUILT_CATALOG_PAGES.every((page) => CATALOG_PAGES.includes(page)),
    ).toBe(true);
  });

  it("lists the built pages to a person who may edit prices", () => {
    expect(catalogPagesOpenTo({ canEditPrices: true })).toEqual(
      BUILT_CATALOG_PAGES,
    );
  });

  it("lists none to a person who may not", () => {
    expect(catalogPagesOpenTo({ canEditPrices: false })).toEqual([]);
  });

  it("lists exactly the pages a wave has built, in the order it gave them", () => {
    expect(
      catalogPagesOpenTo({
        canEditPrices: true,
        builtPages: ["cabinets", "publish"],
      }),
    ).toEqual(["cabinets", "publish"]);
  });
});

describe("the list's source, the seam lane R fills", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("claims no price in a production build: until the real read exists it answers unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(await readCabinetList()).toEqual({ kind: "unavailable" });
  });

  it("answers the invented sample in any other build, so a developer sees a populated list", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const read = await readCabinetList();

    expect(read.kind).toBe("ready");
  });
});
