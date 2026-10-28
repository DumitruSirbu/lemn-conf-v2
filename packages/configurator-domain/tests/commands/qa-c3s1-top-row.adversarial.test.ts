// M7C wave C3 slice S1 adversarial QA — the generated top row (ADR 0110 Amendment O; owner,
// 2026-10-01: *"a 400 mm push-to-open cabinet above every wall cabinet and above the hood, all shapes,
// rooms at least 2600 high; doors, not lift fronts; none above tall columns"*).
//
// Every expected figure is the owner's sentence written out: 2600, 2200, 400. The states an editor
// command meets go through the store's own path (recorded columns, published voids,
// `reconcileSuccessfulCommandResult`).
import { describe, expect, it } from "vitest";

import type { CommandResult } from "../../src/commands/command-result.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setHandle } from "../../src/commands/set-appearance.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "../../src/design.js";
import { acceptsWidthMm, listInsertableBodies } from "../../src/catalog.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { toMetres } from "../../src/millimetres.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../../src/pricing/sample-price-book.js";
import { isPushToOpen } from "../../src/push-to-open.js";
import { offersFor } from "../../src/queries/offers.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
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
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;

/** The owner's sentence, in millimetres. */
const TOP_ROW_FROM_ROOM_HEIGHT_MM = 2600;
const TOP_ROW_FLOOR_MM = 2200;
const TOP_CABINET_HEIGHT_MM = 400;
const WALL_ROW_FLOOR_MM = 1500;
const TOP_CABINET_BUILD_ID = "wall-cabinet";
const UPPER_BUILD_IDS = ["wall-cabinet", "hood"];
const LARGE_U_TOTAL_MM = 10_000;

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

/** A command's result as the store applies it; a refusal throws with its code. */
function applied(world: World, result: CommandResult): World {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
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
  return applied(
    world,
    setCabinetDepth({
      design: world.design,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm,
      probeAt,
      occurredAt: OCCURRED_AT,
    }),
  );
}

function findingCodes(world: World): string[] {
  return validateDesignForCatalog(world.design, world.catalog).map(
    (finding) => finding.code,
  );
}

function spanOf(placement: DesignPlacement): readonly [number, number] {
  return [
    placement.alongMm - placement.body.widthMm / 2,
    placement.alongMm + placement.body.widthMm / 2,
  ];
}

function overlapMm(one: DesignPlacement, other: DesignPlacement): number {
  const [oneStart, oneEnd] = spanOf(one);
  const [otherStart, otherEnd] = spanOf(other);
  return Math.min(oneEnd, otherEnd) - Math.max(oneStart, otherStart);
}

/** The generated top row: the ordinary wall cabinets at the top row's floor. The corner's own top
 *  units are other build ids and are not among them. */
function topsOf(design: Design): DesignPlacement[] {
  return design.placements.filter(
    (placement) =>
      placement.y0Mm === TOP_ROW_FLOOR_MM &&
      placement.body.buildId === TOP_CABINET_BUILD_ID,
  );
}

function uppersOf(design: Design): DesignPlacement[] {
  return design.placements.filter(
    (placement) =>
      placement.y0Mm === WALL_ROW_FLOOR_MM &&
      UPPER_BUILD_IDS.includes(placement.body.buildId),
  );
}

function upperUnder(
  design: Design,
  top: DesignPlacement,
): DesignPlacement | undefined {
  return uppersOf(design).find(
    (upper) =>
      upper.wall === top.wall &&
      upper.alongMm === top.alongMm &&
      upper.body.widthMm === top.body.widthMm,
  );
}

function cornerTopUnitsOf(design: Design): DesignPlacement[] {
  return design.placements.filter((placement) =>
    placement.body.buildId.endsWith("-top"),
  );
}

const ROOMS: readonly (readonly [string, DesignRoom])[] = [
  ["L", { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 }],
  [
    "right-hand L",
    {
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
      cornerDirection: "right",
    },
  ],
  [
    "U under 10 m",
    { shape: "U", widthMm: 3000, depthMm: 2400, wallCMm: 2600, heightMm: 2600 },
  ],
  [
    "U of 10 m or more",
    { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  ],
  [
    "straight",
    { shape: "linear", widthMm: 3600, depthMm: 3400, heightMm: 2600 },
  ],
];

const HEIGHTS_WITHOUT_A_TOP_ROW_MM = [2200, 2400, 2500, 2501, 2599];
const HEIGHTS_WITH_A_TOP_ROW_MM = [2600, 2601, 2650, 2800, 3900];

describe.each(ROOMS)("%s: the ceiling rule", (_label, room) => {
  it.each(HEIGHTS_WITHOUT_A_TOP_ROW_MM)(
    "generates nothing at or above 2200 in a room %i high",
    (heightMm) => {
      const { design } = generated({ ...room, heightMm });

      expect(
        design.placements.filter(
          (placement) =>
            placement.y0Mm + placement.body.heightMm > TOP_ROW_FLOOR_MM,
        ),
      ).toEqual([]);
      expect(uppersOf(design).length).toBeGreaterThan(0);
    },
  );

  it.each(HEIGHTS_WITH_A_TOP_ROW_MM)(
    "puts one 400 mm cabinet at 2200 over every upper, of the upper's own span, in a room %i high",
    (heightMm) => {
      const { design } = generated({ ...room, heightMm });
      const tops = topsOf(design);
      const uppers = uppersOf(design);

      expect(uppers.length).toBeGreaterThan(0);
      expect(
        tops.map((top) => [top.wall, ...spanOf(top), top.body.heightMm]),
      ).toEqual(
        uppers.map((upper) => [
          upper.wall,
          ...spanOf(upper),
          TOP_CABINET_HEIGHT_MM,
        ]),
      );
      expect(new Set(tops.map((top) => upperUnder(design, top)?.id)).size).toBe(
        tops.length,
      );
    },
  );

  it("agrees with the corner's own top units at every height: both from 2600, both 400 high at 2200", () => {
    for (const heightMm of [
      ...HEIGHTS_WITHOUT_A_TOP_ROW_MM,
      ...HEIGHTS_WITH_A_TOP_ROW_MM,
    ]) {
      const { design } = generated({ ...room, heightMm });
      const cornerTops = cornerTopUnitsOf(design);
      const hasATopRow = heightMm >= TOP_ROW_FROM_ROOM_HEIGHT_MM;

      expect([heightMm, topsOf(design).length > 0]).toEqual([
        heightMm,
        hasATopRow,
      ]);
      if (room.shape !== "linear") {
        expect([heightMm, cornerTops.length > 0]).toEqual([
          heightMm,
          hasATopRow,
        ]);
      }
      for (const unit of cornerTops) {
        expect([unit.y0Mm, unit.body.heightMm]).toEqual([
          TOP_ROW_FLOOR_MM,
          TOP_CABINET_HEIGHT_MM,
        ]);
      }
    }
  });
});

describe.each(ROOMS)("%s: where the top row does not stand", (_label, room) => {
  const { design } = generated(room);
  const tops = topsOf(design);

  it("stands over no full-height body, no fridge, and no corner piece", () => {
    const wrong = tops.flatMap((top) =>
      design.placements
        .filter(
          (other) =>
            other.id !== top.id &&
            other.wall === top.wall &&
            overlapMm(top, other) > 0,
        )
        .filter(
          (other) =>
            (other.y0Mm === 0 &&
              other.y0Mm + other.body.heightMm > WALL_ROW_FLOOR_MM) ||
            other.body.buildId.includes("corner") ||
            (other.y0Mm >= TOP_ROW_FLOOR_MM && other.id !== top.id),
        )
        .map((other) => `${top.id} over ${other.body.buildId}`),
    );

    expect(tops.length).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  it("carries, on a large U's back wall, only the cabinet over the hood", () => {
    const isLargeU =
      room.shape === "U" &&
      room.widthMm + room.depthMm + (room.wallCMm ?? 0) >= LARGE_U_TOTAL_MM;
    const onTheBackWall = tops
      .filter((top) => top.wall === "A")
      .map((top) => upperUnder(design, top)?.body.buildId);

    if (isLargeU) expect(onTheBackWall).toEqual(["hood"]);
    else expect(onTheBackWall.length).toBeGreaterThan(1);
  });

  it("records no handle and no colour on a top cabinet, and every one opens by a latch", () => {
    const world = worldOf(design);
    for (const top of tops) {
      const record = world.records.find((candidate) => candidate.id === top.id);

      expect(Object.keys(top.body).sort()).toEqual(
        expect.arrayContaining(["buildId", "heightMm", "widthMm"]),
      );
      expect([top.body.handle, top.body.finish]).toEqual([
        undefined,
        undefined,
      ]);
      expect(
        isPushToOpen({
          kitchenSettings: {},
          y0Mm: top.y0Mm,
          recordedHandle: top.body.handle,
          canHandle: record?.canHandle === true,
        }),
      ).toBe(true);
    }
  });

  it("raises no finding at 600, at 700 and back, each top staying over its upper", () => {
    const world = worldOf(design);
    const deep = atDepth(world, DEEP_MM);
    const back = atDepth(deep, SHALLOW_MM);

    for (const state of [world, deep, back]) {
      expect(findingCodes(state)).toEqual([]);
      expect(
        topsOf(state.design).filter(
          (top) => upperUnder(state.design, top) === undefined,
        ),
      ).toEqual([]);
      expect(topsOf(state.design)).toHaveLength(tops.length);
    }
  });
});

// -------------------------------------------------------------------------------------------------
// A generated top cabinet is an ordinary one: what a customer's own insert would have written, and
// every editor command works on it.
// -------------------------------------------------------------------------------------------------

/** The design as the tree before C3 generated it: the same document without its top row. Compared
 *  with that tree's own output over the whole census, this is byte for byte what it wrote. */
function withoutTheTopRow(design: Design): Design {
  const tops = new Set(topsOf(design).map((top) => top.id));
  return {
    ...design,
    placements: design.placements.filter(
      (placement) => !tops.has(placement.id),
    ),
  };
}

/** Whether the catalogue builds a wall-band body other than the top cabinet itself at `widthMm`. A 200 mm top, which
 *  ADR 0167's fill earns over a 200 mm base, has none: the wall lift and the open shelf start at the default width
 *  floor, so its replace list is the cabinet alone and a swap is owed only above it. */
function hasAnAlternativeAt(world: World, widthMm: number): boolean {
  return listInsertableBodies(world.catalog).some(
    (body) =>
      body.buildId !== TOP_CABINET_BUILD_ID &&
      body.band === "wall" &&
      acceptsWidthMm(body, widthMm),
  );
}

function priced(design: Design) {
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    selections: design.settings,
  });
  if (!result.ok) throw new Error("the design did not price");
  return result.priced;
}

describe.each(ROOMS)(
  "%s: a generated top cabinet is an ordinary one",
  (_label, room) => {
    const world = generated(room);
    const tops = topsOf(world.design);
    const before = worldOf(withoutTheTopRow(world.design));

    it("is exactly what inserting a wall cabinet into that opening writes", () => {
      for (const top of tops) {
        const opening = before.voids.find(
          (gap) =>
            gap.wall === top.wall &&
            Math.abs(gap.y0 - toMetres(TOP_ROW_FLOOR_MM)) < 1e-6 &&
            Math.abs(gap.w - toMetres(top.body.widthMm)) < 1e-6 &&
            Math.abs(
              (gap.wall === "A" ? gap.x : gap.z) - toMetres(top.alongMm),
            ) < 1e-6,
        );
        if (!opening) throw new Error(`no opening for ${top.id}`);
        const inserted = probeAt(before.cabinetDepthMm).use((probe) =>
          insertBody({
            design: before.design,
            columns: before.recordedColumns,
            voids: before.voids,
            target: { kind: "void", id: opening.id },
            catalog: before.catalog,
            buildId: TOP_CABINET_BUILD_ID,
            probe,
            occurredAt: OCCURRED_AT,
          }),
        );
        if (!inserted.ok) throw new Error(inserted.reason.code);
        const mine = inserted.design.placements.find(
          (placement) =>
            !before.design.placements.some((old) => old.id === placement.id),
        );

        expect([mine?.wall, mine?.alongMm, mine?.y0Mm, mine?.body]).toEqual([
          top.wall,
          top.alongMm,
          top.y0Mm,
          top.body,
        ]);
      }
    });

    it("can be deleted, swapped for each body its list offers, resized, and given a bar", () => {
      let topsWithAlternatives = 0;
      for (const top of tops) {
        const target = { kind: "placement", id: top.id } as const;
        const removed = applied(
          world,
          removePlacement({
            design: world.design,
            catalog: world.catalog,
            target,
            occurredAt: OCCURRED_AT,
          }),
        );
        expect(findingCodes(removed)).toEqual([]);
        expect(removed.voids).toHaveLength(world.voids.length + 1);

        const swaps = offersFor({ ...world, target })
          .map((offer) => offer.buildId)
          .filter((buildId) => buildId !== TOP_CABINET_BUILD_ID);
        const hasAlternative = hasAnAlternativeAt(world, top.body.widthMm);
        if (hasAlternative) {
          topsWithAlternatives += 1;
          expect(swaps.length).toBeGreaterThan(0);
        } else {
          expect(swaps).toEqual([]);
        }
        probeAt(world.cabinetDepthMm).use((probe) => {
          for (const buildId of swaps) {
            const swapped = applied(
              world,
              insertBody({
                design: world.design,
                columns: world.recordedColumns,
                voids: world.voids,
                target,
                catalog: world.catalog,
                buildId,
                probe,
                occurredAt: OCCURRED_AT,
              }),
            );
            expect([buildId, findingCodes(swapped)]).toEqual([buildId, []]);
          }
          const free = widthOptionsFor({
            design: world.design,
            catalog: world.catalog,
            target,
            columns: world.recordedColumns,
            probe,
          }).filter((option) => option.verdict.status === "available");
          for (const option of free) {
            const resized = applied(
              world,
              setWidth({
                design: world.design,
                columns: world.recordedColumns,
                target,
                catalog: world.catalog,
                widthMm: option.widthMm,
                probe,
                occurredAt: OCCURRED_AT,
              }),
            );
            expect([option.widthMm, findingCodes(resized)]).toEqual([
              option.widthMm,
              [],
            ]);
          }
        });

        const barred = setHandle({
          design: world.design,
          catalog: world.catalog,
          target,
          handle: "steel",
          occurredAt: OCCURRED_AT,
        });
        if (!barred.ok) throw new Error(barred.reason.code);
        const withABar = barred.design.placements.find(
          (placement) => placement.id === top.id,
        );
        expect(
          isPushToOpen({
            kitchenSettings: {},
            y0Mm: TOP_ROW_FLOOR_MM,
            recordedHandle: withABar?.body.handle,
            canHandle: true,
          }),
        ).toBe(false);
      }
      expect(topsWithAlternatives).toBeGreaterThan(0);
    });

    it("stays when the upper beneath it is deleted, and follows when that upper is resized", () => {
      for (const top of tops) {
        const upper = upperUnder(world.design, top);
        if (!upper) throw new Error(`no upper under ${top.id}`);
        const target = { kind: "placement", id: upper.id } as const;
        const removed = applied(
          world,
          removePlacement({
            design: world.design,
            catalog: world.catalog,
            target,
            occurredAt: OCCURRED_AT,
          }),
        );

        expect(findingCodes(removed)).toEqual([]);
        expect(topsOf(removed.design).map((kept) => kept.id)).toContain(top.id);

        probeAt(world.cabinetDepthMm).use((probe) => {
          const free = widthOptionsFor({
            design: world.design,
            catalog: world.catalog,
            target,
            columns: world.recordedColumns,
            probe,
          }).filter((option) => option.verdict.status === "available");
          for (const option of free) {
            const resized = applied(
              world,
              setWidth({
                design: world.design,
                columns: world.recordedColumns,
                target,
                catalog: world.catalog,
                widthMm: option.widthMm,
                probe,
                occurredAt: OCCURRED_AT,
              }),
            );
            const moved = resized.design.placements.find(
              (placement) => placement.id === top.id,
            );
            const under = resized.design.placements.find(
              (placement) => placement.id === upper.id,
            );

            expect(findingCodes(resized)).toEqual([]);
            expect([moved?.alongMm, moved?.body.widthMm]).toEqual([
              under?.alongMm,
              under?.body.widthMm,
            ]);
          }
        });
      }
    });

    it("costs one wall-cabinet line per top and the hardware line's latches, and nothing else", () => {
      const after = priced(world.design);
      const earlier = priced(before.design);
      const earlierLines = new Map<string, number>();
      for (const line of earlier.lines) {
        const key = JSON.stringify(line);
        earlierLines.set(key, (earlierLines.get(key) ?? 0) + 1);
      }
      const added = after.lines.filter((line) => {
        const key = JSON.stringify(line);
        const left = earlierLines.get(key) ?? 0;
        if (left > 0) earlierLines.set(key, left - 1);
        return left === 0;
      });
      const replaced = [...earlierLines]
        .filter(([, left]) => left > 0)
        .map(([key]) => JSON.parse(key) as (typeof earlier.lines)[number]);
      const cabinetLines = added.filter((line) => line.kind === "cabinet");

      expect(cabinetLines).toHaveLength(tops.length);
      expect(
        new Set(
          cabinetLines.map((line) => ("ruleId" in line ? line.ruleId : "")),
        ),
      ).toEqual(new Set(["cabinet.wall-cabinet"]));
      expect(
        added
          .filter((line) => line.kind !== "cabinet")
          .map((line) => line.kind),
      ).toEqual(["hardware"]);
      expect(replaced.map((line) => line.kind)).toEqual(["hardware"]);
      expect(after.totalMinor - earlier.totalMinor).toBe(
        added.reduce((sum, line) => sum + line.amountMinor, 0) -
          replaced.reduce((sum, line) => sum + line.amountMinor, 0),
      );
      expect(
        (added.find((line) => line.kind === "hardware")?.amountMinor ?? 0) -
          (replaced[0]?.amountMinor ?? 0),
      ).toBeGreaterThan(0);
    });
  },
);

describe("a design stored before the top row was generated", () => {
  it.each(ROOMS)(
    "%s: loads as it was, with its top openings and no top cabinet",
    (_label, room) => {
      const stored = worldOf(
        JSON.parse(
          JSON.stringify(withoutTheTopRow(generated(room).design)),
        ) as Design,
      );

      expect(topsOf(stored.design)).toEqual([]);
      expect(findingCodes(stored)).toEqual([]);
      expect(
        stored.voids.filter(
          (gap) => Math.abs(gap.y0 - toMetres(TOP_ROW_FLOOR_MM)) < 1e-6,
        ).length,
      ).toBeGreaterThanOrEqual(topsOf(generated(room).design).length);
    },
  );
});
