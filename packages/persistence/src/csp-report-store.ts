/** How many reports the table keeps; migration `0009` writes the same literal and a text test holds the two equal. */
export const CSP_REPORT_CAPACITY = 10_000;

/**
 * A browser's report as the server reduced it plus the server's own writer mark, see ADR 0161 decision 3. Its keys are
 * the reduction's, so the route hands one over unchanged: the table's `line_number`, `column_number` and `status_code`
 * are `line`, `column` and `status`. An absent optional field is `undefined`, never `null`.
 */
export interface CspReportRow {
  readonly directive: string;
  readonly blocked: string;
  readonly source?: string;
  readonly line?: number;
  readonly column?: number;
  readonly page: string;
  readonly locale: string;
  readonly origin: string;
  readonly disposition: string;
  readonly status?: number;
  /** `keyedDigest` of the writer purpose: 64 lowercase hex characters, one constant per environment. */
  readonly writerMark: string;
}

/** Where the ring puts a report: its number and the slot that number maps to. */
export interface CspReportPlacement {
  readonly slot: number;
  readonly reportNumber: number;
}

export type CspReportOperation = "record a report";

export interface CspReportStore {
  /**
   * Numbers the report and writes it into the ring, overwriting the oldest once full. Never repeated: a repeat after a
   * lost reply would store it twice. Rejects with a plain refusal for a row the table would refuse, and with
   * `CspReportStoreError` when the database gives no trustworthy answer.
   */
  recordReport(row: CspReportRow): Promise<void>;
}

/** The database refused, did not answer, or answered with something that is not one written row. Its `cause` is a
 *  `ReducedCause`, never the driver's own error. */
export class CspReportStoreError extends Error {
  readonly operation: CspReportOperation;

  constructor(operation: CspReportOperation, options?: ErrorOptions) {
    super(
      `The CSP report store could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "CspReportStoreError";
    this.operation = operation;
  }
}

const LONGEST_ADDRESS_LENGTH = 255;
const LONGEST_PAGE_LENGTH = 64;
const LARGEST_POSITION = 10_000_000;
const LOWEST_STATUS = 100;
const HIGHEST_STATUS = 599;
const FIRST_REPORT_NUMBER = 1;

const ADDRESS_KEYWORDS: ReadonlySet<string> = new Set([
  "self",
  "inline",
  "eval",
  "wasm-eval",
  "other",
  "data",
  "blob",
  "chrome-extension",
  "moz-extension",
  "safari-web-extension",
]);
const ORIGINS: ReadonlySet<string> = new Set(["own", "foreign", "none"]);
const DISPOSITIONS: ReadonlySet<string> = new Set([
  "enforce",
  "report",
  "other",
]);

/*
 * `0009`'s patterns written out, not copied: the SQL spells a literal `]` and the backslash as `[]` and
 * `[.backslash.]`, which a JavaScript pattern reads as something else. The host class may refuse a character the table
 * admits (a ctype counting fewer characters as space), never the reverse.
 */
const HTTP_ORIGIN = /^https?:\/\/[^/?#@\s\p{Cc}\\]+$/u;
const OWN_CHUNK_PATH = /^\/_next\/static(?:\/[A-Za-z0-9._~-]+)+\.js$/;
const WRITER_MARK = /^[0-9a-f]{64}$/;
const DIRECTIVE = /^[a-z-]{1,32}$/;
const PAGE = /^(?:other|\/\[locale\](?:\/[\]a-z[-]{1,20})*)$/;
const LOCALE = /^(?:[a-z]{2}|none)$/;

/** Every check `0009` makes on a caller's columns, see ADR 0153. A message names the field, never its value. */
export function requireValidCspReportRow(row: CspReportRow): void {
  requireField(
    isText(row.writerMark) && WRITER_MARK.test(row.writerMark),
    "writer mark",
    "64 lower-case hexadecimal characters",
  );
  requireShapes(row);
  requireRanges(row);
  requireOwnOriginForSourceAndPage(row);
}

/** The ring's placement rule, for tests: the stores place with `slotOf`, and the package does not export this. */
export function requireValidCspReportPlacement(
  { slot, reportNumber }: CspReportPlacement,
  capacity: number = CSP_REPORT_CAPACITY,
): void {
  requireField(
    Number.isSafeInteger(reportNumber) && reportNumber >= FIRST_REPORT_NUMBER,
    "report number",
    "a positive whole number",
  );
  requireField(
    Number.isSafeInteger(slot) && slot >= 0 && slot < capacity,
    "slot",
    "a whole number within the capacity",
  );
  requireField(
    slot === reportNumber % capacity,
    "slot",
    "the report number modulo the capacity",
  );
}

/** The slot a report number is written to. */
export function slotOf(reportNumber: number, capacity: number): number {
  return reportNumber % capacity;
}

function requireShapes(row: CspReportRow): void {
  requireField(
    isText(row.directive) && DIRECTIVE.test(row.directive),
    "directive",
    "a lower-case directive name",
  );
  requireField(isAddress(row.blocked), "blocked", "a keyword or an origin");
  requireField(
    row.source === undefined || isSource(row.source),
    "source",
    "a keyword, an origin or a chunk path",
  );
  requireField(isPage(row.page), "page", "another page or a page family");
  requireField(
    isText(row.locale) && LOCALE.test(row.locale),
    "locale",
    "two lower-case letters or none",
  );
  requireField(isMember(ORIGINS, row.origin), "origin", "own, foreign or none");
  requireField(
    isMember(DISPOSITIONS, row.disposition),
    "disposition",
    "enforce, report or other",
  );
}

function requireRanges(row: CspReportRow): void {
  requireOptionalInteger(row.line, 0, LARGEST_POSITION, "line");
  requireOptionalInteger(row.column, 0, LARGEST_POSITION, "column");
  requireOptionalInteger(row.status, LOWEST_STATUS, HIGHEST_STATUS, "status");
}

function requireOwnOriginForSourceAndPage(row: CspReportRow): void {
  requireField(
    row.source === undefined || row.origin === "own",
    "source",
    "absent unless the origin is own",
  );
  requireField(
    row.page === "other" || row.origin === "own",
    "page",
    "other unless the origin is own",
  );
}

function requireOptionalInteger(
  value: number | undefined,
  lowest: number,
  highest: number,
  field: string,
): void {
  requireField(
    value === undefined ||
      (Number.isInteger(value) && value >= lowest && value <= highest),
    field,
    `a whole number from ${String(lowest)} to ${String(highest)}, or absent`,
  );
}

function requireField(isValid: boolean, field: string, rule: string): void {
  if (isValid) return;
  throw new Error(
    `Refusing to record a CSP report: its ${field} must be ${rule}. The table would refuse the row.`,
  );
}

function isAddress(value: unknown): boolean {
  if (!isText(value) || isLongerThan(value, LONGEST_ADDRESS_LENGTH))
    return false;
  return ADDRESS_KEYWORDS.has(value) || HTTP_ORIGIN.test(value);
}

function isSource(value: unknown): boolean {
  return (
    isAddress(value) ||
    (isText(value) &&
      !isLongerThan(value, LONGEST_ADDRESS_LENGTH) &&
      OWN_CHUNK_PATH.test(value))
  );
}

function isPage(value: unknown): boolean {
  return (
    isText(value) &&
    !isLongerThan(value, LONGEST_PAGE_LENGTH) &&
    PAGE.test(value)
  );
}

function isMember(members: ReadonlySet<string>, value: unknown): boolean {
  return isText(value) && members.has(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

/** The table's `char_length` counts characters, not UTF-16 units. */
function isLongerThan(text: string, characters: number): boolean {
  return Array.from(text).length > characters;
}
