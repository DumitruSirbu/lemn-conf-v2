import type { Client } from "@neondatabase/serverless";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { runMigrations } from "../src/migrate.js";
import { openDatabaseSession } from "../src/open-database.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  AUDIT,
  NOTES,
  REQUEST_STATES,
  type TableUnderProbe,
  migrationNamed,
} from "./support/staff-tables-under-probe.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive, not shared: the test runs migrations 0020-0022 over the real staff tables, which locks them, and compares
// their whole contents before and after, so a row another file commits in between fails it (run 43245849361, shard 1).
// The transaction is still rolled back, so nothing it does outlives the test.
holdExclusiveTestSchemaLock();

/** Re-applying the staff-table migrations (`0020` to `0022`) is a no-op over tables that hold rows. Split from
 *  `qa-l3-s1-staff-tables.adversarial.test.ts`, whose other probes need only the shared lock. */
const SUITE_NAME =
  "staff tables 0020-0022 re-applied on a real Postgres (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const FILES = [AUDIT, NOTES, REQUEST_STATES].map((probed) =>
  migrationNamed(probed.migrationPrefix),
);

let client: Client;

async function rowsOf(text: string): Promise<Record<string, unknown>[]> {
  const answer = await client.query(text);
  return answer.rows as Record<string, unknown>[];
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
    client = openDatabaseSession(liveTestDatabaseUrl, "TEST_DATABASE_URL");
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  async function catalogAndRows(): Promise<string> {
    const catalog = await rowsOf(`
        select 'constraint' as kind, conrelid::regclass::text as owner, conname as name, pg_get_constraintdef(oid) as definition
          from pg_constraint
         where conrelid in ('staff_audit_events'::regclass, 'design_notes'::regclass, 'design_request_states'::regclass)
        union all
        select 'index', tablename, indexname, indexdef from pg_indexes
         where schemaname = 'public' and tablename in ('staff_audit_events', 'design_notes', 'design_request_states')
        union all
        select 'column', table_name, column_name, data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
          from information_schema.columns
         where table_schema = 'public' and table_name in ('staff_audit_events', 'design_notes', 'design_request_states')
        union all
        select 'acl', relname, '', coalesce(relacl::text, '') from pg_class
         where relname in ('staff_audit_events', 'design_notes', 'design_request_states') and relkind = 'r'
        order by 1, 2, 3`);
    const rows = await Promise.all(
      [AUDIT, NOTES, REQUEST_STATES].map((probed) =>
        rowsOf(`select * from ${probed.table} order by 1`),
      ),
    );
    return JSON.stringify([catalog, rows]);
  }

  async function seedOneRowPerTable(): Promise<void> {
    for (const probed of [AUDIT, NOTES, REQUEST_STATES]) {
      expect(await insertOutcomeKept(probed)).toBe("accepted");
    }
  }

  async function insertOutcomeKept(probed: TableUnderProbe): Promise<string> {
    const columns = Object.keys(probed.validRow);
    await client.query(
      `insert into ${probed.table} (${columns.join(", ")}) values (${columns.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
      columns.map((column) => probed.validRow[column]),
    );
    return "accepted";
  }

  it("running the three files twice over tables that hold rows changes no row, constraint, index, column or privilege", async () => {
    await seedOneRowPerTable();
    const before = await catalogAndRows();

    for (const pass of [1, 2]) {
      for (const file of FILES) {
        await client.query(file.sql);
      }
      expect(await catalogAndRows(), `after pass ${String(pass)}`).toBe(before);
    }
  });
});
