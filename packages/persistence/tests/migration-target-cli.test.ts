import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { UNLISTED_DATABASE } from "../src/test-database-url.js";
import { spawnPersistenceCli } from "./support/spawn-persistence-cli.js";

const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

/**
 * docs/decisions/0169 AC6-AC9: both CLIs, spawned as real child processes so what an operator's
 * terminal would actually show is what gets asserted on.
 *
 * **R3 (safety rule, docs/decisions/0169 AC6-AC9), binding on every case here:** `MIGRATION_DATABASE_URL` is
 * always set explicitly, on the `.invalid` TLD (RFC 6761; never resolves), and never to `production` or
 * `lemn-conf-v2`. Mismatch cases declare `preview` against a URL naming `lemn-conf-v2` — the 2026-09-28
 * incident's exact shape. Pass-through cases declare the unlisted probe name `lemnaria_cli_probe`, which the
 * real local credential would also refuse, so each case stays safe even if `spawnPersistenceCli`'s
 * environment replacement were ever bypassed by accident.
 */

const PROBE_USER = "probe-user";
const PROBE_SECRET = "probe-secret-7f3a";
const PROBE_HOST = "db.example.invalid";

const MISMATCH_URL = `postgres://${PROBE_USER}:${PROBE_SECRET}@${PROBE_HOST}/lemn-conf-v2`;
const PASS_THROUGH_DATABASE = "lemnaria_cli_probe";
const PASS_THROUGH_URL = `postgres://${PROBE_USER}:${PROBE_SECRET}@${PROBE_HOST}/${PASS_THROUGH_DATABASE}`;

const SECRETS = [PROBE_USER, PROBE_SECRET, PROBE_HOST, "://"];

function expectNoSecretLeaked(...streams: readonly string[]): void {
  for (const stream of streams) {
    for (const secret of SECRETS) expect(stream).not.toContain(secret);
  }
}

describe("migrate — the environment check", () => {
  async function expectDeclarationRequired(
    args: readonly string[],
  ): Promise<void> {
    const result = await spawnPersistenceCli("src/migrate.ts", args, {
      MIGRATION_DATABASE_URL: MISMATCH_URL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^\[migrate\] /);
    expect(result.stderr).not.toContain("Could not connect");
    expect(result.stdout).toBe("");
  }

  it("requires the declaration, and connects nothing when no argument is given", async () => {
    await expectDeclarationRequired([]);
  });

  it("requires the declaration, and connects nothing when it is only whitespace", async () => {
    await expectDeclarationRequired(["   "]);
  });

  it("refuses a mismatch before connecting, and leaks no credential", async () => {
    const result = await spawnPersistenceCli("src/migrate.ts", ["preview"], {
      MIGRATION_DATABASE_URL: MISMATCH_URL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MigrationTargetMismatchError");
    expect(result.stderr).not.toContain("Could not connect");
    expect(result.stdout).not.toContain("[migrate] applied");
    expectNoSecretLeaked(result.stdout, result.stderr);
  });

  it("passes the check for a matching label, so what follows is a connection failure, not a refusal", async () => {
    // Proves the matching label passed the check: what follows is a connection failure, not a refusal.
    const result = await spawnPersistenceCli(
      "src/migrate.ts",
      [PASS_THROUGH_DATABASE],
      { MIGRATION_DATABASE_URL: PASS_THROUGH_URL },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("MigrationTargetMismatchError");
    expect(result.stdout).not.toContain("[migrate] applied");
    expectNoSecretLeaked(result.stdout, result.stderr);
  });
});

describe("the environment check runs before either CLI opens a connection or reads anything", () => {
  it("migrate: the check precedes runMigrations, by source order", () => {
    const source = readFileSync(resolve(SOURCE_DIR, "migrate.ts"), "utf8");
    const cli = source.slice(source.indexOf("if (isDirectCliInvocation)"));
    const checkIndex = cli.indexOf("assertDeclaredEnvironmentReaches(");
    const connectIndex = cli.indexOf("runMigrations(");

    expect(checkIndex).toBeGreaterThan(-1);
    expect(connectIndex).toBeGreaterThan(checkIndex);
  });

  it("migrate:status: the check precedes readDeployedSchema, by source order", () => {
    const source = readFileSync(
      resolve(SOURCE_DIR, "migrate-status.ts"),
      "utf8",
    );
    const cli = source.slice(source.indexOf("if (isDirectCliInvocation)"));
    const checkIndex = cli.indexOf("assertDeclaredEnvironmentReaches(");
    const readIndex = cli.indexOf("readDeployedSchema(");

    expect(checkIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeGreaterThan(checkIndex);
  });
});

describe("migrate:status — the environment check", () => {
  it("refuses a mismatch before reading the schema", async () => {
    const result = await spawnPersistenceCli(
      "src/migrate-status.ts",
      ["preview"],
      { MIGRATION_DATABASE_URL: MISMATCH_URL },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "[migrate:status] MigrationTargetMismatchError",
    );
    expect(result.stderr).not.toContain("Could not read the schema");
    expectNoSecretLeaked(result.stdout, result.stderr);
  });

  it("proceeds past the check when the label matches, reaching the schema read", async () => {
    const result = await spawnPersistenceCli(
      "src/migrate-status.ts",
      [PASS_THROUGH_DATABASE],
      { MIGRATION_DATABASE_URL: PASS_THROUGH_URL },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain("MigrationTargetMismatchError");
    expect(result.stderr).toContain(
      `Could not read the schema of "${UNLISTED_DATABASE}"`,
    );
    expectNoSecretLeaked(result.stdout, result.stderr);
  });
});
