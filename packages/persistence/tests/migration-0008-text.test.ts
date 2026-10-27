import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readMigrationFiles } from "../src/migration-files.js";
import { executableStatementsOf } from "../src/migration-safety.js";
import {
  ALL_COLUMNS,
  PERSONAL_COLUMNS,
  UPDATABLE_COLUMNS,
} from "./support/contact-submission-columns.js";

const MIGRATION_PATH = join(
  import.meta.dirname,
  "..",
  "src",
  "migrations",
  "0008_create_contact_submissions.sql",
);

/**
 * The migration's text, as the security read of 0008 requires: nothing the database can compute is
 * derived from a personal column, no constraint names a column the role may update, and nothing in the file calls a
 * function but `now()` and `jsonb_typeof` on the two snapshots. The statement is read as the unattended screen reads it:
 * comments removed, lowercased.
 */
const SQL = readFileSync(MIGRATION_PATH, "utf8");
const [STATEMENT = ""] = executableStatementsOf(SQL);

/** Later migrations that name `contact_submissions` and whose text the checks below read against ADR 0153 decision 1's
 *  rule, each by name, so a migration after them still trips the last test. */
const LATER_MIGRATIONS_READ_AGAINST_THE_RULE: readonly string[] = [
  "0010_create_contact_submission_views.sql",
  "0015_add_design_account_id.sql",
  "0026_create_design_staff_seen.sql",
];

const ALLOWED_NAMES_BEFORE_A_PARENTHESIS = [
  "and",
  "check",
  "contact_submissions",
  "jsonb_typeof",
  "now",
];

/** The text of every `check (...)`, with its parentheses balanced. */
function checkBodiesOf(statement: string): string[] {
  const bodies: string[] = [];
  for (const start of statement.matchAll(/check \(/g)) {
    let depth = 1;
    let end = start.index + start[0].length;
    while (depth > 0 && end < statement.length) {
      if (statement[end] === "(") depth += 1;
      if (statement[end] === ")") depth -= 1;
      end += 1;
    }
    bodies.push(statement.slice(start.index + start[0].length, end - 1));
  }
  return bodies;
}

/** Each constraint's own text: from the word to the next comma outside parentheses, so a column that follows a
 *  column-level constraint is not read as part of it. */
function constraintClausesOf(statement: string): string[] {
  return [...statement.matchAll(/\bconstraint\b/g)].map((start) => {
    let depth = 0;
    let end = start.index;
    while (end < statement.length) {
      const character = statement[end];
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (character === "," && depth === 0) break;
      end += 1;
    }
    return statement.slice(start.index, end);
  });
}

function wordsOf(text: string): Set<string> {
  return new Set(text.match(/[a-z_][a-z0-9_]*/g) ?? []);
}

describe("migration 0008's text", () => {
  it("is one statement, so the checks below read all of it", () => {
    expect(executableStatementsOf(SQL)).toHaveLength(1);
    expect(STATEMENT).toMatch(
      /^create table if not exists contact_submissions \(/,
    );
  });

  it("declares exactly the columns the tests name, so the lists below cannot drift from the table", () => {
    const declared = [
      ...SQL.matchAll(/^ {2}([a-z_]+) (?:text|bigint|timestamptz|jsonb)\b/gm),
    ].map((match) => match[1]);

    expect([...declared].sort()).toEqual([...ALL_COLUMNS].sort());
  });

  it("calls no function but now(), and jsonb_typeof on the two snapshot columns", () => {
    const names = new Set(
      [...STATEMENT.matchAll(/([a-z_][a-z0-9_]*) ?\(/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    const typeOfArguments = [
      ...STATEMENT.matchAll(/jsonb_typeof\(([a-z_]+)\)/g),
    ].map((match) => match[1]);

    expect(
      [...names].filter(
        (name) => !ALLOWED_NAMES_BEFORE_A_PARENTHESIS.includes(name),
      ),
    ).toEqual([]);
    expect(typeOfArguments).toEqual(["design_document", "priced"]);
  });

  it("reads no personal column in any check", () => {
    const checks = checkBodiesOf(STATEMENT);

    expect(checks).toHaveLength(6);
    for (const body of checks) {
      expect(
        PERSONAL_COLUMNS.filter((column) => wordsOf(body).has(column)),
      ).toEqual([]);
    }
  });

  it("has no constraint that names a column the role may update", () => {
    const constraintClauses = constraintClausesOf(STATEMENT);

    expect(constraintClauses).toHaveLength(7);
    for (const clause of constraintClauses) {
      expect(
        UPDATABLE_COLUMNS.filter((column) => wordsOf(clause).has(column)),
      ).toEqual([]);
    }
  });

  it("has no generated column, identity, sequence, foreign key, trigger or index but the primary key and the reference's", () => {
    expect(STATEMENT).not.toMatch(
      /\bgenerated\b|\bidentity\b|\bserial\b|\bsequence\b|\breferences\b|\btrigger\b/,
    );
    expect(STATEMENT.match(/\bprimary key\b/g)).toHaveLength(1);
    expect(STATEMENT.match(/\bunique\b/g)).toHaveLength(1);
    expect(STATEMENT).toMatch(
      /constraint contact_submissions_reference_is_unique unique\b/,
    );
    expect(STATEMENT).not.toMatch(/\bunique \(/);
    expect(executableStatementsOf(SQL).join(" ")).not.toMatch(
      /\bcreate (?:unique )?index\b/,
    );
  });

  it("has no default but now(), and it is on created_at", () => {
    expect(STATEMENT.match(/\bdefault\b/g)).toHaveLength(1);
    expect(STATEMENT).toMatch(
      /created_at timestamptz not null default now\(\)/,
    );
  });

  it("names the reference's uniqueness as the store reads it", () => {
    expect(STATEMENT).toContain("contact_submissions_reference_is_unique");
  });

  it("is named by 0010 only as the target of its reference to the request id, which reads no column the role may update and no personal one", () => {
    const later = readMigrationFiles().find(
      (migration) =>
        migration.fileName === LATER_MIGRATIONS_READ_AGAINST_THE_RULE[0],
    );
    const statements = executableStatementsOf(later?.sql ?? "");
    const namingTheTable = statements
      .join(" ")
      .match(/\bcontact_submissions\b[^,]*/g);

    expect(statements).toHaveLength(1);
    expect(namingTheTable).toEqual([
      "contact_submissions (client_request_id) on delete cascade",
    ]);
    expect(
      [...UPDATABLE_COLUMNS, ...PERSONAL_COLUMNS].filter((column) =>
        wordsOf(statements.join(" ")).has(column),
      ),
    ).toEqual([]);
  });

  it("is named by 0015 only in its header comment, so no statement of it can read a column the role may update", () => {
    const account = readMigrationFiles().find(
      (migration) =>
        migration.fileName === LATER_MIGRATIONS_READ_AGAINST_THE_RULE[1],
    );
    const statements = executableStatementsOf(account?.sql ?? "");

    expect(account?.sql).toMatch(/contact_submissions/i);
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.join(" ")).not.toMatch(/contact_submissions/);
  });

  it("is named by 0026 only in its header comment, where the one grant on the table is SELECT on `priced`, a column the header of 0008 classes as not personal", () => {
    const seen = readMigrationFiles().find(
      (migration) =>
        migration.fileName === LATER_MIGRATIONS_READ_AGAINST_THE_RULE[2],
    );
    const statements = executableStatementsOf(seen?.sql ?? "");
    const headerText = (seen?.sql ?? "")
      .split("\n")
      .filter((line) => line.startsWith("--"))
      .map((line) => line.replace(/^--\s?/, ""))
      .join(" ")
      .replace(/\s+/g, " ");

    expect(statements.length).toBeGreaterThan(0);
    expect(statements.join(" ")).not.toMatch(/contact_submissions/);
    expect(
      headerText.match(
        /GRANT (?:SELECT|INSERT|UPDATE|ALL|DELETE|TRUNCATE|REFERENCES)\b[^;]*? ON TABLE public\.contact_submissions[^;]*;/g,
      ),
    ).toEqual([
      "GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;",
    ]);
    expect(PERSONAL_COLUMNS).not.toContain("priced");
    expect(UPDATABLE_COLUMNS).not.toContain("priced");
    expect(ALL_COLUMNS).toContain("priced");
  });

  it("is the last migration to name the table, or its author has read the rule that no constraint reads a column the role may update", () => {
    const laterMigrationsNamingTheTable = readMigrationFiles()
      .filter((migration) => migration.version > 8)
      .filter((migration) => /contact_submissions/i.test(migration.sql))
      .map((migration) => migration.fileName)
      .filter(
        (fileName) =>
          !LATER_MIGRATIONS_READ_AGAINST_THE_RULE.includes(fileName),
      );

    expect(
      laterMigrationsNamingTheTable,
      "a migration after 0008 names contact_submissions: before adding it, read the security read of 0008 (no " +
        "constraint, default, trigger or generated column may read notified_at, the one column the application " +
        "role may update, because a violation's detail would show the stored row), extend this file's checks to " +
        "that migration, and only then remove this tripwire's entry for it",
    ).toEqual([]);
  });
});
