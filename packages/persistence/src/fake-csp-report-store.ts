import {
  CSP_REPORT_CAPACITY,
  requireValidCspReportRow,
  slotOf,
} from "./csp-report-store.js";
import type {
  CspReportPlacement,
  CspReportRow,
  CspReportStore,
} from "./csp-report-store.js";

/** A slot as the table holds it: every column, an absent optional one as `null`. */
export interface HeldCspReport extends CspReportPlacement {
  readonly writerMark: string;
  readonly directive: string;
  readonly blocked: string;
  readonly source: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly page: string;
  readonly locale: string;
  readonly origin: string;
  readonly disposition: string;
  readonly status: number | null;
}

/** In-memory `CspReportStore`: the same ring as `NeonCspReportStore`, with the capacity a constructor argument so a
 *  test can wrap it in a few writes. */
export class FakeCspReportStore implements CspReportStore {
  private readonly slots = new Map<number, HeldCspReport>();
  private lastNumber = 0;
  private readonly capacity: number;

  constructor(capacity: number = CSP_REPORT_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error(
        "Refusing to make a fake CSP report store: its capacity must be a whole number of at least 1.",
      );
    }
    this.capacity = capacity;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- a rejected promise for a refusal, as the Neon store gives.
  async recordReport(row: CspReportRow): Promise<void> {
    requireValidCspReportRow(row);
    this.lastNumber += 1;
    const placement = {
      slot: slotOf(this.lastNumber, this.capacity),
      reportNumber: this.lastNumber,
    };
    this.slots.set(placement.slot, heldFrom(row, placement));
  }

  /** The rows the table would hold, by slot. */
  heldReports(): readonly HeldCspReport[] {
    return [...this.slots.values()].sort(
      (left, right) => left.slot - right.slot,
    );
  }

  /** The cursor: how many reports were ever stored. */
  reportsEverStored(): number {
    return this.lastNumber;
  }
}

function heldFrom(
  row: CspReportRow,
  placement: CspReportPlacement,
): HeldCspReport {
  return {
    ...placement,
    writerMark: row.writerMark,
    directive: row.directive,
    blocked: row.blocked,
    source: row.source ?? null,
    line: row.line ?? null,
    column: row.column ?? null,
    page: row.page,
    locale: row.locale,
    origin: row.origin,
    disposition: row.disposition,
    status: row.status ?? null,
  };
}
