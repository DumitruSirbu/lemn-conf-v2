// M7B wave U2 — adversarial QA for the right corner, the U shell, engine limits and the depth change
// (plan § Wave U2, AC1–AC5; ADR 0132 decisions 2, 4, 7).
//
// **Independent oracles, on purpose.** The implementer's own property derives its expected runs from
// `rightCornerAssemblyWidthsMm` and `rightCornerAlongWallCentreMm` — the functions under test. This
// file compares the U shell against *itself with walls B and C swapped*, through `mirrorUDesign`
// (U1's reviewed utility): the right corner of `(W, B, C)` must be the reflected left corner of
// `(W, C, B)`, wall C's content must be wall B's content of the swapped room, and every validation
// finding, void and depth change must commute with the reflection (logic review R1.3, backlog 94).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import { cornerOf } from "../src/corner-assembly-size.js";
import type {
  Design,
  DesignPlacement,
  DesignWall,
  EmptyColumn,
} from "../src/design.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import {
  buildLShellDesign,
  buildUShellDesign,
} from "../src/generation/shell-design.js";
import { APPROVED_ROOM_POLICY } from "../src/room/approved-room-policy.js";
import {
  ENGINE_ROOM_LIMITS,
  type RoomPolicy,
} from "../src/room/room-policy.js";
import {
  validateRoomInput,
  type RoomInput,
} from "../src/room/validate-room.js";
import { runEndPanelSeatM } from "../src/run-end-panel.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type BodyCatalog,
  type VoidRecord,
} from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import {
  comparableVoids,
  mirroredFindings,
  mirroredVoids,
  mirrorUDesign,
  sortedFindings,
} from "./support/mirror-u-design.js";
import { engineUWallBounds } from "./support/room-input.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const RUNS = 200;
const DECLARED_DEPTHS_MM = [600, 700] as const;

function catalogOf(design: Design): BodyCatalog {
  return buildKitchenLBodyCatalog(design.settings?.cabinetDepthMm ?? 600);
}

function uShell(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = 2600,
): Design {
  return buildUShellDesign({
    room: { shape: "U", widthMm, depthMm, wallCMm, heightMm },
    occurredAt: OCCURRED_AT,
  });
}

/** The same room with its two side walls exchanged. */
function swappedShell(shell: Design): Design {
  const { room } = shell;
  return uShell(room.widthMm, room.wallCMm ?? 0, room.depthMm, room.heightMm);
}

// ------------------------------------------------------------------------------------------------
// The engine U range, sampled and at every boundary the arithmetic could turn on.

const U = engineUWallBounds();
const HEIGHT = ENGINE_ROOM_LIMITS.heightBounds;

const engineURoom = fc.record({
  widthMm: fc.integer({ min: U.wallA.minMm, max: U.wallA.maxMm }),
  depthMm: fc.integer({ min: U.wallB.minMm, max: U.wallB.maxMm }),
  wallCMm: fc.integer({ min: U.wallC.minMm, max: U.wallC.maxMm }),
  heightMm: fc.integer({ min: HEIGHT.minMm, max: HEIGHT.maxMm }),
});

/** Odd and even neighbours of every threshold: wall A's two-corner floor, the X-legs' 900 reach, a
 *  side wall's narrowest reach and the reference corner's 1000, and both maxima. */
const WALL_A_BOUNDARIES = [
  U.wallA.minMm,
  U.wallA.minMm + 1,
  U.wallA.minMm + 2,
  1999,
  2701,
  U.wallA.maxMm - 1,
  U.wallA.maxMm,
];
const SIDE_BOUNDARIES = [
  U.wallB.minMm,
  U.wallB.minMm + 1,
  899,
  900,
  901,
  999,
  1000,
  1001,
  1099,
  U.wallB.maxMm,
];
const HEIGHT_BOUNDARIES = [HEIGHT.minMm, 2199, 2200, 2600, HEIGHT.maxMm];

function boundaryRooms(): readonly [number, number, number, number][] {
  const rooms: [number, number, number, number][] = [];
  for (const widthMm of WALL_A_BOUNDARIES) {
    for (const depthMm of SIDE_BOUNDARIES) {
      for (const wallCMm of [
        SIDE_BOUNDARIES[0] ?? 0,
        999,
        1001,
        U.wallC.maxMm,
      ]) {
        rooms.push([widthMm, depthMm, wallCMm, 2600]);
      }
    }
  }
  for (const heightMm of HEIGHT_BOUNDARIES) {
    rooms.push([U.wallA.minMm, U.wallB.minMm, U.wallC.minMm + 1, heightMm]);
    rooms.push([2701, 999, 1001, heightMm]);
  }
  return rooms;
}

/** Every property below, over fast-check's sample and then every boundary room. */
function overTheEngineURange(check: (shell: Design) => void): void {
  fc.assert(
    fc.property(engineURoom, (room) => {
      check(uShell(room.widthMm, room.depthMm, room.wallCMm, room.heightMm));
    }),
    { numRuns: RUNS },
  );
  for (const [widthMm, depthMm, wallCMm, heightMm] of boundaryRooms()) {
    check(uShell(widthMm, depthMm, wallCMm, heightMm));
  }
}

// ------------------------------------------------------------------------------------------------
// Comparable forms.

function structural(design: Design): DesignPlacement[] {
  const catalog = catalogOf(design);
  return design.placements.filter(
    (placement) =>
      catalog.get(placement.body.buildId)?.structuralReason === "corner",
  );
}

/** A placement without its id: the two corners' pieces carry different ids by design. */
function whereAndWhat(placement: DesignPlacement): string {
  return JSON.stringify([
    placement.wall,
    placement.alongMm,
    placement.y0Mm,
    placement.body,
  ]);
}

function entriesOn(
  entries: readonly EmptyColumn[] | undefined,
  wall: DesignWall,
): string[] {
  return (entries ?? [])
    .filter((entry) => entry.wall === wall)
    .map((entry) => JSON.stringify({ ...entry, wall: "side" }))
    .sort();
}

function placementsOn(design: Design, wall: DesignWall): string[] {
  return design.placements
    .filter((placement) => placement.wall === wall)
    .map((placement) => whereAndWhat({ ...placement, wall: "A" }))
    .sort();
}

function voidsOf(design: Design): readonly VoidRecord[] {
  const catalog = catalogOf(design);
  const records = derivePlacementRecords(design, catalog);
  return recomputeVoids(records, deriveColumns(records, design, design.room));
}

// =================================================================================================
// AC1 — the right corner mirrors the left.
// =================================================================================================

describe("AC1 — the right corner is the left corner of the swapped room, reflected", () => {
  it("places exactly the swapped room's structural pieces, reflected, over the engine U range", () => {
    overTheEngineURange((shell) => {
      const reflected = structural(mirrorUDesign(swappedShell(shell)))
        .map(whereAndWhat)
        .sort();

      expect(
        structural(shell).map(whereAndWhat).sort(),
        JSON.stringify(shell.room),
      ).toEqual(reflected);
    });
  });

  it("puts the right X-leg's far edge at W exactly and never overlaps the left X-leg", () => {
    overTheEngineURange((shell) => {
      // The X-legs are wall A's base-row pieces; its wall and top rows carry the corner wall unit (M7C
      // wave C2), the same width and span, which this is not about.
      const xLegs = structural(shell)
        .filter((placement) => placement.wall === "A" && placement.y0Mm === 0)
        .map((placement) => ({
          startMm: placement.alongMm - placement.body.widthMm / 2,
          endMm: placement.alongMm + placement.body.widthMm / 2,
        }))
        .sort((left, right) => left.startMm - right.startMm);
      const context = JSON.stringify(shell.room);

      expect(xLegs, context).toHaveLength(2);
      expect(xLegs[0]?.startMm, context).toBe(0);
      expect(xLegs[1]?.endMm, context).toBe(shell.room.widthMm);
      expect(xLegs[0]?.endMm ?? Infinity, context).toBeLessThanOrEqual(
        xLegs[1]?.startMm ?? -Infinity,
      );
    });
  });

  it("writes no half-millimetre centre on any placement or recorded entry", () => {
    overTheEngineURange((shell) => {
      const centres = [
        ...shell.placements.map(({ alongMm }) => alongMm),
        ...(shell.emptyColumns ?? []).map(({ alongMm }) => alongMm),
        ...(shell.columnExtents ?? []).map(({ alongMm }) => alongMm),
      ];

      expect(centres.filter((centre) => !Number.isInteger(centre))).toEqual([]);
    });
  });

  it("files four structural pieces under each corner by cornerOf, and no structural id twice", () => {
    overTheEngineURange((shell) => {
      const catalog = catalogOf(shell);
      const pieces = structural(shell);
      const byCorner = pieces.map((piece) =>
        cornerOf(piece, shell.room, catalog),
      );
      const heightKeepsTheWallRow = shell.room.heightMm >= 2600;
      // Six, with the corner wall unit's two (M7C wave C2), and four where the back wall is base-only: a
      // large U, whose three entered walls total 10 000 mm or more.
      const isLargeU =
        shell.room.widthMm + shell.room.depthMm + (shell.room.wallCMm ?? 0) >=
        10_000;
      const perCorner = heightKeepsTheWallRow ? (isLargeU ? 4 : 6) : undefined;

      expect(new Set(shell.placements.map(({ id }) => id)).size).toBe(
        shell.placements.length,
      );
      expect(byCorner.filter((corner) => corner === "left").length).toBe(
        byCorner.filter((corner) => corner === "right").length,
      );
      if (perCorner !== undefined) {
        expect(byCorner.filter((corner) => corner === "right")).toHaveLength(
          perCorner,
        );
      }
      expect(byCorner).not.toContain(undefined);
    });
  });
});

// =================================================================================================
// AC2 — the shell, against the swapped room and through the mirror.
// =================================================================================================

describe("AC2 — the U shell against its own reflection", () => {
  it("records on wall C exactly what the swapped room records on wall B", () => {
    overTheEngineURange((shell) => {
      const swapped = swappedShell(shell);
      const context = JSON.stringify(shell.room);

      expect(placementsOn(shell, "C"), context).toEqual(
        placementsOn(swapped, "B"),
      );
      expect(entriesOn(shell.emptyColumns, "C"), context).toEqual(
        entriesOn(swapped.emptyColumns, "B"),
      );
      expect(entriesOn(shell.columnExtents, "C"), context).toEqual(
        entriesOn(swapped.columnExtents, "B"),
      );
    });
  });

  it("records wall B exactly as the L shell of (W, B) does — the U adds wall C, it moves nothing on B", () => {
    overTheEngineURange((shell) => {
      const lShell = buildLShellDesign({
        room: {
          shape: "L",
          widthMm: shell.room.widthMm,
          depthMm: shell.room.depthMm,
          heightMm: shell.room.heightMm,
        },
        occurredAt: OCCURRED_AT,
      });
      const context = JSON.stringify(shell.room);

      expect(placementsOn(shell, "B"), context).toEqual(
        placementsOn(lShell, "B"),
      );
      expect(entriesOn(shell.emptyColumns, "B"), context).toEqual(
        entriesOn(lShell.emptyColumns, "B"),
      );
    });
  });

  it("leaves at most the one odd millimetre of wall A unrecorded, in each band", () => {
    overTheEngineURange((shell) => {
      // Over the corner base the unit's rows must fit under the ceiling to be built (M7C wave C2): the wall
      // row from 2200 and the top row from 2600. Below that its footprint stays reserved and unrecorded,
      // as above the side wall's own returns — except on a base-only back wall, which tiles the strips.
      const isLargeU =
        shell.room.widthMm + shell.room.depthMm + (shell.room.wallCMm ?? 0) >=
        10_000;
      const probeIsOver = (y: number) =>
        y < 1500 || isLargeU || shell.room.heightMm >= (y < 2200 ? 2200 : 2600);
      for (const probeYMm of [400, 1800, 2400].filter(
        (y) => y < shell.room.heightMm && probeIsOver(y),
      )) {
        const covered = [
          ...shell.placements.map((placement) => ({
            wall: placement.wall,
            startMm: placement.alongMm - placement.body.widthMm / 2,
            endMm: placement.alongMm + placement.body.widthMm / 2,
            y0Mm: placement.y0Mm,
            topMm: placement.y0Mm + placement.body.heightMm,
          })),
          ...(shell.emptyColumns ?? []).map((entry) => ({
            wall: entry.wall,
            startMm: entry.alongMm - entry.widthMm / 2,
            endMm: entry.alongMm + entry.widthMm / 2,
            y0Mm: entry.y0Mm,
            topMm: entry.topMm,
          })),
        ]
          .filter(
            (run) =>
              run.wall === "A" && run.y0Mm <= probeYMm && probeYMm < run.topMm,
          )
          .sort((left, right) => left.startMm - right.startMm);
        let reachedMm = 0;
        let unrecordedMm = 0;
        for (const run of covered) {
          expect(
            run.startMm,
            `overlap on A at y ${String(probeYMm)}`,
          ).toBeGreaterThanOrEqual(reachedMm);
          unrecordedMm += run.startMm - reachedMm;
          reachedMm = run.endMm;
        }
        unrecordedMm += shell.room.widthMm - reachedMm;

        expect(
          unrecordedMm,
          `${JSON.stringify(shell.room)} y ${String(probeYMm)}`,
        ).toBe(shell.room.widthMm % 2);
      }
    });
  });
});

describe("AC6 (U1) on real shells — validation and voids commute with the mirror (R1.3, backlog 94)", () => {
  it("has no finding on the shell, none on its mirror, and mirrored voids", () => {
    overTheEngineURange((shell) => {
      const mirrored = mirrorUDesign(shell);
      const catalog = catalogOf(shell);
      const context = JSON.stringify(shell.room);

      expect(validateDesignForCatalog(shell, catalog), context).toEqual([]);
      expect(
        sortedFindings(validateDesignForCatalog(mirrored, catalog)),
        context,
      ).toEqual(
        mirroredFindings(shell, validateDesignForCatalog(shell, catalog)),
      );
      expect(comparableVoids(voidsOf(mirrored)), context).toEqual(
        mirroredVoids(voidsOf(shell), shell.room.widthMm),
      );
    });
  });
});

// =================================================================================================
// AC3 — the depth change commutes with the mirror, in both directions and round trip.
// =================================================================================================

function atDepth(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

/** A design as a set, so the command's own sort order (wall, then along) cannot read as a difference
 *  between a document and its mirror. */
function asSets(design: Design): Record<string, readonly string[]> {
  return {
    room: [JSON.stringify(design.room)],
    placements: design.placements
      .map((placement) => JSON.stringify(placement))
      .sort(),
    emptyColumns: (design.emptyColumns ?? [])
      .map((entry) => JSON.stringify(entry))
      .sort(),
    columnExtents: (design.columnExtents ?? [])
      .map((entry) => JSON.stringify(entry))
      .sort(),
  };
}

const DEPTH_SEQUENCES: readonly (readonly number[])[] = [
  [700],
  [700, 600],
  [700, 600, 700],
];

describe("AC3 — setCabinetDepth commutes with the mirror on U shells", () => {
  for (const sequence of DEPTH_SEQUENCES) {
    propertyTest.prop([engineURoom], { numRuns: 60 })(
      `600 → ${sequence.join(" → ")} gives the mirror of the mirrored room's result`,
      (room) => {
        const shell = uShell(
          room.widthMm,
          room.depthMm,
          room.wallCMm,
          room.heightMm,
        );
        const run = (design: Design) =>
          sequence.reduce(
            (current, depthMm) => atDepth(current, depthMm),
            design,
          );

        expect(asSets(run(mirrorUDesign(shell)))).toEqual(
          asSets(mirrorUDesign(run(shell))),
        );
      },
    );
  }

  it.each(boundaryRooms().filter((_room, index) => index % 7 === 0))(
    "commutes at the boundary room (%i, %i, %i, %i) through 600 → 700 → 600",
    (widthMm, depthMm, wallCMm, heightMm) => {
      const shell = uShell(widthMm, depthMm, wallCMm, heightMm);
      const run = (design: Design) => atDepth(atDepth(design, 700), 600);

      expect(asSets(run(mirrorUDesign(shell)))).toEqual(
        asSets(mirrorUDesign(run(shell))),
      );
    },
  );

  propertyTest.prop([engineURoom], { numRuns: 60 })(
    "a U's wall B after 600 → 700 → 600 is the L's own wall B after the same round trip",
    (room) => {
      const run = (design: Design) => atDepth(atDepth(design, 700), 600);
      const u = run(
        uShell(room.widthMm, room.depthMm, room.wallCMm, room.heightMm),
      );
      const l = run(
        buildLShellDesign({
          room: {
            shape: "L",
            widthMm: room.widthMm,
            depthMm: room.depthMm,
            heightMm: room.heightMm,
          },
          occurredAt: OCCURRED_AT,
        }),
      );

      expect(placementsOn(u, "B")).toEqual(placementsOn(l, "B"));
      expect(entriesOn(u.emptyColumns, "B")).toEqual(
        entriesOn(l.emptyColumns, "B"),
      );
      expect(entriesOn(u.columnExtents, "B")).toEqual(
        entriesOn(l.columnExtents, "B"),
      );
    },
  );

  propertyTest.prop([engineURoom, fc.constantFrom(...DECLARED_DEPTHS_MM)], {
    numRuns: 60,
  })(
    "never moves a wall-A placement or a structural width",
    (room, cabinetDepthMm) => {
      const shell = uShell(
        room.widthMm,
        room.depthMm,
        room.wallCMm,
        room.heightMm,
      );
      const after = atDepth(atDepth(shell, 700), cabinetDepthMm);
      const wallA = (design: Design) =>
        design.placements
          .filter((placement) => placement.wall === "A")
          .map(({ id, alongMm, body }) => [id, alongMm, body.widthMm]);
      const widths = (design: Design) =>
        structural(design).map(({ id, body }) => [id, body.widthMm]);

      expect(wallA(after)).toEqual(wallA(shell));
      expect(widths(after)).toEqual(widths(shell));
    },
  );
});

// =================================================================================================
// AC4 — no run-end panel on any U, at either depth.
// =================================================================================================

describe("AC4 — runEndPanelSeatM answers none for every U shell", () => {
  it("answers none over the engine U range, at 600 and after a change to 700", () => {
    overTheEngineURange((shell) => {
      for (const design of [shell, atDepth(shell, 700)]) {
        const records = derivePlacementRecords(design, catalogOf(design));

        expect(
          runEndPanelSeatM(records, design.room),
          JSON.stringify(design.room),
        ).toBe(undefined);
      }
    });
  });
});

// =================================================================================================
// AC5 — validateRoomInput's U arm, hostile tags, and no number in any issue.
// =================================================================================================

const WITNESS_POLICY: RoomPolicy = {
  approval: "interim-unapproved",
  buildableShapes: { U: engineUWallBounds() },
  heightBounds: ENGINE_ROOM_LIMITS.heightBounds,
};

describe("AC5 — validateRoomInput under a witness policy stating a U", () => {
  it("maps a valid U to D1's shape exactly, and drops an entered right-hand direction", () => {
    const result = validateRoomInput(
      {
        shape: "U",
        wallAMm: 3000,
        wallBMm: 2000,
        wallCMm: 2500,
        heightMm: 2600,
        cornerDirection: "right",
      } as RoomInput,
      WITNESS_POLICY,
    );

    expect(result).toEqual({
      ok: true,
      room: {
        shape: "U",
        widthMm: 3000,
        depthMm: 2000,
        wallCMm: 2500,
        heightMm: 2600,
      },
    });
  });

  it.each([
    ["lower-case u", "u"],
    ["a padded U", "U "],
    ["an empty tag", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 3],
    ["an object", {}],
    ["toString", "toString"],
    ["__proto__", "__proto__"],
    ["constructor", "constructor"],
  ])(
    "refuses %s as a shape, by the shape field alone, without throwing",
    (_name, shape) => {
      const input = {
        shape,
        wallAMm: 3000,
        wallBMm: 2000,
        wallCMm: 2500,
        heightMm: 2600,
      };

      expect(
        validateRoomInput(input as unknown as RoomInput, WITNESS_POLICY),
      ).toEqual({
        ok: false,
        issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
      });
    },
  );

  propertyTest.prop([
    fc.record({
      wallAMm: fc.oneof(
        fc.integer({ min: -10, max: 7000 }),
        fc.double(),
        fc.constant(undefined),
      ),
      wallBMm: fc.oneof(
        fc.integer({ min: -10, max: 7000 }),
        fc.double(),
        fc.constant(undefined),
      ),
      wallCMm: fc.oneof(
        fc.integer({ min: -10, max: 7000 }),
        fc.double(),
        fc.constant(undefined),
      ),
      heightMm: fc.oneof(
        fc.integer({ min: -10, max: 5000 }),
        fc.double(),
        fc.constant(undefined),
      ),
    }),
  ])(
    "names only shape, wallA, wallB, wallC or height, and carries no number, in any refusal",
    (fields) => {
      const result = validateRoomInput(
        { shape: "U", ...fields } as RoomInput,
        WITNESS_POLICY,
      );
      if (result.ok) return;

      for (const issue of result.issues) {
        expect(["shape", "wallA", "wallB", "wallC", "height"]).toContain(
          issue.field,
        );
        expect(Object.keys(issue).sort()).toEqual(["code", "field"]);
        expect(JSON.stringify(issue)).not.toMatch(/\d/);
      }
    },
  );

  // Restated at M7B U6 S1 (census D1): the approved policy states the U (ADR 0108 H4), so this room is
  // judged and accepted rather than refused as its shape alone.
  it("accepts a U under the approved policy, judged field by field", () => {
    expect(
      validateRoomInput(
        {
          shape: "U",
          wallAMm: 3000,
          wallBMm: 2000,
          wallCMm: 2500,
          heightMm: 2600,
        } as RoomInput,
        APPROVED_ROOM_POLICY,
      ),
    ).toEqual({
      ok: true,
      room: {
        shape: "U",
        widthMm: 3000,
        depthMm: 2000,
        wallCMm: 2500,
        heightMm: 2600,
      },
    });
  });
});
