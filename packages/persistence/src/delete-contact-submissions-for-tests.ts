import { requireClientRequestIds } from "./require-client-request-ids.js";
import { requireTestRunner } from "./require-test-runner.js";
import { openTestDatabase } from "./test-database-url.js";

interface RemovedSubmissionRow {
  readonly client_request_id: unknown;
}

/**
 * Removes the contact requests whose ids are handed in, from the test database alone, and answers how many went. Test
 * support only: it lives here because a Postgres driver appears in one package, and the synthetic rows a test stores
 * must be removed by the ids the test wrote. The connection is resolved here and never accepted, so
 * `openTestDatabase()` refuses anything but an allowlisted test database before any statement (ADR 0006), and every
 * id is checked as a request id's shape before the connection is opened. One statement, naming the table once and the
 * ids as one bound array; it returns the key column only, since it is the count that is wanted and no personal column
 * is named. It is not repeated after a lost reply: a repeat would find nothing and answer none for rows that did go.
 */
export async function deleteContactSubmissionsForTests(
  ids: readonly string[],
): Promise<number> {
  requireTestRunner({
    functionName: "deleteContactSubmissionsForTests",
    effect: "deletes contact request rows",
  });
  requireClientRequestIds(ids, "delete contact requests");
  if (ids.length === 0) return 0;

  const sql = openTestDatabase();
  const removed = (await sql`
    delete from contact_submissions where client_request_id = any(${ids}) returning client_request_id
  `) as RemovedSubmissionRow[];
  return removed.length;
}
