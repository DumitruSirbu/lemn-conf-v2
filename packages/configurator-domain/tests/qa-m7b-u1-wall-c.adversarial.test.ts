// M7B wave U1 — adversarial QA for the stored U and wall C (ADR 0132; plan § Wave U1, AC3–AC9).
//
// AC1 and AC2 (byte identity and old documents, base against tip) need a build of the wave base and
// are measured outside the suite; AC6 lives in `qa-m7b-u1-mirror-equivariance.property.test.ts`.
// Every U below is hand-built: `isShapeBuildable("U", APPROVED_ROOM_POLICY)` stays false this wave.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import { MAX_ROOM_DEPTH_MM } from "../src/design-bounds.js";
import {
  DesignRoomSchema,
  DesignSchema,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type EmptyColumn,
} from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import {
  findOverflowingPlacementIds,
  wallLengthMm,
} from "../src/queries/overflowing-placements.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  projectFrozenMap,
  withFrozenMap,
  type VoidRecord,
} from "../src/void-engine.js";
import { clearBodies, insertInto } from "./support/commands.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import {
  BACKSPLASH_ZONE,
  intersectsNoModuleLine,
} from "./support/invariants.js";
import { createWorld, voidAt, advance } from "./support/kitchen-world.js";
import { mirrorUDesign, sortedFindings } from "./support/mirror-u-design.js";

const OCCURRED_AT = "2026-09-29T00:00:00.000Z";
const catalog = buildKitchenLBodyCatalog(600);

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 3600,
  depthMm: 2400,
  wallCMm: 2000,
  heightMm: 2600,
};

function designIn(
  room: DesignRoom,
  placements: readonly DesignPlacement[],
  recorded: Pick<Design, "emptyColumns" | "columnExtents"> = {},
): Design {
  return {
    room,
    presetId: null,
    placements: [...placements],
    ...recorded,
    settings: { cabinetDepthMm: 600 },
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  };
}

function body(
  id: string,
  wall: DesignWall,
  alongMm: number,
  buildId = "base-drawer3-600",
): DesignPlacement {
  const definition = catalog.get(buildId);
  if (!definition) throw new Error(`no catalogue row ${buildId}`);
  const fixtureTwin = KITCHEN_L_DESIGN.placements.find(
    (placement) => placement.body.buildId === buildId,
  );
  if (!fixtureTwin) throw new Error(`no fixture body wears ${buildId}`);
  return {
    id,
    wall,
    alongMm,
    y0Mm: fixtureTwin.y0Mm,
    body: fixtureTwin.body,
  };
}

function codesOf(design: Design): string[] {
  return validateDesignForCatalog(design, catalog).map(({ code }) => code);
}

// =================================================================================================
// AC3 — the schema's shape.
// =================================================================================================

/** `U_ROOM` with its `wallCMm` key absent, not merely `undefined`. */
const withoutWallC = {
  shape: U_ROOM.shape,
  widthMm: U_ROOM.widthMm,
  depthMm: U_ROOM.depthMm,
  heightMm: U_ROOM.heightMm,
};

describe("AC3 — DesignRoomSchema refuses every hostile wallCMm on a U", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["a float", 2000.5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["one past the bound", MAX_ROOM_DEPTH_MM + 1],
    ["a numeric string", "2000"],
    ["null", null],
  ])("refuses wallCMm as %s, naming wallCMm", (_name, wallCMm) => {
    const result = DesignRoomSchema.safeParse({ ...U_ROOM, wallCMm });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["wallCMm"],
    ]);
  });

  it("refuses a U whose wallCMm key is present but undefined", () => {
    expect(
      DesignRoomSchema.safeParse({ ...U_ROOM, wallCMm: undefined }).success,
    ).toBe(false);
  });

  it("reports both faults of a U with no wallCMm that also claims a right-hand corner", () => {
    const result = DesignRoomSchema.safeParse({
      ...withoutWallC,
      cornerDirection: "right",
    });

    expect(
      result.error?.issues.map((issue) => issue.path.join(".")).sort(),
    ).toEqual(["cornerDirection", "wallCMm"]);
  });

  it("refuses a U through the whole-document schema too, not only the room's", () => {
    const design = designIn(withoutWallC as DesignRoom, []);

    expect(DesignSchema.safeParse(design).success).toBe(false);
  });

  propertyTest.prop([
    fc.constantFrom("L" as const, "linear" as const),
    fc.integer({ min: 1, max: MAX_ROOM_DEPTH_MM }),
  ])(
    "refuses wallCMm on an L or a straight room at every legal length",
    (shape, wallCMm) => {
      const result = DesignRoomSchema.safeParse({
        shape,
        widthMm: 3600,
        depthMm: 2400,
        wallCMm,
        heightMm: 2600,
      });

      expect(result.success).toBe(false);
    },
  );
});

describe("AC3 — a wall-C entry in an L or a straight document is marked, never refused (D6)", () => {
  const strayOnC = body("stray", "C", 300);
  const strayEmptyOnC: EmptyColumn = {
    wall: "C",
    alongMm: 1500,
    widthMm: 400,
    y0Mm: 0,
    topMm: 820,
    depthMm: 580,
  };

  it.each(["L", "linear"] as const)(
    "a %s document carrying a wall-C placement and space parses, loads, and is only marked",
    (shape) => {
      const design = designIn({ ...KITCHEN_L_DESIGN.room, shape }, [strayOnC], {
        emptyColumns: [strayEmptyOnC],
      });
      const issues = validateDesignForCatalog(design, catalog);

      expect(DesignSchema.safeParse(design).success).toBe(true);
      expect(fatalDesignValidationIssues(issues)).toEqual([]);
      expect(issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "PLACEMENT_PAST_WALL_END",
          "EMPTY_COLUMN_PAST_WALL_END",
        ]),
      );
      expect(findOverflowingPlacementIds(design)).toEqual(["stray"]);
    },
  );

  it("survives the load seam (migrateDesign at the current version) unchanged", () => {
    const design = designIn(KITCHEN_L_DESIGN.room, [strayOnC]);

    expect(migrateDesign(CURRENT_SCHEMA_VERSION, design)).toEqual(design);
  });
});

describe("AC3 — a U document round-trips the load seam", () => {
  it("migrateDesign at the current version returns a U with wall-C bodies and spaces unchanged", () => {
    const design = designIn(U_ROOM, [body("c0", "C", 1000)], {
      emptyColumns: [
        {
          wall: "C",
          alongMm: 1500,
          widthMm: 400,
          y0Mm: 0,
          topMm: 820,
          depthMm: 580,
        },
      ],
    });

    expect(migrateDesign(CURRENT_SCHEMA_VERSION, design)).toEqual(design);
  });

  it("serialises a U with wallCMm present and a straight room without the key at all", () => {
    const serialised = JSON.parse(
      JSON.stringify(designIn(U_ROOM, [])),
    ) as Design;
    expect(serialised.room).toHaveProperty("wallCMm", 2000);
    const straight = DesignRoomSchema.parse({
      shape: "linear",
      widthMm: 3000,
      depthMm: 2000,
      heightMm: 2600,
    });
    expect(Object.keys(straight)).not.toContain("wallCMm");
  });
});

// =================================================================================================
// AC4 — wallLengthMm over all nine (shape, wall) pairs.
// =================================================================================================

describe("AC4 — wallLengthMm follows D6 for all nine (shape, wall) pairs", () => {
  const WIDTH_MM = 3100;
  const DEPTH_MM = 2300;
  const WALL_C_MM = 1700;
  const roomOf = (shape: DesignRoom["shape"]): DesignRoom => ({
    shape,
    widthMm: WIDTH_MM,
    depthMm: DEPTH_MM,
    ...(shape === "U" ? { wallCMm: WALL_C_MM } : {}),
    heightMm: 2600,
  });

  it.each([
    ["linear", "A", WIDTH_MM],
    ["linear", "B", 0],
    ["linear", "C", 0],
    ["L", "A", WIDTH_MM],
    ["L", "B", DEPTH_MM],
    ["L", "C", 0],
    ["U", "A", WIDTH_MM],
    ["U", "B", DEPTH_MM],
    ["U", "C", WALL_C_MM],
  ] as const)("%s wall %s is %i mm", (shape, wall, expectedMm) => {
    expect(wallLengthMm(wall, roomOf(shape))).toBe(expectedMm);
  });

  it("never lends wall C wall B's length on a U, nor wall B wall C's", () => {
    const lopsided: DesignRoom = {
      ...roomOf("U"),
      depthMm: 900,
      wallCMm: 6000,
    };

    expect(wallLengthMm("B", lopsided)).toBe(900);
    expect(wallLengthMm("C", lopsided)).toBe(6000);
  });
});

// =================================================================================================
// AC7 — the right corner is checked like the left, and B/C are never partners.
// =================================================================================================

/** A recorded base-band space on `wall`, centred on `alongMm`. */
function spaceOn(
  wall: DesignWall,
  alongMm: number,
  widthMm: number,
): EmptyColumn {
  return { wall, alongMm, widthMm, y0Mm: 0, topMm: 820, depthMm: 580 };
}

const CORNER_X = "base-corner-x-900";
const CORNER_X_HALF_MM = 450;

describe("AC7 — the A∩C corner reports exactly where its A∩B twin does", () => {
  propertyTest.prop([
    fc.integer({ min: 180, max: 630 }).map((tenths) => tenths * 10),
    fc.integer({ min: 1, max: 700 }),
    fc.integer({ min: 20, max: 900 }),
    fc.constantFrom(
      { y0Mm: 0, topMm: 820 },
      { y0Mm: 1500, topMm: 2200 },
      { y0Mm: 0, topMm: 2600 },
    ),
  ])(
    "a wall-C space at the right corner carries the same finding as its wall-B twin at the left",
    (widthMm, alongMm, spaceWidthMm, band) => {
      const room: DesignRoom = {
        ...U_ROOM,
        widthMm,
        depthMm: 3000,
        wallCMm: 3000,
      };
      const space: EmptyColumn = {
        ...spaceOn("B", alongMm, spaceWidthMm),
        ...band,
      };
      const leftCorner = designIn(
        room,
        [body("x", "A", CORNER_X_HALF_MM, CORNER_X)],
        { emptyColumns: [space] },
      );
      const rightCorner = designIn(
        room,
        [body("x", "A", widthMm - CORNER_X_HALF_MM, CORNER_X)],
        { emptyColumns: [{ ...space, wall: "C" }] },
      );

      expect(
        sortedFindings(validateDesignForCatalog(rightCorner, catalog)),
      ).toEqual(sortedFindings(validateDesignForCatalog(leftCorner, catalog)));
    },
  );

  it("reports the far corner's overlap for a narrow room, where both corners are within reach", () => {
    // W = 1400: the left X-leg spans x 0–900, and a wall-C space seated at x 820–1400 meets it.
    const room: DesignRoom = { ...U_ROOM, widthMm: 1400 };
    const design = designIn(
      room,
      [body("x", "A", CORNER_X_HALF_MM, CORNER_X)],
      {
        emptyColumns: [spaceOn("C", 300, 200)],
      },
    );

    expect(codesOf(design)).toContain("RECORDED_SPAN_OVERLAPS_CORNER_BODY");
  });

  it("stays silent at the far corner when the only X-leg is at the near one and the room is wide", () => {
    const design = designIn(
      U_ROOM,
      [body("x", "A", CORNER_X_HALF_MM, CORNER_X)],
      {
        emptyColumns: [spaceOn("C", 300, 200)],
      },
    );

    expect(codesOf(design)).not.toContain("RECORDED_SPAN_OVERLAPS_CORNER_BODY");
  });
});

describe("AC7 — walls B and C are never corner partners", () => {
  const sideRun = fc.record({
    wall: fc.constantFrom("B" as const, "C" as const),
    alongMm: fc.integer({ min: 0, max: 900 }),
    buildId: fc.constantFrom(
      CORNER_X,
      "base-drawer3-600",
      "tall-pantry-600",
      "base-corner-return-320",
    ),
  });

  propertyTest.prop([
    fc.integer({ min: 1, max: 1400 }),
    fc.array(sideRun, { minLength: 1, maxLength: 6 }),
    fc.array(
      fc.record({
        wall: fc.constantFrom("B" as const, "C" as const),
        alongMm: fc.integer({ min: 0, max: 900 }),
        widthMm: fc.integer({ min: 20, max: 800 }),
      }),
      { minLength: 1, maxLength: 6 },
    ),
  ])(
    "no recorded side-wall span is ever reported against a body on the opposite side wall",
    (widthMm, bodies, spaces) => {
      // A room as narrow as 1 mm puts the two side runs inside one another, which is exactly where a
      // sweep that paired B with C would fire; with no wall-A body there is no corner partner at all.
      const design = designIn(
        { ...U_ROOM, widthMm },
        bodies.map((run, index) =>
          body(`s${String(index)}`, run.wall, run.alongMm, run.buildId),
        ),
        {
          emptyColumns: spaces.map((space) =>
            spaceOn(space.wall, space.alongMm, space.widthMm),
          ),
        },
      );

      expect(codesOf(design)).not.toContain(
        "RECORDED_SPAN_OVERLAPS_CORNER_BODY",
      );
    },
  );
});

// =================================================================================================
// AC8 — wall-C keys never collide; §11 rows 1, 17 and 18 hold on wall C.
// =================================================================================================

describe("AC8 — wall-C keys never collide with wall B's", () => {
  propertyTest.prop([fc.integer({ min: 300, max: 1700 })])(
    "twin bodies on B and C at one along value derive two columns and two sets of voids",
    (alongMm) => {
      const design = designIn(U_ROOM, [
        body("b", "B", alongMm, "base-drawer3-600"),
        body("c", "C", alongMm, "base-drawer3-600"),
      ]);
      const records = derivePlacementRecords(design, catalog);
      const columns = deriveColumns(records, design, design.room);
      const [onB, onC] = records;

      expect(onB?.col).not.toBe(onC?.col);
      expect(columns.get(onB?.col ?? "")?.wall).toBe("B");
      expect(columns.get(onC?.col ?? "")?.wall).toBe("C");
      expect(columns.get(onC?.col ?? "")?.x).toBeCloseTo(
        3.6 - (columns.get(onB?.col ?? "")?.x ?? Number.NaN),
        9,
      );
    },
  );

  it("does not report a wall-C space as colliding with a wall-B body at the same along value", () => {
    const design = designIn(U_ROOM, [body("b", "B", 1000)], {
      emptyColumns: [spaceOn("C", 1000, 600)],
    });

    expect(codesOf(design)).toEqual([]);
  });

  it("still reports a wall-C space that collides with a wall-C body's key", () => {
    const design = designIn(U_ROOM, [body("c", "C", 1000)], {
      emptyColumns: [spaceOn("C", 1004, 10)],
    });

    expect(codesOf(design)).toContain(
      "EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT",
    );
  });
});

/** The shipped kitchen as a U with its wall-B run standing on wall C instead. */
function shippedRunOnWallC(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    room: {
      shape: "U",
      widthMm: KITCHEN_L_DESIGN.room.widthMm,
      depthMm: KITCHEN_L_DESIGN.room.depthMm,
      wallCMm: KITCHEN_L_DESIGN.room.depthMm,
      heightMm: KITCHEN_L_DESIGN.room.heightMm,
    },
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.wall === "B" ? { ...placement, wall: "C" as const } : placement,
    ),
  };
}

/** The shipped kitchen as a U with a copy of its wall-A run (less the corner X-leg) on wall C. */
function wallARunCopiedOntoWallC(): Design {
  const copies = KITCHEN_L_DESIGN.placements
    .filter(
      (placement) =>
        placement.wall === "A" && placement.body.buildId !== CORNER_X,
    )
    .map((placement) => ({
      ...placement,
      id: `c-${placement.id}`,
      wall: "C" as const,
    }));
  return {
    ...KITCHEN_L_DESIGN,
    room: {
      shape: "U",
      widthMm: KITCHEN_L_DESIGN.room.widthMm,
      depthMm: KITCHEN_L_DESIGN.room.depthMm,
      wallCMm: KITCHEN_L_DESIGN.room.widthMm,
      heightMm: KITCHEN_L_DESIGN.room.heightMm,
    },
    placements: [...KITCHEN_L_DESIGN.placements, ...copies],
  };
}

function slotsOf(voids: readonly VoidRecord[], col: string) {
  return voids
    .filter((record) => record.col === col)
    .map((record) => ({
      y0: Number(record.y0.toFixed(3)),
      h: Number(record.h.toFixed(3)),
      spanH: Number(record.spanH.toFixed(3)),
      w: Number(record.w.toFixed(3)),
    }));
}

describe("AC8 — §11 row 1 on wall C: clear the fridge column, re-insert the fridge", () => {
  const FRIDGE_COLUMN_ON_C = "C|2.45";
  const cleared = clearBodies(
    createWorld(shippedRunOnWallC(), KITCHEN_L_BODY_CATALOG),
    ["p7", "p24"],
  );
  const result = insertInto(
    cleared,
    { kind: "void", id: voidAt(cleared, FRIDGE_COLUMN_ON_C, 0).id },
    "fridge-free",
  );

  it("places the fridge on wall C, on the floor, at its own 1850 mm height", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.wall).toBe("C");
    expect(placed?.alongMm).toBe(2450);
    expect(placed?.y0Mm).toBe(0);
    expect(placed?.body.heightMm).toBe(1850);
  });

  it("leaves exactly ONE 750 mm slot above it, never two stubs", () => {
    if (!result.ok) throw new Error("the fridge was refused");
    const after = advance(cleared, result.design);

    expect(slotsOf(after.voids, FRIDGE_COLUMN_ON_C)).toEqual([
      { y0: 1.85, h: 0.75, spanH: 0.75, w: 0.7 },
    ]);
  });
});

describe("AC8 — §11 row 17 on wall C: the backsplash zone is never an opening", () => {
  const HOB_COLUMN_ON_C = "C|2.60";
  const world = clearBodies(
    createWorld(wallARunCopiedOntoWallC(), KITCHEN_L_BODY_CATALOG),
    ["c-p13"],
  );

  it("emits exactly one opening for the span the hood left, at the wall level", () => {
    expect(slotsOf(world.voids, HOB_COLUMN_ON_C)).toEqual([
      { y0: 1.5, h: 0.7, spanH: 1.38, w: 0.6 },
    ]);
  });

  it("emits no wall-C opening that sits in the backsplash gap alone", () => {
    const [start, end] = BACKSPLASH_ZONE;
    const gapOnly = world.voids.filter(
      (record) =>
        record.wall === "C" &&
        (intersectsNoModuleLine(record) ||
          (record.y0 >= start && record.y0 + record.h <= end)),
    );

    expect(gapOnly).toEqual([]);
  });
});

describe("AC8 — §11 row 18 on wall C: a wall-only column invents no floor space", () => {
  const WALL_ONLY_COLUMN_ON_C = "C|0.30";
  const world = clearBodies(
    createWorld(wallARunCopiedOntoWallC(), KITCHEN_L_BODY_CATALOG),
    ["c-p8", "c-p15"],
  );

  it("starts the derivation at the column's own lowest module, not at the floor", () => {
    expect(slotsOf(world.voids, WALL_ONLY_COLUMN_ON_C)).toEqual([
      { y0: 1.5, h: 0.7, spanH: 1.1, w: 0.6 },
      { y0: 2.2, h: 0.4, spanH: 1.1, w: 0.6 },
    ]);
  });
});

// =================================================================================================
// S3's untested arm: `atDepthM` (frozen-map-at-cabinet-depth.ts) republishing a wall-C column.
// =================================================================================================

describe("atDepthM's wall-C arm — a depth change republishes a wall-C column pulled in from W", () => {
  /** Twin base cabinets at one along value on B and C, frozen into the map and then cleared, so the
   *  depth change must re-answer two member-less columns from their recorded sources. */
  function clearedTwins(): Design {
    const full = designIn(U_ROOM, [body("b", "B", 1500), body("c", "C", 1500)]);
    const frozen = deriveColumns(
      derivePlacementRecords(full, catalog),
      {},
      full.room,
    );
    const cleared = { ...full, placements: [] };
    return withFrozenMap(cleared, projectFrozenMap(frozen, []));
  }

  function columnsAt700() {
    const result = setCabinetDepth({
      design: clearedTwins(),
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: 700,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    const columns = [...result.effect.columns.values()];
    const onWall = (wall: DesignWall) => {
      const found = columns.find((column) => column.wall === wall);
      if (!found) throw new Error(`no wall-${wall} column published`);
      return found;
    };
    return { onB: onWall("B"), onC: onWall("C") };
  }

  it("moves the depth on both twins, so the republishing arm actually ran", () => {
    const before = clearedTwins().emptyColumns ?? [];
    const { onB, onC } = columnsAt700();

    expect(onB.d * 1000).not.toBeCloseTo(before[0]?.depthMm ?? 0, 3);
    expect(onC.d).toBeCloseTo(onB.d, 9);
  });

  it("seats the wall-C column at W − d/2, the mirror of wall B's d/2", () => {
    const { onB, onC } = columnsAt700();

    expect(onB.x).toBeCloseTo(onB.d / 2, 9);
    expect(onC.x).toBeCloseTo(U_ROOM.widthMm / 1000 - onC.d / 2, 9);
  });

  // **Flipped by U2 S3** (D9, ADR 0132 decision 7): the corner-taking set is now `{B, C}` for a U,
  // so wall C's chain slides exactly as wall B's.
  it("slides wall C's run along its wall exactly as wall B's", () => {
    const { onB, onC } = columnsAt700();

    expect(onC.z).toBeCloseTo(onB.z, 9);
  });
});

// =================================================================================================
// AC9 — must-nots: no product bound in DesignRoomSchema; the cornerDirection carve-out is one read.
// =================================================================================================

describe("AC9 — DesignRoomSchema carries storage bounds only, never a product bound", () => {
  propertyTest.prop([
    fc.integer({ min: 1, max: MAX_ROOM_DEPTH_MM }),
    fc.integer({ min: 1, max: MAX_ROOM_DEPTH_MM }),
    fc.integer({ min: 1, max: MAX_ROOM_DEPTH_MM }),
  ])(
    "accepts a U at any storable width, depth and wall C, including below the engine's 1800 floor",
    (widthMm, depthMm, wallCMm) => {
      const result = DesignRoomSchema.safeParse({
        shape: "U",
        widthMm,
        depthMm,
        wallCMm,
        heightMm: 2600,
      });

      expect(result.success).toBe(true);
    },
  );

  it("accepts the smallest U a store could hold, 1 mm on every side", () => {
    expect(
      DesignRoomSchema.safeParse({
        shape: "U",
        widthMm: 1,
        depthMm: 1,
        wallCMm: 1,
        heightMm: 1,
      }).success,
    ).toBe(true);
  });
});

describe("AC9 — design.ts's carve-out from the one-reader rule is exactly one read, in the refusal", () => {
  const DESIGN_SOURCE = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "design.ts",
    ),
    "utf8",
  );
  const CODE_LINES = DESIGN_SOURCE.split("\n").filter(
    (line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line),
  );

  it("reads room.cornerDirection on exactly one code line", () => {
    const reads = CODE_LINES.filter((line) =>
      /\broom\.cornerDirection\b/.test(line),
    );

    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatch(/isU && room\.cornerDirection === "right"/);
  });

  it("reads no other spelling of the field in code (destructuring or bracket access)", () => {
    const otherSpellings = CODE_LINES.filter(
      (line) =>
        /\{[^}]*\bcornerDirection\b[^}]*\}\s*=/.test(line) ||
        /\w\s*\[\s*["']cornerDirection["']\s*\]/.test(line),
    );

    expect(otherSpellings).toEqual([]);
  });
});

// =================================================================================================
// The mirror utility itself, reviewed against a hand-worked case.
// =================================================================================================

describe("mirrorUDesign — a hand-worked reflection", () => {
  it("swaps B and C, sends a wall-A centre a to W − a, and swaps the side runs", () => {
    const design = designIn(
      U_ROOM,
      [
        body("a", "A", 450, CORNER_X),
        body("b", "B", 740, "base-corner-return-320"),
      ],
      { emptyColumns: [spaceOn("C", 1200, 400), spaceOn("A", 2000, 600)] },
    );

    const mirrored = mirrorUDesign(design);

    expect(mirrored.room).toEqual({ ...U_ROOM, depthMm: 2000, wallCMm: 2400 });
    expect(
      mirrored.placements.map(({ id, wall, alongMm }) => [id, wall, alongMm]),
    ).toEqual([
      ["a", "A", 3150],
      ["b", "C", 740],
    ]);
    expect(
      mirrored.emptyColumns?.map(({ wall, alongMm }) => [wall, alongMm]),
    ).toEqual([
      ["B", 1200],
      ["A", 1600],
    ]);
  });

  it("refuses to mirror a document that is not a U", () => {
    expect(() => mirrorUDesign(KITCHEN_L_DESIGN)).toThrow(/needs a U room/);
  });
});
