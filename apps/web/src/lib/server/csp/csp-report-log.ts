import "server-only";

import type { ReducedCspReport } from "@/lib/server/csp/csp-report";
import {
  UNAVAILABLE_CAUSES,
  type UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import { CSP_REPORT_WINDOW_MINUTES } from "@/lib/server/rate-limit/limit-policy";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

// This module is handed a reduced record (closed values and bounded integers), a cause from the limiter's closed list
// and an instant: no request, body, header, address or thrown value reaches it, so none can be logged.

/** Grepped for in a platform log view, so it is one literal. */
const CSP_REPORT_LABEL = "[csp]";
const VIOLATION_EVENT = "csp-violation";
const UNAVAILABLE_EVENT = "csp-report-unavailable";
const LIMITED_EVENT = "csp-report-limited";
const UNEXPECTED_CAUSE: UnavailableCause = "judgement-failed";

const causesWritten = new Set<UnavailableCause>();
let hourOfLastLimitedLine: number | undefined;

/** The one line an accepted report is written as: `[csp]` and the record under the event's name. */
export function reportCspViolation(record: ReducedCspReport): void {
  write("warn", { event: VIOLATION_EVENT, ...record });
}

/** A report could not be judged and so was not taken: written once per process and cause, so a flood buys one write. */
export function reportCspReportUnavailable(cause: UnavailableCause): void {
  const known =
    UNAVAILABLE_CAUSES.find((candidate) => candidate === cause) ??
    UNEXPECTED_CAUSE;
  if (causesWritten.has(known)) return;
  causesWritten.add(known);
  write("error", { event: UNAVAILABLE_EVENT, cause: known });
}

/** The limiter refused a report: written once per process and limiter window; the memo is one number, so it cannot grow. */
export function reportCspReportLimited(instant: Date): void {
  const hour = utcWindowOf(
    instant,
    CSP_REPORT_WINDOW_MINUTES,
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
