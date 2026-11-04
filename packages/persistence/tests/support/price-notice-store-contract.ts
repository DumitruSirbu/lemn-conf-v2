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
  aNewItem,
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

    it("refuses a version id that is not a version id's shape, for a first open and for an acknowledgement, writing nothing", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const pair = await currentPair(world);
      const malformed = { ...pair, versionId: "not a version id" };

      await dashboardFailureOf(
        world.store.recordIfAbsent(designId, malformed),
        "invalid-request",
      );
      await dashboardFailureOf(
        world.store.recordAcknowledged(designId, malformed),
        "invalid-request",
      );

      expect(await world.store.readAcknowledged(designId)).toBe(NEVER_RECORDED);
    });
  });

  describe(`${suiteName}: the pair is stored whole`, () => {
    it("moves the revision alone when an acknowledgement keeps the version", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const { versionId } = await currentPair(world);
      const head = await switchOneItemOff(world, await world.aStaffMember());
      expect(head).not.toBe(INITIAL_REVISION);
      await world.store.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: INITIAL_REVISION,
      });

      await world.store.recordAcknowledged(designId, {
        versionId,
        availabilityRevision: head,
      });

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: { versionId, availabilityRevision: head },
      });
    });

    it("moves the version alone when an acknowledgement keeps the revision", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const first = await currentPair(world);
      const second = await publishNextVersion(
        world.priceBook,
        world.availability,
        await world.aStaffMember(),
      );
      expect(second.versionId).not.toBe(first.versionId);
      await world.store.recordAcknowledged(designId, {
        versionId: first.versionId,
        availabilityRevision: INITIAL_REVISION,
      });

      await world.store.recordAcknowledged(designId, {
        versionId: second.versionId,
        availabilityRevision: INITIAL_REVISION,
      });

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: {
          versionId: second.versionId,
          availabilityRevision: INITIAL_REVISION,
        },
      });
    });

    it("keeps the last acknowledgement even when it is the older pair: there is no ordering of acknowledgements", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const older = await currentPair(world);
      const newerVersion = await publishNextVersion(
        world.priceBook,
        world.availability,
        await world.aStaffMember(),
      );
      const head = await switchOneItemOff(world, await world.aStaffMember());
      const newer = {
        versionId: newerVersion.versionId,
        availabilityRevision: head,
      };
      const olderPair = {
        versionId: older.versionId,
        availabilityRevision: INITIAL_REVISION,
      };
      await world.store.recordAcknowledged(designId, newer);

      expect(await world.store.recordAcknowledged(designId, olderPair)).toEqual(
        { kind: "ok" },
      );

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: olderPair,
      });
    });

    it("answers ok again for the same acknowledgement, and the marker is unchanged", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const pair = await currentPair(world);

      const results = [
        await world.store.recordAcknowledged(designId, pair),
        await world.store.recordAcknowledged(designId, pair),
      ];

      expect(results).toEqual([{ kind: "ok" }, { kind: "ok" }]);
      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: pair,
      });
    });

    it("leaves another design's marker alone when one design is acknowledged", async () => {
      const world = await newWorld();
      const [acknowledged, bystander] = [
        await world.aDesignId(),
        await world.aDesignId(),
      ];
      const pair = await currentPair(world);
      await world.store.recordIfAbsent(bystander, pair);
      const head = await switchOneItemOff(world, await world.aStaffMember());

      await world.store.recordAcknowledged(acknowledged, {
        versionId: pair.versionId,
        availabilityRevision: head,
      });

      expect(await world.store.readAcknowledged(bystander)).toEqual({
        kind: "recorded",
        acknowledged: pair,
      });
    });

    it("ends at exactly one of two racing acknowledgements, never at a version of one and a revision of the other", async () => {
      const world = await newWorld();
      const first = await currentPair(world);
      const second = await publishNextVersion(
        world.priceBook,
        world.availability,
        await world.aStaffMember(),
      );
      const head = await switchOneItemOff(world, await world.aStaffMember());
      const pairA = {
        versionId: first.versionId,
        availabilityRevision: INITIAL_REVISION,
      };
      const pairB = { versionId: second.versionId, availabilityRevision: head };

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const designId = await world.aDesignId();
        if (attempt % 2 === 1)
          await world.store.recordIfAbsent(designId, pairA);
        const results = await Promise.all([
          world.store.recordAcknowledged(designId, pairA),
          world.store.recordAcknowledged(designId, pairB),
        ]);

        expect(results).toEqual([{ kind: "ok" }, { kind: "ok" }]);
        const read = await world.store.readAcknowledged(designId);
        expect([
          { kind: "recorded", acknowledged: pairA },
          { kind: "recorded", acknowledged: pairB },
        ]).toContainEqual(read);
      }
    });

    it("holds a marker the caller can no longer change through the pair it passed or the one it read", async () => {
      const world = await newWorld();
      const designId = await world.aDesignId();
      const pair = { ...(await currentPair(world)) };
      await world.store.recordIfAbsent(designId, pair);

      (pair as { versionId: string }).versionId = "B".repeat(21);
      const read = await world.store.readAcknowledged(designId);
      if (read.kind !== "recorded") throw new Error("the marker was not read");
      (read.acknowledged as { versionId: string }).versionId = "C".repeat(21);

      const again = await world.store.readAcknowledged(designId);
      expect(
        again.kind === "recorded" && again.acknowledged.versionId,
      ).not.toBe("B".repeat(21));
      expect(
        again.kind === "recorded" && again.acknowledged.versionId,
      ).not.toBe("C".repeat(21));
    });
  });

  describe(`${suiteName}: the edges of what a pair and a design id may be`, () => {
    const REVISIONS_REFUSED = [
      "",
      " ",
      "-1",
      "-0",
      "+1",
      " 1",
      "1 ",
      "1\n",
      "1e3",
      "1.0",
      "0x1",
      "00",
      "01",
      "9223372036854775808",
      "10000000000000000000",
      "99999999999999999999",
      "٣",
      "１",
    ];
    const IDS_REFUSED = [
      "",
      "A".repeat(20),
      "A".repeat(22),
      `${"A".repeat(20)}\n`,
      `${"A".repeat(20)} `,
      `${"A".repeat(20)}é`,
      `${"A".repeat(20)}١`,
      `${"A".repeat(20)}.`,
      `${"A".repeat(20)}/`,
    ];

    it.each(REVISIONS_REFUSED)(
      "refuses the revision %j for a first open and for an acknowledgement, writing nothing",
      async (availabilityRevision) => {
        const world = await newWorld();
        const designId = await world.aDesignId();
        const { versionId } = await currentPair(world);
        const pair = { versionId, availabilityRevision };

        await dashboardFailureOf(
          world.store.recordIfAbsent(designId, pair),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordAcknowledged(designId, pair),
          "invalid-request",
        );

        expect(await world.store.readAcknowledged(designId)).toBe(
          NEVER_RECORDED,
        );
      },
    );

    it.each(IDS_REFUSED)(
      "refuses the version id %j for a first open and for an acknowledgement, writing nothing",
      async (versionId) => {
        const world = await newWorld();
        const designId = await world.aDesignId();
        const pair = { ...(await currentPair(world)), versionId };

        await dashboardFailureOf(
          world.store.recordIfAbsent(designId, pair),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordAcknowledged(designId, pair),
          "invalid-request",
        );

        expect(await world.store.readAcknowledged(designId)).toBe(
          NEVER_RECORDED,
        );
      },
    );

    it.each(IDS_REFUSED)(
      "refuses the design id %j on every method, so nothing is read or written for it",
      async (designId) => {
        const world = await newWorld();
        const pair = await currentPair(world);

        await dashboardFailureOf(
          world.store.readAcknowledged(designId),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordIfAbsent(designId, pair),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordAcknowledged(designId, pair),
          "invalid-request",
        );
      },
    );

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 7],
      ["an object", {}],
    ])(
      "refuses %s where a design id, a version id or a revision belongs",
      async (_name, notText) => {
        const world = await newWorld();
        const designId = await world.aDesignId();
        const pair = await currentPair(world);
        const asText = notText as unknown as string;

        await dashboardFailureOf(
          world.store.readAcknowledged(asText),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordIfAbsent(asText, pair),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordIfAbsent(designId, { ...pair, versionId: asText }),
          "invalid-request",
        );
        await dashboardFailureOf(
          world.store.recordAcknowledged(designId, {
            ...pair,
            availabilityRevision: asText,
          }),
          "invalid-request",
        );

        expect(await world.store.readAcknowledged(designId)).toBe(
          NEVER_RECORDED,
        );
      },
    );

    it("accepts ids made of the whole alphabet's edges, and judges such a version as unknown rather than malformed", async () => {
      const world = await newWorld();
      const designId = `_-${"Az09".repeat(4)}_-z`;
      expect(designId).toHaveLength(21);
      const edgeVersionId = `-_${"Zz90".repeat(4)}-_a`;
      expect(edgeVersionId).toHaveLength(21);

      await world.store.recordIfAbsent(designId, {
        versionId: edgeVersionId,
        availabilityRevision: INITIAL_REVISION,
      });
      const acknowledgement = await world.store.recordAcknowledged(designId, {
        versionId: edgeVersionId,
        availabilityRevision: INITIAL_REVISION,
      });

      expect(await world.store.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: {
          versionId: edgeVersionId,
          availabilityRevision: INITIAL_REVISION,
        },
      });
      expect(acknowledgement).toBe(UNKNOWN_VERSION);
    });

    it.each(["0", "1", "9223372036854775806", "9223372036854775807"])(
      "round-trips the revision %s of a first open as the same text",
      async (availabilityRevision) => {
        const world = await newWorld();
        const designId = await world.aDesignId();
        const { versionId } = await currentPair(world);

        await world.store.recordIfAbsent(designId, {
          versionId,
          availabilityRevision,
        });

        expect(await world.store.readAcknowledged(designId)).toEqual({
          kind: "recorded",
          acknowledged: { versionId, availabilityRevision },
        });
      },
    );
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
  const item = aNewItem("material");
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
