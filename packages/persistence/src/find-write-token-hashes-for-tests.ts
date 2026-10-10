import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

/**
 * Set by vitest in every worker, by Playwright in every test worker (`TEST_WORKER_INDEX`) and in its own runner
 * process (`PLAYWRIGHT_TEST`): the closest proof that this process is a test runner and not the application.
 */
const TEST_RUNNER_MARKER_VARIABLES = [
  "VITEST",
  "TEST_WORKER_INDEX",
  "PLAYWRIGHT_TEST",
] as const;

interface WriteTokenHashRow {
  readonly write_token_hash: unknown;
}

/**
 * Answers the write-token hashes of exactly the designs whose ids are handed in, so a test's own cleanup can compute
 * the counter keys its saves were counted under before it deletes the designs. A read: it changes nothing. Test
 * support only, and guarded as the two test-only deletes are: the connection is resolved here and never accepted, so
 * `openTestDatabase()` refuses anything but an allowlisted test database, and it refuses outright unless a test
 * runner runs it and the process is not in production. A design with no hash, and an id with no design, answer
 * nothing.
 */
export async function findWriteTokenHashesForTests(
  ids: readonly string[],
): Promise<string[]> {
  assertRunningUnderATestRunner();
  if (ids.length === 0) return [];

  const sql = openTestDatabase();
  const rows = (await retryOnTransientFailure(
    () => sql`
      select write_token_hash from designs
      where id = any(${ids}) and write_token_hash is not null
    `,
  )) as WriteTokenHashRow[];
  return rows.map(hashOf);
}

function hashOf({ write_token_hash: hash }: WriteTokenHashRow): string {
  requireSha256Digest(
    hash,
    "stored write-token hash",
    "read a design's write-token hash",
  );
  return hash as string;
}

function assertRunningUnderATestRunner(): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "findWriteTokenHashesForTests was called with NODE_ENV=production. It reads write-token hashes and exists " +
        "only for test cleanup; application code must never reach it.",
    );
  }
  const isTestRunner = TEST_RUNNER_MARKER_VARIABLES.some(
    (variable) => (process.env[variable] ?? "").trim() !== "",
  );
  if (isTestRunner) return;

  throw new Error(
    `findWriteTokenHashesForTests was called outside a test runner (none of ` +
      `${TEST_RUNNER_MARKER_VARIABLES.join(", ")} is set). It reads write-token hashes and exists only for test ` +
      `cleanup; application code must never reach it.`,
  );
}
