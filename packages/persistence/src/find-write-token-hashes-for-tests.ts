import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { requireTestRunner } from "./require-test-runner.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

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
  requireTestRunner({
    functionName: "findWriteTokenHashesForTests",
    effect: "reads write-token hashes",
  });
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
