import { neon } from "@neondatabase/serverless";

import { resolveTestDatabaseUrl } from "./test-database-url.js";

/**
 * Set by vitest in every worker it runs, and by Playwright in every test worker it forks
 * (`playwright/lib/worker/workerProcessEntry.js` assigns `TEST_WORKER_INDEX`). Presence of one of
 * them is the closest thing to proof that this process is a test runner rather than the
 * application.
 */
const TEST_RUNNER_MARKER_VARIABLES = ["VITEST", "TEST_WORKER_INDEX"] as const;

/**
 * Deletes the named designs from the **test** database. **Test support only.**
 *
 * It lives here for the reason every other statement in this package does: a Postgres driver
 * appears in exactly one package, which is what makes "no string-built SQL anywhere" auditable in
 * one place (`scripts/gates/boundary.sh`). A suite that mints rows still has to remove them
 * (ADR 0006's third mechanism), and doing that with its own `neon()` call put a driver import in
 * `apps/web` — a real boundary violation, and one the gate could not see until the file was
 * committed, because `git grep` searches tracked files only.
 *
 * The connection is resolved here rather than accepted as an argument. Accepting one meant the
 * caller decided which database a `DELETE` reached, and no caller ever ran the guard this comment
 * used to promise (finding DB-001). `resolveTestDatabaseUrl()` refuses anything but an allowlisted
 * test database, so there is no argument through which that refusal can be bypassed.
 *
 * "Never call this from application code" is enforced rather than documented: the function is
 * reachable from `apps/web` through the package index, so it refuses outright unless a test runner
 * is what is running it.
 */
export async function deleteDesignsForTests(
  ids: readonly string[],
): Promise<void> {
  assertRunningUnderATestRunner();
  if (ids.length === 0) return;

  const sql = neon(resolveTestDatabaseUrl());
  // One statement per id rather than one `= any(...)`: the id list is short, and a per-row delete
  // needs no array binding to be correct.
  for (const id of ids) await sql`delete from designs where id = ${id}`;
}

function assertRunningUnderATestRunner(): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "deleteDesignsForTests was called with NODE_ENV=production. It deletes design rows and " +
        "exists only for test cleanup; application code must never reach it.",
    );
  }

  // Non-empty, not merely present: `VITEST=""` is not a test runner.
  const isTestRunner = TEST_RUNNER_MARKER_VARIABLES.some(
    (variable) => (process.env[variable] ?? "") !== "",
  );
  if (isTestRunner) return;

  throw new Error(
    `deleteDesignsForTests was called outside a test runner (none of ` +
      `${TEST_RUNNER_MARKER_VARIABLES.join(", ")} is set). It deletes design rows and exists only ` +
      `for test cleanup; application code must never reach it.`,
  );
}
