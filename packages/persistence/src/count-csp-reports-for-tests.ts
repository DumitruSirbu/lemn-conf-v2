import { requireTestRunner } from "./require-test-runner.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

interface CountRow {
  readonly stored: unknown;
}

/**
 * Counts the CSP report rows written under exactly the writer marks handed in, on the test database alone: one number,
 * with no column selected, so nothing a report holds can leave the table by it. A read, guarded as the test-only
 * delete is. It is how a teardown shows how many rows a run left before it removes them by the same marks.
 */
export async function countCspReportsForTests(
  marks: readonly string[],
): Promise<number> {
  requireTestRunner({
    functionName: "countCspReportsForTests",
    effect: "counts CSP report rows",
  });
  marks.forEach((mark) => {
    requireSha256Digest(mark, "CSP report writer mark", "count CSP reports");
  });
  if (marks.length === 0) return 0;

  const sql = openTestDatabase();
  const rows = (await retryOnTransientFailure(
    () => sql`
      select count(*)::int as stored from csp_reports where writer_mark = any(${marks})
    `,
  )) as CountRow[];
  return storedCountOf(rows);
}

function storedCountOf(rows: readonly CountRow[]): number {
  const stored = rows[0]?.stored;
  if (
    rows.length === 1 &&
    typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= 0
  ) {
    return stored;
  }
  throw new Error(
    "The database answered a count of CSP reports with something that is not a count",
  );
}
