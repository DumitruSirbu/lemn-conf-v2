import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import {
  readMigrationFiles,
  type MigrationFile,
} from "../src/migration-files.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";

/**
 * Migrations `0026` and `0027` (M10 wave S4: the seen marks, and the digest's rounds and entries), read as text with no
 * database. What this file can show: the two follow `0025` with no gap, each is additive and re-runnable, each carries the
 * columns, checks and keys the plan's section 9.2 specifies, the checks accept and refuse the values the stores will send,
 * and the grants the headers prescribe are the exact ones, with nothing that deletes and nothing wider on
 * `contact_submissions` than `priced`. What it cannot show is what the application role is granted on a real database: the
 * privilege test reads that from the catalog. The SQL's behaviour is the live file's, and the pglite check's.
 */
const migrations = readMigrationFiles();

function migrationNamed(prefix: string): MigrationFile {
  const found = migrations.find((migration) =>
    migration.fileName.startsWith(prefix),
  );
  if (found === undefined)
    throw new Error(`no migration starts with ${prefix}`);
  return found;
}

const SEEN = migrationNamed("0026_");
const DIGEST = migrationNamed("0027_");
const S4_MIGRATIONS = [SEEN, DIGEST];

const A_21_CHARACTER_ID = "Ab3_-".repeat(4) + "Z";

function statementsOf(migration: MigrationFile): string {
  return executableStatementsOf(migration.sql).join("\n");
}

/** The file with its comment lines removed and its case kept. */
function sqlWithoutComments(migration: MigrationFile): string {
  return migration.sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n");
}

/** The JavaScript regular expression that reads like the one named check's Postgres pattern. The patterns here use no
 *  feature on which Postgres and JavaScript differ. */
function patternOfCheck(
  migration: MigrationFile,
  constraintName: string,
): RegExp {
  const match = new RegExp(
    `constraint ${constraintName} check \\(\\w+ ~ '([^']+)'\\)`,
  ).exec(sqlWithoutComments(migration));
  if (match?.[1] === undefined)
    throw new Error(`no pattern check named ${constraintName}`);
  return new RegExp(match[1]);
}

/** The header's comment text on one line, so a sentence the file wraps can be asked for whole. */
function headerTextOf(migration: MigrationFile): string {
  return migration.sql
    .split("\n")
    .filter((line) => line.startsWith("--"))
    .map((line) => line.replace(/^--\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
}

/** The `GRANT … ;` statements the header prescribes, comment markers removed and continuation lines joined. */
function grantsPrescribedBy(migration: MigrationFile): string[] {
  return [
    ...headerTextOf(migration).matchAll(
      /GRANT (?:SELECT|INSERT|UPDATE)\b[^;]*? TO app_designs;/g,
    ),
  ].map((match) => match[0]);
}

function openingsOf(migration: MigrationFile): string[] {
  return executableStatementsOf(migration.sql).map(
    (statement) =>
      /^(?:create table if not exists|create index if not exists|insert into) \w+/.exec(
        statement,
      )?.[0] ?? statement,
  );
}

function columnsInOrder(text: string, columns: readonly string[]): void {
  let from = 0;
  for (const column of columns) {
    const at = text.indexOf(column, from);
    expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
    from = at + column.length;
  }
}

describe("migrations 0026 and 0027 are the next two versions of the ledger", () => {
  it("follow 0025 without a gap", () => {
    expect(S4_MIGRATIONS.map((migration) => migration.version)).toEqual([
      26, 27,
    ]);
    expect(
      migrations.map((migration) => migration.version).slice(24, 27),
    ).toEqual([25, 26, 27]);
  });

  it("are named for what each creates", () => {
    expect(S4_MIGRATIONS.map((migration) => migration.fileName)).toEqual([
      "0026_create_design_staff_seen.sql",
      "0027_create_staff_change_digest.sql",
    ]);
  });

  it("record a checksum of their own bytes, and change it when one byte of a comment changes", () => {
    for (const migration of S4_MIGRATIONS) {
      expect(migration.checksum).toBe(checksumOfMigration(migration.sql));
      expect(checksumOfMigration(`${migration.sql} `)).not.toBe(
        migration.checksum,
      );
    }
    expect(
      new Set(S4_MIGRATIONS.map((migration) => migration.checksum)).size,
    ).toBe(2);
  });

  it("say which ledger readings they expect, one version apart", () => {
    expect(headerTextOf(SEEN)).toContain(
      "ledger reads 1-25 before running, and 1-26",
    );
    expect(headerTextOf(DIGEST)).toContain(
      "ledger reads 1-26 before running, and 1-27",
    );
  });

  it("carry the frozen-bytes paragraph of 0016", () => {
    for (const migration of S4_MIGRATIONS) {
      expect(headerTextOf(migration)).toContain(
        "Once this file has been applied anywhere, its bytes are frozen, comments included.",
      );
    }
  });

  it("say they are applied before the code that reads them and before the grants", () => {
    for (const migration of S4_MIGRATIONS) {
      expect(headerTextOf(migration)).toContain(
        "APPLY THIS BEFORE THE CODE THAT READS IT SHIPS, AND BEFORE THE GRANT",
      );
    }
  });
});

describe("each is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it.each(
    S4_MIGRATIONS.map((migration) => [migration.fileName, migration] as const),
  )("%s clears the unattended screen", (_name, migration) => {
    expect(unattendedMigrationRefusals([migration])).toEqual([]);
  });

  it.each(
    S4_MIGRATIONS.map((migration) => [migration.fileName, migration] as const),
  )(
    "%s has no grant, drop, delete, truncate, update, trigger or counter object in its statements",
    (_name, migration) => {
      expect(statementsOf(migration)).not.toMatch(
        /\b(?:grant|revoke|drop|delete|truncate|update|alter|cascade|trigger|sequence|serial)\b/,
      );
    },
  );

  it("is, for each file, its create table statements (and 0027's one index), and no seed row: no singleton here", () => {
    expect(openingsOf(SEEN)).toEqual([
      "create table if not exists design_staff_seen",
    ]);
    expect(openingsOf(DIGEST)).toEqual([
      "create table if not exists staff_change_digest_rounds",
      "create table if not exists staff_change_digest_entries",
      "create index if not exists staff_change_digest_entries_design_id_revision_idx",
    ]);
  });
});

describe("0026 creates design_staff_seen, one row per design, shared by all staff", () => {
  const text = statementsOf(SEEN);

  it("holds the four columns of the plan, in order, with the instant defaulted by the database", () => {
    columnsInOrder(text, [
      "design_id text primary key",
      "seen_revision bigint not null",
      "seen_by_account_id text not null",
      "seen_at timestamptz not null default now()",
    ]);
  });

  it("keeps the seen revision positive, as a design starts at revision 1", () => {
    expect(text).toContain(
      "constraint design_staff_seen_seen_revision_is_positive check (seen_revision > 0)",
    );
  });

  it("accepts a 21-character design id and staff account, and refuses 20, 22 and a character outside the alphabet", () => {
    for (const name of [
      "design_staff_seen_design_id_shape",
      "design_staff_seen_seen_by_account_id_shape",
    ]) {
      const pattern = patternOfCheck(SEEN, name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID.slice(1)}!`), name).toBe(false);
    }
  });

  it("carries no foreign key and no index beyond its key, as 0015 and 0022 do not", () => {
    expect(text).not.toMatch(/\breferences\b|\bcreate index\b/);
  });

  it("says plainly, in its header, that the credential can write any seen revision, and where that is detected", () => {
    const header = headerTextOf(SEEN);
    expect(header).toContain("Accepted residual, stated plainly");
    expect(header).toContain("write any seen revision for any design");
    expect(header).toContain(
      "ignore a mark above the kitchen's current revision",
    );
    expect(header).toContain("until it is next saved");
    expect(header).toContain("so a forged mark above it hides nothing");
    expect(header).toContain(
      "A row whose `seen_revision` is above its design's `revision` was not written by the store",
    );
    expect(header).toContain(
      "the same credential can insert `kitchen-seen` rows",
    );
    expect(header).toContain("the owner's runbook has the query");
  });

  it("states the rules that are the statement's and not the table's: greatest, and the account and instant only for a greater revision", () => {
    const header = headerTextOf(SEEN);
    expect(header).toContain("`seen_revision = greatest(existing, displayed)`");
    expect(header).toContain(
      "only when the displayed revision is strictly greater",
    );
    expect(header).toContain(
      "the greater of `seen_revision`, unless that is above the kitchen's own revision, and the design revision of its latest submission",
    );
    expect(header).toContain("That comparison is made in SQL, never above it");
  });

  it("prescribes select, insert on the three columns that leave out seen_at, and update of the three that leave out the key", () => {
    expect(grantsPrescribedBy(SEEN).slice(0, 3)).toEqual([
      "GRANT SELECT ON TABLE public.design_staff_seen TO app_designs;",
      "GRANT INSERT (design_id, seen_revision, seen_by_account_id) ON TABLE public.design_staff_seen TO app_designs;",
      "GRANT UPDATE (seen_revision, seen_by_account_id, seen_at) ON TABLE public.design_staff_seen TO app_designs;",
    ]);
  });

  it("prescribes, on contact_submissions, exactly the one column grant of ADR 0178 F2 and nothing wider, as a runbook step and not in a statement", () => {
    expect(grantsPrescribedBy(SEEN)).toHaveLength(4);
    expect(grantsPrescribedBy(SEEN)[3]).toBe(
      "GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;",
    );
    expect(headerTextOf(SEEN)).toContain(
      "Any wider SELECT on that table is forbidden.",
    );
    expect(statementsOf(SEEN)).not.toContain("contact_submissions");
    expect(SEEN.sql).not.toMatch(/^\s*grant\b/im);
  });
});

describe("0027 creates the digest's rounds and entries", () => {
  const text = statementsOf(DIGEST);

  it("holds a round keyed by its day and an entry keyed by the round and the design, in the plan's columns and order", () => {
    columnsInOrder(text, [
      "create table if not exists staff_change_digest_rounds",
      "day_key text primary key",
      "claimed_at timestamptz not null default now()",
      "sent_count integer not null default 0",
    ]);
    columnsInOrder(text, [
      "create table if not exists staff_change_digest_entries",
      "day_key text not null references staff_change_digest_rounds (day_key)",
      "design_id text not null",
      "revision bigint not null",
      "primary key (day_key, design_id)",
    ]);
  });

  it("says the day key is the round's id, and names no separate round id", () => {
    expect(headerTextOf(DIGEST)).toContain(
      "`day_key` (`YYYY-MM-DD`) is the primary key **and the round's id**",
    );
    expect(text).not.toContain("round_id");
  });

  it("references the rounds alone: no foreign key to designs or accounts, and no on delete clause", () => {
    expect(text.match(/\breferences\b[^,)]*/g)).toEqual([
      "references staff_change_digest_rounds (day_key",
    ]);
    expect(text).not.toMatch(/\bon\s+delete\b/);
  });

  it("indexes the entries by design and revision, because the primary key starts with the day", () => {
    expect(text).toContain(
      "create index if not exists staff_change_digest_entries_design_id_revision_idx on staff_change_digest_entries (design_id, revision)",
    );
  });

  it("accepts a calendar day as the day key and refuses a month 13, a day 32, a short year, a time and an empty text", () => {
    const pattern = patternOfCheck(
      DIGEST,
      "staff_change_digest_rounds_day_key_shape",
    );
    for (const accepted of [
      "2026-10-27",
      "2026-01-01",
      "3999-12-31",
      "2026-02-29",
    ]) {
      expect(pattern.test(accepted), accepted).toBe(true);
    }
    for (const refused of [
      "2026-13-01",
      "2026-00-10",
      "2026-10-32",
      "2026-10-00",
      "26-10-27",
      "2026-10-27T05:00",
      "2026-10-27 ",
      "2026-1-27",
      "",
      "today",
      "2026-10-27\n",
    ]) {
      expect(pattern.test(refused), JSON.stringify(refused)).toBe(false);
    }
  });

  it("keeps the sent count from going negative, the revision positive, and the design id the shape of designs.id", () => {
    expect(text).toContain(
      "constraint staff_change_digest_rounds_sent_count_is_not_negative check (sent_count >= 0)",
    );
    expect(text).toContain(
      "constraint staff_change_digest_entries_revision_is_positive check (revision > 0)",
    );
    const pattern = patternOfCheck(
      DIGEST,
      "staff_change_digest_entries_design_id_shape",
    );
    expect(pattern.test(A_21_CHARACTER_ID)).toBe(true);
    expect(pattern.test(A_21_CHARACTER_ID.slice(1))).toBe(false);
    expect(pattern.test(`${A_21_CHARACTER_ID}A`)).toBe(false);
  });

  it("says plainly, in its header, that the credential can claim a day early or plant an entry, that neither can be undone by the application, and how it shows", () => {
    const header = headerTextOf(DIGEST);
    expect(header).toContain("Accepted residual, stated plainly");
    expect(header).toContain("can claim a day that has not come");
    expect(header).toContain(
      "keeps that kitchen out of the digest until staff open it",
    );
    expect(header).toContain(
      "holds nothing, so a forged entry cannot hold a kitchen for good",
    );
    expect(header).toContain("cannot delete a round or an entry");
    expect(header).toContain("`sent_count` is writable by the same credential");
    expect(header).toContain(
      "The reliable tell is a round whose `claimed_at` precedes its `day_key`",
    );
    expect(header).toContain("not claimed by the cron");
  });

  it("states that a claimed day with no entries holds nothing, that the claim precedes the send, and that entries are only inserted", () => {
    const header = headerTextOf(DIGEST);
    expect(header).toContain("a claimed day with no entries holds nothing");
    expect(header).toContain(
      "The claim is inserted **before** the mail is sent",
    );
    expect(header).toContain(
      "only ever inserted: the role has no UPDATE and no DELETE",
    );
  });

  it("prescribes select and insert of the day alone on the rounds, update of the count alone, and select and insert of the three columns on the entries, never an update", () => {
    expect(grantsPrescribedBy(DIGEST)).toEqual([
      "GRANT SELECT ON TABLE public.staff_change_digest_rounds TO app_designs;",
      "GRANT INSERT (day_key) ON TABLE public.staff_change_digest_rounds TO app_designs;",
      "GRANT UPDATE (sent_count) ON TABLE public.staff_change_digest_rounds TO app_designs;",
      "GRANT SELECT ON TABLE public.staff_change_digest_entries TO app_designs;",
      "GRANT INSERT (day_key, design_id, revision) ON TABLE public.staff_change_digest_entries TO app_designs;",
    ]);
    expect(
      grantsPrescribedBy(DIGEST).filter(
        (grant) =>
          grant.startsWith("GRANT UPDATE") &&
          grant.includes("staff_change_digest_entries"),
      ),
    ).toEqual([]);
  });

  it("writes no audit row and has no staff actor, and says the digest is a system action", () => {
    expect(headerTextOf(DIGEST)).toContain(
      "The digest is a system action: nothing here has a staff actor, so nothing here writes an audit row",
    );
  });
});
