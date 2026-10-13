import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { fc } from "@fast-check/vitest";
import { requireValidCspReportRow } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import {
  CSP_DIRECTIVES,
  CSP_PAGE_FAMILIES,
  reduceCspReport,
} from "@/lib/server/csp/csp-report";

import { readSource, sourceFilesMatching } from "../server-source-support";

/**
 * Wave 8Q2, QA's attack on two promises of the write path. Criterion 12: every accepted reduction is a row the table
 * accepts, so a report is never answered 204 and then lost as `row-refused`; the developer's property draws arbitrary
 * text, and this one draws what a browser actually sends, the schemes and hosts and ports that real reports carry, at
 * the lengths where the two limits sit. Criterion 16, last line: the destructive and counting test helpers are named by
 * nothing in the application's source, and the route has no way to repeat or defer a store call.
 */
const OWN = "https://shop.test";
const A_MARK = "ab".repeat(32);

/** The row the route would hand the store for a body, or `undefined` when the body is no report. */
function rowOf(
  fields: Record<string, unknown>,
  ownOrigin: string = OWN,
): Record<string, unknown> | undefined {
  const reduction = reduceCspReport(
    JSON.stringify({ "csp-report": fields }),
    ownOrigin,
  );
  return reduction.kind === "report"
    ? { ...reduction.record, writerMark: A_MARK }
    : undefined;
}

function isStorable(row: Record<string, unknown>): boolean {
  try {
    requireValidCspReportRow(row as never);
    return true;
  } catch {
    return false;
  }
}

const BLOCKED_URIS = [
  "inline",
  "eval",
  "wasm-eval",
  "about:blank",
  "about:srcdoc",
  "ws://a.example/socket",
  "wss://a.example:8443/socket",
  "ftp://a.example/file",
  "file:///etc/passwd",
  "filesystem:https://a.example/temporary/x",
  "javascript:alert(1)",
  "trusted-types-policy",
  "trusted-types-sink",
  "https://[::1]:3000/x",
  "http://[2001:db8::1]/x",
  "http://192.0.2.7:8080/x",
  "https://xn--bcher-kva.example/x",
  "https://bücher.example/x",
  "http://a_b.example/",
  "https://a.example.:443/",
  "https://user:pass@a.example/",
  "https://A.EXAMPLE/",
  "HTTPS://a.example/",
  "data:text/html,<b>x</b>",
  "DATA:text/plain,x",
  "blob:https://a.example/uuid",
  "chrome-extension://abc/x.js",
  "moz-extension://abc/x.js",
  "safari-web-extension://abc/x.js",
  "https://",
  "https:///x",
  "http://a b.example/",
  "http://a\tb.example/",
  "http://a\\b.example/",
  "https://a.example\\@evil.example/",
  "",
  " ",
  "self",
  "'self'",
  "other",
  "\u0000",
];

const ORIGIN_OF_LENGTH = (length: number): string =>
  `https://${"a".repeat(length - "https://".length - ".example".length)}.example`;

describe("every reduction of a browser's report is a row the table accepts (criterion 12)", () => {
  it.each(BLOCKED_URIS)(
    "stores the reduction of blocked-uri %j, wherever it came from",
    (blocked) => {
      for (const documentOrigin of [OWN, "https://other.example", undefined]) {
        const row = rowOf({
          "document-uri":
            documentOrigin === undefined
              ? undefined
              : `${documentOrigin}/ro/configurator/room`,
          "blocked-uri": blocked,
          "source-file": `${OWN}/_next/static/chunks/a.js`,
          "effective-directive": "script-src-elem",
        });

        expect(row).toBeDefined();
        expect(isStorable(row ?? {}), JSON.stringify(row)).toBe(true);
      }
    },
  );

  it.each(BLOCKED_URIS)(
    "stores the reduction of source-file %j on the application's own page",
    (source) => {
      const row = rowOf({
        "document-uri": `${OWN}/ro/d/abc/review`,
        "source-file": source,
        "blocked-uri": "inline",
      });

      expect(isStorable(row ?? {}), JSON.stringify(row)).toBe(true);
    },
  );

  it("stores an origin of 255 characters and turns an origin of 256 into other, never into a row the table would refuse", () => {
    const longest = ORIGIN_OF_LENGTH(255);
    const one = rowOf({ "blocked-uri": `${longest}/x` });
    const tooLong = rowOf({ "blocked-uri": `${ORIGIN_OF_LENGTH(256)}/x` });

    expect(one?.blocked).toBe(longest);
    expect(isStorable(one ?? {})).toBe(true);
    expect(tooLong?.blocked).toBe("other");
    expect(isStorable(tooLong ?? {})).toBe(true);
  });

  it("stores a chunk path of 255 characters and keeps only self for one of 256", () => {
    const pathOfLength = (length: number): string => {
      const prefix = "/_next/static/";
      const suffix = ".js";
      return `${prefix}${"a".repeat(length - prefix.length - suffix.length)}${suffix}`;
    };

    const at255 = rowOf({
      "document-uri": `${OWN}/ro`,
      "source-file": `${OWN}${pathOfLength(255)}`,
    });
    const at256 = rowOf({
      "document-uri": `${OWN}/ro`,
      "source-file": `${OWN}${pathOfLength(256)}`,
    });

    expect(at255?.source).toBe(pathOfLength(255));
    expect(at256?.source).toBe("self");
    expect(isStorable(at255 ?? {})).toBe(true);
    expect(isStorable(at256 ?? {})).toBe(true);
  });

  it.each([
    "/_next/static/a%2Fb.js",
    "/_next/static/a%20b.js",
    "/_next/static/../x.js",
    "/_next/static/./x.js",
    "/_next/static//x.js",
    "/_next/static/x.js/",
    "/_next/static/x.JS",
    "/_next/static/é.js",
    "/_next/static/a;b.js",
    "/_next/static/a,b.js",
    "/_next/static/x.js%00",
    "/_next/static/x.js?a=b",
    "/_next/static/x.js#f",
  ])(
    "stores the reduction of the source path %j, whatever it becomes",
    (path) => {
      const row = rowOf({
        "document-uri": `${OWN}/ro`,
        "source-file": `${OWN}${path}`,
      });

      expect(isStorable(row ?? {}), JSON.stringify(row)).toBe(true);
    },
  );

  it("stores every page family at every origin kind, locale and directive of the closed lists", () => {
    const documentOrigins = [
      OWN,
      "https://other.example",
      "http://localhost:3000",
    ];
    const unreadable = [
      undefined,
      "",
      "not a url",
      "//scheme-relative.example/ro",
    ];
    for (const family of CSP_PAGE_FAMILIES) {
      const path = family
        .replace("[locale]", "ro")
        .replace("[id]", "abc")
        .replace("[token]", "xyz");
      for (const origin of documentOrigins) {
        for (const directive of CSP_DIRECTIVES) {
          const row = rowOf({
            "document-uri": `${origin}${path}`,
            "effective-directive": directive,
            disposition: "report",
            "status-code": 599,
            "line-number": 10_000_000,
            "column-number": 0,
          });
          expect(isStorable(row ?? {}), `${origin}${path} ${directive}`).toBe(
            true,
          );
        }
      }
    }
    for (const document of unreadable) {
      expect(isStorable(rowOf({ "document-uri": document }) ?? {})).toBe(true);
    }
  });

  it("stores the reduction of any scheme, host, port and path a report can name, over generated addresses", () => {
    const scheme = fc.constantFrom(
      "http",
      "https",
      "ws",
      "wss",
      "ftp",
      "file",
      "about",
      "blob",
      "data",
      "chrome-extension",
      "javascript",
    );
    const host = fc.oneof(
      fc.domain(),
      fc.ipV4(),
      fc.ipV6().map((address) => `[${address}]`),
    );
    const path = fc.stringMatching(/^(\/[A-Za-z0-9._~%-]{0,12}){0,6}$/);
    const address = fc
      .record({
        scheme,
        host,
        port: fc.option(fc.integer({ min: 0, max: 70_000 }), {
          nil: undefined,
        }),
        path,
        tail: fc.constantFrom("", "?q=1", "#f", "?a=b#c"),
      })
      .map(
        ({ scheme: s, host: h, port, path: p, tail }) =>
          `${s}://${h}${port === undefined ? "" : `:${String(port)}`}${p}${tail}`,
      );

    fc.assert(
      fc.property(
        address,
        address,
        path,
        fc.constantFrom(OWN, "https://other.example"),
        (blocked, source, documentPath, origin) => {
          const row = rowOf({
            "document-uri": `${origin}/ro${documentPath}`,
            "blocked-uri": blocked,
            "source-file": source,
          });

          expect(
            isStorable(row ?? {}),
            JSON.stringify([blocked, source, row]),
          ).toBe(true);
        },
      ),
      { numRuns: 800 },
    );
  });

  it("stores the reduction whatever own origin the server reads its request at", () => {
    fc.assert(
      fc.property(
        fc.webUrl({ authoritySettings: { withPort: true } }),
        (url) => {
          const ownOrigin = new URL(url).origin;
          const row = rowOf(
            {
              "document-uri": `${ownOrigin}/ro/s/abc`,
              "blocked-uri": `${ownOrigin}/x`,
              "source-file": `${ownOrigin}/_next/static/a.js`,
            },
            ownOrigin,
          );

          expect(row?.origin).toBe("own");
          expect(isStorable(row ?? {}), JSON.stringify(row)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("what the application's source may name, and how the route may call the store (criterion 16)", () => {
  const HELPERS =
    /\b(?:deleteCspReportsForTests|countCspReportsForTests|FakeCspReportStore)\b/;

  it("has no file under apps/web/src that names a test-only csp helper or the fake store", () => {
    expect(sourceFilesMatching(HELPERS)).toEqual([]);
  });

  it("has no file under any package's src outside the persistence package that names either test-only helper", () => {
    const packagesRoot = join(
      import.meta.dirname,
      "../../../../../../packages",
    );
    const unexpected: string[] = [];
    for (const name of ["configurator-domain", "three-adapter"]) {
      for (const file of walk(join(packagesRoot, name, "src"))) {
        if (HELPERS.test(readFileSync(file, "utf8"))) unexpected.push(file);
      }
    }

    expect(unexpected).toEqual([]);
  });

  it("calls the store once in the route, outside any loop, never from after() or a timer, and never retries", () => {
    const route = readSource("app/api/csp-reports/route.ts");

    expect(route.match(/\.recordReport\(/g)).toHaveLength(1);
    expect(route).not.toMatch(/\bafter\s*\(/);
    expect(route).not.toMatch(/from "next\/server"/);
    expect(route).not.toMatch(
      /\b(?:for|while)\s*\(|\.forEach\(|setInterval|queueMicrotask|waitUntil/,
    );
    expect(route).not.toMatch(/\bretry\b|\battempt\b/i);
    expect(route.match(/setTimeout\(/g)).toHaveLength(1);
  });

  it("writes the unstored line only with a cause the route's own closed type names", () => {
    const route = readSource("app/api/csp-reports/route.ts");
    const calls = route.match(/reportCspReportUnstored\([^)]*\)/g) ?? [];

    expect(calls).toEqual(["reportCspReportUnstored(kept.cause)"]);
  });

  it("reaches the store only through its instance module, and builds no store itself", () => {
    const sinkFiles = sourceFilesMatching(/NeonCspReportStore/);

    expect(sinkFiles).toEqual(["lib/server/csp/csp-report-store-instance.ts"]);
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
