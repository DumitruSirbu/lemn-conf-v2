import { readdirSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routing } from "../src/i18n/routing";
import { proxy } from "../src/proxy";
import {
  CONTENT_SECURITY_POLICY_MODE,
  cspResponseHeaderName,
} from "../src/lib/security-headers";

/**
 * The account screens' headers (M8B Lot 2 plan, P3 and criterion 22; ADR 0172 D5 and D11). Every page of the family is
 * never indexed and never cached, a page that reads a single-use token also leaks not even the origin when a link is
 * followed, and only the three pages that show a challenge name its frame. A page directory that belongs to none of the
 * three lists would be cached and indexable, so the directories are read from disk and every one is placed.
 */

const LIVE_POLICY_HEADER = cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE);
const TURNSTILE_FRAME = "https://challenges.cloudflare.com";
const ACCOUNT_PAGES_DIRECTORY = join(
  import.meta.dirname,
  "../src/app/[locale]/account",
);

const TOKEN_PAGES = [
  "verify-email",
  "reset-password",
  "confirm-email",
  "revert-email",
];
const CHALLENGE_PAGES = ["register", "login", "forgot-password"];
const SIGNED_IN_PAGES = ["kitchens", "profile", "password", "export"];
/** Named by the proxy ahead of its page: the erase-account screen is blocked on a record that does not exist yet. */
const SIGNED_IN_PAGE_WITHOUT_A_DIRECTORY = "delete";

afterEach(() => {
  vi.unstubAllEnvs();
});

function respondTo(path: string) {
  const answer = proxy(new NextRequest(new URL(path, "https://lemnaria.test")));
  if (answer instanceof Promise) {
    throw new Error("the interceptor made a request here wait for a promise");
  }
  return answer;
}

function pageDirectories(): string[] {
  return readdirSync(ACCOUNT_PAGES_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["))
    .map((entry) => entry.name)
    .sort();
}

function frameSourceOf(response: Response): string {
  const policy = response.headers.get(LIVE_POLICY_HEADER) ?? "";
  return /frame-src ([^;]+)/.exec(policy)?.[1] ?? "";
}

describe("the account pages on disk", () => {
  it("are exactly the pages the proxy names, so no page is left to the site's cacheable, indexable default", () => {
    const named = [
      ...TOKEN_PAGES,
      ...CHALLENGE_PAGES,
      ...SIGNED_IN_PAGES,
    ].sort();

    expect(pageDirectories()).toEqual(named);
    expect(routing.locales.length).toBeGreaterThanOrEqual(2);
  });
});

describe.each(routing.locales)("in locale %s", (locale) => {
  describe.each(pageDirectories())("the page %s", (page) => {
    const response = () => respondTo(`/${locale}/account/${page}`);

    it("is never indexed and never cached", () => {
      expect(response().headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response().headers.get("cache-control")).toBe("private, no-store");
    });

    it("answers no-referrer exactly when it reads a single-use token", () => {
      const expected = TOKEN_PAGES.includes(page) ? "no-referrer" : null;

      expect(response().headers.get("referrer-policy")).toBe(expected);
    });

    it("names the challenge frame exactly when it shows a challenge, and no frame otherwise", () => {
      const expected = CHALLENGE_PAGES.includes(page)
        ? TURNSTILE_FRAME
        : "'none'";

      expect(frameSourceOf(response())).toBe(expected);
    });

    it("carries the page policy", () => {
      expect(response().headers.get(LIVE_POLICY_HEADER)).toMatch(
        /default-src 'self'/,
      );
    });
  });

  it("treats the signed-in page the proxy names ahead of its directory as a signed-in page", () => {
    const response = respondTo(
      `/${locale}/account/${SIGNED_IN_PAGE_WITHOUT_A_DIRECTORY}`,
    );

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBeNull();
    expect(frameSourceOf(response)).toBe("'none'");
  });

  it("answers the e-mail change's confirmation page, the token page of E9, with no-referrer", () => {
    const response = respondTo(`/${locale}/account/confirm-email`);

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe.each(routing.locales)("the undo page in locale %s", (locale) => {
  it("is a token page: no-referrer, never indexed, never cached and no third-party frame", () => {
    const response = respondTo(`/${locale}/account/revert-email`);

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(frameSourceOf(response)).toBe("'none'");
  });

  it.each([
    ["with a trailing slash", `/${locale}/account/revert-email/`],
    ["with a query", `/${locale}/account/revert-email?x=1`],
  ])("keeps no-referrer %s", (_label, path) => {
    expect(respondTo(path).headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("what is not an account page", () => {
  it.each([
    ["the family's own address", "/ro/account"],
    ["an address the family has no page for", "/ro/account/email-change"],
    ["the session address of the API's name", "/ro/account/session"],
    ["a page in another case", "/ro/account/KITCHENS"],
    ["the undo page in another case", "/ro/account/Revert-Email"],
    ["the undo page with a longer path", "/ro/account/revert-email/extra"],
    ["the undo page with no locale", "/account/revert-email"],
    ["the undo page with an escaped family", "/ro/%61ccount/revert-email"],
    ["the undo page with an escaped hyphen", "/ro/account/revert%2Demail"],
    ["a page with a longer path", "/ro/account/kitchens/12"],
    ["a page with a deeper path", "/ro/account/profile/extra/path"],
    ["a page with no locale", "/account/kitchens"],
    ["a locale the site does not serve", "/xx/account/kitchens"],
    ["a locale in another case", "/RO/account/kitchens"],
    ["a locale written escaped", "/%72o/account/kitchens"],
    ["the plural of the family", "/ro/accounts/kitchens"],
    ["the API of the family", "/api/account/kitchens"],
    ["the API of the family, with a locale", "/ro/api/account/kitchens"],
    ["the configurator", "/ro/configurator/configure"],
  ])("gets none of the account headers: %s", (_label, path) => {
    const response = respondTo(path);

    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(response.headers.get("cache-control")).not.toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBeNull();
    expect(frameSourceOf(response)).not.toBe(TURNSTILE_FRAME);
  });

  it("still carries the site's page policy", () => {
    expect(
      respondTo("/ro/account/email-change").headers.get(LIVE_POLICY_HEADER),
    ).toMatch(/default-src 'self'/);
  });
});

describe("the family's pages in a path written another way", () => {
  it.each([
    ["with a trailing slash", "/ro/account/kitchens/"],
    ["with a query", "/ro/account/kitchens?x=1"],
    ["with a fragment", "/ro/account/kitchens#a"],
  ])("still gets the account headers %s", (_label, path) => {
    const response = respondTo(path);

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("names the Turnstile frame on none of the signed-in or token pages' sibling spellings", () => {
    for (const path of [
      "/ro/account/login/",
      "/ro/account/login?reason=session-expired",
    ]) {
      expect(frameSourceOf(respondTo(path)), path).toBe(TURNSTILE_FRAME);
    }
    for (const path of [
      "/ro/account/kitchens/",
      "/ro/account/confirm-email/",
    ]) {
      expect(frameSourceOf(respondTo(path)), path).toBe("'none'");
    }
  });
});
