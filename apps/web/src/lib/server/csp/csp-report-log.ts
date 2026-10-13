import "server-only";

import type { ReducedCspReport } from "@/lib/server/csp/csp-report";
import {
  UNAVAILABLE_CAUSES,
  type UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

// The sink's three lines, each written as the label and ONE string of JSON, with a label of their own. This module is
// handed a reduced record, which holds closed values and bounded integers only (`csp-report.ts`), a cause from the
// limiter's closed list, and an instant: no request, no body, no header, no address and no thrown value reaches it,
// so none can be written. Nothing is written for a refusal, but the first of each hour (`reportCspReportLimited`).

/** Grepped for in a platform log view, so it is one literal. */
const CSP_REPORT_LABEL = "[csp]";
const VIOLATION_EVENT = "csp-violation";
const UNAVAILABLE_EVENT = "csp-report-unavailable";
const LIMITED_EVENT = "csp-report-limited";
/** The clock hour, the length of the `csp-report` policy's window: the limiter's own figure is not changed to share it. */
const LIMITED_LINE_WINDOW_MINUTES = 60;
const UNEXPECTED_CAUSE: UnavailableCause = "judgement-failed";

const causesWritten = new Set<UnavailableCause>();
let hourOfLastLimitedLine: number | undefined;

/** The one line an accepted report is written as: `[csp]` and the record under the event's name. */
export function reportCspViolation(record: ReducedCspReport): void {
  write("warn", { event: VIOLATION_EVENT, ...record });
}

/**
 * A report could not be judged and so was not taken: once for a process and a cause. A flood of requests that cannot
 * be judged must not buy a log write each, and the cause is the signal, not the count.
 */
export function reportCspReportUnavailable(cause: UnavailableCause): void {
  const known =
    UNAVAILABLE_CAUSES.find((candidate) => candidate === cause) ??
    UNEXPECTED_CAUSE;
  if (causesWritten.has(known)) return;
  causesWritten.add(known);
  write("error", { event: UNAVAILABLE_EVENT, cause: known });
}

/**
 * The limiter refused a report: once for a process and a UTC hour, so that one visitor spending the shared figure does
 * not silence real reports unseen, and a flood past the figure still buys one write an hour at most. The memo is one
 * number, so it cannot grow.
 */
export function reportCspReportLimited(instant: Date): void {
  const hour = utcWindowOf(
    instant,
    LIMITED_LINE_WINDOW_MINUTES,
  ).startsAt.getTime();
  if (hour === hourOfLastLimitedLine) return;
  hourOfLastLimitedLine = hour;
  write("warn", { event: LIMITED_EVENT });
}

/** The one transport choice. The write may not throw: nothing is left to report a failed write with. */
function write(
  severity: "warn" | "error",
  line: Readonly<Record<string, string | number>>,
): void {
  try {
    (severity === "error" ? console.error : console.warn)(
      CSP_REPORT_LABEL,
      JSON.stringify(line),
    );
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
