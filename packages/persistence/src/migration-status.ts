/**
 * Whether a deployed database is level with this checkout: read-only, and inventing no rules (ADR 0096 decision 3).
 * What is pending is decided by `planPendingMigrations`; this module formats that verdict and adds what a planner
 * cannot see: a database with no ledger at all, and the columns' types and nullability. A ledger row is no evidence
 * about the schema, so "level" is claimed only after reading `information_schema.columns` back, and a column name alone
 * is not enough: `revision` present but nullable is `0004` half applied.
 */

import { MigrationError } from "./migration-errors.js";
import type { MigrationFile } from "./migration-files.js";
import { planPendingMigrations } from "./migration-plan.js";
import type { AppliedMigration } from "./migration-plan.js";

/** What a read of `schema_migrations` found. `absent` is a state an operator acts on, not an error: a driver exception
 *  would describe it as a malfunction. */
export type MigrationLedgerReading =
  | { readonly kind: "absent" }
  | {
      readonly kind: "present";
      readonly applied: readonly AppliedMigration[];
    };

/** One column as `information_schema.columns` reports it and as this module requires it. One type serves both sides,
 *  so "does the database match?" compares like with like. */
export interface DeployedColumnReading {
  readonly name: string;
  /** `information_schema`'s own spelling — `timestamp with time zone`, not `timestamptz`. */
  readonly dataType: string;
  readonly isNullable: boolean;
}

/** Everything the guard reads from a deployed database: the three reads ADR 0096 decision 9 requires of a read-back.
 *  The document schema versions are quoted, not judged: `CURRENT_SCHEMA_VERSION` is migrated forward in code and is
 *  not a database migration. */
export interface DeployedSchemaReading {
  readonly ledger: MigrationLedgerReading;
  readonly designColumns: readonly DeployedColumnReading[];
  readonly documentSchemaVersions: readonly number[];
}

/** `level` is the only outcome that may deploy. The other five each name a different repair, so it is no boolean. */
export type MigrationStatusOutcome =
  | "level"
  | "outside-the-ledger"
  | "behind"
  | "diverged"
  | "columns-missing"
  | "columns-misshapen";

export interface MigrationStatusReport {
  readonly outcome: MigrationStatusOutcome;
  readonly detail: string;
  /** The schema, quoted and printed on every run, including a level one: a command that prints "ok" is not evidence. */
  readonly readBack: string;
}

/**
 * The columns the application's own statements name, with the types and nullability they need. Restated here, not
 * derived from the migration files, on purpose: a derived shape would agree with any database those files had been run
 * against, which is the very thing under test, so this list must be able to disagree with both.
 */
export const REQUIRED_DESIGN_COLUMNS = [
  { name: "id", dataType: "text", isNullable: false },
  { name: "schema_version", dataType: "integer", isNullable: false },
  { name: "document", dataType: "jsonb", isNullable: false },
  {
    name: "created_at",
    dataType: "timestamp with time zone",
    isNullable: false,
  },
  {
    name: "updated_at",
    dataType: "timestamp with time zone",
    isNullable: false,
  },
  // Nullable by `0002`: rows minted before it carry NULL and fail closed (ADR 0019 decision 1). Requiring `not null`
  // would refuse a correctly migrated database.
  { name: "write_token_hash", dataType: "text", isNullable: true },
  // `bigint not null` is why this reading carries a type: a `revision` present but nullable is `0004` half applied,
  // which a name-only guard calls level while `updateIfCurrent` fails.
  { name: "revision", dataType: "bigint", isNullable: false },
  // Nullable by `0005`, as `write_token_hash` is by `0002`: earlier rows have no visitor, and requiring `not null`
  // would refuse a correctly migrated database.
  { name: "visitor_hash", dataType: "text", isNullable: true },
] as const satisfies readonly DeployedColumnReading[];

type RequiredDesignColumn = (typeof REQUIRED_DESIGN_COLUMNS)[number];

/** Named once: it appears in three refusals. `<environment>` is a required argument (`readDeclaredEnvironment` in
 *  `migration-target.ts`), not a placeholder to drop. */
const MIGRATE_COMMAND =
  "pnpm --filter @lemnaria/persistence run migrate <environment>";

/**
 * The verdict, from the files on disk and one read of the deployed database. The ledger's absence outranks everything:
 * every other finding on such a database is a consequence, and "a column is missing" would send an operator to write a
 * migration for a database that has never run one.
 */
export function describeDeployedSchemaStatus(
  files: readonly MigrationFile[],
  reading: DeployedSchemaReading,
): MigrationStatusReport {
  const readBack = quoteReadBack(reading);
  if (reading.ledger.kind === "absent") {
    return { ...outsideTheLedger(files), readBack };
  }

  const drift = describeLedgerDrift(files, reading.ledger.applied);
  if (drift !== undefined) return { ...drift, readBack };

  return { ...describeColumnGap(reading.designColumns), readBack };
}

/** The one question the pipeline asks of a report, so "which outcomes may deploy?" has one answer in the codebase. */
export function isDeployedSchemaLevel(report: MigrationStatusReport): boolean {
  return report.outcome === "level";
}

/** One line naming both the environment the operator declared and the database the connection string points at: a
 *  correct command aimed at the wrong database is invisible if only one is printed (ADR 0020). */
export function describeMigrationStatusLine(
  report: MigrationStatusReport,
  target: { readonly environment: string; readonly databaseName: string },
): string {
  return (
    `[migrate:status] ${target.environment} (${target.databaseName}) — ${report.outcome}\n` +
    `[migrate:status] read back: ${report.readBack}\n` +
    `[migrate:status] ${report.detail}`
  );
}

type StatusVerdict = Omit<MigrationStatusReport, "readBack">;

/**
 * A database with no `schema_migrations` table. Reported as "outside the ledger entirely", not "behind": the ledger is
 * the runner's own creation, so the repair is to adopt the database by re-running every file, not to apply the one
 * that looks missing (ADR 0042 decisions 1 and 4).
 */
function outsideTheLedger(files: readonly MigrationFile[]): StatusVerdict {
  return {
    outcome: "outside-the-ledger",
    detail:
      `This database is outside the ledger entirely: it has no schema_migrations table, so ` +
      `nothing here records which migrations it has run. The ledger is the runner's own creation, ` +
      `not a migration file's (ADR 0042 decision 1), so this is not "one migration behind" — the ` +
      `ledger-bearing runner has never been pointed at this database. Adopt it by running every ` +
      `file, which is the supported adoption path for a database that predates the ledger (ADR ` +
      `0042 decision 4): ${MIGRATE_COMMAND}. All ${String(files.length)} files are idempotent by ` +
      `construction, so re-running one already applied by hand changes nothing.`,
  };
}

/** `undefined` when the ledger agrees with the files; the caller then reads the columns, because agreeing with the
 *  files is no evidence about the schema. */
function describeLedgerDrift(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): StatusVerdict | undefined {
  try {
    return describePendingFiles(planPendingMigrations(files, applied));
  } catch (error) {
    if (error instanceof MigrationError) return divergedFromTheFiles(error);
    throw error;
  }
}

function describePendingFiles(
  pending: readonly MigrationFile[],
): StatusVerdict | undefined {
  if (pending.length === 0) return undefined;
  const names = pending.map((file) => file.fileName).join(", ");
  return {
    outcome: "behind",
    detail:
      `This database is behind by ${String(pending.length)} migration(s): ${names}. Deploying ` +
      `code that names the schema they add is the 2026-09-07 incident. Apply them with ` +
      `${MIGRATE_COMMAND}.`,
  };
}

/** The planner's own refusal message, verbatim: it already names the divergence and its repair, and paraphrasing it
 *  would be a second place to keep right. */
function divergedFromTheFiles(error: MigrationError): StatusVerdict {
  return { outcome: "diverged", detail: `${error.name}: ${error.message}` };
}

/** Absence first, then shape: on a table missing `revision`, "its type is wrong" means nothing, and an absent `designs`
 *  table would otherwise report every column as misshapen. */
function describeColumnGap(
  observed: readonly DeployedColumnReading[],
): StatusVerdict {
  const missing = missingColumnsOf(observed);
  if (missing.length > 0) {
    return {
      outcome: "columns-missing",
      detail: missingColumnsDetail(missing),
    };
  }

  const misshapen = misshapenColumnsOf(observed);
  if (misshapen.length > 0) {
    return {
      outcome: "columns-misshapen",
      detail: misshapenColumnsDetail(misshapen),
    };
  }

  return {
    outcome: "level",
    detail:
      `Every migration file is recorded as applied and every column the application names is ` +
      `present with the type and nullability its statements need.`,
  };
}

function missingColumnsOf(
  observed: readonly DeployedColumnReading[],
): RequiredDesignColumn[] {
  return REQUIRED_DESIGN_COLUMNS.filter(
    (required) => observedColumnNamed(observed, required.name) === undefined,
  );
}

/** A required column present under a type or nullability the application's statements cannot work against. Both
 *  halves are carried so the refusal can quote what it wanted and what it found. */
interface ColumnShapeMismatch {
  readonly required: RequiredDesignColumn;
  readonly deployed: DeployedColumnReading;
}

function misshapenColumnsOf(
  observed: readonly DeployedColumnReading[],
): ColumnShapeMismatch[] {
  return REQUIRED_DESIGN_COLUMNS.flatMap((required) => {
    const deployed = observedColumnNamed(observed, required.name);
    if (deployed === undefined || hasRequiredShape(deployed, required))
      return [];
    return [{ required, deployed }];
  });
}

function observedColumnNamed(
  observed: readonly DeployedColumnReading[],
  name: string,
): DeployedColumnReading | undefined {
  return observed.find((column) => column.name === name);
}

function hasRequiredShape(
  deployed: DeployedColumnReading,
  required: RequiredDesignColumn,
): boolean {
  return (
    deployed.dataType === required.dataType &&
    deployed.isNullable === required.isNullable
  );
}

/** The ledger agrees with the files and a column the application needs is absent. Reachable: a schema changed outside
 *  the runner (by hand, a restore, a rollback to an older dump) can carry a complete ledger over a table missing a
 *  column (ADR 0020 decision 2). */
function missingColumnsDetail(
  missing: readonly RequiredDesignColumn[],
): string {
  return (
    `The ledger is complete, and the designs table is missing ${String(missing.length)} column(s) ` +
    `the application names: ${missing.map(describeColumn).join(", ")}. A ledger row is evidence ` +
    `about what the runner did, never about the schema (ADR 0020 decision 2) — so this database's ` +
    `schema was changed outside the runner. Resolve it by hand before deploying; re-running ` +
    `${MIGRATE_COMMAND} will not, because the ledger already claims those files ran.`
  );
}

/**
 * Every required column is present, and one is not the shape the application needs. Distinct from `columns-missing`: a
 * `revision` present but nullable is `0004` half applied, `add column if not exists` never touches it again, and no
 * re-run repairs it. Reporting it as "missing" sends an operator to a command that changes nothing.
 */
function misshapenColumnsDetail(
  mismatches: readonly ColumnShapeMismatch[],
): string {
  return (
    `The ledger is complete and every column the application names is present, and ` +
    `${String(mismatches.length)} of them do not have the shape its statements need: ` +
    `${mismatches.map(describeShapeMismatch).join("; ")}. A column's name is no more evidence ` +
    `about its type than a ledger row is about the schema (ADR 0020 decision 2). Re-running ` +
    `${MIGRATE_COMMAND} will not repair this: every file adds its column with "if not exists", so ` +
    `a column that is already there is never altered. Resolve it by hand before deploying.`
  );
}

function describeShapeMismatch({
  required,
  deployed,
}: ColumnShapeMismatch): string {
  return `${deployed.name} is ${describeShape(deployed)} and must be ${describeShape(required)}`;
}

function describeColumn(column: DeployedColumnReading): string {
  return `${column.name} ${describeShape(column)}`;
}

function describeShape(column: DeployedColumnReading): string {
  return `${column.dataType} ${column.isNullable ? "null" : "not null"}`;
}

/** The evidence line: the raw readings, not a judgement, so a reader of a job log can check the verdict. */
function quoteReadBack(reading: DeployedSchemaReading): string {
  return (
    `ledger ${describeLedgerVersions(reading.ledger)}; designs columns ` +
    `[${describeDeployedColumns(reading.designColumns)}]; document schema_version(s) ` +
    `[${[...reading.documentSchemaVersions].sort((a, b) => a - b).join(", ")}]`
  );
}

/** Sorted by name so two runs against one database print the same line, with type and nullability because the verdict
 *  was computed from them. */
function describeDeployedColumns(
  columns: readonly DeployedColumnReading[],
): string {
  return [...columns]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(describeColumn)
    .join(", ");
}

function describeLedgerVersions(ledger: MigrationLedgerReading): string {
  if (ledger.kind === "absent") return "ABSENT (no schema_migrations table)";
  const versions = ledger.applied.map((row) => String(row.version));
  return versions.length === 0 ? "[] (empty)" : `[${versions.join(", ")}]`;
}
