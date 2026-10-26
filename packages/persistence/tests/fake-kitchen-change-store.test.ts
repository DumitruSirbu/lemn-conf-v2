import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import type { HeldChangeKitchen } from "../src/fake-kitchen-change-store.js";
import {
  KITCHEN_SEEN,
  auditRecordOf,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describeKitchenChangeStoreContract } from "./support/kitchen-change-store-contract.js";
import type { ChangeWorld } from "./support/kitchen-change-store-contract.js";

/**
 * The fake with the shared audit log behind it, as the contract's world. The same contract runs against the Neon store
 * (`NeonKitchenChangeStore`) when lane S builds it.
 */
function newChangeWorld(): ChangeWorld &
  ReturnType<typeof newFakeDashboardWorld> {
  const world = newFakeDashboardWorld();
  const revisions = new Map<string, number>();
  const planted = new Map<string, Omit<HeldChangeKitchen, "revision">>();

  function replant(designId: string, revision: number): void {
    const kitchen = planted.get(designId);
    if (kitchen === undefined) throw new Error("no such kitchen was planted");
    revisions.set(designId, revision);
    world.changes.plantKitchen({ ...kitchen, revision: String(revision) });
  }

  return {
    ...world,
    store: world.changes,
    aKitchen(spec) {
      const designId = nanoid();
      const hasAccount = spec.hasAccount ?? true;
      planted.set(designId, {
        designId,
        ...(hasAccount ? { accountId: nanoid() } : {}),
        ...(spec.sentAt === undefined ? {} : { sentAt: spec.sentAt }),
        updatedAt: new Date("2026-10-20T09:00:00.000Z"),
        isDeletedByClient: spec.isDeletedByClient ?? false,
        ...(spec.kitchenName === undefined
          ? {}
          : { kitchenName: spec.kitchenName }),
        ...(spec.customerName === undefined
          ? {}
          : { customerName: spec.customerName }),
        reference: `REF-${designId}`,
        ...(spec.status === undefined ? {} : { status: spec.status }),
        latestSubmissionRevision: "1",
      });
      replant(designId, 1);
      return Promise.resolve({ designId, revision: "1" });
    },
    saveKitchen(designId) {
      replant(designId, (revisions.get(designId) ?? 0) + 1);
      return Promise.resolve(String(revisions.get(designId)));
    },
    resendKitchen(designId) {
      const kitchen = planted.get(designId);
      const revision = revisions.get(designId);
      if (kitchen === undefined || revision === undefined) {
        throw new Error("no such kitchen was planted");
      }
      planted.set(designId, {
        ...kitchen,
        latestSubmissionRevision: String(revision),
      });
      replant(designId, revision);
      return Promise.resolve();
    },
    aRevisionAheadOf: (designId) =>
      Promise.resolve(String((revisions.get(designId) ?? 0) + 1)),
    seenRevisionOf: (designId) =>
      Promise.resolve(world.changes.heldSeenRevision(designId)),
    seenMarkOf(designId) {
      const mark = world.changes.heldSeenMark(designId);
      return Promise.resolve(
        mark === undefined
          ? undefined
          : {
              revision: mark.seenRevision,
              byAccountId: mark.seenByAccountId,
              atMs: mark.seenAt.getTime(),
            },
      );
    },
  };
}

describeKitchenChangeStoreContract("FakeKitchenChangeStore", () =>
  Promise.resolve(newChangeWorld()),
);

describe("FakeKitchenChangeStore, beyond what the Neon store must also do", () => {
  it("accepts a round's entries again without a second row or a failure, as a retry may send them", async () => {
    const world = newChangeWorld();
    const kitchen = await world.aKitchen({
      sentAt: new Date("2026-10-24T09:00:00.000Z"),
    });
    const claim = await world.store.claimDigestDay("2026-10-26");
    if (claim.kind !== "claimed") throw new Error("the day was not claimed");
    const entries = [
      { designId: kitchen.designId, revision: kitchen.revision },
    ];

    await world.store.recordDigested(claim.roundId, entries);
    await world.store.recordDigested(claim.roundId, entries);

    expect(world.changes.heldDigestEntries()).toEqual(entries);
  });

  it("holds the rounds and entries a claim and a record made, and nothing a claim did not", async () => {
    const world = newChangeWorld();
    const kitchen = await world.aKitchen({
      sentAt: new Date("2026-10-24T09:00:00.000Z"),
    });
    const claim = await world.store.claimDigestDay("2026-10-26");
    if (claim.kind !== "claimed") throw new Error("the day was not claimed");

    expect(world.changes.heldRounds()).toEqual([
      { dayKey: claim.roundId, claimedAt: expect.any(Date) as Date },
    ]);
    expect(claim.roundId).toBe("2026-10-26");
    expect(world.changes.heldDigestEntries()).toEqual([]);

    await world.store.recordDigested(claim.roundId, [
      { designId: kitchen.designId, revision: kitchen.revision },
    ]);

    expect(world.changes.heldDigestEntries()).toEqual([
      { designId: kitchen.designId, revision: kitchen.revision },
    ]);
  });

  it("compares revisions of different lengths by their value, as bigint does", async () => {
    const world = newChangeWorld();
    const staff = await world.aStaffMember();
    const kitchen = await world.aKitchen({
      sentAt: new Date("2026-10-24T09:00:00.000Z"),
    });
    const markDisplaying = async (displayedRevision: string) =>
      (
        await world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        })
      ).kind;
    for (let save = 0; save < 8; save += 1)
      await world.saveKitchen(kitchen.designId);

    const whileNinth = [await markDisplaying("10"), await markDisplaying("9")];
    await world.saveKitchen(kitchen.designId);
    const whileTenth = [
      await markDisplaying("10"),
      await markDisplaying("9"),
      await markDisplaying("11"),
    ];

    expect(whileNinth).toEqual(["displayed-revision-ahead", "ok"]);
    expect(whileTenth).toEqual(["ok", "ok", "displayed-revision-ahead"]);
  });
});
