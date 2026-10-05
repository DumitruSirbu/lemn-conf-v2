/**
 * Which migrations a pipeline may apply with nobody watching: only additive, idempotent ones (ADR 0096 decision 5).
 *
 * Refuses by default: a statement runs unattended only if a shape here positively recognises it as additive and
 * idempotent. The named destructive diagnoses sharpen the message and catch a denied operation inside a recognised
 * shape (`DROP TABLE` in an `INSERT` string); they are not the safety property. It is a lexical screen, not a
 * parser: it over-refuses, and a false refusal costs one manual apply.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MigrationSequenceError } from "./migration-errors.js";
import { readMigrationFiles } from "./migration-files.js";
import type { MigrationFile } from "./migration-files.js";

/**
 * The shapes that may run unattended; a statement matching none is refused. Each entry promises additive and
 * idempotent under the re-run-everything adoption path (ADR 0042 decision 4). Keywords Postgres makes optional
 * (`COLUMN`, `ONLY`, `IF EXISTS`) must stay optional in the patterns, or a valid spelling is refused.
 */
interface AdditiveStatementShape {
  readonly what: string;
  readonly isMatchedBy: (statement: string) => boolean;
}

const TABLE_NAME = String.raw`[\w".]+`;

/** A statement anchored here creates a table; the allowlist and the `on delete` exemption below share this anchor. */
const CREATE_TABLE_IF_NOT_EXISTS = /^create\s+table\s+if\s+not\s+exists\s/;

/**
 * `INSERT INTO table [(cols)] VALUES (…)[, (…)] [ON CONFLICT … DO NOTHING]`: literal rows, never a query, which
 * need not produce the same rows on a re-run. `DO UPDATE` rewrites existing rows and is refused.
 */
const INSERT_VALUES_SHAPE = new RegExp(
  String.raw`^insert\s+into\s+${TABLE_NAME}\s*(\([^()]*\)\s*)?` +
    String.raw`values\s*\([^()]*\)(\s*,\s*\([^()]*\))*` +
    String.raw`(\s+on\s+conflict\b[^;]*\bdo\s+nothing)?$`,
);

const ADDITIVE_STATEMENT_SHAPES: readonly AdditiveStatementShape[] = [
  {
    what: "create table if not exists",
    isMatchedBy: matchesAnchored(CREATE_TABLE_IF_NOT_EXISTS),
  },
  {
    what: "alter table … add column if not exists",
    isMatchedBy: isIdempotentAddColumn,
  },
  {
    what: "create index if not exists (not concurrent)",
    isMatchedBy: isIdempotentCreateIndex,
  },
  {
    what: "a DO block guarded on pg_constraint",
    isMatchedBy: isConstraintGuardedDoBlock,
  },
  { what: "comment on", isMatchedBy: matchesAnchored(/^comment\s+on\s/) },
  {
    what: "insert into … values (…) (new rows only)",
    isMatchedBy: matchesAnchored(INSERT_VALUES_SHAPE),
  },
];

interface DestructiveDiagnosis {
  readonly what: string;
  readonly why: string;
  readonly isBrokenBy: (statement: string) => boolean;
}

const DESTRUCTIVE_DIAGNOSES: readonly DestructiveDiagnosis[] = [
  {
    what: "drops a schema object",
    why: "a dropped table, column, constraint or index takes its data with it, and nothing rolls a migration back (ADR 0096 decision 8)",
    // Bare `\bdrop\b`: `DROP [COLUMN] [IF EXISTS] name` makes every following token optional.
    isBrokenBy: matches(/\bdrop\b/),
  },
  {
    what: "truncates a table",
    why: "it empties a table that may hold customer work, and no backup is taken by this pipeline",
    isBrokenBy: matches(/\btruncate\b/),
  },
  {
    what: "rewrites existing rows",
    why: "a delete or an update over existing rows changes data rather than shape, which is the class ADR 0020 decision 1 still reserves to the owner",
    // Bare for the same reason as `drop`: an alias, `AS` or `ONLY` can sit between the table and `SET`.
    isBrokenBy: rewritesExistingRows,
  },
  {
    what: "changes a column's type",
    why: "a type change rewrites every existing value and can fail or truncate part-way through the table",
    isBrokenBy: matches(
      new RegExp(
        String.raw`\balter\s+(column\s+)?${TABLE_NAME}\s+(set\s+data\s+)?type\b`,
      ),
    ),
  },
  {
    what: "adds a not-null column with no default",
    why: "it fails outright on a table that already holds rows, so it needs an operator who knows what the table contains",
    isBrokenBy: hasNotNullAddClauseWithoutDefault,
  },
  {
    what: "cannot run inside a transaction block",
    why: "migrate.ts wraps each file in one transaction with its own ledger row, so Postgres refuses this statement outright — migrate.ts's header names the whole set, and ADR 0096 decision 5 is the record it asked for",
    isBrokenBy: matches(
      /\bconcurrently\b/,
      /\bvacuum\b/,
      /\balter\s+system\b/,
      /\bcreate\s+database\b/,
      /\balter\s+type\b[\s\S]*?\badd\s+value\b/,
    ),
  },
  {
    what: "creates a table that inherits from, or partitions, an existing one",
    why: "INHERITS and PARTITION OF both attach the new table to another table's existing rows and structure, which is not the plain 'a new table, empty until code writes to it' promise this allowlist's create-table shape makes, and this screen cannot certify the interaction with an already-populated parent is safe (SEC-7E3c.9)",
    isBrokenBy: (statement) =>
      CREATE_TABLE_IF_NOT_EXISTS.test(statement) &&
      /\binherits\b|\bpartition\s+of\b/.test(statement),
  },
  {
    what: "runs dynamic SQL inside a DO block",
    why: "EXECUTE, PERFORM, format(…) and string concatenation (||) can construct and run a statement this screen never sees, so a DO block using any of them cannot be certified additive and idempotent by pattern alone (SEC-7E3c.8)",
    isBrokenBy: (statement) =>
      /^do\s+\$\$/.test(statement) && usesDynamicSql(statement),
  },
  {
    what: "creates a table from a query (CTAS)",
    why: "the query runs during the migration and can call arbitrary functions with side effects (e.g. lo_unlink), which is not what a plain column list's 'additive and idempotent' promise covers, and a second run over the same query is not guaranteed to produce the same rows",
    // `create table if not exists` anchors only the start of a statement, so a CTAS is caught by what follows it.
    isBrokenBy: (statement) =>
      CREATE_TABLE_IF_NOT_EXISTS.test(statement) && CTAS_QUERY.test(statement),
  },
];

/** The query keywords PostgreSQL accepts after the `AS` of a CTAS. `\s*\(*\s*` admits `AS(SELECT …)` and
 *  `AS ((SELECT …))`. */
const CTAS_QUERY = /\bas\s*\(*\s*(select|with|values|table)\b/;

/** Every reason the pipeline must not apply these files unattended, one per statement; empty when it may. */
export function unattendedMigrationRefusals(
  files: readonly MigrationFile[],
): string[] {
  return files.flatMap(refusalsForFile);
}

function refusalsForFile(file: MigrationFile): string[] {
  // Checked first: a file with an unmodelled construct cannot trust the statement split, so it is not screened further.
  const constructRefusals = [...new Set(unmodelledConstructsOf(file.sql))].map(
    (construct) =>
      `"${file.fileName}" contains ${construct}, so it may not be applied by the ` +
      `pipeline: an unattended screen that cannot lex a construct correctly cannot certify what ` +
      `stands beside it either. ${APPLY_BY_HAND_INSTEAD}`,
  );
  if (constructRefusals.length > 0) return constructRefusals;

  return executableStatementsOf(file.sql)
    .map(refusalForStatement)
    .filter((refusal): refusal is string => refusal !== undefined)
    .map((refusal) => `"${file.fileName}" ${refusal}`);
}

/**
 * The named diagnosis first, then the allowlist. A statement the allowlist accepts must still clear the diagnoses:
 * `insert into audit values ('drop table designs')` is refused.
 */
function refusalForStatement(statement: string): string | undefined {
  const diagnosis = DESTRUCTIVE_DIAGNOSES.find((rule) =>
    rule.isBrokenBy(statement),
  );
  if (diagnosis !== undefined) return diagnosedRefusal(diagnosis);
  if (ADDITIVE_STATEMENT_SHAPES.some((shape) => shape.isMatchedBy(statement))) {
    return undefined;
  }
  return unrecognisedRefusal();
}

function diagnosedRefusal(diagnosis: DestructiveDiagnosis): string {
  return (
    `${diagnosis.what}, so it may not be applied by the pipeline: ${diagnosis.why}. ` +
    APPLY_BY_HAND_INSTEAD
  );
}

function unrecognisedRefusal(): string {
  return (
    `uses a statement the unattended screen does not recognise as additive and idempotent, so it ` +
    `may not be applied by the pipeline. The recognised shapes are: ` +
    `${ADDITIVE_STATEMENT_SHAPES.map((shape) => shape.what).join("; ")}. ${APPLY_BY_HAND_INSTEAD}`
  );
}

const APPLY_BY_HAND_INSTEAD =
  `Apply it as a deliberate release step with the owner's authorisation and then record it ` +
  `(ADR 0096 decision 5, ADR 0020 decision 1). This screen never blocks a migration, only an ` +
  `unattended one.`;

/**
 * The SQL with comments removed, lowercased, and split into statements. Stripping comments is required: the shipped
 * migrations' prose headers name `drop constraint if exists` and `not null default`, which the screen would refuse.
 */
export function executableStatementsOf(sql: string): string[] {
  return scanSql(sql)
    .statements.map((statement) =>
      statement.toLowerCase().replace(/\s+/g, " ").trim(),
    )
    .filter((statement) => statement !== "");
}

/**
 * Constructs the scanner cannot lex the way Postgres does (E-strings, `$` inside identifiers, tagged dollar quotes,
 * nested block comments, a bare `\r`). One of them costs the whole file its unattended status: refuse by construct
 * rather than model more of Postgres's lexer.
 */
export function unmodelledConstructsOf(sql: string): string[] {
  return scanSql(sql).unmodelledConstructs;
}

interface RawScan {
  readonly statements: string[];
  readonly unmodelledConstructs: string[];
}

const DOLLAR_QUOTE = "$$";

type ScanState = "code" | "single-quote" | "double-quote" | "dollar-quote";

/** String prefixes (`E'`, `U&'`, `B'`, `X'`) with escaping rules the quote tracker lacks. A non-word character must
 *  precede the prefix, so the one-character string `'b'` is not read as a bit-string. */
const STRING_TYPE_PREFIX = /(?:^|[^\w$])(u&|e|b|x)$/i;

function precedingStringPrefix(
  sql: string,
  quoteIndex: number,
): string | undefined {
  const lookback = sql.slice(Math.max(0, quoteIndex - 4), quoteIndex);
  return STRING_TYPE_PREFIX.exec(lookback)?.[1];
}

/**
 * One quote-aware pass: splits on `;` and blanks `--` and block comments only outside a single-quoted string, a
 * double-quoted identifier or a `$$` body, as Postgres reads them. Only the bare `$$` is tracked; any tagged `$tag$`
 * body is reported as an unmodelled construct.
 */
function scanSql(sql: string): RawScan {
  const statements: string[] = [];
  const unmodelledConstructs: string[] = [];
  let buffer = "";
  let state: ScanState = "code";
  let index = 0;

  while (index < sql.length) {
    if (state === "single-quote") {
      // A backslash's meaning here depends on `standard_conforming_strings`, which this module never reads (`E'\''`).
      if (sql[index] === "\\") {
        unmodelledConstructs.push(
          "a backslash inside a single-quoted string, whose meaning depends on a session setting " +
            "this screen does not read",
        );
      }
      const step = stepThroughQuote(sql, index, "'");
      buffer += step.consumed;
      index = step.nextIndex;
      if (step.closesQuote) state = "code";
      continue;
    }
    if (state === "double-quote") {
      const step = stepThroughQuote(sql, index, '"');
      buffer += step.consumed;
      index = step.nextIndex;
      if (step.closesQuote) state = "code";
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(DOLLAR_QUOTE, index)) {
        buffer += DOLLAR_QUOTE;
        state = "code";
        index += DOLLAR_QUOTE.length;
        continue;
      }
      buffer += sql[index] ?? "";
      index += 1;
      continue;
    }

    // state === "code"
    if (sql.startsWith("--", index)) {
      // Postgres ends a `--` comment at `\n` or `\r`.
      const lineEnd = indexOfEither(sql, "\n", "\r", index);
      index = lineEnd === -1 ? sql.length : lineEnd;
      buffer += " ";
      continue;
    }
    if (sql[index] === "\r" && sql[index + 1] !== "\n") {
      // What Postgres does with any other bare `\r` is not modelled, so the file is refused by construct.
      unmodelledConstructs.push(
        "a bare \\r (carriage return) not immediately followed by \\n, whose line-ending " +
          "behaviour this screen does not track",
      );
      buffer += sql[index] ?? "";
      index += 1;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const blockEnd = sql.indexOf("*/", index + 2);
      // Unterminated: Postgres refuses it, so read these two characters as code and let the screen refuse it.
      if (blockEnd === -1) {
        buffer += "/*";
        index += 2;
        continue;
      }
      // Postgres nests block comments and this scanner does not, so a nested one would hide text from the screen.
      if (sql.slice(index + 2, blockEnd).includes("/*")) {
        unmodelledConstructs.push(
          "a nested block comment, which PostgreSQL nests and this screen does not",
        );
      }
      index = blockEnd + 2;
      buffer += " ";
      continue;
    }
    if (sql[index] === "'") {
      const prefix = precedingStringPrefix(sql, index);
      if (prefix !== undefined) {
        unmodelledConstructs.push(
          `a "${prefix.toUpperCase()}'…'" string, whose escaping or encoding this screen does not track`,
        );
      }
      buffer += "'";
      state = "single-quote";
      index += 1;
      continue;
    }
    if (sql[index] === '"') {
      const prefix = precedingStringPrefix(sql, index);
      if (prefix !== undefined && prefix.toLowerCase() === "u&") {
        unmodelledConstructs.push(
          `a "U&"…"" identifier, whose unicode escaping this screen does not track`,
        );
      }
      buffer += '"';
      state = "double-quote";
      index += 1;
      continue;
    }
    if (sql[index] === "$") {
      // A `$` glued to an identifier (`qa_b$$`) or opening a tagged quote (`$q$…$q$`) is misread as a delimiter or
      // as code; only the bare, free-standing `$$` is accepted.
      const precededByIdentifierChar =
        index > 0 && /[\w$]/.test(sql[index - 1] ?? "");
      if (precededByIdentifierChar) {
        unmodelledConstructs.push(
          "an identifier containing $, which this screen's dollar-quote detection cannot tell apart " +
            "from a delimiter",
        );
        buffer += "$";
        index += 1;
        continue;
      }
      if (sql.startsWith(DOLLAR_QUOTE, index) && sql[index + 2] !== "$") {
        buffer += DOLLAR_QUOTE;
        state = "dollar-quote";
        index += DOLLAR_QUOTE.length;
        continue;
      }
      unmodelledConstructs.push(
        "a $ that is not part of the bare, untagged $$ delimiter (a tag, or a lone $), which this " +
          "screen does not track",
      );
      buffer += "$";
      index += 1;
      continue;
    }
    if (sql[index] === ";") {
      statements.push(buffer);
      buffer = "";
      index += 1;
      continue;
    }
    buffer += sql[index] ?? "";
    index += 1;
  }

  statements.push(buffer);
  return { statements, unmodelledConstructs };
}

/** The earliest of two delimiters at or after `from`, or `-1`: a `--` comment ends at the first `\n` or `\r`. */
function indexOfEither(
  sql: string,
  first: string,
  second: string,
  from: number,
): number {
  const firstIndex = sql.indexOf(first, from);
  const secondIndex = sql.indexOf(second, from);
  if (firstIndex === -1) return secondIndex;
  if (secondIndex === -1) return firstIndex;
  return Math.min(firstIndex, secondIndex);
}

interface QuoteStep {
  readonly consumed: string;
  readonly nextIndex: number;
  readonly closesQuote: boolean;
}

/** One step inside a quoted region: a doubled quote is an escaped quote and stays inside; a lone quote ends it. */
function stepThroughQuote(
  sql: string,
  index: number,
  quoteChar: "'" | '"',
): QuoteStep {
  const doubled = quoteChar + quoteChar;
  if (sql.startsWith(doubled, index)) {
    return { consumed: doubled, nextIndex: index + 2, closesQuote: false };
  }
  if (sql[index] === quoteChar) {
    return { consumed: quoteChar, nextIndex: index + 1, closesQuote: true };
  }
  return {
    consumed: sql[index] ?? "",
    nextIndex: index + 1,
    closesQuote: false,
  };
}

/** `ALTER TABLE [ONLY|IF EXISTS] t ADD [COLUMN] IF NOT EXISTS …`, every clause an add-column. `if not exists` is
 *  required: a bare `add column` is additive but not idempotent (ADR 0042 decision 4). */
function isIdempotentAddColumn(statement: string): boolean {
  const clauses = alterTableClausesOf(statement);
  return (
    clauses !== undefined &&
    clauses.length > 0 &&
    clauses.every(isSafeAddColumnClause)
  );
}

const ALTER_TABLE_HEAD = new RegExp(
  String.raw`^alter\s+table\s+(only\s+|if\s+exists\s+)?${TABLE_NAME}\s+(?<clauses>.+)$`,
);

function alterTableClausesOf(statement: string): string[] | undefined {
  const clauses = ALTER_TABLE_HEAD.exec(statement)?.groups?.["clauses"];
  return clauses === undefined ? undefined : topLevelClausesOf(clauses);
}

const ADD_COLUMN_CLAUSE = /^add\s+(column\s+)?if\s+not\s+exists\s+[\w"]+\b/;

function isSafeAddColumnClause(clause: string): boolean {
  if (!ADD_COLUMN_CLAUSE.test(clause.trim())) return false;
  if (isNotNullWithoutDefault(clause)) return false;
  // A function call anywhere in the clause (a `default` or an inline `check`) runs during the migration.
  if (containsDisallowedFunctionCall(clause)) return false;
  return true;
}

/** Asked of one clause, never the statement: `add column a text not null, add column b text default ''` has a
 *  `default`, and it belongs to the other column. */
function isNotNullWithoutDefault(clause: string): boolean {
  return /\bnot\s+null\b/.test(clause) && !/\bdefault\b/.test(clause);
}

function hasNotNullAddClauseWithoutDefault(statement: string): boolean {
  const clauses = alterTableClausesOf(statement) ?? [];
  return clauses.some(
    (clause) =>
      /^add\s+(column\s+)?/.test(clause.trim()) &&
      isNotNullWithoutDefault(clause),
  );
}

/** Commas at paren depth zero, so `numeric(10,2)` and a `check (a, b)` stay inside their clause. */
function topLevelClausesOf(text: string): string[] {
  const clauses: string[] = [];
  let clauseStart = 0;
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      clauses.push(text.slice(clauseStart, index));
      clauseStart = index + 1;
    }
  }

  clauses.push(text.slice(clauseStart));
  return clauses;
}

/** `concurrently` is refused earlier as transaction-forbidden, so only the ordinary form needs recognising here. */
function isIdempotentCreateIndex(statement: string): boolean {
  return /^create\s+(unique\s+)?index\s+if\s+not\s+exists\s/.test(statement);
}

/**
 * `0003`'s shape, matched structurally: the whole body is exactly one `pg_constraint` guard and one guarded
 * `alter table … add constraint` naming the same constraint; a `conrelid` clause, when present, names the altered
 * table. The `check (…)` condition is read by balanced parens and must be followed by exactly `); end if; end $$`,
 * because a greedy capture would span `;` and run statements in between unscreened.
 */
const CONSTRAINT_GUARD_HEAD = new RegExp(
  String.raw`^do \$\$ begin if not exists \(\s*select 1 from pg_constraint where conname = '([^']*)'` +
    String.raw`(?: and conrelid = '([^']*)'::regclass)?\s*\) then alter table (${TABLE_NAME}) ` +
    String.raw`add constraint (\S+) check \(`,
);

const CONSTRAINT_GUARD_TAIL = "); end if; end $$";

/** A DO block using dynamic SQL (`execute`, `perform`, `format(…)`, `||`) is refused however it matches the template,
 *  and so is one holding a comment marker: PL/pgSQL strips comments inside a `$$` body, so a comment could split a
 *  function call into two halves this screen does not read as a call. */
function isConstraintGuardedDoBlock(statement: string): boolean {
  if (!/^do\s+\$\$/.test(statement)) return false;
  if (usesDynamicSql(statement)) return false;
  if (containsCommentMarker(statement)) return false;

  const head = CONSTRAINT_GUARD_HEAD.exec(statement);
  if (head === null) return false;
  const [
    wholeHead,
    guardedName,
    guardedTable,
    alteredTable,
    addedConstraintName,
  ] = head;

  const afterOpenParen = statement.slice(wholeHead.length);
  const condition = balancedParenContent(afterOpenParen);
  if (condition === undefined) return false;
  if (condition.includes(";")) return false;
  if (containsDisallowedFunctionCall(condition)) return false;
  if (afterOpenParen.slice(condition.length) !== CONSTRAINT_GUARD_TAIL)
    return false;

  // Second anchor beside the exact-tail check: the body holds exactly one `begin` and one `end if;`.
  if (countOccurrences(statement, /\bbegin\b/g) !== 1) return false;
  if (countOccurrences(statement, /\bend\s+if\s*;/g) !== 1) return false;

  if (guardedName !== addedConstraintName) return false;
  return (
    guardedTable === undefined ||
    guardedTable === stripQuotes(alteredTable ?? "")
  );
}

function usesDynamicSql(statement: string): boolean {
  return /\bexecute\b|\bperform\b|\bformat\s*\(|\|\|/.test(statement);
}

/** A comment marker surviving `scanSql` can only be inside a `$$…$$` body. */
function containsCommentMarker(statement: string): boolean {
  return statement.includes("/*") || statement.includes("--");
}

/** The content between a `(` the caller already consumed and its matching `)`; `undefined` if the parens never
 *  balance, which leaves no shape to recognise and so is refused. */
function balancedParenContent(text: string): string | undefined {
  let depth = 1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(0, index);
    }
  }
  return undefined;
}

function countOccurrences(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * A function call in a `CHECK` or `DEFAULT` runs during the migration (`lo_unlink(42)`), so any `name(`, qualified or
 * quoted, is refused by syntax rather than by a denylist of names. Only `now` and `pg_catalog.now` pass, matched
 * whole: comparing only the last segment would let `evil.now()` through.
 */
const ALLOWED_FUNCTION_CALLS = new Set(["now", "pg_catalog.now"]);

const FUNCTION_CALL_HEAD = /("[^"]*"|[a-z_][\w$]*(?:\.[a-z_][\w$]*)*)\s*\(/g;

function containsDisallowedFunctionCall(expression: string): boolean {
  for (const match of expression.matchAll(FUNCTION_CALL_HEAD)) {
    const rawName = match[1] ?? "";
    const qualifiedName = rawName
      .split(".")
      .map((segment) => stripQuotes(segment))
      .join(".");
    if (!ALLOWED_FUNCTION_CALLS.has(qualifiedName)) return true;
  }
  return false;
}

/** `conrelid = 'designs'::regclass` names the table as a string, `alter table designs` as a possibly quoted
 *  identifier; the quotes are stripped before the two are compared. */
function stripQuotes(identifier: string): string {
  return identifier.replace(/^"|"$/g, "");
}

/** An `on delete <action>` foreign-key clause, which is part of a table definition and not a row rewrite. */
const ON_DELETE_REFERENTIAL_ACTION =
  /\bon\s+delete\s+(cascade|restrict|no\s+action|set\s+null|set\s+default)\b/g;

/**
 * `delete` and `update` both rewrite existing rows, except an `on delete …` clause inside `create table if not
 * exists`: a new table has no rows. The clause is stripped and the statement re-tested, so any other `delete` still
 * trips this. `update` has no such exemption.
 */
function rewritesExistingRows(statement: string): boolean {
  if (/\bupdate\b/.test(statement)) return true;
  if (!/\bdelete\b/.test(statement)) return false;
  if (!CREATE_TABLE_IF_NOT_EXISTS.test(statement)) return true;

  const withoutReferentialActions = statement.replace(
    ON_DELETE_REFERENTIAL_ACTION,
    " ",
  );
  return /\bdelete\b/.test(withoutReferentialActions);
}

function matchesAnchored(pattern: RegExp): (statement: string) => boolean {
  return (statement) => pattern.test(statement);
}

function matches(
  ...patterns: readonly RegExp[]
): (statement: string) => boolean {
  return (statement) => patterns.some((pattern) => pattern.test(statement));
}

// As in `migrate.ts`: `import.meta.url` percent-encodes a space and `process.argv[1]` does not (ADR 0013).
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

/** Only this package's own message is printed: an unknown error's message never goes to a log line, because a
 *  connection string can hide there (ADR 0008). */
function describeUnreadableMigrationSet(error: unknown): string {
  const reason =
    error instanceof MigrationSequenceError
      ? error.message
      : "unexpected failure";
  return `[migrate:unattended] could not read the migration files: ${reason}`;
}

/** Says so on the clean path: a screen that prints nothing when it passes looks like one that never ran (ADR 0013). */
function describeScreenOutcome(refusalCount: number): string {
  return refusalCount === 0
    ? "[migrate:unattended] every migration file is additive and idempotent; safe to apply unattended."
    : `[migrate:unattended] refusing to run unattended: ${String(refusalCount)} reason(s) above.`;
}
