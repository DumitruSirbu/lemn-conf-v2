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
