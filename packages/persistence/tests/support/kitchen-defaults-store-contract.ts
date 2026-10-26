import type { ItemRef } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  INITIAL_REVISION,
  NONE_SAVED,
} from "../../src/m10-ports.js";
import type {
  CatalogueAvailabilityStore,
  KitchenDefaultsStore,
  KitchenUsageReader,
  PriceBookStore,
} from "../../src/m10-ports.js";
import {
  A_BOOK,
  activationEntryFor,
  auditRecordOf,
  dashboardFailureOf,
  publishedEntry,
} from "./dashboard-contract-support.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
} from "./dashboard-contract-support.js";

export interface DefaultsWorld extends DashboardStaffWorld {
  readonly store: KitchenDefaultsStore;
  readonly usage: KitchenUsageReader;
  /** The log whose head a save advances. */
  readonly availability: CatalogueAvailabilityStore;
  /** The other writer that takes the head's compare-and-set, for the race between a save and a publish. */
  readonly priceBook: PriceBookStore;
  /** A saved design that uses the items, at any level of its document. */
  aDesignUsing(spec: {
    readonly uses: readonly ItemRef[];
    readonly isDeletedByClient?: boolean;
  }): Promise<void>;
}

const MDF: ItemRef = { kind: "material", tierId: "mdf" };
const WALNUT: ItemRef = { kind: "finish", finishId: "walnut" };

const DEFAULTS = {
  materialTierId: "mdf",
  hardwareTierId: "premium",
  cabinetDepthMm: 560,
  finish: "walnut",
  handle: "steel",
  topRowHandle: "push",
};

const SAVED_ENTRY = {
  action: "kitchen-defaults-saved",
  detail: { changedFields: ["material"] },
} as const;

/** The widest revision a `bigint` holds: a valid shape no head has reached. */
const WIDEST_REVISION = "9223372036854775807";

/** A 19-digit run a `bigint` cannot hold: one past the widest revision. */
const PAST_THE_WIDEST_REVISION = "9223372036854775808";

export function describeKitchenDefaultsStoreContract(
  suiteName: string,
  newWorld: () => Promise<DefaultsWorld>,
): void {
  describeSaving(suiteName, newWorld);
  describeSharedHead(suiteName, newWorld);
  describeSharedHeadWithPublish(suiteName, newWorld);
  describeUsage(suiteName, newWorld);
}

async function save(
  world: DefaultsWorld,
  staff: DashboardStaffMember,
  overrides: {
    readonly defaults?: unknown;
    readonly expectedRevision?: string;
    readonly expectedAvailabilityRevision?: string;
  } = {},
) {
  const saved = await world.store.read();
  return world.store.save({
    expectedRevision:
      overrides.expectedRevision ??
      (saved.kind === "saved" ? saved.saved.revision : INITIAL_REVISION),
    expectedAvailabilityRevision:
      overrides.expectedAvailabilityRevision ??
      (await world.availability.readCurrent()).revision,
    defaults: overrides.defaults ?? DEFAULTS,
    audit: auditRecordOf(staff, SAVED_ENTRY),
  });
}

function describeSaving(
  suiteName: string,
  newWorld: () => Promise<DefaultsWorld>,
): void {
  describe(`${suiteName}: save`, () => {
    it("reads as none saved until the first save", async () => {
      const world = await newWorld();

      expect(await world.store.read()).toBe(NONE_SAVED);
    });

    it("stores the defaults as given at a new revision and writes the audit row for the account of the session", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const result = await save(world, staff);

      expect(result).toEqual({
        kind: "ok",
        revision: expect.any(String) as string,
        availabilityRevision: (await world.availability.readCurrent()).revision,
      });
      const revision = result.kind === "ok" ? result.revision : "";
      expect(await world.store.read()).toEqual({
        kind: "saved",
        saved: {
          revision,
          defaults: DEFAULTS,
          savedAt: expect.any(Date) as Date,
        },
      });
      expect(revision).not.toBe(INITIAL_REVISION);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        {
          action: "kitchen-defaults-saved",
          designId: undefined,
          detail: SAVED_ENTRY.detail,
        },
      ]);
    });

    it("keeps defaults of `{}` as saved, with the revision the next save needs, and not as none saved", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const first = await save(world, staff, { defaults: {} });
      const read = await world.store.read();
      const second = await save(world, staff, { defaults: DEFAULTS });

      expect(first.kind).toBe("ok");
      expect(read).toMatchObject({ kind: "saved", saved: { defaults: {} } });
      expect(second.kind).toBe("ok");
    });

    it("refuses a save made against a revision that is not current, changing nothing and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await save(world, staff, { defaults: {} });
      const before = await world.store.read();
      const availabilityBefore = await world.availability.readCurrent();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      const result = await save(world, staff, {
        expectedRevision: INITIAL_REVISION,
      });

      expect(result).toBe(CHANGED_MEANWHILE);
      expect(await world.store.read()).toEqual(before);
      expect(await world.availability.readCurrent()).toEqual(
        availabilityBefore,
      );
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("refuses a save made against an availability revision that is not current, changing nothing and writing no audit row for it", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const stale = (await world.availability.readCurrent()).revision;
      await switchOff(world, staff, MDF);
      const availabilityMoved = await world.availability.readCurrent();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      const result = await save(world, staff, {
        expectedAvailabilityRevision: stale,
      });

      expect(result).toBe(AVAILABILITY_CHANGED_MEANWHILE);
      expect(await world.store.read()).toBe(NONE_SAVED);
      expect(await world.availability.readCurrent()).toEqual(availabilityMoved);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("moves the availability head by exactly one, and returns the head it left and a revision no earlier save held", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = BigInt((await world.availability.readCurrent()).revision);

      const first = await save(world, staff);
      const second = await save(world, staff, {
        defaults: { handle: "steel" },
      });

      expect(first).toMatchObject({
        kind: "ok",
        availabilityRevision: String(before + 1n),
      });
      expect(second).toMatchObject({
        kind: "ok",
        availabilityRevision: String(before + 2n),
      });
      expect(
        first.kind === "ok" &&
          second.kind === "ok" &&
          first.revision !== second.revision,
      ).toBe(true);
      expect((await world.availability.readCurrent()).revision).toBe(
        String(before + 2n),
      );
    });

    it("refuses a save made against revisions ahead of the current ones, or the widest there is, changing nothing and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await save(world, staff, { defaults: {} });
      const saved = await world.store.read();
      const head = await world.availability.readCurrent();
      const savedRevision = saved.kind === "saved" ? saved.saved.revision : "";
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      for (const expectedRevision of [
        String(BigInt(savedRevision) + 1n),
        WIDEST_REVISION,
      ]) {
        expect(await save(world, staff, { expectedRevision })).toBe(
          CHANGED_MEANWHILE,
        );
      }
      for (const expectedAvailabilityRevision of [
        String(BigInt(head.revision) + 1n),
        WIDEST_REVISION,
      ]) {
        expect(await save(world, staff, { expectedAvailabilityRevision })).toBe(
          AVAILABILITY_CHANGED_MEANWHILE,
        );
      }

      expect(await world.store.read()).toEqual(saved);
      expect(await world.availability.readCurrent()).toEqual(head);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("writes nothing when both revisions are stale, answers one of the two refusals, and leaves the revision it refused still the current one", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await switchOff(world, staff, MDF);
      const head = await world.availability.readCurrent();

      const result = await save(world, staff, {
        expectedRevision: String(BigInt(INITIAL_REVISION) + 1n),
        expectedAvailabilityRevision: INITIAL_REVISION,
      });

      expect([CHANGED_MEANWHILE, AVAILABILITY_CHANGED_MEANWHILE]).toContain(
        result,
      );
      expect(await world.store.read()).toBe(NONE_SAVED);
      expect(await world.availability.readCurrent()).toEqual(head);
      expect((await save(world, staff)).kind).toBe("ok");
    });

    it("does not spend the defaults revision on a save refused for its availability revision", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const stale = (await world.availability.readCurrent()).revision;
      await switchOff(world, staff, MDF);
      await save(world, staff, { expectedAvailabilityRevision: stale });

      const retried = await save(world, staff);

      expect(retried.kind).toBe("ok");
    });

    it("writes nothing when no live session stands behind the call", async () => {
      const world = await newWorld();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      const availabilityBefore = await world.availability.readCurrent();

      await dashboardFailureOf(save(world, gone), "not-recorded");

      expect(await world.store.read()).toBe(NONE_SAVED);
      expect(await world.availability.readCurrent()).toEqual(
        availabilityBefore,
      );
    });

    it("refuses revisions that are not a revision's shape, defaults that are not an object and an audit entry that is not a defaults entry", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = (await world.availability.readCurrent()).revision;

      for (const expectedRevision of ["01", "", PAST_THE_WIDEST_REVISION]) {
        await dashboardFailureOf(
          save(world, staff, { expectedRevision }),
          "invalid-request",
        );
      }
      for (const expectedAvailabilityRevision of [
        "x",
        PAST_THE_WIDEST_REVISION,
      ]) {
        await dashboardFailureOf(
          save(world, staff, { expectedAvailabilityRevision }),
          "invalid-request",
        );
      }
      for (const defaults of ["defaults", 4, [], undefined]) {
        await dashboardFailureOf(
          world.store.save({
            expectedRevision: INITIAL_REVISION,
            expectedAvailabilityRevision: head,
            defaults,
            audit: auditRecordOf(staff, SAVED_ENTRY),
          }),
          "invalid-request",
        );
      }
      await dashboardFailureOf(
        world.store.save({
          expectedRevision: INITIAL_REVISION,
          expectedAvailabilityRevision: head,
          defaults: DEFAULTS,
          audit: auditRecordOf(staff, { action: "kitchen-seen", detail: {} }),
        }),
        "invalid-request",
      );

      expect(await world.store.read()).toBe(NONE_SAVED);
    });
  });
}

function describeSharedHead(
  suiteName: string,
  newWorld: () => Promise<DefaultsWorld>,
): void {
  describe(`${suiteName}: the availability head it shares`, () => {
    it("advances the availability head by its save, without a row in the log, so an availability write made against the old head is refused", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await world.availability.readCurrent();

      await save(world, staff);

      const after = await world.availability.readCurrent();
      expect(after.revision).not.toBe(before.revision);
      expect(after.disabled).toEqual(before.disabled);
      const lateWrite = await world.availability.setActive({
        item: MDF,
        active: false,
        expectedRevision: before.revision,
        audit: auditRecordOf(staff, activationEntryFor(MDF, false)),
      });
      expect(lateWrite).toBe(CHANGED_MEANWHILE);
      expect(await world.availability.readAt(after.revision)).toMatchObject({
        kind: "found",
      });
    });

    it("lets exactly one of a defaults save and an availability write racing at one head revision succeed", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = (await world.availability.readCurrent()).revision;

      const [saved, switched] = await Promise.all([
        save(world, staff, {
          defaults: { materialTierId: "mdf" },
          expectedAvailabilityRevision: head,
        }),
        world.availability.setActive({
          item: MDF,
          active: false,
          expectedRevision: head,
          audit: auditRecordOf(staff, activationEntryFor(MDF, false)),
        }),
      ]);

      expect(
        [saved.kind === "ok", switched.kind === "ok"].filter(Boolean),
      ).toHaveLength(1);
      expect((await world.availability.readCurrent()).revision).toBe(
        String(BigInt(head) + 1n),
      );
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });
  });
}

function describeSharedHeadWithPublish(
  suiteName: string,
  newWorld: () => Promise<DefaultsWorld>,
): void {
  describe(`${suiteName}: the availability head it shares with a publish`, () => {
    it("lets exactly one of a defaults save and a publish racing at one head revision succeed", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = (await world.availability.readCurrent()).revision;

      const [saved, published] = await Promise.all([
        save(world, staff, { expectedAvailabilityRevision: head }),
        world.priceBook.publish({
          expectedDraftRevision: INITIAL_REVISION,
          expectedActiveSequence: 0,
          expectedAvailabilityRevision: head,
          createdItems: [],
          label: "Race",
          note: "",
          book: A_BOOK,
          changeSummary: [],
          audit: auditRecordOf(staff, publishedEntry()),
        }),
      ]);

      expect(
        [saved.kind === "ok", published.kind === "ok"].filter(Boolean),
      ).toHaveLength(1);
      expect(
        [saved.kind, published.kind].filter(
          (kind) => kind === "availability-changed-meanwhile",
        ),
      ).toHaveLength(1);
    });
  });
}

function describeUsage(
  suiteName: string,
  newWorld: () => Promise<DefaultsWorld>,
): void {
  describe(`${suiteName}: the usage count`, () => {
    it("counts the designs that use an item and none that do not", async () => {
      const world = await newWorld();
      const item: ItemRef = {
        kind: "accessory",
        accessoryId: "usage-count-light",
      };
      const before = await world.usage.count(item);

      await world.aDesignUsing({ uses: [item, MDF] });
      await world.aDesignUsing({ uses: [item] });
      await world.aDesignUsing({ uses: [WALNUT] });

      expect(await world.usage.count(item)).toBe(before + 2);
    });

    it("leaves out a design its client deleted", async () => {
      const world = await newWorld();
      const item: ItemRef = {
        kind: "accessory",
        accessoryId: "usage-deleted-light",
      };
      await world.aDesignUsing({ uses: [item] });
      const kept = await world.usage.count(item);

      await world.aDesignUsing({ uses: [item], isDeletedByClient: true });

      expect(await world.usage.count(item)).toBe(kept);
    });

    it("counts a design once, however many of its levels use the item", async () => {
      const world = await newWorld();
      const item: ItemRef = {
        kind: "accessory",
        accessoryId: "usage-twice-light",
      };
      const before = await world.usage.count(item);

      await world.aDesignUsing({ uses: [item, item, item] });

      expect(await world.usage.count(item)).toBe(before + 1);
    });

    it("keeps an item of one kind apart from another kind's of the same id", async () => {
      const world = await newWorld();
      const material: ItemRef = { kind: "material", tierId: "usage-same-id" };
      const hardware: ItemRef = { kind: "hardware", tierId: "usage-same-id" };
      await world.aDesignUsing({ uses: [material] });

      expect(await world.usage.count(hardware)).toBe(0);
      expect(await world.usage.count(material)).toBeGreaterThanOrEqual(1);
    });
  });
}

async function switchOff(
  world: DefaultsWorld,
  staff: DashboardStaffMember,
  item: ItemRef,
): Promise<void> {
  const result = await world.availability.setActive({
    item,
    active: false,
    expectedRevision: (await world.availability.readCurrent()).revision,
    audit: auditRecordOf(staff, activationEntryFor(item, false)),
  });
  if (result.kind !== "ok") {
    throw new Error("the availability write was refused");
  }
}
