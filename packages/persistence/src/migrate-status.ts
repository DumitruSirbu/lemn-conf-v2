/**
 * `migrate:status`: the read-only drift guard ADR 0096 decision 3 makes mandatory. It executes no DDL and writes
 * nothing: it reads the deployed ledger, columns and document versions and exits non-zero on anything but level.
 * The decisions live in `migration-status.ts`; this file is the connection, the three reads and the printed line.
 *
 * The environment is a required argument and the credential is `MIGRATION_DATABASE_URL`, never `DATABASE_URL`: a check
 * whose subject depends on which untracked `.env` file the machine holds is a coincidence with a test name (ADR 0096).
 * The application role holds no privilege on `schema_migrations`, so it cannot see the ledger (ADR 0096 decision 4).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { loadEnvLocal } from "./load-env.js";
import { databaseNameOf } from "./migrate.js";
import {
  MigrationExecutionError,
  causeUnlessItShowsTheConnection,
  isPrintableFailure,
} from "./migration-errors.js";
import { readMigrationFiles } from "./migration-files.js";
import { SELECT_APPLIED_MIGRATIONS_SQL } from "./migration-ledger.js";
import type { AppliedMigration } from "./migration-plan.js";
import {
  describeDeployedSchemaStatus,
  describeMigrationStatusLine,
  isDeployedSchemaLevel,
} from "./migration-status.js";
import type {
  DeployedColumnReading,
  DeployedSchemaReading,
  MigrationLedgerReading,
} from "./migration-status.js";
import {
  assertDeclaredEnvironmentReaches,
  readDeclaredEnvironment,
} from "./migration-target.js";
import { openDatabase } from "./open-database.js";

/**
 * Presence is asked of the catalogue (`to_regclass`), not `information_schema.tables`: that view is filtered by the
 * caller's privileges, so a role that cannot see a table would read as "absent" and send an operator to re-run every
 * migration against a database that is already level.
 */
const TABLE_PRESENCE_SQL = `
select
  to_regclass('public.schema_migrations') is not null as has_ledger,
  to_regclass('public.designs') is not null as has_designs`;

/** Type and nullability as well as the name: `revision` present but nullable is `0004` half applied, which fails every
 *  `updateIfCurrent` (see `REQUIRED_DESIGN_COLUMNS`). */
const DESIGN_COLUMNS_SQL = `
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'designs'`;

/** ADR 0096 decision 9: the document version and the migration number are different things; read so the read-back
 *  can quote both. */
const DOCUMENT_SCHEMA_VERSIONS_SQL = `
select distinct schema_version from designs order by schema_version`;

const MIGRATION_URL_VARIABLE = "MIGRATION_DATABASE_URL";

/** Which of the two tables the guard reads exist. Asked first so a database with neither is reported, not raised on. */
interface TablePresence {
  readonly hasLedger: boolean;
  readonly hasDesigns: boolean;
}

/**
 * The three reads as one value. A failure is wrapped as `MigrationExecutionError`, as `migrate.ts` wraps its connect:
 * a Neon driver error carries endpoint and host detail in its properties, so it stays as `cause` only when it shows
 * none of the connection string. A string the opener refuses is raised as that refusal, outside the wrap.
 */
export async function readDeployedSchema(
  connectionUrl: string,
): Promise<DeployedSchemaReading> {
  const sql = openDatabase(connectionUrl, MIGRATION_URL_VARIABLE);
  try {
    return await queryDeployedSchema(sql);
  } catch (error) {
    throw new MigrationExecutionError(
      `Could not read the schema of "${databaseNameOf(connectionUrl)}". Nothing was changed: this ` +
        `command only ever reads.`,
      causeUnlessItShowsTheConnection(error, connectionUrl),
    );
  }
}

async function queryDeployedSchema(
  sql: NeonQuery,
): Promise<DeployedSchemaReading> {
  const { hasLedger, hasDesigns } = await readTablePresence(sql);

  return {
    ledger: hasLedger ? await readLedger(sql) : { kind: "absent" },
    designColumns: hasDesigns ? await readDesignColumns(sql) : [],
    documentSchemaVersions: hasDesigns
      ? await readDocumentSchemaVersions(sql)
      : [],
  };
}

/** The driver's type at this package's settings (rows, object rows): `ReturnType<typeof neon>` widens both flags to
 *  `boolean` and rejects what `neon()` actually returns. */
type NeonQuery = NeonQueryFunction<false, false>;

async function readTablePresence(sql: NeonQuery): Promise<TablePresence> {
  const rows = (await sql.query(TABLE_PRESENCE_SQL)) as {
    has_ledger: boolean;
    has_designs: boolean;
  }[];
  return {
    hasLedger: rows[0]?.has_ledger === true,
    hasDesigns: rows[0]?.has_designs === true,
  };
}

async function readLedger(sql: NeonQuery): Promise<MigrationLedgerReading> {
  const rows = (await sql.query(SELECT_APPLIED_MIGRATIONS_SQL)) as {
    version: number;
    file_name: string;
    checksum: string;
  }[];
  return { kind: "present", applied: rows.map(toAppliedMigration) };
}

function toAppliedMigration(row: {
  version: number;
  file_name: string;
  checksum: string;
}): AppliedMigration {
  return {
    version: row.version,
    fileName: row.file_name,
    checksum: row.checksum,
  };
}

async function readDesignColumns(
  sql: NeonQuery,
): Promise<DeployedColumnReading[]> {
  const rows = (await sql.query(
    DESIGN_COLUMNS_SQL,
  )) as InformationSchemaColumn[];
  return rows.map(toDeployedColumn);
}

interface InformationSchemaColumn {
  readonly column_name: string;
  readonly data_type: string;
  readonly is_nullable: string;
}

/** `is_nullable` is `'YES'`/`'NO'` text, so `'NO'` is what is tested: anything unrecognised reads as nullable, which
 *  can only make the guard refuse a database, never let one through. */
function toDeployedColumn(row: InformationSchemaColumn): DeployedColumnReading {
  return {
    name: row.column_name,
    dataType: row.data_type,
    isNullable: row.is_nullable !== "NO",
  };
}

async function readDocumentSchemaVersions(sql: NeonQuery): Promise<number[]> {
  const rows = (await sql.query(DOCUMENT_SCHEMA_VERSIONS_SQL)) as {
    schema_version: number;
  }[];
  return rows.map((row) => row.schema_version);
}

/** Never the error object or its `cause`: a driver error's properties are where a connection string hides (ADR 0008).
 *  Mirrors `describeMigrationFailure` under this command's prefix. */
export function describeStatusFailure(error: unknown): string {
  return isPrintableFailure(error)
    ? `[migrate:status] ${error.name}: ${error.message}`
    : `[migrate:status] failed with an unexpected ${error instanceof Error ? error.name : typeof error}.`;
}

// As in `migrate.ts`: `import.meta.url` percent-encodes a space and `process.argv[1]` does not (ADR 0013).
const invokedPath = process.argv[1];
const isDirectCliInvocation =
  invokedPath !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath);

if (isDirectCliInvocation) {
  loadEnvLocal();
  await reportDeployedSchemaStatus();
}

async function reportDeployedSchemaStatus(): Promise<void> {
  try {
    // Required, and checked before any read (see `migrate.ts` and
    // docs/milestones/migration-environment-safety-check.md).
    const environment = readDeclaredEnvironment(process.argv, "migrate:status");
    const connectionUrl = requireMigrationDatabaseUrl();
    assertDeclaredEnvironmentReaches({
      environment,
      databaseName: databaseNameOf(connectionUrl),
    });

    const report = describeDeployedSchemaStatus(
      readMigrationFiles(),
      await readDeployedSchema(connectionUrl),
    );
    console.log(
      describeMigrationStatusLine(report, {
        environment,
        databaseName: databaseNameOf(connectionUrl),
      }),
    );
    if (!isDeployedSchemaLevel(report)) process.exitCode = 1;
  } catch (error) {
    console.error(describeStatusFailure(error));
    process.exitCode = 1;
  }
}

/** Duplicates `readMigrationDatabaseUrl` (both throw the same `MigrationExecutionError`); consolidating the two was
 *  left out of scope by docs/milestones/migration-environment-safety-check.md. */
function requireMigrationDatabaseUrl(): string {
  const url = process.env[MIGRATION_URL_VARIABLE];
  if (url === undefined || url === "") {
    throw new MigrationExecutionError(
      `${MIGRATION_URL_VARIABLE} is not set. This guard reads schema_migrations, which the ` +
        `application role deliberately holds no privilege on (ADR 0008), so DATABASE_URL cannot ` +
        `stand in for it and is never used here. In CI it is a GitHub Actions secret; locally it ` +
        `belongs in .env.migration.local.`,
    );
  }
  return url;
}
