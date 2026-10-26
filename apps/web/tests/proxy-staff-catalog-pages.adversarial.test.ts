// Adversarial QA of M10 wave U1's `proxy.ts` family: no address may borrow the staff pages' headers unless, once the URL
// parser has normalised it, it is exactly `/{locale}/staff/catalog/{section}` or one id below it; and the matcher entry
// the wave added must stay the one narrow shape. Over-marking would be harmless, but the contract is the strict form.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { routing } from "../src/i18n/routing";
import { config, proxy } from "../src/proxy";
import { CATALOG_PAGES } from "../src/staff/staff-paths";

const ORIGIN = "https://lemnaria.test";

function isMarkedAsStaffPage(path: string): boolean {
  const answer = proxy(new NextRequest(`${ORIGIN}${path}`));
  if (answer instanceof Promise) throw new Error("the interceptor waited");
  return (
    answer.headers.get("x-robots-tag") === "noindex, nofollow" &&
    answer.headers.get("cache-control") === "private, no-store"
  );
}

/** What the strict family is, written without the interceptor's own helpers: exact segments, case and spelling. */
function isStrictCatalogAddress(pathname: string): boolean {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const [locale, family, catalog, section, ...rest] = segments;
  return (
    routing.locales.some((served) => served === locale) &&
    family === "staff" &&
    catalog === "catalog" &&
    CATALOG_PAGES.some((page) => page === section) &&
    rest.length <= 1
  );
}

const SEGMENT_POOL = [
  ...routing.locales,
  "RO",
  "xx",
  "staff",
  "Staff",
  "catalog",
  "Catalog",
  "%63atalog",
  "...",
  ".",
  "..",
  "%2e%2e",
  "%2E%2E",
  "%2f",
  "%5c",
  "%00",
  "%252e%252e",
  "..;",
  "cabinets;x",
  "cabinets.",
  "cabinets.json",
  "с" + "abinets",
  "ｃabinets",
  "kitchens",
  "audit",
  "prices",
  "team",
  "api",
  "x".repeat(300),
  "cabinet.base-cabinet",
  ...CATALOG_PAGES,
  "",
];

const pathArbitrary = fc
  .array(fc.constantFrom(...SEGMENT_POOL), { minLength: 0, maxLength: 7 })
  .map((segments) => `/${segments.join("/")}`);

describe("the interceptor's catalog family is exactly its strict spelling", () => {
  propertyTest.prop([pathArbitrary], { numRuns: 4000 })(
    "marks an address as a staff page only when the normalised address is a locale, staff, catalog, a section and at most one id",
    (path) => {
      const { pathname } = new URL(`${ORIGIN}${path}`);
      const looksLikeCatalog = pathname.includes("catalog");
      fc.pre(looksLikeCatalog);

      expect(isMarkedAsStaffPage(path), `${path} -> ${pathname}`).toBe(
        isStrictCatalogAddress(pathname),
      );
    },
  );

  it.each([
    "/ro//staff/catalog/cabinets/",
    "/ro/staff/catalog/cabinets/..",
    "/ro/staff/catalog/cabinets/../hardware",
    "/ro/staff/catalog/cabinets/%2e%2e/audit",
    "/ro/staff/catalog/cabinets%00",
    "/ro/staff/catalog/cabinets%0a",
    "/ro/staff/catalog/cabinets%20",
    "/ro/staff/catalog/\\cabinets",
    "/ro/staff/catalog/cabinets\\x",
    "/ro/staff/catalog/сabinets",
    "/ro/staff/catalog/ｃabinets",
    "/ro/staff/catalog/cabinets/x/y",
    "/ro/staff/catalog/cabinets/x/y/z",
    "/ro/staff/catalog/%2e/cabinets",
  ])("keeps %s to the strict reading of its normalised address", (path) => {
    const { pathname } = new URL(`${ORIGIN}${path}`);

    expect(isMarkedAsStaffPage(path), pathname).toBe(
      isStrictCatalogAddress(pathname),
    );
  });

  it("reads a dot-dot segment as the parser does: a way out of the family lands on the page it names", () => {
    expect(isMarkedAsStaffPage("/ro/staff/catalog/../kitchens")).toBe(true);
  });

  it("answers a catalog address the same whatever query or fragment follows it", () => {
    for (const suffix of ["?next=/ro/account", "?a=%00", "#x", "?"]) {
      expect(isMarkedAsStaffPage(`/ro/staff/catalog/hardware${suffix}`)).toBe(
        true,
      );
      expect(isMarkedAsStaffPage(`/ro/staff/catalog/nope${suffix}`)).toBe(
        false,
      );
    }
  });

  it("marks nothing in a section no page of the family has, whatever else the other staff pages are called", () => {
    for (const section of ["kitchens", "audit", "team", "presets", "prices"]) {
      for (const locale of routing.locales) {
        expect(
          isMarkedAsStaffPage(`/${locale}/staff/catalog/${section}`),
          `${locale}/${section}`,
        ).toBe(false);
        expect(
          isMarkedAsStaffPage(`/${locale}/staff/catalog/${section}/x`),
        ).toBe(false);
      }
    }
  });
});

describe("the matcher entry the wave added", () => {
  it("is one literal with a named section and a named id, no wildcard and no regular expression", () => {
    const entries = config.matcher.filter((entry) => entry.includes("catalog"));

    expect(entries).toEqual(["/:locale/staff/catalog/:section/:id"]);
    expect(entries[0]).not.toMatch(/[*+?()[\]{}|\\]/);
  });

  it("adds no entry for the bare section: the generic entry already carries it, and a wider one would reach static files", () => {
    expect(config.matcher).not.toContain("/:locale/staff/catalog/:path*");
    expect(config.matcher).not.toContain("/:locale/staff/:path*");
    expect(config.matcher).not.toContain("/:locale/staff/catalog/:section");
  });
});
