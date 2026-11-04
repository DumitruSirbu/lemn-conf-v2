import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonCatalogueAvailabilityStore } from "../src/neon-catalogue-availability-store.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import { NeonPriceNoticeStore } from "../src/neon-price-notice-store.js";
import { publishNextVersion } from "./support/dashboard-contract-support.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { describePriceNoticeStoreContract } from "./support/price-notice-store-contract.js";
import type { NoticeWorld } from "./support/price-notice-store-contract.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: the contract publishes versions and switches an item off, which moves the availability head, and a version
// and a log row are append-only, so no other run may read the newest version or the head meanwhile.
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonPriceNoticeStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonPriceNoticeStore` against the test database, with the contract the fake also passes, and what only a database can
 * show: one row per design however the writes interleave, a first open racing an acknowledgement ending at the
 * acknowledgement, a refused acknowledgement leaving the row's instant alone, and the table's own checks. The store runs
 * over the test database's **owner** credential, which holds every privilege; the privilege test reads what the
 * application role is granted from the catalog.
 *
 * Every marker names a design id this file minted at random, with no design row behind it (the table has no foreign
 * key), and `afterAll` deletes by those ids only (ADR 0151). The versions the contract publishes and the log rows it
 * writes are append-only and stay: a later reader of this database seeds its own active book.
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);
  const designIds: string[] = [];

  // The table of 0028 must exist: nothing else in a run of this file migrates the test database first.
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await staff.sql()`delete from design_price_notices where design_id = any(${designIds})`;
    await staff.removeTheRowsItMinted();
  });

  function aDesignId(): Promise<string> {
    const designId = nanoid();
    designIds.push(designId);
    return Promise.resolve(designId);
  }

  function newWorld(): Promise<NoticeWorld> {
    return Promise.resolve({
      ...staff.world,
      store: new NeonPriceNoticeStore(liveTestDatabaseUrl),
      priceBook: new NeonPriceBookStore(liveTestDatabaseUrl),
      availability: new NeonCatalogueAvailabilityStore(liveTestDatabaseUrl),
      aDesignId,
    });
  }

  describePriceNoticeStoreContract("NeonPriceNoticeStore", newWorld);

  describe("what only the database can show", () => {
    /** The active version and the head, publishing the first version when the database has none. */
    async function currentPair(world: NoticeWorld) {
      if ((await world.priceBook.readActive()).kind !== "found") {
        await publishNextVersion(
          world.priceBook,
          world.availability,
          await world.aStaffMember(),
        );
      }
      const active = await world.priceBook.readActive();
      if (active.kind !== "found") throw new Error("no version is active");
      const { revision } = await world.availability.readCurrent();
      return {
        versionId: active.version.versionId,
        availabilityRevision: revision,
      };
    }

    async function rowsOf(designId: string) {
      return staff.sql()`
        select acknowledged_version_id, acknowledged_availability_revision::text as availability_revision,
          (extract(epoch from acknowledged_at) * 1000)::double precision as at_ms
        from design_price_notices where design_id = ${designId}
      `;
    }

    it("keeps one row for a design however many first opens and acknowledgements it has", async () => {
      const world = await newWorld();
      const designId = await aDesignId();
      const pair = await currentPair(world);

      await world.store.recordIfAbsent(designId, pair);
      await world.store.recordAcknowledged(designId, pair);
      await world.store.recordIfAbsent(designId, pair);
      await world.store.recordAcknowledged(designId, pair);

      expect(await rowsOf(designId)).toHaveLength(1);
    });

    it("ends at the acknowledgement when a first open and an acknowledgement for the same design race", async () => {
      const world = await newWorld();
      const staffMember = await world.aStaffMember();
      const first = await publishNextVersion(
        world.priceBook,
        world.availability,
        staffMember,
      );
      const second = await publishNextVersion(
        world.priceBook,
        world.availability,
        staffMember,
      );
      const acknowledged = {
        versionId: second.versionId,
        availabilityRevision: second.availabilityRevision,
      };

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const designId = await aDesignId();
        await Promise.all([
          world.store.recordIfAbsent(designId, {
            versionId: first.versionId,
            availabilityRevision: first.availabilityRevision,
          }),
          world.store.recordAcknowledged(designId, acknowledged),
        ]);

        expect(await world.store.readAcknowledged(designId)).toEqual({
          kind: "recorded",
          acknowledged,
        });
      }
    });

    it("leaves the row's instant alone when an acknowledgement is refused", async () => {
      const world = await newWorld();
      const designId = await aDesignId();
      const pair = await currentPair(world);
      await world.store.recordIfAbsent(designId, pair);
      const before = await rowsOf(designId);

      await world.store.recordAcknowledged(designId, {
        versionId: "A".repeat(21),
        availabilityRevision: pair.availabilityRevision,
      });

      expect(await rowsOf(designId)).toEqual(before);
    });

    it("restamps the row's instant when an acknowledgement is accepted", async () => {
      const world = await newWorld();
      const designId = await aDesignId();
      const pair = await currentPair(world);
      await world.store.recordIfAbsent(designId, pair);
      await staff.sql()`
        update design_price_notices set acknowledged_at = acknowledged_at - interval '1 hour' where design_id = ${designId}
      `;
      const [before] = await rowsOf(designId);

      await world.store.recordAcknowledged(designId, pair);
      const [after] = await rowsOf(designId);

      expect(Number(after?.["at_ms"])).toBeGreaterThan(
        Number(before?.["at_ms"]),
      );
    });

    it("refuses at the table a version id that is not a version id's shape and a negative revision", async () => {
      const designId = await aDesignId();
      const pair = await currentPair(await newWorld());
      const insertOf = (versionId: string, revision: string) => staff.sql()`
        insert into design_price_notices (design_id, acknowledged_version_id, acknowledged_availability_revision)
        values (${designId}, ${versionId}, ${revision}::bigint)
      `;

      await expect(insertOf("not a version id", "0")).rejects.toMatchObject({
        constraint: "design_price_notices_acknowledged_version_id_shape",
      });
      await expect(insertOf(pair.versionId, "-1")).rejects.toMatchObject({
        constraint: "design_price_notices_availability_revision_not_negative",
      });
      expect(await rowsOf(designId)).toEqual([]);
    });
  });
});
