import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routing } from "../src/i18n/routing";
import { proxy } from "../src/proxy";

/**
 * The undo page reads a single-use token, so it answers `Referrer-Policy: no-referrer` (plan 14.3.7 R-13). The cases in
 * `proxy-account-pages.test.ts` pin the escaped hyphen, the escaped family, the mixed-case page, a longer path and a
 * missing locale. These are the spellings it does not: a page written wholly in capitals, in capitals in a word, with
 * an escaped letter, with a path parameter, and with an empty segment. A case-sensitive route that is never served must
 * not get the token page's headers by accident; an empty segment, which the proxy ignores, must never lose them.
 *
 * The "not the token page" cases assume the framework's static route match is as literal as the proxy's (it serves
 * `/revert-email` only; a capital or an escaped letter is a 404). Nothing here starts the framework to prove that.
 *
 * Nothing here builds the address through `new URL(path, base)`, which reads a leading `//` as a host.
 */
const ORIGIN = "https://lemnaria.test";

afterEach(() => {
  vi.unstubAllEnvs();
});

function respondTo(rawPath: string) {
  const answer = proxy(new NextRequest(`${ORIGIN}${rawPath}`));
  if (answer instanceof Promise) {
    throw new Error("the interceptor made a request here wait for a promise");
  }
  return answer;
}

describe.each(routing.locales)("the undo page in locale %s", (locale) => {
  it.each([
    ["written wholly in capitals", `/${locale}/account/REVERT-EMAIL`],
    ["capitalised in the middle", `/${locale}/account/reVert-Email`],
    ["with an escaped letter", `/${locale}/account/%72evert-email`],
    ["with an escaped capital letter", `/${locale}/account/%52evert-email`],
    ["with a path parameter", `/${locale}/account/revert-email;x=1`],
    ["with an escaped slash after it", `/${locale}/account/revert-email%2F`],
    ["under the family in capitals", `/${locale}/ACCOUNT/revert-email`],
    [
      "under a locale in capitals",
      `/${locale.toUpperCase()}/account/revert-email`,
    ],
  ])(
    "is not the token page when written %s, so it is not given its headers",
    (_label, path) => {
      const response = respondTo(path);

      expect(response.headers.get("referrer-policy")).toBeNull();
      expect(response.headers.get("x-robots-tag")).toBeNull();
    },
  );

  it.each([
    ["a doubled slash after the locale", `/${locale}//account/revert-email`],
    ["a doubled slash before the page", `/${locale}/account//revert-email`],
    ["a doubled slash at the start", `//${locale}/account/revert-email`],
    ["a trailing doubled slash", `/${locale}/account/revert-email//`],
    [
      "a dot segment, which the address parser removes",
      `/${locale}/account/./revert-email`,
    ],
    [
      "a dot-dot segment, which the address parser resolves",
      `/${locale}/account/x/../revert-email`,
    ],
  ])("keeps every token-page header with %s", (_label, path) => {
    const response = respondTo(path);

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers the same headers with a query or a trailing slash as without, and with the token where it must never be", () => {
    const plain = respondTo(`/${locale}/account/revert-email`);
    const spellings = [
      `/${locale}/account/revert-email/`,
      `/${locale}/account/revert-email?t=${"A".repeat(43)}`,
      `/${locale}/account/revert-email/?token=${"A".repeat(43)}`,
    ];

    for (const path of spellings) {
      const response = respondTo(path);
      for (const name of ["referrer-policy", "x-robots-tag", "cache-control"]) {
        expect([path, name, response.headers.get(name)]).toEqual([
          path,
          name,
          plain.headers.get(name),
        ]);
      }
    }
  });
});
