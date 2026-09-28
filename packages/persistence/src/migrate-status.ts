/**
 * `migrate:status` — the read-only drift guard ADR 0096 decision 3 makes mandatory.
 *
 * It executes no DDL and writes nothing. It reads the deployed ledger, the deployed columns and the
 * document versions the rows carry, hands the first to the pure planner, and exits non-zero on
 * anything but level. The decisions live in `migration-status.ts`; this file is the connection, the
 * three reads, and the operator-facing line.
 *
 * **It is told which environment it is checking, and refuses to guess.** ADR 0096 finding 4 is that
 * a check whose subject depends on which untracked `.env` file the executing machine happens to
 * hold is a coincidence with a test name. So the environment is a required argument, the credential
 * is `MIGRATION_DATABASE_URL` and never `DATABASE_URL`, and the output names both the environment
 * the operator declared and the database the connection string actually reached.
 *
 * Its credential is deliberately not the application's. `app_designs` holds no privilege at all on
 * `schema_migrations` (asserted on purpose by `application-role-privileges.test.ts`), so the
 * application role literally cannot see the ledger. A read-only gate is a different privilege from
 * DDL, and ADR 0096 decision 4 says so: ADR 0008 is untouched by this file, because nothing here
 * grants a runtime anything.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { loadEnvLocal } from "./load-env.js";
import { databaseNameOf } from "./migrate.js";
import { MigrationError, MigrationExecutionError } from "./migration-errors.js";
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

/**
 * Presence asked of the catalogue rather than discovered by letting a query raise.
 *
 * `to_regclass` over `information_schema.tables` on purpose: `information_schema` is filtered by
 * the caller's privileges, so a role that cannot see a table reads as "the table is absent" — and
 * reporting "outside the ledger entirely" for a permissions problem would send an operator to
 * re-run every migration against a database that is already level. `to_regclass` answers about the
 * catalogue, so a privilege problem surfaces as the permission error it is.
 */
const TABLE_PRESENCE_SQL = `
select
  to_regclass('public.schema_migrations') is not null as has_ledger,
  to_regclass('public.designs') is not null as has_designs`;

/** Type and nullability as well as the name, because a name alone cannot tell `0004` applied from
 *  `0004` half applied: `revision` present but nullable fails every `updateIfCurrent` while reading
 *  as a column that is there. `REQUIRED_DESIGN_COLUMNS` states the shape this is compared against. */
const DESIGN_COLUMNS_SQL = `
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'designs'`;

/** ADR 0096 decision 9: the document version and the migration number are different things and were
 *  conflated during the 2026-09-07 diagnosis. Read so the read-back can quote both. */
const DOCUMENT_SCHEMA_VERSIONS_SQL = `
select distinct schema_version from designs order by schema_version`;

const MIGRATION_URL_VARIABLE = "MIGRATION_DATABASE_URL";

/** Which of the two tables the guard reads actually exist. Asked first so a database that carries
 *  neither — a brand new one, or the wrong one — is reported rather than raising twice. */
interface TablePresence {
  readonly hasLedger: boolean;
  readonly hasDesigns: boolean;
}

/**
 * The three reads, as one value the pure verdict can be computed from.
 *
 * Wrapped as a `MigrationExecutionError` on failure, for the reason `migrate.ts` wraps its connect:
 * a Neon driver error carries endpoint and host detail in its properties, and the CLI printer below
 * only ever prints this package's own messages.
 */
export async function readDeployedSchema(
  connectionUrl: string,
): Promise<DeployedSchemaReading> {
  try {
    return await queryDeployedSchema(connectionUrl);
  } catch (error) {
    throw new MigrationExecutionError(
      `Could not read the schema of "${databaseNameOf(connectionUrl)}". Nothing was changed: this ` +
        `command only ever reads.`,
      { cause: error },
    );
  }
}

async function queryDeployedSchema(
  connectionUrl: string,
): Promise<DeployedSchemaReading> {
  const sql = neon(connectionUrl);
  const { hasLedger, hasDesigns } = await readTablePresence(sql);

  return {
    ledger: hasLedger ? await readLedger(sql) : { kind: "absent" },
    designColumns: hasDesigns ? await readDesignColumns(sql) : [],
    documentSchemaVersions: hasDesigns
      ? await readDocumentSchemaVersions(sql)
      : [],
  };
}

/** The driver's own type at the settings this package uses — rows, not full results, and object
 *  rows rather than arrays. `ReturnType<typeof neon>` widens both flags to `boolean` and then does
 *  not accept the value `neon()` actually returns. */
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

/** `is_nullable` is the SQL standard's `'YES'`/`'NO'` text and not a boolean, so `'NO'` is what is
 *  tested for rather than truthiness. Anything unrecognised therefore reads as nullable, which is
 *  the direction that can only make the guard refuse a database it could not read confidently —
 *  never let one through. */
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

/** Never the error object and never its `cause`: a driver error's properties are exactly where a
 *  connection string hides (ADR 0008's incident). Mirrors `describeMigrationFailure` under this
 *  command's own prefix, so a job log says which of the two commands failed. */
export function describeStatusFailure(error: unknown): string {
  return error instanceof MigrationError
    ? `[migrate:status] ${error.name}: ${error.message}`
    : `[migrate:status] failed with an unexpected ${error instanceof Error ? error.name : typeof error}.`;
}

// Compared as filesystem paths, for the reason `migrate.ts` compares them that way: `import.meta.url`
// percent-encodes a space and `process.argv[1]` does not, so the naive comparison is silently false
// for every checkout under a directory with a space in its name (ADR 0013).
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
    // Required, and checked before the read below ever runs: see migrate.ts's own comment on the
    // same check, and docs/milestones/migration-environment-safety-check.md.
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

/** Read here rather than through `readMigrationDatabaseUrl` — both now throw the same
 *  `MigrationExecutionError`, so that is no longer why this duplicates it. It survives only because
 *  consolidating the two credential-reading functions into one is explicitly out of scope for the
 *  change that introduced this comment (`docs/milestones/migration-environment-safety-check.md`),
 *  not because of any difference in error type. */
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
