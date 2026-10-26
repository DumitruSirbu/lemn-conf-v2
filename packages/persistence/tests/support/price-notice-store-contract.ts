import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  INITIAL_REVISION,
  NEVER_RECORDED,
  REVISION_AHEAD,
  UNKNOWN_VERSION,
} from "../../src/m10-ports.js";
import type {
  AcknowledgedPrices,
  CatalogueAvailabilityStore,
  PriceBookStore,
  PriceNoticeStore,
} from "../../src/m10-ports.js";
import {
  activationEntryFor,
  auditRecordOf,
  dashboardFailureOf,
  publishNextVersion,
} from "./dashboard-contract-support.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
} from "./dashboard-contract-support.js";

/** The widest revision there is: ahead of any head a test database holds. */
const BEYOND_ANY_HEAD = "9223372036854775807";

export interface NoticeWorld extends DashboardStaffWorld {
  readonly store: PriceNoticeStore;
  /** The versions an acknowledgement may name, and the log whose head it may not be ahead of. */
  readonly priceBook: PriceBookStore;
  readonly availability: CatalogueAvailabilityStore;
  /** A design the marker may be written for. */
  aDesignId(): Promise<string>;
}

export function describePriceNoticeStoreContract(
  suiteName: string,
  newWorld: () => Promise<NoticeWorld>,
): void {
  describe(`${suiteName}: the first open`, () => {
    it("reads a design that has no marker as never recorded", async () => {
      const world = await newWorld();

      expect(await world.store.readAcknowledged(await world.aDesignId())).toBe(
        NEVER_RECORDED,
      );
    });

    it("records the pair of a design with none, and reads it back", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const pair = await currentPair(world);

      await world.store.recordIfAbsent(designId, pair);

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: pair,
      });
    });

    it("never overwrites an acknowledgement a design already holds", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const first = await currentPair(world);
      await world.store.recordIfAbsent(designId, first);
      await publishNextVersion(
        world.priceBook,
        world.availability,
        await world.aStaffMember(),
      );

      await world.store.recordIfAbsent(designId, await currentPair(world));

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: first,
      });
    });

    it("leaves an acknowledgement the design holds when a first open arrives after it", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const staff = await world.aStaffMember();
      const first = await currentPair(world, staff);
      const second = await publishNextVersion(
        world.priceBook,
        world.availability,
        staff,
      );
      const acknowledged = {
        versionId: first.versionId,
        availabilityRevision: first.availabilityRevision,
      };
      await world.store.recordAcknowledged(designId, acknowledged);

      await world.store.recordIfAbsent(designId, {
        versionId: second.versionId,
        availabilityRevision: second.availabilityRevision,
      });

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged,
      });
    });

    it("keeps one marker for each design", async () => {
      const world = await newWorld();
      const [first, second] = [
        await world.aDesignId(),
        await world.aDesignId(),
      ];
      const pair = await currentPair(world);

      await world.store.recordIfAbsent(first, pair);

      expect(await world.store.readAcknowledged(second)).toBe(NEVER_RECORDED);
    });
  });

  describe(`${suiteName}: an acknowledgement`, () => {
    it("records the pair the page displayed and replaces the marker the design held", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const staff = await world.aStaffMember();
      await world.store.recordIfAbsent(designId, await currentPair(world));
      const second = await publishNextVersion(
        world.priceBook,
        world.availability,
        staff,
      );
      const pair = { versionId: second.versionId, availabilityRevision: "0" };

      const result = await world.store.recordAcknowledged(designId, pair);

      expect(result).toEqual({ kind: "ok" });
      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: pair,
      });
    });

    it("records for a design that has no marker yet", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();

      const result = await world.store.recordAcknowledged(
        designId,
        await currentPair(world),
      );

      expect(result).toEqual({ kind: "ok" });
    });

    it("accepts the availability head itself, and refuses the revision after it, writing nothing", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const head = await switchOneItemOff(world, await world.aStaffMember());
      const { versionId } = await currentPair(world);

      const atHead = await world.store.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: head,
      });
      const ahead = await world.store.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: BEYOND_ANY_HEAD,
      });

      expect(atHead).toEqual({ kind: "ok" });
      expect(ahead).toBe(REVISION_AHEAD);
      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: { versionId, availabilityRevision: head },
      });
    });

    it("refuses the revision just after the head, and writes nothing for a design that held no marker", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const head = await switchOneItemOff(world, await world.aStaffMember());
      const { versionId } = await currentPair(world);

      const result = await world.store.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: await world.aRevisionAfter(head, 1),
      });

      expect(result).toBe(REVISION_AHEAD);
      expect(await world.store.readAcknowledged(designId)).toBe(NEVER_RECORDED);
    });

    it("writes nothing for an unknown version when the design held no marker", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      await currentPair(world);

      const result = await world.store.recordAcknowledged(designId, {
        versionId: "A".repeat(21),
        availabilityRevision: INITIAL_REVISION,
      });

      expect(result).toBe(UNKNOWN_VERSION);
      expect(await world.store.readAcknowledged(designId)).toBe(NEVER_RECORDED);
    });

    it("refuses a version that does not exist, writing nothing", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const known = await currentPair(world);
      await world.store.recordIfAbsent(designId, known);

      const result = await world.store.recordAcknowledged(designId, {
        versionId: "A".repeat(21),
        availabilityRevision: "0",
      });

      expect(result).toBe(UNKNOWN_VERSION);
      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: known,
      });
    });

    it("judges the version before the revision when both are wrong", async () => {
      const world = await newWorld();

      const result = await world.store.recordAcknowledged(
        await world.aDesignId(),
        {
          versionId: "A".repeat(21),
          availabilityRevision: BEYOND_ANY_HEAD,
        },
      );

      expect(result).toBe(UNKNOWN_VERSION);
    });
  });

  describe(`${suiteName}: any interleaving of first opens and acknowledgements`, () => {
    it("ends at the last acknowledgement, and a first open changes a marker only where there is none", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const first = await currentPair(world, staff);
      const second = await publishNextVersion(
        world.priceBook,
        world.availability,
        staff,
      );
      const head = (await world.availability.readCurrent()).revision;
      const versionIds = [first.versionId, second.versionId];
      const revisionsAtOrBelowHead = [
        INITIAL_REVISION,
        first.availabilityRevision,
        head,
      ];
      const pair = fc.record({
        versionId: fc.constantFrom(...versionIds),
        availabilityRevision: fc.constantFrom(...revisionsAtOrBelowHead),
      });
      const step = fc.record({
        isFirstOpen: fc.boolean(),
        pair,
      });

      await fc.assert(
        fc.asyncProperty(fc.array(step, { maxLength: 8 }), async (steps) => {
          const designId = await world.aDesignId();
          let expected: AcknowledgedPrices | undefined;
          for (const { isFirstOpen, pair: given } of steps) {
            if (isFirstOpen) {
              await world.store.recordIfAbsent(designId, given);
              expected ??= given;
            } else {
              expect(
                await world.store.recordAcknowledged(designId, given),
              ).toEqual({
                kind: "ok",
              });
              expected = given;
            }
          }
          expect(await world.store.readAcknowledged(designId)).toEqual(
            expected === undefined
              ? NEVER_RECORDED
              : { kind: "recorded", acknowledged: expected },
          );
        }),
        { numRuns: 25 },
      );
    }, 120_000);
  });

  describe(`${suiteName}: what it is not`, () => {
    it("writes no audit row: a customer's marker has no staff actor", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const staff = await world.aStaffMember();
      const pair = await currentPair(world, staff);
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      await world.store.recordIfAbsent(designId, pair);
      await world.store.recordAcknowledged(designId, pair);

      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("refuses a design id that is not an id's shape, and a pair that is not a pair's", async () => {
      const world = await newWorld();
      const pair = await currentPair(world);

      await dashboardFailureOf(
        world.store.readAcknowledged("not an id"),
        "invalid-request",
      );
      await dashboardFailureOf(
        world.store.recordIfAbsent("not an id", pair),
        "invalid-request",
      );
      await dashboardFailureOf(
        world.store.recordAcknowledged(await world.aDesignId(), {
          versionId: pair.versionId,
          availabilityRevision: "01",
        }),
        "invalid-request",
      );
    });
  });
}

/** The active version and the head: the pair a first open records. Publishes the first version when there is none. */
async function currentPair(world: NoticeWorld, staff?: DashboardStaffMember) {
  await publishFirstVersionIfNone(world, staff ?? (await world.aStaffMember()));
  const active = await world.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the version was not published");
  const { revision } = await world.availability.readCurrent();
  return {
    versionId: active.version.versionId,
    availabilityRevision: revision,
  };
}

async function switchOneItemOff(
  world: NoticeWorld,
  staff: DashboardStaffMember,
): Promise<string> {
  await publishFirstVersionIfNone(world, staff);
  const item = { kind: "material", tierId: "mdf" } as const;
  const result = await world.availability.setActive({
    item,
    active: false,
    expectedRevision: (await world.availability.readCurrent()).revision,
    audit: auditRecordOf(staff, activationEntryFor(item, false)),
  });
  if (result.kind !== "ok")
    throw new Error("the availability write was refused");
  return result.revision;
}

async function publishFirstVersionIfNone(
  world: NoticeWorld,
  staff: DashboardStaffMember,
): Promise<void> {
  if ((await world.priceBook.readActive()).kind === "found") return;
  await publishNextVersion(world.priceBook, world.availability, staff);
}
