import { fc, test as propertyTest } from "@fast-check/vitest";
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
 * Adversarial QA of wave L3-U1, the staff family in `proxy.ts` (plan K-11, P-L3-2). The developer's file pins fixed
 * examples with one id; this one sweeps the kitchen's id, which is the only caller-chosen text in a staff address, and
 * the static extensions the first matcher drops.
 *
 * What it does not claim: `%2e%2e` and `.` are folded by the URL parser before `proxy()` ever sees a path, so a
 * property over them would test the folded path; the generator discards an id that folds the address away from the
 * staff family instead of pretending to have covered it.
 */

const ORIGIN = "https://lemnaria.test";
const LIVE_POLICY_HEADER = cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE);
const BASELINE_ID = "abcdefghijklmnopqrstu";
const MAXIMUM_ID_LENGTH = 3000;
const SWEEP_RUNS = 150;
const LONGEST_ID_SWEPT = 20_000;

/** The extensions the first matcher drops (`config.matcher[0]`), which the id's matcher must win back. */
const STATIC_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "glb",
  "gltf",
  "hdr",
  "bin",
  "woff",
  "woff2",
] as const;

function respondTo(rawPath: string) {
  const answer = proxy(new NextRequest(`${ORIGIN}${rawPath}`));
  if (answer instanceof Promise) {
    throw new Error("the interceptor made a request here wait for a promise");
  }
  return answer;
}

/** Every response header that is the proxy's decision and not the request's nonce. */
function decisionsOf(rawPath: string): Record<string, string> {
  const headers: Record<string, string> = {};
  respondTo(rawPath).headers.forEach((value, key) => {
    const isNoncePlumbing = key.startsWith("x-middleware");
    const isPolicy = key.includes("security-policy");
    if (!isNoncePlumbing && !isPolicy) headers[key] = value;
  });
  return headers;
}

const reaches = (rawPath: string): boolean =>
  unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${rawPath}` });

/** An id the way a person or an attacker might write it: any character, escaped as a browser would. */
const escapedIdArbitrary = fc
  .string({
    unit: fc.oneof(
      fc.constantFrom(
        ".",
        "%",
        " ",
        "+",
        ";",
        "?",
        "#",
        "\\",
        "é",
        "ж",
        "日",
        "\u202e",
        "\u0000",
      ),
      fc
        .integer({ min: 0x20, max: 0x2fff })
        .map((point) => String.fromCodePoint(point)),
      fc
        .integer({ min: 0x10000, max: 0x1ffff })
        .map((point) => String.fromCodePoint(point)),
    ),
    minLength: 1,
    maxLength: MAXIMUM_ID_LENGTH,
  })
  .map(encodeURIComponent);

/** An id written raw, so dots and half-escapes reach the parser as typed. */
const rawIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9._%~ -]{1,200}$/);

function isStillAKitchenAddress(rawPath: string): boolean {
  const { pathname } = new URL(rawPath, ORIGIN);
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length === 4 &&
    segments[1] === "staff" &&
    segments[2] === "kitchens"
  );
}

describe("a staff kitchen's id, whatever it is made of or how long", () => {
  const baseline = (locale: string) =>
    decisionsOf(`/${locale}/staff/kitchens/${BASELINE_ID}`);

  it.each(routing.locales)(
    "the baseline in %s is the staff pair, so the sweep compares against something",
    (locale) => {
      expect(baseline(locale)).toMatchObject({
        "x-robots-tag": "noindex, nofollow",
        "cache-control": "private, no-store",
      });
    },
  );

  propertyTest.prop([fc.constantFrom(...routing.locales), escapedIdArbitrary], {
    numRuns: SWEEP_RUNS,
  })(
    "carries exactly the baseline's headers and the site's policy for an escaped id up to 3000 characters",
    (locale, escapedId) => {
      const path = `/${locale}/staff/kitchens/${escapedId}`;
      fc.pre(isStillAKitchenAddress(path));

      const response = respondTo(path);
      const policy = response.headers.get(LIVE_POLICY_HEADER) ?? "";

      expect(decisionsOf(path)).toEqual(baseline(locale));
      expect(policy).toMatch(/default-src 'self'/);
      expect(/frame-src ([^;]+)/.exec(policy)?.[1]).toBe("'none'");
    },
  );

  propertyTest.prop([fc.constantFrom(...routing.locales), rawIdArbitrary], {
    numRuns: SWEEP_RUNS,
  })(
    "carries exactly the baseline's headers for an id written raw, dots and half-escapes included",
    (locale, rawId) => {
      const path = `/${locale}/staff/kitchens/${rawId}`;
      fc.pre(isStillAKitchenAddress(path));

      expect(decisionsOf(path)).toEqual(baseline(locale));
    },
  );

  propertyTest.prop(
    [
      fc.constantFrom(...routing.locales),
      fc.integer({ min: 1, max: LONGEST_ID_SWEPT }),
    ],
    { numRuns: SWEEP_RUNS },
  )(
    "carries exactly the baseline's headers for an id of any length, so no length limit hides in the predicate",
    (locale, length) => {
      const path = `/${locale}/staff/kitchens/${"k".repeat(length)}`;

      expect(decisionsOf(path)).toEqual(baseline(locale));
    },
  );

  propertyTest.prop(
    [
      fc.constantFrom(...routing.locales),
      fc.constantFrom(...STATIC_EXTENSIONS),
      fc.boolean(),
      escapedIdArbitrary,
    ],
    { numRuns: SWEEP_RUNS },
  )(
    "reaches the interceptor and is marked, whatever static extension, in either case, the id ends in",
    (locale, extension, isUpperCase, escapedId) => {
      const written = isUpperCase ? extension.toUpperCase() : extension;
      const path = `/${locale}/staff/kitchens/${escapedId}.${written}`;
      fc.pre(isStillAKitchenAddress(path));

      expect(reaches(path)).toBe(true);
      expect(decisionsOf(path)).toEqual(baseline(locale));
    },
  );
});

describe("an address that only reads like a staff page is none", () => {
  it.each([
    ["a path parameter on the page", "/ro/staff/kitchens;x=1"],
    ["a path parameter on the family", "/ro/staff;x=1/kitchens"],
    ["an escaped slash after the page", "/ro/staff/kitchens%2Fabc"],
    ["an escaped slash after the family", "/ro/staff%2Fkitchens"],
    ["a trailing space escaped", "/ro/staff/kitchens%20"],
    ["a trailing dot on the page", "/ro/staff/kitchens."],
    ["an extension on the page", "/ro/staff/kitchens.json"],
    ["an extension on the audit page", "/ro/staff/audit.json"],
    ["an escaped letter in the locale, with a staff page", "/r%6F/staff/audit"],
    ["a locale with a trailing dot", "/ro./staff/kitchens"],
    ["the family twice", "/ro/staff/staff/kitchens"],
    ["the kitchen's id as the page", "/ro/staff/abcdefghijklmnopqrstu"],
    ["the account family with a staff page name", "/ro/account/audit"],
    ["an API address under the family", "/api/staff/audit"],
    ["the invitation page, until its wave adds the entry", "/ro/staff/accept"],
  ])("%s gets none of the staff pair", (_label, path) => {
    const decisions = decisionsOf(path);

    expect(decisions["x-robots-tag"]).toBeUndefined();
    expect(decisions["cache-control"]).not.toBe("private, no-store");
  });

  it("is not made one by a query that names a staff page", () => {
    const decisions = decisionsOf(
      "/ro/configurator/configure?next=/ro/staff/audit",
    );

    expect(decisions["x-robots-tag"]).toBeUndefined();
  });
});

describe("the same address spelled with empty segments", () => {
  // The proxy drops empty segments (`filter(Boolean)`), so `//` keeps the staff pair: the safe direction, since the
  // framework answers `//` with a redirect to the single-slash address and a header too many costs nothing.
  it.each([
    ["a doubled slash after the locale", "/ro//staff/kitchens"],
    ["a doubled slash before the id", `/ro/staff/kitchens//${BASELINE_ID}`],
    ["a trailing slash after the id", `/ro/staff/kitchens/${BASELINE_ID}/`],
  ])("%s still carries the pair", (_label, path) => {
    expect(decisionsOf(path)).toMatchObject({
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "private, no-store",
    });
  });
});
