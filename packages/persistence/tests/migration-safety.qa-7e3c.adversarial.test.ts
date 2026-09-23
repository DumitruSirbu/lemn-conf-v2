import { describe, expect, it } from "vitest";

import type { MigrationFile } from "../src/migration-files.js";
import { unattendedMigrationRefusals } from "../src/migration-safety.js";

/**
 * M7 wave 7E3c adversarial QA — the quote-aware scanner (SEC-7E3c.1) and the CTAS diagnosis
 * (SEC-7E3c.2), attacked from the direction that matters: SQL the screen clears while PostgreSQL
 * executes a statement the screen never saw as its own.
 *
 * Each case merges a hidden, non-additive statement into a preceding `create table if not exists`
 * by desynchronising the scanner's quote state from Postgres's lexer. The hidden statement uses no
 * word the named diagnoses search for, so only the allowlist could refuse it — and the allowlist only
 * reads the merged statement's start. Every one of these was measured against the test database
 * (on `pg_temp` tables, inside a rolled-back transaction): Postgres ran the hidden rename in each.
 */

const RENAME_A_LIVE_COLUMN =
  "alter table designs rename column document to document_gone";
const DISCARD_EVERY_NEW_DESIGN =
  "create rule qa_swallow as on insert to designs do instead nothing";

function refusalsFor(sql: string): string[] {
  const file: MigrationFile = {
    version: 9,
    fileName: "0009_candidate.sql",
    sql,
    checksum: "checksum-of-candidate",
  };
  return unattendedMigrationRefusals([file]);
}

describe("control: the hidden statements are refused when they stand alone", () => {
  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "refuses %s on its own",
    (statement) => {
      expect(refusalsFor(`${statement};`)).not.toEqual([]);
    },
  );
});

describe("quote-state desynchronisation merges a hidden statement into a recognised one", () => {
  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "an E-string's backslash-escaped quote: %s",
    (hidden) => {
      // Postgres: E'\'' is a one-character string and closes. The screen reads `\` as content and
      // `''` as an escaped quote, so it stays inside the literal until the later `'x'`.
      const sql = `create table if not exists qa_a (a text default E'\\'');\n${hidden};\ncomment on table qa_a is 'x';`;
      expect(refusalsFor(sql)).not.toEqual([]);
    },
  );

  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "an identifier ending in `$$` (a legal identifier character): %s",
    (hidden) => {
      const sql = `create table if not exists qa_b$$ (a int);\n${hidden};\ncreate table if not exists qa_c$$ (b int);`;
      expect(refusalsFor(sql)).not.toEqual([]);
    },
  );

  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "a nested block comment (Postgres nests them; the screen stops at the first `*/`): %s",
    (hidden) => {
      const sql = `create table if not exists qa_d (a text /* /* */ ' */);\n${hidden};\ncomment on table qa_d is 'x';`;
      expect(refusalsFor(sql)).not.toEqual([]);
    },
  );

  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "a tagged dollar quote holding a single quote: %s",
    (hidden) => {
      const sql = `create table if not exists qa_e (a text default $q$'$q$);\n${hidden};\ncomment on table qa_e is 'x';`;
      expect(refusalsFor(sql)).not.toEqual([]);
    },
  );

  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "a tagged dollar quote holding `$$`: %s",
    (hidden) => {
      const sql = `create table if not exists qa_g (a text default $q$ $$ $q$);\n${hidden};\ncomment on table qa_g is $q$ $$ $q$;`;
      expect(refusalsFor(sql)).not.toEqual([]);
    },
  );
});

describe("SEC-7E3c.2's CTAS diagnosis", () => {
  it.each([
    "create table if not exists qa_f as (select 1 as one);",
    "create table if not exists qa_f as(select 1 as one);",
    "create table if not exists qa_f as ((select 1 as one));",
  ])("refuses a CTAS whose query is parenthesised: %s", (sql) => {
    expect(refusalsFor(sql)).not.toEqual([]);
  });
});
