import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import { readMigrationFiles } from "../src/migration-files.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";

/**
 * Migration `0029` (the new-kitchen defaults), read as text with no database. What this file can show: it follows `0028`
 * with no gap, it is additive and re-runnable, it is a seeded singleton whose seed never resets saved defaults, it carries
 * the columns, checks and bounds ADR 0178 (A-9, F7) and its header specify, the checks accept and refuse the values the
 * store sends, and the grants the header prescribes are the exact ones, with no `INSERT` and nothing that deletes. What it
 * cannot show is what the application role is granted on a real database (the privilege test reads that from the
 * catalog) or what the store's statements do with the row (the live file's).
 */
const migrations = readMigrationFiles();
const DEFAULTS = (() => {
  const found = migrations.find((migration) =>
    migration.fileName.startsWith("0029_"),
  );
  if (found === undefined) throw new Error("no migration starts with 0029_");
  return found;
})();

const A_21_CHARACTER_ID = "Ab3_-".repeat(4) + "Z";

const statements = executableStatementsOf(DEFAULTS.sql).join("\n");

/** The header's comment text on one line, so a sentence the file wraps can be asked for whole. */
const header = DEFAULTS.sql
  .split("\n")
  .filter((line) => line.startsWith("--"))
  .map((line) => line.replace(/^--\s?/, ""))
  .join(" ")
  .replace(/\s+/g, " ");

const grantsPrescribed = [
  ...header.matchAll(/GRANT (?:SELECT|INSERT|UPDATE)\b[^;]*? TO app_designs;/g),
].map((match) => match[0]);

/** The file with its comment lines removed and its case kept, for a pattern whose character class case would change. */
const sqlWithoutComments = DEFAULTS.sql
  .split("\n")
  .filter((line) => !line.startsWith("--"))
  .join("\n");

function patternOfCheck(constraintName: string): RegExp {
  const match = new RegExp(
    `constraint ${constraintName} check \\(\\w+ ~ '([^']+)'\\)`,
  ).exec(sqlWithoutComments);
  if (match?.[1] === undefined)
    throw new Error(`no pattern check named ${constraintName}`);
  return new RegExp(match[1]);
}

describe("migration 0029 is the next version of the ledger", () => {
  it("follows 0028 without a gap, under the name of what it creates", () => {
    expect(DEFAULTS.version).toBe(29);
    expect(
      migrations.map((migration) => migration.version).slice(27, 29),
    ).toEqual([28, 29]);
    expect(DEFAULTS.fileName).toBe("0029_create_kitchen_defaults.sql");
  });

  it("records a checksum of its own bytes, and changes it when one byte of a comment changes", () => {
    expect(DEFAULTS.checksum).toBe(checksumOfMigration(DEFAULTS.sql));
    expect(checksumOfMigration(`${DEFAULTS.sql} `)).not.toBe(DEFAULTS.checksum);
  });

  it("says which ledger readings it expects, one version apart, and that its bytes are frozen once applied", () => {
    expect(header).toContain("ledger reads 1-28 before running, and 1-29");
    expect(header).toContain(
      "Once this file has been applied anywhere, its bytes are frozen, comments included.",
    );
  });

  it("says when to apply it as a standing fact: before any code that reads it runs and before the grants", () => {
    expect(header).toContain(
      "Apply this before any code that reads it runs, and before the grants.",
    );
    expect(header).toContain(
      "fails against a database that lacks the table or the grants",
    );
  });

  it("states how the head is shared as what holds, naming no wave, route or screen", () => {
    expect(header).toContain("at most one succeeds");
    expect(header).not.toMatch(
      /cannot all succeed|ships with|unattended screen|\b503\b|routes/,
    );
  });
});

describe("0029 is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it("clears the unattended screen", () => {
    expect(unattendedMigrationRefusals([DEFAULTS])).toEqual([]);
  });

  it("has no grant, drop, delete, truncate, update, trigger or counter object in its statements", () => {
    expect(statements).not.toMatch(
      /\b(?:grant|revoke|drop|delete|truncate|update|alter|cascade|trigger|sequence|serial)\b/,
    );
  });

  it("is one create table and one seed that never overwrites, in that order", () => {
    expect(executableStatementsOf(DEFAULTS.sql)).toHaveLength(2);
    expect(statements).toMatch(
      /^create table if not exists kitchen_defaults\b/,
    );
    expect(statements).toMatch(
      /insert into kitchen_defaults \(singleton, revision, defaults\) values \(true, 0, '\{\}'\) on conflict do nothing;?$/,
    );
    expect(statements).not.toMatch(/\bcreate index\b/);
  });
});

describe("0029 creates kitchen_defaults, one row for the whole shop", () => {
  it("holds the five columns of the plan, in order, with the instant defaulted by the database", () => {
    let from = 0;
    for (const column of [
      "singleton boolean primary key default true",
      "revision bigint not null",
      "defaults jsonb not null",
      "saved_at timestamptz not null default now()",
      "saved_by_account_id text",
    ]) {
      const at = statements.indexOf(column, from);
      expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
      from = at + column.length;
    }
  });

  it("is a singleton: the key is checked to be true, so a second row cannot exist", () => {
    expect(statements).toContain(
      "constraint kitchen_defaults_is_one_row check (singleton)",
    );
  });

  it("gives the database exactly two defaults, the key's and the instant's, and the revision and the defaults none", () => {
    expect(statements.match(/\bdefault\b/g)).toHaveLength(2);
    expect(statements).toMatch(/singleton boolean primary key default true/);
    expect(statements).toMatch(/saved_at timestamptz not null default now\(\)/);
  });

  it("seeds revision 0 and empty defaults, which the application reads as none saved", () => {
    expect(statements).toContain("values (true, 0, '{}')");
    expect(header).toContain(
      'The application reads revision 0 as "none saved"',
    );
    expect(header).toContain("a save of `{}` is a save");
  });

  it("accepts a revision of 0, which the seed holds, and refuses a negative one", () => {
    expect(statements).toContain(
      "constraint kitchen_defaults_revision_is_not_negative check (revision >= 0)",
    );
  });

  it("holds defaults to an object of at most 64 KiB of jsonb text, in the first apply", () => {
    expect(statements).toContain(
      "constraint kitchen_defaults_is_an_object check (jsonb_typeof(defaults) = 'object')",
    );
    expect(statements).toContain(
      "constraint kitchen_defaults_size check (octet_length(defaults::text) <= 65536)",
    );
    expect(header).toContain(
      "cannot be added later to a row that already holds more",
    );
  });

  it("accepts a 21-character saver and null before the first save, and refuses 20, 22 and a character outside the alphabet", () => {
    const pattern = patternOfCheck(
      "kitchen_defaults_saved_by_account_id_shape",
    );

    expect(pattern.test(A_21_CHARACTER_ID)).toBe(true);
    expect(pattern.test(A_21_CHARACTER_ID.slice(1))).toBe(false);
    expect(pattern.test(`${A_21_CHARACTER_ID}A`)).toBe(false);
    expect(pattern.test(`${A_21_CHARACTER_ID.slice(1)}!`)).toBe(false);
    expect(statements).not.toMatch(/saved_by_account_id text not null/);
  });

  it("keeps every constraint name within the 63 bytes Postgres keeps", () => {
    const names = [...statements.matchAll(/constraint (\w+)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(names).toHaveLength(5);
    for (const name of names) expect(name.length, name).toBeLessThanOrEqual(63);
  });

  it("carries no foreign key, as 0015, 0022 and 0026 do not, and does not name the contact table", () => {
    expect(statements).not.toMatch(/\breferences\b/);
    expect(DEFAULTS.sql).not.toContain("contact_submissions");
  });

  it("says the defaults are not the pricing fallback and a saved design never reads them again", () => {
    expect(header).toContain("The defaults are **not** the pricing fallback");
    expect(header).toContain("a design already saved never reads them again");
  });

  it("prescribes select, and update of the four columns that leave out the key, and no insert", () => {
    expect(grantsPrescribed).toEqual([
      "GRANT SELECT ON TABLE public.kitchen_defaults TO app_designs;",
      "GRANT UPDATE (revision, defaults, saved_at, saved_by_account_id) ON TABLE public.kitchen_defaults TO app_designs;",
    ]);
    expect(grantsPrescribed.join(" ")).not.toMatch(/\bINSERT\b/);
    expect(header).toContain("No INSERT, no DELETE, no TRUNCATE");
    expect(DEFAULTS.sql).not.toMatch(/^\s*grant\b/im);
  });

  it("grants nothing on the two tables its store and reader also use, which 0001 and 0025 already grant", () => {
    expect(grantsPrescribed.join(" ")).not.toMatch(
      /catalogue_availability_head|\bdesigns\b/,
    );
    expect(header).toContain("nothing is granted on either here");
  });

  it("says plainly that the defaults are not in the nightly export", () => {
    expect(header).toContain("The defaults are not in the nightly export");
  });
});

describe("the runbook's cross-check of the defaults row", () => {
  const RUNBOOK = readFileSync(
    new URL(
      "../../../docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\s+/g, " ");

  it("is an equality: the revision equals the number of kitchen-defaults-saved audit rows", () => {
    expect(RUNBOOK).toContain(
      "`kitchen_defaults.revision` must equal the number of `kitchen-defaults-saved` rows in `staff_audit_events`",
    );
  });
});
