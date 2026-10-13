import { fc } from "@fast-check/vitest";
import { requireValidCspReportRow } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { reduceCspReport } from "@/lib/server/csp/csp-report";

/**
 * Criterion 12: every report the reduction accepts is a row the table accepts. A reduction change that made the table
 * refuse a row would otherwise be a silent loss in production, since the write is best effort. The persistence
 * package's own check stands for the table here, as it does for the store: it holds every check of migration `0009`.
 */
const WRITER_MARK = "ab".repeat(32);
const HOST_OF_255_CHARACTERS = `https://${"a".repeat(247)}`;
const HOST_OF_256_CHARACTERS = `https://${"a".repeat(248)}`;
const CHUNK_PATH_OF_255 = `/_next/static/${"c".repeat(255 - "/_next/static/.js".length)}.js`;
const CHUNK_PATH_OF_256 = `/_next/static/${"c".repeat(256 - "/_next/static/.js".length)}.js`;

const SOME_ADDRESS = fc.oneof(
  fc.string(),
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc.constantFrom(
    "inline",
    "eval",
    "self",
    "data",
    "blob",
    "wasm-eval",
    "chrome-extension://abcdef/x.js",
    "https://user:pw@host.example/p?q=1#f",
    "https://a b.example/",
    "https://café.example/",
    "HTTPS://UPPER.EXAMPLE/",
    "http://[::1]:8080/x",
    HOST_OF_255_CHARACTERS,
    HOST_OF_256_CHARACTERS,
    CHUNK_PATH_OF_255,
    CHUNK_PATH_OF_256,
    "https://shop.test/_next/static/chunks/a-1.js",
    "https://shop.test/_next/static/chunks/a 1.js",
    "https://shop.test/_next/static/chunks/a%201.js?v=1",
  ),
);

const SOME_DOCUMENT = fc.oneof(
  SOME_ADDRESS,
  fc.constantFrom(
    "https://shop.test/",
    "https://shop.test/ro",
    "https://shop.test/ru/d/AbC_dEf-123456789012/review",
    "https://shop.test/ro/s/Zq7ShareToken0123456789",
    "https://shop.test/ro/configurator/room",
    "https://shop.test/ro/d/abcdefghijklmnopqrstu/done?x=1#y",
    "https://shop.test/ру/x",
    "https://other.example/ro/d/x",
  ),
);

const SOME_NUMBER = fc.oneof(
  fc.integer({ min: -5, max: 10_000_005 }),
  fc.double(),
  fc.constantFrom(0, 99, 100, 599, 600, 10_000_000, 10_000_001, -1),
  fc.string(),
);

const SOME_REPORT = fc.record(
  {
    "document-uri": SOME_DOCUMENT,
    "blocked-uri": SOME_ADDRESS,
    "source-file": SOME_ADDRESS,
    "violated-directive": fc.oneof(
      fc.string(),
      fc.constantFrom("script-src-elem", "img-src", "x'y", "SCRIPT-SRC"),
    ),
    "effective-directive": fc.oneof(
      fc.string(),
      fc.constantFrom("style-src-attr", "frame-ancestors", "default-src"),
    ),
    disposition: fc.oneof(
      fc.string(),
      fc.constantFrom("enforce", "report", "block"),
    ),
    "line-number": SOME_NUMBER,
    "column-number": SOME_NUMBER,
    "status-code": SOME_NUMBER,
  },
  { requiredKeys: [] },
);

const SOME_OWN_ORIGIN = fc.oneof(
  fc.webUrl().map((url) => new URL(url).origin),
  fc.constantFrom(
    "https://shop.test",
    "http://localhost:3000",
    HOST_OF_255_CHARACTERS,
  ),
);

/** The record the reduction made, once the table's checks have passed it; `undefined` when the body is no report. */
function storableRecordOf(bodyText: string, ownOrigin: string) {
  const reduction = reduceCspReport(bodyText, ownOrigin);
  if (reduction.kind !== "report") return undefined;
  requireValidCspReportRow({ ...reduction.record, writerMark: WRITER_MARK });
  return reduction.record;
}

describe("every reduction of a report is a row the table accepts (criterion 12)", () => {
  it("holds for reports whose fields are arbitrary text, numbers and addresses, read at any own origin", () => {
    const records: unknown[] = [];

    fc.assert(
      fc.property(SOME_REPORT, SOME_OWN_ORIGIN, (report, ownOrigin) => {
        const body = JSON.stringify({ "csp-report": report });
        expect(() => {
          records.push(storableRecordOf(body, ownOrigin));
        }).not.toThrow();
      }),
      { numRuns: 2000 },
    );

    const kept = records.filter(Boolean) as {
      source?: string;
      origin: string;
    }[];
    expect(kept.length).toBe(2000);
    expect(kept.some(({ source }) => source !== undefined)).toBe(true);
    expect(new Set(kept.map(({ origin }) => origin))).toEqual(
      new Set(["own", "foreign", "none"]),
    );
  });

  it("holds for arbitrary JSON bodies, where most are no report at all", () => {
    fc.assert(
      fc.property(fc.json(), SOME_OWN_ORIGIN, (body, ownOrigin) => {
        expect(() => {
          storableRecordOf(body, ownOrigin);
        }).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it("holds for arbitrary JSON nested under csp-report", () => {
    fc.assert(
      fc.property(fc.jsonValue(), SOME_OWN_ORIGIN, (inner, ownOrigin) => {
        expect(() => {
          storableRecordOf(JSON.stringify({ "csp-report": inner }), ownOrigin);
        }).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
