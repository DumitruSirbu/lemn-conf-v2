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
 * Migrations `0020` to `0022` (M8B Lot 3 wave L3-S1: the staff audit log, the kitchen notes and the request states),
 * read as text with no database. What this file can show: the three are the next three versions, each is additive and
 * re-runnable, each carries the named checks and the index the plan's section 2.3 specifies, the shape checks accept
 * and refuse the values the stores will send, and the grants the headers prescribe are the exact ones, with nothing
 * that deletes. What it cannot show: that a database holds these tables, or what the application role is granted
 * there. Those are the privilege test's, which skips until the owner has applied them.
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

const AUDIT = migrationNamed("0020_");
const NOTES = migrationNamed("0021_");
const REQUEST_STATES = migrationNamed("0022_");
const LOT_3_TABLES = [AUDIT, NOTES, REQUEST_STATES];

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

/** The pattern of the one named check `constraintName`, as the JavaScript regular expression that reads the same. The
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

describe("migrations 0020 to 0022 are the next three versions of the ledger", () => {
  it("follow 0019 without a gap", () => {
    expect(LOT_3_TABLES.map((migration) => migration.version)).toEqual([
      20, 21, 22,
    ]);
    expect(
      migrations.map((migration) => migration.version).slice(18, 22),
    ).toEqual([19, 20, 21, 22]);
  });

  it("are named for the table each creates", () => {
    expect(LOT_3_TABLES.map((migration) => migration.fileName)).toEqual([
      "0020_create_staff_audit_events.sql",
      "0021_create_design_notes.sql",
      "0022_create_design_request_states.sql",
    ]);
  });

  it("record a checksum of their own bytes, and change it when one byte of a comment changes", () => {
    for (const migration of LOT_3_TABLES) {
      expect(migration.checksum).toBe(checksumOfMigration(migration.sql));
      expect(checksumOfMigration(`${migration.sql} `)).not.toBe(
        migration.checksum,
      );
    }
    expect(
      new Set(LOT_3_TABLES.map((migration) => migration.checksum)).size,
    ).toBe(3);
  });

  it("say which ledger readings they expect, one version apart", () => {
    expect(headerTextOf(AUDIT)).toContain(
      "ledger reads 1-19 before running, and 1-20",
    );
    expect(headerTextOf(NOTES)).toContain(
      "ledger reads 1-20 before running, and 1-21",
    );
    expect(headerTextOf(REQUEST_STATES)).toContain(
      "ledger reads 1-21 before running, and 1-22",
    );
  });

  it("carry the frozen-bytes paragraph of 0016", () => {
    for (const migration of LOT_3_TABLES) {
      expect(headerTextOf(migration)).toContain(
        "Once this file has been applied anywhere, its bytes are frozen, comments included.",
      );
    }
  });
});

describe("each is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it.each(
    LOT_3_TABLES.map((migration) => [migration.fileName, migration] as const),
  )("%s clears the unattended screen", (_name, migration) => {
    expect(unattendedMigrationRefusals([migration])).toEqual([]);
  });

  it.each(
    LOT_3_TABLES.map((migration) => [migration.fileName, migration] as const),
  )(
    "%s writes no row and changes none: no grant, drop, delete, truncate, update or insert in its statements",
    (_name, migration) => {
      expect(statementsOf(migration)).not.toMatch(
        /\b(?:grant|revoke|drop|delete|truncate|update|insert|alter|references|cascade)\b/,
      );
    },
  );

  it("is, for each file, one create table if not exists and its index, and nothing else", () => {
    expect(executableStatementsOf(AUDIT.sql)).toHaveLength(2);
    expect(executableStatementsOf(NOTES.sql)).toHaveLength(2);
    expect(executableStatementsOf(REQUEST_STATES.sql)).toHaveLength(1);
    for (const migration of LOT_3_TABLES) {
      expect(executableStatementsOf(migration.sql)[0]).toMatch(
        /^create table if not exists \w+ \(/,
      );
    }
  });
});

describe("0020 creates staff_audit_events with the columns and the index of the plan", () => {
  const text = statementsOf(AUDIT);

  it("holds the seven columns, in the order the plan lists them", () => {
    const columns = [
      "id text primary key",
      "occurred_at timestamptz not null default now()",
      "actor_account_id text not null",
      "action text not null",
      "design_id text",
      "subject_account_id text",
      "detail jsonb",
    ];
    let from = 0;
    for (const column of columns) {
      const at = text.indexOf(column, from);
      expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
      from = at + column.length;
    }
  });

  it("carries no foreign key", () => {
    expect(text).not.toMatch(/\breferences\b/);
  });

  it("names six checks, one per id, actor, action, design, subject and detail", () => {
    expect(
      [...text.matchAll(/constraint (staff_audit_events_\w+) check/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "staff_audit_events_id_shape",
      "staff_audit_events_actor_account_id_shape",
      "staff_audit_events_action_shape",
      "staff_audit_events_design_id_shape",
      "staff_audit_events_subject_account_id_shape",
      "staff_audit_events_detail_is_an_object",
    ]);
  });

  it("accepts a 21-character id and refuses 20, 22 and a character outside the alphabet", () => {
    for (const name of [
      "staff_audit_events_id_shape",
      "staff_audit_events_actor_account_id_shape",
      "staff_audit_events_design_id_shape",
      "staff_audit_events_subject_account_id_shape",
    ]) {
      const pattern = patternOfCheck(AUDIT, name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID.slice(1)}!`), name).toBe(false);
    }
  });

  it("accepts the action codes the plan names and refuses an empty, an upper-case, a spaced and a 33-character one", () => {
    const pattern = patternOfCheck(AUDIT, "staff_audit_events_action_shape");

    for (const action of [
      "kitchen-opened",
      "note-added",
      "status-changed",
      "kitchen-unhidden",
      "preset-moved",
      "staff-invited",
    ]) {
      expect(pattern.test(action), action).toBe(true);
    }
    for (const action of ["", "Kitchen-Opened", "note added", "a".repeat(33)]) {
      expect(pattern.test(action), JSON.stringify(action)).toBe(false);
    }
  });

  it("requires detail, when present, to be a JSON object", () => {
    expect(text).toContain(
      "constraint staff_audit_events_detail_is_an_object check (jsonb_typeof(detail) = 'object')",
    );
  });

  it("indexes newest first, with the id breaking a tie", () => {
    expect(text).toContain(
      "create index if not exists staff_audit_events_newest_first_idx on staff_audit_events (occurred_at desc, id desc)",
    );
    expect(text).not.toMatch(/\bunique\b|\bwhere\b/);
  });

  it("prescribes select, and insert on the six columns that leave out occurred_at, and nothing more", () => {
    expect(grantsPrescribedBy(AUDIT)).toEqual([
      "GRANT SELECT ON TABLE public.staff_audit_events TO app_designs;",
      "GRANT INSERT (id, actor_account_id, action, design_id, subject_account_id, detail) ON TABLE public.staff_audit_events TO app_designs;",
    ]);
  });
});

describe("0021 creates design_notes with the columns and the index of the plan", () => {
  const text = statementsOf(NOTES);

  it("holds the five columns, in the order the plan lists them", () => {
    const columns = [
      "id text primary key",
      "design_id text not null",
      "author_account_id text not null",
      "body text not null",
      "created_at timestamptz not null default now()",
    ];
    let from = 0;
    for (const column of columns) {
      const at = text.indexOf(column, from);
      expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
      from = at + column.length;
    }
  });

  it("carries no foreign key", () => {
    expect(text).not.toMatch(/\breferences\b/);
  });

  it("bounds the body to 1 to 2000 characters, the length the note rule allows", () => {
    expect(text).toContain(
      "constraint design_notes_body_length check (char_length(body) between 1 and 2000)",
    );
  });

  it("accepts a 21-character id on the id, design and author, and refuses 20 and 22", () => {
    for (const name of [
      "design_notes_id_shape",
      "design_notes_design_id_shape",
      "design_notes_author_account_id_shape",
    ]) {
      const pattern = patternOfCheck(NOTES, name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
    }
  });

  it("indexes a kitchen's notes, newest first", () => {
    expect(text).toContain(
      "create index if not exists design_notes_by_design_newest_idx on design_notes (design_id, created_at desc)",
    );
  });

  it("prescribes select and insert on four columns, with no update: a note cannot be edited", () => {
    expect(grantsPrescribedBy(NOTES)).toEqual([
      "GRANT SELECT ON TABLE public.design_notes TO app_designs;",
      "GRANT INSERT (id, design_id, author_account_id, body) ON TABLE public.design_notes TO app_designs;",
    ]);
  });
});

describe("0022 creates design_request_states with the columns of the plan", () => {
  const text = statementsOf(REQUEST_STATES);

  it("holds the four columns, with the design as the primary key", () => {
    const columns = [
      "design_id text primary key",
      "status text not null",
      "changed_by_account_id text not null",
      "changed_at timestamptz not null default now()",
    ];
    let from = 0;
    for (const column of columns) {
      const at = text.indexOf(column, from);
      expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
      from = at + column.length;
    }
  });

  it("carries no foreign key and no index beyond its primary key", () => {
    expect(text).not.toMatch(/\breferences\b|\bcreate index\b/);
  });

  it("accepts the four statuses of the plan and refuses an empty, an upper-case and a 33-character one", () => {
    const pattern = patternOfCheck(
      REQUEST_STATES,
      "design_request_states_status_shape",
    );

    for (const status of ["new", "contacted", "offer-sent", "closed"]) {
      expect(pattern.test(status), status).toBe(true);
    }
    for (const status of ["", "Closed", "offer sent", "a".repeat(33)]) {
      expect(pattern.test(status), JSON.stringify(status)).toBe(false);
    }
  });

  it("accepts a 21-character id on the design and the staff account, and refuses 20 and 22", () => {
    for (const name of [
      "design_request_states_design_id_shape",
      "design_request_states_changed_by_account_id_shape",
    ]) {
      const pattern = patternOfCheck(REQUEST_STATES, name);
      expect(pattern.test(A_21_CHARACTER_ID), name).toBe(true);
      expect(pattern.test(A_21_CHARACTER_ID.slice(1)), name).toBe(false);
      expect(pattern.test(`${A_21_CHARACTER_ID}A`), name).toBe(false);
    }
  });

  it("prescribes select, insert on three columns and update on three, none of them design_id", () => {
    expect(grantsPrescribedBy(REQUEST_STATES)).toEqual([
      "GRANT SELECT ON TABLE public.design_request_states TO app_designs;",
      "GRANT INSERT (design_id, status, changed_by_account_id) ON TABLE public.design_request_states TO app_designs;",
      "GRANT UPDATE (status, changed_by_account_id, changed_at) ON TABLE public.design_request_states TO app_designs;",
    ]);
  });
});

describe("no grant a header prescribes widens past the plan", () => {
  it("names no DELETE, TRUNCATE, ALL, grant option or PUBLIC", () => {
    for (const migration of LOT_3_TABLES) {
      for (const grant of grantsPrescribedBy(migration)) {
        expect(grant, migration.fileName).not.toMatch(
          /\b(?:DELETE|TRUNCATE|ALL|PUBLIC|OPTION|REFERENCES|TRIGGER)\b/,
        );
      }
    }
  });

  it("names no grant on accounts or presets: the staff-invite and preset-position grants are later waves", () => {
    for (const migration of LOT_3_TABLES) {
      for (const grant of grantsPrescribedBy(migration)) {
        expect(grant, migration.fileName).not.toMatch(
          /public\.(?:accounts|presets)\b/,
        );
      }
    }
  });
});
