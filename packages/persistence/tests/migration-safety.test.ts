import { describe, expect, it } from "vitest";

import { readMigrationFiles } from "../src/migration-files.js";
import type { MigrationFile } from "../src/migration-files.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";

/**
 * ADR 0096 decision 5, enforced rather than documented: additive and idempotent migrations may run
 * unattended in the pipeline, and everything that can destroy or rewrite data stays a deliberate
 * operator action with the owner's authorisation.
 */

function fileContaining(sql: string): MigrationFile {
  return {
    version: 9,
    fileName: "0009_candidate.sql",
    sql,
    checksum: "checksum-of-candidate",
  };
}

function refusalsFor(sql: string): string[] {
  return unattendedMigrationRefusals([fileContaining(sql)]);
}

describe("unattendedMigrationRefusals", () => {
  it("clears the four migrations this repository actually ships", () => {
    // The load-bearing case. ADR 0096 decision 5 automates the pipeline on the claim that 0001-0004
    // are all additive and idempotent; a screen that refuses them would make the pipeline
    // unusable on the day it is switched on, and this is where that claim is checked.
    const files = readMigrationFiles();

    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(unattendedMigrationRefusals(files)).toEqual([]);
  });

  it("refuses a dropped column", () => {
    const refusals = refusalsFor("alter table designs drop column revision;");

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("drops a schema object");
    expect(refusals[0]).toContain("0009_candidate.sql");
  });

  it("refuses a dropped table", () => {
    expect(refusalsFor("drop table designs;")[0]).toContain(
      "drops a schema object",
    );
  });

  it("refuses a truncate", () => {
    expect(refusalsFor("truncate designs;")[0]).toContain("truncates a table");
  });

  it("refuses a delete over existing rows", () => {
    expect(
      refusalsFor("delete from designs where schema_version = 1;")[0],
    ).toContain("rewrites existing rows");
  });

  it("refuses an update over existing rows", () => {
    expect(refusalsFor("update designs set schema_version = 5;")[0]).toContain(
      "rewrites existing rows",
    );
  });

  it("refuses a column type change", () => {
    expect(
      refusalsFor("alter table designs alter column revision type text;")[0],
    ).toContain("changes a column's type");
  });

  it("refuses a not-null column added without a default", () => {
    expect(
      refusalsFor("alter table designs add column owner_id text not null;")[0],
    ).toContain("adds a not-null column with no default");
  });

  it("allows a not-null column added with a default, which is how 0004 is written", () => {
    expect(
      refusalsFor(
        "alter table designs add column if not exists revision bigint not null default 1;",
      ),
    ).toEqual([]);
  });

  it("refuses a statement Postgres will not run inside a transaction block", () => {
    // migrate.ts wraps each file in one transaction with its own ledger row, so this fails with a
    // bare "cannot run inside a transaction block" that explains nothing.
    expect(
      refusalsFor(
        "create index concurrently designs_revision_idx on designs (revision);",
      )[0],
    ).toContain("cannot run inside a transaction block");
  });

  it("refuses an enum value added to an existing type", () => {
    expect(
      refusalsFor("alter type design_state add value 'archived';")[0],
    ).toContain("cannot run inside a transaction block");
  });

  it("reports every reason a file is disqualified, not only the first", () => {
    const refusals = refusalsFor(
      "drop table old_designs; delete from designs where id = 'x';",
    );

    expect(refusals).toHaveLength(2);
  });

  it("does not read prose headers as SQL", () => {
    // Every migration in this repository carries a long comment header, and 0003's discusses
    // "drop constraint if exists" by name. Screening raw bytes would refuse the existing set.
    const refusals = refusalsFor(
      "-- The alternative, drop constraint if exists followed by add, would truncate nothing.\n" +
        "/* We considered delete from designs and rejected it. */\n" +
        "alter table designs add column if not exists note text;",
    );

    expect(refusals).toEqual([]);
  });
});

describe("executableStatementsOf", () => {
  it("drops comments, lowercases, and splits on the statement separator", () => {
    const statements = executableStatementsOf(
      "-- a header\nCREATE TABLE t (id TEXT);\n\nALTER TABLE t ADD COLUMN x TEXT;\n",
    );

    expect(statements).toEqual([
      "create table t (id text)",
      "alter table t add column x text",
    ]);
  });

  it("keeps nothing from a file that is only comments", () => {
    expect(executableStatementsOf("-- nothing here\n/* nor here */\n")).toEqual(
      [],
    );
  });
});
