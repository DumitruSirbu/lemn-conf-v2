import { randomInt } from "node:crypto";

import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
  REQUEST_STATUSES,
  isDigestEligible,
} from "@lemnaria/configurator-domain";
import type { RequestStatus } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  ALREADY_CLAIMED,
  DISPLAYED_REVISION_AHEAD,
} from "../../src/m10-ports.js";
import type {
  DigestEligibleKitchen,
  KitchenChangeStore,
} from "../../src/m10-ports.js";
import {
  KITCHEN_SEEN,
  auditRecordOf,
  dashboardFailureOf,
} from "./dashboard-contract-support.js";
import type { DashboardStaffWorld } from "./dashboard-contract-support.js";

export interface ChangeKitchenSpec {
  /** Held by an account (`true`, the default) or a visitor's. */
  readonly hasAccount?: boolean;
  /** The first send's instant; absent for a draft never sent. */
  readonly sentAt?: Date;
  readonly isDeletedByClient?: boolean;
  /** The stored request status. */
  readonly status?: string;
  readonly kitchenName?: string;
  /** `accounts.name`. */
  readonly customerName?: string;
  /** No request is stored for the kitchen, as after a restore of the designs alone: no reference, no request revision. */
  readonly hasNoRequest?: boolean;
}

export interface PlantedChangeKitchen {
  readonly designId: string;
  /** The revision the kitchen was sent at, which is also its latest submission's. */
  readonly revision: string;
}

/**
 * What the contract needs around the store. A kitchen is made as a client saved and sent it (its revision and its
 * submission's agree, so it is not changed), and `saveKitchen` is that client saving again.
 */
export interface ChangeWorld extends DashboardStaffWorld {
  readonly store: KitchenChangeStore;
  aKitchen(spec: ChangeKitchenSpec): Promise<PlantedChangeKitchen>;
  /** The kitchen's revision after one more save. */
  saveKitchen(designId: string): Promise<string>;
  /**
   * The client sends the kitchen again: a second submission naming its current revision, so the kitchen has two. The
   * first send's instant stays.
   */
  resendKitchen(designId: string): Promise<void>;
  /** A revision greater than the kitchen's current one, which the kitchen has not reached: it is not saved. */
  aRevisionAheadOf(designId: string): Promise<string>;
  seenRevisionOf(designId: string): Promise<string | undefined>;
  /** The whole seen row: the revision, the account that set it and the instant it was set. */
  seenMarkOf(designId: string): Promise<SeenMark | undefined>;
  /**
   * Writes the kitchen's seen row around the store, as a holder of the application credential could: any revision, with
   * no audit row, and not held to the kitchen's own.
   */
  plantSeenMark(designId: string, revision: string): Promise<void>;
}

export interface SeenMark {
  readonly revision: string;
  readonly byAccountId: string;
  readonly atMs: number;
}

const NOW = new Date("2026-10-26T05:00:00.000Z");
const DAY_MS = 86_400_000;

/** The widest revision a `bigint` holds: a valid shape no kitchen has reached. */
const WIDEST_REVISION = "9223372036854775807";

/** The statuses the digest stops at, and every other status staff may set. */
const STATUSES_THAT_STOP: readonly string[] = DIGEST_STOPPING_STATUSES;
const STATUSES_THAT_CONTINUE: readonly string[] = REQUEST_STATUSES.filter(
  (status) => !STATUSES_THAT_STOP.includes(status),
);
const WHEN_SENT = new Date(NOW.getTime() - 2 * DAY_MS);

export function describeKitchenChangeStoreContract(
  suiteName: string,
  newWorld: () => Promise<ChangeWorld>,
): void {
  describeMarkSeen(suiteName, newWorld);
  describeClaimDigestDay(suiteName, newWorld);
  describeDigestEligibility(suiteName, newWorld);
  describeDigestAgreesWithTheDomain(suiteName, newWorld);
  describeRecordDigested(suiteName, newWorld);
}

function describeMarkSeen(
  suiteName: string,
  newWorld: () => Promise<ChangeWorld>,
): void {
  describe(`${suiteName}: markSeen`, () => {
    it("records the revision the page displayed, and its audit row naming the design, for the account of the session", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: saved,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toEqual({ kind: "ok", changedAfterSeen: false });
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(saved);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        { action: "kitchen-seen", designId: kitchen.designId, detail: {} },
      ]);
    });

    it("marks a kitchen an account holds and never sent as seen, and the digest never lists it", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({});
      const saved = await world.saveKitchen(kitchen.designId);

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: saved,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toEqual({ kind: "ok", changedAfterSeen: false });
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(saved);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        { action: "kitchen-seen", designId: kitchen.designId, detail: {} },
      ]);
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
      await world.saveKitchen(kitchen.designId);
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
    });

    it("answers changedAfterSeen false for a kitchen never sent even when the revision displayed is not the current one: it never shows the badge", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({});
      await world.saveKitchen(kitchen.designId);
      await world.saveKitchen(kitchen.designId);

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toEqual({ kind: "ok", changedAfterSeen: false });
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(
        kitchen.revision,
      );
    });

    it("records a displayed revision older than the current one as it is, so the badge stays on", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const current = await world.saveKitchen(kitchen.designId);

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toEqual({ kind: "ok", changedAfterSeen: true });
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(
        kitchen.revision,
      );
      expect(kitchen.revision).not.toBe(current);
    });

    it("answers changedAfterSeen false for the revision the kitchen was sent at, which no save has moved", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toEqual({ kind: "ok", changedAfterSeen: false });
    });

    it("answers for the seen revision the mark left stored: false at the current revision, true after a save and a stale mark that leaves the earlier revision, false once the newest is marked", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const answerOf = async (displayedRevision: string) => {
        const result = await world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });
        return result.kind === "ok" ? result.changedAfterSeen : result.kind;
      };
      const second = await world.saveKitchen(kitchen.designId);

      const atCurrent = await answerOf(second);
      const third = await world.saveKitchen(kitchen.designId);
      const staleAfterASave = await answerOf(kitchen.revision);
      const newest = await answerOf(third);

      expect([atCurrent, staleAfterASave, newest]).toEqual([
        false,
        true,
        false,
      ]);
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(third);
    });

    it("refuses a displayed revision ahead of the current one, writing no mark and no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const ahead = await world.aRevisionAheadOf(kitchen.designId);

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: ahead,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toBe(DISPLAYED_REVISION_AHEAD);
      expect(await world.seenRevisionOf(kitchen.designId)).toBeUndefined();
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it("answers not-found, with no mark and no audit row, for a kitchen its client deleted, a visitor's unsent draft, an unknown id and a malformed one", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const deleted = await world.aKitchen({
        sentAt: WHEN_SENT,
        isDeletedByClient: true,
      });
      const unsent = await world.aKitchen({ hasAccount: false });
      const absent = ["A".repeat(21), "not a design id"];

      for (const designId of [deleted.designId, unsent.designId, ...absent]) {
        const result = await world.store.markSeen({
          designId,
          displayedRevision: deleted.revision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });
        expect(result).toEqual({ kind: "not-found" });
      }

      expect(await world.seenRevisionOf(deleted.designId)).toBeUndefined();
      expect(await world.seenRevisionOf(unsent.designId)).toBeUndefined();
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it("refuses a displayed revision that is not a digit string of a revision's shape, before any write", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });

      for (const displayedRevision of [
        "0",
        "01",
        "1e3",
        " 1",
        "-1",
        "",
        "1\n",
        "9223372036854775808",
      ]) {
        await dashboardFailureOf(
          world.store.markSeen({
            designId: kitchen.designId,
            displayedRevision,
            audit: auditRecordOf(staff, KITCHEN_SEEN),
          }),
          "invalid-request",
        );
      }

      expect(await world.seenRevisionOf(kitchen.designId)).toBeUndefined();
    });

    it("refuses an audit entry that is not a seen entry", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });

      await dashboardFailureOf(
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision: kitchen.revision,
          audit: auditRecordOf(staff, {
            action: "price-catalogue-viewed",
            detail: { section: "history" },
          }),
        }),
        "invalid-request",
      );

      expect(await world.seenRevisionOf(kitchen.designId)).toBeUndefined();
    });

    it("writes no mark when no live session stands behind the call", async () => {
      const world = await newWorld();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });

      await dashboardFailureOf(
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision: kitchen.revision,
          audit: auditRecordOf(gone, KITCHEN_SEEN),
        }),
        "not-recorded",
      );

      expect(await world.seenRevisionOf(kitchen.designId)).toBeUndefined();
      expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
    });

    it("never lowers the seen revision: a stale page marking an older revision after a newer one was seen leaves the newer", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);
      const mark = (displayedRevision: string) =>
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });

      await mark(saved);
      const stale = await mark(kitchen.revision);

      expect(stale).toEqual({ kind: "ok", changedAfterSeen: false });
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(saved);
    });

    it("changes who saw the kitchen and when only for a displayed revision strictly greater than the one held", async () => {
      const world = await newWorld();
      const [first, second] = [
        await world.aStaffMember(),
        await world.aStaffMember(),
      ];
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);
      const newest = await world.saveKitchen(kitchen.designId);
      const mark = (staff: typeof first, displayedRevision: string) =>
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });

      await mark(first, saved);
      const firstMark = await world.seenMarkOf(kitchen.designId);
      await mark(second, saved);
      await mark(second, kitchen.revision);
      const afterEqualAndLower = await world.seenMarkOf(kitchen.designId);
      await mark(second, newest);
      const afterGreater = await world.seenMarkOf(kitchen.designId);

      expect(firstMark).toEqual({
        revision: saved,
        byAccountId: first.accountId,
        atMs: expect.any(Number) as number,
      });
      expect(afterEqualAndLower).toEqual(firstMark);
      expect(afterGreater?.revision).toBe(newest);
      expect(afterGreater?.byAccountId).toBe(second.accountId);
      expect(afterGreater?.atMs).toBeGreaterThan(firstMark?.atMs ?? 0);
    });

    it("writes the seen audit row for a stale mark that leaves the seen revision where it was, and for a mark of the revision already seen", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);
      const mark = (displayedRevision: string) =>
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });

      const answers = [
        await mark(saved),
        await mark(kitchen.revision),
        await mark(saved),
      ];

      expect(answers).toEqual([
        { kind: "ok", changedAfterSeen: false },
        { kind: "ok", changedAfterSeen: false },
        { kind: "ok", changedAfterSeen: false },
      ]);
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(saved);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(3);
    });

    it.each([
      { order: "older first", isNewerFirst: false },
      { order: "newer first", isNewerFirst: true },
    ])(
      "ends at the newer revision when two marks race, $order",
      async ({ isNewerFirst }) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
        const saved = await world.saveKitchen(kitchen.designId);
        const mark = (displayedRevision: string) =>
          world.store.markSeen({
            designId: kitchen.designId,
            displayedRevision,
            audit: auditRecordOf(staff, KITCHEN_SEEN),
          });

        const answers = await Promise.all(
          isNewerFirst
            ? [mark(saved), mark(kitchen.revision)]
            : [mark(kitchen.revision), mark(saved)],
        );

        // Whether each answer says "changed" depends on which upsert the database ran last, so only the kind is pinned.
        expect(answers.map((answer) => answer.kind)).toEqual(["ok", "ok"]);
        expect(await world.seenRevisionOf(kitchen.designId)).toBe(saved);
      },
    );

    it("leaves a kitchen neither changed nor held when a stale mark follows a mark of the digested revision, and lists it once it changes again", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const digested = await world.saveKitchen(kitchen.designId);
      const mark = (displayedRevision: string) =>
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });
      await mark(digested);
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      await world.store.recordDigested(dayKey, [
        { designId: kitchen.designId, revision: digested },
      ]);

      await mark(kitchen.revision);

      expect(await world.seenRevisionOf(kitchen.designId)).toBe(digested);
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
      await world.saveKitchen(kitchen.designId);
      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("takes a displayed revision of the widest shape for one ahead of the kitchen's, not for a malformed one", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });

      const result = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: WIDEST_REVISION,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(result).toBe(DISPLAYED_REVISION_AHEAD);
      expect(await world.seenRevisionOf(kitchen.designId)).toBeUndefined();
    });

    it("raises the seen revision when a later mark displays a newer one", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);
      const mark = (displayedRevision: string) =>
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });

      await mark(kitchen.revision);
      await mark(saved);

      expect(await world.seenRevisionOf(kitchen.designId)).toBe(saved);
    });
  });
}

function describeClaimDigestDay(
  suiteName: string,
  newWorld: () => Promise<ChangeWorld>,
): void {
  describe(`${suiteName}: claimDigestDay`, () => {
    it("claims a day once: the second claim of it is already-claimed", async () => {
      const world = await newWorld();
      const dayKey = aDayNobodyClaimed();

      const first = await world.store.claimDigestDay(dayKey);
      const second = await world.store.claimDigestDay(dayKey);

      expect(first).toEqual({ kind: "claimed", roundId: dayKey });
      expect(second).toBe(ALREADY_CLAIMED);
    });

    it("claims another day independently", async () => {
      const world = await newWorld();
      const [today, tomorrow] = [aDayNobodyClaimed(), aDayNobodyClaimed()];

      expect((await world.store.claimDigestDay(today)).kind).toBe("claimed");
      expect((await world.store.claimDigestDay(tomorrow)).kind).toBe("claimed");
    });

    it("lets exactly one of two claims racing for a day win it", async () => {
      const world = await newWorld();
      const dayKey = aDayNobodyClaimed();

      const answers = await Promise.all([
        world.store.claimDigestDay(dayKey),
        world.store.claimDigestDay(dayKey),
      ]);

      expect(answers.map((answer) => answer.kind).sort()).toEqual([
        "already-claimed",
        "claimed",
      ]);
    });

    it("refuses a day key that is not a calendar day as YYYY-MM-DD", async () => {
      const world = await newWorld();

      for (const dayKey of [
        "2026-13-01",
        "2026-02-30",
        "26-10-26",
        "2026-10-26T05:00",
        "",
        "today",
      ]) {
        await dashboardFailureOf(
          world.store.claimDigestDay(dayKey),
          "invalid-request",
        );
      }
    });
  });
}

function describeDigestEligibility(
  suiteName: string,
  newWorld: () => Promise<ChangeWorld>,
): void {
  describe(`${suiteName}: listDigestEligible`, () => {
    it("lists a kitchen sent within thirty days that changed since its submission, as the customer's name, else the request's reference, with nothing else", async () => {
      const world = await newWorld();
      const named = await world.aKitchen({
        sentAt: WHEN_SENT,
        kitchenName: "Bucatarie",
        customerName: "Ana Rusu",
      });
      const unnamed = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.saveKitchen(named.designId);
      await world.saveKitchen(unnamed.designId);

      const rows = await eligibleAmong(world, [named, unnamed]);

      expect(rows.map((row) => row.designId).sort()).toEqual(
        [named.designId, unnamed.designId].sort(),
      );
      const namedRow = rowOf(rows, named.designId);
      expect(namedRow).toMatchObject({
        customerName: "Ana Rusu",
        kitchenName: "Bucatarie",
      });
      expect(namedRow.sentAt).toEqual(WHEN_SENT);
      expect(Object.keys(namedRow).sort()).toEqual([
        "customerName",
        "designId",
        "kitchenName",
        "revision",
        "sentAt",
        "updatedAt",
      ]);
      const unnamedRow = rowOf(rows, unnamed.designId);
      expect(unnamedRow).toHaveProperty(
        "reference",
        expect.any(String) as string,
      );
      expect(unnamedRow).not.toHaveProperty("customerName");
      expect(unnamedRow).not.toHaveProperty("kitchenName");
    });

    it("names the revision and the update the kitchen has now, and the first send's instant after a second send", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const current = await world.saveKitchen(kitchen.designId);

      const rows = await eligibleAmong(world, [kitchen]);

      expect(rowOf(rows, kitchen.designId)).toMatchObject({
        revision: current,
        sentAt: WHEN_SENT,
        updatedAt: expect.any(Date) as Date,
      });
    });

    it("lists a kitchen sent twice once, and not at all while its latest submission is the revision it has", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.saveKitchen(kitchen.designId);
      await world.resendKitchen(kitchen.designId);
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);

      await world.saveKitchen(kitchen.designId);

      const rows = await eligibleAmong(world, [kitchen]);
      expect(rows.map((row) => row.designId)).toEqual([kitchen.designId]);
      expect(rowOf(rows, kitchen.designId).sentAt).toEqual(WHEN_SENT);
    });

    it("names a customer whose account name is blank by the request's reference", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "   ",
      });
      await world.saveKitchen(kitchen.designId);

      const row = rowOf(
        await eligibleAmong(world, [kitchen]),
        kitchen.designId,
      );

      expect(row).toHaveProperty("reference", expect.any(String) as string);
      expect(row).not.toHaveProperty("customerName");
    });

    it("prints the account name without the blanks around it", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "  Ana Rusu  ",
      });
      await world.saveKitchen(kitchen.designId);

      const row = rowOf(
        await eligibleAmong(world, [kitchen]),
        kitchen.designId,
      );

      expect(row).toMatchObject({ customerName: "Ana Rusu" });
    });

    it("strips only spaces from the account name, as `btrim` does: a tab around it stays and a tab alone is a name", async () => {
      const world = await newWorld();
      const tabbed = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "\tAna\t",
      });
      const tabOnly = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "\t",
      });
      await world.saveKitchen(tabbed.designId);
      await world.saveKitchen(tabOnly.designId);

      const rows = await eligibleAmong(world, [tabbed, tabOnly]);

      expect(rowOf(rows, tabbed.designId)).toMatchObject({
        customerName: "\tAna\t",
      });
      expect(rowOf(rows, tabOnly.designId)).toMatchObject({
        customerName: "\t",
      });
    });

    it.each([
      {
        start: "2026-03-20T12:00:00.000Z",
        crossing: "the spring clock change",
      },
      {
        start: "2026-10-10T12:00:00.000Z",
        crossing: "the autumn clock change",
      },
      { start: "2026-06-01T12:00:00.000Z", crossing: "no clock change" },
    ])(
      "holds the window at exactly 720 hours across $crossing: eligible a millisecond before, not at it, not after",
      async ({ start }) => {
        const world = await newWorld();
        const sentAt = new Date(start);
        const kitchen = await world.aKitchen({ sentAt });
        await world.saveKitchen(kitchen.designId);
        const edge = sentAt.getTime() + DIGEST_WINDOW_MS;

        const listedAt = async (instant: number) =>
          (await world.store.listDigestEligible(new Date(instant))).some(
            (row) => row.designId === kitchen.designId,
          );

        expect(await listedAt(edge - 1)).toBe(true);
        expect(await listedAt(edge)).toBe(false);
        expect(await listedAt(edge + 1)).toBe(false);
      },
    );

    it("stops at the statuses that stop it and at no other, and lists a kitchen with no stored status", async () => {
      const world = await newWorld();
      const byStatus = new Map<string | undefined, PlantedChangeKitchen>();
      for (const status of [
        undefined,
        ...STATUSES_THAT_CONTINUE,
        ...STATUSES_THAT_STOP,
      ]) {
        const kitchen = await world.aKitchen({
          sentAt: WHEN_SENT,
          ...(status === undefined ? {} : { status }),
        });
        await world.saveKitchen(kitchen.designId);
        byStatus.set(status, kitchen);
      }

      const listed = new Set(
        (await eligibleAmong(world, [...byStatus.values()])).map(
          (row) => row.designId,
        ),
      );

      for (const [status, kitchen] of byStatus) {
        const isStopped = STATUSES_THAT_STOP.includes(status ?? "");
        expect(listed.has(kitchen.designId), String(status)).toBe(!isStopped);
      }
    });

    it("names the customer by the account's name with its spaces trimmed, and by the reference when the name is blank", async () => {
      const world = await newWorld();
      const padded = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "  Ana Rusu  ",
      });
      const blank = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "   ",
      });
      const empty = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "",
      });
      for (const kitchen of [padded, blank, empty]) {
        await world.saveKitchen(kitchen.designId);
      }

      const rows = await eligibleAmong(world, [padded, blank, empty]);

      expect(rowOf(rows, padded.designId)).toMatchObject({
        customerName: "Ana Rusu",
      });
      for (const kitchen of [blank, empty]) {
        const row = rowOf(rows, kitchen.designId);
        expect(row).toHaveProperty("reference", expect.any(String) as string);
        expect(row).not.toHaveProperty("customerName");
      }
    });

    it("does not list a kitchen that has not changed since it was sent", async () => {
      const world = await newWorld();
      const unchanged = await world.aKitchen({ sentAt: WHEN_SENT });

      expect(await eligibleAmong(world, [unchanged])).toEqual([]);
    });

    it("stops listing a kitchen once a staff member has seen its current revision, and lists it again after it changes again", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);
      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: saved,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);

      await world.saveKitchen(kitchen.designId);

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("keeps a kitchen eligible until exactly thirty days after its first send and not at that instant", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.saveKitchen(kitchen.designId);
      const thirtyDaysAfter = new Date(WHEN_SENT.getTime() + DIGEST_WINDOW_MS);
      const justBefore = new Date(thirtyDaysAfter.getTime() - 1);

      const beforeIt = await world.store.listDigestEligible(justBefore);
      const atIt = await world.store.listDigestEligible(thirtyDaysAfter);

      expect(beforeIt.map((row) => row.designId)).toContain(kitchen.designId);
      expect(atIt.map((row) => row.designId)).not.toContain(kitchen.designId);
    });

    it.each([...STATUSES_THAT_STOP])(
      "does not list a kitchen whose request status is %s",
      async (status) => {
        const world = await newWorld();
        const kitchen = await world.aKitchen({ sentAt: WHEN_SENT, status });
        await world.saveKitchen(kitchen.designId);

        expect(await eligibleAmong(world, [kitchen])).toEqual([]);
      },
    );

    it.each([...STATUSES_THAT_CONTINUE])(
      "lists a kitchen whose request status is %s",
      async (status) => {
        const world = await newWorld();
        const kitchen = await world.aKitchen({ sentAt: WHEN_SENT, status });
        await world.saveKitchen(kitchen.designId);

        expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
      },
    );

    it("does not list a kitchen its client deleted, nor one never sent", async () => {
      const world = await newWorld();
      const deleted = await world.aKitchen({
        sentAt: WHEN_SENT,
        isDeletedByClient: true,
      });
      const unsent = await world.aKitchen({});
      await world.saveKitchen(deleted.designId);
      await world.saveKitchen(unsent.designId);

      expect(await eligibleAmong(world, [deleted, unsent])).toEqual([]);
    });

    it("refuses an instant that is not a valid date, before any statement", async () => {
      const world = await newWorld();

      for (const now of [
        new Date(Number.NaN),
        new Date(8.64e15),
        new Date("+010000-01-01T00:00:00.000Z"),
        new Date("-000001-12-31T23:59:59.999Z"),
      ]) {
        await dashboardFailureOf(
          world.store.listDigestEligible(now),
          "invalid-request",
        );
      }
    });

    it("refuses a mark by a client's session as not recorded, and records one by an operator's", async () => {
      const world = await newWorld();
      const client = await world.aClientWithALiveSession();
      const operator = await world.aStaffMemberWhoIsNotAnAdministrator();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const mark = (staff: typeof client) =>
        world.store.markSeen({
          designId: kitchen.designId,
          displayedRevision: kitchen.revision,
          audit: auditRecordOf(staff, KITCHEN_SEEN),
        });

      await dashboardFailureOf(mark(client), "not-recorded");
      expect(await world.seenRevisionOf(kitchen.designId)).toBeUndefined();
      expect(await world.auditEventsOf(client.accountId)).toEqual([]);

      expect((await mark(operator)).kind).toBe("ok");
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(
        kitchen.revision,
      );
    });

    it("ignores a seen row written above the kitchen's revision, which the store never writes: an unchanged kitchen stays unchanged", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.plantSeenMark(
        kitchen.designId,
        await world.aRevisionAfter(kitchen.revision, 1),
      );

      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
    });

    it("reads a seen row written at the kitchen's revision as a real mark: it hides the change until the next save", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const second = await world.saveKitchen(kitchen.designId);
      await world.plantSeenMark(kitchen.designId, second);
      const listed = async () =>
        (await eligibleAmong(world, [kitchen])).length === 1;

      const whileCurrent = await listed();
      await world.saveKitchen(kitchen.designId);
      const afterTheNextSave = await listed();

      expect([whileCurrent, afterTheNextSave]).toEqual([false, true]);
    });

    it("sent at revision 3, a first mark at revision 1 leaves it unchanged and out of the digest: the effective seen revision is the greater of the mark and the latest request's", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.saveKitchen(kitchen.designId);
      const third = await world.saveKitchen(kitchen.designId);
      await world.resendKitchen(kitchen.designId);

      const answer = await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(answer).toEqual({ kind: "ok", changedAfterSeen: false });
      expect(await world.seenRevisionOf(kitchen.designId)).toBe(
        kitchen.revision,
      );
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
      await world.saveKitchen(kitchen.designId);
      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
      expect(third).not.toBe(kitchen.revision);
    });

    it("lists a changed kitchen once even when an entry is recorded for a revision it has not reached: that entry holds nothing", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const current = await world.saveKitchen(kitchen.designId);
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);

      await world.store.recordDigested(dayKey, [
        {
          designId: kitchen.designId,
          revision: await world.aRevisionAfter(current, 3),
        },
      ]);

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("leaves out a kitchen with neither an account name nor a request reference, and still lists the others", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const nameless = await world.aKitchen({
        sentAt: WHEN_SENT,
        hasNoRequest: true,
      });
      const named = await world.aKitchen({
        sentAt: WHEN_SENT,
        customerName: "Ana Rusu",
      });
      await world.store.markSeen({
        designId: nameless.designId,
        displayedRevision: nameless.revision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });
      await world.saveKitchen(nameless.designId);
      await world.saveKitchen(named.designId);

      const rows = await eligibleAmong(world, [nameless, named]);

      expect(rows.map((row) => row.designId)).toEqual([named.designId]);
    });

    it("holds a digested revision against a stale first mark below the revision the kitchen was sent at", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.saveKitchen(kitchen.designId);
      await world.saveKitchen(kitchen.designId);
      await world.resendKitchen(kitchen.designId);
      const fourth = await world.saveKitchen(kitchen.designId);
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      await world.store.recordDigested(dayKey, [
        { designId: kitchen.designId, revision: fourth },
      ]);

      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: kitchen.revision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
    });

    it("does not touch the kitchen when its day is claimed: a send that fails leaves it eligible", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      await world.saveKitchen(kitchen.designId);

      await world.store.claimDigestDay(aDayNobodyClaimed());

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });
  });
}

type DigestedCell =
  | "absent"
  | "at-the-seen-revision"
  | "above-the-seen-revision"
  | "day-claimed-without-entries";

const DIGESTED_CELLS: readonly DigestedCell[] = [
  "absent",
  "at-the-seen-revision",
  "above-the-seen-revision",
  "day-claimed-without-entries",
];

/** The stored status of a cell: none stored, then each status staff may set. */
const STATUS_CELLS: readonly (string | undefined)[] = [
  undefined,
  ...REQUEST_STATUSES,
];

/** A clock change inside the window, then none: autumn 2026 for the first, spring 2026 for the second. */
const WINDOW_CELLS = [
  {
    name: "the autumn clock change",
    sentAt: new Date(NOW.getTime() - 30 * DAY_MS),
  },
  {
    name: "the spring clock change",
    sentAt: new Date("2026-03-20T12:00:00.000Z"),
  },
].flatMap(({ name, sentAt }) =>
  [-1, 0, 1].map((offsetMs) => ({
    name: `${name}, ${String(offsetMs)} ms from the edge`,
    sentAt,
    now: new Date(sentAt.getTime() + DIGEST_WINDOW_MS + offsetMs),
  })),
);

/**
 * S-d2: the membership of `listDigestEligible` equals the domain's `isDigestEligible` over a grid of cells (changed or
 * not, a digest entry absent, at, or above the seen revision, or only a claimed day; each status and none; the window's
 * edge across a clock change), and a client-deleted or never-sent kitchen is never listed. The two facts the domain
 * takes from SQL are known by how each cell was built, not read back, and the window and the statuses are the domain's
 * own constants, so a restated 720 hours or a restated pair of statuses cannot pass.
 */
function describeDigestAgreesWithTheDomain(
  suiteName: string,
  newWorld: () => Promise<ChangeWorld>,
): void {
  describe(`${suiteName}: listDigestEligible against the domain's isDigestEligible`, () => {
    it("lists a kitchen exactly when the domain judges it eligible, in every cell of changed, digested and status", async () => {
      const world = await newWorld();
      const cells = [];
      for (const isChanged of [false, true]) {
        for (const digested of DIGESTED_CELLS) {
          for (const status of STATUS_CELLS) {
            const kitchen = await world.aKitchen({
              sentAt: WHEN_SENT,
              ...(status === undefined ? {} : { status }),
            });
            if (isChanged) await world.saveKitchen(kitchen.designId);
            cells.push({ kitchen, isChanged, digested, status });
          }
        }
      }
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      const entries = [];
      for (const { kitchen, digested } of cells) {
        if (digested === "at-the-seen-revision") {
          entries.push({
            designId: kitchen.designId,
            revision: kitchen.revision,
          });
        }
        if (digested === "above-the-seen-revision") {
          entries.push({
            designId: kitchen.designId,
            revision: await world.aRevisionAfter(kitchen.revision, 1),
          });
        }
      }
      await world.store.recordDigested(dayKey, entries);

      const listed = new Set(
        (
          await eligibleAmong(
            world,
            cells.map((cell) => cell.kitchen),
          )
        ).map((row) => row.designId),
      );

      for (const { kitchen, isChanged, digested, status } of cells) {
        const expected = isDigestEligible({
          nowMs: NOW.getTime(),
          sentAtMs: WHEN_SENT.getTime(),
          status: (status ?? "new") as RequestStatus,
          isChangedSinceSeen: isChanged,
          isDigestedSinceSeen: digested === "above-the-seen-revision",
        });
        expect(
          listed.has(kitchen.designId),
          `${isChanged ? "changed" : "unchanged"}, ${digested}, ${String(status)}`,
        ).toBe(expected);
      }
      expect(listed.size).toBeGreaterThan(0);
      expect(listed.size).toBeLessThan(cells.length);
    }, 180_000);

    it("lists a kitchen exactly when the domain judges it eligible at the window's edge, a millisecond before it, at it and after it, across a clock change", async () => {
      const world = await newWorld();
      const cells = [];
      for (const cell of WINDOW_CELLS) {
        const kitchen = await world.aKitchen({ sentAt: cell.sentAt });
        await world.saveKitchen(kitchen.designId);
        cells.push({ ...cell, kitchen });
      }

      for (const { name, sentAt, now, kitchen } of cells) {
        const rows = await world.store.listDigestEligible(now);
        const expected = isDigestEligible({
          nowMs: now.getTime(),
          sentAtMs: sentAt.getTime(),
          status: "new",
          isChangedSinceSeen: true,
          isDigestedSinceSeen: false,
        });
        expect(
          rows.some((row) => row.designId === kitchen.designId),
          name,
        ).toBe(expected);
      }
      const verdicts = cells.map(({ now, sentAt }) =>
        isDigestEligible({
          nowMs: now.getTime(),
          sentAtMs: sentAt.getTime(),
          status: "new",
          isChangedSinceSeen: true,
          isDigestedSinceSeen: false,
        }),
      );
      expect(verdicts).toEqual([true, false, false, true, false, false]);
    }, 180_000);
  });
}

function describeRecordDigested(
  suiteName: string,
  newWorld: () => Promise<ChangeWorld>,
): void {
  describe(`${suiteName}: recordDigested`, () => {
    it("takes a kitchen out of the digest until a staff member has seen it and it changes again", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const saved = await world.saveKitchen(kitchen.designId);
      const claim = await world.store.claimDigestDay(aDayNobodyClaimed());
      if (claim.kind !== "claimed") throw new Error("the day was not claimed");

      await world.store.recordDigested(claim.roundId, [
        { designId: kitchen.designId, revision: saved },
      ]);
      const current = await world.saveKitchen(kitchen.designId);
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);

      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: current,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });
      await world.saveKitchen(kitchen.designId);

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("holds a digested revision against a stale seen mark: the mark below the entry does not send the revision again", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const staleRevision = await world.saveKitchen(kitchen.designId);
      const digestedRevision = await world.saveKitchen(kitchen.designId);
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      await world.store.recordDigested(dayKey, [
        { designId: kitchen.designId, revision: digestedRevision },
      ]);

      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: staleRevision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(await eligibleAmong(world, [kitchen])).toEqual([]);
    });

    it("lists a kitchen again once the staff have seen the revision it was digested at and it has changed since", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const digestedRevision = await world.saveKitchen(kitchen.designId);
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      await world.store.recordDigested(dayKey, [
        { designId: kitchen.designId, revision: digestedRevision },
      ]);
      await world.saveKitchen(kitchen.designId);
      expect(await eligibleAmong(world, [kitchen])).toEqual([]);

      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: digestedRevision,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("holds a kitchen only by an entry at a revision above the one seen: an entry below the seen revision, or another kitchen's entry, holds nothing", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const held = await world.aKitchen({ sentAt: WHEN_SENT });
      const other = await world.aKitchen({ sentAt: WHEN_SENT });
      const belowSeen = await world.saveKitchen(held.designId);
      const seen = await world.saveKitchen(held.designId);
      await world.saveKitchen(held.designId);
      await world.saveKitchen(other.designId);
      await world.store.markSeen({
        designId: held.designId,
        displayedRevision: seen,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);

      await world.store.recordDigested(dayKey, [
        { designId: held.designId, revision: belowSeen },
        { designId: other.designId, revision: other.revision },
      ]);

      const rows = await eligibleAmong(world, [held, other]);
      expect(rows.map((row) => row.designId).sort()).toEqual(
        [held.designId, other.designId].sort(),
      );
    });

    it("never changes an entry it holds: the same round naming the kitchen again, at a newer revision, holds nothing more", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const seen = await world.saveKitchen(kitchen.designId);
      const firstDigested = seen;
      const newer = await world.saveKitchen(kitchen.designId);
      await world.store.markSeen({
        designId: kitchen.designId,
        displayedRevision: seen,
        audit: auditRecordOf(staff, KITCHEN_SEEN),
      });
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      await world.store.recordDigested(dayKey, [
        { designId: kitchen.designId, revision: firstDigested },
      ]);

      await settle(
        world.store.recordDigested(dayKey, [
          { designId: kitchen.designId, revision: newer },
        ]),
      );

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("records no entries, which is a round with nothing to say", async () => {
      const world = await newWorld();
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);

      await expect(
        world.store.recordDigested(dayKey, []),
      ).resolves.toBeUndefined();
    });

    it("holds nothing for entries refused because their round was never claimed", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const current = await world.saveKitchen(kitchen.designId);

      await settle(
        world.store.recordDigested(aDayNobodyClaimed(), [
          { designId: kitchen.designId, revision: current },
        ]),
      );

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });

    it("refuses entries for a round that was never claimed", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });

      await expect(
        world.store.recordDigested(aDayNobodyClaimed(), [
          { designId: kitchen.designId, revision: kitchen.revision },
        ]),
      ).rejects.toThrow();
    });

    it("refuses an empty list for a round that was never claimed: no entry is not an answer about a day nobody claimed", async () => {
      const world = await newWorld();

      await dashboardFailureOf(
        world.store.recordDigested(aDayNobodyClaimed(), []),
        "invalid-request",
      );
    });

    it("refuses a round that is not a calendar day, and entries that are not a design's id and a revision's shape, recording none of the entries beside them", async () => {
      const world = await newWorld();
      const kitchen = await world.aKitchen({ sentAt: WHEN_SENT });
      const current = await world.saveKitchen(kitchen.designId);
      const dayKey = aDayNobodyClaimed();
      await world.store.claimDigestDay(dayKey);
      const wellFormed = { designId: kitchen.designId, revision: current };

      await dashboardFailureOf(
        world.store.recordDigested("2026-13-45", [wellFormed]),
        "invalid-request",
      );
      for (const entry of [
        { designId: "not a design id", revision: current },
        { designId: kitchen.designId, revision: "0" },
        { designId: kitchen.designId, revision: "01" },
        { designId: kitchen.designId, revision: "1e3" },
        { designId: kitchen.designId, revision: "9223372036854775808" },
        { designId: kitchen.designId, revision: "" },
      ]) {
        await dashboardFailureOf(
          world.store.recordDigested(dayKey, [wellFormed, entry]),
          "invalid-request",
        );
      }

      expect(await eligibleAmong(world, [kitchen])).toHaveLength(1);
    });
  });
}

/** Waits for a call that may be refused either by a rejection or by an answer. */
async function settle(pending: PromiseLike<unknown>): Promise<void> {
  try {
    await pending;
  } catch {
    // A refusal is one of the two ways to decline; what it must not do is write.
  }
}

async function eligibleAmong(
  world: ChangeWorld,
  kitchens: readonly PlantedChangeKitchen[],
): Promise<DigestEligibleKitchen[]> {
  const ours = new Set(kitchens.map((kitchen) => kitchen.designId));
  const rows = await world.store.listDigestEligible(NOW);
  return rows.filter((row) => ours.has(row.designId));
}

function rowOf(
  rows: readonly DigestEligibleKitchen[],
  designId: string,
): DigestEligibleKitchen {
  const row = rows.find((candidate) => candidate.designId === designId);
  if (row === undefined) throw new Error("the kitchen is not in the digest");
  return row;
}

const claimedDays = new Set<string>();

/**
 * A day key no other test, nor an earlier run against a shared database, has claimed: a random year from 3000 to 8999, a
 * random month and a day every month has, and never one this process has handed out. A real day is never claimed in
 * those years, and the rounds the application cannot delete stay in the database between runs.
 */
export function aDayNobodyClaimed(): string {
  for (;;) {
    const year = 3000 + randomInt(6000);
    const month = String(1 + randomInt(12)).padStart(2, "0");
    const day = String(1 + randomInt(28)).padStart(2, "0");
    const dayKey = `${String(year)}-${month}-${day}`;
    if (!claimedDays.has(dayKey)) {
      claimedDays.add(dayKey);
      return dayKey;
    }
  }
}
