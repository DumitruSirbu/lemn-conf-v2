import type { ItemRef } from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_REVISION_NOT_FOUND,
  CHANGED_MEANWHILE,
  INITIAL_REVISION,
} from "../../src/m10-ports.js";
import type {
  ActivationAuditRecord,
  CatalogueAvailabilityStore,
} from "../../src/m10-ports.js";
import {
  activationEntryFor,
  auditRecordOf,
  dashboardFailureOf,
  sortedItems,
} from "./dashboard-contract-support.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
} from "./dashboard-contract-support.js";

export interface AvailabilityWorld extends DashboardStaffWorld {
  readonly store: CatalogueAvailabilityStore;
}

const MDF: ItemRef = { kind: "material", tierId: "mdf" };
const FENIX: ItemRef = { kind: "material", tierId: "fenix" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "premium" };
const WALNUT: ItemRef = { kind: "finish", finishId: "walnut" };
const STEEL: ItemRef = { kind: "handle", handle: "steel" };
const LIGHT: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };

/** The widest revision a `bigint` holds: a valid shape no head has reached. */
const WIDEST_REVISION = "9223372036854775807";

/** One item of every kind, so the log is held by the kind and the id together. */
const ONE_OF_EACH: readonly ItemRef[] = [MDF, PREMIUM, WALNUT, STEEL, LIGHT];

export function describeCatalogueAvailabilityStoreContract(
  suiteName: string,
  newWorld: () => Promise<AvailabilityWorld>,
): void {
  describeReading(suiteName, newWorld);
  describeSetActive(suiteName, newWorld);
  describeReplay(suiteName, newWorld);
}

async function setActive(
  world: AvailabilityWorld,
  staff: DashboardStaffMember,
  change: {
    readonly item: ItemRef;
    readonly active: boolean;
    readonly expectedRevision: string;
  },
) {
  return world.store.setActive({
    ...change,
    audit: auditRecordOf(staff, activationEntryFor(change.item, change.active)),
  });
}

async function currentRevision(world: AvailabilityWorld): Promise<string> {
  return (await world.store.readCurrent()).revision;
}

function describeReading(
  suiteName: string,
  newWorld: () => Promise<AvailabilityWorld>,
): void {
  describe(`${suiteName}: reading`, () => {
    it("reads nothing switched off, at the revision a table with no row has", async () => {
      const world = await newWorld();

      expect(await world.store.readCurrent()).toEqual({
        revision: INITIAL_REVISION,
        disabled: [],
      });
    });

    it("answers the state at the initial revision as nothing switched off", async () => {
      const world = await newWorld();

      expect(await world.store.readAt(INITIAL_REVISION)).toEqual({
        kind: "found",
        availability: { revision: INITIAL_REVISION, disabled: [] },
      });
    });

    it("knows no revision beyond the head, and none that is not a revision's shape", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await setActive(world, staff, {
        item: MDF,
        active: false,
        expectedRevision: await currentRevision(world),
      });

      for (const revision of [
        "9223372036854775807",
        "9223372036854775808",
        "01",
        "-1",
        "abc",
        "",
        "1e1",
        "1 ",
      ]) {
        expect(await world.store.readAt(revision)).toBe(
          AVAILABILITY_REVISION_NOT_FOUND,
        );
      }
    });
  });
}

function describeSetActive(
  suiteName: string,
  newWorld: () => Promise<AvailabilityWorld>,
): void {
  describe(`${suiteName}: setActive`, () => {
    it("switches an item off at the revision it produced, and writes the audit row with that revision, for the account of the session", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await currentRevision(world);

      const result = await setActive(world, staff, {
        item: MDF,
        active: false,
        expectedRevision: before,
      });

      expect(result).toEqual({
        kind: "ok",
        revision: expect.any(String) as string,
      });
      const revision = result.kind === "ok" ? result.revision : "";
      expect(revision).not.toBe(before);
      expect(await world.store.readCurrent()).toEqual({
        revision,
        disabled: [MDF],
      });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        {
          action: "catalogue-item-activation-changed",
          designId: undefined,
          detail: {
            itemKind: "material",
            itemId: "mdf",
            active: false,
            availabilityRevision: revision,
          },
        },
      ]);
    });

    it("switches an item back on, which leaves it out of what is off", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const off = await setActive(world, staff, {
        item: FENIX,
        active: false,
        expectedRevision: await currentRevision(world),
      });
      if (off.kind !== "ok") throw new Error("the first write was refused");

      await setActive(world, staff, {
        item: FENIX,
        active: true,
        expectedRevision: off.revision,
      });

      expect((await world.store.readCurrent()).disabled).toEqual([]);
    });

    it("keeps an item of one kind apart from an item of another that has the same id", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const sameId: ItemRef = { kind: "hardware", tierId: "mdf" };

      await setActive(world, staff, {
        item: MDF,
        active: false,
        expectedRevision: await currentRevision(world),
      });
      await setActive(world, staff, {
        item: sameId,
        active: false,
        expectedRevision: await currentRevision(world),
      });
      await setActive(world, staff, {
        item: MDF,
        active: true,
        expectedRevision: await currentRevision(world),
      });

      expect((await world.store.readCurrent()).disabled).toEqual([sameId]);
    });

    it("refuses a stale expected revision, appending no row, moving no head and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const stale = await currentRevision(world);
      await setActive(world, staff, {
        item: MDF,
        active: false,
        expectedRevision: stale,
      });
      const before = await world.store.readCurrent();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      const result = await setActive(world, staff, {
        item: FENIX,
        active: false,
        expectedRevision: stale,
      });

      expect(result).toBe(CHANGED_MEANWHILE);
      expect(await world.store.readCurrent()).toEqual(before);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("lets exactly one of two writes racing at one revision win, and moves the head by one", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const expectedRevision = await currentRevision(world);

      const answers = await Promise.all([
        setActive(world, staff, { item: MDF, active: false, expectedRevision }),
        setActive(world, staff, {
          item: FENIX,
          active: false,
          expectedRevision,
        }),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      const after = await world.store.readCurrent();
      expect(after.disabled).toHaveLength(1);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
      const next = await setActive(world, staff, {
        item: WALNUT,
        active: false,
        expectedRevision: after.revision,
      });
      expect(next.kind).toBe("ok");
    });

    it("moves the head by exactly one for each write, and the audit row of each names the revision its own write produced, never the one it expected", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const items = [MDF, FENIX, WALNUT];
      const produced: string[] = [];
      let head = BigInt(await currentRevision(world));
      const start = head;

      for (const item of items) {
        const result = await setActive(world, staff, {
          item,
          active: false,
          expectedRevision: String(head),
        });
        expect(result).toEqual({ kind: "ok", revision: String(head + 1n) });
        head += 1n;
        produced.push(String(head));
      }

      expect(String(start + 3n)).toBe(await currentRevision(world));
      const audited = (await world.auditEventsOf(staff.accountId)).map(
        (event) =>
          (event.detail as { availabilityRevision: string })
            .availabilityRevision,
      );
      expect(audited).toEqual(produced);
    });

    it("refuses an expected revision ahead of the head, or the widest one there is, appending no row, moving no head and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = await currentRevision(world);
      const before = await world.store.readCurrent();

      for (const expectedRevision of [
        String(BigInt(head) + 1n),
        WIDEST_REVISION,
      ]) {
        const result = await setActive(world, staff, {
          item: MDF,
          active: false,
          expectedRevision,
        });
        expect(result).toBe(CHANGED_MEANWHILE);
      }

      expect(await world.store.readCurrent()).toEqual(before);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it("lets exactly one of three writes racing at one revision win, moving the head by one, with one audit row naming the winner's revision", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const expectedRevision = await currentRevision(world);

      const answers = await Promise.all(
        [MDF, FENIX, WALNUT].map((item) =>
          setActive(world, staff, { item, active: false, expectedRevision }),
        ),
      );

      const winners = answers.filter((answer) => answer.kind === "ok");
      expect(winners).toHaveLength(1);
      expect(
        answers.filter((answer) => answer === CHANGED_MEANWHILE),
      ).toHaveLength(2);
      const after = await world.store.readCurrent();
      expect(after.revision).toBe(String(BigInt(expectedRevision) + 1n));
      expect(after.disabled).toHaveLength(1);
      expect(await world.auditEventsOf(staff.accountId)).toMatchObject([
        { detail: { availabilityRevision: after.revision } },
      ]);
    });

    it("writes nothing when no live session stands behind the call", async () => {
      const world = await newWorld();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      const before = await world.store.readCurrent();

      await dashboardFailureOf(
        setActive(world, gone, {
          item: MDF,
          active: false,
          expectedRevision: before.revision,
        }),
        "not-recorded",
      );

      expect(await world.store.readCurrent()).toEqual(before);
      expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
    });

    it("refuses an audit entry that is not about this write", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const expectedRevision = await currentRevision(world);

      await dashboardFailureOf(
        world.store.setActive({
          item: MDF,
          active: false,
          expectedRevision,
          audit: auditRecordOf(staff, activationEntryFor(FENIX, false)),
        }),
        "invalid-request",
      );
      await dashboardFailureOf(
        world.store.setActive({
          item: MDF,
          active: false,
          expectedRevision,
          audit: auditRecordOf(staff, {
            action: "kitchen-seen",
            detail: {},
          }) as unknown as ActivationAuditRecord,
        }),
        "invalid-request",
      );

      expect(await currentRevision(world)).toBe(expectedRevision);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it("refuses an expected revision that is not a revision's shape", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      for (const expectedRevision of [
        "",
        "01",
        "x",
        "-1",
        "9223372036854775808",
      ]) {
        await dashboardFailureOf(
          setActive(world, staff, {
            item: MDF,
            active: false,
            expectedRevision,
          }),
          "invalid-request",
        );
      }
    });
  });
}

function describeReplay(
  suiteName: string,
  newWorld: () => Promise<AvailabilityWorld>,
): void {
  describe(`${suiteName}: readAt`, () => {
    it("answers the replay of the log up to every revision, for any sequence of switches", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const pool: readonly ItemRef[] = [
        ...ONE_OF_EACH,
        FENIX,
        { kind: "hardware", tierId: "mdf" },
      ];
      const switches = fc.array(
        fc.record({
          item: fc.constantFrom(...pool),
          active: fc.boolean(),
        }),
        { maxLength: 8 },
      );

      await fc.assert(
        fc.asyncProperty(switches, async (sequence) => {
          const start = await world.store.readCurrent();
          const off = new Map(
            start.disabled.map((item) => [JSON.stringify(item), item]),
          );
          const expectedStates = new Map<string, ItemRef[]>([
            [start.revision, [...off.values()]],
          ]);
          for (const { item, active } of sequence) {
            const result = await setActive(world, staff, {
              item,
              active,
              expectedRevision: await currentRevision(world),
            });
            if (result.kind !== "ok") throw new Error("a switch was refused");
            if (active) off.delete(JSON.stringify(item));
            else off.set(JSON.stringify(item), item);
            expectedStates.set(result.revision, [...off.values()]);
          }

          for (const [revision, disabled] of expectedStates) {
            const read = await world.store.readAt(revision);
            expect(read.kind).toBe("found");
            if (read.kind !== "found") continue;
            expect(sortedItems(read.availability.disabled)).toEqual(
              sortedItems(disabled),
            );
          }
        }),
        { numRuns: 12 },
      );
    }, 120_000);
    it("answers, for every revision the head has reached, the replay of the log up to it", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const sequence = replaySequence();
      const expectedStates = new Map<string, ItemRef[]>([
        [INITIAL_REVISION, []],
      ]);
      const off = new Map<string, ItemRef>();

      for (const { item, active } of sequence) {
        const result = await setActive(world, staff, {
          item,
          active,
          expectedRevision: await currentRevision(world),
        });
        if (result.kind !== "ok")
          throw new Error("a write of the sequence was refused");
        if (active) off.delete(JSON.stringify(item));
        else off.set(JSON.stringify(item), item);
        expectedStates.set(result.revision, [...off.values()]);
      }

      expect(expectedStates.size).toBe(sequence.length + 1);
      for (const [revision, disabled] of expectedStates) {
        const read = await world.store.readAt(revision);
        expect(read.kind).toBe("found");
        if (read.kind !== "found") continue;
        expect(read.availability.revision).toBe(revision);
        expect(sortedItems(read.availability.disabled)).toEqual(
          sortedItems(disabled),
        );
      }
      const head = await world.store.readCurrent();
      expect(sortedItems(head.disabled)).toEqual(
        sortedItems([...off.values()]),
      );
    });
  });
}

/** Switches of every kind off and on again, one item twice over, in an order that is not the items' own. */
function replaySequence(): readonly {
  readonly item: ItemRef;
  readonly active: boolean;
}[] {
  return [
    { item: STEEL, active: false },
    { item: MDF, active: false },
    { item: LIGHT, active: false },
    { item: MDF, active: true },
    { item: WALNUT, active: false },
    { item: PREMIUM, active: false },
    { item: STEEL, active: true },
    { item: MDF, active: false },
    ...ONE_OF_EACH.map((item) => ({ item, active: true })),
  ];
}
