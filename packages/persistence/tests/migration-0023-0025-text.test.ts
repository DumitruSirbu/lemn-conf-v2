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
 * Migrations `0023` to `0025` (M10 wave S2: the price book versions, the price draft, and the availability head and
 * log), read as text with no database. What this file can show: the three follow `0022` with no gap, each is additive
 * and re-runnable, each carries the columns, checks and seed row the plan's section 9.2 specifies, the checks accept and
 * refuse the values the stores will send, and the grants the headers prescribe are the exact ones, with nothing that
 * deletes. What it cannot show is what the application role is granted on a real database: the privilege test reads that
 * from the catalog.
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

const VERSIONS = migrationNamed("0023_");
const DRAFT = migrationNamed("0024_");
const AVAILABILITY = migrationNamed("0025_");
const S2_MIGRATIONS = [VERSIONS, DRAFT, AVAILABILITY];

const A_21_CHARACTER_ID = "Ab3_-".repeat(4) + "Z";

function statementsOf(migration: MigrationFile): string {
  return executableStatementsOf(migration.sql).join("\n");
}

/** The file with its comment lines removed and its case kept: the executable statements are lower-cased by the screen,
 *  which would change a character class. */
function sqlWithoutComments(migration: MigrationFile): string {
  return migration.sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n");
}

/** The JavaScript regular expression that reads like the one named check `constraintName`'s Postgres pattern. The
 *  patterns here use no feature on which Postgres and JavaScript differ. */
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

/** What each statement of the file starts with, up to the name of the table it touches. */
function openingsOf(migration: MigrationFile): string[] {
  return executableStatementsOf(migration.sql).map(
    (statement) =>
      /^(?:create table if not exists|insert into) \w+/.exec(statement)?.[0] ??
      statement,
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

describe("migrations 0023 to 0025 are the next three versions of the ledger", () => {
  it("follow 0022 without a gap", () => {
    expect(S2_MIGRATIONS.map((migration) => migration.version)).toEqual([
      23, 24, 25,
    ]);
    expect(
      migrations.map((migration) => migration.version).slice(21, 25),
    ).toEqual([22, 23, 24, 25]);
  });

  it("are named for what each creates", () => {
    expect(S2_MIGRATIONS.map((migration) => migration.fileName)).toEqual([
      "0023_create_price_book_versions.sql",
      "0024_create_price_book_draft.sql",
      "0025_create_catalogue_availability.sql",
    ]);
  });

  it("record a checksum of their own bytes, and change it when one byte of a comment changes", () => {
    for (const migration of S2_MIGRATIONS) {
      expect(migration.checksum).toBe(checksumOfMigration(migration.sql));
      expect(checksumOfMigration(`${migration.sql} `)).not.toBe(
        migration.checksum,
      );
    }
    expect(
      new Set(S2_MIGRATIONS.map((migration) => migration.checksum)).size,
    ).toBe(3);
  });

  it("say which ledger readings they expect, one version apart", () => {
    expect(headerTextOf(VERSIONS)).toContain(
      "ledger reads 1-22 before running, and 1-23",
    );
    expect(headerTextOf(DRAFT)).toContain(
      "ledger reads 1-23 before running, and 1-24",
    );
    expect(headerTextOf(AVAILABILITY)).toContain(
      "ledger reads 1-24 before running, and 1-25",
    );
  });

  it("carry the frozen-bytes paragraph of 0016", () => {
    for (const migration of S2_MIGRATIONS) {
      expect(headerTextOf(migration)).toContain(
        "Once this file has been applied anywhere, its bytes are frozen, comments included.",
      );
    }
  });
});

describe("each is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it.each(
    S2_MIGRATIONS.map((migration) => [migration.fileName, migration] as const),
  )("%s clears the unattended screen", (_name, migration) => {
    expect(unattendedMigrationRefusals([migration])).toEqual([]);
  });

  it.each(
    S2_MIGRATIONS.map((migration) => [migration.fileName, migration] as const),
  )(
    "%s has no grant, drop, delete, truncate, update, foreign key or trigger in its statements",
    (_name, migration) => {
      expect(statementsOf(migration)).not.toMatch(
        /\b(?:grant|revoke|drop|delete|truncate|update|alter|references|cascade|trigger|sequence|serial)\b/,
      );
    },
  );

  it("is, for each file, its create table statements and the seed row of a singleton, and nothing else", () => {
    expect(openingsOf(VERSIONS)).toEqual([
      "create table if not exists price_book_versions",
    ]);
    expect(openingsOf(DRAFT)).toEqual([
      "create table if not exists price_book_draft",
      "insert into price_book_draft",
    ]);
    expect(openingsOf(AVAILABILITY)).toEqual([
      "create table if not exists catalogue_availability_head",
      "insert into catalogue_availability_head",
      "create table if not exists catalogue_availability_changes",
    ]);
  });

  it("seeds each singleton with insert … on conflict do nothing, so a re-run never resets a row that has moved", () => {
    expect(statementsOf(DRAFT)).toContain(
      "insert into price_book_draft (singleton, revision, changes) values (true, 0, '[]') on conflict do nothing",
    );
    expect(statementsOf(AVAILABILITY)).toContain(
      "insert into catalogue_availability_head (singleton, revision) values (true, 0) on conflict do nothing",
    );
  });
});

describe("0023 creates price_book_versions, append-only, with no state column", () => {
  const text = statementsOf(VERSIONS);

  it("holds the nine columns of the plan, in order, and none for a state", () => {
    columnsInOrder(text, [
      "id text primary key",
      "sequence_number bigint not null",
      "label text not null",
      "note text not null",
      "book jsonb not null",
      "change_summary jsonb not null",
      "published_at timestamptz not null default now()",
      "published_by_account_id text not null",
    ]);
    expect(text).not.toMatch(/\bstate\b|\bstatus\b|\bis_active\b|\bactive\b/);
  });

  it("makes the sequence number positive and unique, which is what a second racing publish meets", () => {
    expect(text).toContain(
      "constraint price_book_versions_sequence_number_is_positive check (sequence_number > 0)",
    );
    expect(text).toContain(
      "constraint price_book_versions_sequence_number_is_unique unique",
    );
  });

  it("bounds the label to 1 to 80 characters and the note to at most 240, the domain's bounds", () => {
    expect(text).toContain("check (char_length(label) between 1 and 80)");
    expect(text).toContain("check (char_length(note) <= 240)");
  });

  it("requires the book to be a JSON object and the change summary a JSON array, each bounded to 4 MiB of jsonb text as 0011 bounds a document", () => {
    expect(text).toContain("check (jsonb_typeof(book) = 'object')");
    expect(text).toContain("check (jsonb_typeof(change_summary) = 'array')");
    expect(text).toContain(
      "constraint price_book_versions_book_size check (octet_length(book::text) <= 4194304)",
    );
    expect(text).toContain(
      "constraint price_book_versions_change_summary_size check (octet_length(change_summary::text) <= 4194304)",
    );
    expect(headerTextOf(VERSIONS)).toContain("`0011`'s ceiling");
  });

  it("says plainly, in its header, that a holder of the application credential can make a newest version live with no audit row, and where it is detected", () => {
    const header = headerTextOf(VERSIONS);
    expect(header).toContain(
      "prices go live with no `price-published` audit row",
    );
    expect(header).toContain("owner's runbook cross-check");
  });

  it("accepts a 21-character id on the version and its publisher, and refuses 20, 22 and a character outside the alphabet", () => {
    for (const name of [
      "price_book_versions_id_shape",
      "price_book_versions_published_by_account_id_shape",
    ]) {
      const pattern = patternOfCheck(VERSIONS, name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID.slice(1)}!`), name).toBe(false);
    }
  });

  it("carries no foreign key and no index beyond its key and its unique constraint", () => {
    expect(text).not.toMatch(/\breferences\b|\bcreate index\b/);
  });

  it("prescribes select, and insert on the seven columns that leave out published_at, and nothing more", () => {
    expect(grantsPrescribedBy(VERSIONS)).toEqual([
      "GRANT SELECT ON TABLE public.price_book_versions TO app_designs;",
      "GRANT INSERT (id, sequence_number, label, note, book, change_summary, published_by_account_id) ON TABLE public.price_book_versions TO app_designs;",
    ]);
  });
});

describe("0024 creates price_book_draft, a seeded singleton the application only updates", () => {
  const text = statementsOf(DRAFT);

  it("holds the singleton key and the six columns of the plan, in order", () => {
    columnsInOrder(text, [
      "singleton boolean primary key default true",
      "revision bigint not null",
      "changes jsonb not null",
      "base_version_id text",
      "updated_at timestamptz not null default now()",
      "updated_by_account_id text",
    ]);
    expect(text).toContain(
      "constraint price_book_draft_is_one_row check (singleton)",
    );
  });

  it("starts at revision 0 with no change, and never lets the revision go negative", () => {
    expect(text).toContain("check (revision >= 0)");
    expect(text).toContain("values (true, 0, '[]')");
    expect(text).toContain("check (jsonb_typeof(changes) = 'array')");
  });

  it("bounds the changes to 4 MiB of jsonb text as 0011 bounds a document", () => {
    expect(text).toContain(
      "constraint price_book_draft_changes_size check (octet_length(changes::text) <= 4194304)",
    );
    expect(headerTextOf(DRAFT)).toContain("`0011`'s ceiling");
  });

  it("accepts a 21-character id on the base version and the staff account, and refuses 20 and 22", () => {
    for (const name of [
      "price_book_draft_base_version_id_shape",
      "price_book_draft_updated_by_account_id_shape",
    ]) {
      const pattern = patternOfCheck(DRAFT, name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
    }
  });

  it("prescribes select and a column update that leaves out the key, and no insert: the row is seeded", () => {
    expect(grantsPrescribedBy(DRAFT)).toEqual([
      "GRANT SELECT ON TABLE public.price_book_draft TO app_designs;",
      "GRANT UPDATE (revision, changes, base_version_id, updated_at, updated_by_account_id) ON TABLE public.price_book_draft TO app_designs;",
    ]);
  });
});

describe("0025 creates the availability head and log with no counter object and no hook on insert", () => {
  const text = statementsOf(AVAILABILITY);

  it("holds a seeded head at revision 0 and a log keyed by the revision the head produced", () => {
    columnsInOrder(text, [
      "create table if not exists catalogue_availability_head",
      "singleton boolean primary key default true",
      "revision bigint not null",
    ]);
    columnsInOrder(text, [
      "create table if not exists catalogue_availability_changes",
      "revision bigint primary key",
      "item_kind text not null",
      "item_id text not null",
      "active boolean not null",
      "changed_at timestamptz not null default now()",
      "changed_by_account_id text not null",
    ]);
    expect(text).toContain("values (true, 0)");
  });

  it("says plainly, in its header, that the credential which inserts log rows can also move the head, so only a missing audit row detects a forged change", () => {
    const header = headerTextOf(AVAILABILITY);
    expect(header).toContain("can also move the head");
    expect(header).toContain("detects nothing");
    expect(header).toContain("only a missing audit row");
    expect(header).toContain("wedged until the owner");
    expect(header).toContain("runbook cross-checks");
  });

  it("contains no sequence, serial or trigger anywhere in the file, comments included", () => {
    expect(AVAILABILITY.sql).not.toMatch(/sequence|serial|trigger/i);
  });

  it("checks an item's kind and id by shape, not by list: a later kind needs no migration", () => {
    const kind = patternOfCheck(
      AVAILABILITY,
      "catalogue_availability_changes_item_kind_shape",
    );
    for (const accepted of [
      "material",
      "hardware",
      "finish",
      "handle",
      "accessory",
    ]) {
      expect(kind.test(accepted), accepted).toBe(true);
    }
    for (const refused of [
      "",
      "Material",
      "a".repeat(17),
      "mat erial",
      "material1",
    ]) {
      expect(kind.test(refused), JSON.stringify(refused)).toBe(false);
    }
    const id = patternOfCheck(
      AVAILABILITY,
      "catalogue_availability_changes_item_id_shape",
    );
    for (const accepted of [
      "pal",
      "item-Ab3_x9",
      "hinge.v2:1",
      "a".repeat(64),
    ]) {
      expect(id.test(accepted), accepted).toBe(true);
    }
    for (const refused of [
      "",
      "-x",
      ".x",
      "a b",
      "a".repeat(65),
      "x/y",
      "x\ny",
    ]) {
      expect(id.test(refused), JSON.stringify(refused)).toBe(false);
    }
  });

  it("makes the log's revision positive and the head's not negative", () => {
    expect(text).toContain(
      "constraint catalogue_availability_changes_revision_is_positive check (revision > 0)",
    );
    expect(text).toContain(
      "constraint catalogue_availability_head_revision_is_not_negative check (revision >= 0)",
    );
  });

  it("accepts a 21-character id on the staff account, and refuses 20 and 22", () => {
    const pattern = patternOfCheck(
      AVAILABILITY,
      "catalogue_availability_changes_changed_by_account_id_shape",
    );
    expect(pattern.test(A_21_CHARACTER_ID)).toBe(true);
    expect(pattern.test(A_21_CHARACTER_ID.slice(1))).toBe(false);
    expect(pattern.test(`${A_21_CHARACTER_ID}A`)).toBe(false);
  });

  it("prescribes the head's select and a revision-only update, and the log's select and insert without changed_at", () => {
    expect(grantsPrescribedBy(AVAILABILITY)).toEqual([
      "GRANT SELECT ON TABLE public.catalogue_availability_head TO app_designs;",
      "GRANT UPDATE (revision) ON TABLE public.catalogue_availability_head TO app_designs;",
      "GRANT SELECT ON TABLE public.catalogue_availability_changes TO app_designs;",
      "GRANT INSERT (revision, item_kind, item_id, active, changed_by_account_id) ON TABLE public.catalogue_availability_changes TO app_designs;",
    ]);
  });
});

describe("no grant a header prescribes widens past the plan", () => {
  it("names no DELETE, TRUNCATE, ALL, grant option, PUBLIC, REFERENCES or TRIGGER", () => {
    for (const migration of S2_MIGRATIONS) {
      for (const grant of grantsPrescribedBy(migration)) {
        expect(grant, migration.fileName).not.toMatch(
          /\b(?:DELETE|TRUNCATE|ALL|PUBLIC|OPTION|REFERENCES|TRIGGER)\b/,
        );
      }
    }
  });

  it("grants no INSERT on a seeded singleton, no UPDATE on the append-only tables and no INSERT of a stamped column", () => {
    const grants = S2_MIGRATIONS.flatMap(grantsPrescribedBy);
    expect(grants.filter((grant) => grant.startsWith("GRANT INSERT"))).toEqual([
      expect.stringContaining("public.price_book_versions"),
      expect.stringContaining("public.catalogue_availability_changes"),
    ]);
    expect(grants.filter((grant) => grant.startsWith("GRANT UPDATE"))).toEqual([
      expect.stringContaining("public.price_book_draft"),
      expect.stringContaining("public.catalogue_availability_head"),
    ]);
    for (const grant of grants.filter((entry) =>
      entry.startsWith("GRANT INSERT"),
    )) {
      expect(grant).not.toMatch(/published_at|changed_at/);
    }
    expect(
      grants.filter((grant) =>
        /price_book_draft|availability_head/.test(grant),
      ),
    ).not.toContainEqual(expect.stringMatching(/^GRANT INSERT/));
  });
});
