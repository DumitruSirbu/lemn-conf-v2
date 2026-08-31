import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checksumOfMigration } from "./migration-checksum.js";
import { MigrationSequenceError } from "./migration-errors.js";

export const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/** `0004_add_contact_table.sql`. The four-digit prefix is the version; nothing else may sit in the
 *  directory, so a stray `.sql.bak` or an editor swap file can never be mistaken for a migration. */
const MIGRATION_FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

const FIRST_MIGRATION_VERSION = 1;

export interface MigrationFile {
  readonly version: number;
  readonly fileName: string;
  readonly sql: string;
  readonly checksum: string;
}

/**
 * Every migration in the directory, in version order.
 *
 * The directory is read rather than a list being maintained in this file. A hard-coded list is one
 * more place to forget: adding a file and not the entry means the migration silently never runs,
 * and nothing would say so. The contiguity check below is what a list was really buying — that the
 * set is a complete run from 0001 — and it is checked rather than assumed.
 */
export function readMigrationFiles(
  directory: string = MIGRATIONS_DIR,
): MigrationFile[] {
  const migrations = readdirSync(directory)
    .filter((fileName) => MIGRATION_FILE_NAME.test(fileName))
    .sort()
    .map((fileName) => readMigrationFile(directory, fileName));

  assertVersionsAreContiguous(migrations, directory);
  return migrations;
}

function readMigrationFile(directory: string, fileName: string): MigrationFile {
  const sql = readFileSync(resolve(directory, fileName), "utf8");
  return {
    version: versionOf(fileName),
    fileName,
    sql,
    checksum: checksumOfMigration(sql),
  };
}

function versionOf(fileName: string): number {
  const version = MIGRATION_FILE_NAME.exec(fileName)?.[1];
  if (version === undefined) {
    throw new MigrationSequenceError(
      `"${fileName}" is not a migration file name. Migrations are named NNNN_lower_snake_case.sql.`,
    );
  }
  return Number(version);
}

/**
 * A run from 0001 with no hole and no repeated version.
 *
 * A hole means a migration was deleted or never committed, and applying what is left would produce
 * a schema no one has ever tested. A repeated version means two files claim the same ledger row,
 * so whichever sorted second would be recorded as never applied on every future run.
 */
function assertVersionsAreContiguous(
  migrations: readonly MigrationFile[],
  directory: string,
): void {
  if (migrations.length === 0) {
    throw new MigrationSequenceError(
      `No migration files found in ${directory}. Expected at least ${String(FIRST_MIGRATION_VERSION)}.`,
    );
  }

  migrations.forEach((migration, index) => {
    const expected = FIRST_MIGRATION_VERSION + index;
    if (migration.version === expected) return;
    throw new MigrationSequenceError(
      `Migration versions must run consecutively from ${String(FIRST_MIGRATION_VERSION)}: ` +
        `expected version ${String(expected)} in ${directory} but found "${migration.fileName}". ` +
        `A missing or duplicated version means the applied schema would not be one this ` +
        `repository has ever produced.`,
    );
  });
}
