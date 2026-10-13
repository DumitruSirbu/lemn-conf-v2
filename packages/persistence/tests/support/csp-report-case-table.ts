import { CSP_REPORT_CAPACITY } from "../../src/csp-report-store.js";
import type {
  CspReportPlacement,
  CspReportRow,
} from "../../src/csp-report-store.js";

/**
 * The one table of cases both sides of `0009` are held to (8Q2 criterion 3): `requireValidCspReportRow` and
 * `requireValidCspReportPlacement` without a database, and the table's own constraints through a raw insert on the live
 * test database. Values are ASCII on purpose: whether a database's ctype counts a non-ASCII character as space or
 * control is not something this table can claim to know.
 */
export interface CspReportColumns extends Record<string, unknown> {
  slot: number;
  report_number: number;
  writer_mark: string;
  directive: string;
  blocked: string;
  source: string | null;
  line_number: number | null;
  column_number: number | null;
  page: string;
  locale: string;
  origin: string;
  disposition: string;
  status_code: number | null;
}

export interface CspReportCase {
  readonly label: string;
  readonly overrides: Partial<CspReportColumns>;
  readonly isAccepted: boolean;
  /** The constraints the table may name when it refuses the case; the first it finds is the one reported. */
  readonly constraints: readonly string[];
}

const THE_MARK = "a".repeat(64);

/** A row every check accepts, and the starting point of every case. */
export const ACCEPTED_COLUMNS: CspReportColumns = {
  slot: 5,
  report_number: 5,
  writer_mark: THE_MARK,
  directive: "script-src",
  blocked: "self",
  source: "/_next/static/x.js",
  line_number: 10,
  column_number: 5,
  page: "/[locale]/d/[id]/review",
  locale: "ro",
  origin: "own",
  disposition: "enforce",
  status_code: 200,
};

export function columnsOf(
  overrides: Partial<CspReportColumns>,
): CspReportColumns {
  return { ...ACCEPTED_COLUMNS, ...overrides };
}

/** The row a caller hands the store and the placement the store derives, from the table's columns. */
export function rowAndPlacementOf(columns: CspReportColumns): {
  row: CspReportRow;
  placement: CspReportPlacement;
} {
  return {
    row: {
      directive: columns.directive,
      blocked: columns.blocked,
      ...(columns.source === null ? {} : { source: columns.source }),
      ...(columns.line_number === null ? {} : { line: columns.line_number }),
      ...(columns.column_number === null
        ? {}
        : { column: columns.column_number }),
      page: columns.page,
      locale: columns.locale,
      origin: columns.origin,
      disposition: columns.disposition,
      ...(columns.status_code === null ? {} : { status: columns.status_code }),
      writerMark: columns.writer_mark,
    },
    placement: { slot: columns.slot, reportNumber: columns.report_number },
  };
}

const ADDRESS_CONSTRAINT = {
  blocked: "csp_reports_blocked_shape",
  source: "csp_reports_source_shape",
} as const;

type AddressColumn = keyof typeof ADDRESS_CONSTRAINT;

function addressCases(column: AddressColumn): CspReportCase[] {
  const constraint = ADDRESS_CONSTRAINT[column];
  const refused: [string, string][] = [
    ["a path", "https://a.example/x"],
    ["a query", "https://a.example?q=1"],
    ["a fragment", "https://a.example#f"],
    ["user-info", "https://u@a.example"],
    ["a 256-character origin", `https://${"a".repeat(248)}`],
    ["a space in the host", "https://a b.example"],
    ["a tab in the host", "https://a\tb.example"],
    ["a line feed in the host", "https://a\nb.example"],
    ["a control character in the host", "https://a\u0001b.example"],
    ["a delete character in the host", "https://a\u007fb.example"],
    ["a backslash in the host", "https://a\\b.example"],
    ["no host", "https://"],
    ["a scheme that is not http", "ftp://a.example"],
    ["a keyword in the wrong case", "SELF"],
  ];
  const accepted: [string, string][] = [
    ["an origin", "https://a.example"],
    ["an origin with a port", "http://a.example:8080"],
    ["an origin with a bracketed address", "https://[::1]:3000"],
    ["a 255-character origin", `https://${"a".repeat(247)}`],
    ["the keyword eval", "eval"],
    ["the keyword safari-web-extension", "safari-web-extension"],
  ];
  return [
    ...refused.map(([what, value]) =>
      refusal(`${column} of ${what}`, { [column]: value }, [constraint]),
    ),
    ...accepted.map(([what, value]) =>
      acceptance(`${column} of ${what}`, { [column]: value }),
    ),
  ];
}

function refusal(
  label: string,
  overrides: Partial<CspReportColumns>,
  constraints: readonly string[],
): CspReportCase {
  return { label, overrides, isAccepted: false, constraints };
}

function acceptance(
  label: string,
  overrides: Partial<CspReportColumns>,
): CspReportCase {
  return { label, overrides, isAccepted: true, constraints: [] };
}

/** `/[locale]` and three segments, the first two of 19 letters, the last as long as it takes: no segment is over 20. */
function pageOfLength(length: number): string {
  const leadingSegments = `/[locale]/${"a".repeat(19)}/${"a".repeat(19)}/`;
  return leadingSegments + "a".repeat(length - leadingSegments.length);
}

const SLOT_CONSTRAINTS = [
  "csp_reports_slot_is_within_capacity",
  "csp_reports_slot_follows_report_number",
];

export const CSP_REPORT_CASES: readonly CspReportCase[] = [
  ...addressCases("blocked"),
  ...addressCases("source"),
  refusal(
    "source of a chunk path with a query",
    { source: "/_next/static/x.js?v=1" },
    ["csp_reports_source_shape"],
  ),
  refusal(
    "source of a chunk path that is not a script",
    { source: "/_next/static/x.txt" },
    ["csp_reports_source_shape"],
  ),
  acceptance("source of a chunk path in a folder", {
    source: "/_next/static/chunks/a-b_c~d.js",
  }),
  acceptance("source absent", { source: null }),
  refusal(
    "page with an upper-case letter, a digit and an underscore",
    { page: "/[locale]/d/Ab3_x" },
    ["csp_reports_page_shape"],
  ),
  refusal("page with a digit", { page: "/[locale]/d/abc1" }, [
    "csp_reports_page_shape",
  ]),
  refusal("page of 65 characters", { page: pageOfLength(65) }, [
    "csp_reports_page_shape",
  ]),
  acceptance("page of 64 characters", { page: pageOfLength(64) }),
  refusal(
    "page with a segment of 21 characters",
    {
      page: `/[locale]/${"a".repeat(21)}`,
    },
    ["csp_reports_page_shape"],
  ),
  acceptance("page with a segment of 20 characters", {
    page: `/[locale]/${"a".repeat(20)}`,
  }),
  refusal("page with an empty segment", { page: "/[locale]//d" }, [
    "csp_reports_page_shape",
  ]),
  acceptance("page of the family with an id", {
    page: "/[locale]/d/[id]/review",
  }),
  acceptance("page of the family with a token", {
    page: "/[locale]/s/[token]",
  }),
  acceptance("page other", { page: "other" }),
  refusal("locale in upper case", { locale: "RO" }, [
    "csp_reports_locale_shape",
  ]),
  acceptance("locale none", { locale: "none" }),
  refusal(
    "an origin that is none of the three",
    { origin: "mine", source: null, page: "other" },
    ["csp_reports_origin_is_known"],
  ),
  refusal("a disposition that is none of the three", { disposition: "block" }, [
    "csp_reports_disposition_is_known",
  ]),
  refusal("a directive with a digit", { directive: "script-src2" }, [
    "csp_reports_directive_shape",
  ]),
  refusal("a line of 10,000,001", { line_number: 10_000_001 }, [
    "csp_reports_line_number_range",
  ]),
  refusal("a line of -1", { line_number: -1 }, [
    "csp_reports_line_number_range",
  ]),
  acceptance("a line of 10,000,000", { line_number: 10_000_000 }),
  acceptance("a line of 0", { line_number: 0 }),
  refusal("a status of 99", { status_code: 99 }, [
    "csp_reports_status_code_range",
  ]),
  refusal("a status of 600", { status_code: 600 }, [
    "csp_reports_status_code_range",
  ]),
  acceptance("a status of 100", { status_code: 100 }),
  acceptance("a status of 599", { status_code: 599 }),
  acceptance("every optional column absent", {
    source: null,
    line_number: null,
    column_number: null,
    status_code: null,
  }),
  refusal("a mark of 63 characters", { writer_mark: "a".repeat(63) }, [
    "csp_reports_writer_mark_is_sha256",
  ]),
  refusal("a mark in upper-case hex", { writer_mark: "A".repeat(64) }, [
    "csp_reports_writer_mark_is_sha256",
  ]),
  refusal("a slot of -1", { slot: -1 }, SLOT_CONSTRAINTS),
  refusal(
    "a slot of the capacity",
    { slot: CSP_REPORT_CAPACITY, report_number: CSP_REPORT_CAPACITY },
    SLOT_CONSTRAINTS,
  ),
  acceptance("the last slot", {
    slot: CSP_REPORT_CAPACITY - 1,
    report_number: CSP_REPORT_CAPACITY - 1,
  }),
  acceptance("the first slot, on the second lap", {
    slot: 0,
    report_number: CSP_REPORT_CAPACITY,
  }),
  acceptance("slot 1, on the second lap", {
    slot: 1,
    report_number: CSP_REPORT_CAPACITY + 1,
  }),
  refusal(
    "a slot that is not the report number modulo the capacity",
    { slot: 6, report_number: 5 },
    ["csp_reports_slot_follows_report_number"],
  ),
  refusal("the first slot on the first lap", { slot: 0, report_number: 1 }, [
    "csp_reports_slot_follows_report_number",
  ]),
  refusal("a report number of 0", { slot: 0, report_number: 0 }, [
    "csp_reports_report_number_is_positive",
  ]),
  refusal(
    "a source with an origin that is foreign",
    { origin: "foreign", page: "other" },
    ["csp_reports_source_only_for_own"],
  ),
  refusal(
    "a page other than other with an origin of none",
    { origin: "none", source: null },
    ["csp_reports_page_only_for_own"],
  ),
  acceptance("an origin of none with no source and the page other", {
    origin: "none",
    source: null,
    page: "other",
  }),
];
