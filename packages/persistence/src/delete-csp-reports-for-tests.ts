import { requireTestRunner } from "./require-test-runner.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

interface RemovedReportRow {
  readonly slot: unknown;
}

/**
 * Removes the CSP report rows written under exactly these writer marks, from the test database alone, and answers how
 * many went. The application role has no `DELETE` on `csp_reports`, so a test's rows leave only here, see ADR 0151.
 * The connection is never accepted, and every mark is checked as a digest before it opens, so no pattern or list can
 * reach more than its own rows. One statement, never repeated: a repeat would find nothing and answer none.
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
