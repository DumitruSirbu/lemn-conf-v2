/**
 * Whether a *deployed* database is level with this checkout — read-only, and inventing no rules.
 *
 * ADR 0096 decision 3. Every refusal about *what* is pending is already decided by
 * `planPendingMigrations` (ADR 0042 decision 6): a pending file, a changed checksum, a renamed
 * file, a hole in the ledger, a ledger ahead of the checkout. This module reads that verdict and
 * formats it; it re-implements no comparison. What it adds is the two things a planner cannot see,
 * because both are facts about a database rather than about two lists:
 *
 * - **A database with no ledger at all.** `SELECT_APPLIED_MIGRATIONS_SQL` raises against one, which
 *   is precisely the state production was in on 2026-09-07 and precisely why nothing noticed for
 *   seven days. It is this guard's loudest outcome, not a stack trace.
 * - **The columns.** ADR 0020 decision 2 and ADR 0096 decision 1: a ledger row is evidence about
 *   what the runner did, never about the schema. So "level" is only ever claimed after reading
 *   `information_schema.columns` back, which makes the same command usable as the pipeline's
 *   pre-flight guard and as its post-migrate verification.
 */

import { MigrationError } from "./migration-errors.js";
import type { MigrationFile } from "./migration-files.js";
import { planPendingMigrations } from "./migration-plan.js";
import type { AppliedMigration } from "./migration-plan.js";

/**
 * What a read of `schema_migrations` found. `absent` is a first-class reading rather than an error,
 * because "this database has never been migrated by the ledger-bearing runner" is a *state* an
 * operator has to act on, and a driver exception describes it as a malfunction instead.
 */
export type MigrationLedgerReading =
  | { readonly kind: "absent" }
  | {
      readonly kind: "present";
      readonly applied: readonly AppliedMigration[];
    };

/** Everything the guard reads from a deployed database, in one value — the three reads ADR 0096
 *  decision 9 requires of any read-back: the ledger, the columns, and the document schema versions
 *  the rows carry. The third is quoted rather than judged: `CURRENT_SCHEMA_VERSION` is a document
 *  concern migrated forward in code, not a database migration, and conflating the two is what
 *  decision 9 was written about. */
export interface DeployedSchemaReading {
  readonly ledger: MigrationLedgerReading;
  readonly designColumnNames: readonly string[];
  readonly documentSchemaVersions: readonly number[];
}

/** `level` is the only outcome that may deploy. The other four each name a different repair, which
 *  is why this is not a boolean. */
export type MigrationStatusOutcome =
  | "level"
  | "outside-the-ledger"
  | "behind"
  | "diverged"
  | "columns-missing";

export interface MigrationStatusReport {
  readonly outcome: MigrationStatusOutcome;
  readonly detail: string;
  /** The schema, quoted. Printed on every run, including a level one: ADR 0020 decision 2 asks for
   *  evidence a reader can check, and a command that prints "ok" is the thing it refuses. */
  readonly readBack: string;
}

/**
 * The columns the application's own statements name, declared here because nothing else in this
 * repository declares them in one place — `neon-configuration-repository.ts` names them scattered
 * across four queries, and a query cannot be asked "which columns do you need?" before it runs.
 *
 * This list is the whole point of the guard. `revision` missing from production while the shipped
 * code selected it is the 2026-09-07 incident, and a ledger read alone would not have caught it on
 * a database that had never carried a ledger.
 */
export const REQUIRED_DESIGN_COLUMNS = [
  "id",
  "schema_version",
  "document",
  "created_at",
  "updated_at",
  "write_token_hash",
  "revision",
] as const;

/** Named once: it appears in three different refusals, and a fix an operator has to guess at is a
 *  fix they will get wrong against the wrong database. */
const MIGRATE_COMMAND = "pnpm --filter @lemnaria/persistence run migrate";

/**
 * The verdict, from the files on disk and one read of the deployed database.
 *
 * Order matters and is deliberate: the ledger's absence outranks everything, because on such a
 * database every other finding is a consequence of it and reporting "a column is missing" would
 * send an operator to write a migration for a database that has never run one.
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

  return { ...describeColumnGap(reading.designColumnNames), readBack };
}

/** The one question the pipeline asks of a report. A named predicate rather than a comparison at
 *  each call site, so "which outcomes may deploy?" has exactly one answer in the codebase. */
export function isDeployedSchemaLevel(report: MigrationStatusReport): boolean {
  return report.outcome === "level";
}

/** One line, naming the environment the operator *declared* and the database the connection string
 *  actually points at. Both, because the 2026-08-25 finding behind ADR 0020 was a correct command
 *  aimed at the wrong database, and only printing one of the two makes that invisible. */
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
 * A database with no `schema_migrations` table.
 *
 * The message says "outside the ledger entirely" and not "behind", because the two call for
 * different acts: the ledger is created by the runner rather than by a migration file (ADR 0042
 * decision 1), so its absence means the ledger-bearing runner has never been pointed here at all,
 * and the repair is to adopt the database by re-running every file (ADR 0042 decision 4) rather
 * than to apply the one that looks missing.
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

/** `undefined` when the ledger agrees with the files — the caller then goes on to the columns,
 *  because agreeing with the files is not yet evidence about the schema. */
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

/** The planner's own refusal message, verbatim: it already names which of the four divergences
 *  this is and what repairs it, and paraphrasing it here would be a second place to keep right. */
function divergedFromTheFiles(error: MigrationError): StatusVerdict {
  return { outcome: "diverged", detail: `${error.name}: ${error.message}` };
}

function describeColumnGap(
  observedColumnNames: readonly string[],
): StatusVerdict {
  const missing = REQUIRED_DESIGN_COLUMNS.filter(
    (column) => !observedColumnNames.includes(column),
  );
  if (missing.length === 0) {
    return {
      outcome: "level",
      detail:
        `Every migration file is recorded as applied and every column the application names is ` +
        `present.`,
    };
  }
  return { outcome: "columns-missing", detail: missingColumnsDetail(missing) };
}

/**
 * The ledger agrees with the files and a column the application needs is still absent.
 *
 * Reachable, and worth its own outcome: a ledger row is a record of what the runner did, and a
 * database whose schema was changed outside the runner — by hand, by a restore, by a rollback to an
 * older dump — can carry a complete ledger over a table that is missing a column. ADR 0020
 * decision 2 exists because this case cannot be seen from the ledger.
 */
function missingColumnsDetail(missing: readonly string[]): string {
  return (
    `The ledger is complete, and the designs table is missing ${String(missing.length)} column(s) ` +
    `the application names: ${missing.join(", ")}. A ledger row is evidence about what the runner ` +
    `did, never about the schema (ADR 0020 decision 2) — so this database's schema was changed ` +
    `outside the runner. Resolve it by hand before deploying; re-running ${MIGRATE_COMMAND} will ` +
    `not, because the ledger already claims those files ran.`
  );
}

/** The evidence line. Deliberately the raw readings and not a judgement on them, so a reader of a
 *  job log can check the verdict rather than take it. */
function quoteReadBack(reading: DeployedSchemaReading): string {
  return (
    `ledger ${describeLedgerVersions(reading.ledger)}; designs columns ` +
    `[${[...reading.designColumnNames].sort().join(", ")}]; document schema_version(s) ` +
    `[${[...reading.documentSchemaVersions].sort((a, b) => a - b).join(", ")}]`
  );
}

function describeLedgerVersions(ledger: MigrationLedgerReading): string {
  if (ledger.kind === "absent") return "ABSENT (no schema_migrations table)";
  const versions = ledger.applied.map((row) => String(row.version));
  return versions.length === 0 ? "[] (empty)" : `[${versions.join(", ")}]`;
}
