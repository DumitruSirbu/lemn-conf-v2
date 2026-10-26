import type { DraftChange, ItemRef } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  INITIAL_REVISION,
  NO_ACTIVE_VERSION,
  VERSION_NOT_FOUND,
} from "../../src/m10-ports.js";
import type {
  CatalogueAvailabilityStore,
  DashboardAuditRecord,
  PriceBookStore,
  PublishAuditRecord,
  PublishPriceBookRequest,
} from "../../src/m10-ports.js";
import {
  A_BOOK,
  DRAFT_CHANGED,
  activationEntryFor,
  auditRecordOf,
  dashboardFailureOf,
  publishNextVersion,
  publishedEntry,
  sortedItems,
} from "./dashboard-contract-support.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
} from "./dashboard-contract-support.js";

export interface PriceBookWorld extends DashboardStaffWorld {
  readonly store: PriceBookStore;
  /** The log whose head a publish takes its compare-and-set on and writes its created items to. */
  readonly availability: CatalogueAvailabilityStore;
}

/** What a publish creates: a hardware class and a linked accessory. */
const CREATED_ITEMS: readonly [ItemRef, ItemRef] = [
  { kind: "hardware", tierId: "created-class" },
  { kind: "accessory", accessoryId: "created-light" },
];

/** The widest revision a `bigint` holds: a valid shape no head has reached. */
const WIDEST_REVISION = "9223372036854775807";

const DEPTH_TO_40: DraftChange = { address: { kind: "depth-rule" }, value: 40 };
const ANCHOR_TO_5000: DraftChange = {
  address: { kind: "cabinet", ruleId: "base-1-door", field: "anchorMinor" },
  value: 5000,
};

export function describePriceBookStoreContract(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
): void {
  describeNothingPublished(suiteName, newWorld);
  describeDraft(suiteName, newWorld);
  describePublish(suiteName, newWorld);
  describeHistory(suiteName, newWorld);
}

async function writeDraft(
  world: PriceBookWorld,
  staff: DashboardStaffMember,
  changes: readonly DraftChange[],
  expectedDraftRevision?: string,
) {
  return world.store.writeDraft({
    expectedDraftRevision:
      expectedDraftRevision ?? (await world.store.readDraft()).draftRevision,
    changes,
    audit: auditRecordOf(staff, DRAFT_CHANGED),
  });
}

/** A publish that is right in every respect but those `overrides` name. */
async function publish(
  world: PriceBookWorld,
  staff: DashboardStaffMember,
  overrides: Partial<PublishPriceBookRequest> = {},
) {
  const draft = await world.store.readDraft();
  const active = await world.store.readActive();
  const newest = active.kind === "found" ? active.version.sequenceNumber : 0;
  return world.store.publish({
    expectedDraftRevision: draft.draftRevision,
    expectedActiveSequence: newest,
    expectedAvailabilityRevision: (await world.availability.readCurrent())
      .revision,
    createdItems: [],
    label: "November",
    note: "Prices for November.",
    book: A_BOOK,
    changeSummary: [DEPTH_TO_40],
    audit: auditRecordOf(staff, publishedEntry()),
    ...overrides,
  });
}

function describeNothingPublished(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
): void {
  describe(`${suiteName}: before anything is published`, () => {
    it("has no active version, no history and an empty draft at the initial revision", async () => {
      const world = await newWorld();

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

    it("knows no version by an id it is handed, whatever the id", async () => {
      const world = await newWorld();

      for (const versionId of ["A".repeat(21), "", "not an id", "1"]) {
        expect(await world.store.readVersion(versionId)).toBe(
          VERSION_NOT_FOUND,
        );
      }
    });
  });
}

function describeDraft(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
) {
  describe(`${suiteName}: writeDraft`, () => {
    it("stores the changes as given, in order, at a new revision, and writes the audit row for the account of the session", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const result = await writeDraft(world, staff, [
        DEPTH_TO_40,
        ANCHOR_TO_5000,
      ]);

      expect(result).toEqual({
        kind: "ok",
        draftRevision: expect.any(String) as string,
      });
      const draft = await world.store.readDraft();
      expect(draft.changes).toEqual([DEPTH_TO_40, ANCHOR_TO_5000]);
      expect(draft.draftRevision).not.toBe(INITIAL_REVISION);
      expect(result.kind === "ok" && result.draftRevision).toBe(
        draft.draftRevision,
      );
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        {
          action: "price-draft-changed",
          designId: undefined,
          detail: { changeKind: "depth-rule" },
        },
      ]);
    });

    it("moves the revision on every write, so a revision a writer holds is only good for one", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const first = await writeDraft(world, staff, [DEPTH_TO_40]);
      const second = await writeDraft(world, staff, [DEPTH_TO_40]);

      expect(
        first.kind === "ok" &&
          second.kind === "ok" &&
          first.draftRevision !== second.draftRevision,
      ).toBe(true);
    });

    it("refuses a write made against a revision that is not current, changing nothing and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await world.store.readDraft();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      const stale = await writeDraft(
        world,
        staff,
        [ANCHOR_TO_5000],
        INITIAL_REVISION,
      );

      expect(stale).toBe(CHANGED_MEANWHILE);
      expect(await world.store.readDraft()).toEqual(before);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("lets exactly one of two writes racing at one revision win", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const answers = await Promise.all([
        writeDraft(world, staff, [DEPTH_TO_40], INITIAL_REVISION),
        writeDraft(world, staff, [ANCHOR_TO_5000], INITIAL_REVISION),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it("writes nothing when no live session stands behind the call", async () => {
      const world = await newWorld();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();

      await dashboardFailureOf(
        writeDraft(world, gone, [DEPTH_TO_40]),
        "not-recorded",
      );

      expect(await world.store.readDraft()).toEqual({
        draftRevision: INITIAL_REVISION,
        changes: [],
      });
      expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
    });

    it("refuses an audit entry that is not a draft entry, before it writes", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      await dashboardFailureOf(
        world.store.writeDraft({
          expectedDraftRevision: INITIAL_REVISION,
          changes: [DEPTH_TO_40],
          audit: auditRecordOf(
            staff,
            publishedEntry(),
          ) as unknown as DashboardAuditRecord,
        }),
        "invalid-request",
      );

      expect(await world.store.readDraft()).toEqual({
        draftRevision: INITIAL_REVISION,
        changes: [],
      });
    });

    it("refuses a write made against a revision ahead of the current one, which no write has produced", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await world.store.readDraft();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      for (const expectedDraftRevision of [
        String(BigInt(before.draftRevision) + 1n),
        WIDEST_REVISION,
      ]) {
        expect(
          await writeDraft(
            world,
            staff,
            [ANCHOR_TO_5000],
            expectedDraftRevision,
          ),
        ).toBe(CHANGED_MEANWHILE);
      }

      expect(await world.store.readDraft()).toEqual(before);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("refuses a draft revision that is not a revision's shape as an invalid request, before it writes", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await world.store.readDraft();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      for (const expectedDraftRevision of [
        "",
        "abc",
        "-1",
        "01",
        "1e3",
        "9223372036854775808",
      ]) {
        await dashboardFailureOf(
          writeDraft(world, staff, [ANCHOR_TO_5000], expectedDraftRevision),
          "invalid-request",
        );
        await dashboardFailureOf(
          publish(world, staff, { expectedDraftRevision }),
          "invalid-request",
        );
      }

      expect(await world.store.readDraft()).toEqual(before);
      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("can empty the draft, which is a write like another", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);

      const result = await writeDraft(world, staff, []);

      expect(result.kind).toBe("ok");
      expect((await world.store.readDraft()).changes).toEqual([]);
    });
  });
}

function describePublish(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
) {
  describe(`${suiteName}: publish`, () => {
    it("appends version 1 as the active version, with the book as given, and writes the audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const result = await publish(world, staff);

      expect(result).toEqual({
        kind: "ok",
        versionId: expect.any(String) as string,
        sequenceNumber: 1,
        availabilityRevision: (await world.availability.readCurrent()).revision,
      });
      const active = await world.store.readActive();
      expect(active).toMatchObject({
        kind: "found",
        version: { sequenceNumber: 1, label: "November", book: A_BOOK },
      });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        {
          action: "price-published",
          designId: undefined,
          detail: { sequenceNumber: 1, changeCount: 1, provisional: true },
        },
      ]);
    });

    it("records the sequence it inserted and the length of the summary it stored in the audit row, whatever a cast put there", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const forged = {
        session: staff.session,
        entry: {
          action: "price-published",
          detail: { provisional: false, sequenceNumber: 99, changeCount: 7 },
        },
      } as unknown as PublishAuditRecord;

      const result = await publish(world, staff, {
        audit: forged,
        changeSummary: [DEPTH_TO_40, ANCHOR_TO_5000],
      });

      expect(result.kind).toBe("ok");
      const stored = await world.store.readVersion(
        result.kind === "ok" ? result.versionId : "",
      );
      expect(stored).toMatchObject({
        kind: "found",
        version: { changeSummary: [DEPTH_TO_40, ANCHOR_TO_5000] },
      });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        {
          action: "price-published",
          designId: undefined,
          detail: { provisional: false, sequenceNumber: 1, changeCount: 2 },
        },
      ]);
    });

    it("resets the draft to no changes at a revision it has not held before, so a revision read before the publish is stale", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const beforePublish = await world.store.readDraft();

      await publish(world, staff);

      const after = await world.store.readDraft();
      expect(after.changes).toEqual([]);
      expect(after.draftRevision).not.toBe(beforePublish.draftRevision);
      expect(after.draftRevision).not.toBe(INITIAL_REVISION);
      expect(
        await writeDraft(
          world,
          staff,
          [ANCHOR_TO_5000],
          beforePublish.draftRevision,
        ),
      ).toBe(CHANGED_MEANWHILE);
      expect(
        await writeDraft(world, staff, [ANCHOR_TO_5000], INITIAL_REVISION),
      ).toBe(CHANGED_MEANWHILE);
    });

    it("refuses a stale draft revision, appending nothing, leaving the draft and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const draft = await world.store.readDraft();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      const result = await publish(world, staff, {
        expectedDraftRevision: INITIAL_REVISION,
      });

      expect(result).toBe(CHANGED_MEANWHILE);
      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
      expect(await world.store.readDraft()).toEqual(draft);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("refuses an expected active sequence that is not the newest: one behind it and one ahead of it alike", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, staff);
      await publishNextVersion(world.store, world.availability, staff);

      for (const expectedActiveSequence of [0, 1, 3, 4]) {
        const result = await publish(world, staff, {
          expectedActiveSequence,
          audit: auditRecordOf(staff, publishedEntry()),
        });
        expect(result).toBe(CHANGED_MEANWHILE);
      }

      expect((await world.store.listVersions({ page: 1 })).total).toBe(2);
    });

    it("lets exactly one of two publishes racing at one sequence win, leaving the other changed-meanwhile", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const request = {
        expectedDraftRevision: INITIAL_REVISION,
        expectedActiveSequence: 0,
        expectedAvailabilityRevision: INITIAL_REVISION,
        createdItems: [],
        label: "Race",
        note: "",
        book: A_BOOK,
        changeSummary: [],
        audit: auditRecordOf(staff, publishedEntry()),
      };

      const answers = await Promise.all([
        world.store.publish(request),
        world.store.publish(request),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      expect((await world.store.listVersions({ page: 1 })).total).toBe(1);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it.each([
      {
        refusal: "a stale draft revision",
        overrides: { expectedDraftRevision: INITIAL_REVISION },
        answer: CHANGED_MEANWHILE,
      },
      {
        refusal: "an active sequence behind the newest",
        overrides: { expectedActiveSequence: 0 },
        answer: CHANGED_MEANWHILE,
      },
      {
        refusal: "an active sequence ahead of the newest",
        overrides: { expectedActiveSequence: 2 },
        answer: CHANGED_MEANWHILE,
      },
    ])(
      "moves nothing when it is refused for $refusal: not the availability head, no log row for a created item, not the draft, and no audit row",
      async ({ overrides, answer }) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        await publishNextVersion(world.store, world.availability, staff);
        await writeDraft(world, staff, [DEPTH_TO_40]);
        await writeDraft(world, staff, [ANCHOR_TO_5000]);
        const head = await world.availability.readCurrent();
        const draft = await world.store.readDraft();
        const active = await world.store.readActive();
        const auditedBefore = await world.auditEventsOf(staff.accountId);

        const result = await publish(world, staff, {
          ...overrides,
          createdItems: CREATED_ITEMS,
        });

        expect(result).toBe(answer);
        expect(await world.availability.readCurrent()).toEqual(head);
        expect(await world.store.readDraft()).toEqual(draft);
        expect(await world.store.readActive()).toEqual(active);
        expect(await world.auditEventsOf(staff.accountId)).toEqual(
          auditedBefore,
        );
      },
    );

    it("refuses an availability revision ahead of the head, or the widest one there is, as a whole, writing nothing", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const head = await world.availability.readCurrent();
      const draft = await world.store.readDraft();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      for (const expectedAvailabilityRevision of [
        String(BigInt(head.revision) + 1n),
        WIDEST_REVISION,
      ]) {
        expect(
          await publish(world, staff, {
            expectedAvailabilityRevision,
            createdItems: CREATED_ITEMS,
          }),
        ).toBe(AVAILABILITY_CHANGED_MEANWHILE);
      }

      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
      expect(await world.store.readDraft()).toEqual(draft);
      expect(await world.availability.readCurrent()).toEqual(head);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("writes nothing when both the draft revision and the availability revision are stale, and answers one of the two refusals", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const head = await world.availability.readCurrent();
      const draft = await world.store.readDraft();
      const auditedBefore = await world.auditEventsOf(staff.accountId);
      const aheadOfHead = String(BigInt(head.revision) + 1n);

      const result = await publish(world, staff, {
        expectedDraftRevision: INITIAL_REVISION,
        expectedAvailabilityRevision: aheadOfHead,
        createdItems: CREATED_ITEMS,
      });

      expect([CHANGED_MEANWHILE, AVAILABILITY_CHANGED_MEANWHILE]).toContain(
        result,
      );
      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
      expect(await world.store.readDraft()).toEqual(draft);
      expect(await world.availability.readCurrent()).toEqual(head);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("lets a racing pair of publishes that create items move the head by the winner's items alone, and log each item once", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = await world.availability.readCurrent();
      const request = {
        expectedDraftRevision: INITIAL_REVISION,
        expectedActiveSequence: 0,
        expectedAvailabilityRevision: head.revision,
        createdItems: CREATED_ITEMS,
        label: "Race",
        note: "",
        book: A_BOOK,
        changeSummary: [],
        audit: auditRecordOf(staff, publishedEntry()),
      };

      const answers = await Promise.all([
        world.store.publish(request),
        world.store.publish(request),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      const after = await world.availability.readCurrent();
      expect(after.revision).toBe(String(BigInt(head.revision) + 2n));
      expect(sortedItems(after.disabled)).toEqual(sortedItems(CREATED_ITEMS));
    });

    it("lets exactly one of a publish and an availability write racing at one head revision succeed, the head moved by whichever won", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = await world.availability.readCurrent();
      const [created] = CREATED_ITEMS;
      const other: ItemRef = { kind: "material", tierId: "mdf" };

      const [published, switched] = await Promise.all([
        world.store.publish({
          expectedDraftRevision: INITIAL_REVISION,
          expectedActiveSequence: 0,
          expectedAvailabilityRevision: head.revision,
          createdItems: [created],
          label: "Race",
          note: "",
          book: A_BOOK,
          changeSummary: [],
          audit: auditRecordOf(staff, publishedEntry()),
        }),
        world.availability.setActive({
          item: other,
          active: false,
          expectedRevision: head.revision,
          audit: auditRecordOf(staff, activationEntryFor(other, false)),
        }),
      ]);

      expect(
        [published.kind === "ok", switched.kind === "ok"].filter(Boolean),
      ).toHaveLength(1);
      expect((await world.availability.readCurrent()).revision).toBe(
        String(BigInt(head.revision) + 1n),
      );
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it("leaves the head, the log and the draft as they were when its audit entry is refused or no session stands behind it, though it creates items", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const head = await world.availability.readCurrent();
      const draft = await world.store.readDraft();

      await dashboardFailureOf(
        publish(world, staff, {
          createdItems: CREATED_ITEMS,
          audit: auditRecordOf(
            staff,
            DRAFT_CHANGED,
          ) as unknown as PublishAuditRecord,
        }),
        "invalid-request",
      );
      await dashboardFailureOf(
        publish(world, gone, { createdItems: CREATED_ITEMS }),
        "not-recorded",
      );

      expect(await world.availability.readCurrent()).toEqual(head);
      expect(await world.store.readDraft()).toEqual(draft);
      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
    });

    it("moves the availability head once for each created item, logging each switched off, and answers the head it left", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await world.availability.readCurrent();

      const result = await publish(world, staff, {
        createdItems: CREATED_ITEMS,
      });

      const afterFirst = String(BigInt(before.revision) + 1n);
      const afterBoth = String(BigInt(before.revision) + 2n);
      expect(result).toEqual({
        kind: "ok",
        versionId: expect.any(String) as string,
        sequenceNumber: 1,
        availabilityRevision: afterBoth,
      });
      const current = await world.availability.readCurrent();
      expect(current.revision).toBe(afterBoth);
      expect(sortedItems(current.disabled)).toEqual(sortedItems(CREATED_ITEMS));
      expect(await world.availability.readAt(afterFirst)).toMatchObject({
        kind: "found",
        availability: { disabled: [CREATED_ITEMS[0]] },
      });
    });

    it("moves the availability head once, with no row in the log, when it creates no item", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await world.availability.readCurrent();
      const afterOne = String(BigInt(before.revision) + 1n);

      const result = await publish(world, staff);

      expect(result).toMatchObject({
        kind: "ok",
        availabilityRevision: afterOne,
      });
      expect(await world.availability.readCurrent()).toEqual({
        revision: afterOne,
        disabled: before.disabled,
      });
    });

    it("writes the one publish audit row and no activation row for the items it creates", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      await publish(world, staff, { createdItems: CREATED_ITEMS });

      expect(
        (await world.auditEventsOf(staff.accountId)).map(
          (event) => event.action,
        ),
      ).toEqual(["price-published"]);
    });

    it("refuses a stale availability revision as a whole: no version, no log row, the draft and the head as they were, and no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const [first, second] = CREATED_ITEMS;
      const moved = await world.availability.setActive({
        item: first,
        active: false,
        expectedRevision: INITIAL_REVISION,
        audit: auditRecordOf(staff, activationEntryFor(first, false)),
      });
      if (moved.kind !== "ok") {
        throw new Error("the availability write was refused");
      }
      const draft = await world.store.readDraft();
      const head = await world.availability.readCurrent();
      const auditedBefore = await world.auditEventsOf(staff.accountId);

      const result = await publish(world, staff, {
        expectedAvailabilityRevision: INITIAL_REVISION,
        createdItems: [second],
      });

      expect(result).toBe(AVAILABILITY_CHANGED_MEANWHILE);
      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
      expect(await world.store.readDraft()).toEqual(draft);
      expect(await world.availability.readCurrent()).toEqual(head);
      expect(await world.auditEventsOf(staff.accountId)).toEqual(auditedBefore);
    });

    it("refuses an availability revision that is not a revision's shape and a created item that names nothing, before it writes", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      await dashboardFailureOf(
        publish(world, staff, { expectedAvailabilityRevision: "01" }),
        "invalid-request",
      );
      await dashboardFailureOf(
        publish(world, staff, {
          createdItems: [{ kind: "hardware", tierId: "" }],
        }),
        "invalid-request",
      );

      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
    });

    it("appends nothing and leaves the draft when no live session stands behind the call", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const draft = await world.store.readDraft();

      await dashboardFailureOf(publish(world, gone), "not-recorded");

      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
      expect(await world.store.readDraft()).toEqual(draft);
    });

    it("refuses a book that is not a JSON object and a change summary that is not a JSON array, appending nothing", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      for (const book of ["a book", 4, [], undefined]) {
        await dashboardFailureOf(
          publish(world, staff, { book }),
          "invalid-request",
        );
      }
      await dashboardFailureOf(
        publish(world, staff, { changeSummary: { count: 1 } }),
        "invalid-request",
      );

      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
    });

    it("refuses an audit entry that is not a publish entry", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      await dashboardFailureOf(
        publish(world, staff, {
          audit: auditRecordOf(
            staff,
            DRAFT_CHANGED,
          ) as unknown as PublishAuditRecord,
        }),
        "invalid-request",
      );

      expect(await world.store.readActive()).toBe(NO_ACTIVE_VERSION);
    });

    it("hands out a book that is its own, so changing what was read or what was given changes no version", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const given = { version: "given", nested: { rate: 1 } };
      const result = await publish(world, staff, { book: given });
      if (result.kind !== "ok") throw new Error("the publish was refused");
      given.nested.rate = 2;

      const read = await world.store.readVersion(result.versionId);
      if (read.kind !== "found") throw new Error("the version is not there");
      (read.version.book as typeof given).nested.rate = 3;

      const again = await world.store.readVersion(result.versionId);
      expect(again).toMatchObject({
        version: { book: { version: "given", nested: { rate: 1 } } },
      });
    });
  });
}

function describeHistory(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
) {
  describe(`${suiteName}: the versions`, () => {
    it("keeps every version, lists them newest first with only the newest active, and reads each whole", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const first = await publish(world, staff, {
        label: "One",
        note: "First.",
        changeSummary: [DEPTH_TO_40],
      });
      const second = await publish(world, staff, {
        label: "Two",
        note: "Second.",
        changeSummary: [],
      });
      const third = await publish(world, staff, {
        label: "Three",
        note: "Third.",
        changeSummary: [DEPTH_TO_40, ANCHOR_TO_5000],
      });
      if (first.kind !== "ok" || second.kind !== "ok" || third.kind !== "ok") {
        throw new Error("a publish was refused");
      }

      const page = await world.store.listVersions({ page: 1 });

      expect(page.total).toBe(3);
      expect(
        page.versions.map(({ sequenceNumber, label, state, changeCount }) => ({
          sequenceNumber,
          label,
          state,
          changeCount,
        })),
      ).toEqual([
        { sequenceNumber: 3, label: "Three", state: "active", changeCount: 2 },
        { sequenceNumber: 2, label: "Two", state: "archived", changeCount: 0 },
        { sequenceNumber: 1, label: "One", state: "archived", changeCount: 1 },
      ]);
      expect(await world.store.readVersion(first.versionId)).toMatchObject({
        kind: "found",
        version: {
          versionId: first.versionId,
          sequenceNumber: 1,
          label: "One",
          note: "First.",
          state: "archived",
          book: A_BOOK,
          changeSummary: [DEPTH_TO_40],
        },
      });
      expect(await world.store.readActive()).toMatchObject({
        kind: "found",
        version: { versionId: third.versionId, sequenceNumber: 3 },
      });
    });

    it("stores the change summary as the published changes with their group ids, and counts them", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const summary = [
        { ...ANCHOR_TO_5000, groupId: "group-1" },
        {
          address: { kind: "hardware-tier-created", tierId: "created-class" },
          value: { name: "Clasa noua", description: "O clasa." },
        },
        { address: { kind: "provisional" }, value: false },
      ];

      const result = await publish(world, staff, { changeSummary: summary });
      if (result.kind !== "ok") throw new Error("the publish was refused");

      expect(await world.store.readVersion(result.versionId)).toMatchObject({
        version: { changeSummary: summary },
      });
      expect(
        (await world.store.listVersions({ page: 1 })).versions[0],
      ).toMatchObject({ changeCount: 3 });
    });

    it("lists a page past the last as no versions, with the same total", async () => {
      const world = await newWorld();
      await publishNextVersion(
        world.store,
        world.availability,
        await world.aStaffMember(),
      );

      const page = await world.store.listVersions({ page: 1_000 });

      expect(page).toMatchObject({ total: 1, page: 1_000, versions: [] });
    });

    it("refuses a page that is not a whole number from 1", async () => {
      const world = await newWorld();

      for (const page of [0, -1, 1.5, Number.NaN]) {
        await dashboardFailureOf(
          world.store.listVersions({ page }),
          "invalid-request",
        );
      }
    });
  });
}
