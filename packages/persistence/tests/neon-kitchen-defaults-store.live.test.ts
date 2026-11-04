import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { INITIAL_REVISION } from "../src/m10-ports.js";
import { NeonCatalogueAvailabilityStore } from "../src/neon-catalogue-availability-store.js";
import { NeonKitchenDefaultsStore } from "../src/neon-kitchen-defaults-store.js";
import { NeonKitchenUsageReader } from "../src/neon-kitchen-usage-reader.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { describeKitchenDefaultsStoreContract } from "./support/kitchen-defaults-store-contract.js";
import type { DefaultsWorld } from "./support/kitchen-defaults-store-contract.js";
import { createNeonDashboardStaffWorld } from "./support/neon-dashboard-world.js";
import { createNeonUsageWorld } from "./support/neon-usage-world.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: a save moves the availability head and the one defaults row, which every other dashboard suite reads, and the
// contract's publish arm appends a version that nothing can remove (the plan's S3).
holdExclusiveTestSchemaLock();

const SUITE_NAME = "NeonKitchenDefaultsStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonKitchenDefaultsStore` and the usage half of `NeonKitchenUsageReader` against the test database, with the contract
 * the fake also passes (which includes the racing saves, the save against an availability write, and the save against a
 * publish, each at one availability revision), and what only a database can show: the table's own checks, a refused save
 * leaving the row's instant and saver alone. The stores run over the test
 * database's **owner** credential, which holds every privilege; the privilege test reads what the application role is
 * granted from the catalog.
 *
 * The designs the usage arms plant name ids this file minted at random and `afterAll` deletes them by those ids alone
 * (ADR 0151). The one defaults row cannot be put back: its revision only grows, so a later reader reads defaults as the
 * last save left them and takes its own revision from a read.
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const staff = createNeonDashboardStaffWorld(liveTestDatabaseUrl);
  const usage = createNeonUsageWorld(staff.sql);

  // The table of 0029 must exist: nothing else in a run of this file migrates the test database first.
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await usage.removeTheRowsItPlanted();
    await staff.removeTheRowsItMinted();
  });

  function newWorld(): Promise<DefaultsWorld> {
    return Promise.resolve({
      ...staff.world,
      store: new NeonKitchenDefaultsStore(liveTestDatabaseUrl),
      usage: new NeonKitchenUsageReader(liveTestDatabaseUrl),
      availability: new NeonCatalogueAvailabilityStore(liveTestDatabaseUrl),
      priceBook: new NeonPriceBookStore(liveTestDatabaseUrl),
      probeFor: (item) => usage.probeFor(item),
      aDesignUsing: (spec) => usage.aDesignUsing(spec),
    });
  }

  describeKitchenDefaultsStoreContract("NeonKitchenDefaultsStore", newWorld);

  describe("what only the database can show", () => {
    async function rowOf() {
      const rows = await staff.sql()`
        select revision::text as revision, defaults, saved_at, saved_by_account_id from kitchen_defaults
      `;
      return rows[0];
    }

    it("holds exactly one row, and refuses a second", async () => {
      const rows =
        await staff.sql()`select count(*)::int as rows from kitchen_defaults`;
      expect(rows[0]?.["rows"]).toBe(1);

      await expect(
        staff.sql()`insert into kitchen_defaults (singleton, revision, defaults) values (false, 0, '{}')`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        staff.sql()`insert into kitchen_defaults (singleton, revision, defaults) values (true, 0, '{}')`,
      ).rejects.toMatchObject({ code: "23505" });
    });

    it("records the saver and the instant of the last save, from the session and the clock", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const head = (await world.availability.readCurrent()).revision;
      const saved = await world.store.read();

      await world.store.save({
        expectedRevision:
          saved.kind === "saved" ? saved.saved.revision : INITIAL_REVISION,
        expectedAvailabilityRevision: head,
        defaults: { handle: "steel" },
        audit: {
          session: member.session,
          entry: {
            action: "kitchen-defaults-saved",
            detail: { changedFields: ["handle"] },
          },
        },
      });

      const row = await rowOf();
      expect(row?.["saved_by_account_id"]).toBe(member.accountId);
      expect(row?.["defaults"]).toEqual({ handle: "steel" });
    });

    it("leaves the saver and the instant as they were when a save is refused", async () => {
      const world = await newWorld();
      const member = await world.aStaffMember();
      const before = await rowOf();
      const staleHead = await world.aRevisionAfter(
        (await world.availability.readCurrent()).revision,
        1,
      );

      const refused = await world.store.save({
        expectedRevision: String(before?.["revision"]),
        expectedAvailabilityRevision: staleHead,
        defaults: { handle: "black" },
        audit: {
          session: member.session,
          entry: {
            action: "kitchen-defaults-saved",
            detail: { changedFields: ["handle"] },
          },
        },
      });

      expect(refused.kind).toBe("availability-changed-meanwhile");
      expect(await rowOf()).toEqual(before);
    });

    it("refuses defaults that are not an object, or hold more than the table's ceiling", async () => {
      await expect(
        staff.sql()`update kitchen_defaults set defaults = '[]'::jsonb`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        staff.sql()`update kitchen_defaults set defaults = jsonb_build_object('x', repeat('x', 65536))`,
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("refuses a saver that is not the shape of an account id, and a negative revision", async () => {
      await expect(
        staff.sql()`update kitchen_defaults set saved_by_account_id = 'short'`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        staff.sql()`update kitchen_defaults set revision = -1`,
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});
