import { requireTestRunner } from "./require-test-runner.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

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
  requireTestRunner({
    functionName: "deleteRateLimitCountersForTests",
    effect: "deletes counter rows",
  });
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
