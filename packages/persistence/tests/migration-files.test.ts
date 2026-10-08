import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import { MigrationSequenceError } from "../src/migration-errors.js";
import { readMigrationFiles } from "../src/migration-files.js";

function directoryContaining(fileNames: readonly string[]): string {
  const directory = mkdtempSync(resolve(tmpdir(), "lemnaria-migrations-"));
  for (const fileName of fileNames) {
    writeFileSync(resolve(directory, fileName), "select 1;\n", "utf8");
  }
  return directory;
}

describe("readMigrationFiles", () => {
  it("reads this repository's own migrations as a contiguous run from version 1", () => {
    const migrations = readMigrationFiles();

    expect(migrations.map((migration) => migration.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(migrations.map((migration) => migration.fileName)).toEqual([
      "0001_create_designs.sql",
      "0002_add_write_token_hash.sql",
      "0003_check_write_token_hash_shape.sql",
      "0004_add_design_revision.sql",
      "0005_add_design_visitor_hash.sql",
      "0006_create_design_share_links.sql",
      "0007_create_rate_limit_counters.sql",
    ]);
  });

  it("checksums each file's own contents", () => {
    const [first] = readMigrationFiles();

    expect(first?.checksum).toBe(checksumOfMigration(first?.sql ?? ""));
    expect(first?.sql).toContain("create table if not exists designs");
  });

  it("refuses a hole in the sequence, because the resulting schema is one nobody tested", () => {
    const directory = directoryContaining(["0001_first.sql", "0003_third.sql"]);

    expect(() => readMigrationFiles(directory)).toThrow(MigrationSequenceError);
  });

  it("refuses two files claiming the same version", () => {
    const directory = directoryContaining([
      "0001_first.sql",
      "0001_also_first.sql",
    ]);

    expect(() => readMigrationFiles(directory)).toThrow(MigrationSequenceError);
  });

  it("refuses a directory that starts at a version other than 1", () => {
    const directory = directoryContaining(["0002_second.sql"]);

    expect(() => readMigrationFiles(directory)).toThrow(MigrationSequenceError);
  });

  it("ignores files that are not named as migrations, rather than trying to run them", () => {
    const directory = directoryContaining([
      "0001_first.sql",
      "0001_first.sql.bak",
      "README.md",
    ]);

    expect(readMigrationFiles(directory).map((file) => file.fileName)).toEqual([
      "0001_first.sql",
    ]);
  });

  it("refuses a directory with no migrations at all, rather than reporting a clean run", () => {
    expect(() => readMigrationFiles(directoryContaining([]))).toThrow(
      MigrationSequenceError,
    );
  });
});
