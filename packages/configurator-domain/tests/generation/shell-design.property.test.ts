// Wave 7D1: the composition shell's rules as properties over the owner-approved L range (ADR 0108
// Amendment B) — walls on a 1 mm grid, ceilings 2200–3900 — rather than over a handful of rooms.
// The two ceiling arms are sampled evenly, because the top-row return is in the shell on one side of
// 2600 and out of it on the other, and each arm is held to a floor so neither can go unexercised.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  occupiedDepthOfEntryM,
  toMillimetres,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignRoom,
  type DesignWall,
  type MillimetreBounds,
} from "../../src/index.js";
import { LEVELS, MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
import {
  bandsUnder,
  emptyIntervalsIn,
  facesOf,
  firstBaseOpening,
  freeFloorRunMm,
  insertSinkInto,
  openingIntervalOf,
  overlapMm,
  plannedEndMm,
  reachableEndMm,
  RUN_END_PANEL_FOOTPRINT_MM,
  runEndPanelOuterFaceMm,
  runStartMm,
  SHELL_CATALOG,
  unionOf,
  WALLS,
  withWallABaseRunFilled,
  type BandMm,
  type IntervalMm,
  atCabinetDepth,
  shellIn,
} from "../support/shell-design.js";

/** Criterion 1's floor on the whole property. */
const RUNS = 200;

/** Each arm of a branching property is exercised at least this often out of `RUNS`. Sampled evenly,
 *  each arm expects 100, so a floor of 50 fails only on a generator that has stopped reaching it. */
const RUNS_PER_ARM_FLOOR = 50;

/** Where the top-row return starts to fit. */
const TOP_ROW_CEILING_MM = 2600;

/** §2's last module line, read off the grid: no recorded extent reaches past it. */
const MODULE_GRID_TOP_MM = toMillimetres(
  Math.max(...LEVELS.map(([, topM]) => topM)),
);

/** The approved room policy's L, which is the range every property below sweeps. */
function approvedL() {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!bounds) throw new Error("the approved policy builds no L");
  return { ...bounds, height: APPROVED_ROOM_POLICY.heightBounds };
}

function millimetresIn(bounds: MillimetreBounds) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** A room from the approved range, tagged with its ceiling arm. */
function approvedRoom() {
  const l = approvedL();
  const lowCeiling = fc.integer({
    min: l.height.minMm,
    max: TOP_ROW_CEILING_MM - 1,
  });
  const highCeiling = fc.integer({
    min: TOP_ROW_CEILING_MM,
    max: l.height.maxMm,
  });
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: millimetresIn(l.wallA),
    depthMm: millimetresIn(l.wallB),
    heightMm: fc.oneof(lowCeiling, highCeiling),
  });
}

type CeilingArm = "below 2600" | "at or above 2600";

function ceilingArmOf(room: DesignRoom): CeilingArm {
  return room.heightMm < TOP_ROW_CEILING_MM ? "below 2600" : "at or above 2600";
}

/** A tally of which arm each run landed in, asserted after the property. */
function armTally<Arm extends string>() {
  const counts = new Map<Arm, number>();
  return {
    count(arm: Arm): void {
      counts.set(arm, (counts.get(arm) ?? 0) + 1);
    },
    expectEachAtLeast(arms: readonly Arm[], floor: number): void {
      for (const arm of arms) {
        expect(counts.get(arm) ?? 0, arm).toBeGreaterThanOrEqual(floor);
      }
    },
  };
}

const CEILING_ARMS: readonly CeilingArm[] = ["below 2600", "at or above 2600"];

/** A tile's depth as its source declares it at the shell's depth, read through the one reader. */
function declaredDepthMm(source: string): number {
  const definition = SHELL_CATALOG.get(source);
  if (!definition) throw new Error(`the catalogue holds no ${source}`);
  return toMillimetres(occupiedDepthOfEntryM({ buildId: source, definition }));
}

describe("buildLShellDesign over the approved L range", () => {
  it("has no validation finding of either severity (criterion 1)", () => {
    const arms = armTally<CeilingArm>();
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        arms.count(ceilingArmOf(room));

        const findings = validateDesignForCatalog(shellIn(room), SHELL_CATALOG);

        expect(findings).toStrictEqual([]);
      }),
      { numRuns: RUNS },
    );
    arms.expectEachAtLeast(CEILING_ARMS, RUNS_PER_ARM_FLOOR);
  });

  it("records each free run exactly, in every band, to the planned end or one short on an odd span (criterion 3)", () => {
    const parities = armTally<"odd span" | "even span">();
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        for (const wall of WALLS) {
          const floorStartMm = floorRunStartMm(wall);
          const endMm = plannedEndMm(room, wall);
          parities.count(
            (endMm - floorStartMm) % 2 === 0 ? "even span" : "odd span",
          );
          for (const band of bandsUnder(room.heightMm)) {
            const intervals = emptyIntervalsIn(shell, wall, band);

            expect(overlapMm(intervals), `${wall} ${band.name}`).toBe(0);
            expect(unionOf(intervals), `${wall} ${band.name}`).toStrictEqual(
              expectedRecordedRun({ wall, band, room }),
            );
          }
        }
      }),
      { numRuns: RUNS },
    );
    parities.expectEachAtLeast(["odd span", "even span"], RUNS_PER_ARM_FLOOR);
  });

  it("records no empty column wider than 800 mm and nothing above min(room height, 2600) (criterion 3)", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        const ceilingMm = Math.min(room.heightMm, MODULE_GRID_TOP_MM);

        for (const entry of shell.emptyColumns ?? []) {
          expect(entry.widthMm).toBeLessThanOrEqual(MAX_EMPTY_COLUMN_WIDTH_MM);
        }
        for (const entry of [
          ...(shell.emptyColumns ?? []),
          ...(shell.columnExtents ?? []),
        ]) {
          expect(entry.topMm).toBeLessThanOrEqual(ceilingMm);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("records every tile against base-cabinet or wall-cabinet at that source's declared depth (criterion 8)", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        for (const tile of shellIn(room).emptyColumns ?? []) {
          const expectedSource =
            tile.y0Mm === 0 ? "base-cabinet" : "wall-cabinet";

          expect(tile.depthFromBuildId).toBe(expectedSource);
          expect(tile.depthMm).toBe(declaredDepthMm(expectedSource));
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("takes a sink base into the first base opening of every wall with 600 mm of floor run, and offers nothing past a wall (criterion 4)", () => {
    const walls = armTally<"run of 600 or more" | "shorter run">();
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        const { voids } = facesOf(shell);
        for (const opening of voids) {
          expect(openingIntervalOf(opening).endMm).toBeLessThanOrEqual(
            wallLengthMm(opening.wall, room),
          );
        }
        for (const wall of WALLS) {
          const holdsASink = freeFloorRunMm(shell, wall) >= SINK_RUN_MM;
          walls.count(holdsASink ? "run of 600 or more" : "shorter run");
          if (holdsASink) expectSinkInserted(shell, wall);
        }
      }),
      { numRuns: RUNS },
    );
    walls.expectEachAtLeast(["run of 600 or more"], RUNS_PER_ARM_FLOOR);
  });

  it("reports nothing past wall B's end after a change to any declared depth (criterion 9)", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        for (const depthMm of declaredCabinetDepthsMm()) {
          const moved = atCabinetDepth(shell, depthMm);
          const codes = validateDesignForCatalog(
            moved,
            buildKitchenLBodyCatalog(depthMm),
          ).map((issue) => issue.code);

          expect(codes, `at ${String(depthMm)}`).not.toContain(
            "EMPTY_COLUMN_PAST_WALL_END",
          );
          expect(codes, `at ${String(depthMm)}`).not.toContain(
            "COLUMN_EXTENT_PAST_WALL_END",
          );
        }
      }),
      { numRuns: RUNS },
    );
  });

  // **The arm this does not assert, and why:** where wall A has no base opening a base cabinet can
  // take, the panel closes the structural corner base itself, so in a 900–918 mm wall A its outer face
  // stands past the wall before anything is composed. Only wave 7D1b's veto fixes that band (ADR 0045
  // Amendment A), so it is counted here and asserted, as expected to fail, in the block below.
  it("keeps the run-end panel inside wall A once every wall-A base opening holds a base cabinet (ADR 0110 B3a)", () => {
    const arms = armTally<
      "a base cabinet closes the run" | "the corner alone"
    >();
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        const shell = shellIn(room);
        const filled = withWallABaseRunFilled(shell);
        const isClosedByACabinet =
          filled.placements.length > shell.placements.length;
        arms.count(
          isClosedByACabinet
            ? "a base cabinet closes the run"
            : "the corner alone",
        );
        if (!isClosedByACabinet) return;

        const outerFaceMm = runEndPanelOuterFaceMm(filled);

        expect(outerFaceMm).toBeDefined();
        expect(outerFaceMm ?? Infinity).toBeLessThanOrEqual(room.widthMm);
      }),
      { numRuns: RUNS },
    );
    arms.expectEachAtLeast(
      ["a base cabinet closes the run"],
      RUNS_PER_ARM_FLOOR,
    );
  });

  it("builds a byte-identical shell from the same input (criterion 6)", () => {
    fc.assert(
      fc.property(approvedRoom(), (room) => {
        expect(JSON.stringify(shellIn(room))).toBe(
          JSON.stringify(shellIn(room)),
        );
      }),
      { numRuns: RUNS },
    );
  });
});

// **Expected to fail until wave 7D1b, which owns the flip** (ADR 0045 Amendment A; milestone,
// Adjudication 7D1-Q2). With wall A from 900 to 918 mm there is no floor run a base cabinet can take,
// so the run-end panel closes the structural corner base itself and its outer face lands at the
// corner's far edge plus the panel's footprint — past the wall. The owner ruled that a panel whose
// outer face would pass wall A's end is not drawn; 7D1b puts that veto in `runEndPanelSeatM`, every
// case below then passes, the `it.fails` marker goes red, and that wave flips each one to `it`.
//
// **`it.fails` passes on any throw**, so the premise beside the cases proves their bodies reach the
// assertion: every room in the band builds with no finding, and filling wall A places nothing.
describe("the run-end panel when the corner alone closes wall A's run — flips in 7D1b", () => {
  const widthsMm = cornerAloneWallAWidthsMm();

  it("sweeps every wall A from the approved minimum to the last width the corner's panel passes (premise)", () => {
    expect([widthsMm[0], widthsMm.at(-1)]).toStrictEqual([
      FIRST_CORNER_ALONE_WIDTH_MM,
      LAST_CORNER_ALONE_WIDTH_MM,
    ]);
    for (const widthMm of widthsMm) {
      const shell = shellIn(cornerAloneRoom(widthMm));

      expect(validateDesignForCatalog(shell, SHELL_CATALOG)).toStrictEqual([]);
      expect(withWallABaseRunFilled(shell).placements).toStrictEqual(
        shell.placements,
      );
    }
  });

  for (const widthMm of widthsMm) {
    it.fails(
      `keeps the run-end panel inside wall A when the corner alone closes the run (${String(widthMm)}) — flips in 7D1b`,
      () => {
        const room = cornerAloneRoom(widthMm);

        const outerFaceMm = runEndPanelOuterFaceMm(
          withWallABaseRunFilled(shellIn(room)),
        );

        expect(outerFaceMm === undefined || outerFaceMm <= room.widthMm).toBe(
          true,
        );
      },
    );
  }
});

/** Measured, not derived: the approved wall-A minimum, and the widest wall A the corner base's own
 *  panel still passes (its far edge 900, plus the panel's 19 mm, less one). */
const FIRST_CORNER_ALONE_WIDTH_MM = 900;
const LAST_CORNER_ALONE_WIDTH_MM = 918;

/** Every wall A from the approved minimum to the last width whose panel, closing the corner base,
 *  would pass the wall: the corner's far edge plus the panel's footprint, less one millimetre. */
function cornerAloneWallAWidthsMm(): readonly number[] {
  const firstMm = approvedL().wallA.minMm;
  const lastMm = floorRunStartMm("A") + RUN_END_PANEL_FOOTPRINT_MM - 1;
  return Array.from({ length: lastMm - firstMm + 1 }, (_, i) => firstMm + i);
}

function cornerAloneRoom(widthMm: number): DesignRoom {
  const l = approvedL();
  return {
    shape: "L",
    widthMm,
    depthMm: l.wallB.minMm,
    heightMm: TOP_ROW_CEILING_MM,
  };
}

/** The owner's threshold for a wall that must take a sink: criterion 4's 600 mm. */
const SINK_RUN_MM = 600;

/** What one wall records in one band: the floor run from past every structural piece to the last
 *  millimetre a whole-millimetre centre reaches short of the planned end (P3), and — in a band whose
 *  own run starts nearer the corner, as wall A's wall and top rows do — the stretch over the corner
 *  base up to the floor run's start, which neither the finished end nor the reserve shortens. */
function expectedRecordedRun(where: {
  readonly wall: DesignWall;
  readonly band: BandMm;
  readonly room: DesignRoom;
}): readonly IntervalMm[] {
  const floorStartMm = floorRunStartMm(where.wall);
  const floorEndMm = reachableEndMm(
    floorStartMm,
    plannedEndMm(where.room, where.wall),
  );
  return unionOf([
    ...segment(runStartMm(where.wall, where.band), floorStartMm),
    ...segment(floorStartMm, floorEndMm),
  ]);
}

function segment(startMm: number, endMm: number): readonly IntervalMm[] {
  return endMm > startMm ? [{ startMm, endMm }] : [];
}

/** A floor run starts past every structural piece on its wall, in whatever band the piece stands. */
function floorRunStartMm(wall: DesignWall): number {
  return Math.max(
    ...bandsUnder(MODULE_GRID_TOP_MM).map((band) => runStartMm(wall, band)),
  );
}

function expectSinkInserted(shell: Design, wall: DesignWall): void {
  const opening = firstBaseOpening(facesOf(shell).voids, wall);
  expect(opening, `a base opening on wall ${wall}`).toBeDefined();
  if (!opening) return;

  const result = insertSinkInto(shell, opening);

  expect(
    result.ok,
    `wall ${wall}: ${result.ok ? "" : result.reason.code}`,
  ).toBe(true);
}
