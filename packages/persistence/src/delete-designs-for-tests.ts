import { requireTestRunner } from "./require-test-runner.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { openTestDatabase } from "./test-database-url.js";

/**
 * Deletes the named designs from the test database. Test support only. It lives here because a Postgres driver appears
 * in exactly one package (`scripts/gates/boundary.sh`). The connection is resolved here, not accepted as an argument:
 * `openTestDatabase()` refuses anything but an allowlisted test database, so no caller can bypass the guard
 * (finding DB-001; ADR 0006's third mechanism). The function is reachable from `apps/web` through the package index, so
 * it refuses outright unless a test runner is running it.
 */
export async function deleteDesignsForTests(
  ids: readonly string[],
): Promise<void> {
  requireTestRunner({
    functionName: "deleteDesignsForTests",
    effect: "deletes design rows",
  });
  if (ids.length === 0) return;

  const sql = openTestDatabase();
  // One statement per id rather than one `= any(...)`: the id list is short, and a per-row delete needs no array
  // binding.
  for (const id of ids)
    await retryOnTransientFailure(
      () => sql`delete from designs where id = ${id}`,
    );
}

/**
 * Answers which of `ids` still have a row: read-only, behind the same guard as {@link deleteDesignsForTests}. Test
 * support only. Since ADR 0114 decision 5 every cookie-less caller gets 404 whether or not a row exists, so an e2e spec
 * can prove a delete only by reading the table directly.
 */
export async function findDesignIdsForTests(
  ids: readonly string[],
): Promise<string[]> {
  requireTestRunner({
    functionName: "findDesignIdsForTests",
    effect: "reads design ids",
  });
  if (ids.length === 0) return [];

  const sql = openTestDatabase();
  const rows = (await retryOnTransientFailure(
    () => sql`select id from designs where id = any(${ids})`,
  )) as { id: string }[];
  return rows.map((row) => row.id);
}
