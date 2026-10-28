// M7C wave C5 slice S2 adversarial QA (M7-FB-010; the owner's Q6, 2026-10-01: *"Absorb gaps under 300 mm"*;
// ADR 0110 Amendment O10): the U's fridge wall. Where the fridge ends a U side wall (B or C) with 50-299 mm
// beyond it and a plain door cabinet stands directly inboard, that cabinet grows by whole 50 mm steps up to
// 800 and the fridge moves out by the same amount; pantries or door bases beyond the fridge mean it is not the
// outermost body, and nothing changes.
//
// **The oracle is the BUILT document, read with interval arithmetic**, never the leaf nor the implementer's
// `support/fridge-end-leftover.ts` / `support/u-plan-invariants.ts`: a side wall's free run ends 100 mm short
// of the wall, floored to an even millimetre; the leftover is that end less the fridge placement's end; the
// expected kitchen is the pre-C5 kitchen (the leaf mocked to the identity) with exactly the column over the
// inboard cabinet widened and everything over the fridge moved out. QA separately held the pre-C5 tree to
// `0e7e5ea` (the U plans on the full 100 mm grid and 60 000 rooms at 1 mm; L, straight and U designs on strides).
import { describe, expect, it, vi } from "vitest";

import type { CommandResult } from "../../src/commands/command-result.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../../src/migrate-design.js";
import { toMetres } from "../../src/millimetres.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../../src/pricing/sample-price-book.js";
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type VoidRecord,
} from "../../src/void-engine.js";
import { beforeAdr0167 } from "../support/before-adr-0167-free-end-fill.js";
import { beforeC5 } from "../support/before-c5-fridge-end-leftover.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { gateVerdictFor } from "../support/u-gate-verdict.js";
import { yieldToTheEventLoop } from "../support/yield-to-the-event-loop.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";

vi.mock("../../src/generation/free-end-fill.js", async (importOriginal) => {
  const { withTheFreeEndFillSwitchable } = await import(
    "../support/before-adr-0167-free-end-fill.js"
  );
  return withTheFreeEndFillSwitchable(await importOriginal());
});
vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
  },
);

// The owner's words, restated here and never imported (ADR 0121 decision 3(b)).
const ABSORB_BELOW_MM = 300;
const ABSORB_STEP_MM = 50;
const CABINET_CEILING_MM = 800;
const SIDE_WALL_RESERVE_MM = 100;
const WALL_DEPTH_AT_MM: Readonly<Record<number, number>> = {
  600: 330,
  700: 400,
};

const OCCURRED_AT = "2026-10-05T12:00:00.000Z";
const FRIDGE = "fridge-free";
const DOOR_CABINET = "base-cabinet";
const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_CEILING_MM = 2600;
const SWEEP_TIMEOUT_MS = 300_000;
const probeAt = createFakeProbeFactory();

type SideWall = "B" | "C";
const SIDE_WALLS: readonly SideWall[] = ["B", "C"];

interface Span {
  readonly startMm: number;
  readonly endMm: number;
}

// -------------------------------------------------------------------------------------------------
// The oracle.
// -------------------------------------------------------------------------------------------------

function uRoom(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = 2600,
): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

function floorToEvenMm(mm: number): number {
  return mm - (mm % 2);
}

function wallLengthOf(room: DesignRoom, wall: SideWall): number {
  return wall === "B" ? room.depthMm : (room.wallCMm ?? 0);
}

/** A U side wall's free run stops 100 mm short of the wall, on an even millimetre. */
function runEndMm(room: DesignRoom, wall: SideWall): number {
  return floorToEvenMm(wallLengthOf(room, wall) - SIDE_WALL_RESERVE_MM);
}

function wholeStepsMm(mm: number): number {
  return Math.floor(mm / ABSORB_STEP_MM) * ABSORB_STEP_MM;
}

function ownersAbsorbMm(leftoverMm: number, cabinetWidthMm: number): number {
  if (leftoverMm < ABSORB_STEP_MM || leftoverMm >= ABSORB_BELOW_MM) return 0;
  return Math.min(
    wholeStepsMm(leftoverMm),
    wholeStepsMm(CABINET_CEILING_MM - cabinetWidthMm),
  );
}

function spanOf(placement: DesignPlacement): Span {
  const halfMm = placement.body.widthMm / 2;
  return {
    startMm: placement.alongMm - halfMm,
    endMm: placement.alongMm + halfMm,
  };
}

function isSameSpan(first: Span, second: Span): boolean {
  return first.startMm === second.startMm && first.endMm === second.endMm;
}

function isWithin(inner: Span, outer: Span): boolean {
  return inner.startMm >= outer.startMm && inner.endMm <= outer.endMm;
}

function overlapsByMoreThanNothing(first: Span, second: Span): boolean {
  return (
    Math.min(first.endMm, second.endMm) -
      Math.max(first.startMm, second.startMm) >
    0
  );
}

/** What stands beside the pre-C5 fridge, wherever it is. */
interface FridgeEnd {
  readonly wall: SideWall;
  readonly fridge: DesignPlacement;
  readonly isOutermost: boolean;
  readonly inboard: DesignPlacement | undefined;
  readonly leftoverMm: number;
  readonly absorbedMm: number;
}

function fridgeEndOf(design: Design): FridgeEnd | undefined {
  const fridges = design.placements.filter((p) => p.body.buildId === FRIDGE);
  const [fridge] = fridges;
  if (fridges.length !== 1 || !fridge) return undefined;
  if (fridge.wall !== "B" && fridge.wall !== "C") {
    throw new Error(`a U fridge on wall ${fridge.wall}`);
  }
  const wall = fridge.wall;
  const floor = design.placements.filter(
    (p) => p.wall === wall && p.y0Mm === 0,
  );
  const fridgeSpan = spanOf(fridge);
  const isOutermost = floor.every((p) => spanOf(p).endMm <= fridgeSpan.endMm);
  const inboard = floor.find((p) => spanOf(p).endMm === fridgeSpan.startMm);
  const leftoverMm = runEndMm(design.room, wall) - fridgeSpan.endMm;
  const absorbedMm =
    isOutermost && inboard?.body.buildId === DOOR_CABINET
      ? ownersAbsorbMm(leftoverMm, inboard.body.widthMm)
      : 0;
  return { wall, fridge, isOutermost, inboard, leftoverMm, absorbedMm };
}

function expectedPlacements(
  before: Design,
  end: FridgeEnd | undefined,
): readonly DesignPlacement[] {
  if (!end?.inboard || end.absorbedMm === 0) return before.placements;
  const cabinetSpan = spanOf(end.inboard);
  const fridgeSpan = spanOf(end.fridge);
  const { absorbedMm } = end;
  return before.placements.map((placement) => {
    if (placement.wall !== end.wall) return placement;
    const span = spanOf(placement);
    if (isSameSpan(span, cabinetSpan)) {
      return {
        ...placement,
        alongMm: placement.alongMm + absorbedMm / 2,
        body: {
          ...placement.body,
          widthMm: placement.body.widthMm + absorbedMm,
        },
      };
    }
    if (isWithin(span, fridgeSpan)) {
      return { ...placement, alongMm: placement.alongMm + absorbedMm };
    }
    return placement;
  });
}

function composed(room: DesignRoom): Design {
  const result = generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt });
  if (!result.ok) {
    throw new Error(`${labelOf(room)} refused: ${result.reason.code}`);
  }
  return result.design;
}

/** The owner's rule is audited in the world before ADR 0167's free-end fill: the fill takes a remainder of 200 mm
 *  or more, which O10's absorb of 50-298 mm would otherwise have taken, so the pre-C5 kitchen this oracle reads
 *  its leftover from and the kitchen it audits both run with the fill pass switched off. */
function composedBeforeTheFill(room: DesignRoom): Design {
  const result = beforeAdr0167(() =>
    generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt }),
  );
  if (!result.ok) {
    throw new Error(`${labelOf(room)} refused: ${result.reason.code}`);
  }
  return result.design;
}

/** The floor space recorded beyond a run's last body is its bare end; ADR 0167 fills one of at least the narrowest
 *  cabinet's 200 mm. */
const FILL_FLOOR_MM = 200;

function hasAFillableFloorEnd(design: Design): boolean {
  return (design.emptyColumns ?? []).some(
    (space) => space.y0Mm === 0 && space.widthMm >= FILL_FLOOR_MM,
  );
}

function composedBeforeC5(room: DesignRoom): Design | undefined {
  const result = beforeC5(() =>
    beforeAdr0167(() =>
      generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt }),
    ),
  );
  return result.ok ? result.design : undefined;
}

function labelOf(room: DesignRoom): string {
  return `U ${String(room.widthMm)}/${String(room.depthMm)}/${String(room.wallCMm)}x${String(room.heightMm)}`;
}

function catalogOf(design: Design): BodyCatalog {
  return buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
}

function readingOrder(design: Design, wall: DesignWall): string {
  return design.placements
    .filter((p) => p.wall === wall && p.y0Mm === 0)
    .sort((a, b) => a.alongMm - b.alongMm)
    .map((p) => p.body.buildId)
    .join(",");
}

function floorDefects(design: Design, wall: DesignWall): readonly string[] {
  const placed = design.placements
    .filter((p) => p.wall === wall && p.y0Mm === 0)
    .map(spanOf);
  const recorded = (design.emptyColumns ?? [])
    .filter((c) => c.wall === wall && c.y0Mm === 0)
    .map((c) => ({
      startMm: c.alongMm - c.widthMm / 2,
      endMm: c.alongMm + c.widthMm / 2,
    }));
  const spans = [...placed, ...recorded].sort((a, b) => a.startMm - b.startMm);
  const defects: string[] = [];
  for (let i = 1; i < spans.length; i += 1) {
    const previous = spans[i - 1];
    const next = spans[i];
    if (previous && next && next.startMm !== previous.endMm) {
      defects.push(
        `${wall}: ${String(previous.endMm)} then ${String(next.startMm)}`,
      );
    }
  }
  return defects;
}

function cabinetPricesById(design: Design): Map<string, number> {
  const result = priceDesign({
    design,
    catalog: catalogOf(design),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    selections: design.settings,
  });
  if (!result.ok) {
    throw new Error(`${labelOf(design.room)} did not price`);
  }
  const prices = new Map<string, number>();
  for (const line of result.priced.lines) {
    if (line.kind !== "cabinet") continue;
    prices.set(
      line.placementId,
      (prices.get(line.placementId) ?? 0) + line.amountMinor,
    );
  }
  return prices;
}

// -------------------------------------------------------------------------------------------------
// The audit of one room.
// -------------------------------------------------------------------------------------------------

interface Census {
  rooms: number;
  readonly changed: Record<SideWall, number>;
  readonly changedByLeftoverMm: Record<string, number>;
  /** A door base inboard of a fridge that is not the outermost body: bodies beyond it, so no change. */
  notOutermostBesideADoorBase: number;
  /** Rooms whose kitchen before the fill leaves no floor end of 200 mm or more: the fill has nothing to take there. */
  withoutAFillableEnd: number;
  readonly defects: string[];
}

function emptyCensus(): Census {
  return {
    rooms: 0,
    changed: { B: 0, C: 0 },
    changedByLeftoverMm: {},
    notOutermostBesideADoorBase: 0,
    withoutAFillableEnd: 0,
    defects: [],
  };
}

function auditRoom(room: DesignRoom, census: Census): void {
  if (!gateVerdictFor(room).ok) return;
  const before = composedBeforeC5(room);
  if (!before) return;
  census.rooms += 1;
  const live = composedBeforeTheFill(room);
  const where = labelOf(room);
  const fail = (message: string) => census.defects.push(`${where}: ${message}`);
  const end = fridgeEndOf(before);

  if (!hasAFillableFloorEnd(live)) {
    // ADR 0167 D2 and D4: with every bare end under the floor, the shipped generator, fill pass on, adds nothing.
    census.withoutAFillableEnd += 1;
    if (JSON.stringify(composed(room)) !== JSON.stringify(live)) {
      fail("the fill changed a kitchen whose every bare end is under 200 mm");
    }
  }
  if (
    JSON.stringify(live.placements) !==
    JSON.stringify(expectedPlacements(before, end))
  ) {
    fail("placements differ from the pre-C5 kitchen with the owner's rule");
  }
  if (end && !end.isOutermost && end.inboard?.body.buildId === DOOR_CABINET) {
    census.notOutermostBesideADoorBase += 1;
  }
  if (!end?.inboard || end.absorbedMm === 0) {
    if (JSON.stringify(live) !== JSON.stringify(before)) {
      fail("outside the rule but not byte-identical");
    }
    return;
  }
  census.changed[end.wall] += 1;
  const key = `${end.wall}:${String(end.leftoverMm)}`;
  census.changedByLeftoverMm[key] = (census.changedByLeftoverMm[key] ?? 0) + 1;
  auditChangedKitchen({ room, before, live, end, fail });
}

interface ChangedKitchen {
  readonly room: DesignRoom;
  readonly before: Design;
  readonly live: Design;
  readonly end: FridgeEnd;
  readonly fail: (message: string) => void;
}

function auditChangedKitchen(changed: ChangedKitchen): void {
  const { room, live, end, fail } = changed;
  const fridge = live.placements.find((p) => p.id === end.fridge.id);
  if (!fridge || !end.inboard) {
    fail("the fridge or its cabinet is gone");
    return;
  }
  const fridgeSpan = spanOf(fridge);
  const bareMm = end.leftoverMm - end.absorbedMm;

  if (runEndMm(room, end.wall) - fridgeSpan.endMm !== bareMm) {
    fail("the bare remainder is not r less what was absorbed");
  }
  if (fridgeSpan.endMm > wallLengthOf(room, end.wall) - SIDE_WALL_RESERVE_MM) {
    fail("the side wall's 100 mm reserve is spent");
  }
  if (fridge.body.widthMm !== end.fridge.body.widthMm) {
    fail("the fridge changed width");
  }
  auditTheWallRow(changed, fridgeSpan);
  auditTheWidenedColumn(changed, fridgeSpan);
  auditTheWholeKitchen(changed);
}

function auditTheWallRow(changed: ChangedKitchen, fridgeSpan: Span): void {
  const { live, end, fail } = changed;
  const wallDepthMm = WALL_DEPTH_AT_MM[cabinetDepthMmOf(live)] ?? 0;
  for (const p of live.placements) {
    const isPlainCabinet =
      p.body.buildId === DOOR_CABINET || p.body.buildId === "wall-cabinet";
    if (isPlainCabinet && p.body.widthMm > CABINET_CEILING_MM) {
      fail(`${p.id} is ${String(p.body.widthMm)} wide`);
    }
    const isBesideTheFridge =
      p.wall === end.wall &&
      p.y0Mm >= WALL_ROW_FLOOR_MM &&
      !overlapsByMoreThanNothing(spanOf(p), fridgeSpan);
    if (isBesideTheFridge && (p.body.seatDepthMm ?? 0) > wallDepthMm) {
      fail(`${p.id} at y0 ${String(p.y0Mm)} is seated too deep`);
    }
  }
}

function auditTheWidenedColumn(
  { room, live, end, fail }: ChangedKitchen,
  fridgeSpan: Span,
): void {
  const startMm = end.inboard ? spanOf(end.inboard).startMm : 0;
  const cabinetSpan = { startMm, endMm: fridgeSpan.startMm };
  const rows = live.placements
    .filter((p) => p.wall === end.wall && isSameSpan(spanOf(p), cabinetSpan))
    .map((p) => p.y0Mm)
    .sort((a, b) => a - b);
  const expectedRows =
    room.heightMm >= TOP_ROW_CEILING_MM ? [0, 1500, 2200] : [0, 1500];
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
    fail(`the widened column holds rows ${JSON.stringify(rows)}`);
  }
}

function auditTheWholeKitchen({
  before,
  live,
  end,
  fail,
}: ChangedKitchen): void {
  for (const wall of ["A", "B", "C"] as const) {
    if (readingOrder(live, wall) !== readingOrder(before, wall)) {
      fail(`reading order changed on ${wall}`);
    }
    const isNewDefect = floorDefects(before, wall).length === 0;
    if (isNewDefect && floorDefects(live, wall).length > 0) {
      fail(`a floor gap on ${wall}: ${floorDefects(live, wall).join(";")}`);
    }
  }
  if (validateDesignForCatalog(live, catalogOf(live)).length > 0) {
    fail("validation findings");
  }
  if (findOverflowingPlacementIds(live).length > 0) fail("overflow");

  const inboardSpan = end.inboard ? spanOf(end.inboard) : undefined;
  const widenedIds = new Set(
    before.placements
      .filter(
        (p) =>
          p.wall === end.wall &&
          inboardSpan !== undefined &&
          isSameSpan(spanOf(p), inboardSpan),
      )
      .map((p) => p.id),
  );
  const livePrices = cabinetPricesById(live);
  for (const [id, amount] of cabinetPricesById(before)) {
    const liveAmount = livePrices.get(id) ?? 0;
    const isAsExpected = widenedIds.has(id)
      ? liveAmount > amount
      : liveAmount === amount;
    if (!isAsExpected) fail(`price of ${id} moved unexpectedly`);
  }
}

// -------------------------------------------------------------------------------------------------
// Criteria 1-4 over U rooms.
// -------------------------------------------------------------------------------------------------

describe("criteria 1-4 on the built U kitchen", () => {
  it(
    "builds every gated room of a 300 mm grid, at 2200 and 2600, as the pre-C5 kitchen with exactly the owner's rule applied",
    async () => {
      const census = emptyCensus();
      for (let widthMm = 2700; widthMm <= 6000; widthMm += 300) {
        for (let depthMm = 1000; depthMm <= 6000; depthMm += 300) {
          for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 300) {
            for (const heightMm of [2200, 2600]) {
              auditRoom(uRoom(widthMm, depthMm, wallCMm, heightMm), census);
            }
          }
        }
        await yieldToTheEventLoop();
      }

      expect(census.defects.slice(0, 20)).toEqual([]);
      expect(census.changed.B).toBeGreaterThan(0);
      expect(census.changed.C).toBeGreaterThan(0);
      expect(census.withoutAFillableEnd).toBeGreaterThan(0);
      // Pantries (or, below the column, door bases) beyond the fridge: the rule has no reach there.
      expect(census.notOutermostBesideADoorBase).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );

  /** Wall B (or C) is the wider side wall by 100 mm, so it carries the fridge; its entered length runs 1 mm
   *  at a time through both arms the rule can reach: a fridge right after one door base (2300-2650) and
   *  after two (2900-3250). */
  function roomsAlongTheFridgeWall(
    wall: SideWall,
    heightMm: number,
  ): readonly DesignRoom[] {
    const rooms: DesignRoom[] = [];
    for (const [fromMm, toMm] of [
      [2300, 2650],
      [2900, 3250],
    ] as const) {
      for (let enteredMm = fromMm; enteredMm <= toMm; enteredMm += 1) {
        rooms.push(
          wall === "B"
            ? uRoom(4000, enteredMm, enteredMm - 100, heightMm)
            : uRoom(4000, enteredMm - 100, enteredMm, heightMm),
        );
      }
    }
    return rooms;
  }

  it.each([
    ["B", 2600],
    ["C", 2600],
    ["B", 3900],
    ["C", 3900],
    ["B", 2200],
    ["C", 2200],
  ] as const)(
    "builds every even leftover from 50 to 298 mm on wall %s at %i mm, in both arms, as the owner's rule says",
    (wall, heightMm) => {
      const census = emptyCensus();
      for (const room of roomsAlongTheFridgeWall(wall, heightMm)) {
        auditRoom(room, census);
      }
      const leftovers = Object.keys(census.changedByLeftoverMm)
        .map((key) => Number(key.split(":")[1]))
        .sort((a, b) => a - b);

      expect(census.defects.slice(0, 20)).toEqual([]);
      expect(census.changed[wall === "B" ? "C" : "B"]).toBe(0);
      // 125 even leftovers, 50..298; the odd ones are unreachable (the run ends on an even millimetre).
      expect(leftovers[0]).toBe(50);
      expect(leftovers.at(-1)).toBe(298);
      expect(new Set(leftovers).size).toBe(125);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// -------------------------------------------------------------------------------------------------
// Criterion 5 and the editor, on generated widened U cabinets on both side walls.
// -------------------------------------------------------------------------------------------------

interface World {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

function worldOf(design: Design): World {
  const catalog = catalogOf(design);
  const records = derivePlacementRecords(design, catalog);
  const stored = {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  };
  const columns = deriveColumns(records, stored, design.room);
  return {
    design,
    catalog,
    columns,
    recordedColumns: deriveRecordedColumns(
      records,
      stored,
      toMetres(design.room.widthMm),
    ),
    voids: recomputeVoids(records, columns),
  };
}

function applied(world: World, result: CommandResult): World {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const catalog = catalogOf(result.design);
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog,
    previousRecordedColumns: world.recordedColumns,
  });
  return {
    design: reconciled.design,
    catalog,
    columns: reconciled.columns,
    recordedColumns: reconciled.recordedColumns,
    voids: reconciled.voids,
  };
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

interface WidenedRoom {
  readonly room: DesignRoom;
  readonly wall: SideWall;
  readonly widthMm: number;
}

/** Both arms on both side walls, widened to 650-800. */
const WIDENED_ROOMS: readonly WidenedRoom[] = [
  { room: uRoom(4000, 2350, 2250), wall: "B", widthMm: 650 },
  { room: uRoom(4000, 2400, 2300), wall: "B", widthMm: 700 },
  { room: uRoom(4000, 2500, 2400), wall: "B", widthMm: 800 },
  { room: uRoom(4000, 3098, 2998), wall: "B", widthMm: 750 },
  { room: uRoom(4000, 2250, 2350), wall: "C", widthMm: 650 },
  { room: uRoom(4000, 2400, 2500), wall: "C", widthMm: 800 },
  { room: uRoom(4000, 3000, 3100), wall: "C", widthMm: 800 },
];

function fridgeOn(design: Design, wall: SideWall): DesignPlacement {
  const found = design.placements.find(
    (p) => p.wall === wall && p.body.buildId === FRIDGE,
  );
  if (!found) throw new Error(`no fridge on ${wall}`);
  return found;
}

function cabinetBesideTheFridge(
  design: Design,
  wall: SideWall,
): DesignPlacement {
  const fridgeStartMm = spanOf(fridgeOn(design, wall)).startMm;
  const found = design.placements.find(
    (p) => p.wall === wall && p.y0Mm === 0 && spanOf(p).endMm === fridgeStartMm,
  );
  if (!found) throw new Error(`no cabinet beside the fridge on ${wall}`);
  return found;
}

function positionsOf(design: Design): readonly string[] {
  return design.placements.map(
    (p) =>
      `${p.id} ${p.wall} ${String(p.alongMm)} ${String(p.y0Mm)} ${p.body.buildId} ${String(p.body.widthMm)}`,
  );
}

describe("criterion 5 — the editor's commands on a generated widened U cabinet", () => {
  it.each(WIDENED_ROOMS)(
    "generates $room.depthMm / $room.wallCMm with a $widthMm mm cabinet beside the wall $wall fridge",
    ({ room, wall, widthMm }) => {
      expect(cabinetBesideTheFridge(composed(room), wall).body.widthMm).toBe(
        widthMm,
      );
    },
  );

  it.each(WIDENED_ROOMS)(
    "steps $room.depthMm / $room.wallCMm's $widthMm mm cabinet in whole 50s, never past 800, and down 50 without moving the fridge",
    ({ room, wall, widthMm }) => {
      const world = worldOf(composed(room));
      const cabinet = cabinetBesideTheFridge(world.design, wall);
      const fridgeBefore = fridgeOn(world.design, wall);
      const options = probeAt(cabinetDepthMmOf(world.design)).use((probe) =>
        widthOptionsFor({
          design: world.design,
          catalog: world.catalog,
          target: { kind: "placement", id: cabinet.id },
          columns: world.recordedColumns,
          probe,
        }),
      );
      const available = options
        .filter((o) => o.verdict.status === "available")
        .map((o) => o.widthMm);

      expect(options.find((o) => o.verdict.status === "current")?.widthMm).toBe(
        widthMm,
      );
      expect(options.every((o) => o.widthMm % ABSORB_STEP_MM === 0)).toBe(true);
      expect(available.every((w) => w <= CABINET_CEILING_MM)).toBe(true);
      expect(available).toContain(widthMm - ABSORB_STEP_MM);

      const narrowed = probeAt(cabinetDepthMmOf(world.design)).use((probe) =>
        applied(
          world,
          setWidth({
            design: world.design,
            columns: world.recordedColumns,
            target: { kind: "placement", id: cabinet.id },
            catalog: world.catalog,
            widthMm: widthMm - ABSORB_STEP_MM,
            probe,
            occurredAt: OCCURRED_AT,
          }),
        ),
      );

      expect(
        narrowed.design.placements.find((p) => p.id === cabinet.id)?.body
          .widthMm,
      ).toBe(widthMm - ABSORB_STEP_MM);
      expect(fridgeOn(narrowed.design, wall)).toEqual(fridgeBefore);
      expect(
        validateDesignForCatalog(narrowed.design, narrowed.catalog),
      ).toEqual([]);
      expect(findOverflowingPlacementIds(narrowed.design)).toEqual([]);
    },
  );

  it.each(WIDENED_ROOMS)(
    "keeps $room.depthMm / $room.wallCMm's $widthMm mm cabinet, its column and its fridge through 600 → 700 → 600",
    ({ room, wall, widthMm }) => {
      const original = worldOf(composed(room));
      const deep = atDepth(original, 700);
      const back = atDepth(deep, 600);

      for (const [world, depthMm] of [
        [deep, 700],
        [back, 600],
      ] as const) {
        const label = `${labelOf(room)} at ${String(depthMm)}`;
        const cabinet = cabinetBesideTheFridge(world.design, wall);
        const fridge = fridgeOn(world.design, wall);
        const fridgeSpan = spanOf(fridge);
        // The side wall's 100 mm is the slide reserve: at 700 the wall's bodies slide into it, never past the wall.
        const reserveMm = depthMm === 600 ? SIDE_WALL_RESERVE_MM : 0;

        expect(cabinet.body.widthMm, label).toBe(widthMm);
        expect(fridge.body.widthMm, label).toBe(700);
        expect(fridgeSpan.endMm, label).toBeLessThanOrEqual(
          wallLengthOf(room, wall) - reserveMm,
        );
        const overCabinet = world.design.placements.filter(
          (p) =>
            p.wall === wall &&
            p.y0Mm >= WALL_ROW_FLOOR_MM &&
            p.alongMm === cabinet.alongMm,
        );
        expect(
          overCabinet.map((p) => p.body.widthMm),
          label,
        ).toEqual([widthMm, widthMm]);
        for (const p of world.design.placements) {
          const isBeside =
            p.wall === wall &&
            p.y0Mm >= WALL_ROW_FLOOR_MM &&
            !overlapsByMoreThanNothing(spanOf(p), fridgeSpan);
          if (!isBeside) continue;
          expect(
            p.body.seatDepthMm ?? 0,
            `${label} ${p.id}`,
          ).toBeLessThanOrEqual(WALL_DEPTH_AT_MM[depthMm] ?? 0);
        }
        expect(
          validateDesignForCatalog(world.design, world.catalog),
          label,
        ).toEqual([]);
        expect(findOverflowingPlacementIds(world.design), label).toEqual([]);
      }
      expect(positionsOf(back.design)).toEqual(positionsOf(original.design));
    },
  );

  it.each(WIDENED_ROOMS)(
    "saves and reloads $room.depthMm / $room.wallCMm's widened kitchen unchanged",
    ({ room }) => {
      const design = composed(room);
      const stored: unknown = JSON.parse(JSON.stringify(design));
      const reloaded = migrateDesign(CURRENT_SCHEMA_VERSION, stored);

      expect(reloaded).toEqual(design);
      expect(validateDesignForCatalog(reloaded, catalogOf(reloaded))).toEqual(
        [],
      );
    },
  );
});

describe("the reach of the rule on a U's side walls", () => {
  it.each(SIDE_WALLS)(
    "never widens anything on wall A, nor on the side wall without the fridge (fridge on %s)",
    (wall) => {
      const room =
        wall === "B" ? uRoom(4000, 2400, 2300) : uRoom(4000, 2300, 2400);
      const before = composedBeforeC5(room);
      const live = composedBeforeTheFill(room);
      const other = wall === "B" ? "C" : "B";

      for (const untouched of ["A", other] as const) {
        expect(live.placements.filter((p) => p.wall === untouched)).toEqual(
          before?.placements.filter((p) => p.wall === untouched),
        );
      }
    },
  );
});
