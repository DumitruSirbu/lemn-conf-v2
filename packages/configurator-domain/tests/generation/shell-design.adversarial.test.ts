// Adversarial QA on wave 7D1 — `buildLShellDesign` (ADR 0110 Amendment B, the milestone's
// Adjudication 7D1-P). The implementer's two files hold the criteria on named rooms and on a uniform
// sample of the approved range; this file goes after what those leave open:
//
//   - the **edges** of the range a uniform sample almost never draws — the policy's own minima and
//     maxima, and a wall one millimetre either side of a tile boundary — swept together with the
//     sample, through a depth change **and back**, where criterion 2 checks two rooms;
//   - the **seams** the shell is handed to next: the load seam (`migrateDesign`), the write seam's
//     own contract, and the command a customer or wave 7D2 inserts through;
//   - the **finished end** a filled wall-A run carries (ADR 0083 decision 5), which no validator
//     code reports;
//   - the must-nots, through every route an import can take rather than the literal spellings.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  alongWallShiftMm,
  type AlongWallShiftQuery,
} from "../../src/along-wall-chain-shift.js";
import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthRuleOf,
  canonicalSerializeDesign,
  CURRENT_SCHEMA_VERSION,
  CurrentDesignSchema,
  declaredCabinetDepthsMm,
  derivePlacementRecords,
  deriveColumns,
  deriveRecordedColumns,
  deriveSlotBand,
  fatalDesignValidationIssues,
  insertBody,
  KITCHEN_L_DESIGN,
  listInsertableBodies,
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_BYTES,
  MAX_EMPTY_COLUMNS,
  LShellInputError,
  migrateDesign,
  occupiedDepthOfEntryM,
  offersFor,
  projectFrozenMap,
  recomputeVoids,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
  toMetres,
  toMillimetres,
  validateDesignForCatalog,
  validateRoomInput,
  wallLengthMm,
  withFrozenMap,
  type BodyCatalog,
  type Column,
  type Design,
  type DesignRoom,
  type DesignWall,
  type LShellInputRefusal,
  type MillimetreBounds,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/index.js";
import { LEVELS, MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { acceptedRoom } from "../support/room-input.js";
import {
  alongIntervalOf,
  bandsUnder,
  emptyIntervalsIn,
  openingIntervalOf,
  runStartMm,
  SHELL_CABINET_DEPTH_MM,
  SHELL_OCCURRED_AT,
  unionOf,
  withWallABaseRunFilled,
  atCabinetDepth,
  shellIn,
} from "../support/shell-design.js";

/** The uniform sample on top of the edge rooms below; criterion 1's own floor. */
const RUNS = 200;

const TOP_ROW_CEILING_MM = 2600;

const NEUTRAL_SOURCE_BY_FLOOR = {
  floor: "base-cabinet",
  wallOnly: "wall-cabinet",
} as const;

/** The approved policy's L, read rather than restated, so the sweep follows a policy change. */
function approvedL() {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!walls) throw new Error("the approved policy builds no L");
  return { ...walls, height: APPROVED_ROOM_POLICY.heightBounds };
}

function millimetresIn(bounds: MillimetreBounds) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

function approvedRoom(): fc.Arbitrary<DesignRoom> {
  const l = approvedL();
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: millimetresIn(l.wallA),
    depthMm: millimetresIn(l.wallB),
    heightMm: millimetresIn(l.height),
  });
}

/** Where a floor run starts on each wall, read off the reference's structural pieces through the
 *  support helper — 900 on both walls today. */
function floorRunStartMm(wall: DesignWall): number {
  const [base] = bandsUnder(TOP_ROW_CEILING_MM);
  if (!base) throw new Error("the module grid has no base band");
  return runStartMm(wall, base);
}

/** The one-millimetre neighbourhoods a uniform sample misses: the policy's two ends, the first
 *  tile boundary of the floor run (a run of one tile, one tile plus one odd millimetre, one tile
 *  plus a 2 mm piece), and the run's own first millimetres. `runOriginMm` is the wall length at
 *  which the floor run has no length yet — its start plus whatever the shell leaves at the wall's
 *  end, which `floorRunShortfallMm` reads off the shell rather than restating. */
function edgesOf(bounds: MillimetreBounds, runOriginMm: number): number[] {
  const tileMm = MAX_EMPTY_COLUMN_WIDTH_MM;
  const candidates = [
    bounds.minMm,
    bounds.minMm + 1,
    bounds.minMm + 2,
    runOriginMm + 1,
    runOriginMm + 2,
    runOriginMm + 3,
    runOriginMm + tileMm - 1,
    runOriginMm + tileMm,
    runOriginMm + tileMm + 1,
    runOriginMm + tileMm + 2,
    bounds.maxMm - 1,
    bounds.maxMm,
  ];
  return [...new Set(candidates)].filter(
    (valueMm) => valueMm >= bounds.minMm && valueMm <= bounds.maxMm,
  );
}

/** How far short of `wall`'s end the shell stops its floor run — wall B's slide reserve, wall A's
 *  finished end (ADR 0110 B3, B3a) — measured on the shell, so the seams follow a change to either
 *  (7D1b removes wall A's). Read at the reference room and at one millimetre longer and the smaller
 *  taken, because on an odd span P3 gives one more millimetre up at the far end. */
function floorRunShortfallMm(wall: DesignWall): number {
  const shortfallsMm = [0, 1].map((extraMm) => {
    const room: DesignRoom =
      wall === "A"
        ? {
            ...KITCHEN_L_DESIGN.room,
            widthMm: KITCHEN_L_DESIGN.room.widthMm + extraMm,
          }
        : {
            ...KITCHEN_L_DESIGN.room,
            depthMm: KITCHEN_L_DESIGN.room.depthMm + extraMm,
          };
    const runEndMm = Math.max(
      ...floorTilesOn(shellIn(room), wall).map((tile) => tile.endMm),
    );
    return wallLengthMm(wall, room) - runEndMm;
  });
  return Math.min(...shortfallsMm);
}

function floorRunOriginMm(wall: DesignWall): number {
  return floorRunStartMm(wall) + floorRunShortfallMm(wall);
}

function edgeRooms(): readonly DesignRoom[] {
  const l = approvedL();
  const wallAEdges = edgesOf(l.wallA, floorRunOriginMm("A"));
  const wallBEdges = edgesOf(l.wallB, floorRunOriginMm("B"));
  const heightEdges = [
    l.height.minMm,
    l.height.minMm + 1,
    TOP_ROW_CEILING_MM - 1,
    TOP_ROW_CEILING_MM,
    TOP_ROW_CEILING_MM + 1,
    l.height.maxMm - 1,
    l.height.maxMm,
  ];
  return wallAEdges.flatMap((widthMm) =>
    wallBEdges.flatMap((depthMm) =>
      heightEdges.map((heightMm) => ({
        shape: "L" as const,
        widthMm,
        depthMm,
        heightMm,
      })),
    ),
  );
}

/** Every property here runs over the uniform sample **and** every edge room. fast-check spends
 *  `numRuns` on the examples first, so the sample is added on top of them — measured: with
 *  `numRuns` alone the edges consumed every run and no room was ever drawn. */
function assertOverTheRange(check: (room: DesignRoom) => void): void {
  const examples = edgeRooms().map((room) => [room] as [DesignRoom]);
  fc.assert(fc.property(approvedRoom(), check), {
    numRuns: RUNS + examples.length,
    examples,
  });
}

function catalogAt(cabinetDepthMm: number): BodyCatalog {
  return buildKitchenLBodyCatalog(cabinetDepthMm);
}

function findingsOf(design: Design, cabinetDepthMm: number): string[] {
  return validateDesignForCatalog(design, catalogAt(cabinetDepthMm)).map(
    (issue) => `${issue.code}@${issue.path}`,
  );
}

function otherDeclaredDepthsMm(): number[] {
  return declaredCabinetDepthsMm().filter(
    (depthMm) => depthMm !== SHELL_CABINET_DEPTH_MM,
  );
}

function frozenMapOf(design: Design): string {
  return JSON.stringify({
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  });
}

/** A floor tile's along-wall interval on `wall`. */
function floorTilesOn(design: Design, wall: DesignWall) {
  return (design.emptyColumns ?? [])
    .filter((entry) => entry.wall === wall && entry.y0Mm === 0)
    .map(alongIntervalOf);
}

interface ShellFacesAt {
  readonly records: readonly PlacementRecord[];
  readonly recorded: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly catalog: BodyCatalog;
}

/** The two faces a loaded session holds `design` in, at the design's own depth. */
function facesAt(design: Design, cabinetDepthMm: number): ShellFacesAt {
  const catalog = catalogAt(cabinetDepthMm);
  const records = derivePlacementRecords(design, catalog);
  return {
    records,
    recorded: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    voids: recomputeVoids(records, deriveColumns(records, design, design.room)),
    catalog,
  };
}

function insertInto(
  design: Design,
  faces: ShellFacesAt,
  target: { readonly openingId: string; readonly buildId: string },
) {
  return insertBody({
    design,
    catalog: faces.catalog,
    columns: faces.recorded,
    voids: faces.voids,
    target: { kind: "void", id: target.openingId },
    buildId: target.buildId,
    probe: createFakeProbe({ catalog: faces.catalog }),
    occurredAt: SHELL_OCCURRED_AT,
  });
}

describe("buildLShellDesign over the approved range and its edges", () => {
  it("sweeps the edge rooms it claims to (premise)", () => {
    const rooms = edgeRooms();

    expect(rooms.length).toBeGreaterThan(500);
    expect(rooms).toContainEqual({
      shape: "L",
      widthMm: approvedL().wallA.minMm,
      depthMm: approvedL().wallB.minMm,
      heightMm: TOP_ROW_CEILING_MM - 1,
    });
    expect(floorRunShortfallMm("B")).toBeGreaterThan(0);
  });

  it("reaches each wall's one-tile-plus-2-mm seam, wherever the shell's shortfall puts it (premise)", () => {
    const seamRoom = edgeRooms().find(
      (room) =>
        room.widthMm ===
          floorRunOriginMm("A") + MAX_EMPTY_COLUMN_WIDTH_MM + 2 &&
        room.depthMm === floorRunOriginMm("B") + MAX_EMPTY_COLUMN_WIDTH_MM + 2,
    );
    if (!seamRoom) throw new Error("no edge room at both walls' seam");

    const shell = shellIn(seamRoom);

    for (const wall of ["A", "B"] as const) {
      expect(
        floorTilesOn(shell, wall).map((tile) => tile.endMm - tile.startMm),
        wall,
      ).toStrictEqual([MAX_EMPTY_COLUMN_WIDTH_MM, 2]);
    }
  });

  it("reports no finding of either severity as built, at every other declared depth, and back again (criteria 1, 2, 9)", () => {
    expect(otherDeclaredDepthsMm().length).toBeGreaterThan(0);

    assertOverTheRange((room) => {
      const shell = shellIn(room);
      const findings = [...findingsOf(shell, SHELL_CABINET_DEPTH_MM)];
      for (const depthMm of otherDeclaredDepthsMm()) {
        const moved = atCabinetDepth(shell, depthMm);
        const back = atCabinetDepth(moved, SHELL_CABINET_DEPTH_MM);
        findings.push(
          ...findingsOf(moved, depthMm).map((f) => `@${String(depthMm)} ${f}`),
          ...findingsOf(back, SHELL_CABINET_DEPTH_MM).map((f) => `back ${f}`),
        );
      }

      expect(findings, JSON.stringify(room)).toStrictEqual([]);
    });
  });

  it("carries its frozen map byte-identically through a change to every declared depth and back", () => {
    assertOverTheRange((room) => {
      const shell = shellIn(room);

      for (const depthMm of otherDeclaredDepthsMm()) {
        const back = atCabinetDepth(
          atCabinetDepth(shell, depthMm),
          SHELL_CABINET_DEPTH_MM,
        );
        expect(frozenMapOf(back), JSON.stringify(room)).toBe(
          frozenMapOf(shell),
        );
      }
    });
  });

  it("records every tile against its neutral source at the depth it was moved to (criterion 8 after a depth change, ADR 0080)", () => {
    assertOverTheRange((room) => {
      for (const depthMm of declaredCabinetDepthsMm()) {
        const moved = atCabinetDepth(shellIn(room), depthMm);
        const catalog = catalogAt(depthMm);

        for (const tile of moved.emptyColumns ?? []) {
          const source =
            tile.y0Mm === 0
              ? NEUTRAL_SOURCE_BY_FLOOR.floor
              : NEUTRAL_SOURCE_BY_FLOOR.wallOnly;
          const definition = catalog.get(source);
          if (!definition)
            throw new Error(`no ${source} at ${String(depthMm)}`);
          expect(tile.depthFromBuildId).toBe(source);
          expect(
            tile.depthMm,
            `${JSON.stringify(room)} @${String(depthMm)}`,
          ).toBe(
            toMillimetres(
              occupiedDepthOfEntryM({ buildId: source, definition }),
            ),
          );
        }
      }
    });
  });

  it("publishes no opening past either wall's end at any declared depth (criterion 4)", () => {
    assertOverTheRange((room) => {
      for (const depthMm of declaredCabinetDepthsMm()) {
        const moved = atCabinetDepth(shellIn(room), depthMm);

        for (const opening of facesAt(moved, depthMm).voids) {
          expect(openingIntervalOf(opening).endMm).toBeLessThanOrEqual(
            wallLengthMm(opening.wall, room),
          );
        }
      }
    });
  });

  it("is a fixed point of the load seam: migrateDesign, then the map a save projects, writes it back unchanged", () => {
    assertOverTheRange((room) => {
      const shell = shellIn(room);
      const stored: unknown = JSON.parse(JSON.stringify(shell));

      const loaded = migrateDesign(CURRENT_SCHEMA_VERSION, stored);
      const records = derivePlacementRecords(
        loaded,
        catalogAt(SHELL_CABINET_DEPTH_MM),
      );
      const saved = withFrozenMap(
        loaded,
        projectFrozenMap(
          deriveRecordedColumns(records, loaded, toMetres(loaded.room.widthMm)),
          records,
        ),
      );

      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(shell),
      );
      expect(canonicalSerializeDesign(saved)).toBe(
        canonicalSerializeDesign(shell),
      );
    });
  });

  it("meets the write seam's own contract: the current schema, no fatal finding, and every byte and entry cap", () => {
    assertOverTheRange((room) => {
      const shell = shellIn(room);

      expect(CurrentDesignSchema.safeParse(shell).success).toBe(true);
      expect(
        fatalDesignValidationIssues(
          validateDesignForCatalog(shell, catalogAt(SHELL_CABINET_DEPTH_MM)),
        ),
      ).toStrictEqual([]);
      expect(
        new TextEncoder().encode(canonicalSerializeDesign(shell)).length,
      ).toBeLessThanOrEqual(MAX_DESIGN_BYTES);
      expect((shell.emptyColumns ?? []).length).toBeLessThanOrEqual(
        MAX_EMPTY_COLUMNS,
      );
      expect((shell.columnExtents ?? []).length).toBeLessThanOrEqual(
        MAX_COLUMN_EXTENTS,
      );
    });
  });

  // Criterion 3 bounds a tile's top from above (`<=`) and reads its floor only through the band it
  // reaches into, so a tile a millimetre short of the ceiling, or a wall-only tile a millimetre off
  // the wall row, passes every other test in the wave — and a 399 mm top opening then refuses the
  // 400 mm top row. Amendment B2 states both edges exactly; this holds them to it.
  it("stands every tile on the extent Amendment B2 rules: floor tiles 0 to the ceiling, wall-only tiles from the wall row", () => {
    const moduleGridTopMm = toMillimetres(
      Math.max(...LEVELS.map(([, topM]) => topM)),
    );
    const wallRowFloorMm = toMillimetres(LEVELS[1]?.[0] ?? Number.NaN);

    assertOverTheRange((room) => {
      for (const tile of shellIn(room).emptyColumns ?? []) {
        const expectedFloorMm =
          tile.depthFromBuildId === NEUTRAL_SOURCE_BY_FLOOR.floor
            ? 0
            : wallRowFloorMm;
        expect(tile.y0Mm).toBe(expectedFloorMm);
        expect(tile.topMm).toBe(Math.min(room.heightMm, moduleGridTopMm));
      }
    });
  });

  it("builds the room the room form accepted, end to end, at the approved maximum", () => {
    const l = approvedL();
    const room = acceptedRoom(
      {
        shape: "L",
        wallAMm: l.wallA.maxMm,
        wallBMm: l.wallB.maxMm,
        heightMm: l.height.maxMm,
        cornerDirection: "left",
      },
      APPROVED_ROOM_POLICY,
    );

    const shell = shellIn(room);

    expect(shell.room).toStrictEqual(room);
    expect(CurrentDesignSchema.safeParse(shell).success).toBe(true);
    expect(findingsOf(shell, SHELL_CABINET_DEPTH_MM)).toStrictEqual([]);
  });
});

describe("buildLShellDesign — anything composed into it still fits after a depth change (ADR 0110 B3, ADR 0109 C)", () => {
  /** The largest slide any body the catalogue lets a customer or composition insert makes along
   *  wall B, from the shell's depth to any declared one — read through the production reader for
   *  each body's own declared chain, not through the chain of the one source the builder picked. */
  function largestInsertableSlideMm(): number {
    const catalog = catalogAt(SHELL_CABINET_DEPTH_MM);
    const slidesMm = listInsertableBodies(catalog).flatMap((body) =>
      declaredCabinetDepthsMm().map((toCabinetDepthMm) => {
        const query: AlongWallShiftQuery = {
          fromCabinetDepthMm: SHELL_CABINET_DEPTH_MM,
          toCabinetDepthMm,
          chain: cabinetDepthRuleOf({
            buildId: body.buildId,
            rule: body.definition.depthRule,
          }).alongWallPositionFollows,
        };
        return alongWallShiftMm(query);
      }),
    );
    return Math.max(0, ...slidesMm);
  }

  it("leaves wall B at least the slide of every insertable body, not just of its own tile source", () => {
    const slideMm = largestInsertableSlideMm();
    expect(slideMm).toBeGreaterThan(0);

    assertOverTheRange((room) => {
      const tiles = floorTilesOn(shellIn(room), "B");
      if (tiles.length === 0) return;
      const runEndMm = Math.max(...tiles.map((tile) => tile.endMm));

      expect(wallLengthMm("B", room) - runEndMm).toBeGreaterThanOrEqual(
        slideMm,
      );
    });
  });
});

describe("buildLShellDesign — the document shares nothing with its sources", () => {
  /** A caller that ignores `readonly` — a store, a JSON patch, a composer editing in place. */
  interface WritableShell {
    settings: { cabinetDepthMm?: number };
    placements: { alongMm: number; body: { widthMm: number } }[];
    emptyColumns?: { widthMm: number }[];
  }

  it("changes neither the reference kitchen nor the next shell when its caller writes into it", () => {
    const referenceBefore = JSON.stringify(KITCHEN_L_DESIGN);
    const room = { ...KITCHEN_L_DESIGN.room };
    const pristine = JSON.stringify(shellIn(room));
    const written = shellIn(room) as unknown as WritableShell;

    written.settings.cabinetDepthMm = 700;
    for (const placement of written.placements) {
      placement.alongMm = 1;
      placement.body.widthMm = 1;
    }
    for (const tile of written.emptyColumns ?? []) tile.widthMm = 1;

    expect(JSON.stringify(KITCHEN_L_DESIGN)).toBe(referenceBefore);
    expect(JSON.stringify(shellIn(room))).toBe(pristine);
  });

  it("builds one document for one room whatever order its fields were written in (criterion 6)", () => {
    const room = KITCHEN_L_DESIGN.room;
    const reordered: DesignRoom = {
      heightMm: room.heightMm,
      depthMm: room.depthMm,
      widthMm: room.widthMm,
      shape: room.shape,
    };

    expect(canonicalSerializeDesign(shellIn(reordered))).toBe(
      canonicalSerializeDesign(shellIn({ ...room })),
    );
  });
});

describe("buildLShellDesign — the offer list and the command agree on every opening (criterion 4, §11 row 6)", () => {
  const ROOMS: readonly DesignRoom[] = [
    { ...KITCHEN_L_DESIGN.room },
    { shape: "L", widthMm: 900, depthMm: 1000, heightMm: 2200 },
    { shape: "L", widthMm: 1702, depthMm: 1802, heightMm: 2599 },
    // The pre-7A3 approved corner, kept on purpose: the shell is engine-level and this is storable.
    { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 3900 },
    // The approved corner since M7 7A3, and a room the policy admits only since then: wall B wider.
    { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 3900 },
    { shape: "L", widthMm: 2400, depthMm: 6000, heightMm: 3900 },
  ];

  it.each(ROOMS.map((room) => [JSON.stringify(room), room] as const))(
    "in %s, every insertable body is offered in an opening exactly when insertBody accepts it there",
    (_name, room) => {
      const shell = shellIn(room);
      const faces = facesAt(shell, SHELL_CABINET_DEPTH_MM);
      const disagreements: string[] = [];

      for (const opening of faces.voids) {
        const offered = new Set(
          offersFor({
            records: faces.records,
            voids: faces.voids,
            columns: faces.recorded,
            catalog: faces.catalog,
            target: { kind: "void", id: opening.id },
            cabinetDepthMm: SHELL_CABINET_DEPTH_MM,
          }).map((offer) => offer.buildId),
        );
        for (const body of listInsertableBodies(faces.catalog)) {
          const accepted = insertInto(shell, faces, {
            openingId: opening.id,
            buildId: body.buildId,
          }).ok;
          if (accepted !== offered.has(body.buildId)) {
            disagreements.push(
              `${opening.col}@${String(opening.y0)} ${body.buildId}`,
            );
          }
        }
      }

      expect(faces.voids.length).toBeGreaterThan(0);
      expect(disagreements).toStrictEqual([]);
    },
  );
});

describe("buildLShellDesign — the finished end of a filled wall-A run (ADR 0083 decision 5)", () => {
  /** Where the run-end panel's outer face would stand, in millimetres along wall A. */
  function panelOuterFaceMm(design: Design): number | undefined {
    const seatM = runEndPanelSeatM(
      derivePlacementRecords(design, catalogAt(SHELL_CABINET_DEPTH_MM)),
      design.room,
    );
    return seatM === undefined
      ? undefined
      : toMillimetres(seatM + RUN_END_PANEL_THICKNESS_M / 2);
  }

  /** Each wall-A base opening of the shell, filled with a base cabinet on its own. */
  function eachWallABaseFill(room: DesignRoom): Design[] {
    const shell = shellIn(room);
    const faces = facesAt(shell, SHELL_CABINET_DEPTH_MM);
    return faces.voids
      .filter(
        (opening) => opening.wall === "A" && deriveSlotBand(opening) === "base",
      )
      .flatMap((opening) => {
        const result = insertInto(shell, faces, {
          openingId: opening.id,
          buildId: NEUTRAL_SOURCE_BY_FLOOR.floor,
        });
        return result.ok ? [result.design] : [];
      });
  }

  // Round 1's Q1.1: ADR 0083 decision 5 makes the finished end part of wall A's occupied width, so a
  // base cabinet in the last opening must never leave the panel's outer face past the wall's end.
  // Green under ADR 0110 B3a's reserve and, since 7D1b, under ADR 0045 Amendment A's veto in
  // `runEndPanelSeatM` — which is why these read the outcome and not the mechanism. That the veto does
  // not hide a panel with room for it is held by the every-wall-A sweep further down.
  it("keeps the run-end panel inside wall A in the reference room, whichever opening a base cabinet fills", () => {
    const room = { ...KITCHEN_L_DESIGN.room };

    const outerFacesMm = eachWallABaseFill(room).map(panelOuterFaceMm);

    expect(outerFacesMm.length).toBeGreaterThan(0);
    for (const outerFaceMm of outerFacesMm) {
      expect(outerFaceMm ?? 0).toBeLessThanOrEqual(room.widthMm);
    }
  });

  it("keeps the run-end panel inside wall A over the approved range, whichever opening a base cabinet fills", () => {
    const outside: string[] = [];
    let fills = 0;

    assertOverTheRange((room) => {
      for (const filled of eachWallABaseFill(room)) {
        fills += 1;
        const outerFaceMm = panelOuterFaceMm(filled);
        if (outerFaceMm !== undefined && outerFaceMm > room.widthMm) {
          outside.push(`A ${String(room.widthMm)}: ${String(outerFaceMm)}`);
        }
      }
    });

    expect(fills).toBeGreaterThan(RUNS);
    expect({ count: outside.length, first: outside.slice(0, 3) }).toStrictEqual(
      {
        count: 0,
        first: [],
      },
    );
  });
});

describe("buildLShellDesign — what src/generation/ does not do, by any route (criteria 7 and 10)", () => {
  const SRC = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
  );
  const GENERATION = path.join(SRC, "generation");

  const sources = readdirSync(GENERATION)
    // Wave 7D2 legitimately imports a probe and applies the command-result funnel. This 7D1 guard
    // remains scoped to the shell whose purity it was written to protect.
    .filter((name) => name === "shell-design.ts")
    .map((name) => {
      const file = path.join(GENERATION, name);
      return { name, file, code: withoutComments(readFileSync(file, "utf8")) };
    });

  /** Comments name the forbidden functions by design — the module head explains why it calls
   *  neither — so the scan reads code only. */
  function withoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  /** Every relative module a generation source imports at runtime, resolved to its `.ts` file. */
  function runtimeImportsOf(source: {
    readonly file: string;
    readonly code: string;
  }) {
    const specifiers = [
      ...source.code.matchAll(/\bimport\s+(?!type\b)[^;]*?from\s+"([^"]+)"/g),
      ...source.code.matchAll(/\bimport\s+"([^"]+)"/g),
    ].map((match) => match[1] ?? "");
    return specifiers
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) =>
        path
          .resolve(path.dirname(source.file), specifier)
          .replace(/\.js$/, ".ts"),
      );
  }

  const FORBIDDEN_MODULES = [
    path.join(SRC, "commands", "remove-placement.ts"),
    path.join(SRC, "body-probe.ts"),
    ...readdirSync(path.join(SRC, "pricing"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => path.join(SRC, "pricing", name)),
  ];

  async function runtimeValuesOf(file: string): Promise<Map<unknown, string>> {
    const namespace = (await import(pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    return new Map(
      Object.entries(namespace)
        .filter(
          ([, value]) =>
            typeof value === "function" || typeof value === "object",
        )
        .map(([name, value]) => [value, `${path.relative(SRC, file)}#${name}`]),
    );
  }

  it("scans the shell module and every import it makes (premise)", () => {
    expect(sources.map((source) => source.name)).toContain("shell-design.ts");
    expect(sources.flatMap(runtimeImportsOf).length).toBeGreaterThan(5);
  });

  it("imports no module that hands it removePlacement, a probe or a price book — through a re-export or the barrel included", async () => {
    const forbidden = new Map<unknown, string>();
    for (const file of FORBIDDEN_MODULES) {
      for (const [value, name] of await runtimeValuesOf(file))
        forbidden.set(value, name);
    }
    const reached: string[] = [];

    for (const imported of new Set(sources.flatMap(runtimeImportsOf))) {
      for (const value of (await runtimeValuesOf(imported)).keys()) {
        const name = forbidden.get(value);
        if (name !== undefined)
          reached.push(`${path.relative(SRC, imported)} -> ${name}`);
      }
    }

    expect(forbidden.size).toBeGreaterThan(5);
    expect(reached).toStrictEqual([]);
  });

  it("names removePlacement and clipEmptyColumnsAtWallEnd nowhere in its code, under any alias", () => {
    const naming = sources.filter((source) =>
      /\bremovePlacement\b|\bclipEmptyColumnsAtWallEnd\b/.test(source.code),
    );

    expect(naming.map((source) => source.name)).toStrictEqual([]);
  });

  it("loads no module at run time by a route the scan above cannot see", () => {
    const dynamic = sources.filter((source) =>
      /\bimport\s*\(|\brequire\s*\(/.test(source.code),
    );

    expect(dynamic.map((source) => source.name)).toStrictEqual([]);
  });
});

// ───────────────────────────── QA round 2 (Adjudications 7D1-Q1 and 7D1-Q2) ─────────────────────────────

describe("buildLShellDesign — wall A's floor run and the wall-end panel veto, every wall A from 900 to 2000 (ADR 0045 Amendment A)", () => {
  const FIRST_WALL_A_MM = approvedL().wallA.minMm;
  const LAST_SWEPT_WALL_A_MM = 2000;
  /** The panel's gap and slab, from `run-end-panel.ts`: a run must stop this far short for it. */
  const FOOTPRINT_MM = toMillimetres(
    RUN_END_PANEL_GAP_M + RUN_END_PANEL_THICKNESS_M,
  );
  const CORNER_FAR_EDGE_MM = floorRunStartMm("A");

  const sweptRooms = Array.from(
    { length: LAST_SWEPT_WALL_A_MM - FIRST_WALL_A_MM + 1 },
    (_, i): DesignRoom => ({
      shape: "L",
      widthMm: FIRST_WALL_A_MM + i,
      depthMm: 2000,
      heightMm: TOP_ROW_CEILING_MM,
    }),
  );

  /** The last millimetre the floor run reaches: the wall's own end, then P3's parity. */
  function expectedFloorEndMm(wallAMm: number): number {
    return wallAMm - ((wallAMm - CORNER_FAR_EDGE_MM) % 2);
  }

  function segmentOf(startMm: number, endMm: number) {
    return endMm > startMm ? [{ startMm, endMm }] : [];
  }

  /** The right edge of wall A's right-most base body — what the panel closes. */
  function wallABaseRunEndMm(design: Design): number {
    return Math.max(
      ...design.placements
        .filter((placement) => placement.wall === "A" && placement.y0Mm === 0)
        .map((placement) => placement.alongMm + placement.body.widthMm / 2),
    );
  }

  it("records the floor band from the corner to the wall's end, odd spans one short, and the wall band over the corner untouched", () => {
    const parities = new Set<number>();

    for (const room of sweptRooms) {
      const shell = shellIn(room);
      const [base, wall] = bandsUnder(room.heightMm);
      if (!base || !wall) throw new Error("the grid has no base or wall band");
      const floorEndMm = expectedFloorEndMm(room.widthMm);
      const spanMm = room.widthMm - CORNER_FAR_EDGE_MM;
      if (spanMm > 0) parities.add(spanMm % 2);

      expect(
        unionOf(emptyIntervalsIn(shell, "A", base)),
        `A ${String(room.widthMm)}`,
      ).toStrictEqual(segmentOf(CORNER_FAR_EDGE_MM, floorEndMm));
      expect(
        unionOf(emptyIntervalsIn(shell, "A", wall)),
        `A ${String(room.widthMm)}`,
      ).toStrictEqual(
        unionOf([
          { startMm: 0, endMm: CORNER_FAR_EDGE_MM },
          ...segmentOf(CORNER_FAR_EDGE_MM, floorEndMm),
        ]),
      );
    }

    expect([...parities].sort()).toStrictEqual([0, 1]);
  });

  // Both directions of the veto, on every run the shell lets a base cabinet close — each wall-A base
  // opening filled on its own — and on the bare shell, where the corner base closes the run: the
  // panel is drawn **exactly when** the footprint is free, and then stands inside the wall.
  it("draws the panel exactly when the footprint is free and never past the wall, whichever run closes wall A", () => {
    const outcomes = new Map<string, number>();
    const wrong: string[] = [];
    const tally = (outcome: string) =>
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);

    for (const room of sweptRooms) {
      const shell = shellIn(room);
      const faces = facesAt(shell, SHELL_CABINET_DEPTH_MM);
      const closings = [
        shell,
        ...faces.voids
          .filter(
            (opening) =>
              opening.wall === "A" && deriveSlotBand(opening) === "base",
          )
          .flatMap((opening) => {
            const result = insertInto(shell, faces, {
              openingId: opening.id,
              buildId: NEUTRAL_SOURCE_BY_FLOOR.floor,
            });
            return result.ok ? [result.design] : [];
          }),
      ];
      for (const closed of closings) {
        const freeMm = room.widthMm - wallABaseRunEndMm(closed);
        const seatM = runEndPanelSeatM(
          derivePlacementRecords(closed, faces.catalog),
          room,
        );
        const outerFaceMm =
          seatM === undefined
            ? undefined
            : toMillimetres(seatM + RUN_END_PANEL_THICKNESS_M / 2);
        const isDrawn = outerFaceMm !== undefined;
        tally(
          freeMm === 0
            ? "flush, hidden"
            : freeMm < FOOTPRINT_MM
              ? "inside the footprint, hidden"
              : freeMm === FOOTPRINT_MM
                ? "exactly the footprint free, drawn"
                : "more than the footprint free, drawn",
        );
        if (
          isDrawn !== freeMm >= FOOTPRINT_MM ||
          (outerFaceMm ?? 0) > room.widthMm
        ) {
          wrong.push(
            `A ${String(room.widthMm)}, ${String(freeMm)} free: ${String(outerFaceMm)}`,
          );
        }
      }
    }

    expect(wrong.slice(0, 3)).toStrictEqual([]);
    expect([...outcomes.keys()].sort()).toStrictEqual([
      "exactly the footprint free, drawn",
      "flush, hidden",
      "inside the footprint, hidden",
      "more than the footprint free, drawn",
    ]);
  });
});

describe("runEndPanelSeatM's wall-end veto at every whole-millimetre run end (ADR 0045 Amendment A)", () => {
  const FOOTPRINT_MM = toMillimetres(
    RUN_END_PANEL_GAP_M + RUN_END_PANEL_THICKNESS_M,
  );
  /** The veto's float allowance, read back off the rule rather than restated: the largest overshoot
   *  in metres it still treats as touching — about a thousandth of a millimetre. */
  const ALLOWANCE_BOUND_MM = 0.001;
  const LONGEST_WALL_A_MM = approvedL().wallA.maxMm;
  const BASE_WIDTHS_MM = [150, 200, 598, 600, 800];

  /** The records of a design holding one base cabinet ending at `runEndMm` — framed by the product's
   *  own derivation, so the float path is the one every real run takes. */
  function recordsEndingAt(runEndMm: number, widthMm: number) {
    return derivePlacementRecords(
      {
        ...KITCHEN_L_DESIGN,
        placements: [
          {
            id: "b",
            wall: "A",
            alongMm: runEndMm - widthMm / 2,
            y0Mm: 0,
            body: { buildId: "base-cabinet", widthMm, heightMm: 860 },
          },
        ],
      },
      catalogAt(SHELL_CABINET_DEPTH_MM),
    );
  }

  function wallA(widthMm: number): DesignRoom {
    return { ...KITCHEN_L_DESIGN.room, widthMm };
  }

  it("draws at exactly the footprint and hides at one millimetre less, flush, and past, for every run end and width", () => {
    const wrong: string[] = [];
    let largestOvershootMm = 0;
    let checked = 0;

    for (const widthMm of BASE_WIDTHS_MM) {
      for (
        let runEndMm = widthMm;
        runEndMm + FOOTPRINT_MM <= LONGEST_WALL_A_MM;
        runEndMm += 1
      ) {
        const records = recordsEndingAt(runEndMm, widthMm);
        const atFootprint = runEndPanelSeatM(
          records,
          wallA(runEndMm + FOOTPRINT_MM),
        );
        if (atFootprint === undefined) {
          wrong.push(
            `${String(widthMm)} ending ${String(runEndMm)}: hidden at the footprint`,
          );
        } else {
          const overshootMm =
            (atFootprint + RUN_END_PANEL_THICKNESS_M / 2) * 1000 -
            (runEndMm + FOOTPRINT_MM);
          largestOvershootMm = Math.max(largestOvershootMm, overshootMm);
        }
        for (const freeMm of [FOOTPRINT_MM - 1, 1, 0]) {
          if (
            runEndPanelSeatM(records, wallA(runEndMm + freeMm)) !== undefined
          ) {
            wrong.push(
              `${String(widthMm)} ending ${String(runEndMm)}: drawn with ${String(freeMm)} free`,
            );
          }
        }
        if (
          runEndMm - 1 > 0 &&
          runEndPanelSeatM(records, wallA(runEndMm - 1)) !== undefined
        ) {
          wrong.push(
            `${String(widthMm)} ending ${String(runEndMm)}: drawn past the wall`,
          );
        }
        checked += 1;
      }
    }

    expect(wrong.slice(0, 3)).toStrictEqual([]);
    expect(checked).toBeGreaterThan(25_000);
    expect(largestOvershootMm).toBeLessThan(ALLOWANCE_BOUND_MM);
  });

  it("hides a panel half a millimetre past the wall and draws one half a millimetre inside it", () => {
    const oddWidthMm = 599;
    const records = recordsEndingAt(3500.5, oddWidthMm);

    expect(runEndPanelSeatM(records, wallA(3519))).toBeUndefined();
    expect(runEndPanelSeatM(records, wallA(3520))).toBeCloseTo(3.5105, 9);
  });
});

describe("buildLShellDesign — the room it refuses (Q1.5, revised: refuse rather than copy)", () => {
  const ROOM: DesignRoom = { ...KITCHEN_L_DESIGN.room };

  function refusalFor(
    room: unknown,
    occurredAt = SHELL_OCCURRED_AT,
  ): LShellInputRefusal | "built" {
    try {
      buildLShellDesign({ room: room as DesignRoom, occurredAt });
    } catch (error) {
      if (error instanceof LShellInputError) return error.refusal;
      throw error;
    }
    return "built";
  }

  it.each([
    // ADR 0129 D2 added `cornerDirection` to DesignRoomSchema this wave, so it is no longer an
    // extra key here — `corner-direction.test.ts` covers that a room carrying it now builds.
    ["an extra key", { ...ROOM, depthSetting: 700 }],
    ["a missing key", { shape: "L", widthMm: 3560, depthMm: 2920 }],
    ["a width written as text", { ...ROOM, widthMm: "3560" }],
    ["a fractional millimetre", { ...ROOM, widthMm: 3560.5 }],
    ["a zero wall", { ...ROOM, widthMm: 0 }],
    ["a negative wall", { ...ROOM, depthMm: -1 }],
    ["a NaN ceiling", { ...ROOM, heightMm: Number.NaN }],
    ["a wall past the schema's maximum", { ...ROOM, widthMm: 1_000_000 }],
    ["a shape the schema does not know", { ...ROOM, shape: "U" }],
    ["no room at all", undefined],
    ["null", null],
    ["an array", [3560, 2920, 2600]],
  ])("refuses %s as ROOM_NOT_A_DESIGN_ROOM", (_what, room) => {
    expect(refusalFor(room)).toBe("ROOM_NOT_A_DESIGN_ROOM");
  });

  it("refuses a linear room the schema accepts as ROOM_NOT_L, and a bad room before a bad moment", () => {
    expect(refusalFor({ ...ROOM, shape: "linear" })).toBe("ROOM_NOT_L");
    expect(refusalFor({ ...ROOM, extra: 1 }, "yesterday")).toBe(
      "ROOM_NOT_A_DESIGN_ROOM",
    );
    expect(refusalFor({ ...ROOM, shape: "linear" }, "yesterday")).toBe(
      "ROOM_NOT_L",
    );
  });

  it("refuses with a named domain error that carries its code and no room value", () => {
    const hostile = { ...ROOM, note: "<script>" };

    const thrown = (() => {
      try {
        buildLShellDesign({
          room: hostile as DesignRoom,
          occurredAt: SHELL_OCCURRED_AT,
        });
      } catch (error) {
        return error;
      }
      return undefined;
    })();

    expect(thrown).toBeInstanceOf(LShellInputError);
    expect(thrown).toMatchObject({
      name: "LShellInputError",
      refusal: "ROOM_NOT_A_DESIGN_ROOM",
    });
    expect((thrown as Error).message).not.toContain("<script>");
  });

  it("builds every room inside the approved field bounds, including coupled-policy refusals", () => {
    const l = approvedL();

    fc.assert(
      fc.property(
        millimetresIn(l.wallA),
        millimetresIn(l.wallB),
        millimetresIn(l.height),
        fc.constantFrom("left" as const, "right" as const),
        (wallAMm, wallBMm, heightMm, cornerDirection) => {
          const validation = validateRoomInput(
            { shape: "L", wallAMm, wallBMm, heightMm, cornerDirection },
            APPROVED_ROOM_POLICY,
          );
          if (!validation.ok) {
            expect(validation.issues).toEqual([
              { code: "ROOM_TOO_SMALL_FOR_KITCHEN", field: "shape" },
            ]);
          }

          expect(
            refusalFor({
              shape: "L",
              widthMm: wallAMm,
              depthMm: wallBMm,
              heightMm,
            }),
          ).toBe("built");
        },
      ),
      {
        numRuns: RUNS + 8,
        examples: [
          [l.wallA.minMm, l.wallB.minMm, l.height.minMm, "left"],
          [l.wallA.maxMm, l.wallB.maxMm, l.height.maxMm, "right"],
          [l.wallA.minMm, l.wallB.maxMm, l.height.minMm, "right"],
          [l.wallA.maxMm, l.wallB.minMm, l.height.maxMm, "left"],
          [l.wallA.minMm + 18, l.wallB.minMm, TOP_ROW_CEILING_MM - 1, "left"],
          [l.wallA.minMm + 19, l.wallB.minMm + 1, TOP_ROW_CEILING_MM, "right"],
          [
            l.wallA.minMm + 20,
            l.wallB.minMm + 2,
            TOP_ROW_CEILING_MM + 1,
            "left",
          ],
          [l.wallA.minMm + 21, l.wallB.minMm + 3, l.height.maxMm - 1, "right"],
        ],
      },
    );
  });
});

describe("the it.fails band 900–918 reaches its assertion (Adjudication 7D1-Q2)", () => {
  // `it.fails` passes on **any** throw. The implementer's premise shows the band's rooms build and
  // that filling places nothing; it does not run the one call left in each case's body, the panel's
  // own seat. This holds that call to answering — a number or no panel — rather than throwing, so a
  // case can only be green because its assertion failed.
  it("computes the run-end panel for every band room without throwing", () => {
    const l = approvedL();
    const lastMm =
      floorRunStartMm("A") +
      toMillimetres(RUN_END_PANEL_GAP_M + RUN_END_PANEL_THICKNESS_M) -
      1;
    let computed = 0;

    for (let widthMm = l.wallA.minMm; widthMm <= lastMm; widthMm += 1) {
      const room: DesignRoom = {
        shape: "L",
        widthMm,
        depthMm: l.wallB.minMm,
        heightMm: TOP_ROW_CEILING_MM,
      };
      const filled = withWallABaseRunFilled(shellIn(room));

      expect(() =>
        runEndPanelSeatM(
          derivePlacementRecords(filled, catalogAt(SHELL_CABINET_DEPTH_MM)),
          room,
        ),
      ).not.toThrow();
      computed += 1;
    }

    expect(computed).toBe(19);
  });
});

// ───────────────────────────── QA round 3 (review round 1, R1.2) ─────────────────────────────

describe("buildLShellDesign — the engine's own limits (R1.2)", () => {
  const ROOM: DesignRoom = { ...KITCHEN_L_DESIGN.room };
  const engineL = (() => {
    const walls = ENGINE_ROOM_LIMITS.buildableShapes.L;
    if (!walls) throw new Error("the engine builds no L");
    return { ...walls, height: ENGINE_ROOM_LIMITS.heightBounds };
  })();

  function refusalFor(
    room: DesignRoom,
    occurredAt = SHELL_OCCURRED_AT,
  ): LShellInputRefusal | "built" {
    try {
      buildLShellDesign({ room, occurredAt });
    } catch (error) {
      if (error instanceof LShellInputError) return error.refusal;
      throw error;
    }
    return "built";
  }

  it.each([
    [
      "a ceiling a millimetre under the engine's floor",
      { ...ROOM, heightMm: engineL.height.minMm - 1 },
    ],
    [
      "wall A a millimetre short of the corner",
      { ...ROOM, widthMm: engineL.wallA.minMm - 1 },
    ],
    [
      "wall B a millimetre short of its minimum",
      { ...ROOM, depthMm: engineL.wallB.minMm - 1 },
    ],
    [
      "a one-millimetre room",
      { shape: "L" as const, widthMm: 1, depthMm: 1, heightMm: 1 },
    ],
  ])("refuses %s as ROOM_OUTSIDE_ENGINE_LIMITS", (_what, room) => {
    expect(refusalFor(room)).toBe("ROOM_OUTSIDE_ENGINE_LIMITS");
  });

  it("orders its refusals schema, shape, limits, moment — and leaves the maxima to the schema", () => {
    const tooLow = { ...ROOM, heightMm: engineL.height.minMm - 1 };

    expect(refusalFor({ ...tooLow, shape: "linear" })).toBe("ROOM_NOT_L");
    expect(refusalFor(tooLow, "yesterday")).toBe("ROOM_OUTSIDE_ENGINE_LIMITS");
    expect(refusalFor({ ...ROOM, heightMm: engineL.height.maxMm + 1 })).toBe(
      "ROOM_NOT_A_DESIGN_ROOM",
    );
    expect(refusalFor({ ...ROOM, widthMm: engineL.wallA.maxMm + 1 })).toBe(
      "ROOM_NOT_A_DESIGN_ROOM",
    );
  });

  /** **The smallest room the shell's own placements fit, which since wave 7D6 is no longer the
   *  engine's minimum.** That minimum is now the reach of the *narrowest* corner the product will
   *  build — 880 mm on both walls, a cabinet with one door at each of the three levels — while
   *  `buildLShellDesign` still copies the reference kitchen's corner at its own size, reaching 900 on
   *  wall A and 1000 on wall B at the deepest depth, until wave 7D7 parameterises the builders. In
   *  the 20 mm / 120 mm window between the two the shell would place a corner past its wall, and
   *  **no product path reaches it**: a customer's room is judged against `APPROVED_ROOM_POLICY`
   *  (`apps/web/src/room/room-url-state.ts`), whose minima are the 900 × 1000 swept here.
   *
   *  Read off the policy rather than typed, so a bound the owner moves moves this sweep with it.
   *  **It does not return to the engine's minimum in 7D7, or ever**: ADR 0125 keeps the approved
   *  minima at 900 and 1000 deliberately above what the engine admits, so the smallest room a
   *  customer can enter stays there after the shell is parameterised. The engine-minimum arm lives
   *  in `tests/qa-7d6-the-room-term-and-the-engine-window.adversarial.test.ts` (*the engine admits a
   *  room the shell cannot yet furnish*), where 880 × 880 is built and its overflow held as the
   *  `it.fails` wave 7D7 clears. */
  function smallestRoomTheShellPlacesItsCornerIn(): {
    readonly widthMm: number;
    readonly depthMm: number;
  } {
    const approvedL = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!approvedL) throw new Error("the approved policy builds no L");
    return {
      widthMm: approvedL.wallA.minMm,
      depthMm: approvedL.wallB.minMm,
    };
  }

  // Every ceiling the engine accepts, not a sample: the zero-height guard's edges (the wall row's
  // floor, one either side), the corner pieces' own tops, and the top row all fall inside it. Four
  // rooms per height — the smallest, both walls at their first tile seam, the reference and the
  // largest — each as built, at every other declared depth, and back.
  it(
    "reports no finding of either severity for any engine-accepted ceiling, as built, at every declared depth and back",
    { timeout: 60_000 },
    () => {
      const seamRoom = {
        widthMm: floorRunOriginMm("A") + MAX_EMPTY_COLUMN_WIDTH_MM + 2,
        depthMm: floorRunOriginMm("B") + MAX_EMPTY_COLUMN_WIDTH_MM + 2,
      };
      const walls = [
        smallestRoomTheShellPlacesItsCornerIn(),
        seamRoom,
        { widthMm: ROOM.widthMm, depthMm: ROOM.depthMm },
        { widthMm: engineL.wallA.maxMm, depthMm: engineL.wallB.maxMm },
      ];
      const findings: string[] = [];
      let built = 0;

      for (
        let heightMm = engineL.height.minMm;
        heightMm <= engineL.height.maxMm;
        heightMm += 1
      ) {
        for (const wallSizes of walls) {
          const room: DesignRoom = { shape: "L", ...wallSizes, heightMm };
          const shell = shellIn(room);
          built += 1;
          const found = [...findingsOf(shell, SHELL_CABINET_DEPTH_MM)];
          for (const depthMm of otherDeclaredDepthsMm()) {
            const moved = atCabinetDepth(shell, depthMm);
            found.push(
              ...findingsOf(moved, depthMm).map(
                (f) => `@${String(depthMm)} ${f}`,
              ),
            );
            found.push(
              ...findingsOf(
                atCabinetDepth(moved, SHELL_CABINET_DEPTH_MM),
                SHELL_CABINET_DEPTH_MM,
              ).map((f) => `back ${f}`),
            );
          }
          if (found.length > 0)
            findings.push(`${JSON.stringify(room)}: ${found.join(", ")}`);
        }
      }

      expect(built).toBe(
        (engineL.height.maxMm - engineL.height.minMm + 1) * walls.length,
      );
      expect(findings.slice(0, 3)).toStrictEqual([]);
    },
  );

  it("records no wall-only run in a room no taller than the wall row's floor, and a real one just above it", () => {
    const wallRowFloorMm = toMillimetres(LEVELS[1]?.[0] ?? Number.NaN);
    const wallOnlyTiles = (heightMm: number) =>
      (shellIn({ ...ROOM, heightMm }).emptyColumns ?? []).filter(
        (tile) => tile.y0Mm > 0,
      );

    expect(wallOnlyTiles(engineL.height.minMm)).toStrictEqual([]);
    expect(wallOnlyTiles(wallRowFloorMm)).toStrictEqual([]);
    expect(
      wallOnlyTiles(wallRowFloorMm + 1).map((tile) => tile.topMm - tile.y0Mm),
    ).not.toContain(0);
    expect(wallOnlyTiles(wallRowFloorMm + 1).length).toBeGreaterThan(0);
    for (const tile of wallOnlyTiles(wallRowFloorMm + 1)) {
      expect([tile.y0Mm, tile.topMm]).toStrictEqual([
        wallRowFloorMm,
        wallRowFloorMm + 1,
      ]);
    }
  });
});
