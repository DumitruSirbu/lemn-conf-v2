import "server-only";

import {
  readDigester,
  type ServerEnvironment,
} from "@/lib/server/digest/digest-secret";

/** The one field of the writer purpose: the table the mark stands for, so the mark is a constant per secret. */
const WRITER_TABLE = "csp_reports";

/** `unavailable` carries nothing: not the variable's value, nor why the digest could not be made. */
export type CspReportWriterMark =
  | { readonly status: "usable"; readonly mark: string }
  | { readonly status: "unavailable" };

const UNAVAILABLE: CspReportWriterMark = Object.freeze({
  status: "unavailable",
});

/**
 * The mark every row this server writes carries: a keyed digest of a constant, so it names the environment's secret
 * and nothing of a report or a visitor (ADR 0162). Read from the environment at each call, as the limiter reads its
 * key, so no module holds either. A secret that cannot key a digest leaves no mark, and then no row is written.
 */
export function readCspReportWriterMark(
  environment: ServerEnvironment,
): CspReportWriterMark {
  const digester = readDigester(environment);
  if (digester.status === "unavailable") return UNAVAILABLE;
  try {
    const mark = digester.digest({
      purpose: "csp-report-writer",
      fields: { table: WRITER_TABLE },
    });
    return { status: "usable", mark };
  } catch {
    return UNAVAILABLE;
  }
}
