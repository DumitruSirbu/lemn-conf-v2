import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { executableStatementsOf } from "../src/migration-safety.js";
import { PERSONAL_COLUMNS } from "./support/contact-submission-columns.js";

const MIGRATION_PATH = join(
  import.meta.dirname,
  "..",
  "src",
  "migrations",
  "0010_create_contact_submission_views.sql",
);

/**
 * The migration's text, read as the unattended screen reads it (comments removed, lowercased): the six columns of the
 * plan's D3 and nothing personal, the request named only by its id, and nothing the database computes but `now()` and
 * one `jsonb_typeof` of the document.
 */
const SQL = readFileSync(MIGRATION_PATH, "utf8");
const [STATEMENT = ""] = executableStatementsOf(SQL);

const COLUMNS = [
  "token_hash",
  "client_request_id",
  "schema_version",
  "design_document",
  "created_at",
  "revoked_at",
];

const ALLOWED_NAMES_BEFORE_A_PARENTHESIS = [
  "check",
  "contact_submission_views",
  "contact_submissions",
  "jsonb_typeof",
  "now",
];

describe("migration 0010's text", () => {
  it("is one statement, so the checks below read all of it", () => {
    expect(executableStatementsOf(SQL)).toHaveLength(1);
    expect(STATEMENT).toMatch(
      /^create table if not exists contact_submission_views \(/,
    );
  });

  it("declares exactly the six columns of the plan, none of them personal", () => {
    const declared = [
      ...SQL.matchAll(/^ {2}([a-z_]+) (?:text|integer|timestamptz|jsonb)\b/gm),
    ].map((match) => match[1]);

    expect(declared).toEqual(COLUMNS);
    expect(
      PERSONAL_COLUMNS.filter((column) => COLUMNS.includes(column)),
    ).toEqual([]);
  });

  it("gives every column but the revocation a value: not null, or the key", () => {
    expect(STATEMENT).toMatch(/token_hash text primary key/);
    expect(STATEMENT).toMatch(/client_request_id text not null references/);
    expect(STATEMENT).toMatch(/schema_version integer not null,/);
    expect(STATEMENT).toMatch(/design_document jsonb not null/);
    expect(STATEMENT).toMatch(
      /created_at timestamptz not null default now\(\)/,
    );
    expect(STATEMENT).toMatch(/revoked_at timestamptz \)$/);
  });

  it("names the request by its id alone, deleted with it", () => {
    expect(STATEMENT.match(/\breferences\b[^,]*/g)).toEqual([
      "references contact_submissions (client_request_id) on delete cascade",
    ]);
    expect(STATEMENT).not.toMatch(/\bon update\b/);
  });

  it("checks the hash's shape and that the document is an object, and nothing else", () => {
    expect(STATEMENT.match(/\bcheck\b/g)).toHaveLength(2);
    expect(STATEMENT).toContain(
      "constraint contact_submission_views_token_hash_is_sha256 check (token_hash ~ '^[0-9a-f]{64}$')",
    );
    expect(STATEMENT).toContain(
      "constraint contact_submission_views_design_document_is_an_object check " +
        "(jsonb_typeof(design_document) = 'object')",
    );
  });

  it("calls no function but now(), and jsonb_typeof on the document", () => {
    const names = new Set(
      [...STATEMENT.matchAll(/([a-z_][a-z0-9_]*) ?\(/g)].map(
        (match) => match[1] ?? "",
      ),
    );

    expect(
      [...names].filter(
        (name) => !ALLOWED_NAMES_BEFORE_A_PARENTHESIS.includes(name),
      ),
    ).toEqual([]);
    expect(
      [...STATEMENT.matchAll(/jsonb_typeof\(([a-z_]+)\)/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["design_document"]);
  });

  it("has no unique rule, index, generated column, identity, sequence or trigger, and one default", () => {
    expect(STATEMENT.match(/\bprimary key\b/g)).toHaveLength(1);
    expect(STATEMENT).not.toMatch(
      /\bunique\b|\bgenerated\b|\bidentity\b|\bserial\b|\bsequence\b|\btrigger\b/,
    );
    expect(executableStatementsOf(SQL).join(" ")).not.toMatch(
      /\bcreate (?:unique )?index\b/,
    );
    expect(STATEMENT.match(/\bdefault\b/g)).toHaveLength(1);
  });

  it("carries no grant: the grant is the owner's separate step", () => {
    expect(STATEMENT).not.toMatch(/\bgrant\b|\brevoke\b/);
  });

  it("states in its header the order of the steps and the ledger before and after", () => {
    expect(SQL).toContain(
      "**APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT.**",
    );
    expect(SQL).toContain("ledger reads 1-9 before running, and 1-10 after");
    expect(SQL).toContain(
      "The application role needs `INSERT` and `SELECT` on\n-- this table and nothing else",
    );
  });
});
