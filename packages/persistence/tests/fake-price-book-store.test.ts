import type { DraftChange } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  INITIAL_REVISION,
  NO_ACTIVE_VERSION,
  PRICE_VERSION_PAGE_SIZE,
} from "../src/m10-ports.js";
import {
  A_BOOK,
  DRAFT_CHANGED,
  auditRecordOf,
  publishNextVersion,
  publishedEntry,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { describePriceBookStoreContract } from "./support/price-book-store-contract.js";
import type { PriceBookWorld } from "./support/price-book-store-contract.js";

/** The fake with the shared audit log behind it, as the contract's world. */
function newPriceBookWorld(): PriceBookWorld &
  ReturnType<typeof newFakeDashboardWorld> {
  const world = newFakeDashboardWorld();
  return { ...world, store: world.priceBook };
}

describePriceBookStoreContract("FakePriceBookStore", () =>
  Promise.resolve(newPriceBookWorld()),
);

describe("FakePriceBookStore, before anything is published (a table with no rows)", () => {
  it("has no active version, no history and an empty draft at the initial revision", async () => {
    const world = newPriceBookWorld();

    expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
    expect(await world.store.readDraft()).toEqual({
      draftRevision: INITIAL_REVISION,
      changes: [],
    });
    expect(await world.store.listVersions({ page: 1 })).toMatchObject({
      total: 0,
      page: 1,
      versions: [],
    });
  });

  it("appends version 1 to a publish that expects sequence 0 and the initial revisions", async () => {
    const world = newPriceBookWorld();
    const staff = await world.aStaffMember();

    const result = await world.store.publish({
      expectedDraftRevision: INITIAL_REVISION,
      expectedActiveSequence: 0,
      expectedAvailabilityRevision: INITIAL_REVISION,
      createdItems: [],
      label: "First",
      note: "",
      book: A_BOOK,
      changeSummary: [],
      audit: auditRecordOf(staff, publishedEntry()),
    });

    expect(result).toMatchObject({ kind: "ok", sequenceNumber: 1 });
  });
});

describe("FakePriceBookStore, beyond what the Neon store must also do", () => {
  it("pages the history by its page size, newest first, and no version is on two pages", async () => {
    const world = newPriceBookWorld();
    const staff = await world.aStaffMember();
    const published = PRICE_VERSION_PAGE_SIZE + 3;
    for (let version = 0; version < published; version += 1) {
      await publishNextVersion(world.store, world.availability, staff);
    }

    const first = await world.store.listVersions({ page: 1 });
    const second = await world.store.listVersions({ page: 2 });

    expect(first.pageSize).toBe(PRICE_VERSION_PAGE_SIZE);
    expect(first.versions).toHaveLength(PRICE_VERSION_PAGE_SIZE);
    expect(first.versions[0]?.sequenceNumber).toBe(published);
    expect(second.versions.map((version) => version.sequenceNumber)).toEqual([
      3, 2, 1,
    ]);
    expect(second.total).toBe(published);
  });

  it("knows the versions it holds, for the fakes that judge against them in the same turn", async () => {
    const world = newPriceBookWorld();

    const { versionId } = await publishNextVersion(
      world.store,
      world.availability,
      await world.aStaffMember(),
    );

    expect(world.priceBook.hasHeldVersion(versionId)).toBe(true);
    expect(world.priceBook.hasHeldVersion("A".repeat(21))).toBe(false);
  });

  it("advances the draft's revision with every publish, so a reader that reads the draft before the active version never holds an old version with the new draft's revision", async () => {
    const world = newPriceBookWorld();
    const staff = await world.aStaffMember();
    const revisions = [(await world.store.readDraft()).draftRevision];

    for (let version = 0; version < 3; version += 1) {
      await publishNextVersion(world.store, world.availability, staff);
      revisions.push((await world.store.readDraft()).draftRevision);
    }

    expect(new Set(revisions).size).toBe(revisions.length);
  });

  it("hands out a draft that is its own: changing what was given or what was read changes nothing held", async () => {
    const world = newPriceBookWorld();
    const staff = await world.aStaffMember();
    const depthTo40: DraftChange = {
      address: { kind: "depth-rule" },
      value: 40,
    };
    const given = [{ ...depthTo40 }];
    await world.store.writeDraft({
      expectedDraftRevision: INITIAL_REVISION,
      changes: given,
      audit: auditRecordOf(staff, DRAFT_CHANGED),
    });
    given[0] = { address: { kind: "depth-rule" }, value: 99 };

    const read = await world.store.readDraft();
    (read.changes as unknown[]).length = 0;

    expect((await world.store.readDraft()).changes).toEqual([depthTo40]);
  });
});
