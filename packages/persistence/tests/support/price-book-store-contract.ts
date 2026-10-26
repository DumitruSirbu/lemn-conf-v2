import type { DraftChange } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  PRICE_VERSION_PAGE_SIZE,
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
  aNewItem,
  aNewItemPair,
  activationEntryFor,
  auditRecordOf,
  dashboardFailureOf,
  itemsSwitchedOffBetween,
  newestSequenceOf,
  publishNextVersion,
  publishRequestFor,
  publishedEntry,
} from "./dashboard-contract-support.js";
import type {
  DashboardStaffMember,
  DashboardStaffWorld,
} from "./dashboard-contract-support.js";

// These suites also run against a shared test database that earlier runs have written to (ADR 0151). They therefore
// assert what a step changed, from a read taken before it, and never what the table held to begin with. What only a
// table with no rows can promise is asserted in the fake's own test file.

export interface PriceBookWorld extends DashboardStaffWorld {
  readonly store: PriceBookStore;
  /** The log whose head a publish takes its compare-and-set on and writes its created items to. */
  readonly availability: CatalogueAvailabilityStore;
}

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
  describeReadingVersions(suiteName, newWorld);
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
  return world.store.publish(
    await publishRequestFor(world.store, world.availability, staff, {
      label: "November",
      note: "Prices for November.",
      changeSummary: [DEPTH_TO_40],
      ...overrides,
    }),
  );
}

async function draftRevisionOf(world: PriceBookWorld): Promise<string> {
  return (await world.store.readDraft()).draftRevision;
}

/** Everything a refused call must leave as it found it. */
async function stateOf(world: PriceBookWorld, staff: DashboardStaffMember) {
  return {
    draft: await world.store.readDraft(),
    active: await world.store.readActive(),
    versions: (await world.store.listVersions({ page: 1 })).total,
    availability: await world.availability.readCurrent(),
    audited: await world.auditEventsOf(staff.accountId),
  };
}

function describeReadingVersions(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
): void {
  describe(`${suiteName}: reading a version`, () => {
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
      const revisionBefore = await draftRevisionOf(world);

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
      expect(draft.draftRevision).not.toBe(revisionBefore);
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
      const stale = await draftRevisionOf(world);
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);

      const result = await writeDraft(world, staff, [ANCHOR_TO_5000], stale);

      expect(result).toBe(CHANGED_MEANWHILE);
      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("lets exactly one of two writes racing at one revision win", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const raced = await draftRevisionOf(world);

      const answers = await Promise.all([
        writeDraft(world, staff, [DEPTH_TO_40], raced),
        writeDraft(world, staff, [ANCHOR_TO_5000], raced),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it("writes nothing when no live session stands behind the call", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      const before = await stateOf(world, staff);

      await dashboardFailureOf(
        writeDraft(world, gone, [DEPTH_TO_40]),
        "not-recorded",
      );

      expect(await stateOf(world, staff)).toEqual(before);
      expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
    });

    it("refuses an audit entry that is not a draft entry, before it writes", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await stateOf(world, staff);

      await dashboardFailureOf(
        world.store.writeDraft({
          expectedDraftRevision: before.draft.draftRevision,
          changes: [DEPTH_TO_40],
          audit: auditRecordOf(
            staff,
            publishedEntry(),
          ) as unknown as DashboardAuditRecord,
        }),
        "invalid-request",
      );

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("refuses a write made against a revision ahead of the current one, which no write has produced", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);
      const oneAhead = await world.aRevisionAfter(
        before.draft.draftRevision,
        1,
      );

      for (const expectedDraftRevision of [oneAhead, WIDEST_REVISION]) {
        expect(
          await writeDraft(
            world,
            staff,
            [ANCHOR_TO_5000],
            expectedDraftRevision,
          ),
        ).toBe(CHANGED_MEANWHILE);
      }

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("refuses a draft revision that is not a revision's shape as an invalid request, before it writes", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);

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

      expect(await stateOf(world, staff)).toEqual(before);
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
    it("appends the next version as the active version, with the book as given, and writes the audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const newestBefore = await newestSequenceOf(world.store);

      const result = await publish(world, staff);

      expect(result).toEqual({
        kind: "ok",
        versionId: expect.any(String) as string,
        sequenceNumber: newestBefore + 1,
        availabilityRevision: (await world.availability.readCurrent()).revision,
      });
      expect(await world.store.readActive()).toMatchObject({
        kind: "found",
        version: {
          sequenceNumber: newestBefore + 1,
          label: "November",
          book: A_BOOK,
        },
      });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        {
          action: "price-published",
          designId: undefined,
          detail: {
            sequenceNumber: newestBefore + 1,
            changeCount: 1,
            provisional: true,
          },
        },
      ]);
    });

    it("records the sequence it inserted and the length of the summary it stored in the audit row, whatever a cast put there", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const newestBefore = await newestSequenceOf(world.store);
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
          detail: {
            provisional: false,
            sequenceNumber: newestBefore + 1,
            changeCount: 2,
          },
        },
      ]);
    });

    it("resets the draft to no changes at a revision it has not held before, so a revision read before the publish is stale", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const heldBefore = [await draftRevisionOf(world)];
      await writeDraft(world, staff, [DEPTH_TO_40]);
      heldBefore.push(await draftRevisionOf(world));

      await publish(world, staff);

      const after = await world.store.readDraft();
      expect(after.changes).toEqual([]);
      expect(heldBefore).not.toContain(after.draftRevision);
      for (const stale of heldBefore) {
        expect(await writeDraft(world, staff, [ANCHOR_TO_5000], stale)).toBe(
          CHANGED_MEANWHILE,
        );
      }
    });

    it("refuses a stale draft revision, appending nothing, leaving the draft and writing no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const stale = await draftRevisionOf(world);
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);

      const result = await publish(world, staff, {
        expectedDraftRevision: stale,
      });

      expect(result).toBe(CHANGED_MEANWHILE);
      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("refuses an expected active sequence that is not the newest: one behind it and one ahead of it alike", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await publishNextVersion(world.store, world.availability, staff);
      await publishNextVersion(world.store, world.availability, staff);
      const newest = await newestSequenceOf(world.store);
      const before = await stateOf(world, staff);

      for (const expectedActiveSequence of [
        newest - 2,
        newest - 1,
        newest + 1,
        newest + 2,
      ]) {
        const result = await publish(world, staff, { expectedActiveSequence });
        expect(result).toBe(CHANGED_MEANWHILE);
      }

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("lets exactly one of two publishes racing at one sequence win, leaving the other changed-meanwhile", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const versionsBefore = (await world.store.listVersions({ page: 1 }))
        .total;
      const request = await publishRequestFor(
        world.store,
        world.availability,
        staff,
        { label: "Race", note: "" },
      );

      const answers = await Promise.all([
        world.store.publish(request),
        world.store.publish(request),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      expect((await world.store.listVersions({ page: 1 })).total).toBe(
        versionsBefore + 1,
      );
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it.each([
      {
        refusal: "a stale draft revision",
        overrides: (facts: PublishFacts) => ({
          expectedDraftRevision: facts.staleDraftRevision,
        }),
      },
      {
        refusal: "an active sequence behind the newest",
        overrides: (facts: PublishFacts) => ({
          expectedActiveSequence: facts.newestSequence - 1,
        }),
      },
      {
        refusal: "an active sequence ahead of the newest",
        overrides: (facts: PublishFacts) => ({
          expectedActiveSequence: facts.newestSequence + 1,
        }),
      },
    ])(
      "moves nothing when it is refused for $refusal: not the availability head, no log row for a created item, not the draft, and no audit row",
      async ({ overrides }) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        await publishNextVersion(world.store, world.availability, staff);
        const staleDraftRevision = await draftRevisionOf(world);
        await writeDraft(world, staff, [DEPTH_TO_40]);
        await writeDraft(world, staff, [ANCHOR_TO_5000]);
        const newestSequence = await newestSequenceOf(world.store);
        const before = await stateOf(world, staff);

        const result = await publish(world, staff, {
          ...overrides({ staleDraftRevision, newestSequence }),
          createdItems: aNewItemPair(),
        });

        expect(result).toBe(CHANGED_MEANWHILE);
        expect(await stateOf(world, staff)).toEqual(before);
      },
    );

    it("refuses an availability revision ahead of the head, or the widest one there is, as a whole, writing nothing", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);
      const oneAhead = await world.aRevisionAfter(
        before.availability.revision,
        1,
      );

      for (const expectedAvailabilityRevision of [oneAhead, WIDEST_REVISION]) {
        expect(
          await publish(world, staff, {
            expectedAvailabilityRevision,
            createdItems: aNewItemPair(),
          }),
        ).toBe(AVAILABILITY_CHANGED_MEANWHILE);
      }

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("writes nothing when both the draft revision and the availability revision are stale, and answers one of the two refusals", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const staleDraftRevision = await draftRevisionOf(world);
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);
      const aheadOfHead = await world.aRevisionAfter(
        before.availability.revision,
        1,
      );

      const result = await publish(world, staff, {
        expectedDraftRevision: staleDraftRevision,
        expectedAvailabilityRevision: aheadOfHead,
        createdItems: aNewItemPair(),
      });

      expect([CHANGED_MEANWHILE, AVAILABILITY_CHANGED_MEANWHILE]).toContain(
        result,
      );
      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("lets a racing pair of publishes that create items move the head by the winner's items alone, and log each item once", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = await world.availability.readCurrent();
      const items = aNewItemPair();
      const request = await publishRequestFor(
        world.store,
        world.availability,
        staff,
        { createdItems: items, label: "Race", note: "" },
      );

      const answers = await Promise.all([
        world.store.publish(request),
        world.store.publish(request),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "changed-meanwhile",
        "ok",
      ]);
      const after = await world.availability.readCurrent();
      expect(after.revision).toBe(
        await world.aRevisionAfter(head.revision, items.length),
      );
      expect(itemsSwitchedOffBetween(head.disabled, after.disabled)).toEqual(
        itemsSwitchedOffBetween([], items),
      );
    });

    it("lets exactly one of a publish and an availability write racing at one head revision succeed, the head moved by whichever won", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const head = await world.availability.readCurrent();
      const [created] = aNewItemPair();
      const other = aNewItem("material");
      const request = await publishRequestFor(
        world.store,
        world.availability,
        staff,
        { createdItems: [created], label: "Race", note: "" },
      );

      const [published, switched] = await Promise.all([
        world.store.publish(request),
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
        await world.aRevisionAfter(head.revision, 1),
      );
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it("leaves the head, the log and the draft as they were when its audit entry is refused or no session stands behind it, though it creates items", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);

      await dashboardFailureOf(
        publish(world, staff, {
          createdItems: aNewItemPair(),
          audit: auditRecordOf(
            staff,
            DRAFT_CHANGED,
          ) as unknown as PublishAuditRecord,
        }),
        "invalid-request",
      );
      await dashboardFailureOf(
        publish(world, gone, { createdItems: aNewItemPair() }),
        "not-recorded",
      );

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("moves the availability head once for each created item, logging each switched off, and answers the head it left", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await world.availability.readCurrent();
      const items = aNewItemPair();
      const newestBefore = await newestSequenceOf(world.store);

      const result = await publish(world, staff, { createdItems: items });

      const afterFirst = await world.aRevisionAfter(before.revision, 1);
      const afterBoth = await world.aRevisionAfter(
        before.revision,
        items.length,
      );
      expect(result).toEqual({
        kind: "ok",
        versionId: expect.any(String) as string,
        sequenceNumber: newestBefore + 1,
        availabilityRevision: afterBoth,
      });
      const current = await world.availability.readCurrent();
      expect(current.revision).toBe(afterBoth);
      expect(
        itemsSwitchedOffBetween(before.disabled, current.disabled),
      ).toEqual(itemsSwitchedOffBetween([], items));
      const midway = await world.availability.readAt(afterFirst);
      expect(midway.kind).toBe("found");
      expect(
        midway.kind === "found"
          ? itemsSwitchedOffBetween(
              before.disabled,
              midway.availability.disabled,
            )
          : [],
      ).toEqual([items[0]]);
    });

    it("moves the availability head once, with no row in the log, when it creates no item", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await world.availability.readCurrent();
      const afterOne = await world.aRevisionAfter(before.revision, 1);

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

      await publish(world, staff, { createdItems: aNewItemPair() });

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
      const [first, second] = aNewItemPair();
      const stale = (await world.availability.readCurrent()).revision;
      const moved = await world.availability.setActive({
        item: first,
        active: false,
        expectedRevision: stale,
        audit: auditRecordOf(staff, activationEntryFor(first, false)),
      });
      if (moved.kind !== "ok") {
        throw new Error("the availability write was refused");
      }
      const before = await stateOf(world, staff);

      const result = await publish(world, staff, {
        expectedAvailabilityRevision: stale,
        createdItems: [second],
      });

      expect(result).toBe(AVAILABILITY_CHANGED_MEANWHILE);
      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("refuses an availability revision that is not a revision's shape and a created item that names nothing, before it writes", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await stateOf(world, staff);

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

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("appends nothing and leaves the draft when no live session stands behind the call", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      await writeDraft(world, staff, [DEPTH_TO_40]);
      const before = await stateOf(world, staff);

      await dashboardFailureOf(publish(world, gone), "not-recorded");

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("refuses a book that is not a JSON object and a change summary that is not a JSON array, appending nothing", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await stateOf(world, staff);

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

      expect(await stateOf(world, staff)).toEqual(before);
    });

    it("refuses an audit entry that is not a publish entry", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const before = await stateOf(world, staff);

      await dashboardFailureOf(
        publish(world, staff, {
          audit: auditRecordOf(
            staff,
            DRAFT_CHANGED,
          ) as unknown as PublishAuditRecord,
        }),
        "invalid-request",
      );

      expect(await stateOf(world, staff)).toEqual(before);
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

/** What a refused-publish arm read before it wrote, for the override that names the refusal. */
interface PublishFacts {
  readonly staleDraftRevision: string;
  readonly newestSequence: number;
}

function describeHistory(
  suiteName: string,
  newWorld: () => Promise<PriceBookWorld>,
) {
  describe(`${suiteName}: the versions`, () => {
    it("keeps every version, lists them newest first with only the newest active, and reads each whole", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const totalBefore = (await world.store.listVersions({ page: 1 })).total;
      const newestBefore = await newestSequenceOf(world.store);
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

      expect(page.total).toBe(totalBefore + 3);
      expect(
        page.versions
          .slice(0, 3)
          .map(({ sequenceNumber, label, state, changeCount }) => ({
            sequenceNumber,
            label,
            state,
            changeCount,
          })),
      ).toEqual([
        {
          sequenceNumber: newestBefore + 3,
          label: "Three",
          state: "active",
          changeCount: 2,
        },
        {
          sequenceNumber: newestBefore + 2,
          label: "Two",
          state: "archived",
          changeCount: 0,
        },
        {
          sequenceNumber: newestBefore + 1,
          label: "One",
          state: "archived",
          changeCount: 1,
        },
      ]);
      expect(await world.store.readVersion(first.versionId)).toMatchObject({
        kind: "found",
        version: {
          versionId: first.versionId,
          sequenceNumber: newestBefore + 1,
          label: "One",
          note: "First.",
          state: "archived",
          book: A_BOOK,
          changeSummary: [DEPTH_TO_40],
        },
      });
      expect(await world.store.readActive()).toMatchObject({
        kind: "found",
        version: {
          versionId: third.versionId,
          sequenceNumber: newestBefore + 3,
        },
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
      const { total } = await world.store.listVersions({ page: 1 });
      const pastTheLast = Math.ceil(total / PRICE_VERSION_PAGE_SIZE) + 1;

      const page = await world.store.listVersions({ page: pastTheLast });

      expect(page).toMatchObject({ total, page: pastTheLast, versions: [] });
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
