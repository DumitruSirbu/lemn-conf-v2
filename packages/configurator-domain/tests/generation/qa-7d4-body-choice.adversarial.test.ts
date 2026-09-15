// Independent adversarial QA for M7 wave 7D4 slice S1 — ADR 0110 Amendment F's storage-cycle leaf.
//
// **This file spells the cycle's id prefix nowhere, and that is a constraint rather than a style.**
// `body-choice.test.ts` pins the exact set of sites that spell the id convention (criterion 22 as
// F14.2 corrected it), and a QA file that spelled it would both turn that guard red and become the
// fourth undeclared reader the guard exists to refuse. **Every id below is either taken from the
// planner that writes it or derived from one by string surgery** — which is also the stronger form,
// since a witness minted by hand passes against a writer whose format has drifted.
//
// The guard matches the prefix **wherever it appears in the file's text, comments included**, so the
// sentence above could not describe itself in the obvious way. Reported with the rest.
//
// **What is deliberately not re-asserted here, with the derivation, so the gap is a decision rather
// than an omission.** The shipped suite sweeps `|drawers − doors|` against `slotCount % 2` at every
// length from 0, and that single family of equalities **entails** three further claims that looked
// like separate coverage when this file was planned:
//   - the drawer/door classes strictly alternate (the lead can only move by one per slot, so it can
//     only track `n % 2` if every step flips the class);
//   - no run length is pathological — no all-doors run, no all-drawers run, no adjacent pair of
//     either class at any length;
//   - **Amendment F4's per-wall bound** — a wall holding *m* of the sequence's slots at any phase is
//     off half by at most one — because every contiguous window of an alternating sequence is.
// A test of any of them could not go red while the shipped sweep is green. **F4's bound therefore
// needs no leaf test of its own, and S2/S4 should spend criterion 5 on the planner's split instead.**
//
// What is left uncovered is what the leaf's index *cannot* separate: past `Number.MAX_SAFE_INTEGER`
// two consecutive slot positions are the same double and return the same body. No room in the
// approved policy composes more than eight slots, so it is recorded here and not asserted.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  isCycleStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  storageBodyAt,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

const APPROVED_L = (() => {
  const shape = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!shape) throw new Error("the approved policy has no L");
  return shape;
})();

/** Far past the eight slots of the largest approved room, for the same reason the shipped suite
 *  sweeps past it: what passes should be the cycle's shape and not the range it was checked over. */
const LONGEST_SWEPT_RUN = 64;

function sequenceOf(slotCount: number): readonly string[] {
  return Array.from({ length: slotCount }, (_, index) => storageBodyAt(index));
}

function roomOf(widthMm: number, depthMm: number, heightMm = 2600): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** A module's provenance read **independently of its id**, so the predicate is never checked against
 *  itself: the block's columns are the storage-role modules the catalogue declares in the `column`
 *  band, and the cycle's slots are the rest. `fridge-free` is a column too and carries Amendment
 *  A1's own role, which excludes it from both. */
function storageRoleModulesByBand(plan: KitchenCompositionPlan) {
  const storageRole = plan.bases.filter((base) => base.role === "storage");
  return {
    blockColumns: storageRole.filter(
      (base) => CATALOG.get(base.buildId)?.band === "column",
    ),
    cycleSlots: storageRole.filter(
      (base) => CATALOG.get(base.buildId)?.band !== "column",
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// `storageBodyAt`'s refusal, and the boundary of the domain it accepts.
// ---------------------------------------------------------------------------------------------

/** Every shape of *not a slot position* the type `number` admits. The shipped suite covers a
 *  negative integer and one fraction; these are the values a caller reaches by arithmetic rather
 *  than by typing them — a subtraction that ran past zero, a division by a count that was zero, a
 *  `parseInt` of an empty string. */
const REFUSED_POSITIONS: readonly number[] = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  -4,
  -Number.MAX_SAFE_INTEGER,
  -0.5,
  0.5,
  1.5,
  3.999999999,
  Number.MIN_VALUE,
  Number.EPSILON,
];

describe("storageBodyAt refuses every value that is not a slot position", () => {
  it("throws on each of them, rather than truncating, wrapping or answering undefined", () => {
    for (const refused of REFUSED_POSITIONS) {
      expect(() => storageBodyAt(refused)).toThrow(
        /non-negative whole slot position/,
      );
    }
  });

  it("names the offending value in the message, so a caller's arithmetic is diagnosable", () => {
    // The one fact the caller does not already have. Without it every refusal reads the same and the
    // index that produced it has to be reconstructed from the stack — and `String` is what makes the
    // message total over `number`, including `NaN` and both infinities.
    for (const refused of REFUSED_POSITIONS) {
      expect(() => storageBodyAt(refused)).toThrow(String(refused));
    }
  });

  it("admits negative zero as the first slot, which is what it arithmetically is", () => {
    // `Number.isInteger(-0)` is true and `-0 < 0` is false, so the guard lets it through and the
    // lookup reads slot 0. Pinned because a guard rewritten as `Math.sign(…) < 0` or `1 / … < 0`
    // would refuse a value that is the first slot, and the caller that produced it — a subtraction
    // landing exactly on zero — is the ordinary one.
    expect(storageBodyAt(-0)).toEqual(storageBodyAt(0));
  });

  it("keeps the cycle turning at the top of the safe integer range", () => {
    // The index is arithmetic, and arithmetic on a `number` degrades. Past `MAX_SAFE_INTEGER` two
    // consecutive positions are the same double and the leaf answers them identically — asserted
    // *below* that edge, where every integer is still its own, and recorded rather than asserted
    // above it, because no room in the policy composes more than eight slots.
    const topOfTheSafeRange = Array.from({ length: 8 }, (_, offset) =>
      storageBodyAt(Number.MAX_SAFE_INTEGER - 7 + offset),
    );

    for (let position = 1; position < topOfTheSafeRange.length; position += 1) {
      expect({ position, body: topOfTheSafeRange[position] }).not.toEqual({
        position,
        body: topOfTheSafeRange[position - 1],
      });
    }
  });
});

describe("the body at a slot is a function of that slot alone", () => {
  it("answers the same body whichever order the slots are asked in", () => {
    // The anti-invariant is a cursor: a leaf that advanced a module-level index would pass every
    // assertion written as a forward walk from zero, which is how every other test here reads it,
    // and would then compose a different kitchen on the second call in one process.
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 5_000 }), {
          minLength: 1,
          maxLength: 40,
        }),
        (slotIndices) => {
          const askedForwards = slotIndices.map(storageBodyAt);
          const askedBackwards = [...slotIndices]
            .reverse()
            .map(storageBodyAt)
            .reverse();

          expect(askedBackwards).toEqual(askedForwards);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("the variety a wall shows does not depend on where its slice of the cycle begins", () => {
  it("shows every body the cycle uses in every four consecutive slots, at every phase", () => {
    // Amendment F4 gives wall A a phase set by wall B's slot count, so the run a customer stands in
    // front of is a *window* of the sequence and never its opening. **This is the one claim the
    // shipped suite's sweep from index 0 does not entail**: a longer cycle drawing the same three
    // bodies satisfies the balance, the adjacency and `min(3, slotCount)` counted from zero while
    // leaving a four-slot wall at some other phase showing only two of them.
    const everyBodyTheCycleUses = [...new Set(sequenceOf(LONGEST_SWEPT_RUN))]
      .sort()
      .join(" ");

    for (
      let firstSlotIndex = 0;
      firstSlotIndex < LONGEST_SWEPT_RUN;
      firstSlotIndex += 1
    ) {
      const window = Array.from({ length: 4 }, (_, offset) =>
        storageBodyAt(firstSlotIndex + offset),
      );

      expect({
        firstSlotIndex,
        shown: [...new Set(window)].sort().join(" "),
      }).toEqual({ firstSlotIndex, shown: everyBodyTheCycleUses });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// `isCycleStorageSlot` — Amendment F6's discriminator, attacked as the string predicate it is.
// ---------------------------------------------------------------------------------------------

/** The block's outermost column at the free-end witness Amendment F6 measures (3910 × 1700), and the
 *  width whose 14.9 % is the reason a rule may not read one. Carried here as the value a module
 *  would have if width could answer the question — it cannot, and that is what is asserted. */
const A_BLOCK_COLUMN_WIDTH_MM = 610;
const A_CYCLE_SLOT_WIDTH_MM = 600;

/** A module as a reader that had not read F6 would look at it: an id, and the two fields that look
 *  as though they answer the question. The predicate takes only the first. */
interface ModuleAsAMistakenReaderSeesIt {
  readonly id: string;
  readonly role: string;
  readonly widthMm: number;
}

/** A room whose plan holds both provenances at once, so one plan supplies both witnesses. */
const A_ROOM_WITH_A_BLOCK_AND_A_CYCLE = roomOf(6300, 4700);

function anIdOfEachProvenance() {
  const { blockColumns, cycleSlots } = storageRoleModulesByBand(
    planFor(A_ROOM_WITH_A_BLOCK_AND_A_CYCLE),
  );
  const cycleSlot = cycleSlots[0];
  const blockColumn = blockColumns[0];
  if (!cycleSlot || !blockColumn) {
    throw new Error(
      "the witness room no longer plans both a cycle slot and a block column",
    );
  }
  return { cycleSlotId: cycleSlot.id, blockColumnId: blockColumn.id };
}

describe("isCycleStorageSlot answers by provenance, and by nothing that correlates with it", () => {
  it("is unmoved by the role and the width the module carries", () => {
    const { cycleSlotId, blockColumnId } = anIdOfEachProvenance();
    // Each module dressed as the other: the cycle's slot given a core role and the block's absorbed
    // width, the block's column given the storage role E5 clause 2 puts on it and a cycle slot's
    // width. Both fields are the ones F6 measured at 32.8 % and 14.9 % wrong.
    const aCycleSlotDressedAsSomethingElse: ModuleAsAMistakenReaderSeesIt = {
      id: cycleSlotId,
      role: "sink",
      widthMm: A_BLOCK_COLUMN_WIDTH_MM,
    };
    const aBlockColumnDressedAsACycleSlot: ModuleAsAMistakenReaderSeesIt = {
      id: blockColumnId,
      role: "storage",
      widthMm: A_CYCLE_SLOT_WIDTH_MM,
    };

    expect(isCycleStorageSlot(aCycleSlotDressedAsSomethingElse)).toBe(true);
    expect(isCycleStorageSlot(aBlockColumnDressedAsACycleSlot)).toBe(false);
  });

  it("rejects an id that carries the convention without opening with it", () => {
    const { cycleSlotId } = anIdOfEachProvenance();

    // A containment test rather than a prefix test passes every witness the shipped suite has, because
    // no id the planner writes today carries the convention anywhere but at its start. It would then
    // accept the first composed id of any later wave that prefixed a namespace onto this one.
    for (const disguise of ["x", " ", "\n", "column:", "not-"]) {
      expect(isCycleStorageSlot({ id: disguise + cycleSlotId })).toBe(false);
    }
  });

  it("rejects an id whose case differs from the convention", () => {
    const { cycleSlotId } = anIdOfEachProvenance();

    expect(isCycleStorageSlot({ id: cycleSlotId.toUpperCase() })).toBe(false);
  });

  it("rejects an id that is empty or is only whitespace", () => {
    for (const empty of ["", " ", "\t", "\n"]) {
      expect(isCycleStorageSlot({ id: empty })).toBe(false);
    }
  });
});

/** The shortest opening of a real cycle id the predicate accepts, found by asking it rather than by
 *  spelling the convention out — which is what keeps this file out of criterion 22's pinned site
 *  set while still checking where the convention ends. */
function shortestAcceptedOpeningOf(id: string): string {
  for (let length = 0; length <= id.length; length += 1) {
    const opening = id.slice(0, length);
    if (isCycleStorageSlot({ id: opening })) {
      return opening;
    }
  }
  throw new Error(`no opening of ${id} is accepted, so it is not a cycle id`);
}

describe("the convention the predicate reads ends at its separator", () => {
  it("accepts nothing shorter than the whole prefix, separator included", () => {
    const { cycleSlotId } = anIdOfEachProvenance();
    const opening = shortestAcceptedOpeningOf(cycleSlotId);

    // Without the separator the predicate answers on a word, and a later `storageroom:` or
    // `storage-wall:` module — the kind of name a wave adds without reading this leaf — would be
    // swept into the cycle's balance, its variety count and its adjacency rule.
    expect(opening.at(-1)).toBe(":");
    expect(isCycleStorageSlot({ id: opening.slice(0, -1) })).toBe(false);
  });

  it("accepts any tail after it — the declared limit, asserted so it is not read as a parse", () => {
    const { cycleSlotId } = anIdOfEachProvenance();
    const opening = shortestAcceptedOpeningOf(cycleSlotId);

    // F14.2 states this limit and accepts it: the predicate answers *who composed this*, and the
    // guarantee that only the composer writes the prefix is the pinned site set, not this function.
    // Asserted rather than described, because a reader who took it for a validator would trust an id
    // this returns true for to have a wall and an index in it.
    for (const tail of ["", ":", "Z:-1", " "]) {
      expect(isCycleStorageSlot({ id: opening + tail })).toBe(true);
    }
  });
});

const approvedRoom = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({
    min: APPROVED_L.wallA.minMm,
    max: APPROVED_L.wallA.maxMm,
  }),
  depthMm: fc.integer({
    min: APPROVED_L.wallB.minMm,
    max: APPROVED_L.wallB.maxMm,
  }),
  heightMm: fc.integer({
    min: APPROVED_ROOM_POLICY.heightBounds.minMm,
    max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
  }),
});

/** Arm floors, taken from this generator's own behaviour rather than from a uniform model of the
 *  policy. The rarest arm is a **one-column** block: 2 000 rooms drawn uniformly on a 1 mm grid over
 *  the approved L put it at 6 %, and — because `fc.integer` is boundary-biased and a uniform model
 *  is not what the property will actually draw — the same arbitrary as below was then run at this
 *  count on six seeds, giving **150, 162, 171, 175, 188 and 194** rooms in that arm. The floor is set
 *  under the lowest of those with room to spare, and the counters make it self-verifying: a sweep
 *  that stops reaching an arm fails here instead of passing quietly. */
const ROOMS_SWEPT = 3_000;
const LEAST_ROOMS_PER_BLOCK_SIZE = 100;

describe("the predicate agrees with provenance over the whole approved policy", () => {
  it("answers true for every cycle slot and false for every block column, at every block size", () => {
    const roomsByBlockSize = new Map<number, number>();
    let roomsWithACycleSlot = 0;

    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        const { blockColumns, cycleSlots } = storageRoleModulesByBand(plan);
        const blockSize = blockColumns.length;
        roomsByBlockSize.set(
          blockSize,
          (roomsByBlockSize.get(blockSize) ?? 0) + 1,
        );
        if (cycleSlots.length > 0) {
          roomsWithACycleSlot += 1;
        }

        expect(cycleSlots.filter(isCycleStorageSlot)).toEqual(cycleSlots);
        expect(blockColumns.filter(isCycleStorageSlot)).toEqual([]);
        // The core roles are the third population the plan holds, and the one whose ids are the role
        // names themselves. A predicate that answered anything but false for them would put the sink
        // in the balance.
        expect(
          plan.bases
            .filter((base) => base.role !== "storage")
            .filter(isCycleStorageSlot),
        ).toEqual([]);
      }),
      { numRuns: ROOMS_SWEPT },
    );

    for (const blockSize of [0, 1, 2, 3]) {
      expect({
        blockSize,
        reached:
          (roomsByBlockSize.get(blockSize) ?? 0) >= LEAST_ROOMS_PER_BLOCK_SIZE,
      }).toEqual({ blockSize, reached: true });
    }
    expect(roomsWithACycleSlot).toBeGreaterThanOrEqual(
      LEAST_ROOMS_PER_BLOCK_SIZE,
    );
    expect(
      [...roomsByBlockSize.keys()].sort((left, right) => left - right),
    ).toEqual([0, 1, 2, 3]);
  });
});
