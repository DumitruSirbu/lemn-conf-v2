import { describe, expect, it } from "vitest";

import { describeCatalogueAvailabilityStoreContract } from "./support/catalogue-availability-store-contract.js";
import type { AvailabilityWorld } from "./support/catalogue-availability-store-contract.js";
import {
  activationEntryFor,
  auditRecordOf,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";

/** The fake with the shared audit log behind it, as the contract's world. */
function newAvailabilityWorld(): AvailabilityWorld &
  ReturnType<typeof newFakeDashboardWorld> {
  const world = newFakeDashboardWorld();
  return { ...world, store: world.availability };
}

describeCatalogueAvailabilityStoreContract(
  "FakeCatalogueAvailabilityStore",
  () => Promise.resolve(newAvailabilityWorld()),
);

describe("FakeCatalogueAvailabilityStore, beyond what the Neon store must also do", () => {
  it("compares revisions of different lengths by their value, as bigint does", async () => {
    const world = newAvailabilityWorld();
    const staff = await world.aStaffMember();
    for (let write = 0; write < 10; write += 1) {
      const item = {
        kind: "accessory",
        accessoryId: `extra-${String(write)}`,
      } as const;
      await world.store.setActive({
        item,
        active: false,
        expectedRevision: (await world.store.readCurrent()).revision,
        audit: auditRecordOf(staff, activationEntryFor(item, false)),
      });
    }

    const [ninth, tenth, eleventh] = [
      await world.store.readAt("9"),
      await world.store.readAt("10"),
      await world.store.readAt("11"),
    ];

    expect(ninth).toMatchObject({
      kind: "found",
      availability: { revision: "9" },
    });
    expect(tenth).toMatchObject({
      kind: "found",
      availability: { revision: "10" },
    });
    expect(eleventh.kind).toBe("availability-revision-not-found");
  });

  it("knows no revision a digit longer than the head, which a text comparison would put before it", async () => {
    const world = newAvailabilityWorld();
    for (let write = 0; write < 9; write += 1)
      world.availability.head.advance();

    expect((await world.store.readAt("10")).kind).toBe(
      "availability-revision-not-found",
    );
    expect((await world.store.readAt("9")).kind).toBe("found");
  });

  it("answers a revision a defaults save advanced without a row as the state before it", async () => {
    const world = newAvailabilityWorld();
    world.availability.head.advance();

    expect(await world.store.readAt("1")).toEqual({
      kind: "found",
      availability: { revision: "1", disabled: [] },
    });
  });

  it("hands out copies, so a caller changing what it read changes nothing held", async () => {
    const world = newAvailabilityWorld();
    const staff = await world.aStaffMember();
    const item = { kind: "material", tierId: "mdf" } as const;
    await world.store.setActive({
      item,
      active: false,
      expectedRevision: "0",
      audit: auditRecordOf(staff, activationEntryFor(item, false)),
    });

    const read = await world.store.readCurrent();
    (read.disabled as unknown[]).length = 0;

    expect((await world.store.readCurrent()).disabled).toEqual([item]);
  });
});
