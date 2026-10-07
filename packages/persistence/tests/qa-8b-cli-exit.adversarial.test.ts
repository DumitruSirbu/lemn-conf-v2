import { describe, expect, it } from "vitest";

import { spawnPersistenceCli } from "./support/spawn-persistence-cli.js";
import type { SpawnedCliResult } from "./support/spawn-persistence-cli.js";

/**
 * Adversarial QA of M8 wave 8B, criterion 6, at the real CLI entry points: a child process that prints its line and
 * then never exits is not measured by any in-process test, because `applyMigrations` settling says nothing about an
 * open handle keeping Node alive.
 *
 * `spawnPersistenceCli` reports a child it had to kill at its 30 s timeout as exit code 1, the same code a clean
 * failure gives, so every case here also bounds the elapsed time.
 *
 * All three connection variables are set, to fakes on `.invalid` (RFC 6761), so the child's `loadEnvLocal()` has none
 * of them left to fill from a local env file.
 */
const QA_PASSWORD = "FAKEPASSWORD_QA8B";
const QA_USER = "fakeuser_QA8B";
const QA_HOST = "fakehost-qa8b.invalid";
const TEST_ENVIRONMENT = "test";
const TEST_ENVIRONMENT_DATABASE = "lemn-conf-v2-staging";
const OTHER_VARIABLES_URL = `postgres://${QA_USER}:${QA_PASSWORD}@other-${QA_HOST}/appdb`;

const EXITS_ON_ITS_OWN_WITHIN_MS = 15_000;

const UNREACHABLE = `postgres://${QA_USER}:${QA_PASSWORD}@${QA_HOST}/${TEST_ENVIRONMENT_DATABASE}`;
const REFUSED_LOCAL_PORT = `postgres://${QA_USER}:${QA_PASSWORD}@127.0.0.1:1/${TEST_ENVIRONMENT_DATABASE}`;
const BAD_ESCAPE = `postgres://${QA_USER}:${QA_PASSWORD}%ZZ@${QA_HOST}/${TEST_ENVIRONMENT_DATABASE}`;

interface TimedCliResult extends SpawnedCliResult {
  readonly elapsedMs: number;
}

async function runCli(
  script: string,
  migrationUrl: string,
): Promise<TimedCliResult> {
  const startedAt = performance.now();
  const result = await spawnPersistenceCli(script, [TEST_ENVIRONMENT], {
    MIGRATION_DATABASE_URL: migrationUrl,
    DATABASE_URL: OTHER_VARIABLES_URL,
    TEST_DATABASE_URL: OTHER_VARIABLES_URL,
  });
  return { ...result, elapsedMs: performance.now() - startedAt };
}

function expectNoMarker({ stdout, stderr }: SpawnedCliResult): void {
  for (const marker of [QA_PASSWORD, QA_USER, QA_HOST]) {
    expect(stdout).not.toContain(marker);
    expect(stderr).not.toContain(marker);
  }
}

describe.each([
  ["src/migrate.ts", "[migrate]", "Could not connect to"],
  ["src/migrate-status.ts", "[migrate:status]", "Could not read the schema of"],
])("%s as a child process", (script, prefix, connectFailure) => {
  it.each([
    ["a well-formed unreachable host", UNREACHABLE],
    ["a refused local port", REFUSED_LOCAL_PORT],
  ])(
    "prints the connect failure for %s and exits 1 on its own",
    async (_label, migrationUrl) => {
      const result = await runCli(script, migrationUrl);

      expect(result.elapsedMs).toBeLessThan(EXITS_ON_ITS_OWN_WITHIN_MS);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`${prefix} MigrationExecutionError`);
      expect(result.stderr).toContain(connectFailure);
      expect(result.stdout).toBe("");
      expectNoMarker(result);
    },
  );

  it("names MIGRATION_DATABASE_URL for a bad percent-escape and exits 1 on its own", async () => {
    const result = await runCli(script, BAD_ESCAPE);

    expect(result.elapsedMs).toBeLessThan(EXITS_ON_ITS_OWN_WITHIN_MS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `${prefix} InvalidConnectionUrlError: MIGRATION_DATABASE_URL`,
    );
    expect(result.stdout).toBe("");
    expectNoMarker(result);
  });
});
