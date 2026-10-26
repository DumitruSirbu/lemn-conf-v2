import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { BUILT_CATALOG_PAGES } from "@/price-dashboard/catalog-pages";
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
});

describe("the list's source", () => {
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
