import { requireTestRunner } from "./require-test-runner.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

interface RemovedReportRow {
  readonly slot: unknown;
}

/**
 * Removes the CSP report rows written under exactly the writer marks handed in, from the test database alone, and
 * answers how many went. Test support only: it lives here because a Postgres driver appears in one package, and the
 * application role has no `DELETE` on `csp_reports`, so a test's rows leave only through this (ADR 0151, ADR 0162). The
 * connection is resolved here and never accepted, so `openTestDatabase()` refuses anything but an allowlisted test
 * database before any statement (ADR 0006); every mark is checked as a digest before the connection is opened, so no
 * pattern, wildcard or list that reaches more than its own rows can be sent. One statement, not repeated after a lost
 * reply: a repeat would find nothing and answer none for rows that did go.
 */
export async function deleteCspReportsForTests(
  marks: readonly string[],
): Promise<number> {
  requireTestRunner({
    functionName: "deleteCspReportsForTests",
    effect: "deletes CSP report rows",
  });
  marks.forEach((mark) => {
    requireSha256Digest(mark, "CSP report writer mark", "delete CSP reports");
  });
  if (marks.length === 0) return 0;

  const sql = openTestDatabase();
  const removed = (await sql`
    delete from csp_reports where writer_mark = any(${marks}) returning slot
  `) as RemovedReportRow[];
  return removed.length;
}
