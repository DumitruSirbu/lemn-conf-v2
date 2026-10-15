import { requireClientRequestIds } from "./require-client-request-ids.js";
import { requireTestRunner } from "./require-test-runner.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { openTestDatabase } from "./test-database-url.js";

interface CountRow {
  readonly stored: unknown;
}

/**
 * Counts the contact requests whose ids are handed in, on the test database alone: one number, with no column
 * selected, so no personal column and no snapshot can leave the table by it. A read, guarded as the test-only deletes
 * are. It is how a spec shows that a request stored nothing, or exactly one row.
 */
export async function countContactSubmissionsForTests(
  ids: readonly string[],
): Promise<number> {
  requireTestRunner({
    functionName: "countContactSubmissionsForTests",
    effect: "counts contact request rows",
  });
  requireClientRequestIds(ids, "count contact requests");
  if (ids.length === 0) return 0;

  const sql = openTestDatabase();
  const rows = (await retryOnTransientFailure(
    () => sql`
      select count(*)::int as stored from contact_submissions where client_request_id = any(${ids})
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
    "The database answered a count of contact requests with something that is not a count",
  );
}
