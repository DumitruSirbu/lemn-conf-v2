// The body-choice leaf (ADR 0110 Amendment H): the ids the owner's run order names, and F6's provenance discriminator.
// This file spells the slot id prefix nowhere: `body-choice.test.ts` pins the exact set of sites that spell the id
// convention, matching a quote or backtick directly followed by the prefix anywhere in a file's text, comments
// included. Every id below is taken from the planner that writes it or derived from one by string surgery, which is
// also the stronger form: a hand-minted witness passes against a writer whose format has drifted.
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

/** Every body id the leaf declares. */
const EVERY_DECLARED_BODY: readonly string[] = [
  BOTTLE_CARGO_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
  PAN_DRAWER_BASE_BUILD_ID,
  // The leaf declares the dishwasher, which stands in a planned 600 mm module, so it is held to the same distinct-row
  // and planned-width questions.
  DISHWASHER_BUILD_ID,
];

function roomOf(widthMm: number, depthMm: number, heightMm = 2600): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm };
}

/** A room whose plan holds both provenances at once, so one plan supplies every witness below. Past the approved
 *  6000 mm on purpose: a planner witness, not a policy room. */
const A_ROOM_WITH_A_BLOCK_AND_A_RUN = roomOf(6300, 4700);

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** The 300 mm cargo's catalogue row, spelled as the catalogue spells it rather than imported from the leaf, so the
 *  provenance below never reads production's answer. It is a storage-role body outside the column band that the
 *  storage run did not compose. */
const BOTTLE_CARGO_CATALOGUE_ID = "base-bottle-cargo";

/** The pan-drawer cabinet's catalogue row, spelled for the same reason. The composer reads it directly before the hob
 *  as a run item of its own (ADR 0110 Amendment J1); being one module wide, it is the one a width-keyed reading could
 *  not tell from a slot. */
const PAN_DRAWER_CATALOGUE_ID = "base-panbank";

/** The dishwasher's catalogue row, spelled for the same reason. It keeps the span, role and band of the door slot or
 *  preparation 3-drawer it re-identifies (ADR 0110 M1), so only its own row tells it apart, and *D* must never count
 *  it (M2). */
const DISHWASHER_CATALOGUE_ID = "base-dishwasher";

/** Storage-role bodies the composer reads as run items of their own rather than as slots. */
const ANCILLARY_CATALOGUE_IDS: ReadonlySet<string> = new Set([
  BOTTLE_CARGO_CATALOGUE_ID,
  PAN_DRAWER_CATALOGUE_ID,
  DISHWASHER_CATALOGUE_ID,
]);

/** The threshold drawer's planned id, spelled as a literal for the reason the catalogue ids above are. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";

/** A module's provenance read independently of the predicate's reading of its id, so the predicate is never checked
 *  against itself: block columns are the storage-role modules the catalogue declares in the `column` band, the bottle
 *  cargo and the pan drawer are each their own row, and the storage run's slots are the rest (`fridge-free` carries
 *  Amendment A1's role, which excludes it). The threshold drawer is the one module told apart by its planned id,
 *  because nothing else separates it from a slot; the sweep floors the group, so a composer that gave it a slot id
 *  empties the group and fails the floor. */
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

/** The width the planner plans for a storage slot, taken from a plan: a width literal in a generation-side test is
 *  the second authority ADR 0102 forbids, and it would pass against a planner whose module width had moved. */
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
    // Two constants holding one string is the sabotage no whole-design property catches: every slot still holds a
    // legal body while the drawer the owner's order puts after the hob silently becomes a door.
    const rows = EVERY_DECLARED_BODY.map((buildId) => CATALOG.get(buildId));

    expect(rows.filter((row) => row !== undefined)).toHaveLength(
      EVERY_DECLARED_BODY.length,
    );
    expect(new Set(EVERY_DECLARED_BODY).size).toBe(EVERY_DECLARED_BODY.length);
    expect(new Set(rows).size).toBe(EVERY_DECLARED_BODY.length);
  });

  it("builds each at the width the planner plans, through the catalogue's own predicate", () => {
    // `acceptsWidthMm` is the question both width paths ask (ADR 0031 rule 5), so asking it here is the question the
    // insert will ask later; a row answering no would move a tile boundary the merge and `plannedVoid` depend on.
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

/** The block's outermost column at the free-end witness (3910 x 1700) of ADR 0110 Amendment F6, and the width a rule
 *  would see if width could answer the question: it cannot, which is what is asserted. */
const A_BLOCK_COLUMN_WIDTH_MM = 610;
const A_COMPOSED_SLOT_WIDTH_MM = 600;

/** A module as a reader who had not read F6 would see it: an id and the two fields that look as though they answer
 *  the question. The predicate takes only the id. */
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
    // Each module dressed as the other: the slot given a core role and the block's absorbed width, the column given
    // the storage role (E5 clause 2) and a slot's width. Those fields are the ones F6 measured at 32.8 % and 14.9 %
    // wrong.
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

    // A containment test passes every witness the shipped suite has, because no id the planner writes carries the
    // convention anywhere but at its start; it would then accept the first composed id of any later namespace.
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

/** The shortest opening of a real composed-slot id the predicate accepts, found by asking it rather than spelling the
 *  convention, which keeps this file out of the pinned site set while still checking where the convention ends. */
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

    // Without the separator the predicate answers on a word, and a later `storageroom:` or `storage-wall:` module
    // would be swept into the storage run's balance, variety count and adjacency rule.
    expect(opening.at(-1)).toBe(":");
    expect(isComposedStorageSlot({ id: opening.slice(0, -1) })).toBe(false);
  });

  it("accepts any tail after it — the declared limit, asserted so it is not read as a parse", () => {
    const { composedSlotId } = anIdOfEachProvenance();
    const opening = shortestAcceptedOpeningOf(composedSlotId);

    // ADR 0110 F14.2 accepts this limit: the predicate answers who composed the id, and that only the composer writes
    // the prefix is the pinned site set's guarantee, not this function's. Asserted so nobody mistakes it for a
    // validator that guarantees a wall and an index in the id.
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

/** Arm floors, taken from this generator's behaviour rather than a uniform model of the policy (`fc.integer` is
 *  boundary-biased). The rarest arm is a one-column block; the counters make the sweep self-verifying: a sweep that
 *  stops reaching an arm fails here instead of passing quietly. */
const ROOMS_SWEPT = 3_000;
const LEAST_ROOMS_PER_BLOCK_SIZE = 100;
/** The sweep takes no seed, so this floor sits well under the expected draw. */
const LEAST_ROOMS_WITH_A_THRESHOLD_DRAWER = 50;
/** Floored at the per-block-size floor, so an empty dishwasher group (what giving it a slot id or a slot body would
 *  make) fails. */
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
        // One storage module wide and outside the column band: the module a predicate keyed on role, band or width
        // would count as a slot.
        expect(panDrawers.filter(isComposedStorageSlot)).toEqual([]);
        // The threshold drawer wears a slot's body and width exactly: at most one, and never a slot.
        expect(thresholdDrawers.filter(isComposedStorageSlot)).toEqual([]);
        expect(thresholdDrawers.length).toBeLessThanOrEqual(1);
        // The dishwasher inherits a composed slot's span, role and band (ADR 0110 M1): at most one, never a slot, and
        // always under its own planned id.
        expect(dishwashers.filter(isComposedStorageSlot)).toEqual([]);
        expect(dishwashers.length).toBeLessThanOrEqual(1);
        expect(dishwashers.map((base) => base.id)).toEqual(
          dishwashers.map(() => "dishwasher"),
        );
        // The core roles' ids are the role names themselves; a predicate answering anything but false for them would
        // put the sink in the balance.
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
    // Fails only when the pan-drawer arm stops being reached at all.
    expect(roomsWithAPanDrawer).toBeGreaterThanOrEqual(
      LEAST_ROOMS_PER_BLOCK_SIZE,
    );
    // Floored so the threshold drawer group cannot be empty, which is what giving it a slot id would make it.
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

// "Plans no pan drawer" no longer holds: the composer places it directly before the hob (ADR 0110 Amendment J1). Its
// successor is "the pan-drawer census over the approved L" in `pan-drawer-before-the-hob.test.ts`; what this file keeps
// is that the pan drawer is never a composed slot (the `panDrawers` group above).
