import { neon } from "@neondatabase/serverless";

import { retryOnComputeRestart } from "./retry-on-compute-restart.js";

import { resolveTestDatabaseUrl } from "./test-database-url.js";

/**
 * Set by vitest in every worker and by Playwright in every test worker (`TEST_WORKER_INDEX`): the closest proof that
 * this process is a test runner and not the application.
 */
const TEST_RUNNER_MARKER_VARIABLES = ["VITEST", "TEST_WORKER_INDEX"] as const;

/**
 * Deletes the named designs from the test database. Test support only. It lives here because a Postgres driver appears
 * in exactly one package (`scripts/gates/boundary.sh`). The connection is resolved here, not accepted as an argument:
 * `resolveTestDatabaseUrl()` refuses anything but an allowlisted test database, so no caller can bypass the guard
 * (finding DB-001; ADR 0006's third mechanism). The function is reachable from `apps/web` through the package index, so
 * it refuses outright unless a test runner is running it.
 */
export async function deleteDesignsForTests(
  ids: readonly string[],
): Promise<void> {
  assertRunningUnderATestRunner();
  if (ids.length === 0) return;

  const sql = neon(resolveTestDatabaseUrl());
  // One statement per id rather than one `= any(...)`: the id list is short, and a per-row delete needs no array
  // binding.
  for (const id of ids)
    await retryOnComputeRestart(
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
  assertRunningUnderATestRunner();
  if (ids.length === 0) return [];

  const sql = neon(resolveTestDatabaseUrl());
  const rows = (await retryOnComputeRestart(
    () => sql`select id from designs where id = any(${ids})`,
  )) as { id: string }[];
  return rows.map((row) => row.id);
}

function assertRunningUnderATestRunner(): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "deleteDesignsForTests was called with NODE_ENV=production. It deletes design rows and " +
        "exists only for test cleanup; application code must never reach it.",
    );
  }

  // Non-empty once trimmed, not merely present: neither `VITEST=""` nor `VITEST=" "` is a runner.
  const isTestRunner = TEST_RUNNER_MARKER_VARIABLES.some(
    (variable) => (process.env[variable] ?? "").trim() !== "",
  );
  if (isTestRunner) return;

  throw new Error(
    `deleteDesignsForTests was called outside a test runner (none of ` +
      `${TEST_RUNNER_MARKER_VARIABLES.join(", ")} is set). It deletes design rows and exists only ` +
      `for test cleanup; application code must never reach it.`,
  );
}
