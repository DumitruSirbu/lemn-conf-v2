import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { routing } from "../src/i18n/routing";
import { config, proxy } from "../src/proxy";
import {
  CONTENT_SECURITY_POLICY_MODE,
  cspResponseHeaderName,
} from "../src/lib/security-headers";

/**
 * Every staff page shows clients' data, so each is never indexed, never cached and names no third-party frame. A path
 * written any other way (case, escape, locale, length) is not a staff page and must not borrow the headers.
 */

const LIVE_POLICY_HEADER = cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE);
const KITCHEN_ID = "abcdefghijklmnopqrstu";

function respondTo(path: string) {
  const answer = proxy(new NextRequest(new URL(path, "https://lemnaria.test")));
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

describe.each(routing.locales)("the staff pages in locale %s", (locale) => {
  it.each([
    ["the kitchens list", `/${locale}/staff/kitchens`],
    ["the team page", `/${locale}/staff/team`],
    ["the presets page", `/${locale}/staff/presets`],
    ["the audit log", `/${locale}/staff/audit`],
    ["one client's kitchen", `/${locale}/staff/kitchens/${KITCHEN_ID}`],
  ])("%s is never indexed and never cached", (_label, path) => {
    const response = respondTo(path);

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("names no third-party frame, and keeps the site's policy", () => {
    const policy =
      respondTo(`/${locale}/staff/kitchens`).headers.get(LIVE_POLICY_HEADER) ??
      "";

    expect(policy).toMatch(/default-src 'self'/);
    expect(/frame-src ([^;]+)/.exec(policy)?.[1]).toBe("'none'");
  });

  it("does not send a token page's no-referrer: no staff page here reads a token", () => {
    expect(
      respondTo(`/${locale}/staff/kitchens`).headers.get("referrer-policy"),
    ).toBeNull();
  });

  it.each([
    ["with a trailing slash", `/${locale}/staff/kitchens/`],
    ["with a query", `/${locale}/staff/kitchens?segment=sent`],
    ["with a fragment", `/${locale}/staff/audit#a`],
    [
      "a kitchen with a trailing slash",
      `/${locale}/staff/kitchens/${KITCHEN_ID}/`,
    ],
  ])("still gets the headers %s", (_label, path) => {
    expect(isMarkedAsStaffPage(path)).toBe(true);
  });
});

describe("what is not a staff page", () => {
  it.each([
    ["the family's own address", "/ro/staff"],
    ["a page the family has no page for", "/ro/staff/prices"],
    ["the token page, whose headers wave U9 adds", "/ro/staff/accept"],
    ["a page in another case", "/ro/staff/KITCHENS"],
    ["the family in another case", "/ro/Staff/kitchens"],
    ["an escaped family", "/ro/%73taff/kitchens"],
    ["an escaped page", "/ro/staff/%6Bitchens"],
    ["a page with a longer path", "/ro/staff/team/12"],
    ["the audit log with a longer path", "/ro/staff/audit/12"],
    ["a kitchen with a longer path", `/ro/staff/kitchens/${KITCHEN_ID}/extra`],
    ["a page with no locale", "/staff/kitchens"],
    ["a kitchen with no locale", `/staff/kitchens/${KITCHEN_ID}`],
    ["a locale the site does not serve", "/xx/staff/kitchens"],
    ["a locale in another case", "/RO/staff/kitchens"],
    ["a locale written escaped", "/%72o/staff/kitchens"],
    ["the plural of the family", "/ro/staffs/kitchens"],
    ["the account family's kitchens", "/ro/account/kitchens/12"],
    ["the API of the family", "/api/staff/kitchens"],
    ["the API of the family, with a locale", "/ro/api/staff/kitchens"],
    ["the configurator", "/ro/configurator/configure"],
  ])("gets none of the staff headers: %s", (_label, path) => {
    const response = respondTo(path);

    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(response.headers.get("cache-control")).not.toBe("private, no-store");
  });

  it("still carries the site's page policy", () => {
    expect(
      respondTo("/ro/staff/prices").headers.get(LIVE_POLICY_HEADER),
    ).toMatch(/default-src 'self'/);
  });
});

describe("the token page of the staff invitation", () => {
  // Wave L3-U9 owns `proxy.ts`'s `staff/accept` entry (plan section 7.3). It must flip this to `it` when it adds it.
  it.fails("answers no-referrer, until wave L3-U9 adds it", () => {
    expect(respondTo("/ro/staff/accept").headers.get("referrer-policy")).toBe(
      "no-referrer",
    );
  });
});

describe("the interceptor's matcher and the staff kitchen's address", () => {
  const reaches = (url: string): boolean =>
    unstable_doesMiddlewareMatch({ config, url });

  it.each(
    routing.locales.flatMap((locale) =>
      ["png", "svg", "woff2"].map((extension) => [
        `/${locale}/staff/kitchens/${KITCHEN_ID}.${extension}`,
      ]),
    ),
  )("hands %s to the interceptor, so it carries the staff headers", (path) => {
    expect(reaches(path)).toBe(true);
    expect(isMarkedAsStaffPage(path)).toBe(true);
  });

  it.each(
    routing.locales.flatMap((locale) => [
      [`/${locale}/staff/kitchens`],
      [`/${locale}/staff/kitchens/${KITCHEN_ID}`],
      [`/${locale}/staff/audit`],
    ]),
  )("hands %s to the interceptor", (path) => {
    expect(reaches(path)).toBe(true);
  });
});
