/**
 * The write `NeonCspReportStore` sends, in the form the mocked driver records it: whitespace collapsed, each
 * interpolated value as `?`. The driver test holds the store to this text exactly, and the privilege test numbers its
 * placeholders and asks the server to plan it, so the statement the role is shown able to run is the one the store
 * sends and not a copy that could drift.
 */
export const RECORD_REPORT_STATEMENT_TEXT =
  "with advanced as ( update csp_report_cursor set last_number = last_number + 1 where singleton " +
  "returning last_number ) insert into csp_reports ( slot, report_number, received_at, writer_mark, " +
  "directive, blocked, source, line_number, column_number, page, locale, origin, disposition, status_code ) " +
  "select (last_number % 10000)::integer, last_number, now(), ?::text, ?::text, ?::text, ?::text, " +
  "?::integer, ?::integer, ?::text, ?::text, ?::text, ?::text, ?::integer from advanced " +
  "on conflict (slot) do update set report_number = excluded.report_number, " +
  "received_at = excluded.received_at, writer_mark = excluded.writer_mark, " +
  "directive = excluded.directive, blocked = excluded.blocked, source = excluded.source, " +
  "line_number = excluded.line_number, column_number = excluded.column_number, page = excluded.page, " +
  "locale = excluded.locale, origin = excluded.origin, disposition = excluded.disposition, " +
  "status_code = excluded.status_code returning report_number";

/** The two limits the write runs under, in the order the store sends them, before the write in the same transaction. */
export const RECORD_REPORT_LIMITS_TEXT = [
  "set local lock_timeout = '1000ms'",
  "set local statement_timeout = '2500ms'",
] as const;

/** The whole round trip as the mocked driver records it: the limits, then the write, joined by `; `. */
export const RECORD_REPORT_ROUND_TRIP_TEXT = [
  ...RECORD_REPORT_LIMITS_TEXT,
  RECORD_REPORT_STATEMENT_TEXT,
].join("; ");

/** `text` with its `?` placeholders numbered `$1`, `$2`, … in order, as the server's own protocol names them. */
export function withNumberedPlaceholders(text: string): string {
  let position = 0;
  return text.replace(/\?/g, () => {
    position += 1;
    return `$${String(position)}`;
  });
}

/** How many values the statement takes. */
export function placeholderCountOf(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}
