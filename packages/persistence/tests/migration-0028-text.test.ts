import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import { readMigrationFiles } from "../src/migration-files.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";
import {
  PRICE_NOTICES_MIGRATION as NOTICES,
  priceNoticesCheckPattern as patternOfCheck,
} from "./support/price-notices-migration.js";

/**
 * Migration `0028` (the price-notice marker), read as text with no database. What this file can show: it follows `0027`
 * with no gap, it is additive and re-runnable, it carries the columns, checks and key ADR 0178 (A-11) specifies, the checks accept
 * and refuse the values the store will send, and the grants the header prescribes are the exact ones, with nothing that
 * deletes. What it cannot show is what the application role is granted on a real database (the privilege test reads that
 * from the catalog) or what the store's statements do with a row (the live file's).
 */
const migrations = readMigrationFiles();
const A_21_CHARACTER_ID = "Ab3_-".repeat(4) + "Z";

const statements = executableStatementsOf(NOTICES.sql).join("\n");

/** The header's comment text on one line, so a sentence the file wraps can be asked for whole. */
const header = NOTICES.sql
  .split("\n")
  .filter((line) => line.startsWith("--"))
  .map((line) => line.replace(/^--\s?/, ""))
  .join(" ")
  .replace(/\s+/g, " ");

const grantsPrescribed = [
  ...header.matchAll(/GRANT (?:SELECT|INSERT|UPDATE)\b[^;]*? TO app_designs;/g),
].map((match) => match[0]);

describe("migration 0028 is the next version of the ledger", () => {
  it("follows 0027 without a gap, under the name of what it creates", () => {
    expect(NOTICES.version).toBe(28);
    expect(
      migrations.map((migration) => migration.version).slice(26, 28),
    ).toEqual([27, 28]);
    expect(NOTICES.fileName).toBe("0028_create_design_price_notices.sql");
  });

  it("records a checksum of its own bytes, and changes it when one byte of a comment changes", () => {
    expect(NOTICES.checksum).toBe(checksumOfMigration(NOTICES.sql));
    expect(checksumOfMigration(`${NOTICES.sql} `)).not.toBe(NOTICES.checksum);
  });

  it("says which ledger readings it expects, one version apart, and that its bytes are frozen once applied", () => {
    expect(header).toContain("ledger reads 1-27 before running, and 1-28");
    expect(header).toContain(
      "Once this file has been applied anywhere, its bytes are frozen, comments included.",
    );
  });
});

describe("0028 says when to apply it", () => {
  it("is applied before the code that reads it and before the grants, and says the routes answer 503 until then", () => {
    expect(header).toContain(
      "APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANTS.",
    );
    expect(header).toContain(
      "answer 503 against a database without this table, or without the grants above",
    );
  });

  it("does not claim a first-open pair is judged: only an acknowledged pair is", () => {
    expect(header).toContain(
      "A first open is not judged: it records the server's own current pair.",
    );
    expect(header).not.toContain(
      "is therefore always one the shop has published",
    );
  });
});

describe("0028 is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it("clears the unattended screen", () => {
    expect(unattendedMigrationRefusals([NOTICES])).toEqual([]);
  });

  it("has no grant, drop, delete, truncate, update, trigger or counter object in its statements", () => {
    expect(statements).not.toMatch(
      /\b(?:grant|revoke|drop|delete|truncate|update|alter|cascade|trigger|sequence|serial)\b/,
    );
  });

  it("is one create table statement, with no seed row and no index beyond the key", () => {
    expect(executableStatementsOf(NOTICES.sql)).toHaveLength(1);
    expect(statements).toMatch(
      /^create table if not exists design_price_notices\b/,
    );
    expect(statements).not.toMatch(/\bcreate index\b|\binsert into\b/);
  });
});

describe("0028 creates design_price_notices, one row per design", () => {
  it("holds the four columns of the plan, in order, with the instant defaulted by the database", () => {
    let from = 0;
    for (const column of [
      "design_id text primary key",
      "acknowledged_version_id text not null",
      "acknowledged_availability_revision bigint not null",
      "acknowledged_at timestamptz not null default now()",
    ]) {
      const at = statements.indexOf(column, from);
      expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
      from = at + column.length;
    }
  });

  it("gives the database exactly one default, the instant's, and the version and the revision none", () => {
    expect(statements.match(/\bdefault\b/g)).toHaveLength(1);
    expect(statements).toMatch(
      /acknowledged_at timestamptz not null default now\(\)/,
    );
  });

  it("accepts a revision of 0, which the availability head starts at, and refuses a negative one", () => {
    expect(statements).toContain(
      "constraint design_price_notices_availability_revision_not_negative check (acknowledged_availability_revision >= 0)",
    );
  });

  it("accepts a 21-character design id and version id, and refuses 20, 22 and a character outside the alphabet", () => {
    for (const name of [
      "design_price_notices_design_id_shape",
      "design_price_notices_acknowledged_version_id_shape",
    ]) {
      const pattern = patternOfCheck(name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID.slice(1)}!`), name).toBe(false);
    }
  });

  it("keeps every constraint name within the 63 bytes Postgres keeps", () => {
    const names = [...statements.matchAll(/constraint (\w+)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(names).toHaveLength(3);
    for (const name of names) expect(name.length, name).toBeLessThanOrEqual(63);
  });

  it("carries no foreign key, as 0015, 0022 and 0026 do not, and does not name the contact table", () => {
    expect(statements).not.toMatch(/\breferences\b/);
    expect(NOTICES.sql).not.toContain("contact_submissions");
  });

  it("says plainly that the credential can write any pair for any design, and that the authorisation is the route's", () => {
    expect(header).toContain("Accepted residual, stated plainly");
    expect(header).toContain("can write any pair for any design");
    expect(header).toContain(
      "The authorisation is the route's and not the table's",
    );
    expect(header).toContain("so no audit row is written");
  });

  it("states the rules that are the statement's and not the table's: the version exists, and the revision is not ahead of the head", () => {
    expect(header).toContain("the version must exist in `price_book_versions`");
    expect(header).toContain(
      "the availability revision must not be greater than the head's",
    );
  });

  it("prescribes select, insert on the three columns that leave out the instant, and update of the three that leave out the key", () => {
    expect(grantsPrescribed).toEqual([
      "GRANT SELECT ON TABLE public.design_price_notices TO app_designs;",
      "GRANT INSERT (design_id, acknowledged_version_id, acknowledged_availability_revision) ON TABLE public.design_price_notices TO app_designs;",
      "GRANT UPDATE (acknowledged_version_id, acknowledged_availability_revision, acknowledged_at) ON TABLE public.design_price_notices TO app_designs;",
    ]);
    expect(NOTICES.sql).not.toMatch(/^\s*grant\b/im);
  });

  it("grants nothing on the two tables its acknowledgement statement reads, which 0023 and 0025 already grant", () => {
    expect(grantsPrescribed.join(" ")).not.toMatch(
      /price_book_versions|catalogue_availability_head/,
    );
  });
});
