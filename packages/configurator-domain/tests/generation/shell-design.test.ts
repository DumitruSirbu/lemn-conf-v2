// Wave 7D1: the composition shell (ADR 0110 decision 1, as its Amendment B and the milestone's
// Adjudication 7D1-P rule it), on named rooms. The same claims over the approved range are in
// `shell-design.property.test.ts`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  declaredCabinetDepthsMm,
  DesignSchema,
  KITCHEN_L_DESIGN,
  LShellInputError,
  projectFrozenMap,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignValidationCode,
  type DesignWall,
  type EmptyColumn,
  type LShellInputRefusal,
  type MillimetreBounds,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { clearBodies } from "../support/commands.js";
import { createWorld } from "../support/kitchen-world.js";
import {
  alongIntervalOf,
  bandsUnder,
  differenceOf,
  emptyIntervalsIn,
  facesOf,
  firstBaseOpening,
  insertSinkInto,
  isStructuralBuildId,
  liesInside,
  openingIntervalOf,
  plannedEndMm,
  reachableEndMm,
  reachesIntoBand,
  RUN_END_PANEL_FOOTPRINT_MM,
  runEndPanelOuterFaceMm,
  runStartMm,
  SHELL_CABINET_DEPTH_MM,
  SHELL_OCCURRED_AT,
  SINK_BUILD_ID,
  STRUCTURAL_ASSEMBLY,
  unionOf,
  wallBReserveMm,
  WALLS,
  withWallABaseRunFilled,
  type BandMm,
  type IntervalMm,
  atCabinetDepth,
  shellIn,
} from "../support/shell-design.js";

const REFERENCE_ROOM: DesignRoom = { ...KITCHEN_L_DESIGN.room };

/** The smallest room the owner approved, which the 7A logic reviewer's failing case was run in. */
const SMALLEST_APPROVED_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 900,
  depthMm: 1000,
  heightMm: 2200,
};

/** The approved ceiling's floor and roof, and the last height at which the top row does not fit. */
const LOWEST_CEILING_MM = 2200;
const HIGHEST_CEILING_WITHOUT_TOP_ROW_MM = 2599;
const TOP_ROW_CEILING_MM = 2600;
const HIGHEST_CEILING_MM = 3900;

/** A ceiling inside the top row, so the top band exists and the top-row return does not fit. */
const MID_TOP_ROW_CEILING_MM = 2400;

/** Measured, not derived (ADR 0090 Amendment B's anchor rule): the corner's floor piece slides
 *  100 mm along wall B between the 600 and the 700 mm kitchen (ADR 0108 Amendment A's table). */
const WALL_B_RESERVE_TODAY_MM = 100;

/** Measured, not derived: the run-end panel's 1 mm gap and 18 mm slab (ADR 0110 B3a, "19 mm today"). */
const RUN_END_PANEL_FOOTPRINT_TODAY_MM = 19;

const NEUTRAL_TILE_SOURCES = ["base-cabinet", "wall-cabinet"];

const ABOVE_ROOM_CODES: readonly DesignValidationCode[] = [
  "PLACEMENT_ABOVE_ROOM",
  "COLUMN_EXTENT_ABOVE_ROOM",
  "EMPTY_COLUMN_ABOVE_ROOM",
];

const PAST_WALL_END_CODES: readonly DesignValidationCode[] = [
  "EMPTY_COLUMN_PAST_WALL_END",
  "COLUMN_EXTENT_PAST_WALL_END",
];

const GENERATION_SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "generation",
);

/** The code a build refused with, or none when it built. Any other error propagates. */
function refusalOf(build: () => Design): LShellInputRefusal | undefined {
  try {
    build();
  } catch (error) {
    if (error instanceof LShellInputError) return error.refusal;
    throw error;
  }
  return undefined;
}

type RoomDimension = "widthMm" | "depthMm" | "heightMm";

function withDimension(
  room: DesignRoom,
  change: { readonly field: RoomDimension; readonly valueMm: number },
): DesignRoom {
  return { ...room, [change.field]: change.valueMm };
}

function atHeight(room: DesignRoom, heightMm: number): DesignRoom {
  return { ...room, heightMm };
}

function placementIds(design: Design): readonly string[] {
  return design.placements.map((placement) => placement.id);
}

function findingCodes(design: Design, cabinetDepthMm: number) {
  return validateDesignForCatalog(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  ).map((issue) => issue.code);
}

/** The past-the-wall findings on wall B, each located through the entry its path names. */
function wallBPastWallFindings(
  design: Design,
  cabinetDepthMm: number,
): readonly string[] {
  return validateDesignForCatalog(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  )
    .filter((issue) => PAST_WALL_END_CODES.includes(issue.code))
    .filter((issue) => entryAtPath(design, issue.path)?.wall === "B")
    .map((issue) => `${issue.code}@${issue.path}`);
}

function entryAtPath(
  design: Design,
  issuePath: string,
): EmptyColumn | undefined {
  const [array, index] = issuePath.split(".");
  const entries =
    array === "emptyColumns" ? design.emptyColumns : design.columnExtents;
  return entries?.[Number(index)];
}

function farEdgeMm(placement: DesignPlacement): number {
  return placement.alongMm + placement.body.widthMm / 2;
}

/** The top-row corner return, found by what it is rather than by its id: the structural piece on
 *  wall B whose top is highest. */
function topRowCornerReturn(): DesignPlacement {
  const [highest] = STRUCTURAL_ASSEMBLY.filter(
    (placement) => placement.wall === "B",
  ).sort(
    (left, right) =>
      right.y0Mm + right.body.heightMm - (left.y0Mm + left.body.heightMm),
  );
  if (!highest) throw new Error("the reference has no corner on wall B");
  return highest;
}

function bandNamed(heightMm: number, name: string): BandMm {
  const band = bandsUnder(heightMm).find(
    (candidate) => candidate.name === name,
  );
  if (!band) {
    throw new Error(`a ${String(heightMm)} mm room has no ${name} band`);
  }
  return band;
}

/** The shell with wall B's reserve deliberately filled: one more floor tile from where the run
 *  stops to the wall's own end, shaped like the run's last tile. */
function withWallBReserveFilled(shell: Design): Design {
  const wallBTiles = (shell.emptyColumns ?? []).filter(
    (entry) => entry.wall === "B" && entry.y0Mm === 0,
  );
  const last = wallBTiles.at(-1);
  if (!last) throw new Error("the shell records no floor run on wall B");
  const runEndMm = alongIntervalOf(last).endMm;
  const reserveMm = wallLengthMm("B", shell.room) - runEndMm;
  const filler: EmptyColumn = {
    ...last,
    alongMm: runEndMm + reserveMm / 2,
    widthMm: reserveMm,
  };
  return { ...shell, emptyColumns: [...(shell.emptyColumns ?? []), filler] };
}

/** Every along-wall interval an entry list records on `wall` in `band`. */
function intervalsIn(
  entries: readonly EmptyColumn[],
  wall: DesignWall,
  band: BandMm,
): readonly IntervalMm[] {
  return entries
    .filter(
      (entry) =>
        entry.wall === wall &&
        reachesIntoBand({ floorMm: entry.y0Mm, topMm: entry.topMm }, band),
    )
    .map(alongIntervalOf);
}

function recordedEntriesOf(design: Design): readonly EmptyColumn[] {
  return [...(design.emptyColumns ?? []), ...(design.columnExtents ?? [])];
}

/** The reference kitchen with every non-structural body removed **through the command**, its frozen
 *  map carried the way the store carries it and then projected — criterion 5's independent route. */
function commandPathReplay(): readonly EmptyColumn[] {
  const world = createWorld(
    KITCHEN_L_DESIGN,
    buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM),
  );
  const cleared = clearBodies(
    world,
    KITCHEN_L_DESIGN.placements
      .filter((placement) => !isStructuralBuildId(placement.body.buildId))
      .map((placement) => placement.id),
  );
  const frozen = projectFrozenMap(cleared.columns, cleared.records);
  return [...(frozen.emptyColumns ?? []), ...(frozen.columnExtents ?? [])];
}

/** Where the reference kitchen's own run ends on `wall`. */
function referenceRunEndMm(wall: DesignWall): number {
  return Math.max(
    ...KITCHEN_L_DESIGN.placements
      .filter((placement) => placement.wall === wall)
      .map(farEdgeMm),
  );
}

describe("buildLShellDesign — the document it writes", () => {
  it("passes the entered room through untouched", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 4321,
      depthMm: 2345,
      heightMm: 2468,
    };

    expect(shellIn(room).room).toStrictEqual(room);
  });

  it("carries the reference kitchen's settings and no preset", () => {
    const shell = shellIn(REFERENCE_ROOM);

    expect(shell.settings).toStrictEqual(KITCHEN_L_DESIGN.settings);
    expect(shell.presetId).toBeNull();
  });

  it("is created and updated at the caller's moment (P7)", () => {
    const shell = shellIn(REFERENCE_ROOM);

    expect(shell.createdAt).toBe(SHELL_OCCURRED_AT);
    expect(shell.updatedAt).toBe(SHELL_OCCURRED_AT);
  });

  it("refuses a room that is not an L, by code", () => {
    const straight: DesignRoom = { ...REFERENCE_ROOM, shape: "linear" };

    const refusal = refusalOf(() => shellIn(straight));

    expect(refusal).toBe("ROOM_NOT_L");
  });

  it("refuses a room carrying a key a stored design cannot, by code (Q1.5)", () => {
    const withAnExtraKey = { ...REFERENCE_ROOM, depthSetting: 700 };

    const refusal = refusalOf(() => shellIn(withAnExtraKey));

    expect(refusal).toBe("ROOM_NOT_A_DESIGN_ROOM");
  });

  it("builds from a room of exactly its four fields, into a document DesignSchema parses (Q1.5)", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: REFERENCE_ROOM.widthMm,
      depthMm: REFERENCE_ROOM.depthMm,
      heightMm: REFERENCE_ROOM.heightMm,
    };

    const refusal = refusalOf(() => shellIn(room));

    expect(refusal).toBeUndefined();
    expect(DesignSchema.safeParse(shellIn(room)).success).toBe(true);
  });

  // ADR 0129 D2: cornerDirection joined DesignRoomSchema this wave, so it is now a key a stored
  // design *can* carry, and passes through this same untouched-room path (Q1.5's other half).
  it("builds from a room carrying cornerDirection: right, untouched (ADR 0129 D2)", () => {
    const room: DesignRoom = { ...REFERENCE_ROOM, cornerDirection: "right" };

    const shell = shellIn(room);

    expect(shell.room).toStrictEqual(room);
    expect(DesignSchema.safeParse(shell).success).toBe(true);
  });

  it("refuses a moment that is not a timestamp, by code", () => {
    const refusal = refusalOf(() =>
      buildLShellDesign({ room: REFERENCE_ROOM, occurredAt: "yesterday" }),
    );

    expect(refusal).toBe("INVALID_OCCURRED_AT");
  });

  it("gives the same input a byte-identical shell (criterion 6)", () => {
    const first = JSON.stringify(shellIn(REFERENCE_ROOM));
    const second = JSON.stringify(shellIn(REFERENCE_ROOM));

    expect(second).toBe(first);
  });

  it("has no finding of either severity in the reference room or the smallest approved one", () => {
    expect(
      findingCodes(shellIn(REFERENCE_ROOM), SHELL_CABINET_DEPTH_MM),
    ).toStrictEqual([]);
    expect(
      findingCodes(shellIn(SMALLEST_APPROVED_ROOM), SHELL_CABINET_DEPTH_MM),
    ).toStrictEqual([]);
  });
});

describe("buildLShellDesign — the engine's own limits (R1.2)", () => {
  /** What a case expects when the builder refuses nothing. */
  const BUILDS = "builds";
  const walls = ENGINE_ROOM_LIMITS.buildableShapes.L;
  if (!walls) throw new Error("the engine limits state no L");
  const FIELDS: readonly (readonly [RoomDimension, MillimetreBounds])[] = [
    ["widthMm", walls.wallA],
    ["depthMm", walls.wallB],
    ["heightMm", ENGINE_ROOM_LIMITS.heightBounds],
  ];
  // Each limit's maximum is the wire bound for its axis (ADR 0108 decision 7), so one past it is a
  // room no design can store and the schema — checked first — is what refuses it.
  const cases = FIELDS.flatMap(
    ([field, bounds]) =>
      [
        [field, "min − 1", bounds.minMm - 1, "ROOM_OUTSIDE_ENGINE_LIMITS"],
        [field, "min", bounds.minMm, BUILDS],
        [field, "max", bounds.maxMm, BUILDS],
        [field, "max + 1", bounds.maxMm + 1, "ROOM_NOT_A_DESIGN_ROOM"],
      ] as const,
  );

  it.each(cases)(
    "%s at its %s (%i mm): %s",
    (field, _edge, valueMm, expected) => {
      const room = withDimension(REFERENCE_ROOM, { field, valueMm });

      expect(refusalOf(() => shellIn(room)) ?? BUILDS).toBe(expected);
    },
  );

  it.each([
    ["a ceiling under the base row", "heightMm", 700],
    ["a wall A shorter than its corner", "widthMm", 500],
  ] as const)(
    "refuses %s, which the schema stores and the engine cannot build",
    (_what, field, valueMm) => {
      const room = withDimension(REFERENCE_ROOM, { field, valueMm });

      expect(refusalOf(() => shellIn(room))).toBe("ROOM_OUTSIDE_ENGINE_LIMITS");
    },
  );

  it("judges the room before the moment: a room outside the limits with a bad timestamp names the room", () => {
    const room = withDimension(REFERENCE_ROOM, {
      field: "widthMm",
      valueMm: 500,
    });

    const refusal = refusalOf(() =>
      buildLShellDesign({ room, occurredAt: "yesterday" }),
    );

    expect(refusal).toBe("ROOM_OUTSIDE_ENGINE_LIMITS");
  });
});

describe("buildLShellDesign — a room no taller than the wall row (R1.2)", () => {
  /** The engine's lowest ceiling, the wall row's floor, and one millimetre above it. */
  const ENGINE_LOWEST_CEILING_MM = 860;
  const WALL_ROW_FLOOR_MM = 1500;

  it.each([ENGINE_LOWEST_CEILING_MM, WALL_ROW_FLOOR_MM, WALL_ROW_FLOOR_MM + 1])(
    "has no finding of either severity at %i mm",
    (heightMm) => {
      const shell = shellIn(atHeight(REFERENCE_ROOM, heightMm));

      expect(findingCodes(shell, SHELL_CABINET_DEPTH_MM)).toStrictEqual([]);
    },
  );

  it("records floor tiles only when the ceiling is the wall row's floor", () => {
    const shell = shellIn(atHeight(REFERENCE_ROOM, WALL_ROW_FLOOR_MM));
    const tiles = shell.emptyColumns ?? [];

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.filter((tile) => tile.y0Mm !== 0)).toStrictEqual([]);
  });

  it("records the wall-only run again one millimetre above the wall row's floor", () => {
    const shell = shellIn(atHeight(REFERENCE_ROOM, WALL_ROW_FLOOR_MM + 1));

    expect(
      (shell.emptyColumns ?? []).filter(
        (tile) => tile.y0Mm === WALL_ROW_FLOOR_MM,
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("buildLShellDesign — the corner (criterion 2)", () => {
  it.each([
    LOWEST_CEILING_MM,
    HIGHEST_CEILING_WITHOUT_TOP_ROW_MM,
    TOP_ROW_CEILING_MM,
    HIGHEST_CEILING_MM,
  ])(
    "holds exactly the structural pieces whose top fits under %i mm",
    (heightMm) => {
      const shell = shellIn(atHeight(REFERENCE_ROOM, heightMm));

      expect(placementIds(shell)).toStrictEqual(
        STRUCTURAL_ASSEMBLY.filter(
          (placement) => placement.y0Mm + placement.body.heightMm <= heightMm,
        ).map((placement) => placement.id),
      );
    },
  );

  it("leaves the top-row wall-B return out at 2599 and puts it in at 2600", () => {
    const returnId = topRowCornerReturn().id;

    const below = shellIn(
      atHeight(REFERENCE_ROOM, HIGHEST_CEILING_WITHOUT_TOP_ROW_MM),
    );
    const at = shellIn(atHeight(REFERENCE_ROOM, TOP_ROW_CEILING_MM));

    expect(placementIds(below)).not.toContain(returnId);
    expect(placementIds(at)).toContain(returnId);
  });

  it("places no body the catalogue does not declare structural (criterion 7)", () => {
    const shell = shellIn(atHeight(REFERENCE_ROOM, HIGHEST_CEILING_MM));

    expect(
      shell.placements.filter(
        (placement) => !isStructuralBuildId(placement.body.buildId),
      ),
    ).toStrictEqual([]);
  });

  describe.each([
    ["the smallest approved room", SMALLEST_APPROVED_ROOM],
    ["the reference room's walls", REFERENCE_ROOM],
  ])("in %s", (_name, room) => {
    it.each([LOWEST_CEILING_MM, HIGHEST_CEILING_WITHOUT_TOP_ROW_MM])(
      "reports neither PLACEMENT_ABOVE_ROOM nor COLUMN_EXTENT_ABOVE_ROOM / EMPTY_COLUMN_ABOVE_ROOM at %i mm, as built and at every other declared depth",
      (heightMm) => {
        const shell = shellIn(atHeight(room, heightMm));
        const otherDepthsMm = declaredCabinetDepthsMm().filter(
          (depthMm) => depthMm !== SHELL_CABINET_DEPTH_MM,
        );

        const codes = [
          ...findingCodes(shell, SHELL_CABINET_DEPTH_MM),
          ...otherDepthsMm.flatMap((depthMm) =>
            findingCodes(atCabinetDepth(shell, depthMm), depthMm),
          ),
        ];

        expect(otherDepthsMm.length).toBeGreaterThan(0);
        expect(
          codes.filter((code) => ABOVE_ROOM_CODES.includes(code)),
        ).toStrictEqual([]);
      },
    );
  });

  it("records nothing in the zone a ceiling-excluded top-row return reserves (P5 iii)", () => {
    const shell = shellIn(atHeight(REFERENCE_ROOM, MID_TOP_ROW_CEILING_MM));
    const topBand = bandNamed(MID_TOP_ROW_CEILING_MM, "top");

    const onBInTopBand = intervalsIn(recordedEntriesOf(shell), "B", topBand);

    expect(placementIds(shell)).not.toContain(topRowCornerReturn().id);
    expect(onBInTopBand.length).toBeGreaterThan(0);
    expect(Math.min(...onBInTopBand.map((interval) => interval.startMm))).toBe(
      farEdgeMm(topRowCornerReturn()),
    );
  });
});

describe("buildLShellDesign — the free runs (criteria 3 and 8)", () => {
  it("tiles the reference room's runs from the corner's far edge, wall A to its end and wall B short by the reserve", () => {
    const shell = shellIn(REFERENCE_ROOM);
    const baseBand = bandNamed(REFERENCE_ROOM.heightMm, "base");
    const wallBand = bandNamed(REFERENCE_ROOM.heightMm, "wall");

    expect(unionOf(emptyIntervalsIn(shell, "A", baseBand))).toStrictEqual([
      { startMm: 900, endMm: REFERENCE_ROOM.widthMm },
    ]);
    expect(unionOf(emptyIntervalsIn(shell, "A", wallBand))).toStrictEqual([
      { startMm: 0, endMm: REFERENCE_ROOM.widthMm },
    ]);
    expect(unionOf(emptyIntervalsIn(shell, "B", baseBand))).toStrictEqual([
      { startMm: 900, endMm: REFERENCE_ROOM.depthMm - WALL_B_RESERVE_TODAY_MM },
    ]);
  });

  it("reserves on wall B exactly what the corner's floor piece slides at the deepest declared depth", () => {
    expect(wallBReserveMm()).toBe(WALL_B_RESERVE_TODAY_MM);
  });

  it("measures the run-end panel's footprint as its gap and slab", () => {
    expect(RUN_END_PANEL_FOOTPRINT_MM).toBe(RUN_END_PANEL_FOOTPRINT_TODAY_MM);
  });

  it("gives up the last millimetre of an odd span, at the far end", () => {
    const room: DesignRoom = { ...REFERENCE_ROOM, widthMm: 3561 };
    const plannedEndOfWallAMm = plannedEndMm(room, "A");
    const shell = shellIn(room);

    expect((plannedEndOfWallAMm - 900) % 2).toBe(1);
    expect(
      unionOf(emptyIntervalsIn(shell, "A", bandNamed(room.heightMm, "base"))),
    ).toStrictEqual([{ startMm: 900, endMm: plannedEndOfWallAMm - 1 }]);
  });

  it("records a wall B too short for a run as no run at all", () => {
    const shell = shellIn(SMALLEST_APPROVED_ROOM);

    expect(
      (shell.emptyColumns ?? []).filter((entry) => entry.wall === "B"),
    ).toStrictEqual([]);
    expect(plannedEndMm(SMALLEST_APPROVED_ROOM, "B")).toBe(900);
  });

  // Measured literals beside the reader-derived property (R1.4): a change to the reader moves the
  // property's expectation with it, and these do not.
  it.each([
    [600, 620, 330],
    [700, 720, 400],
  ])(
    "in a %i mm kitchen, records floor tiles at %i mm and wall-only tiles at %i mm",
    (cabinetDepthMm, floorTileMm, wallOnlyTileMm) => {
      const shell = shellIn(REFERENCE_ROOM);
      const moved =
        cabinetDepthMm === SHELL_CABINET_DEPTH_MM
          ? shell
          : atCabinetDepth(shell, cabinetDepthMm);
      const tiles = moved.emptyColumns ?? [];

      expect([
        ...new Set(
          tiles.filter((tile) => tile.y0Mm === 0).map((tile) => tile.depthMm),
        ),
      ]).toStrictEqual([floorTileMm]);
      expect([
        ...new Set(
          tiles.filter((tile) => tile.y0Mm > 0).map((tile) => tile.depthMm),
        ),
      ]).toStrictEqual([wallOnlyTileMm]);
    },
  );

  it("records every tile against a neutral catalogue source at that source's own declared depth", () => {
    const shell = shellIn(REFERENCE_ROOM);
    const referenceBuildIds = new Set(
      KITCHEN_L_DESIGN.placements.map((placement) => placement.body.buildId),
    );
    const tiles = shell.emptyColumns ?? [];

    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(NEUTRAL_TILE_SOURCES).toContain(tile.depthFromBuildId);
      expect(referenceBuildIds.has(tile.depthFromBuildId ?? "")).toBe(false);
    }
  });
});

describe("buildLShellDesign — the engine can insert into it (criterion 4)", () => {
  it.each(WALLS)(
    "puts a sink base into wall %s's first base opening",
    (wall) => {
      const shell = shellIn(REFERENCE_ROOM);
      const opening = firstBaseOpening(facesOf(shell).voids, wall);
      if (!opening) throw new Error(`no base opening on wall ${wall}`);

      const result = insertSinkInto(shell, opening);

      expect(result.ok).toBe(true);
      expect(
        result.design.placements
          .filter((placement) => !isStructuralBuildId(placement.body.buildId))
          .map((placement) => [placement.wall, placement.body.buildId]),
      ).toStrictEqual([[wall, SINK_BUILD_ID]]);
    },
  );

  it("publishes no opening past either wall's end", () => {
    const shell = shellIn(REFERENCE_ROOM);

    for (const opening of facesOf(shell).voids) {
      expect(openingIntervalOf(opening).endMm).toBeLessThanOrEqual(
        wallLengthMm(opening.wall, shell.room),
      );
    }
  });
});

describe("buildLShellDesign — the finished end of a filled wall-A run (ADR 0045 Amendment A)", () => {
  it("draws no run-end panel once every wall-A base opening holds a base cabinet and the run reaches the wall", () => {
    const filled = withWallABaseRunFilled(shellIn(REFERENCE_ROOM));

    const outerFaceMm = runEndPanelOuterFaceMm(filled);

    expect(outerFaceMm).toBeUndefined();
  });

  it("draws the panel again once the last cabinet stops exactly the panel's footprint short of the wall", () => {
    const filled = withWallABaseRunFilled(shellIn(REFERENCE_ROOM));
    const roomWithTheFootprintFree: DesignRoom = {
      ...REFERENCE_ROOM,
      widthMm: REFERENCE_ROOM.widthMm + RUN_END_PANEL_FOOTPRINT_MM,
    };

    const outerFaceMm = runEndPanelOuterFaceMm({
      ...filled,
      room: roomWithTheFootprintFree,
    });

    expect(outerFaceMm).toBe(roomWithTheFootprintFree.widthMm);
  });

  it("fills wall A's floor run to its planned end, so the panel is tested where it binds", () => {
    const filled = withWallABaseRunFilled(shellIn(REFERENCE_ROOM));
    const wallABases = filled.placements.filter(
      (placement) =>
        placement.wall === "A" && !isStructuralBuildId(placement.body.buildId),
    );

    expect(Math.max(...wallABases.map(farEdgeMm))).toBe(
      reachableEndMm(900, plannedEndMm(REFERENCE_ROOM, "A")),
    );
  });
});

describe("buildLShellDesign — the command path as witness (criterion 5)", () => {
  it("records inside its own union every interval the removal replay records", () => {
    const shell = shellIn(REFERENCE_ROOM);
    const replay = commandPathReplay();

    for (const wall of WALLS) {
      for (const band of bandsUnder(REFERENCE_ROOM.heightMm)) {
        expect(
          liesInside(
            intervalsIn(replay, wall, band),
            intervalsIn(recordedEntriesOf(shell), wall, band),
          ),
          `${wall} ${band.name}`,
        ).toBe(true);
      }
    }
  });

  it("records beyond the replay only between the reference run's end and the planned end", () => {
    const shell = shellIn(REFERENCE_ROOM);
    const replay = commandPathReplay();

    for (const wall of WALLS) {
      for (const band of bandsUnder(REFERENCE_ROOM.heightMm)) {
        const beyond = differenceOf(
          intervalsIn(recordedEntriesOf(shell), wall, band),
          intervalsIn(replay, wall, band),
        );
        expect(beyond, `${wall} ${band.name}`).toStrictEqual([
          {
            startMm: referenceRunEndMm(wall),
            endMm: reachableEndMm(
              runStartMm(wall, bandNamed(REFERENCE_ROOM.heightMm, "base")),
              plannedEndMm(REFERENCE_ROOM, wall),
            ),
          },
        ]);
      }
    }
  });
});

describe("buildLShellDesign — a proposal fits at every declared depth (criterion 9)", () => {
  it("reports nothing past wall B's end at any declared depth", () => {
    const shell = shellIn(REFERENCE_ROOM);

    for (const depthMm of declaredCabinetDepthsMm()) {
      expect(
        wallBPastWallFindings(atCabinetDepth(shell, depthMm), depthMm),
        `at ${String(depthMm)}`,
      ).toStrictEqual([]);
    }
  });

  it("reports past wall B's end once the reserve is filled — the reserve is what holds it", () => {
    const filled = withWallBReserveFilled(shellIn(REFERENCE_ROOM));
    const deepestMm = Math.max(...declaredCabinetDepthsMm());

    expect(findingCodes(filled, SHELL_CABINET_DEPTH_MM)).toStrictEqual([]);
    expect(
      wallBPastWallFindings(atCabinetDepth(filled, deepestMm), deepestMm),
    ).not.toStrictEqual([]);
  });
});

describe("buildLShellDesign — what src/generation/ does not do (criteria 7 and 10)", () => {
  const sources = readdirSync(GENERATION_SOURCE)
    // 7D2 necessarily adds a probe-owning generator and the store-equivalent command funnel.
    // These 7D1 must-nots govern the shell builder, not every later module in its directory.
    .filter((name) => name === "shell-design.ts")
    .map((name) => ({
      name,
      text: readFileSync(path.join(GENERATION_SOURCE, name), "utf8"),
    }));

  it("scans a non-empty set of modules, the shell's among them", () => {
    expect(sources.map((source) => source.name)).toContain("shell-design.ts");
  });

  it.each([
    ["calls removePlacement", /\bremovePlacement\s*\(|remove-placement\.js/],
    [
      "calls clipEmptyColumnsAtWallEnd",
      /\bclipEmptyColumnsAtWallEnd\s*\(|clip-empty-columns-at-wall-end\.js/,
    ],
    // `[^;]*` spans a multi-line specifier list and a bare side-effect import alike.
    ["imports a probe", /\bimport\b[^;]*"[^"]*body-probe\.js"/],
    ["imports a price book", /\bimport\b[^;]*"[^"]*\/pricing\//],
  ])("never %s", (_what, pattern) => {
    expect(
      sources.filter((source) => pattern.test(source.text)).map((s) => s.name),
    ).toStrictEqual([]);
  });
});
