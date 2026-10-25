import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import {
  readMigrationFiles,
  type MigrationFile,
} from "../src/migration-files.js";
import { MAX_KITCHEN_NAME_CHARACTERS } from "../src/account-kitchen-store.js";
import {
  requireValidEmailChangeTokenToIssue,
  requireValidProfileUpdate,
} from "../src/account-store.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";

/**
 * Migrations `0016` to `0018` (M8B Lot 2 wave S1), read as text with no database: what each adds, that each is additive
 * and re-runnable, that the length checks they carry are the bounds the stores and the domain assume, and that they sit
 * in the ledger as the next three versions with a checksum of their own bytes.
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

const DASHBOARD = migrationNamed("0016_");
const PROFILE = migrationNamed("0017_");
const TOKEN_ADDRESS = migrationNamed("0018_");
const LOT_2 = [DASHBOARD, PROFILE, TOKEN_ADDRESS];

const ACCOUNT_ID = "A".repeat(21);
const SHA256_HEX = "a".repeat(64);
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;

function statementsOf(migration: MigrationFile): string {
  return executableStatementsOf(migration.sql).join("\n");
}

/** `{least,most}` of every `~ '^.{a,b}$'` check, in the order the file writes them. */
function lengthBoundsOf(
  migration: MigrationFile,
): { least: number; most: number }[] {
  return [
    ...statementsOf(migration).matchAll(/~ '\^\.\{(\d+),(\d+)\}\$'/g),
  ].map((match) => ({
    least: Number(match[1]),
    most: Number(match[2]),
  }));
}

function columnsAddedBy(migration: MigrationFile): string[] {
  return [
    ...statementsOf(migration).matchAll(
      /add column if not exists ([a-z_]+) ([a-z]+)/g,
    ),
  ].map((match) => `${match[1] ?? ""} ${match[2] ?? ""}`);
}

describe("migrations 0016 to 0018 are the next three versions of the ledger", () => {
  it("follow 0015 without a gap", () => {
    expect(LOT_2.map((migration) => migration.version)).toEqual([16, 17, 18]);
    expect(
      migrations.map((migration) => migration.version).slice(14, 18),
    ).toEqual([15, 16, 17, 18]);
  });

  it("are named for what they add", () => {
    expect(LOT_2.map((migration) => migration.fileName)).toEqual([
      "0016_add_design_dashboard_columns.sql",
      "0017_add_account_profile_columns.sql",
      "0018_add_email_token_new_address.sql",
    ]);
  });

  it("record a checksum of their own bytes, and each differs from the others", () => {
    for (const migration of LOT_2) {
      expect(migration.checksum).toBe(checksumOfMigration(migration.sql));
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.checksum).toBe(
        createHash("sha256")
          .update(migration.sql.replace(/\r\n/g, "\n"), "utf8")
          .digest("hex"),
      );
    }
    expect(new Set(LOT_2.map((migration) => migration.checksum)).size).toBe(3);
  });

  it("change checksum when one byte of a comment changes (an applied file is frozen)", () => {
    for (const migration of LOT_2) {
      expect(checksumOfMigration(`${migration.sql} `)).not.toBe(
        migration.checksum,
      );
    }
  });
});

describe("each is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it.each(LOT_2.map((migration) => [migration.fileName, migration] as const))(
    "%s clears the unattended screen",
    (_name, migration) => {
      expect(unattendedMigrationRefusals([migration])).toEqual([]);
    },
  );

  it.each(LOT_2.map((migration) => [migration.fileName, migration] as const))(
    "%s adds, alters and guards; it never drops, deletes, updates, truncates, grants or backfills",
    (_name, migration) => {
      const text = statementsOf(migration);

      expect(text).not.toMatch(
        /\b(?:drop|delete|truncate|update|grant|revoke|insert|rename)\b/,
      );
      expect(text).not.toMatch(/\balter column\b/);
      expect(text).not.toMatch(/\breferences\b|\bforeign key\b/);
    },
  );

  it.each(LOT_2.map((migration) => [migration.fileName, migration] as const))(
    "%s adds every column with `if not exists` and every constraint inside an existence guard",
    (_name, migration) => {
      const text = statementsOf(migration);

      expect(text.match(/\badd column\b/g)?.length).toBe(
        text.match(/\badd column if not exists\b/g)?.length,
      );
      expect(text.match(/\badd constraint\b/g)?.length).toBe(
        text.match(/if not exists \( select 1 from pg_constraint/g)?.length,
      );
    },
  );

  it.each(LOT_2.map((migration) => [migration.fileName, migration] as const))(
    "%s adds only nullable columns with no default, so a legacy row reads as 'not given'",
    (_name, migration) => {
      const text = statementsOf(migration);

      expect(text).not.toMatch(/\bnot null\b/);
      expect(text).not.toMatch(/\bdefault\b/);
    },
  );
});

describe("0016: the columns a kitchen gains on the designs table", () => {
  it("adds the name and the three marks, and nothing else", () => {
    expect(columnsAddedBy(DASHBOARD)).toEqual([
      "name text",
      "sent_at timestamptz",
      "hidden_by_client_at timestamptz",
      "deleted_by_client_at timestamptz",
    ]);
    expect(statementsOf(DASHBOARD)).toMatch(/^alter table designs add column/);
  });

  it("does not backfill sent_at: no statement writes a row", () => {
    expect(statementsOf(DASHBOARD)).not.toMatch(
      /\bupdate designs\b|\binsert into\b|\bsent_at = /,
    );
  });

  it("checks the name's length as 1 to 120 characters, the bound the domain, the store and the fake share", () => {
    expect(lengthBoundsOf(DASHBOARD)).toEqual([
      { least: 1, most: MAX_KITCHEN_NAME_CHARACTERS },
    ]);
    expect(statementsOf(DASHBOARD)).toContain(
      "check (name is null or name ~ '^.{1,120}$')",
    );
    expect(statementsOf(DASHBOARD)).toContain(
      "conname = 'designs_name_length'",
    );
  });

  it("checks the name's length with a regular expression, not char_length(), which the unattended screen refuses", () => {
    expect(statementsOf(DASHBOARD)).not.toMatch(/char_length|length\(/);
  });
});

describe("0017: the profile columns an account gains", () => {
  it("adds the name and the address as text, and nothing else", () => {
    expect(columnsAddedBy(PROFILE)).toEqual(["name text", "address text"]);
    expect(statementsOf(PROFILE)).toMatch(/^alter table accounts add column/);
  });

  it("checks each length as 1 to its backstop, 120 and 200, which are looser than the domain's 100 and 100", () => {
    expect(lengthBoundsOf(PROFILE)).toEqual([
      { least: 1, most: 120 },
      { least: 1, most: 200 },
    ]);
    expect(statementsOf(PROFILE)).toContain("conname = 'accounts_name_length'");
    expect(statementsOf(PROFILE)).toContain(
      "conname = 'accounts_address_length'",
    );
  });

  it("the store guard refuses at exactly the table's bounds, so a refusal is the store's and not a constraint's name", () => {
    const update = (name: string, address: string) => () => {
      requireValidProfileUpdate({
        accountId: ACCOUNT_ID,
        changes: { name, address },
      });
    };

    expect(update("n".repeat(120), "a".repeat(200))).not.toThrow();
    expect(update("n".repeat(121), "a")).toThrow(/name/);
    expect(update("n", "a".repeat(201))).toThrow(/address/);
    expect(update("", "")).not.toThrow();
  });
});

describe("0018: the new address an e-mail-change token carries", () => {
  it("adds the address and its normal form as text, and nothing else", () => {
    expect(columnsAddedBy(TOKEN_ADDRESS)).toEqual([
      "new_email text",
      "new_email_normal_form text",
    ]);
    expect(statementsOf(TOKEN_ADDRESS)).toMatch(
      /^alter table account_email_tokens add column/,
    );
  });

  it("checks each address as 3 to 254 characters", () => {
    expect(lengthBoundsOf(TOKEN_ADDRESS)).toEqual([
      { least: 3, most: 254 },
      { least: 3, most: 254 },
    ]);
  });

  it("holds the two together: both null or both set", () => {
    expect(statementsOf(TOKEN_ADDRESS)).toContain(
      "check ((new_email is null) = (new_email_normal_form is null))",
    );
  });

  it("names no purpose: which purpose carries an address is the code's rule, not the table's", () => {
    expect(statementsOf(TOKEN_ADDRESS)).not.toMatch(/purpose|email-change/);
  });

  it("adds no unique constraint and no index, so two live tokens for one target can exist until confirm", () => {
    expect(statementsOf(TOKEN_ADDRESS)).not.toMatch(
      /\bunique\b|\bcreate (?:unique )?index\b/,
    );
  });

  it("the store guard refuses at exactly the table's bounds", () => {
    const issue = (newEmail: string, newEmailNormalForm: string) => () => {
      requireValidEmailChangeTokenToIssue({
        accountId: ACCOUNT_ID,
        verifiedPasswordHash: PASSWORD_HASH,
        newEmail,
        newEmailNormalForm,
        tokenHash: SHA256_HEX,
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      });
    };
    const addressOf = (length: number) => `${"a".repeat(length - 2)}@b`;

    expect(issue(addressOf(254), addressOf(254))).not.toThrow();
    expect(issue(addressOf(255), addressOf(254))).toThrow(/new e-mail/);
    expect(issue(addressOf(254), addressOf(255))).toThrow(/normal form/);
    expect(issue("a@b", "a@b")).not.toThrow();
    expect(issue("a@", "a@b")).toThrow(/new e-mail/);
  });
});
