import {
  CspReportStoreError,
  requireValidCspReportRow,
} from "./csp-report-store.js";
import type { CspReportRow, CspReportStore } from "./csp-report-store.js";
import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";

interface WrittenRow {
  report_number: unknown;
}

/** Results of one round trip: the two `set local` limits, then the write whose rows are the answer. */
const WRITE_RESULT_INDEX = 2;

/**
 * `CspReportStore` on Neon Postgres: a ring in `csp_reports`, numbered by `csp_report_cursor` (migration `0009`).
 * It never retries: a repeat after a lost reply would store the report twice, see ADR 0162.
 */
export class NeonCspReportStore implements CspReportStore {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async recordReport(row: CspReportRow): Promise<void> {
    requireValidCspReportRow(row);

    const reply = await this.runTranslatingFailures(row);

    if (!isOneWrittenReport(reply))
      throw new CspReportStoreError("record a report");
  }

  /**
   * One transaction, one round trip: `set local` bounds the wait for the cursor row's lock and the statement itself,
   * which the caller's deadline cannot (it abandons the reply, not the lock); `set` takes no parameters, so the limits
   * are literals. The casts type each parameter. `returning` is how the store knows a row was written: with no cursor
   * row the update yields nothing and the insert would otherwise succeed silently.
   */
  private runStatement(row: CspReportRow) {
    return this.sql.transaction((transaction) => [
      transaction`set local lock_timeout = '1000ms'`,
      transaction`set local statement_timeout = '2500ms'`,
      transaction`
        with advanced as (
          update csp_report_cursor set last_number = last_number + 1 where singleton returning last_number
        )
        insert into csp_reports (
          slot, report_number, received_at, writer_mark, directive, blocked, source,
          line_number, column_number, page, locale, origin, disposition, status_code
        )
        select (last_number % 10000)::integer, last_number, now(), ${row.writerMark}::text, ${row.directive}::text,
          ${row.blocked}::text, ${row.source ?? null}::text, ${row.line ?? null}::integer,
          ${row.column ?? null}::integer, ${row.page}::text, ${row.locale}::text, ${row.origin}::text,
          ${row.disposition}::text, ${row.status ?? null}::integer
        from advanced
        on conflict (slot) do update set
          report_number = excluded.report_number, received_at = excluded.received_at,
          writer_mark = excluded.writer_mark, directive = excluded.directive, blocked = excluded.blocked,
          source = excluded.source, line_number = excluded.line_number, column_number = excluded.column_number,
          page = excluded.page, locale = excluded.locale, origin = excluded.origin,
          disposition = excluded.disposition, status_code = excluded.status_code
        returning report_number
      `,
    ]);
  }

  /** Every driver failure, a synchronous throw included, leaves as a store error holding a built cause (ADR 0146 B3). */
  private async runTranslatingFailures(row: CspReportRow): Promise<unknown> {
    try {
      return writtenRowsOf(await this.runStatement(row));
    } catch (error) {
      throw new CspReportStoreError("record a report", reducedCauseOf(error));
    }
  }
}

/** The rows the write answered, the last result of the round trip. */
function writtenRowsOf(results: unknown): unknown {
  return Array.isArray(results) ? results[WRITE_RESULT_INDEX] : undefined;
}

/** The driver answers a `bigint` as text, so a number is read from either; a fraction or anything else is no number. */
function isOneWrittenReport(reply: unknown): boolean {
  if (!Array.isArray(reply) || reply.length !== 1) return false;
  const [written] = reply as readonly (WrittenRow | null)[];
  const reportNumber = written?.report_number;
  return (
    (typeof reportNumber === "number" &&
      Number.isSafeInteger(reportNumber) &&
      reportNumber > 0) ||
    (typeof reportNumber === "string" && /^[1-9][0-9]*$/.test(reportNumber))
  );
}
