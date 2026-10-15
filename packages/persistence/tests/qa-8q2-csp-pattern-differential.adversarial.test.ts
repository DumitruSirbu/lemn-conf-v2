// Wave 8Q2, QA's differential of the two sides of migration 0009's regular expressions (criterion 3, the first of
// "Three guards that look thorough and cannot fail": a code check and a table check that agree only because one fed the
// other). The patterns are READ OUT OF THE MIGRATION'S TEXT, not retyped, and the database is asked one read-only
// question, `select ... from generate_series(...) where chr(n) ~ pattern`, over every Unicode scalar value. No table is
// read, nothing is written, no DDL runs: a query over literals that this suite's other files could not even name.
//
// What must hold, per pattern: the code (`requireValidCspReportRow`) never admits a character the table refuses. The
// converse is allowed and documented (the code is stricter about non-ASCII space, which a database's ctype may or may
// not count), because a row the code refuses is an `unstored` line and a row the code admits and the table refuses is a
// silent loss with no line the code could have written. Over ASCII both sides must agree exactly.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import { requireValidCspReportRow } from "../src/csp-report-store.js";
import type { CspReportRow } from "../src/csp-report-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";

const SUITE_NAME =
  "migration 0009's patterns against the code's checks (read-only, live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const MIGRATION_SQL = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "src",
    "migrations",
    "0009_create_csp_reports.sql",
  ),
  "utf8",
);

const LAST_SCALAR_VALUE = 0x10ffff;
const FIRST_SURROGATE = 0xd800;
const LAST_SURROGATE = 0xdfff;
const LAST_ASCII = 0x7f;
const SWEEP_TIMEOUT_MS = 120_000;

/** The first quoted pattern after `~` that follows the named constraint, exactly as the file spells it. */
function patternOf(constraintName: string): string {
  const start = MIGRATION_SQL.indexOf(`constraint ${constraintName} check`);
  expect(start, `${constraintName} is in the migration`).toBeGreaterThan(-1);
  const open = MIGRATION_SQL.indexOf("~ '", start) + "~ '".length;
  return MIGRATION_SQL.slice(open, MIGRATION_SQL.indexOf("'", open));
}

const BARE_ROW: CspReportRow = {
  directive: "other",
  blocked: "inline",
  page: "other",
  locale: "none",
  origin: "none",
  disposition: "report",
  writerMark: "a".repeat(64),
};

interface Probe {
  readonly name: string;
  readonly constraint: string;
  /** The text both sides are asked about when the character is `character`. */
  readonly valueWith: (character: string) => string;
  /** The row the code is asked about for that text. */
  readonly rowWith: (value: string) => CspReportRow;
}

const OWN_ORIGIN_ROW: CspReportRow = { ...BARE_ROW, origin: "own" };

const PROBES: readonly Probe[] = [
  {
    name: "a writer mark's last character",
    constraint: "csp_reports_writer_mark_is_sha256",
    valueWith: (character) => `${"a".repeat(63)}${character}`,
    rowWith: (value) => ({ ...BARE_ROW, writerMark: value }),
  },
  {
    name: "a directive's second character",
    constraint: "csp_reports_directive_shape",
    valueWith: (character) => `s${character}`,
    rowWith: (value) => ({ ...BARE_ROW, directive: value }),
  },
  {
    name: "a locale's second letter",
    constraint: "csp_reports_locale_shape",
    valueWith: (character) => `r${character}`,
    rowWith: (value) => ({ ...BARE_ROW, locale: value }),
  },
  {
    name: "a character inside a page segment",
    constraint: "csp_reports_page_shape",
    valueWith: (character) => `/[locale]/a${character}b`,
    rowWith: (value) => ({ ...OWN_ORIGIN_ROW, page: value }),
  },
  {
    name: "a character inside a chunk path's file name",
    constraint: "csp_reports_source_shape",
    valueWith: (character) => `/_next/static/a${character}b.js`,
    rowWith: (value) => ({ ...OWN_ORIGIN_ROW, source: value }),
  },
  {
    name: "a character inside a blocked origin's host",
    constraint: "csp_reports_blocked_shape",
    valueWith: (character) => `https://a${character}b`,
    rowWith: (value) => ({ ...BARE_ROW, blocked: value }),
  },
  {
    name: "a character inside a source origin's host",
    constraint: "csp_reports_source_shape",
    valueWith: (character) => `https://a${character}b`,
    rowWith: (value) => ({ ...OWN_ORIGIN_ROW, source: value }),
  },
];

function isAdmittedByCode(row: CspReportRow): boolean {
  try {
    requireValidCspReportRow(row);
    return true;
  } catch {
    return false;
  }
}

/** Every Unicode scalar value but NUL (a text value cannot hold it) and the surrogates (no well-formed text has one). */
function* scalarValues(): Generator<number> {
  for (let value = 1; value <= LAST_SCALAR_VALUE; value += 1) {
    if (value >= FIRST_SURROGATE && value <= LAST_SURROGATE) continue;
    yield value;
  }
}

const askedOfTheDatabase = new Map<Probe, Promise<ReadonlySet<number>>>();

/** The scalar values for which the probe's text matches its pattern as the server evaluates it, asked once per probe. */
function valuesAdmittedByTheDatabase(
  probe: Probe,
): Promise<ReadonlySet<number>> {
  const earlier = askedOfTheDatabase.get(probe);
  if (earlier !== undefined) return earlier;
  const asked = askTheDatabase(probe);
  askedOfTheDatabase.set(probe, asked);
  return asked;
}

async function askTheDatabase(probe: Probe): Promise<ReadonlySet<number>> {
  const [before = "", after = ""] = probe.valueWith("\u0000").split("\u0000");
  const pattern = patternOf(probe.constraint);
  const rows = (await neon(liveTestDatabaseUrl)`
    select coalesce(array_agg(n order by n), '{}'::int[]) as admitted
    from generate_series(1, ${LAST_SCALAR_VALUE}::int) n
    where n not between ${FIRST_SURROGATE}::int and ${LAST_SURROGATE}::int
      and (${before}::text || chr(n) || ${after}::text) ~ ${pattern}::text
  `) as { admitted: number[] }[];
  return new Set(rows[0]?.admitted ?? []);
}

function withoutStackTraces<Result>(work: () => Result): Result {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return work();
  } finally {
    Error.stackTraceLimit = limit;
  }
}

function codeAdmits(probe: Probe, value: number): boolean {
  return isAdmittedByCode(
    probe.rowWith(probe.valueWith(String.fromCodePoint(value))),
  );
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  describe.each(PROBES)("$name", (probe) => {
    it(
      "is never admitted by the code when the table refuses it, over every scalar value",
      async () => {
        const databaseAdmits = await valuesAdmittedByTheDatabase(probe);

        const admittedByCodeAndRefusedByTable = withoutStackTraces(() => {
          const found: string[] = [];
          for (const value of scalarValues()) {
            if (!databaseAdmits.has(value) && codeAdmits(probe, value)) {
              found.push(
                `U+${value.toString(16).toUpperCase().padStart(4, "0")}`,
              );
              if (found.length >= 20) break;
            }
          }
          return found;
        });

        expect(
          admittedByCodeAndRefusedByTable,
          "the code admits these but the table refuses them: a report would be lost without a line",
        ).toEqual([]);
        expect(
          databaseAdmits.size,
          "the question was put to a real server, which admits at least one character",
        ).toBeGreaterThan(0);
      },
      SWEEP_TIMEOUT_MS,
    );

    it(
      "is admitted or refused alike by both sides over the whole of ASCII",
      async () => {
        const databaseAdmits = await valuesAdmittedByTheDatabase(probe);

        const disagreements: string[] = [];
        for (let value = 1; value <= LAST_ASCII; value += 1) {
          if (databaseAdmits.has(value) !== codeAdmits(probe, value)) {
            disagreements.push(
              `U+${value.toString(16).toUpperCase().padStart(4, "0")} (table ${String(databaseAdmits.has(value))})`,
            );
          }
        }

        expect(disagreements).toEqual([]);
      },
      SWEEP_TIMEOUT_MS,
    );
  });

  describe("the checks that are not one character wide", () => {
    async function databaseAdmitsWhole(
      constraint: string,
      value: string,
      longestInCharacters: number,
    ): Promise<boolean> {
      const rows = (await neon(liveTestDatabaseUrl)`
        select (char_length(${value}::text) <= ${longestInCharacters}::int
          and ${value}::text ~ ${patternOf(constraint)}::text) as admitted
      `) as { admitted: boolean }[];
      return rows[0]?.admitted === true;
    }

    it.each([
      ["247 astral characters after the scheme, 255 in all", 247],
      ["248 astral characters after the scheme, 256 in all", 248],
      ["246 astral characters after the scheme, 254 in all", 246],
    ])(
      "counts characters, not UTF-16 units, as the table does: %s",
      async (_label, astralCount) => {
        const host = `https://${"\u{1D4B3}".repeat(astralCount)}`;

        const byTable = await databaseAdmitsWhole(
          "csp_reports_blocked_shape",
          host,
          255,
        );

        expect(isAdmittedByCode({ ...BARE_ROW, blocked: host })).toBe(byTable);
      },
    );

    it.each([
      [
        "the longest page",
        `/[locale]/${"a".repeat(19)}/${"a".repeat(19)}/${"a".repeat(15)}`,
      ],
      [
        "one character over",
        `/[locale]/${"a".repeat(19)}/${"a".repeat(19)}/${"a".repeat(16)}`,
      ],
      ["a segment of 20", `/[locale]/${"a".repeat(20)}`],
      ["a segment of 21", `/[locale]/${"a".repeat(21)}`],
      ["the family with a bracketed id", "/[locale]/d/[id]/review"],
      ["a trailing slash", "/[locale]/"],
      ["a doubled slash", "/[locale]//d"],
      ["a trailing line feed", "/[locale]\n"],
      ["other with a trailing line feed", "other\n"],
      ["the locale placeholder without its bracket", "/[locale"],
      ["a digit in a segment", "/[locale]/d1"],
      ["an underscore in a segment", "/[locale]/d_x"],
      ["an upper-case letter in a segment", "/[locale]/Ds"],
    ])(
      "gives a page the same verdict on both sides: %s",
      async (_label, page) => {
        const byTable = await databaseAdmitsWhole(
          "csp_reports_page_shape",
          page,
          64,
        );

        expect(isAdmittedByCode({ ...OWN_ORIGIN_ROW, page })).toBe(byTable);
      },
    );

    it.each([
      ["IPv6 literal with a port", "https://[::1]:3000", true],
      ["a punycode host", "https://xn--bcher-kva.example", true],
      ["a host with an underscore", "http://a_b.example", true],
      ["a host with a port", "http://a.example:8080", true],
      ["a bare scheme", "https://", false],
      ["a trailing line feed", "https://a.example\n", false],
      ["a leading space", " https://a.example", false],
      ["an upper-case scheme", "HTTPS://a.example", false],
      ["a scheme without slashes", "https:a.example", false],
      ["an at sign", "https://a@b", false],
      ["a path", "https://a.example/", false],
    ])(
      "gives a blocked origin one verdict on both sides: %s",
      async (_label, blocked, isExpectedAdmitted) => {
        const byTable = await databaseAdmitsWhole(
          "csp_reports_blocked_shape",
          blocked,
          255,
        );

        expect(byTable).toBe(isExpectedAdmitted);
        expect(isAdmittedByCode({ ...BARE_ROW, blocked })).toBe(byTable);
      },
    );
  });
});
