// M7 wave 7D4 slice S4 — criteria 2 and 21, the two that say *deep-equal to 7D3's*.
//
// **Neither can be proved against this wave's own output**, and that is the whole difficulty of the
// slice. A plan compared with a plan rebuilt from the module that composed it agrees with itself
// whatever that module does; a width neutrality asserted that way is a tautology wearing a
// criterion's number. So both properties run against a **recording** of 7D3's composition, captured
// by restoring this wave's two production modules to their pre-wave bytes and sweeping the same
// rooms. `tests/support/composed-run-baseline.ts` carries the method and
// `7d3-composition-baseline.json` carries the result.
//
// **What the recording is asked.** Criterion 2: for every room, every planned base's `id`, `role`,
// `wall`, `startMm`, `endMm` and `widthMm`, the floor widths, the remainders, the dropped list and
// the chosen wall cut are 7D3's, and the **only** difference anywhere is `buildId`, on the
// preparation role and on the storage run's own slots. Criterion 21: the wall row is 7D3's to the
// character — this wave composes no upper at all — and no lift or open shelf stands in any generated
// design.
//
// A storage slot is reached through `isComposedStorageSlot` and never through `role === "storage"` or a
// width: the block's full-height columns carry that role deliberately (ADR 0110 E5.2), and the two
// naive scopings are wrong on 32.8 % and 14.9 % of placed rooms against output that is right (D12).
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  generateKitchen,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  normaliseBand,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
  type GenerationLog,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import {
  approvedLRoom,
  BASELINE_RUNS,
  BASELINE_SEED,
  canonicalModule,
  canonicalPlanBeyondThisWavesBodies,
  canonicalPlanWithTheDoorBodyRestored,
  canonicalWallRow,
  digestOf,
  isMovedByThisWave,
  readComposedRunBaseline,
  recordedRoom,
  recordedWitness,
  roomKey,
} from "../support/composed-run-baseline.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
  createLeaseLedger,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const BASELINE = readComposedRunBaseline();

/** Measured at this seed: 209 of the 240 drawn rooms compose a kitchen — 87.1 %, against risk 14's
 *  89.0 % for the same arm under `fc.integer`. The floor **fails** the suite rather than warning, so
 *  a sweep that drifted into refusals cannot report coverage it does not have. */
const PLACED_ROOMS_FLOOR = 200;

/** Every arm below is floored at the hundred samples risk 14's table is written in terms of. */
const ARM_FLOOR = 100;

/** The two rows the owner ruled out the same day they were planned (D8). Neither has ever been
 *  generated, and criterion 21 exists so the next reader of D8's struck text does not re-add one
 *  without a new dated ruling. */
const NEVER_GENERATED_UPPERS = ["wall-lift", "open-shelf"];

const WITNESS_ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2600 },
  { shape: "L", widthMm: 5700, depthMm: 4100, heightMm: 2600 },
  { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 2700, depthMm: 1699, heightMm: 2200 },
];

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

interface GeneratedKitchen {
  readonly design: Design;
  readonly log: GenerationLog;
}

function generated(room: DesignRoom): GeneratedKitchen | undefined {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  return result.ok ? result : undefined;
}

function wallRowSteps(kitchen: GeneratedKitchen) {
  return kitchen.log.steps.filter(
    (step) => step.role === "upper" || step.role === "hood",
  );
}

function baseRowOf(kitchen: GeneratedKitchen) {
  return kitchen.design.placements.filter((placement) => placement.y0Mm === 0);
}

/** The wall row's floor as the generated design reports it — the lowest row standing off the floor —
 *  so the suppression rule below reads the boundary back instead of restating a generation-side
 *  constant. */
function wallRowFloorMm(design: Design): number {
  const raised = design.placements
    .map((placement) => placement.y0Mm)
    .filter((y0Mm) => y0Mm > 0);
  if (raised.length === 0) {
    throw new Error("the generated design stands no row above the floor");
  }
  return Math.min(...raised);
}

function declaredHeightMm(buildId: string): number {
  const nominalHeightMm = CATALOG.get(buildId)?.nominalHeightMm;
  if (nominalHeightMm === undefined) {
    throw new Error(`the catalogue declares no height for ${buildId}`);
  }
  return nominalHeightMm;
}

describe("criterion 2 — this wave moves a body's identity and nothing else", () => {
  it("composes 7D3's plan to the millimetre over the recorded sweep", () => {
    let placed = 0;
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const plan = planFor(room);
        if (plan.minimumMet) placed += 1;

        expect(
          digestOf(canonicalPlanBeyondThisWavesBodies(plan)),
          roomKey(room),
        ).toBe(recordedRoom(BASELINE, room).plan);
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(placed).toBeGreaterThanOrEqual(PLACED_ROOMS_FLOOR);
  });

  it.each(WITNESS_ROOMS)(
    "renders back to 7D3's own plan once the door body is restored, in %o",
    (room) => {
      // The sweep above says a plan is unchanged; this says **what changed and to what**, field by
      // field, at the rooms this wave's rulings name. Restoring the door body to the two modules the
      // wave may re-body must reproduce 7D3's recorded plan exactly — which proves in one assertion
      // that no other field moved, that no other build id moved, and that both modules were door
      // cabinets before this wave.
      expect(canonicalPlanWithTheDoorBodyRestored(planFor(room))).toBe(
        recordedWitness(BASELINE, room),
      );
    },
  );

  it.each(WITNESS_ROOMS)(
    "leaves every block column and the hob exactly as 7D3 composed them, in %o",
    (room) => {
      // Criterion 2 names these separately and D12 says why: a block column carries `role: "storage"`
      // deliberately, so a rule that reached its subject by role would sweep the block in and read
      // 7D3's correct output as this wave's defect. Each module the wave may **not** move is looked
      // for in 7D3's recording with all seven of its fields at once.
      const recorded = recordedWitness(BASELINE, room);
      const untouchable = planFor(room).bases.filter(
        (base) => !isMovedByThisWave(base),
      );

      expect(untouchable.length).toBeGreaterThan(0);
      for (const base of untouchable) {
        expect(recorded, base.id).toContain(canonicalModule(base));
      }
    },
  );

  it.each(WITNESS_ROOMS)(
    "moves a body at all, and only in a module it is allowed to, in %o",
    (room) => {
      // Without this the two assertions above pass over a wave that composed nothing: an empty
      // change also renders back to 7D3's plan.
      //
      // **The second assertion is here because the first one alone was measured green under
      // sabotage.** With `THREE_DRAWER_BASE_BUILD_ID` set to the door id — one line in
      // `body-choice.ts`, and a wave that composes no drawer anywhere — a count of modules *whose
      // body equals that constant* is every door cabinet in the run, and this test passed. A guard
      // that reads the thing it guards out of the constant it is checking proves only that the
      // constant equals itself.
      const drawers = planFor(room).bases.filter(
        (base) => base.buildId === THREE_DRAWER_BASE_BUILD_ID,
      );

      expect(THREE_DRAWER_BASE_BUILD_ID).not.toBe(DOOR_BASE_BUILD_ID);
      expect(drawers.length).toBeGreaterThan(0);
      for (const drawer of drawers) {
        expect(isMovedByThisWave(drawer), drawer.id).toBe(true);
      }
    },
  );

  it("sweeps rooms that hold composed slots, block columns and storage on both walls", () => {
    // The recording proves nothing about rooms it never reached. Measured at this seed over the
    // 240 drawn rooms: composed slots in 127, a block in 112, wall-B storage in 105.
    const arms = { composedSlots: 0, blockColumns: 0, wallBStorage: 0 };
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const bases = planFor(room).bases;
        const slots = bases.filter(isComposedStorageSlot);
        if (slots.length > 0) arms.composedSlots += 1;
        if (slots.some((slot) => slot.wall === "B")) arms.wallBStorage += 1;
        if (
          bases.some(
            (base) => base.role === "storage" && !isComposedStorageSlot(base),
          )
        ) {
          arms.blockColumns += 1;
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(arms.composedSlots).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.blockColumns).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.wallBStorage).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

describe("criterion 21 — the wall row is asserted, not composed", () => {
  it("reproduces 7D3's wall row character for character over the recorded sweep", () => {
    let withUppers = 0;
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) {
          expect(recordedRoom(BASELINE, room).wallRow, roomKey(room)).toBe(
            undefined,
          );
          return;
        }
        if (wallRowSteps(kitchen).length > 0) withUppers += 1;

        expect(digestOf(canonicalWallRow(kitchen)), roomKey(room)).toBe(
          recordedRoom(BASELINE, room).wallRow,
        );
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(withUppers).toBeGreaterThanOrEqual(PLACED_ROOMS_FLOOR);
  });

  it("stands a hood over every hob and nothing over a body that reaches the wall row", () => {
    let hoods = 0;
    let bodiesReachingTheWallRow = 0;
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;
        const floorMm = wallRowFloorMm(kitchen.design);
        const attempted = new Set(wallRowSteps(kitchen).map((step) => step.id));

        for (const base of kitchen.log.plan.bases) {
          const reachesTheWallRow = declaredHeightMm(base.buildId) > floorMm;
          const upperId = `${base.role === "hob" ? "hood" : "upper"}:${base.id}`;
          if (reachesTheWallRow) bodiesReachingTheWallRow += 1;
          if (base.role === "hob" && attempted.has(upperId)) hoods += 1;

          expect(attempted.has(upperId), `${roomKey(room)} ${upperId}`).toBe(
            !reachesTheWallRow,
          );
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(hoods).toBeGreaterThanOrEqual(PLACED_ROOMS_FLOOR);
    // The fridge and the block's columns are what reach it, counted per body rather than per room.
    // Measured at this seed: 458 across the 209 composed kitchens.
    expect(bodiesReachingTheWallRow).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("generates no lift and no open shelf, and logs no width command for an upper", () => {
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;

        for (const buildId of NEVER_GENERATED_UPPERS) {
          expect(
            kitchen.design.placements.map(
              (placement) => placement.body.buildId,
            ),
            roomKey(room),
          ).not.toContain(buildId);
        }
        expect(
          wallRowSteps(kitchen).flatMap((step) =>
            step.commands.filter((command) => command.type === "set_width"),
          ),
          roomKey(room),
        ).toEqual([]);
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );
  });

  it("logs a refused upper as not placed and removes nothing beneath it", () => {
    // The one clause of criterion 21 no sweep with an accepting probe can reach. The probe refuses
    // every body the **catalogue** declares in the wall band rather than two named ids, so a wall
    // row that gained a third body would still be refused here.
    const ordinary = generated(KITCHEN_L_DESIGN.room);
    const ledger = createLeaseLedger();
    const refusingEveryUpper: BodyProbeFactory = (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const delegate = createFakeProbe({ catalog });
      ledger.take();
      return createBodyProbeLease(
        {
          measure: (request) => {
            const measured = delegate.measure(request);
            const band = catalog.get(request.buildId)?.band;
            return band && normaliseBand(band) === "wall"
              ? { ...measured, carcassWidthM: measured.carcassWidthM + 0.1 }
              : measured;
          },
        },
        ledger.release,
      );
    };
    const refused = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: refusingEveryUpper,
    });

    expect(refused.ok).toBe(true);
    if (!refused.ok || !ordinary) {
      throw new Error("the reference room composed no kitchen");
    }
    expect(wallRowSteps(refused).length).toBeGreaterThan(0);
    expect(wallRowSteps(refused).map((step) => step.status)).toEqual(
      wallRowSteps(refused).map(() => "not_placed"),
    );
    expect(baseRowOf(refused)).toStrictEqual(baseRowOf(ordinary));
    expect(ledger).toMatchObject({ taken: 1, released: 1 });
  });
});
