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
 * **It refuses by default, and that is a correction.** This screen was first written as a denylist
 * — a list of destructive shapes to look for — and adversarial QA broke it seven ways on
 * 2026-09-07 without writing a single unusual statement. Every rule had assumed a keyword Postgres
 * makes optional: `ALTER TABLE t DROP revision` (no `COLUMN`), `ALTER TABLE t ALTER revision TYPE
 * text`, `UPDATE designs d SET …` (the alias sitting where `SET` was expected), `UPDATE ONLY …`,
 * `ADD owner_id text NOT NULL`, and a not-null clause whose sibling's `DEFAULT` satisfied a check
 * that looked at the whole statement. Each of those destroys or rewrites customer data and each was
 * waved through. A denylist over a language the size of SQL will keep leaking, and every patch to
 * it looks exactly like the last one did — correct until someone writes valid SQL nobody pictured.
 *
 * So the question is inverted. A statement runs unattended only if it matches a shape this module
 * **positively recognises** as additive and idempotent; anything else is refused and named as
 * unrecognised. The error direction is now a property of the design rather than of the list's
 * completeness: an unforeseen statement fails toward *a human reads it*, never toward *production
 * loses a column overnight*.
 *
 * The named destructive diagnoses below are kept, and they are **not** the safety property — they
 * exist so a refusal says "this drops a schema object" rather than only "unrecognised", and they
 * catch a denied operation smuggled inside a shape that is otherwise recognised (a `DROP TABLE`
 * inside an `INSERT`'s string literal, for instance). Deleting them would weaken the messages, not
 * the guarantee.
 *
 * **It is a lexical screen and deliberately not a parser.** It strips comments, splits on `;`
 * outside dollar quotes, and matches anchored patterns. It refuses far more than it must, and a
 * false refusal costs one manual apply under ADR 0096 decision 5 — the path that class of migration
 * takes anyway. A parser would be a second SQL implementation to keep right, and its failures would
 * be silent instead.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MigrationSequenceError } from "./migration-errors.js";
import { readMigrationFiles } from "./migration-files.js";
import type { MigrationFile } from "./migration-files.js";

/**
 * The shapes that may run unattended. A statement matching none of them is refused.
 *
 * The set is small on purpose and is sized to what the four shipped files actually need. Adding to
 * it is a deliberate act: each entry is a promise that the shape is additive *and* idempotent under
 * ADR 0042 decision 4's re-run-everything adoption path, which is why every one of them carries an
 * `if not exists` or is a guarded `DO` block.
 *
 * Optional keywords are parsed as optional wherever they appear — `COLUMN`, `ONLY`, `IF EXISTS` —
 * so a recognised shape stays recognised however it is spelled. That was the lesson of the seven
 * evasions: a pattern that assumes the longer spelling is a pattern with a hole in it, and here the
 * hole would cause a needless refusal rather than a silent apply.
 */
interface AdditiveStatementShape {
  readonly what: string;
  readonly isMatchedBy: (statement: string) => boolean;
}

const TABLE_NAME = String.raw`[\w".]+`;

/** Anchors the one shape both the allowlist and the `on delete` exemption below need to agree on:
 *  a statement is only ever read as "creating a table that may not already exist", never as
 *  altering one that does. */
const CREATE_TABLE_IF_NOT_EXISTS = /^create\s+table\s+if\s+not\s+exists\s/;

/**
 * `INSERT INTO table [(cols)] VALUES (…) [, (…) …] [ON CONFLICT … DO NOTHING]` — a fixed, literal
 * row set, never a query. Review round 1, SEC-7E3c.9: the old shape was bare `^insert\s+into\s`,
 * which cleared `INSERT INTO … SELECT …` the same way `CREATE TABLE … AS SELECT` once cleared on
 * `create table if not exists` alone — a query runs during the migration and is not guaranteed to
 * produce the same rows on a re-run, which is exactly the CTAS diagnosis's own reasoning one row
 * lower. `ON CONFLICT DO NOTHING` is the only conflict clause admitted, for the same idempotence
 * promise `IF NOT EXISTS` makes elsewhere in this allowlist — `DO UPDATE` rewrites an existing row
 * and belongs with the other rewrite diagnoses, not with an "adds new rows only" shape. No shipped
 * migration uses `insert` as executable SQL at all (only in prose), so nothing here is a rebaseline.
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

/** One destructive thing a refusal can name. These sharpen the message and catch a denied operation
 *  hidden inside an otherwise recognised shape; the refuse-by-default rule above is what makes the
 *  screen safe, not this list. */
interface DestructiveDiagnosis {
  readonly what: string;
  readonly why: string;
  readonly isBrokenBy: (statement: string) => boolean;
}

const DESTRUCTIVE_DIAGNOSES: readonly DestructiveDiagnosis[] = [
  {
    what: "drops a schema object",
    why: "a dropped table, column, constraint or index takes its data with it, and nothing rolls a migration back (ADR 0096 decision 8)",
    // Bare `\bdrop\b`, because `DROP [COLUMN] [IF EXISTS] name` makes every following token
    // optional. A column named `dropped_at` is untouched by the word boundary.
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
    // Bare, for the reason `drop` is bare: `UPDATE designs d SET`, `UPDATE designs AS d SET` and
    // `UPDATE ONLY designs SET` all put something unexpected between the table and `SET`.
    // `updated_at` and `update_count` are untouched by the word boundary.
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
    // Scoped to the shape it is smuggled inside, the same pattern the module's own comment
    // describes: `create table if not exists` only ever anchors the *start* of a statement (SEC-
    // 7E3c.2), so a `create table if not exists name as select …` cleared the allowlist on that
    // anchor alone, with nothing reading what followed it.
    isBrokenBy: (statement) =>
      CREATE_TABLE_IF_NOT_EXISTS.test(statement) && CTAS_QUERY.test(statement),
  },
];

/** `CREATE TABLE [IF NOT EXISTS] name AS query` and `CREATE TABLE [IF NOT EXISTS] name AS TABLE
 *  source` are both a query, not a column list, and cover every keyword PostgreSQL accepts after
 *  the `AS` of a CTAS: `SELECT`, `WITH` (a `SELECT` wrapped in a CTE), `VALUES`, and `TABLE` itself.
 *  A column named `as` cannot collide with this: `\bas\b` requires it to stand alone, and none of
 *  the four words following it is a valid next token inside an ordinary column-list clause.
 *
 *  **QA round 1, Q2.** PostgreSQL's `AS` before a CTAS query takes the query parenthesised or not,
 *  and the parenthesised form takes any amount of whitespace around each paren — `AS (SELECT …)`,
 *  `AS(SELECT …)` and `AS ((SELECT …))` are all one statement to Postgres. `\s*\(*\s*` is what
 *  `\s+` was missing: zero or more parens, with the whitespace optional on both sides of the run
 *  rather than required once. */
const CTAS_QUERY = /\bas\s*\(*\s*(select|with|values|table)\b/;

/**
 * Every reason the pipeline must not apply these files unattended — empty when it may.
 *
 * One refusal per disqualifying statement, so a file with two problems reports two: an operator
 * repairing a migration wants to see all of what disqualified it, not to rediscover the next reason
 * on the next run.
 */
export function unattendedMigrationRefusals(
  files: readonly MigrationFile[],
): string[] {
  return files.flatMap(refusalsForFile);
}

function refusalsForFile(file: MigrationFile): string[] {
  // SEC-7E3c.4: checked before the statement split is trusted at all — a file that hits one of
  // these constructs can no longer trust `executableStatementsOf`'s own idea of where one statement
  // ends and the next begins, so nothing downstream of that split is asked to say anything further.
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
 * The named diagnosis first, then the allowlist.
 *
 * Order is for the message, not for the safety: a statement the allowlist would reject anyway reads
 * better as "drops a schema object" than as "unrecognised", and a statement the allowlist *accepts*
 * still has to clear the diagnoses — which is how `insert into audit values ('drop table designs')`
 * is refused despite `insert` being a recognised shape.
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

/** The default answer, and the one that makes the screen safe. It says *unrecognised* rather than
 *  *forbidden*, because that is the honest claim: this module did not decide the statement is
 *  dangerous, it declined to certify that it is not. */
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
 * The SQL with comments removed, lowercased, and split into statements.
 *
 * Comment stripping is not optional and is the first thing a reader should check when this screen
 * misbehaves: every migration in this repository carries a long prose header, `0003`'s discusses
 * `drop constraint if exists` by name, and `0004`'s discusses `not null default`. Screening the raw
 * bytes would refuse the entire existing set.
 *
 * Splitting and comment-stripping happen together, in one quote-aware pass (`rawStatementsOf`), for
 * the reason SEC-7E3c.1 exists: `--`, `/* *\/` and `;` are only ever read as meaningful outside a
 * quoted region, exactly as Postgres reads them.
 */
export function executableStatementsOf(sql: string): string[] {
  return scanSql(sql)
    .statements.map((statement) =>
      statement.toLowerCase().replace(/\s+/g, " ").trim(),
    )
    .filter((statement) => statement !== "");
}

/**
 * SEC-7E3c.4 (QA round 1, Q1; SEC-7E3c.7, review round 1). One construct this scanner still cannot
 * lex correctly costs the *whole file* its unattended status, named — the fail-closed correction to
 * SEC-7E3c.1's own quote-aware pass, which QA and review broke six ways without writing anything a
 * person would call unusual: a Postgres E-string's backslash escape (`E'\''`), an unquoted identifier
 * ending in the bare delimiter (`qa_b$$`), a nested block comment (Postgres nests them; this scanner
 * does not), a tagged dollar quote (`$q$…$q$`) holding a single quote or a literal `$$`, and a bare
 * `\r` (Postgres ends a `--` comment at `\n` **or** `\r`; the old scanner read only `\n`). Each merged
 * a hidden, unscreened statement into a preceding `create table if not exists`.
 *
 * **Modelling more of Postgres's lexer is not the fix that generalises** — the next construct nobody
 * pictured would still get through, and every patch to a growing lexer looks exactly as complete as
 * the last one did. So this refuses by *construct*, not by scenario: the shapes this module does not
 * model at all, checked once per file rather than embedded in each separate evasion QA or review
 * wrote. `refusalsForFile` checks this before running the allowlist at all, because a file that hits
 * one of these can no longer trust its own statement split.
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

/** The four string-type prefixes PostgreSQL recognises immediately before an opening quote — `E'`,
 *  `U&'`/`U&"`, `B'`, `X'` — each with escaping or encoding rules this module's plain quote-tracker
 *  does not implement. Matched only against what stands immediately before the quote, with a
 *  non-word character (or the start of the file) before *that*, so an ordinary one-character string
 *  like `'b'` is never mistaken for a bit-string's `B'…'`: the `b` there is quoted content, not a
 *  prefix standing in code. */
const STRING_TYPE_PREFIX = /(?:^|[^\w$])(u&|e|b|x)$/i;

function precedingStringPrefix(
  sql: string,
  quoteIndex: number,
): string | undefined {
  const lookback = sql.slice(Math.max(0, quoteIndex - 4), quoteIndex);
  return STRING_TYPE_PREFIX.exec(lookback)?.[1];
}

/**
 * One quote-aware pass over the raw file, splitting into statements with `--` and `/* *\/` comments
 * blanked to a single space — never inside a single-quoted string, a double-quoted identifier, or a
 * `$$`-delimited body, and never splitting on a `;` inside one either. Also collects `SEC-7E3c.4`'s
 * unmodelled-construct reasons in the same pass, since it is already the one place in this module
 * that knows which state each character stands in.
 *
 * **SEC-7E3c.1.** The version this replaces stripped comments with a plain regex before ever looking
 * at quotes, so `default '--'` inside a string literal was read as a comment start: everything after
 * it — including the statement's own closing quote, its closing paren and semicolon, and a second,
 * real statement sitting right behind it — vanished from what the screen saw, while Postgres reads
 * the same bytes correctly and executes both statements. The same held for `/* *\/` (a quoted `/*`
 * with a real, later `*\/` could swallow everything between into one "comment") and for `$$` (a
 * quoted `$$` could wedge the old dollar-quote toggle on, merging two real statements into one whose
 * *start* still matched `create table if not exists` while its tail carried an unrelated,
 * unrecognised statement no diagnosis happened to name).
 *
 * `''` inside a single-quoted literal and `""` inside a double-quoted identifier are the standard SQL
 * escapes for an embedded quote; both keep the scanner inside the same quoted region rather than
 * closing it early. A `$tag$…$tag$` body is not tracked — only the bare `$$` this repository's own
 * migrations use — for the reason the original comment already gave: an untracked tagged body falls
 * apart into fragments that fail to match a recognised shape, and this module always errs toward
 * refusing rather than silently accepting. SEC-7E3c.4 makes that refusal explicit and named, rather
 * than trusting that whatever the fragments happen to match is not itself a recognised shape.
 */
function scanSql(sql: string): RawScan {
  const statements: string[] = [];
  const unmodelledConstructs: string[] = [];
  let buffer = "";
  let state: ScanState = "code";
  let index = 0;

  while (index < sql.length) {
    if (state === "single-quote") {
      // SEC-7E3c.4: a backslash's meaning inside a single-quoted string depends on
      // `standard_conforming_strings`, a session setting this module never reads — `E'\''` is a
      // one-character string to Postgres and a still-open one to a scanner that reads `\` as
      // ordinary content, which is exactly QA's E-string case. Flagged once per statement's worth
      // of harm regardless of how many backslashes it holds; the file is refused either way.
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
      // Review round 1, SEC-7E3c.7: Postgres's own lexer ends a line — and so a `--` comment — at
      // `\n` **or** `\r`, and the old `indexOf("\n", …)` alone let a bare `\r` carry a comment
      // straight through a real statement sitting on the next line: `-- note\rdelete from
      // designs;` read as one un-terminated comment here while Postgres executed the delete.
      const lineEnd = indexOfEither(sql, "\n", "\r", index);
      index = lineEnd === -1 ? sql.length : lineEnd;
      buffer += " ";
      continue;
    }
    if (sql[index] === "\r" && sql[index + 1] !== "\n") {
      // SEC-7E3c.7: a bare `\r` is fixed above for the one place this screen currently reads a
      // line ending, but nothing in this module models what Postgres's own lexer does with one
      // anywhere else a line ending could matter later. Refused by construct, the same rule the
      // other unmodelled shapes follow, rather than trusted because today's one fix happens to
      // cover today's one probe.
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
      // No closing delimiter: Postgres's own lexer would refuse this as an unterminated comment
      // rather than reading the rest of the file as one, so these two characters are read as
      // ordinary code — refused for being unrecognised rather than silently swallowed.
      if (blockEnd === -1) {
        buffer += "/*";
        index += 2;
        continue;
      }
      // SEC-7E3c.4: PostgreSQL nests `/* */`, so `/* /* */ … */` is one comment that keeps running
      // past this scanner's first `*/` — the wrong direction here is silence, not a false refusal,
      // and a genuinely non-nested prose comment (every shipped header's own shape) never trips
      // this: `indexOf("/*", …)` inside the body finds nothing to find.
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
      // SEC-7E3c.4: two of QA's cases hinge on this one character. A `$` glued to the end of a bare
      // identifier (`qa_b$$`) is a legal identifier this scanner would otherwise read as a
      // dollar-quote *open*; a `$` starting a tagged quote (`$q$…$q$`) is a body this scanner would
      // otherwise read as ordinary code once the untagged toggle failed to arm. Both merge whatever
      // follows into the wrong statement. The one shape left alone is the bare, untagged `$$` this
      // repository's own migrations use, standing free of any identifier on either side.
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

/** The earliest of two single-character delimiters at or after `from`, or `-1` if neither occurs
 *  again — `String.indexOf` only ever takes one needle, and a `--` comment ends at whichever of
 *  `\n`/`\r` comes first (SEC-7E3c.7). */
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

/** One step inside a single- or double-quoted region: `''`/`""` is the SQL escape for an embedded
 *  quote and stays inside the region; a lone quote character ends it; anything else is ordinary
 *  content that cannot itself be a quote character, since a bare occurrence of `quoteChar` is always
 *  handled by one of the two branches above. */
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

/** `ALTER TABLE [ONLY|IF EXISTS] t ADD [COLUMN] IF NOT EXISTS …`, one or more clauses, each of them
 *  an add-column and each not-null clause carrying its own default. `if not exists` is required
 *  rather than optional: ADR 0042 decision 4 re-runs every file to adopt a database, so a bare
 *  `add column` is additive but not idempotent, and the two are both required here. */
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
  return (
    ADD_COLUMN_CLAUSE.test(clause.trim()) && !isNotNullWithoutDefault(clause)
  );
}

/** Asked of one clause, never of the statement. The statement-wide question was the seventh
 *  evasion: `add column a text not null, add column b text default ''` has a `default`, and it
 *  belongs to the wrong column. */
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

/** `concurrently` is already a transaction-forbidden diagnosis, so this shape need only recognise
 *  the ordinary form; a concurrent index is refused one step earlier and with a better message. */
function isIdempotentCreateIndex(statement: string): boolean {
  return /^create\s+(unique\s+)?index\s+if\s+not\s+exists\s/.test(statement);
}

/**
 * `0003`'s shape, matched structurally rather than by the mere presence of `pg_constraint`
 * somewhere in the body (review round 1, SEC-7E3c.8). The old check accepted any `DO` block that
 * *mentioned* `pg_constraint` — including inside a string a dynamic statement built from, or a
 * comment naming it for cover — so `do $$ begin execute 'drop table designs'; -- pg_constraint end
 * $$;` cleared the allowlist despite running a statement this screen never read. The guard is what
 * makes `0003`'s shape idempotent at all — Postgres has no `add constraint if not exists`, so the
 * file asks `pg_constraint` itself whether the work is already done — so this now requires the
 * *entire* body to be exactly that question and exactly one guarded `alter table … add constraint`,
 * naming the same constraint on both halves. Anything else, dynamic SQL above all, is an arbitrary
 * procedural body and is not recognised.
 *
 * **The `conrelid` clause is optional in the pattern, required in the check when present.** `0003`
 * and `0005` both scope the guard to one table (`and conrelid = 'designs'::regclass`), and where a
 * body carries it, it must name the same table the `alter table` below it does. A body that narrows
 * on `conname` alone is a real, valid PostgreSQL guard too — a constraint name is not required to be
 * unique across tables — and this allowlist has held that shape since before this wave.
 */
const CONSTRAINT_GUARD_TEMPLATE = new RegExp(
  String.raw`^do \$\$ begin if not exists \(\s*select 1 from pg_constraint where conname = '([^']*)'` +
    String.raw`(?: and conrelid = '([^']*)'::regclass)?\s*\) then alter table (${TABLE_NAME}) ` +
    String.raw`add constraint (\S+) check \((.+)\); end if; end \$\$$`,
);

/** Dynamic SQL inside a `DO` block can construct and run a statement this screen never sees —
 *  `execute`, `perform` (PL/pgSQL's fire-and-forget call, which reaches a function the same way),
 *  `format(…)` and string concatenation (`||`) are the ways a body builds one. Checked on every `DO`
 *  block regardless of whether it otherwise matches the guard template, so a future loosening of
 *  that template can never accidentally admit one — the same "regardless" the finding asked for. */
function isConstraintGuardedDoBlock(statement: string): boolean {
  if (!/^do\s+\$\$/.test(statement)) return false;
  if (usesDynamicSql(statement)) return false;

  const match = CONSTRAINT_GUARD_TEMPLATE.exec(statement);
  if (match === null) return false;
  const [, guardedName, guardedTable, alteredTable, addedConstraintName] =
    match;
  if (guardedName !== addedConstraintName) return false;
  return (
    guardedTable === undefined ||
    guardedTable === stripQuotes(alteredTable ?? "")
  );
}

function usesDynamicSql(statement: string): boolean {
  return /\bexecute\b|\bperform\b|\bformat\s*\(|\|\|/.test(statement);
}

/** `conrelid = 'designs'::regclass` names the table as a string; `alter table designs` names it as
 *  a bare or double-quoted identifier. Comparing the two for the structural match above means
 *  stripping the identifier's own quotes, if it has any — the string literal carries none to strip. */
function stripQuotes(identifier: string): string {
  return identifier.replace(/^"|"$/g, "");
}

/** The one referential action this screen ever reads out of a `delete` occurrence rather than into
 *  it (D2, M7 wave 7E3c): `on delete cascade|restrict|no action|set null|set default`, the shape
 *  `0006` needs for `design_share_links.design_id ... references designs (id) on delete cascade`. */
const ON_DELETE_REFERENTIAL_ACTION =
  /\bon\s+delete\s+(cascade|restrict|no\s+action|set\s+null|set\s+default)\b/g;

/**
 * `delete` and `update` both name a statement that rewrites existing rows — with one narrow
 * exemption. Inside a statement this screen has already anchored as `create table if not exists`,
 * an `on delete …` referential-action clause is part of the table's own definition, not a rewrite,
 * and a table that does not yet exist has no rows to rewrite regardless of what its foreign keys
 * say. Stripping just that clause and re-testing is what keeps the exemption narrow: any other
 * `delete` inside the same statement — there is none in `0006`, but the screen must not assume that
 * of a future one — still trips this diagnosis.
 *
 * `update` gets no such exemption: `on update cascade` inside a `create table if not exists` is
 * still refused, because nothing about this wave needs it and a broader exemption is a broader
 * promise than D2 made.
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
