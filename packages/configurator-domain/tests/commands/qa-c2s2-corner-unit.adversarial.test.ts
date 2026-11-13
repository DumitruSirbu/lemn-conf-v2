// M7C wave C2 slice S2 adversarial QA — the corner wall unit in generated kitchens: fixed, not
// editable, covering the corner, and absent from a large U's back wall (owner, Q2 and Q8 (iii)).
//
// Every state here goes through the store's own path: recorded columns, published voids and
// `reconcileSuccessfulCommandResult`, so an editor command is judged as the app judges it.
import { describe, expect, it } from "vitest";

import type { CommandResult } from "../../src/commands/command-result.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import {
  cabinetDepthMmOf,
  DesignSchema,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { paletteFinish } from "../../src/materials.js";
import { toMetres } from "../../src/millimetres.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { canonicalSerializeDesign } from "../../src/serialize-design.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";
import { withTheCornerUnitPutBack } from "../support/before-c2-corner-unit.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const CORNER_REACH_MM = 900;
const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_FLOOR_MM = 2200;
const UNIT_BUILD_ID = "wall-corner-x-900";
const TOP_UNIT_BUILD_ID = "wall-corner-x-900-top";
const OVERLAP_CODE = "RECORDED_SPAN_OVERLAPS_CORNER_BODY";
/** The wall cabinet's finished depth at 600, where the side wall's corner cabinet starts. */
const WALL_DEPTH_AT_600_MM = 330;

const probeAt = createFakeProbeFactory();

interface World {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly cabinetDepthMm: number;
}

function worldOf(design: Design): World {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const records = derivePlacementRecords(design, catalog);
  const stored = {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  };
  const columns = deriveColumns(records, stored, design.room);
  return {
    design,
    catalog,
    records,
    columns,
    recordedColumns: deriveRecordedColumns(
      records,
      stored,
      toMetres(design.room.widthMm),
    ),
    voids: recomputeVoids(records, columns),
    cabinetDepthMm,
  };
}

type Outcome = World | string;

/** A command's result as the store applies it, or the refusal's code. */
function applied(world: World, result: CommandResult): Outcome {
  if (!result.ok) return result.reason.code;
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog,
    previousRecordedColumns: world.recordedColumns,
  });
  return {
    design: reconciled.design,
    catalog,
    records: reconciled.records,
    columns: reconciled.columns,
    recordedColumns: reconciled.recordedColumns,
    voids: reconciled.voids,
    cabinetDepthMm: cabinetDepthMmOf(reconciled.design),
  };
}

function generated(room: DesignRoom): World {
  const result = generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return worldOf(result.design);
}

function atDepth(world: World, cabinetDepthMm: number): World {
  const result = setCabinetDepth({
    design: world.design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt,
    occurredAt: OCCURRED_AT,
  });
  const next = applied(world, result);
  if (typeof next === "string") throw new Error(`depth refused: ${next}`);
  return next;
}

function findingCodes(world: World): string[] {
  return validateDesignForCatalog(world.design, world.catalog).map(
    (finding) => finding.code,
  );
}

function isAUnit(placement: DesignPlacement): boolean {
  return (
    placement.body.buildId === UNIT_BUILD_ID ||
    placement.body.buildId === TOP_UNIT_BUILD_ID
  );
}

function unitsOf(world: World): DesignPlacement[] {
  return world.design.placements.filter(isAUnit);
}

function spanOf(placement: DesignPlacement): readonly [number, number] {
  return [
    placement.alongMm - placement.body.widthMm / 2,
    placement.alongMm + placement.body.widthMm / 2,
  ];
}

/** Whether a wall-A span at the wall or top row stands over a corner's 900 mm. */
function isOverACorner(room: DesignRoom, startMm: number, endMm: number) {
  const overTheLeft = startMm < CORNER_REACH_MM;
  const overTheRight =
    room.shape === "U" && endMm > room.widthMm - CORNER_REACH_MM;
  return overTheLeft || overTheRight;
}

function voidsOverACorner(world: World): VoidRecord[] {
  return world.voids.filter((gap) => {
    if (gap.wall !== "A" || gap.y0 < toMetres(WALL_ROW_FLOOR_MM) - 1e-6)
      return false;
    return isOverACorner(
      world.design.room,
      Math.round((gap.x - gap.w / 2) * 1000),
      Math.round((gap.x + gap.w / 2) * 1000),
    );
  });
}

function offeredIn(world: World, voidId: string): string[] {
  return offersFor({
    records: world.records,
    voids: world.voids,
    columns: world.columns,
    catalog: world.catalog,
    target: { kind: "void", id: voidId },
    cabinetDepthMm: world.cabinetDepthMm,
  }).map((offer) => offer.buildId);
}

const SMALL_ROOMS: readonly (readonly [
  string,
  DesignRoom,
  readonly string[],
])[] = [
  [
    "L",
    { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
    ["p27", "p28"],
  ],
  [
    "right-hand L",
    {
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
      cornerDirection: "right",
    },
    ["p27", "p28"],
  ],
  [
    "L under 2600",
    { shape: "L", widthMm: 3560, depthMm: 2920, heightMm: 2599 },
    ["p27"],
  ],
  [
    "L whose back wall is the corner alone",
    { shape: "L", widthMm: 900, depthMm: 2500, heightMm: 2600 },
    ["p27", "p28"],
  ],
  [
    "U of odd width",
    {
      shape: "U",
      widthMm: 3001,
      depthMm: 2400,
      wallCMm: 2600,
      heightMm: 2600,
    },
    ["p27", "p28", "right-p27", "right-p28"],
  ],
  [
    "U one millimetre under 10 m",
    {
      shape: "U",
      widthMm: 3999,
      depthMm: 3000,
      wallCMm: 3000,
      heightMm: 2600,
    },
    ["p27", "p28", "right-p27", "right-p28"],
  ],
];

const REFERENCE_L: DesignRoom = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: 2600,
};
const EVEN_U: DesignRoom = {
  shape: "U",
  widthMm: 3000,
  depthMm: 2400,
  wallCMm: 2600,
  heightMm: 2600,
};

const LARGE_U: DesignRoom = {
  shape: "U",
  widthMm: 4000,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2600,
};

describe.each(SMALL_ROOMS)("%s: the corner is covered", (_label, room, ids) => {
  const world = generated(room);

  it("carries exactly its units, 900 wide from each corner, at 1500 and 2200", () => {
    const units = unitsOf(world).map((unit) => {
      const [start, end] = spanOf(unit);
      const isRight = unit.id.startsWith("right-");
      return [
        unit.id,
        unit.wall,
        isRight ? room.widthMm - end : start,
        isRight ? room.widthMm - start : end,
        unit.y0Mm,
        unit.body.buildId,
        unit.body.heightMm,
      ];
    });

    expect(units).toEqual(
      ids.map((id) => {
        const isTop = id.endsWith("p28");
        return [
          id,
          "A",
          0,
          CORNER_REACH_MM,
          isTop ? TOP_ROW_FLOOR_MM : WALL_ROW_FLOOR_MM,
          isTop ? TOP_UNIT_BUILD_ID : UNIT_BUILD_ID,
          isTop ? 400 : 700,
        ];
      }),
    );
  });

  it("leaves no recorded space and no void over a corner on the back wall", () => {
    const recorded = (world.design.emptyColumns ?? []).filter(
      (column) =>
        column.wall === "A" &&
        column.y0Mm >= WALL_ROW_FLOOR_MM &&
        isOverACorner(
          room,
          column.alongMm - column.widthMm / 2,
          column.alongMm + column.widthMm / 2,
        ),
    );

    expect(recorded).toEqual([]);
    expect(voidsOverACorner(world)).toEqual([]);
  });

  it("raises no finding at 600, at 700 and back at 600, the units keeping their span", () => {
    const deep = atDepth(world, DEEP_MM);
    const back = atDepth(deep, SHALLOW_MM);
    const spans = (state: World) =>
      unitsOf(state).map((unit) => [unit.id, ...spanOf(unit), unit.y0Mm]);

    expect([
      findingCodes(world),
      findingCodes(deep),
      findingCodes(back),
    ]).toEqual([[], [], []]);
    expect(spans(deep)).toEqual(spans(world));
    expect(spans(back)).toEqual(spans(world));
    expect(voidsOverACorner(deep)).toEqual([]);
  });

  it("is a document the schema accepts and the serialiser round-trips, with or without empty columns", () => {
    const parsed = DesignSchema.safeParse(
      JSON.parse(canonicalSerializeDesign(world.design)),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toStrictEqual(world.design);
  });

  it.each(ids)("refuses every edit of %s, at 600 and at 700", (id) => {
    for (const state of [world, atDepth(world, DEEP_MM)]) {
      const target = { kind: "placement", id } as const;
      const unit = unitsOf(state).find((candidate) => candidate.id === id);
      const widthMm = unit?.body.widthMm ?? Number.NaN;
      const outcomes = probeAt(state.cabinetDepthMm).use((probe) => ({
        swapList: offersFor({ ...state, target }).length,
        remove: applied(
          state,
          removePlacement({
            design: state.design,
            catalog: state.catalog,
            target,
            occurredAt: OCCURRED_AT,
          }),
        ),
        replaceByAWallCabinet: applied(
          state,
          insertBody({
            design: state.design,
            columns: state.recordedColumns,
            voids: state.voids,
            target,
            catalog: state.catalog,
            buildId: "wall-cabinet",
            probe,
            occurredAt: OCCURRED_AT,
          }),
        ),
        replaceByAHood: applied(
          state,
          insertBody({
            design: state.design,
            columns: state.recordedColumns,
            voids: state.voids,
            target,
            catalog: state.catalog,
            buildId: "hood",
            probe,
            occurredAt: OCCURRED_AT,
          }),
        ),
        narrower: setWidth({
          design: state.design,
          columns: state.recordedColumns,
          target,
          catalog: state.catalog,
          widthMm: widthMm - 50,
          probe,
          occurredAt: OCCURRED_AT,
        }).ok,
        wider: setWidth({
          design: state.design,
          columns: state.recordedColumns,
          target,
          catalog: state.catalog,
          widthMm: widthMm + 50,
          probe,
          occurredAt: OCCURRED_AT,
        }).ok,
        freeWidths: widthOptionsFor({
          design: state.design,
          catalog: state.catalog,
          target,
          columns: state.recordedColumns,
          probe,
        }).filter((option) => option.verdict.status === "available").length,
        handle: setHandle({
          design: state.design,
          catalog: state.catalog,
          target,
          handle: "black",
          occurredAt: OCCURRED_AT,
        }).ok,
      }));

      expect(outcomes).toEqual({
        swapList: 0,
        remove: "NOT_DELETABLE",
        replaceByAWallCabinet: "TARGET_NOT_REPLACEABLE",
        replaceByAHood: "TARGET_NOT_REPLACEABLE",
        narrower: false,
        wider: false,
        freeWidths: 0,
        handle: false,
      });
    }
  });

  /** A corner piece's panel is the side wall's corner cabinet's panel (ADR 0021; the colour ruling of
   *  2026-09-09 gave every corner a colour of its own). Asked as an equality, so whatever a corner is
   *  allowed, the unit is allowed exactly that. */
  it.each(ids)(
    "gives %s the capabilities of the side wall's corner cabinet beside it, and its answer to a colour",
    (id) => {
      const sideId = `${id.startsWith("right-") ? "right-" : ""}${id.endsWith("p28") ? "p21" : "p9"}`;
      const capabilities = (placementId: string) => {
        const meta = describeSelection({
          kitchenSettings: {},
          records: world.records,
          voids: world.voids,
          catalog: world.catalog,
          target: { kind: "placement", id: placementId },
        });
        return [
          meta?.canReplace,
          meta?.canDelete,
          meta?.canWidth,
          meta?.fixedWidth,
          meta?.canFinish,
          meta?.canHandle,
          meta?.structuralReason,
        ];
      };
      const colour = (placementId: string) =>
        setFinish({
          design: world.design,
          catalog: world.catalog,
          target: { kind: "placement", id: placementId },
          finish: paletteFinish("pal.antracit"),
          occurredAt: OCCURRED_AT,
        }).ok;

      expect(capabilities(id)).toEqual(capabilities(sideId));
      expect(capabilities(id).slice(0, 4)).toEqual([false, false, false, true]);
      expect(capabilities(id)[6]).toBe("corner");
      expect(colour(id)).toBe(colour(sideId));
    },
  );

  it("opens no space inside the unit's span when the body beside it is removed, and does not move when that body is resized", () => {
    for (const unit of unitsOf(world).filter(
      (candidate) => candidate.y0Mm === WALL_ROW_FLOOR_MM,
    )) {
      const isRight = unit.id.startsWith("right-");
      const [start, end] = spanOf(unit);
      const neighbour = world.design.placements.find(
        (placement) =>
          placement.wall === "A" &&
          !isAUnit(placement) &&
          placement.y0Mm + placement.body.heightMm > WALL_ROW_FLOOR_MM &&
          (isRight
            ? spanOf(placement)[1] === start
            : spanOf(placement)[0] === end),
      );
      if (!neighbour) continue;
      const target = { kind: "placement", id: neighbour.id } as const;
      const removed = applied(
        world,
        removePlacement({
          design: world.design,
          catalog: world.catalog,
          target,
          occurredAt: OCCURRED_AT,
        }),
      );
      if (typeof removed === "string") throw new Error(removed);

      expect(voidsOverACorner(removed)).toEqual([]);
      expect(findingCodes(removed)).toEqual([]);
      expect(unitsOf(removed)).toEqual(unitsOf(world));

      probeAt(world.cabinetDepthMm).use((probe) => {
        const free = widthOptionsFor({
          design: world.design,
          catalog: world.catalog,
          target,
          columns: world.recordedColumns,
          probe,
        }).filter((option) => option.verdict.status === "available");
        for (const option of free) {
          const resized = setWidth({
            design: world.design,
            columns: world.recordedColumns,
            target,
            catalog: world.catalog,
            widthMm: option.widthMm,
            probe,
            occurredAt: OCCURRED_AT,
          });
          if (!resized.ok) continue;
          expect(resized.design.placements.filter(isAUnit)).toEqual(
            unitsOf(world),
          );
        }
      });
    }
  });
});

describe("a U of 10 000 mm or more keeps a base-only back wall (criterion 2a, backlog 63)", () => {
  const world = generated(LARGE_U);

  it("places no unit and records the strips over both corners, 800 + 100 at the wall row", () => {
    const strips = (world.design.emptyColumns ?? [])
      .filter(
        (column) =>
          column.wall === "A" &&
          column.y0Mm >= WALL_ROW_FLOOR_MM &&
          isOverACorner(
            LARGE_U,
            column.alongMm - column.widthMm / 2,
            column.alongMm + column.widthMm / 2,
          ),
      )
      .map((column) => column.widthMm)
      .sort((one, other) => one - other);

    expect(unitsOf(world)).toEqual([]);
    expect(strips).toEqual([100, 100, 800, 800]);
  });

  it("still offers a hood over each corner, accepts it and marks it, exactly as before", () => {
    const hoodVoids = voidsOverACorner(world).filter((gap) =>
      offeredIn(world, gap.id).includes("hood"),
    );

    expect(hoodVoids).toHaveLength(2);
    for (const gap of hoodVoids) {
      const inserted = probeAt(world.cabinetDepthMm).use((probe) =>
        applied(
          world,
          insertBody({
            design: world.design,
            columns: world.recordedColumns,
            voids: world.voids,
            target: { kind: "void", id: gap.id },
            catalog: world.catalog,
            buildId: "hood",
            probe,
            occurredAt: OCCURRED_AT,
          }),
        ),
      );
      if (typeof inserted === "string") throw new Error(inserted);

      expect(new Set(findingCodes(inserted))).toEqual(new Set([OVERLAP_CODE]));
    }
  });
});

// -------------------------------------------------------------------------------------------------
// The validator's reach at the height of the body it meets: overlaps that are real stay reported.
// -------------------------------------------------------------------------------------------------

function withBody(world: World, body: DesignPlacement): Design {
  return {
    ...world.design,
    placements: [...world.design.placements, body],
  };
}

function overlapsReported(design: Design): number {
  return validateDesignForCatalog(
    design,
    buildKitchenLBodyCatalog(SHALLOW_MM),
  ).filter((finding) => finding.code === OVERLAP_CODE).length;
}

describe("a real overlap across the corner is still reported with the unit standing there", () => {
  const world = generated(REFERENCE_L);

  it("is quiet on the generated kitchen itself", () => {
    expect(overlapsReported(world.design)).toBe(0);
  });

  it.each([
    [
      "a full-height column on the side wall starting inside the X-leg's carcass",
      {
        id: "zz-tall",
        wall: "B",
        alongMm: 330 + 300,
        y0Mm: 0,
        body: { buildId: "tall-pantry", widthMm: 600, heightMm: 2200 },
      },
    ],
    [
      "a wall cabinet on the side wall starting inside the unit's carcass",
      {
        id: "zz-wall",
        wall: "B",
        alongMm: 200 + 300,
        y0Mm: WALL_ROW_FLOOR_MM,
        body: { buildId: "wall-cabinet", widthMm: 600, heightMm: 700 },
      },
    ],
    [
      "a base cabinet on the side wall starting inside the X-leg's carcass",
      {
        id: "zz-base",
        wall: "B",
        alongMm: 400 + 300,
        y0Mm: 0,
        body: { buildId: "base-cabinet", widthMm: 600, heightMm: 820 },
      },
    ],
  ] as const)("%s", (_what, body) => {
    expect(overlapsReported(withBody(world, body))).toBeGreaterThan(0);
  });

  it("does not report a wall cabinet on the side wall that starts where the side corner cabinet does", () => {
    const clear: DesignPlacement = {
      id: "zz-clear",
      wall: "B",
      alongMm: WALL_DEPTH_AT_600_MM + 300 + 2000,
      y0Mm: WALL_ROW_FLOOR_MM,
      body: { buildId: "wall-cabinet", widthMm: 600, heightMm: 700 },
    };

    expect(overlapsReported(withBody(world, clear))).toBe(0);
  });
});

// -------------------------------------------------------------------------------------------------
// A design stored before the unit (ADR 0038: no migration): it keeps its strips and its editor.
// -------------------------------------------------------------------------------------------------

/** The put-back writes what the tree before C2 wrote for an L and for a U of even width (compared with
 *  that tree's own output); it is not used here on an odd width, where it does not. */
describe.each([
  ["L", REFERENCE_L],
  ["U", EVEN_U],
] as const)("a %s stored before the unit existed", (_label, room) => {
  const stored = worldOf(
    withTheCornerUnitPutBack(generated(room).design) as Design,
  );

  it("has no unit, keeps its strips as voids, and raises no finding", () => {
    expect(unitsOf(stored)).toEqual([]);
    expect(voidsOverACorner(stored).length).toBeGreaterThanOrEqual(
      room.shape === "U" ? 8 : 4,
    );
    expect(findingCodes(stored)).toEqual([]);
  });

  it("still takes a wall cabinet in its strip, and a depth change, with no unit forced in", () => {
    const strip = stored.voids.find(
      (gap) =>
        voidsOverACorner(stored).includes(gap) &&
        offeredIn(stored, gap.id).includes("wall-cabinet"),
    );
    if (!strip) throw new Error("no strip void offers a wall cabinet");
    const filled = probeAt(stored.cabinetDepthMm).use((probe) =>
      applied(
        stored,
        insertBody({
          design: stored.design,
          columns: stored.recordedColumns,
          voids: stored.voids,
          target: { kind: "void", id: strip.id },
          catalog: stored.catalog,
          buildId: "wall-cabinet",
          probe,
          occurredAt: OCCURRED_AT,
        }),
      ),
    );
    if (typeof filled === "string") throw new Error(filled);
    const deep = atDepth(filled, DEEP_MM);

    expect(findingCodes(filled)).toEqual([]);
    expect(findingCodes(deep)).toEqual([]);
    expect(unitsOf(deep)).toEqual([]);
  });
});
