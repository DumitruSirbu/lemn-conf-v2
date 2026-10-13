import "server-only";

import type { ReducedCspReport } from "@/lib/server/csp/csp-report";
import {
  UNAVAILABLE_CAUSES,
  type UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";

// The sink's two lines, with a label of their own. This module is handed a reduced record, which holds closed values
// and bounded integers only (`csp-report.ts`), and a cause from the limiter's closed list: no request, no body, no
// header, no address and no thrown value reaches it, so none can be written. Nothing is written for a refusal.

/** Grepped for in a platform log view, so it is one literal. */
const CSP_REPORT_LABEL = "[csp]";
const VIOLATION_EVENT = "csp-violation";
const UNAVAILABLE_EVENT = "csp-report-unavailable";
const UNEXPECTED_CAUSE: UnavailableCause = "judgement-failed";

const causesWritten = new Set<UnavailableCause>();

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

/** The one transport choice. The write may not throw: nothing is left to report a failed write with. */
function write(
  severity: "warn" | "error",
  line: Readonly<Record<string, string | number>>,
): void {
  try {
    (severity === "error" ? console.error : console.warn)(
      CSP_REPORT_LABEL,
      line,
    );
  } catch {
    // Nothing to fall back to, and nothing may escape.
  }
}
