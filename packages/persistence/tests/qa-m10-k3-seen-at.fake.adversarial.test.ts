import { describe, expect, it } from "vitest";

import { FakeStaffKitchenReader } from "../src/fake-staff-kitchen-reader.js";
import {
  KITCHEN_SEEN,
  auditRecordOf,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { CURRENT_DESIGN } from "./support/staff-kitchen-reader-contract.js";

// Adversarial QA of the instant the fake staff list says a kitchen was seen at, held to what the database gives: moved only
// by a mark that raises the revision, kept for a mark below the latest request, absent for a mark above the kitchen's
// revision, and later than the change when the save landed between a page's load and its mark.

const SENT_AT = new Date("2026-10-18T09:00:00.000Z");
const ACCOUNT_ID = "accountid000000000001";
const ONE_MINUTE_MS = 60_000;

async function aWorld() {
  const dashboard = newFakeDashboardWorld();
  const reader = new FakeStaffKitchenReader({ seen: dashboard.changes });
  const staff = await dashboard.aStaffMember();
  let planted = 0;

  function plant(spec: {
    readonly id: string;
    readonly isSent: boolean;
    readonly revision: string;
    readonly updatedAt: Date;
    readonly latestSubmissionRevision?: string;
  }): void {
    reader.plantKitchen({
      id: spec.id,
      name: null,
      design: CURRENT_DESIGN,
      accountId: ACCOUNT_ID,
      sentAt: spec.isSent ? SENT_AT : null,
      updatedAt: spec.updatedAt,
      isHidden: false,
      isDeletedByClient: false,
      revision: spec.revision,
    });
    dashboard.changes.plantKitchen({
      designId: spec.id,
      accountId: ACCOUNT_ID,
      ...(spec.isSent ? { sentAt: SENT_AT } : {}),
      updatedAt: spec.updatedAt,
      revision: spec.revision,
      isDeletedByClient: false,
      reference: `REF-${spec.id}`,
      ...(spec.latestSubmissionRevision === undefined
        ? {}
        : { latestSubmissionRevision: spec.latestSubmissionRevision }),
    });
  }

  async function listed(id: string) {
    const page = await reader.listPage({
      segment: "all",
      status: null,
      search: null,
      page: 1,
    });
    const row = page.kitchens.find((kitchen) => kitchen.id === id);
    if (row === undefined) throw new Error("the kitchen was not listed");
    return row;
  }

  return {
    changes: dashboard.changes,
    reader,
    plant,
    listed,
    anId: () => `kitchenid${String((planted += 1)).padStart(12, "0")}`,
    markSeen: (designId: string, displayedRevision: string) =>
      dashboard.changes.markSeen({
        designId,
        displayedRevision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      }),
  };
}

describe("the seen instant of the fake staff list", () => {
  it("moves with a mark that raises the revision and stays for an equal or an older one", async () => {
    const world = await aWorld();
    const id = world.anId();
    world.plant({ id, isSent: true, revision: "4", updatedAt: SENT_AT });

    await world.markSeen(id, "2");
    const afterFirstMark = (await world.listed(id)).seenAt;
    await world.markSeen(id, "2");
    const afterEqualMark = (await world.listed(id)).seenAt;
    await world.markSeen(id, "1");
    const afterOlderMark = (await world.listed(id)).seenAt;
    await world.markSeen(id, "3");
    const afterRisingMark = (await world.listed(id)).seenAt;

    expect(afterFirstMark).toBeInstanceOf(Date);
    expect(afterEqualMark).toEqual(afterFirstMark);
    expect(afterOlderMark).toEqual(afterFirstMark);
    expect(afterRisingMark?.getTime()).toBeGreaterThan(
      afterFirstMark?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    expect(afterRisingMark).toEqual(world.changes.heldSeenAt(id));
  });

  it("can hold a seen instant later than the change it reads as followed, when the save landed between a page's load and its mark", async () => {
    const world = await aWorld();
    const id = world.anId();
    world.plant({ id, isSent: true, revision: "1", updatedAt: SENT_AT });
    world.plant({ id, isSent: true, revision: "2", updatedAt: SENT_AT });

    const answer = await world.markSeen(id, "1");
    const seenAt = world.changes.heldSeenAt(id);
    world.plant({
      id,
      isSent: true,
      revision: "2",
      updatedAt: new Date((seenAt?.getTime() ?? 0) - ONE_MINUTE_MS),
    });
    const row = await world.listed(id);

    expect(answer).toMatchObject({ kind: "ok", changedAfterSeen: true });
    expect(row.isChangedSinceSeen).toBe(true);
    expect(row.seenAt?.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });

  it("tells the mark's own instant for a mark below the latest request, as the database does", async () => {
    const world = await aWorld();
    const id = world.anId();
    world.plant({
      id,
      isSent: true,
      revision: "4",
      updatedAt: SENT_AT,
      latestSubmissionRevision: "3",
    });
    world.reader.plantRequest({
      clientRequestId: "request00000000000001",
      designId: id,
      reference: "REF-request",
      createdAt: SENT_AT,
      designRevision: "3",
    });

    await world.markSeen(id, "1");
    const row = await world.listed(id);

    expect(row.isChangedSinceSeen).toBe(true);
    expect(row.seenAt).toEqual(world.changes.heldSeenAt(id));
  });

  it("tells the seen instant of an account's draft, which never reads as changed", async () => {
    const world = await aWorld();
    const id = world.anId();
    world.plant({ id, isSent: false, revision: "2", updatedAt: SENT_AT });

    await world.markSeen(id, "1");
    const row = await world.listed(id);

    expect(row.isChangedSinceSeen).toBe(false);
    expect(row.seenAt).toEqual(world.changes.heldSeenAt(id));
  });

  it("tells no seen instant for a kitchen nobody opened, and none for a mark above the kitchen's revision", async () => {
    const world = await aWorld();
    const unopened = world.anId();
    const marked = world.anId();
    world.plant({
      id: unopened,
      isSent: true,
      revision: "1",
      updatedAt: SENT_AT,
    });
    world.plant({
      id: marked,
      isSent: true,
      revision: "1",
      updatedAt: SENT_AT,
    });
    world.changes.plantSeenMark(marked, "9", "accountid000000000002");

    expect((await world.listed(unopened)).seenAt).toBeNull();
    expect((await world.listed(marked)).seenAt).toBeNull();
  });
});
