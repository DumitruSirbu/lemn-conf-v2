import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonCatalogueAvailabilityStore } from "../src/neon-catalogue-availability-store.js";
import {
  aNewItem,
  activationEntryFor,
  auditRecordOf,
  dashboardFailureOf,
} from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { describeCatalogueAvailabilityStoreContract } from "./support/catalogue-availability-store-contract.js";
import type { AvailabilityWorld } from "./support/catalogue-availability-store-contract.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: the contract asserts over a global singleton (the availability head, which every write moves by exactly one)
// and the log is append-only (plan S2, ex-S2b, recorded choice).
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonCatalogueAvailabilityStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

// Ids the store is to mint next, then the real `nanoid`: a test queues an id already taken in `staff_audit_events`, so the
// audit insert of the write under test fails at the primary key, which injects the fault without altering any table.
const minted = vi.hoisted(() => ({ queue: [] as string[] }));
vi.mock("nanoid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nanoid")>();
  return {
    ...actual,
    nanoid: (size?: number) => minted.queue.shift() ?? actual.nanoid(size),
  };
});

/**
 * `NeonCatalogueAvailabilityStore` against the test database, with the contract the fake also passes, and what only a
 * database can show: the log's revision always the head's, the audit row refused with the write, and the log read only up
 * to the head. The store runs over the test database's **owner** credential, which holds every privilege; the privilege
 * test reads what the application role is granted from the catalog.
 *
 * Every account names an id this file minted at random and `afterAll` deletes by those ids only (ADR 0151). The log is
 * append-only and keeps every row, so each arm switches only items it minted: a real item switched here would stay
 * switched for every later reader of this database.
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);

  // The tables of 0023 to 0025 must exist: nothing else in a run of this file migrates the test database first.
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await staff.removeTheRowsItMinted();
  });

  function newWorld(): Promise<AvailabilityWorld> {
    return Promise.resolve({
      ...staff.world,
      store: new NeonCatalogueAvailabilityStore(liveTestDatabaseUrl),
    });
  }

  describeCatalogueAvailabilityStoreContract(
    "NeonCatalogueAvailabilityStore",
    newWorld,
  );

  describe("what only the database can show", () => {
    async function logAndHead() {
      const rows = await staff.sql()`
        select (select revision::text from catalogue_availability_head) as head,
          (select coalesce(max(revision), 0)::text from catalogue_availability_changes) as newest_logged,
          (select count(*)::int from catalogue_availability_changes) as log_rows
      `;
      return rows[0];
    }

    it("writes the log row at the revision the head reached, so no logged revision is above the head and the audit row names the same one", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const item = aNewItem("hardware");
      const head = (await world.store.readCurrent()).revision;

      const result = await world.store.setActive({
        item,
        active: false,
        expectedRevision: head,
        audit: auditRecordOf(member, activationEntryFor(item, false)),
      });

      expect(result.kind).toBe("ok");
      const revision = result.kind === "ok" ? result.revision : "";
      const rows = await staff.sql()`
        select (select count(*)::int from catalogue_availability_changes where revision = ${revision}::bigint) as rows_at_the_head,
          (select revision::text from catalogue_availability_head) as head,
          (select coalesce(max(revision), 0)::text from catalogue_availability_changes) as newest_logged
      `;
      expect(rows).toEqual([
        { rows_at_the_head: 1, head: revision, newest_logged: revision },
      ]);
      expect(await world.auditEventsOf(member.accountId)).toMatchObject([
        { detail: { availabilityRevision: revision } },
      ]);
    });

    it("rolls a write back whole when its audit row cannot be inserted: no log row, no head move", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const item = aNewItem("material");
      const request = {
        item,
        active: false,
        expectedRevision: (await world.store.readCurrent()).revision,
        audit: auditRecordOf(member, activationEntryFor(item, false)),
      };
      const before = await logAndHead();
      const takenAuditId = nanoid();
      await staff.sql()`
        insert into staff_audit_events (id, actor_account_id, action) values (${takenAuditId}, ${member.accountId}, 'audit-viewed')
      `;
      minted.queue.push(takenAuditId);

      try {
        const failure = await dashboardFailureOf(
          world.store.setActive(request),
          "database",
        );
        expect(failure.cause).toMatchObject({
          code: "23505",
          constraint: "staff_audit_events_pkey",
        });
        expect(minted.queue).toEqual([]);
      } finally {
        minted.queue.length = 0;
      }

      expect(await logAndHead()).toEqual(before);
      expect(
        (await world.auditEventsOf(member.accountId)).map(
          (event) => event.action,
        ),
      ).toEqual(["audit-viewed"]);
    });

    it("lets exactly one of five writes racing at one revision win, and moves the head by one", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const before = await logAndHead();
      const expectedRevision = (await world.store.readCurrent()).revision;

      const answers = await Promise.all(
        Array.from({ length: 5 }, () => {
          const item = aNewItem("accessory");
          return world.store.setActive({
            item,
            active: false,
            expectedRevision,
            audit: auditRecordOf(member, activationEntryFor(item, false)),
          });
        }),
      );

      expect(answers.filter((answer) => answer.kind === "ok")).toHaveLength(1);
      const after = await logAndHead();
      expect(after?.["log_rows"]).toBe((before?.["log_rows"] as number) + 1);
      expect(after?.["head"]).toBe(
        await world.aRevisionAfter(expectedRevision, 1),
      );
      expect(await world.auditEventsOf(member.accountId)).toHaveLength(1);
    });

    it("stamps a log row with the database's clock", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const item = aNewItem("finish");
      await world.store.setActive({
        item,
        active: false,
        expectedRevision: (await world.store.readCurrent()).revision,
        audit: auditRecordOf(member, activationEntryFor(item, false)),
      });

      const rows = await staff.sql()`
        select changed_at between now() - interval '2 minutes' and now() as is_just_now
        from catalogue_availability_changes order by revision desc limit 1
      `;

      expect(rows).toEqual([{ is_just_now: true }]);
    });
  });
});
