/**
 * Which migrations a pipeline is allowed to apply with nobody watching — ADR 0096 decision 5.
 *
 * ADR 0020 decision 1 required the owner's authorisation for every migration. ADR 0096 replaces
 * that for one class only: **additive, idempotent** files, which `0001`–`0004` all are. Everything
 * else — anything that can destroy or rewrite data, and anything Postgres refuses inside the
 * transaction `migrate.ts` wraps each file in — stays a deliberate operator action, applied by hand
 * with the owner's authorisation and then recorded.
 *
 * That classification is checked here rather than written down, because ADR 0096's own consequence
 * says so: *"A pipeline that documents which migrations may run unattended, without refusing the
 * others, is a comment."* This module is where the category becomes enforceable.
 *
 * **It is a lexical screen and deliberately not a parser.** It strips comments, splits on `;`, and
 * matches named patterns. It will refuse files it did not need to, and that is the correct error
 * direction: a false refusal is repaired by the operator applying the file by hand, which is
 * exactly the path ADR 0096 decision 5 prescribes for the class it is being mistaken for. A parser
 * would be a second SQL implementation to keep right, and its failures would be silent instead.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MigrationSequenceError } from "./migration-errors.js";
import { readMigrationFiles } from "./migration-files.js";
import type { MigrationFile } from "./migration-files.js";

/** One thing an unattended run may not do, and why. `isBrokenBy` is a predicate rather than a bare
 *  pattern because one of the rules is a conjunction over a single statement, and a rule that could
 *  only be a regex would have to be dropped or faked. */
interface UnattendedMigrationRule {
  readonly what: string;
  readonly why: string;
  readonly isBrokenBy: (statement: string) => boolean;
}

const UNATTENDED_MIGRATION_RULES: readonly UnattendedMigrationRule[] = [
  {
    what: "drops a schema object",
    why: "a dropped table, column, constraint or index takes its data with it, and nothing rolls a migration back (ADR 0096 decision 8)",
    isBrokenBy: matches(
      /\bdrop\s+(table|column|constraint|index|schema|view|type|database)\b/,
    ),
  },
  {
    what: "truncates a table",
    why: "it empties a table that may hold customer work, and no backup is taken by this pipeline",
    isBrokenBy: matches(/\btruncate\b/),
  },
  {
    what: "rewrites existing rows",
    why: "a delete or an update over existing rows changes data rather than shape, which is the class ADR 0020 decision 1 still reserves to the owner",
    isBrokenBy: matches(/\bdelete\s+from\b/, /\bupdate\s+[\w".]+\s+set\b/),
  },
  {
    what: "changes a column's type",
    why: "a type change rewrites every existing value and can fail or truncate part-way through the table",
    isBrokenBy: matches(/\balter\s+column\s+[\w"]+\s+(set\s+data\s+)?type\b/),
  },
  {
    what: "adds a not-null column with no default",
    why: "it fails outright on a table that already holds rows, so it needs an operator who knows what the table contains",
    isBrokenBy: isNotNullColumnWithoutDefault,
  },
  {
    what: "cannot run inside a transaction block",
    why: "migrate.ts wraps each file in one transaction with its own ledger row, so Postgres refuses this statement outright — migrate.ts's header names the whole set, and ADR 0096 decision 5 is the record it asked for",
    isBrokenBy: matches(
      /\bcreate\s+index\s+concurrently\b/,
      /\breindex\s+concurrently\b/,
      /\bvacuum\b/,
      /\balter\s+system\b/,
      /\bcreate\s+database\b/,
      /\balter\s+type\b[\s\S]*?\badd\s+value\b/,
    ),
  },
];

/**
 * Every reason the pipeline must not apply these files unattended — empty when it may.
 *
 * A list rather than a throw on the first: an operator repairing a migration wants to see all of
 * what disqualified it, not to rediscover the next reason on the next run.
 */
export function unattendedMigrationRefusals(
  files: readonly MigrationFile[],
): string[] {
  return files.flatMap(refusalsForFile);
}

function refusalsForFile(file: MigrationFile): string[] {
  const statements = executableStatementsOf(file.sql);
  return UNATTENDED_MIGRATION_RULES.filter((rule) =>
    statements.some(rule.isBrokenBy),
  ).map((rule) => refusalMessage(file, rule));
}

function refusalMessage(
  file: MigrationFile,
  rule: UnattendedMigrationRule,
): string {
  return (
    `"${file.fileName}" ${rule.what}, so it may not be applied by the pipeline: ${rule.why}. ` +
    `Apply it as a deliberate release step with the owner's authorisation and then record it ` +
    `(ADR 0096 decision 5, ADR 0020 decision 1). If this reading is wrong, the file is still ` +
    `applied by hand — this screen never blocks a migration, only an unattended one.`
  );
}

/**
 * The SQL with comments removed, lowercased, and split into statements.
 *
 * Comment stripping is not optional and is the first thing a reader should check when this screen
 * misbehaves: every migration in this repository carries a long prose header, `0003`'s discusses
 * `drop constraint if exists` by name, and `0004`'s discusses `not null default`. Screening the raw
 * bytes would refuse the entire existing set.
 */
export function executableStatementsOf(sql: string): string[] {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .toLowerCase()
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter((statement) => statement !== "");
}

/** Not expressible as one pattern: the disqualifying thing is the *absence* of `default` in the
 *  same statement, and a regex over the whole file would be satisfied by any other statement's
 *  default. */
function isNotNullColumnWithoutDefault(statement: string): boolean {
  return (
    /\badd\s+column\b/.test(statement) &&
    /\bnot\s+null\b/.test(statement) &&
    !/\bdefault\b/.test(statement)
  );
}

function matches(
  ...patterns: readonly RegExp[]
): (statement: string) => boolean {
  return (statement) => patterns.some((pattern) => pattern.test(statement));
}

// Same path comparison as `migrate.ts`, for the same reason: `import.meta.url` percent-encodes a
// space and `process.argv[1]` does not, so the naive form is silently false under a checkout whose
// path contains one (ADR 0013).
const invokedPath = process.argv[1];
const isDirectCliInvocation =
  invokedPath !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath);

if (isDirectCliInvocation) {
  refuseMigrationsThatNeedAnOperator();
}

function refuseMigrationsThatNeedAnOperator(): void {
  try {
    const refusals = unattendedMigrationRefusals(readMigrationFiles());
    for (const refusal of refusals)
      console.error(`[migrate:unattended] ${refusal}`);
    console.log(describeScreenOutcome(refusals.length));
    if (refusals.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(describeUnreadableMigrationSet(error));
    process.exitCode = 1;
  }
}

/** Only this package's own message is printed. Anything else reaching here is of unknown
 *  provenance, and the rule `migrate.ts` set is that an unknown error's message never goes to a
 *  log line — that is where a connection string hides (ADR 0008's incident). */
function describeUnreadableMigrationSet(error: unknown): string {
  const reason =
    error instanceof MigrationSequenceError
      ? error.message
      : "unexpected failure";
  return `[migrate:unattended] could not read the migration files: ${reason}`;
}

/** Says "nothing" out loud on the clean path. A screen that prints nothing when it passes is
 *  indistinguishable from a screen that never ran, which is the ADR 0013 failure exactly. */
function describeScreenOutcome(refusalCount: number): string {
  return refusalCount === 0
    ? "[migrate:unattended] every migration file is additive and idempotent; safe to apply unattended."
    : `[migrate:unattended] refusing to run unattended: ${String(refusalCount)} reason(s) above.`;
}
