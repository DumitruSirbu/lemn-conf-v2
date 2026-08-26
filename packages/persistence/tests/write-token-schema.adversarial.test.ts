// Adversarial QA for M3 Wave 3C-2a: does the schema the *application* connects to actually carry
// the column the write path depends on, and may the application role write it?
//
// Separate from `neon-configuration-repository.adversarial.test.ts` on purpose. Every migration
// assertion in this repository — the implementer's included — runs against the **test** database,
// because that is the database live tests are allowed to write to (ADR 0006). A test-database
// assertion proves the migration file is correct; it proves nothing about whether the migration was
// ever applied to the database the application uses. ADR 0013 is the record of that exact gap: a
// migration command that reported success while doing nothing.
//
// Nothing here writes. Every statement is a catalogue read, so pointing it at the application's own
// database is safe in the way ADR 0006 requires.
import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import { readDatabaseUrl } from "../src/read-database-url.js";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);

const MIGRATE_COMMAND = "pnpm --filter @lemnaria/persistence run migrate";

describe("the application's own database carries the write-token column", () => {
  // Migration 0003's constraint, checked where QA-A proved it matters: on the database the
  // application actually connects to. A constraint that exists only in the test database protects
  // nothing, and that distinction is the whole reason this file exists.
  it.skipIf(!hasLiveDatabase)(
    "carries migration 0003's shape constraint, not only the column",
    async () => {
      const constraints = (await neon(readDatabaseUrl())`
        select pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conname = 'write_token_hash_is_sha256'
          and conrelid = 'designs'::regclass
      `) as { definition: string }[];

      expect(
        constraints,
        `The application database has no write_token_hash_is_sha256 constraint. ` +
          `Apply migration 0003 with: ${MIGRATE_COMMAND}`,
      ).toHaveLength(1);
      // NULL must stay admissible: pre-0002 rows carry it and fail closed, which is correct.
      expect(constraints[0]?.definition).toContain("IS NULL");
      expect(constraints[0]?.definition).toContain("[0-9a-f]{64}");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "has write_token_hash on designs, and is nullable so old rows fail closed",
    async () => {
      const columns = (await neon(readDatabaseUrl())`
        select data_type, is_nullable from information_schema.columns
        where table_name = 'designs' and column_name = 'write_token_hash'
      `) as { data_type: string; is_nullable: string }[];

      expect(
        columns,
        `The application database has no write_token_hash column, so every POST /api/designs ` +
          `insert and every authorised update will fail at runtime. Migration 0002 has been ` +
          `applied to the test database only. Apply it with: ${MIGRATE_COMMAND}`,
      ).toHaveLength(1);
      expect(columns[0]?.data_type).toBe("text");
      expect(columns[0]?.is_nullable).toBe("YES");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "lets the application role select, insert and update it without a new grant",
    async () => {
      const sql = neon(readDatabaseUrl());
      const exists = (await sql`
        select 1 from information_schema.columns
        where table_name = 'designs' and column_name = 'write_token_hash'
      `) as unknown[];
      // Asked separately so this test reports "not migrated" rather than a driver error:
      // `has_column_privilege` throws on a column that does not exist.
      expect(
        exists,
        `Cannot check grants on a column that does not exist. Apply migration 0002 first: ${MIGRATE_COMMAND}`,
      ).toHaveLength(1);

      // ADR 0019 claims the table-level grants ADR 0008 gave this role already cover a new column.
      // This asks Postgres rather than inferring it from the absence of a column-level ACL.
      const [privileges] = (await sql`
        select
          has_column_privilege(current_user, 'designs', 'write_token_hash', 'select') as may_select,
          has_column_privilege(current_user, 'designs', 'write_token_hash', 'insert') as may_insert,
          has_column_privilege(current_user, 'designs', 'write_token_hash', 'update') as may_update,
          has_table_privilege(current_user, 'designs', 'delete') as may_delete
      `) as {
        may_select: boolean;
        may_insert: boolean;
        may_update: boolean;
        may_delete: boolean;
      }[];

      expect(privileges?.may_select).toBe(true);
      expect(privileges?.may_insert).toBe(true);
      expect(privileges?.may_update).toBe(true);
      // And ADR 0008's role was widened by nothing: it still cannot delete.
      expect(privileges?.may_delete).toBe(false);
    },
  );
});
