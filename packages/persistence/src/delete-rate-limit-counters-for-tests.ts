import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

/**
 * Set by vitest in every worker and by Playwright in every test worker (`TEST_WORKER_INDEX`), and by Playwright's own
 * runner process in its teardown (`PLAYWRIGHT_TEST_BASE_URL` is a user setting, so it is not relied on): the closest
 * proof that this process is a test runner and not the application.
 */
const TEST_RUNNER_MARKER_VARIABLES = ["VITEST", "TEST_WORKER_INDEX"] as const;

/** What a delete removed: how many rows, and each one's hit count, in no particular order. */
export interface RemovedRateLimitCounters {
  readonly rowsRemoved: number;
  readonly counts: readonly number[];
}

interface RemovedCounterRow {
  readonly hits: unknown;
}

/**
 * Deletes the counter rows of exactly the keys handed in, from the test database alone, and answers how many rows went
 * and the count each held. Test support only: it lives here because a Postgres driver appears in one package. The
 * connection is resolved here and never accepted, so `openTestDatabase()` refuses anything but an allowlisted test
 * database before any statement (ADR 0006); every key is checked as a digest before the connection is opened, so no
 * pattern, wildcard or list that reaches more than its own rows can be sent. One statement, not repeated after a lost
 * reply: a repeat would find nothing and answer a count of none for rows that did go.
 */
export async function deleteRateLimitCountersForTests(
  keys: readonly string[],
): Promise<RemovedRateLimitCounters> {
  assertRunningUnderATestRunner();
  keys.forEach((key) => {
    requireSha256Digest(key, "rate-limit bucket key", "delete counters");
  });
  if (keys.length === 0) return { rowsRemoved: 0, counts: [] };

  const sql = openTestDatabase();
  const rows = (await sql`
    delete from rate_limit_counters where bucket_key = any(${keys}) returning hits
  `) as RemovedCounterRow[];
  return { rowsRemoved: rows.length, counts: rows.map(countOf) };
}

function countOf({ hits }: RemovedCounterRow): number {
  if (typeof hits === "number" && Number.isInteger(hits) && hits >= 1) {
    return hits;
  }
  throw new Error(
    "The database answered a deleted counter row with something that is not a count",
  );
}

function assertRunningUnderATestRunner(): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "deleteRateLimitCountersForTests was called with NODE_ENV=production. It deletes counter rows and exists " +
        "only for test cleanup; application code must never reach it.",
    );
  }
  const isTestRunner = TEST_RUNNER_MARKER_VARIABLES.some(
    (variable) => (process.env[variable] ?? "").trim() !== "",
  );
  if (isTestRunner) return;

  throw new Error(
    `deleteRateLimitCountersForTests was called outside a test runner (none of ` +
      `${TEST_RUNNER_MARKER_VARIABLES.join(", ")} is set). It deletes counter rows and exists only for test ` +
      `cleanup; application code must never reach it.`,
  );
}
