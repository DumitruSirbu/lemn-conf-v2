import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { routing } from "../src/i18n/routing";
import {
  CONTENT_SECURITY_POLICY_MODE,
  cspResponseHeaderName,
} from "../src/lib/security-headers";
import { config, proxy } from "../src/proxy";
import { CATALOG_PAGES } from "../src/staff/staff-paths";

/**
 * The price dashboard's pages (`/{locale}/staff/catalog/{section}` and one item below it) hold the manufacturer's prices,
 * so each is never indexed and never cached and names no third-party frame, as every staff page is. A path written any
 * other way (case, escape, locale, length, an unknown section) is not one and must not borrow the headers (ADR 0173
 * P-L3-2: the encoded-segment and case probe, re-run on every new path).
 */

const ORIGIN = "https://lemnaria.test";
const LIVE_POLICY_HEADER = cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE);
const ITEM_ID = "cabinet.base-cabinet";

function respondTo(path: string) {
  const answer = proxy(new NextRequest(new URL(path, ORIGIN)));
  if (answer instanceof Promise) {
    throw new Error("the interceptor made a request here wait for a promise");
  }
  return answer;
}

function isMarkedAsStaffPage(path: string): boolean {
  const response = respondTo(path);
  return (
    response.headers.get("x-robots-tag") === "noindex, nofollow" &&
    response.headers.get("cache-control") === "private, no-store"
  );
}

const reaches = (path: string): boolean =>
  unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` });

describe.each(routing.locales)("the catalog pages in locale %s", (locale) => {
  it.each(CATALOG_PAGES)("%s is never indexed and never cached", (section) => {
    expect(isMarkedAsStaffPage(`/${locale}/staff/catalog/${section}`)).toBe(
      true,
    );
  });

  it.each(CATALOG_PAGES)(
    "one item of %s carries the same headers",
    (section) => {
      expect(
        isMarkedAsStaffPage(`/${locale}/staff/catalog/${section}/${ITEM_ID}`),
      ).toBe(true);
    },
  );

  it("names no third-party frame, and keeps the site's policy", () => {
    const policy =
      respondTo(`/${locale}/staff/catalog/cabinets`).headers.get(
        LIVE_POLICY_HEADER,
      ) ?? "";

    expect(policy).toMatch(/default-src 'self'/);
    expect(/frame-src ([^;]+)/.exec(policy)?.[1]).toBe("'none'");
  });

  it("does not send a token page's no-referrer: no catalog page reads a token", () => {
    expect(
      respondTo(`/${locale}/staff/catalog/cabinets`).headers.get(
        "referrer-policy",
      ),
    ).toBeNull();
  });

  it.each([
    ["with a trailing slash", `/${locale}/staff/catalog/cabinets/`],
    ["with a query", `/${locale}/staff/catalog/cabinets?q=sertare`],
    ["with a fragment", `/${locale}/staff/catalog/publish#a`],
    ["an item with a trailing slash", `/${locale}/staff/catalog/cabinets/x/`],
  ])("still gets the headers %s", (_label, path) => {
    expect(isMarkedAsStaffPage(path)).toBe(true);
  });
});

describe("the proxy's own list of catalog sections", () => {
  const proxySource = readFileSync(
    join(import.meta.dirname, "../src/proxy.ts"),
    "utf8",
  );
  const spelled = [
    ...(
      /STAFF_CATALOG_SECTIONS: readonly string\[\] = \[([^\]]*)\]/.exec(
        proxySource,
      )?.[1] ?? ""
    ).matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);

  it("holds every page of the family", () => {
    for (const page of CATALOG_PAGES) expect(spelled).toContain(page);
  });

  it("holds nothing that is not a page of the family", () => {
    for (const section of spelled) {
      expect(CATALOG_PAGES as readonly (string | undefined)[]).toContain(
        section,
      );
    }
  });
});

describe("what is not a catalog page", () => {
  it.each([
    ["the family's own address", "/ro/staff/catalog"],
    ["the family with a trailing slash", "/ro/staff/catalog/"],
    ["a section the family has no page for", "/ro/staff/catalog/prices"],
    ["a section in another case", "/ro/staff/catalog/CABINETS"],
    ["the family in another case", "/ro/staff/Catalog/cabinets"],
    ["an escaped family", "/ro/staff/%63atalog/cabinets"],
    ["an escaped section", "/ro/staff/catalog/%63abinets"],
    [
      "an item with a longer path",
      `/ro/staff/catalog/cabinets/${ITEM_ID}/more`,
    ],
    ["a path parameter on the section", "/ro/staff/catalog/cabinets;x=1"],
    ["an escaped slash after the section", "/ro/staff/catalog/cabinets%2Fabc"],
    ["a trailing dot on the section", "/ro/staff/catalog/cabinets."],
    ["an extension on the section", "/ro/staff/catalog/cabinets.json"],
    ["the family twice", "/ro/staff/catalog/catalog/cabinets"],
    ["a section with no locale", "/staff/catalog/cabinets"],
    ["an item with no locale", `/staff/catalog/cabinets/${ITEM_ID}`],
    ["a locale the site does not serve", "/xx/staff/catalog/cabinets"],
    ["a locale in another case", "/RO/staff/catalog/cabinets"],
    ["a locale written escaped", "/%72o/staff/catalog/cabinets"],
    ["the plural of the family", "/ro/staffs/catalog/cabinets"],
    ["the account family with a catalog section", "/ro/account/cabinets"],
    ["the API of the family", "/api/staff/catalog/cabinets"],
    ["the API of the family, with a locale", "/ro/api/staff/catalog/cabinets"],
  ])("gets none of the staff headers: %s", (_label, path) => {
    const response = respondTo(path);

    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(response.headers.get("cache-control")).not.toBe("private, no-store");
  });

  it("is not made one by a query that names a catalog page", () => {
    expect(
      respondTo("/ro/configurator/configure?next=/ro/staff/catalog/cabinets")
        .headers,
    ).not.toSatisfy((headers: Headers) => headers.has("x-robots-tag"));
  });

  it("still carries the site's page policy", () => {
    expect(
      respondTo("/ro/staff/catalog/prices").headers.get(LIVE_POLICY_HEADER),
    ).toMatch(/default-src 'self'/);
  });
});

describe("the interceptor's matcher and a catalog item's address", () => {
  it.each(
    routing.locales.flatMap((locale) =>
      ["png", "svg", "woff2"].map((extension) => [
        `/${locale}/staff/catalog/cabinets/${ITEM_ID}.${extension}`,
      ]),
    ),
  )("hands %s to the interceptor, so it carries the staff headers", (path) => {
    expect(reaches(path)).toBe(true);
    expect(isMarkedAsStaffPage(path)).toBe(true);
  });

  it.each(
    routing.locales.flatMap((locale) =>
      CATALOG_PAGES.map((section) => [`/${locale}/staff/catalog/${section}`]),
    ),
  )("hands %s to the interceptor", (path) => {
    expect(reaches(path)).toBe(true);
  });
});
