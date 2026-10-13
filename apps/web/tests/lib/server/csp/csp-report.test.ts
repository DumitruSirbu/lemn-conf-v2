import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  CSP_DIRECTIVES,
  CSP_PAGE_FAMILIES,
  reduceCspReport,
  type CspReportReduction,
  type ReducedCspReport,
} from "@/lib/server/csp/csp-report";

/** The keys 8Q.3 allows a record, and no others. */
const ALLOWED_KEYS = [
  "directive",
  "blocked",
  "source",
  "line",
  "column",
  "page",
  "locale",
  "origin",
  "disposition",
  "status",
];

const ORIGIN = "https://shop.test";
const SCHEME_ONLY_KINDS = [
  "data",
  "blob",
  "chrome-extension",
  "moz-extension",
  "safari-web-extension",
];
const CHUNK_PATH = /^\/_next\/static(?:\/[A-Za-z0-9._~-]+)+\.js$/;
const ORIGIN_ONLY = /^https?:\/\/[^/?#@\s]+$/;

function bodyOf(report: Record<string, unknown>): string {
  return JSON.stringify({ "csp-report": report });
}

function recordOf(report: Record<string, unknown>): ReducedCspReport {
  return recordFrom(reduceCspReport(bodyOf(report), ORIGIN));
}

function recordFrom(reduction: CspReportReduction): ReducedCspReport {
  if (reduction.kind !== "report") {
    throw new Error("The text was expected to be a report");
  }
  return reduction.record;
}

/** What Chromium 151 sent for an inline script on a share view (8Q S0 M6), with the token and query in it. */
function chromiumInlineReport(documentUri: string): Record<string, unknown> {
  return {
    "document-uri": documentUri,
    referrer: "",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy":
      "default-src 'self'; script-src 'self' 'nonce-NONCE-IN-THE-POLICY' 'strict-dynamic'; report-uri /api/csp-reports",
    disposition: "enforce",
    "blocked-uri": "inline",
    "line-number": 1,
    "source-file": documentUri,
    "status-code": 200,
    "script-sample": "",
  };
}

describe("reduceCspReport: a report the browser sent, as the record the server writes", () => {
  it("reduces a share view's inline-script report to closed values, with the token and query gone", () => {
    const record = recordOf(
      chromiumInlineReport(`${ORIGIN}/ro/s/TOKEN-OF-A-SHARE?x=1`),
    );

    expect(record).toEqual({
      directive: "script-src-elem",
      blocked: "inline",
      source: "self",
      line: 1,
      page: "/[locale]/s/[token]",
      locale: "ro",
      origin: "own",
      disposition: "enforce",
      status: 200,
    });
  });

  it("names an eval, with its column, and the build's own chunk by its path alone", () => {
    const record = recordOf({
      ...chromiumInlineReport(`${ORIGIN}/ru/d/Id0fADesign/review`),
      "effective-directive": "script-src",
      "blocked-uri": "eval",
      "source-file": `${ORIGIN}/_next/static/chunks/0w_x4~abc._.js?dpl=a1#frag`,
      "line-number": 3,
      "column-number": 17,
      disposition: "report",
    });

    expect(record).toEqual({
      directive: "script-src",
      blocked: "eval",
      source: "/_next/static/chunks/0w_x4~abc._.js",
      line: 3,
      column: 17,
      page: "/[locale]/d/[id]/review",
      locale: "ru",
      origin: "own",
      disposition: "report",
      status: 200,
    });
  });

  it("keeps the origin of a foreign script, port included, and nothing after it", () => {
    const record = recordOf({
      ...chromiumInlineReport(`${ORIGIN}/ro`),
      "blocked-uri": "https://user:secret@evil.example:8443/a/b.js?q=1#h",
    });

    expect(record.blocked).toBe("https://evil.example:8443");
    expect(record.page).toBe("/[locale]");
  });

  it("writes `self` for a blocked address on the document's own origin, whatever its path", () => {
    const record = recordOf({
      ...chromiumInlineReport(`${ORIGIN}/ro/s/TOKEN`),
      "blocked-uri": `${ORIGIN}/ro/s/TOKEN/x.js?t=TOKEN`,
    });

    expect(record.blocked).toBe("self");
  });

  it.each(SCHEME_ONLY_KINDS)(
    "writes only the scheme of a %s address",
    (kind) => {
      const full = `${kind}:SOME-OPAQUE-TEXT/with/a/path`;

      expect(recordOf({ "blocked-uri": full }).blocked).toBe(kind);
      expect(recordOf({ "blocked-uri": kind }).blocked).toBe(kind);
    },
  );

  it.each([
    ["an empty text", ""],
    ["a scheme the list does not name", "javascript:alert(1)"],
    ["a word that only starts like a scheme", "database://x"],
    ["something that is no address", "not a url at all"],
  ])("writes `other` for %s", (_label, blocked) => {
    expect(recordOf({ "blocked-uri": blocked }).blocked).toBe("other");
  });

  it("writes `other` for an origin longer than 255 characters", () => {
    const longHost = `${"a".repeat(250)}.example`;

    expect(
      recordOf({ "blocked-uri": `https://${longHost}/x.js` }).blocked,
    ).toBe("other");
  });

  it("cannot tell an own address without a document, and so writes its origin, with the origin of the page `none`", () => {
    expect(recordOf({ "blocked-uri": `${ORIGIN}/x.js` })).toMatchObject({
      blocked: ORIGIN,
      page: "other",
      locale: "none",
      origin: "none",
    });
  });

  it("takes the first word of `violated-directive` when no `effective-directive` is sent, in any case", () => {
    expect(
      recordOf({ "violated-directive": "Script-Src-Elem 'self' 'nonce-X'" })
        .directive,
    ).toBe("script-src-elem");
  });

  it.each([
    [
      "a directive the policy does not have",
      { "effective-directive": "navigate-to" },
    ],
    [
      "a directive's own text in another field",
      { "violated-directive": "'nonce-SECRET'" },
    ],
    ["a number", { "effective-directive": 5 }],
    ["nothing", {}],
  ])("writes `other` for %s", (_label, fields) => {
    expect(recordOf(fields).directive).toBe("other");
  });

  it.each([
    [
      "a script of the chunk path with a traversal",
      `${ORIGIN}/_next/static/../ro/s/TOKEN.js`,
    ],
    ["a path outside the build's own", `${ORIGIN}/ro/s/TOKEN.js`],
    [
      "a chunk path that is not a script",
      `${ORIGIN}/_next/static/chunks/a.css`,
    ],
    ["a chunk path with an escape", `${ORIGIN}/_next/static/chunks/%41.js`],
  ])("writes only `self` for %s", (_label, sourceFile) => {
    const record = recordOf({
      ...chromiumInlineReport(`${ORIGIN}/ro`),
      "source-file": sourceFile,
    });

    expect(record.source).toBe("self");
  });

  it("leaves out a position, a status and a source that are not usable, instead of writing them empty", () => {
    const record = recordOf({
      "line-number": 1.5,
      "column-number": 10_000_001,
      "status-code": 99,
      "source-file": 7,
    });

    expect(Object.keys(record).sort()).toEqual(
      [
        "blocked",
        "directive",
        "disposition",
        "locale",
        "origin",
        "page",
      ].sort(),
    );
  });

  it("keeps the bounds themselves: line 0 and 10,000,000, status 100 and 599", () => {
    expect(
      recordOf({ "line-number": 0, "column-number": 10_000_000 }),
    ).toMatchObject({ line: 0, column: 10_000_000 });
    expect(recordOf({ "status-code": 100 }).status).toBe(100);
    expect(recordOf({ "status-code": 599 }).status).toBe(599);
    expect(recordOf({ "status-code": 600 }).status).toBeUndefined();
  });

  it("does not move a prototype for a report that names `__proto__`", () => {
    const text =
      '{"csp-report":{"__proto__":{"directive":"x"},"blocked-uri":"inline"}}';

    expect(recordFrom(reduceCspReport(text, ORIGIN)).blocked).toBe("inline");
    expect(({} as Record<string, unknown>).directive).toBeUndefined();
  });

  it.each([
    ["an empty text", ""],
    ["text that is not JSON", "this is not a report"],
    ["JSON that is not an object", "[1,2]"],
    ["null", "null"],
    ["an object with no `csp-report`", '{"report-to":{}}'],
    ["a `csp-report` that is null", '{"csp-report":null}'],
    ["a `csp-report` that is a list", '{"csp-report":[]}'],
    ["a `csp-report` that is text", '{"csp-report":"inline"}'],
    ["a body cut short", '{"csp-report":{"blocked-uri":"inl'],
    ["a very deeply nested list", "[".repeat(200_000)],
  ])("answers not-a-report for %s", (_label, text) => {
    expect(reduceCspReport(text, ORIGIN)).toEqual({ kind: "not-a-report" });
  });
});

describe("reduceCspReport: a page of another origin is not a page of this application (8Q.3, amended)", () => {
  const FOREIGN_ORIGIN = "https://forger.example";
  const OWN_CHUNK = "/_next/static/chunks/0w_x4~abc._.js";

  function foreignReport(documentUri: string): Record<string, unknown> {
    return {
      ...chromiumInlineReport(documentUri),
      "source-file": `${FOREIGN_ORIGIN}${OWN_CHUNK}`,
    };
  }

  it("labels a document on the server's own origin `own`, and keeps its page and its chunk path", () => {
    const record = recordOf({
      ...chromiumInlineReport(`${ORIGIN}/ro/s/TOKEN`),
      "source-file": `${ORIGIN}${OWN_CHUNK}`,
    });

    expect(record).toMatchObject({
      origin: "own",
      page: "/[locale]/s/[token]",
      source: OWN_CHUNK,
    });
  });

  it("labels a document on another origin `foreign`, whatever its path claims, and keeps no page and no source", () => {
    const record = recordOf(foreignReport(`${FOREIGN_ORIGIN}/ro/s/TOKEN`));

    expect(record.origin).toBe("foreign");
    expect(record.page).toBe("other");
    expect(record).not.toHaveProperty("source");
  });

  it.each([
    ["the same host on another port", "https://shop.test:8443/ro/s/TOKEN"],
    ["the same host on another scheme", "http://shop.test/ro/s/TOKEN"],
    ["a subdomain of it", "https://evil.shop.test/ro/s/TOKEN"],
    ["a host that only starts like it", "https://shop.test.evil.example/ro"],
  ])("labels %s `foreign`", (_label, documentUri) => {
    expect(recordOf(foreignReport(documentUri))).toMatchObject({
      origin: "foreign",
      page: "other",
    });
  });

  it.each([
    ["no `document-uri`", {}],
    ["a `document-uri` that is no address", { "document-uri": "nonsense" }],
    ["an address that is not http", { "document-uri": "about:blank" }],
    ["a `document-uri` that is a number", { "document-uri": 7 }],
  ])("labels %s `none`, with no page and no source", (_label, fields) => {
    const record = recordOf({
      ...fields,
      "source-file": `${ORIGIN}${OWN_CHUNK}`,
    });

    expect(record.origin).toBe("none");
    expect(record.page).toBe("other");
    expect(record).not.toHaveProperty("source");
  });

  it("compares with the origin it is handed, so that the same report is `own` for one server and `foreign` for another", () => {
    const body = bodyOf(chromiumInlineReport(`${ORIGIN}/ro`));

    expect(recordFrom(reduceCspReport(body, ORIGIN)).origin).toBe("own");
    expect(recordFrom(reduceCspReport(body, FOREIGN_ORIGIN)).origin).toBe(
      "foreign",
    );
  });

  it("keeps a chunk path only for an `own` document, over any origin pair (F3)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(ORIGIN, FOREIGN_ORIGIN, "http://localhost:4320"),
        (documentOrigin) => {
          const record = recordOf({
            ...chromiumInlineReport(`${documentOrigin}/ro`),
            "source-file": `${documentOrigin}${OWN_CHUNK}`,
          });

          expect(record.source === OWN_CHUNK).toBe(documentOrigin === ORIGIN);
        },
      ),
    );
  });
});

describe("reduceCspReport: which family a path belongs to (P3)", () => {
  const SEGMENT = fc.stringMatching(/^[A-Za-z0-9_-]{1,50}$/);
  const LISTED_STEPS = ["review", "contact", "done"];

  function pageOfPath(path: string): ReducedCspReport["page"] {
    return recordOf({ "document-uri": `${ORIGIN}${path}` }).page;
  }

  it("names every family of the list from its literal names and any non-empty id or token", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ro", "ru"),
        SEGMENT,
        fc.constantFrom(...LISTED_STEPS),
        (locale, segment, step) => {
          expect(pageOfPath(`/${locale}`)).toBe("/[locale]");
          expect(pageOfPath(`/${locale}/configurator/room`)).toBe(
            "/[locale]/configurator/room",
          );
          expect(pageOfPath(`/${locale}/configurator/contact`)).toBe(
            "/[locale]/configurator/contact",
          );
          expect(pageOfPath(`/${locale}/d/${segment}`)).toBe(
            "/[locale]/d/[id]",
          );
          expect(pageOfPath(`/${locale}/d/${segment}/${step}`)).toBe(
            `/[locale]/d/[id]/${step}`,
          );
          expect(pageOfPath(`/${locale}/s/${segment}`)).toBe(
            "/[locale]/s/[token]",
          );
        },
      ),
    );
  });

  it("writes `other` for every path outside the list, whatever its segments hold", () => {
    const outside = fc.oneof(
      fc
        .tuple(
          fc.constantFrom("ro", "ru"),
          SEGMENT.filter(
            (first) => !["configurator", "d", "s"].includes(first),
          ),
          fc.array(SEGMENT, { maxLength: 3 }),
        )
        .map(
          ([locale, first, rest]) => `/${locale}/${[first, ...rest].join("/")}`,
        ),
      fc
        .tuple(fc.constantFrom("ro", "ru"), SEGMENT, SEGMENT, SEGMENT)
        .map(
          ([locale, id, step, extra]) =>
            `/${locale}/d/${id}/review/${step}/${extra}`,
        ),
      fc
        .tuple(fc.constantFrom("ro", "ru"), SEGMENT, SEGMENT)
        .map(([locale, token, extra]) => `/${locale}/s/${token}/${extra}`),
      fc
        .tuple(
          fc.constantFrom("ro", "ru"),
          SEGMENT.filter((step) => !LISTED_STEPS.includes(step)),
          SEGMENT,
        )
        .map(([locale, step, id]) => `/${locale}/d/${id}/${step}`),
      fc
        .tuple(
          SEGMENT.filter((first) => first !== "ro" && first !== "ru"),
          SEGMENT,
        )
        .map(([first, second]) => `/${first}/${second}`),
    );

    fc.assert(
      fc.property(outside, (path) => {
        expect(pageOfPath(path)).toBe("other");
      }),
    );
  });

  it.each([
    ["an empty id", "/ro/d//review"],
    ["an empty token", "/ro/s/"],
    ["a trailing slash on the locale", "/ro/"],
    ["a locale in capitals", "/RO/s/TOKEN"],
    ["no locale", "/s/TOKEN"],
    ["a dot segment that moves the path out of the family", "/ro/d/../review"],
    ["the site's root", "/"],
  ])("writes `other` for %s", (_label, path) => {
    expect(pageOfPath(path)).toBe("other");
  });

  it("writes the locale from the first segment alone, also for a page outside the list", () => {
    expect(recordOf({ "document-uri": `${ORIGIN}/ru/zz` })).toMatchObject({
      locale: "ru",
      page: "other",
    });
    expect(recordOf({ "document-uri": `${ORIGIN}/xx/s/TOKEN` }).locale).toBe(
      "none",
    );
  });

  it("writes `other` for a document that is not an http address", () => {
    expect(recordOf({ "document-uri": "about:blank" }).page).toBe("other");
    expect(recordOf({ "document-uri": "javascript:/ro/s/TOKEN" }).page).toBe(
      "other",
    );
  });
});

describe("reduceCspReport: nothing of a visitor's address reaches the record (P1)", () => {
  /** A marker no closed value contains: a token's or a design id's length, from the alphabet of both, and a prefix
   *  that no word of the lists begins or ends with. */
  const MARKER = fc
    .stringMatching(/^[A-Za-z0-9_-]{21,43}$/)
    .map((tail) => `Zq7${tail}`);

  /** An address a browser could report, with the marker in a path segment after a family's literal names, in the
   *  query, in the fragment and in the user information, and never in the host (the host is what a record keeps). */
  function addressesWith(marker: string): fc.Arbitrary<string> {
    return fc
      .tuple(
        fc.constantFrom("https", "http"),
        fc.constantFrom("", `${marker}@`, `${marker}:${marker}@`),
        fc.constantFrom(
          `/ro/s/${marker}`,
          `/ru/s/${marker}`,
          `/ro/d/${marker}`,
          `/ru/d/${marker}/review`,
          `/ro/d/${marker}/contact`,
          `/ro/d/${marker}/done`,
          `/ro/zz/${marker}`,
          `/${marker}`,
          `/ro/configurator/room/${marker}`,
          `/ro/${marker}/${marker}`,
        ),
        fc.constantFrom("", `?t=${marker}`, `?${marker}`, `?a=1&t=${marker}`),
        fc.constantFrom("", `#${marker}`),
      )
      .map(
        ([scheme, userInfo, path, query, fragment]) =>
          `${scheme}://${userInfo}shop.test${path}${query}${fragment}`,
      );
  }

  /** Every field a browser sends or a forger adds, each holding the marker. */
  function reportsWith(marker: string): fc.Arbitrary<Record<string, unknown>> {
    return fc
      .tuple(
        addressesWith(marker),
        addressesWith(marker),
        addressesWith(marker),
        fc.constantFrom(
          "inline",
          "eval",
          `data:text/plain;base64,${marker}`,
          `blob:https://shop.test/${marker}`,
          `chrome-extension://${marker}/inject.js`,
        ),
      )
      .map(([documentUri, blockedUri, sourceFile, blockedKind]) => ({
        "document-uri": documentUri,
        referrer: documentUri,
        "blocked-uri": blockedKind === "inline" ? blockedUri : blockedKind,
        "source-file": sourceFile,
        "script-sample": marker,
        "original-policy": `script-src 'nonce-${marker}' 'strict-dynamic'`,
        "violated-directive": `script-src-elem 'nonce-${marker}'`,
        "effective-directive": "script-src-elem",
        disposition: "enforce",
        "status-code": 200,
        "line-number": 4,
        "column-number": 9,
        cookie: marker,
        token: marker,
        [`extra-${marker}`]: marker,
      }));
  }

  it("holds no marker, in any field, whatever address or field carried it", () => {
    fc.assert(
      fc.property(
        MARKER.chain((marker) =>
          reportsWith(marker).map((report) => ({ marker, report })),
        ),
        ({ marker, report }) => {
          const reduction = reduceCspReport(bodyOf(report), ORIGIN);

          expect(reduction.kind).toBe("report");
          expect(JSON.stringify(reduction)).not.toContain(marker);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("holds no marker when the chunk path of a source carries its query or fragment", () => {
    fc.assert(
      fc.property(MARKER, (marker) => {
        const reduction = reduceCspReport(
          bodyOf({
            "document-uri": `${ORIGIN}/ro/s/${marker}`,
            "source-file": `${ORIGIN}/_next/static/chunks/a1.js?t=${marker}#${marker}`,
          }),
          ORIGIN,
        );

        expect(recordFrom(reduction).source).toBe("/_next/static/chunks/a1.js");
        expect(JSON.stringify(reduction)).not.toContain(marker);
      }),
    );
  });
});

describe("reduceCspReport: any text is answered, in a closed shape (P2)", () => {
  const ANYTHING = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double(),
    fc.constant(null),
    fc.jsonValue(),
  );
  const URL_TEXT = fc.oneof(
    fc.webUrl({ withQueryParameters: true, withFragments: true }),
    fc.string(),
    fc.constantFrom("inline", "eval", "wasm-eval", "data", "blob", "", "self"),
  );
  const FIELD = fc.oneof(ANYTHING, URL_TEXT);
  const REPORT = fc.record(
    {
      "document-uri": FIELD,
      referrer: FIELD,
      "violated-directive": FIELD,
      "effective-directive": FIELD,
      "original-policy": FIELD,
      disposition: FIELD,
      "blocked-uri": FIELD,
      "source-file": FIELD,
      "line-number": FIELD,
      "column-number": FIELD,
      "status-code": FIELD,
      "script-sample": FIELD,
    },
    { requiredKeys: [] },
  );

  function isInAClosedSet(record: ReducedCspReport): boolean {
    const isDirective = [...CSP_DIRECTIVES, "other"].includes(record.directive);
    const isPage = [...CSP_PAGE_FAMILIES, "other"].includes(record.page);
    return (
      isDirective &&
      isPage &&
      ["ro", "ru", "none"].includes(record.locale) &&
      ["own", "foreign", "none"].includes(record.origin) &&
      (record.origin === "own" ||
        (record.page === "other" && record.source === undefined)) &&
      ["enforce", "report", "other"].includes(record.disposition) &&
      isAddressKind(record.blocked, false) &&
      (record.source === undefined || isAddressKind(record.source, true)) &&
      isBounded(record.line, 0, 10_000_000) &&
      isBounded(record.column, 0, 10_000_000) &&
      isBounded(record.status, 100, 599)
    );
  }

  function isAddressKind(text: string, mayBeAChunk: boolean): boolean {
    const isKeyword = [
      "inline",
      "eval",
      "wasm-eval",
      "self",
      "other",
      ...SCHEME_ONLY_KINDS,
    ].includes(text);
    const isOrigin = ORIGIN_ONLY.test(text) && text.length <= 255;
    const isChunk = mayBeAChunk && CHUNK_PATH.test(text) && text.length <= 255;
    return isKeyword || isOrigin || isChunk;
  }

  function isBounded(
    value: number | undefined,
    low: number,
    high: number,
  ): boolean {
    return (
      value === undefined ||
      (Number.isInteger(value) && value >= low && value <= high)
    );
  }

  it("answers not-a-report or a record whose keys are the allowed ones and whose values are closed, for any string", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const reduction = reduceCspReport(text, ORIGIN);

        if (reduction.kind === "report") {
          expect(
            Object.keys(reduction.record).every((key) =>
              ALLOWED_KEYS.includes(key),
            ),
          ).toBe(true);
          expect(isInAClosedSet(reduction.record)).toBe(true);
        }
      }),
    );
  });

  it("answers the same for any JSON value, and for a report of any fields of any type", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.jsonValue().map((value) => JSON.stringify(value)),
          fc
            .jsonValue()
            .map((value) => JSON.stringify({ "csp-report": value })),
          REPORT.map((report) => bodyOf(report)),
        ),
        (text) => {
          const reduction = reduceCspReport(text, ORIGIN);

          if (reduction.kind === "report") {
            expect(
              Object.keys(reduction.record).every((key) =>
                ALLOWED_KEYS.includes(key),
              ),
            ).toBe(true);
            expect(isInAClosedSet(reduction.record)).toBe(true);
          } else {
            expect(reduction).toEqual({ kind: "not-a-report" });
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("answers a record for every object `csp-report`, so that a report is refused only for its shape", () => {
    fc.assert(
      fc.property(REPORT, (report) => {
        expect(reduceCspReport(bodyOf(report), ORIGIN).kind).toBe("report");
      }),
    );
  });
});
