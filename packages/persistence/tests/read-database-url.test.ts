import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MigrationExecutionError } from "../src/migration-errors.js";
import {
  readDatabaseUrl,
  readMigrationDatabaseUrl,
} from "../src/read-database-url.js";

describe("readDatabaseUrl", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];

  afterEach(() => {
    process.env["DATABASE_URL"] = originalDatabaseUrl ?? "";
  });

  it("throws a plain Error naming DATABASE_URL when it is unset", () => {
    delete process.env["DATABASE_URL"];

    expect(() => readDatabaseUrl()).toThrow(
      /DATABASE_URL environment variable is not set/,
    );
    expect(() => readDatabaseUrl()).not.toThrow(MigrationExecutionError);
  });
});

describe("readMigrationDatabaseUrl", () => {
  const originalMigrationDatabaseUrl = process.env["MIGRATION_DATABASE_URL"];

  beforeEach(() => {
    process.env["MIGRATION_DATABASE_URL"] = "postgres://u:p@h.invalid/db";
  });

  afterEach(() => {
    process.env["MIGRATION_DATABASE_URL"] = originalMigrationDatabaseUrl ?? "";
  });

  // Regression: `migrate.ts` moved this call inside its CLI try block, and its
  // `describeMigrationFailure` deliberately withholds the message of anything that is not a
  // `MigrationError` (so a raw driver error can never leak a credential). A missing
  // MIGRATION_DATABASE_URL used to surface via Node's default uncaught-exception printing, before
  // that move put it inside the guarded try — this pins the fix: a plain `Error` here would make the
  // operator-facing line regress to "failed with an unexpected Error" with no actionable detail.
  it("throws MigrationExecutionError naming MIGRATION_DATABASE_URL when it is unset", () => {
    delete process.env["MIGRATION_DATABASE_URL"];

    expect(() => readMigrationDatabaseUrl()).toThrow(MigrationExecutionError);
    expect(() => readMigrationDatabaseUrl()).toThrow(
      /MIGRATION_DATABASE_URL environment variable is not set/,
    );
  });

  it("throws MigrationExecutionError when MIGRATION_DATABASE_URL is the empty string", () => {
    process.env["MIGRATION_DATABASE_URL"] = "";

    expect(() => readMigrationDatabaseUrl()).toThrow(MigrationExecutionError);
  });

  it("returns the connection string unchanged when it is set", () => {
    expect(readMigrationDatabaseUrl()).toBe("postgres://u:p@h.invalid/db");
  });
});
