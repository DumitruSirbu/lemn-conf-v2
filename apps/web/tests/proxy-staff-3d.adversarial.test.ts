import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { routing } from "../src/i18n/routing";
import { config, proxy } from "../src/proxy";
import { ACCOUNT_PAGE_HEADERS } from "../src/lib/security-headers";

/**
 * W3b adversarial QA of the staff 3D page's proxy family (plan W3b-5): the page's address carries every header the kitchen's
 * own page carries (the whole set, not two of them), and no spelling that is not exactly `/{locale}/staff/kitchens/{id}/3d`,
 * the one address a staff page may have there, borrows them.
 */

const KITCHEN_ID = "abcdefghijklmnopqrstu";
const LOCALE_FREE = routing.locales.map((locale) => `/${locale}`);

function respondTo(path: string) {
  const answer = proxy(new NextRequest(new URL(path, "https://lemnaria.test")));
  if (answer instanceof Promise) {
    throw new Error("the interceptor made a request here wait for a promise");
  }
  return answer;
}

function staffHeadersOf(path: string): Record<string, string | null> {
  const { headers } = respondTo(path);
  return Object.fromEntries(
    ACCOUNT_PAGE_HEADERS.map(({ key }) => [key, headers.get(key)]),
  );
}

function wholeHeaderSetOf(path: string): [string, string][] {
  return [...respondTo(path).headers.entries()]
    .filter(([name]) => !name.startsWith("x-middleware"))
    .map(([name, value]): [string, string] => [
      name,
      value.replace(/'nonce-[^']+'/g, "'nonce-X'"),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

const STAFF_VALUES: Record<string, string> = Object.fromEntries(
  ACCOUNT_PAGE_HEADERS.map(({ key, value }) => [key, value]),
);

describe.each(routing.locales)("the staff 3D page in locale %s", (locale) => {
  const threeD = `/${locale}/staff/kitchens/${KITCHEN_ID}/3d`;

  it("carries every header the account pages' family names, with its value", () => {
    expect(staffHeadersOf(threeD)).toEqual(STAFF_VALUES);
  });

  it("carries the same headers, byte for byte, as the kitchen's own page", () => {
    expect(wholeHeaderSetOf(threeD)).toEqual(
      wholeHeaderSetOf(`/${locale}/staff/kitchens/${KITCHEN_ID}`),
    );
  });

  it.each([
    ["a query naming the copy", "?version=current"],
    ["a query with a repeated parameter", "?version=sent&version=current"],
    ["an empty query value", "?version="],
    ["a fragment", "#scene"],
    ["a trailing slash", "/"],
  ])("still carries them with %s", (_label, suffix) => {
    expect(staffHeadersOf(`${threeD}${suffix}`)).toEqual(STAFF_VALUES);
  });

  it.each([
    ["a larger case", `/${locale}/staff/kitchens/${KITCHEN_ID}/3D`],
    ["a longer path", `/${locale}/staff/kitchens/${KITCHEN_ID}/3d/x`],
    ["a path three deeper", `/${locale}/staff/kitchens/${KITCHEN_ID}/3d/3d`],
    ["the word edit", `/${locale}/staff/kitchens/${KITCHEN_ID}/edit`],
    ["the word 3", `/${locale}/staff/kitchens/${KITCHEN_ID}/3`],
    [
      "an escaped first character",
      `/${locale}/staff/kitchens/${KITCHEN_ID}/%33d`,
    ],
    [
      "an escaped second character",
      `/${locale}/staff/kitchens/${KITCHEN_ID}/3%64`,
    ],
    ["a fullwidth digit", `/${locale}/staff/kitchens/${KITCHEN_ID}/３d`],
    ["a trailing dot", `/${locale}/staff/kitchens/${KITCHEN_ID}/3d.`],
    ["a trailing space", `/${locale}/staff/kitchens/${KITCHEN_ID}/3d%20`],
    ["a trailing NUL", `/${locale}/staff/kitchens/${KITCHEN_ID}/3d%00`],
    ["a path parameter", `/${locale}/staff/kitchens/${KITCHEN_ID}/3d;x`],
    [
      "an escaped slash after it",
      `/${locale}/staff/kitchens/${KITCHEN_ID}/3d%2Fx`,
    ],
    [
      "the family in another case",
      `/${locale}/Staff/kitchens/${KITCHEN_ID}/3d`,
    ],
    ["the page in another case", `/${locale}/staff/Kitchens/${KITCHEN_ID}/3d`],
    ["another page of the family", `/${locale}/staff/team/${KITCHEN_ID}/3d`],
    ["the audit log", `/${locale}/staff/audit/${KITCHEN_ID}/3d`],
    ["the catalog", `/${locale}/staff/catalog/cabinets/${KITCHEN_ID}/3d`],
    ["the account family", `/${locale}/account/kitchens/${KITCHEN_ID}/3d`],
    ["the share family", `/${locale}/s/${KITCHEN_ID}/3d`],
    ["a design's page", `/${locale}/d/${KITCHEN_ID}/3d`],
  ])("does not borrow them for %s", (_label, path) => {
    const headers = staffHeadersOf(path);

    expect(headers["X-Robots-Tag"]).toBeNull();
    expect(headers["Cache-Control"]).not.toBe("private, no-store");
  });
});

describe("a path with a doubled slash, observed", () => {
  it.each([
    ["before the id", `/ro/staff/kitchens//${KITCHEN_ID}/3d`],
    ["before the segment", `/ro/staff/kitchens/${KITCHEN_ID}//3d`],
  ])(
    "gets the staff headers when the slash is doubled %s: the stricter side of the same page",
    (_label, path) => {
      expect(staffHeadersOf(path)).toEqual(STAFF_VALUES);
    },
  );
});

describe("the staff 3D page's address written without a language the site serves", () => {
  it.each([
    ["no locale", `/staff/kitchens/${KITCHEN_ID}/3d`],
    ["an unserved locale", `/xx/staff/kitchens/${KITCHEN_ID}/3d`],
    ["a capitalised locale", `/RO/staff/kitchens/${KITCHEN_ID}/3d`],
    ["an escaped locale", `/%72o/staff/kitchens/${KITCHEN_ID}/3d`],
    ["a three-letter locale", `/ron/staff/kitchens/${KITCHEN_ID}/3d`],
    ["the API's prefix", `/api/staff/kitchens/${KITCHEN_ID}/3d`],
    [
      "the API's prefix under a locale",
      `/ro/api/staff/kitchens/${KITCHEN_ID}/3d`,
    ],
  ])("is not a staff page: %s", (_label, path) => {
    const headers = staffHeadersOf(path);

    expect(headers["X-Robots-Tag"]).toBeNull();
    expect(headers["Cache-Control"]).not.toBe("private, no-store");
  });

  it.each(LOCALE_FREE)("is no staff page for the bare %s", (locale) => {
    expect(staffHeadersOf(locale)["X-Robots-Tag"]).toBeNull();
  });
});

describe("the interceptor's matcher", () => {
  const reaches = (url: string): boolean =>
    unstable_doesMiddlewareMatch({ config, url });

  it.each(
    routing.locales.flatMap((locale) => [
      [`/${locale}/staff/kitchens/${KITCHEN_ID}/3d`],
      [`/${locale}/staff/kitchens/${KITCHEN_ID}/3d/`],
      [`/${locale}/staff/kitchens/${KITCHEN_ID}/3d?version=sent`],
    ]),
  )(
    "hands %s to the interceptor, so the page cannot be served without the headers",
    (path) => {
      expect(reaches(path)).toBe(true);
    },
  );
});
