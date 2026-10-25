import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import { readMigrationFiles } from "../src/migration-files.js";
import { EMAIL_CHANGE_REVERT_PURPOSE } from "../src/account-store.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";

/**
 * Migration `0019` (security review of wave S13b, finding F3), read as text with no database: the partial index the
 * address-reservation lookup reads, that it is additive and re-runnable, and that its predicate is the one the stores'
 * queries ask. Whether the planner uses it is a database fact, and no test here claims it.
 */
const migrations = readMigrationFiles();
const RESERVATION_INDEX = migrations.find((migration) =>
  migration.fileName.startsWith("0019_"),
);

function indexMigration() {
  if (RESERVATION_INDEX === undefined) throw new Error("no migration 0019");
  return RESERVATION_INDEX;
}

function statementText(): string {
  return executableStatementsOf(indexMigration().sql).join("\n");
}

describe("0019: the partial index of the live address reservations", () => {
  it("is version 19, with a checksum of its own bytes", () => {
    const migration = indexMigration();

    expect(migration.version).toBe(19);
    expect(migration.fileName).toBe(
      "0019_add_email_token_reservation_index.sql",
    );
    expect(migration.checksum).toBe(checksumOfMigration(migration.sql));
    expect(checksumOfMigration(`${migration.sql} `)).not.toBe(
      migration.checksum,
    );
  });

  it("clears the unattended screen", () => {
    expect(unattendedMigrationRefusals([indexMigration()])).toEqual([]);
  });

  it("is one statement: a re-runnable create index, not concurrent, and nothing that writes or drops", () => {
    const text = statementText();

    expect(executableStatementsOf(indexMigration().sql)).toHaveLength(1);
    expect(text).toMatch(/^create index if not exists \S+ on /);
    expect(text).not.toMatch(
      /\b(?:concurrently|unique|drop|delete|truncate|update|insert|grant|revoke|alter)\b/,
    );
  });

  it("indexes the normal form of the address a token names, on account_email_tokens", () => {
    expect(statementText()).toMatch(
      /^create index if not exists account_email_tokens_live_reservation_idx on account_email_tokens \(new_email_normal_form\) where /,
    );
  });

  it("is partial on the one purpose that reserves an address, and on rows not yet used", () => {
    expect(statementText()).toContain(
      `where purpose = '${EMAIL_CHANGE_REVERT_PURPOSE}' and used_at is null`,
    );
  });

  it("keeps now() out of the predicate: an index predicate must be immutable, and expiry stays a filter in the queries", () => {
    expect(statementText()).not.toMatch(/\bnow\s*\(|expires_at/);
  });

  it("needs no grant, and its header says so", () => {
    expect(statementText()).not.toMatch(/\bgrant\b/);
    expect(indexMigration().sql).toMatch(/No grant is needed/);
  });
});
