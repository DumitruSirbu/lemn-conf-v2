import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";
import { runMigrations } from "../src/migrate.js";
import { readMigrationFiles } from "../src/migration-files.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { forgetAppliedMigrations } from "./support/migration-ledger-probe.js";
import { REAPPLY_MIGRATIONS_TEST_TIMEOUT_MS } from "./support/migration-reapply-timeout.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: the backfill test drops the revision column, and no other run may use the test database while it is
// missing. Split from `neon-configuration-repository.test.ts` so the rest of that file can hold the lock shared
// (owner, 2026-11-12).
holdExclusiveTestSchemaLock();

const SUITE_NAME =
  "the design-revision migration's live suite (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

// What `0004_add_design_revision.sql` gives every row. Stated, not read back, so a changed default
// fails these tests instead of being followed by them.
const FIRST_REVISION = "1";

describe("the design-revision migration (WEB-003)", () => {
  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  it.skipIf(!hasLiveDatabase)(
    "adds revision as a non-null bigint defaulting to the first revision",
    async () => {
      const columns = (await neon(testDatabaseUrl)`
        select data_type, is_nullable, column_default
        from information_schema.columns
        where table_name = 'designs' and column_name = 'revision'
      `) as {
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }[];

      expect(columns).toHaveLength(1);
      expect(columns[0]?.data_type).toBe("bigint");
      // Nullable would make a design permanently unwritable: `revision = $1` is never true for NULL.
      expect(columns[0]?.is_nullable).toBe("NO");
      expect(columns[0]?.column_default).toBe(FIRST_REVISION);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "backfills rows that already existed, rather than leaving them without a revision",
    async () => {
      // Proves the file, not state a previous run left: drop the column, insert a pre-migration row,
      // then make the runner apply the migration again.
      const sql = neon(testDatabaseUrl);
      const legacyId = generateDesignId();
      try {
        // Forget the ledger rows before dropping the column, never after: a run killed in between then
        // leaves only a forgotten tail that the next `runMigrations` re-applies. The other order leaves
        // the ledger claiming a missing column and wedges every later run.
        // Forget every version from REVISION_VERSION up: forgetting 4 while a later migration stays
        // recorded is a gap the runner refuses.
        await forgetAppliedMigrations(
          testDatabaseUrl,
          REVISION_AND_LATER_VERSIONS,
        );
        await sql`alter table designs drop column if exists revision`;
        await sql`
          insert into designs (id, schema_version, document, write_token_hash)
          values (${legacyId}, 1, ${KITCHEN_L_DESIGN}, ${"c".repeat(64)})
        `;

        const summary = await runMigrations(testDatabaseUrl);

        expect(summary.applied).toEqual(REVISION_AND_LATER_FILE_NAMES);
        const rows = (await sql`
          select revision::text as revision from designs where id = ${legacyId}
        `) as { revision: string }[];
        expect(rows[0]?.revision).toBe(FIRST_REVISION);
      } finally {
        // Unconditional: a dropped column or forgotten ledger row wedges every other suite sharing
        // this database.
        await runMigrations(testDatabaseUrl);
        await sql`delete from designs where id = ${legacyId}`;
      }
    },
    REAPPLY_MIGRATIONS_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasLiveDatabase)(
    "is skipped on a re-run, so a second migrate neither fails nor duplicates the column",
    async () => {
      const summary = await runMigrations(testDatabaseUrl);
      expect(summary.applied).toEqual([]);
      expect(summary.alreadyApplied).toContain("0004_add_design_revision.sql");

      const columns = (await neon(testDatabaseUrl)`
        select column_name from information_schema.columns
        where table_name = 'designs' and column_name = 'revision'
      `) as { column_name: string }[];
      expect(columns).toHaveLength(1);
    },
  );
});

/** The version `0004_add_design_revision.sql` occupies in the ledger. */
const REVISION_VERSION = 4;

// Read from disk, not listed: a stale literal list here is destructive (a forgotten ledger row
// with a later one still recorded is a gap the runner refuses), not merely wrong.
const REVISION_AND_LATER_FILES = readMigrationFiles().filter(
  (migration) => migration.version >= REVISION_VERSION,
);
const REVISION_AND_LATER_VERSIONS = REVISION_AND_LATER_FILES.map(
  (migration) => migration.version,
);
const REVISION_AND_LATER_FILE_NAMES = REVISION_AND_LATER_FILES.map(
  (migration) => migration.fileName,
);
