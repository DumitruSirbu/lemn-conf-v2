// Independent adversarial QA for M7 wave 7D4 slice S1b — the body-choice leaf as ADR 0110
// Amendment H leaves it: the ids the owner's run order names, and F6's provenance discriminator.
//
// **This file spells the slot id prefix nowhere, and that is a constraint rather than a style.**
// `body-choice.test.ts` pins the exact set of sites that spell the id convention (criterion 22 as
// F14.2 corrected it), and a QA file that spelled it would both turn that guard red and become the
// fourth undeclared reader the guard exists to refuse. **Every id below is either taken from the
// planner that writes it or derived from one by string surgery** — which is also the stronger form,
// since a witness minted by hand passes against a writer whose format has drifted.
//
// The guard matches the prefix **wherever it appears in the file's text, comments included**, so the
// sentence above could not describe itself in the obvious way. Reported with the rest.
//
// **What S1b removed from this file, recorded so the gap reads as a decision.** Every attack on the
// storage cycle went with the cycle itself (D14): the refused index positions, the *same answer
// whichever order the slots are asked in* property, and the phase-window check that F4's per-wall
// bound rested on. **None of them has a subject any more** — a storage slot's body no longer depends
// on its index, and which slot stands first after the hob is the composer's fact, attacked in S2's
// and S4's suites rather than here.
//
// **What replaces them attacks the leaf's remaining claim**: that the ids it declares are distinct
// rows the catalogue will build at the width the planner plans. The third half — that the one with
// no caller reaches no design — expired at 7D5 S2 as it was written to, and the end of this file
// says where its successor lives.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  APPROVED_ROOM_POLICY,
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  DISHWASHER_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  PAN_DRAWER_BASE_BUILD_ID,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  toInsertableBody,
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

/** Every body id the leaf declares, including the pan drawer 7D5 S2 gave its first caller. */
const EVERY_DECLARED_BODY: readonly string[] = [
  BOTTLE_CARGO_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
  PAN_DRAWER_BASE_BUILD_ID,
  // 7D5b S1 / ADR 0110 M1/M8/M9: the leaf now declares the dishwasher, and it stands in a planned
  // 600 mm module, so it is held to the same distinct-row and planned-width questions.
  DISHWASHER_BUILD_ID,
];

function roomOf(widthMm: number, depthMm: number, heightMm = 2600): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

/** A room whose plan holds both provenances at once, so one plan supplies every witness below. Past
 *  the approved 6000 mm on purpose (M7 7A3): a planner witness, not a policy room. */
const A_ROOM_WITH_A_BLOCK_AND_A_RUN = roomOf(6300, 4700);

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** The 300 mm cargo's catalogue row, spelled as the catalogue spells it rather than imported from the
 *  leaf, so the provenance below never reads production's answer. It is a storage-role body outside
 *  the column band that the storage run did not compose (M7 wave 7D5 S1). */
const BOTTLE_CARGO_CATALOGUE_ID = "base-bottle-cargo";

/** The pan-drawer cabinet's catalogue row, spelled for the same reason. The composer reads it
 *  immediately before the hob as a run item of its own (M7 wave 7D5 S2, ADR 0110 Amendment J1), so it
 *  is the second storage-role body outside the column band that the storage run did not compose —
 *  and, being one module wide, the one a width-keyed reading could not tell from a slot. */
const PAN_DRAWER_CATALOGUE_ID = "base-panbank";

/** 7D5b S1 / ADR 0110 M1/M8/M9: the dishwasher's catalogue row, spelled for the same reason. It keeps
 *  the span, role and band of the door slot (M1) or preparation 3-drawer (M7(e)) it re-identifies,
 *  so only its own row tells it apart — and *D* must never count it (M2). */
const DISHWASHER_CATALOGUE_ID = "base-dishwasher";

/** Storage-role bodies the composer reads as run items of their own rather than as slots. */
const ANCILLARY_CATALOGUE_IDS: ReadonlySet<string> = new Set([
  BOTTLE_CARGO_CATALOGUE_ID,
  PAN_DRAWER_CATALOGUE_ID,
  DISHWASHER_CATALOGUE_ID,
]);

/** 7D5 S3 / Q-H5: the threshold drawer's planned id, spelled as a literal for the reason the two
 *  catalogue ids above are — so a wrong constant and a wrong composer cannot agree. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";

/** A module's provenance read **independently of the predicate's own reading of its id**, so the
 *  predicate is never checked against itself: the block's columns are the storage-role modules the
 *  catalogue declares in the `column` band, the bottle cargo and the pan drawer are each their own
 *  catalogue row, and the storage run's slots are the rest. `fridge-free` is a column too and carries
 *  Amendment A1's own role, which excludes it from both.
 *
 *  **7D5 S3 / Q-H5: the threshold drawer is the one module told apart by its planned id**, because
 *  nothing else separates it from a slot — it is the first post-hob slot's own `base-3drawer` row,
 *  600 mm, storage role, outside the column band. The id is the literal above rather than the
 *  predicate's convention, and the sweep floors the group, so a composer that gave it a slot id
 *  empties this group and fails the floor instead of passing as a slot. */
function storageRoleModulesByBand(plan: KitchenCompositionPlan) {
  const storageRole = plan.bases.filter((base) => base.role === "storage");
  const outsideTheColumnBand = storageRole.filter(
    (base) =>
      CATALOG.get(base.buildId)?.band !== "column" &&
      base.id !== THRESHOLD_DRAWER_PLANNED_ID,
  );
  return {
    thresholdDrawers: storageRole.filter(
      (base) => base.id === THRESHOLD_DRAWER_PLANNED_ID,
    ),
    blockColumns: storageRole.filter(
      (base) => CATALOG.get(base.buildId)?.band === "column",
    ),
    bottleCargos: outsideTheColumnBand.filter(
      (base) => base.buildId === BOTTLE_CARGO_CATALOGUE_ID,
    ),
    panDrawers: outsideTheColumnBand.filter(
      (base) => base.buildId === PAN_DRAWER_CATALOGUE_ID,
    ),
    dishwashers: outsideTheColumnBand.filter(
      (base) => base.buildId === DISHWASHER_CATALOGUE_ID,
    ),
    composedSlots: outsideTheColumnBand.filter(
      (base) => !ANCILLARY_CATALOGUE_IDS.has(base.buildId),
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// The declared ids, attacked as the catalogue references they are.
// ---------------------------------------------------------------------------------------------

/** The width the planner actually plans for a storage slot, taken from a plan rather than written
 *  here: a width literal in a generation-side test is the second authority ADR 0102 forbids, and it
 *  would also pass against a planner whose module width had moved. */
function plannedStorageSlotWidthMm(): number {
  const { composedSlots } = storageRoleModulesByBand(
    planFor(A_ROOM_WITH_A_BLOCK_AND_A_RUN),
  );
  const slot = composedSlots[0];
  if (!slot) {
    throw new Error("the witness room no longer plans a storage slot");
  }
  return slot.widthMm;
}

describe("every id the leaf declares names a row that can stand in a planned slot", () => {
  it("resolves each to a distinct catalogue row", () => {
    // Two constants holding one string is the sabotage no whole-design property catches: every
    // slot still holds a legal body and the distinct-id set is still a legal subset, while the
    // drawer the owner's order puts after the hob silently becomes a door.
    const rows = EVERY_DECLARED_BODY.map((buildId) => CATALOG.get(buildId));

    expect(rows.filter((row) => row !== undefined)).toHaveLength(
      EVERY_DECLARED_BODY.length,
    );
    expect(new Set(EVERY_DECLARED_BODY).size).toBe(EVERY_DECLARED_BODY.length);
    expect(new Set(rows).size).toBe(EVERY_DECLARED_BODY.length);
  });

  it("builds each at the width the planner plans, through the catalogue's own predicate", () => {
    // `acceptsWidthMm` is the one question both width paths ask (ADR 0031 rule 5), so asking it
    // here is the same question the insert will ask later. A row that answered no would move a
    // tile boundary the merge and `plannedVoid` depend on — D1's whole safety argument — and the
    // failure would surface as a throw in one room and a re-tiled run in the next.
    const widthMm = plannedStorageSlotWidthMm();

    for (const buildId of EVERY_DECLARED_BODY.filter(
      (candidate) => candidate !== BOTTLE_CARGO_BUILD_ID,
    )) {
      const row = CATALOG.get(buildId);
      if (!row) {
        throw new Error(`the catalogue declares no row ${buildId}`);
      }
      const body = toInsertableBody(buildId, row);

      expect({ buildId, insertable: body !== undefined }).toEqual({
        buildId,
        insertable: true,
      });
      expect({
        buildId,
        buildsAtThePlannedWidth: body ? acceptsWidthMm(body, widthMm) : false,
      }).toEqual({ buildId, buildsAtThePlannedWidth: true });
    }

    const bottle = CATALOG.get(BOTTLE_CARGO_BUILD_ID);
    if (!bottle) throw new Error("the catalogue declares no bottle cargo");
    const insertableBottle = toInsertableBody(BOTTLE_CARGO_BUILD_ID, bottle);
    expect(insertableBottle).toBeDefined();
    expect(
      insertableBottle ? acceptsWidthMm(insertableBottle, 300) : false,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// `isComposedStorageSlot` — Amendment F6's discriminator, attacked as the string predicate it is.
// ---------------------------------------------------------------------------------------------

/** The block's outermost column at the free-end witness Amendment F6 measures (3910 × 1700), and the
 *  width whose 14.9 % is the reason a rule may not read one. Carried here as the value a module
 *  would have if width could answer the question — it cannot, and that is what is asserted. */
const A_BLOCK_COLUMN_WIDTH_MM = 610;
const A_COMPOSED_SLOT_WIDTH_MM = 600;

/** A module as a reader that had not read F6 would look at it: an id, and the two fields that look
 *  as though they answer the question. The predicate takes only the first. */
interface ModuleAsAMistakenReaderSeesIt {
  readonly id: string;
  readonly role: string;
  readonly widthMm: number;
}

function anIdOfEachProvenance() {
  const { blockColumns, composedSlots } = storageRoleModulesByBand(
    planFor(A_ROOM_WITH_A_BLOCK_AND_A_RUN),
  );
  const composedSlot = composedSlots[0];
  const blockColumn = blockColumns[0];
  if (!composedSlot || !blockColumn) {
    throw new Error(
      "the witness room no longer plans both a composed slot and a block column",
    );
  }
  return { composedSlotId: composedSlot.id, blockColumnId: blockColumn.id };
}

describe("isComposedStorageSlot answers by provenance, and by nothing that correlates with it", () => {
  it("is unmoved by the role and the width the module carries", () => {
    const { composedSlotId, blockColumnId } = anIdOfEachProvenance();
    // Each module dressed as the other: the storage run's slot given a core role and the block's absorbed
    // width, the block's column given the storage role E5 clause 2 puts on it and a composed slot's
    // width. Both fields are the ones F6 measured at 32.8 % and 14.9 % wrong.
    const aComposedSlotDressedAsSomethingElse: ModuleAsAMistakenReaderSeesIt = {
      id: composedSlotId,
      role: "sink",
      widthMm: A_BLOCK_COLUMN_WIDTH_MM,
    };
    const aBlockColumnDressedAsAComposedSlot: ModuleAsAMistakenReaderSeesIt = {
      id: blockColumnId,
      role: "storage",
      widthMm: A_COMPOSED_SLOT_WIDTH_MM,
    };

    expect(isComposedStorageSlot(aComposedSlotDressedAsSomethingElse)).toBe(
      true,
    );
    expect(isComposedStorageSlot(aBlockColumnDressedAsAComposedSlot)).toBe(
      false,
    );
  });

  it("rejects an id that carries the convention without opening with it", () => {
    const { composedSlotId } = anIdOfEachProvenance();

    // A containment test rather than a prefix test passes every witness the shipped suite has, because
    // no id the planner writes today carries the convention anywhere but at its start. It would then
    // accept the first composed id of any later wave that prefixed a namespace onto this one.
    for (const disguise of ["x", " ", "\n", "column:", "not-"]) {
      expect(isComposedStorageSlot({ id: disguise + composedSlotId })).toBe(
        false,
      );
    }
  });

  it("rejects an id whose case differs from the convention", () => {
    const { composedSlotId } = anIdOfEachProvenance();

    expect(isComposedStorageSlot({ id: composedSlotId.toUpperCase() })).toBe(
      false,
    );
  });

  it("rejects an id that is empty or is only whitespace", () => {
    for (const empty of ["", " ", "\t", "\n"]) {
      expect(isComposedStorageSlot({ id: empty })).toBe(false);
    }
  });
});

/** The shortest opening of a real composed-slot id the predicate accepts, found by asking it rather than by
 *  spelling the convention out — which is what keeps this file out of criterion 22's pinned site
 *  set while still checking where the convention ends. */
function shortestAcceptedOpeningOf(id: string): string {
  for (let length = 0; length <= id.length; length += 1) {
    const opening = id.slice(0, length);
    if (isComposedStorageSlot({ id: opening })) {
      return opening;
    }
  }
  throw new Error(
    `no opening of ${id} is accepted, so it is not a composed-slot id`,
  );
}

describe("the convention the predicate reads ends at its separator", () => {
  it("accepts nothing shorter than the whole prefix, separator included", () => {
    const { composedSlotId } = anIdOfEachProvenance();
    const opening = shortestAcceptedOpeningOf(composedSlotId);

    // Without the separator the predicate answers on a word, and a later `storageroom:` or
    // `storage-wall:` module — the kind of name a wave adds without reading this leaf — would be
    // swept into the storage run's balance, its variety count and its adjacency rule.
    expect(opening.at(-1)).toBe(":");
    expect(isComposedStorageSlot({ id: opening.slice(0, -1) })).toBe(false);
  });

  it("accepts any tail after it — the declared limit, asserted so it is not read as a parse", () => {
    const { composedSlotId } = anIdOfEachProvenance();
    const opening = shortestAcceptedOpeningOf(composedSlotId);

    // F14.2 states this limit and accepts it: the predicate answers *who composed this*, and the
    // guarantee that only the composer writes the prefix is the pinned site set, not this function.
    // Asserted rather than described, because a reader who took it for a validator would trust an id
    // this returns true for to have a wall and an index in it.
    for (const tail of ["", ":", "Z:-1", "\u0000"]) {
      expect(isComposedStorageSlot({ id: opening + tail })).toBe(true);
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
/** 7D5 S3 / Q-H5: 6.4 % of the approved grid predicts about 190 at this count, and one unseeded run
 *  drew 214. Set under a quarter of that, because this sweep takes no seed. */
const LEAST_ROOMS_WITH_A_THRESHOLD_DRAWER = 50;
/** 7D5b S1 / ADR 0110 M1/M8/M9: most placed rooms stand one; floored at the per-block-size floor so
 *  an empty dishwasher group — what a dishwasher given a slot id or a slot body would make — fails. */
const LEAST_ROOMS_WITH_A_DISHWASHER = LEAST_ROOMS_PER_BLOCK_SIZE;

describe("the predicate agrees with provenance over the whole approved policy", () => {
  it("answers true for every composed slot and false for every block column, at every block size", () => {
    const roomsByBlockSize = new Map<number, number>();
    let roomsWithAComposedSlot = 0;
    let roomsWithAPanDrawer = 0;
    let roomsWithAThresholdDrawer = 0;
    let roomsWithADishwasher = 0;

    fc.assert(
      fc.property(approvedRoom, (room) => {
        const plan = planFor(room);
        const {
          blockColumns,
          bottleCargos,
          panDrawers,
          thresholdDrawers,
          dishwashers,
          composedSlots,
        } = storageRoleModulesByBand(plan);
        const blockSize = blockColumns.length;
        roomsByBlockSize.set(
          blockSize,
          (roomsByBlockSize.get(blockSize) ?? 0) + 1,
        );
        if (composedSlots.length > 0) {
          roomsWithAComposedSlot += 1;
        }
        if (panDrawers.length > 0) {
          roomsWithAPanDrawer += 1;
        }
        if (thresholdDrawers.length > 0) {
          roomsWithAThresholdDrawer += 1;
        }
        if (dishwashers.length > 0) {
          roomsWithADishwasher += 1;
        }

        expect(composedSlots.filter(isComposedStorageSlot)).toEqual(
          composedSlots,
        );
        expect(blockColumns.filter(isComposedStorageSlot)).toEqual([]);
        expect(bottleCargos.filter(isComposedStorageSlot)).toEqual([]);
        // One storage module wide and outside the column band, so it is the module a predicate keyed
        // on role, band or width would count as a slot (7D5 S2).
        expect(panDrawers.filter(isComposedStorageSlot)).toEqual([]);
        // 7D5 S3 / Q-H5: the fourth storage-role module the storage run did not compose, and the one
        // that wears a slot's body and width exactly. One at most, and never a slot.
        expect(thresholdDrawers.filter(isComposedStorageSlot)).toEqual([]);
        expect(thresholdDrawers.length).toBeLessThanOrEqual(1);
        // 7D5b S1 / ADR 0110 M1/M8/M9: the fifth, and the one that inherits a composed slot's span,
        // role and band under M1. One at most, never a slot, and always under its own planned id.
        expect(dishwashers.filter(isComposedStorageSlot)).toEqual([]);
        expect(dishwashers.length).toBeLessThanOrEqual(1);
        expect(dishwashers.map((base) => base.id)).toEqual(
          dishwashers.map(() => "dishwasher"),
        );
        // The core roles are the third population the plan holds, and the one whose ids are the role
        // names themselves. A predicate that answered anything but false for them would put the sink
        // in the balance.
        expect(
          plan.bases
            .filter((base) => base.role !== "storage")
            .filter(isComposedStorageSlot),
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
    expect(roomsWithAComposedSlot).toBeGreaterThanOrEqual(
      LEAST_ROOMS_PER_BLOCK_SIZE,
    );
    // 56 866 of 245 211 placed rooms carry one (22 %), so this floor is far under any seed's draw;
    // it fails only when the pan-drawer arm stops being reached at all.
    expect(roomsWithAPanDrawer).toBeGreaterThanOrEqual(
      LEAST_ROOMS_PER_BLOCK_SIZE,
    );
    // 7D5 S3 / Q-H5: 15 795 of 245 211 placed rooms on the approved 10 mm grid stand one (6.4 %).
    // Floored so the group above cannot be empty — which is what a threshold drawer given a slot id
    // would make it.
    expect(roomsWithAThresholdDrawer).toBeGreaterThanOrEqual(
      LEAST_ROOMS_WITH_A_THRESHOLD_DRAWER,
    );
    expect(roomsWithADishwasher).toBeGreaterThanOrEqual(
      LEAST_ROOMS_WITH_A_DISHWASHER,
    );
    expect(
      [...roomsByBlockSize.keys()].sort((left, right) => left - right),
    ).toEqual([0, 1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------------------------
// Retired at 7D5 S2, as it was written to be: "plans the pan drawer into no module, at any room in
// the approved policy" (7D4 criterion 6's must-not, 7D5 criterion 5). ADR 0110 Amendment J1 (owner,
// Q-H6 = A, 2026-09-21) places `base-panbank` immediately before the hob wherever every core role,
// the bottle decision and every tall column survive, so the claim is now false about the product
// rather than a defect in it. Moved, not deleted (ADR 0091 Amendment A.2): the successor asserts
// where it stands, in how many rooms, and what it costs, per room over the approved 10 mm grid —
// `tests/generation/pan-drawer-before-the-hob.test.ts`, "pins the pan-drawer census ...". What
// survives here is that it is never a composed slot: the `panDrawers` group above.
// ---------------------------------------------------------------------------------------------
