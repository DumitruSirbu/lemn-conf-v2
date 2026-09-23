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

// Review round 1, SEC-7E3c.7: Postgres ends a line — and a `--` comment with it — at `\n` **or**
// `\r`. The old scanner read only `\n`, so a bare `\r` carried a `--` comment straight through a
// real statement sitting on the "next line".
describe("SEC-7E3c.7: a bare \\r ends a -- comment, the same as \\n", () => {
  it.each([RENAME_A_LIVE_COLUMN, DISCARD_EVERY_NEW_DESIGN])(
    "a bare \\r after -- carries the hidden statement past the comment: %s",
    (hidden) => {
      const sql = `create table if not exists qa_h (a int); -- note\r${hidden};`;
      expect(refusalsFor(sql)).not.toEqual([]);
    },
  );

  it("refuses a bare \\r on its own, outside any comment, named as an unmodelled construct", () => {
    const refusals = refusalsFor("create table if not exists qa_i (a\rint);");
    expect(refusals).not.toEqual([]);
    expect(refusals[0]).toContain("\\r");
  });

  it("does not refuse an ordinary \\r\\n line ending", () => {
    expect(
      refusalsFor(
        "create table if not exists qa_j (a int);\r\ncomment on table qa_j is 'x';",
      ),
    ).toEqual([]);
  });
});

// Review round 1, SEC-7E3c.8: the old guard accepted any DO block that merely *mentioned*
// `pg_constraint`, including inside a string a dynamic statement was built from, or a comment
// naming it for cover. Each case below is a DO block PostgreSQL runs as dynamic SQL, which the old
// check waved through because the literal substring "pg_constraint" appears somewhere in it.
describe("SEC-7E3c.8: a DO block guarded on pg_constraint is matched structurally, never by dynamic SQL", () => {
  it("refuses a DO block that mentions pg_constraint only in a trailing comment", () => {
    const sql =
      "do $$ begin execute 'drop table designs'; end $$; -- pg_constraint";
    expect(refusalsFor(sql)).not.toEqual([]);
  });

  it("refuses EXECUTE of a concatenated string naming pg_constraint nowhere at all", () => {
    const sql = "do $$ begin execute 'dr' || 'op table designs'; end $$;";
    expect(refusalsFor(sql)).not.toEqual([]);
  });

  it("refuses EXECUTE of a format(...) call", () => {
    const sql =
      "do $$ begin execute format('drop table %I', 'designs'); end $$;";
    expect(refusalsFor(sql)).not.toEqual([]);
  });

  it("refuses EXECUTE that grants superuser, dressed as if guarded", () => {
    const sql =
      "do $$ begin if not exists (select 1 from pg_constraint where conname = 'c') then " +
      "execute 'alter role app_designs superuser'; end if; end $$;";
    expect(refusalsFor(sql)).not.toEqual([]);
  });

  it("refuses PERFORM of an arbitrary function call inside an otherwise-guarded body", () => {
    const sql =
      "do $$ begin if not exists (select 1 from pg_constraint where conname = 'c') then " +
      "perform pg_terminate_backend(pid) from pg_stat_activity; end if; end $$;";
    expect(refusalsFor(sql)).not.toEqual([]);
  });

  it("refuses a guard naming a different constraint from the one it adds", () => {
    const sql =
      "do $$ begin if not exists (select 1 from pg_constraint where conname = 'c') then " +
      "alter table designs add constraint not_c check (true); end if; end $$;";
    expect(refusalsFor(sql)).not.toEqual([]);
  });

  it("refuses a guard whose conrelid names a different table from the one altered", () => {
    const sql =
      "do $$ begin if not exists (select 1 from pg_constraint where conname = 'c' and " +
      "conrelid = 'other_table'::regclass) then alter table designs add constraint c " +
      "check (true); end if; end $$;";
    expect(refusalsFor(sql)).not.toEqual([]);
  });
});

// Review round 1, SEC-7E3c.9: `insert into … select …` runs a query during the migration, the same
// hazard CTAS carries — not guaranteed to produce the same rows on a re-run, and able to call an
// arbitrary function with side effects. `inherits`/`partition of` attach a new table to an existing
// one's rows and structure, which is not the empty-table promise `create table if not exists` makes
// elsewhere in this allowlist.
describe("SEC-7E3c.9: insert is restricted to a literal VALUES list; inherits/partition of are refused", () => {
  it("refuses insert into … select …, which runs a query rather than adding literal rows", () => {
    expect(
      refusalsFor("insert into audit (note) select document from designs;"),
    ).not.toEqual([]);
  });

  it("refuses a table that inherits from an existing one", () => {
    expect(
      refusalsFor(
        "create table if not exists qa_k (a int) inherits (designs);",
      ),
    ).not.toEqual([]);
  });

  it("refuses a table declared as a partition of an existing one", () => {
    expect(
      refusalsFor(
        "create table if not exists qa_l partition of designs for values in (1);",
      ),
    ).not.toEqual([]);
  });

  it("still allows a literal insert, with or without ON CONFLICT DO NOTHING", () => {
    expect(
      refusalsFor("insert into settings (key, value) values ('a', 'b');"),
    ).toEqual([]);
    expect(
      refusalsFor(
        "insert into settings (key, value) values ('a', 'b') on conflict (key) do nothing;",
      ),
    ).toEqual([]);
  });

  it("refuses insert … on conflict … do update, which rewrites an existing row", () => {
    expect(
      refusalsFor(
        "insert into settings (key, value) values ('a', 'b') on conflict (key) do update set value = excluded.value;",
      ),
    ).not.toEqual([]);
  });
});
