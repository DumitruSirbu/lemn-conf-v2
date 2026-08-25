import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  databaseNameOf,
  describeMigrationRun,
  runMigrations,
} from "../src/migrate.js";
import { resolveTestDatabaseUrl } from "../src/test-database-url.js";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
const testDatabaseUrl = hasLiveDatabase ? resolveTestDatabaseUrl() : "";
const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

// Obviously fictional, and shaped like the real thing so the credential-redaction assertion has
// something to fail on. Nothing here connects anywhere.
const EXAMPLE_CONNECTION =
  "postgresql://example_user:example_password@ep-example.example.invalid/lemn-conf-example?sslmode=require";

describe("runMigrations", () => {
  it.skipIf(!hasLiveDatabase)(
    "reports every migration it ran, in order",
    async () => {
      // The return value is what makes "did anything happen?" answerable without reading
      // `information_schema` by hand — the ambiguity ADR 0020 was written about. Every file, every
      // run: this runner keeps no ledger and skips nothing.
      const executed = await runMigrations(testDatabaseUrl);

      expect(executed).toEqual([
        "0001_create_designs.sql",
        "0002_add_write_token_hash.sql",
        "0003_check_write_token_hash_shape.sql",
      ]);
    },
  );
});

describe("describeMigrationRun", () => {
  it("names every migration it ran and the database it ran them against", () => {
    const line = describeMigrationRun(
      ["0001_create_designs.sql", "0002_add_write_token_hash.sql"],
      "lemn-conf-example",
    );

    expect(line).toContain("0001_create_designs.sql");
    expect(line).toContain("0002_add_write_token_hash.sql");
    expect(line).toContain("lemn-conf-example");
  });

  it("says it executed the files, never that it applied a change it cannot know about", () => {
    // The runner has no ledger and cannot tell an `if not exists` no-op from a real change.
    // "Applied" would claim otherwise, and would imply a ledger ADR 0020 rules out.
    const line = describeMigrationRun(
      ["0001_create_designs.sql"],
      "lemn-conf-example",
    );

    expect(line).toContain("executed");
    expect(line).not.toContain("applied");
  });

  it("never carries a credential into the line an operator sees", () => {
    const line = describeMigrationRun(
      ["0002_add_write_token_hash.sql"],
      databaseNameOf(EXAMPLE_CONNECTION),
    );

    expect(line).toContain("lemn-conf-example");
    for (const secret of [
      "example_password",
      "example_user",
      "ep-example.example.invalid",
      "postgresql://",
    ]) {
      expect(line).not.toContain(secret);
    }
  });
});

describe("the migrate CLI", () => {
  it("prints the database name, never the connection string it was given", () => {
    const source = readFileSync(resolve(SOURCE_DIR, "migrate.ts"), "utf8");
    const cli = source.slice(source.indexOf("if (isDirectCliInvocation)"));

    expect(cli).toContain(
      "describeMigrationRun(executed, databaseNameOf(connectionUrl))",
    );
    // A connection string printed into a transcript is a credential leak that has already happened
    // once on this project (ADR 0008's setup incident). Pinned as "there is exactly one print, and
    // it prints the described run" — which, with the assertion above, fixes what reaches the log.
    expect(cli.match(/console\.log\(/g) ?? []).toHaveLength(1);
    expect(cli).toMatch(/console\.log\(\s*describeMigrationRun\(/);
  });
});
