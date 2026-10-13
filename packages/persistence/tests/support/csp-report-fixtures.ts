import fc from "fast-check";

import type { CspReportRow } from "../../src/csp-report-store.js";

/** A mark in the shape the table checks, distinct per letter so two writers can be told apart. */
export function markOf(letter: string): string {
  return letter.repeat(64);
}

const KEYWORD_ADDRESSES = [
  "self",
  "inline",
  "eval",
  "wasm-eval",
  "other",
  "data",
  "blob",
];
const PAGES = [
  "/[locale]",
  "/[locale]/configurator/room",
  "/[locale]/d/[id]",
  "/[locale]/d/[id]/review",
  "/[locale]/s/[token]",
  "other",
];
const HEX_DIGITS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
];

const addressArbitrary = fc.oneof(
  fc.constantFrom(...KEYWORD_ADDRESSES),
  fc.domain().map((domain) => `https://${domain}`),
);
const sourceArbitrary = fc.oneof(
  addressArbitrary,
  fc.constantFrom("/_next/static/a.js", "/_next/static/chunks/a-b_c~d.js"),
);
const optionalInteger = (lowest: number, highest: number) =>
  fc.option(fc.integer({ min: lowest, max: highest }), { nil: undefined });

/** Any row the table accepts: the optional columns present or absent, the origin of each kind. */
export const validCspReportRow: fc.Arbitrary<CspReportRow> = fc
  .record({
    directive: fc.constantFrom("script-src", "style-src", "other"),
    blocked: addressArbitrary,
    source: fc.option(sourceArbitrary, { nil: undefined }),
    line: optionalInteger(0, 10_000_000),
    column: optionalInteger(0, 10_000_000),
    page: fc.constantFrom(...PAGES),
    locale: fc.constantFrom("ro", "ru", "none"),
    origin: fc.constantFrom("own", "foreign", "none"),
    disposition: fc.constantFrom("enforce", "report", "other"),
    status: optionalInteger(100, 599),
    writerMark: fc
      .array(fc.constantFrom(...HEX_DIGITS), { minLength: 64, maxLength: 64 })
      .map((digits) => digits.join("")),
  })
  .map(withoutAbsentKeys)
  .map(ownOriginOnly);

/** `exactOptionalPropertyTypes`: an absent field has no key, not an `undefined` one. */
function withoutAbsentKeys(drawn: Record<string, unknown>): CspReportRow {
  return Object.fromEntries(
    Object.entries(drawn).filter(([, value]) => value !== undefined),
  ) as unknown as CspReportRow;
}

/** A source and a page belong to this application's own origin alone (ADR 0161 F2, F3). */
function ownOriginOnly(row: CspReportRow): CspReportRow {
  if (row.origin === "own") return row;
  const withoutSource = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "source"),
  ) as unknown as CspReportRow;
  return { ...withoutSource, page: "other" };
}

/** A row with every optional column set, for the overwrite property. */
export function aFullRow(mark: string): CspReportRow {
  return {
    directive: "script-src",
    blocked: "https://old.example",
    source: "/_next/static/old.js",
    line: 11,
    column: 22,
    page: "/[locale]/d/[id]/review",
    locale: "ro",
    origin: "own",
    disposition: "enforce",
    status: 200,
    writerMark: mark,
  };
}

/** A row with every optional column absent. */
export function aBareRow(mark: string): CspReportRow {
  return {
    directive: "other",
    blocked: "inline",
    page: "other",
    locale: "none",
    origin: "none",
    disposition: "report",
    writerMark: mark,
  };
}
