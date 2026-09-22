import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The live-suite gate **refuses** a misconfigured target rather than folding it into a skip
 * (M7 wave 7T, criterion 9).
 *
 * **Why this needs its own test.** `support/live-test-database.ts` answers one question for every
 * live suite in this package: is there a test database to run against? There are two ways to answer
 * "no" and only one of them is acceptable. *No variable is set* is a skip. *A variable is set and
 * names a database no destructive suite may touch* is a refusal, and it has to stay one: softened
 * into "not configured", a typo in `TEST_DATABASE_URL` would silence every live suite in this
 * package at once, green, which is the exact failure this wave exists to remove — wearing the
 * wave's own helper.
 *
 * **The import is dynamic on purpose.** The gate resolves its URL at module scope, so a static
 * import would run before `vi.stubEnv` could put the misconfigured value in place, and the
 * assertion would be about the developer's own environment instead of the stub.
 *
 * Nothing here connects: `resolveTestDatabaseUrl` refuses on the database *name*, before any driver
 * is constructed. `test-database-url.test.ts` covers the guard's other refusal — a target that
 * matches the name `DATABASE_URL` points at.
 */

/** Not on the allowlist in `src/test-database-url.ts`, and not the application's name either: the
 *  host is unroutable so a regression that reached the network would fail rather than arrive. */
const UNALLOWLISTED_DATABASE_NAME = "somebody_elses_database";
const UNALLOWLISTED_TARGET = `postgres://tester:unused@db.invalid:5432/${UNALLOWLISTED_DATABASE_NAME}`;

/** `Refusing to run live database tests` alone is the shared prefix of **both** refusals in
 *  `src/test-database-url.ts`, so matching only that would pass if the allowlist check were
 *  replaced by the application-name one — a guard that needs `DATABASE_URL` to be set, which CI
 *  has not got. The name and the allowlist's own sentence pin which refusal fired. */
const ALLOWLIST_REFUSAL = new RegExp(
  `Refusing to run live database tests against "${UNALLOWLISTED_DATABASE_NAME}".*` +
    `not one of the databases this repository allows`,
  "s",
);

describe("the live-test-database gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses a target that is not an allowlisted test database, rather than reporting no database", async () => {
    vi.resetModules();
    vi.stubEnv("TEST_DATABASE_URL", UNALLOWLISTED_TARGET);

    await expect(import("./support/live-test-database.js")).rejects.toThrow(
      ALLOWLIST_REFUSAL,
    );
  });
});
