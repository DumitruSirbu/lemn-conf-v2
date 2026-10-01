import { describe, expect, it } from "vitest";

import type { MigrationFile } from "../src/migration-files.js";
import { unattendedMigrationRefusals } from "../src/migration-safety.js";

/**
 * Adversarial companion to `migration-safety.test.ts`.
 *
 * The screen is what turns ADR 0096 decision 5 from a sentence into a check, and it is the last
 * thing standing between the pipeline and a file it applies to a production database with nobody
 * watching. `migration-safety.ts` states its own error direction — it may refuse a file it did not
 * need to, and a false refusal costs an operator one manual apply. This file attacks the *other*
 * direction: SQL that destroys or rewrites customer data and is nevertheless waved through.
 *
 * Every statement below is valid PostgreSQL. None of them is a contrived escape: they are the
 * ordinary spellings a person writes when the optional keywords are left out.
 */

function refusalsFor(sql: string): string[] {
  const file: MigrationFile = {
    version: 9,
    fileName: "0009_candidate.sql",
    sql,
    checksum: "checksum-of-candidate",
  };
  return unattendedMigrationRefusals([file]);
}

describe("evading the screen with spellings that omit an optional keyword", () => {
  it("refuses a dropped column written without the optional COLUMN keyword", () => {
    // `ALTER TABLE ... DROP [ COLUMN ] [ IF EXISTS ] name` — COLUMN is optional in PostgreSQL, so
    // this is the same statement `migration-safety.test.ts` already proves is refused, spelled the
    // shorter way. It takes `revision` and every row's value with it.
    expect(refusalsFor("alter table designs drop revision;")).not.toEqual([]);
  });

  it("refuses a dropped column written as DROP IF EXISTS", () => {
    expect(
      refusalsFor("alter table designs drop if exists revision;"),
    ).not.toEqual([]);
  });

  it("refuses an update whose target carries an alias", () => {
    // `UPDATE designs d SET ...` and `UPDATE designs AS d SET ...` are both ordinary PostgreSQL and
    // rewrite exactly the rows the un-aliased form does.
    expect(refusalsFor("update designs d set schema_version = 5;")).not.toEqual(
      [],
    );
    expect(
      refusalsFor("update designs as d set schema_version = 5;"),
    ).not.toEqual([]);
  });

  it("refuses an update written against ONLY the named table", () => {
    expect(
      refusalsFor("update only designs set schema_version = 5;"),
    ).not.toEqual([]);
  });

  it("refuses a column type change written without the optional COLUMN keyword", () => {
    // A type change rewrites every stored value, which is the rule's own stated reason.
    expect(
      refusalsFor("alter table designs alter revision type text;"),
    ).not.toEqual([]);
  });

  it("refuses a not-null column added without COLUMN and without a default", () => {
    // Fails outright against a populated `designs`, which is the rule's stated reason — and it
    // fails halfway through a pipeline run rather than in front of an operator.
    expect(
      refusalsFor("alter table designs add owner_id text not null;"),
    ).not.toEqual([]);
  });

  it("refuses a not-null column when only a sibling clause carries the default", () => {
    // One statement, two ADD COLUMN clauses. `owner_id` is not-null with no default of its own; the
    // `default` belongs to `note`. The screen asks whether the *statement* mentions a default.
    expect(
      refusalsFor(
        "alter table designs add column owner_id text not null, " +
          "add column note text default '';",
      ),
    ).not.toEqual([]);
  });
});

describe("evasions the screen already holds against", () => {
  it("refuses a drop in mixed case", () => {
    expect(refusalsFor("DrOp TaBlE designs;")).not.toEqual([]);
  });

  it("refuses a drop split across newlines", () => {
    expect(
      refusalsFor("alter table designs\n  drop\n  column\n  revision;"),
    ).not.toEqual([]);
  });

  it("refuses a drop hidden inside a dollar-quoted function body", () => {
    expect(
      refusalsFor(
        "create or replace function purge() returns void as $$\n" +
          "begin\n  drop table designs;\nend\n$$ language plpgsql;",
      ),
    ).not.toEqual([]);
  });

  it("refuses a drop inside a DO block", () => {
    expect(refusalsFor("do $$ begin drop table designs; end $$;")).not.toEqual(
      [],
    );
  });

  it("refuses a drop behind an EXECUTE of a string literal", () => {
    expect(
      refusalsFor("do $$ begin execute 'drop table designs'; end $$;"),
    ).not.toEqual([]);
  });

  it("refuses a drop written inside a string literal, erring toward refusal", () => {
    expect(
      refusalsFor("insert into audit (note) values ('drop table designs');"),
    ).not.toEqual([]);
  });

  it("refuses a drop that a nested block comment fails to hide", () => {
    // PostgreSQL nests `/* */`; this stripper does not, so the inner close ends the comment and the
    // drop survives to be screened. The wrong direction here would be silence.
    expect(
      refusalsFor("/* outer /* inner */ drop table designs; */"),
    ).not.toEqual([]);
  });

  it("refuses a truncate reached through a semicolon inside a string literal", () => {
    expect(
      refusalsFor("insert into audit (note) values ('a; truncate designs');"),
    ).not.toEqual([]);
  });
});

describe("the on-delete exemption (D2, M7 wave 7E3c) stays narrow", () => {
  // Acceptance criterion 3: the screen still refuses each of these, even though `0006` needs
  // `create table if not exists ... on delete cascade` to pass.
  it("refuses an on-delete cascade added to a table that may already exist", () => {
    expect(
      refusalsFor(
        "alter table designs add constraint designs_owner_fk " +
          "foreign key (owner_id) references owners (id) on delete cascade;",
      ),
    ).not.toEqual([]);
  });

  it("refuses on update cascade, inside or outside a create table if not exists", () => {
    expect(
      refusalsFor(
        "alter table designs add constraint designs_owner_fk " +
          "foreign key (owner_id) references owners (id) on update cascade;",
      ),
    ).not.toEqual([]);
    expect(
      refusalsFor(
        "create table if not exists t (id text, parent_id text references t (id) on update cascade);",
      ),
    ).not.toEqual([]);
  });

  it("refuses a bare delete over existing rows", () => {
    expect(refusalsFor("delete from designs;")).not.toEqual([]);
  });

  it("refuses a delete statement that follows a create table if not exists in the same file", () => {
    // Two statements: the first is the exempted shape, the second is an ordinary delete. Passing
    // the first must not launder the second past the screen.
    expect(
      refusalsFor(
        "create table if not exists t (id text primary key); delete from t;",
      ),
    ).not.toEqual([]);
  });

  it("refuses a create table if not exists whose on-delete clause hides a second, bare delete", () => {
    expect(
      refusalsFor(
        "create table if not exists t (id text references t (id) on delete cascade, note text default 'delete me too');",
      ),
    ).not.toEqual([]);
  });
});

// Security review, M7 wave 7E3c S1. `executableStatementsOf` used to strip `--`/`/* */` comments and
// split on `$$` before it knew anything about quotes, so a comment or dollar-quote marker written
// *inside* a string literal was read exactly as if it stood in ordinary code. Each case below is a
// migration Postgres reads as two statements — one that would clear the screen on its own, one that
// would not — where the old scanner read it as one, and either erased the dangerous statement
// entirely or merged it into the safe one's anchor.
describe("SEC-7E3c.1: the comment and statement scanner is quote-aware", () => {
  it("refuses a delete hidden behind a `--` inside a single-quoted default", () => {
    // The old scanner read `--` as a line comment the instant it saw it, with no idea it was
    // inside `'...'`, and a line comment with no later newline swallows the rest of the file —
    // including the real `delete from designs;` sitting right after the closing quote.
    expect(
      refusalsFor(
        "create table if not exists t (a text default '--'); delete from designs;",
      ),
    ).not.toEqual([]);
  });

  it("refuses a delete hidden behind a `/* */` pair split across a quoted default and a real comment", () => {
    // The `/*` here is two characters inside a string literal, not a comment start — but the old
    // scanner does not know that, and it greedily pairs it with the *next* `*/` it finds anywhere
    // in the file, which is the real trailing comment. Everything between, including the delete,
    // vanished from what the screen saw.
    expect(
      refusalsFor(
        "create table if not exists t (a text default '/*'); delete from designs; /* closer */",
      ),
    ).not.toEqual([]);
  });

  it("refuses a grant smuggled past the create-table anchor by a `$$` inside a quoted default", () => {
    // The old dollar-quote toggle also did not know about single-quoted strings: a `$$` inside
    // `'...'` switched it on anyway, and with no second `$$` to switch it back off, every semicolon
    // for the rest of the file — including the one that should have ended the create-table
    // statement — stopped counting as a separator. The whole file became one "statement" whose
    // *start* still matched `create table if not exists`, with an unscreened `grant` merged into
    // its tail. Quote-aware scanning keeps the two statements apart, so the grant is refused on its
    // own — unrecognised, exactly as a bare `grant` always has been.
    const refusals = refusalsFor(
      "create table if not exists t (a text default '$$'); grant select on designs to public;",
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("does not recognise");
  });

  it("still treats `''` inside a single-quoted string as an escaped quote, not a close", () => {
    // The escaped-quote case must keep working after the rewrite: `'it''s fine'` is one string,
    // not two adjacent ones with a bare `s fine` in between.
    expect(
      refusalsFor(
        "create table if not exists t (a text default 'it''s fine');",
      ),
    ).toEqual([]);
  });

  it('still treats a double-quoted identifier\'s `""` as an escaped quote', () => {
    expect(refusalsFor('create table if not exists "a""b" (id text);')).toEqual(
      [],
    );
  });
});

// Security review, M7 wave 7E3c S1. `create table if not exists` only ever anchored the *start* of
// a statement, so `create table if not exists name as select …` — CREATE TABLE AS SELECT, a query
// that runs during the migration — cleared the allowlist the same way a plain column list does.
describe("SEC-7E3c.2: create table if not exists refuses a query (CTAS)", () => {
  it("refuses a table created from a query that calls a function with side effects", () => {
    expect(
      refusalsFor("create table if not exists t as select lo_unlink(1);"),
    ).not.toEqual([]);
  });

  it.each([
    "select 1",
    "with x as (select 1) select * from x",
    "values (1)",
    "table designs",
  ])("refuses create table if not exists ... as %s", (query) => {
    expect(
      refusalsFor(`create table if not exists t as ${query};`),
    ).not.toEqual([]);
  });

  it("does not refuse an ordinary column list, which is not a query", () => {
    expect(
      refusalsFor("create table if not exists t (id text, note text);"),
    ).toEqual([]);
  });
});

describe("the false-positive direction: additive migrations that must still pass", () => {
  it("allows a column whose name contains a refused keyword", () => {
    // `deleted_at`, `dropped_at` and `update_count` are ordinary column names. A screen that
    // refused them would refuse the soft-delete migration this project will eventually write.
    expect(
      refusalsFor(
        "alter table designs add column if not exists deleted_at timestamptz;\n" +
          "alter table designs add column if not exists dropped_at timestamptz;\n" +
          "alter table designs add column if not exists update_count integer default 0;",
      ),
    ).toEqual([]);
  });

  it("allows a prose header that discusses every refused operation by name", () => {
    // 0003's real header names `drop constraint if exists`; 0004's names `not null default`. A
    // header is where the reasoning for a migration lives, so it must be free to name the thing it
    // rejected.
    expect(
      refusalsFor(
        "-- We considered drop table designs, truncate designs, and delete from designs.\n" +
          "-- An alter column revision type text was rejected as a rewrite.\n" +
          "/* create index concurrently was also rejected: migrate.ts wraps each file. */\n" +
          "alter table designs add column if not exists note text;",
      ),
    ).toEqual([]);
  });

  it("allows a constraint added inside a DO block, which is how 0003 is written", () => {
    expect(
      refusalsFor(
        "do $$\nbegin\n  if not exists (select 1 from pg_constraint where conname = 'c') then\n" +
          "    alter table designs add constraint c check (note is null or note <> '');\n" +
          "  end if;\nend $$;",
      ),
    ).toEqual([]);
  });

  it("allows a create index that is not concurrent", () => {
    expect(
      refusalsFor(
        "create index if not exists designs_updated_at_idx on designs (updated_at);",
      ),
    ).toEqual([]);
  });

  it("allows an insert of new rows, which adds data rather than rewriting it", () => {
    expect(
      refusalsFor("insert into settings (key, value) values ('a', 'b');"),
    ).toEqual([]);
  });
});
