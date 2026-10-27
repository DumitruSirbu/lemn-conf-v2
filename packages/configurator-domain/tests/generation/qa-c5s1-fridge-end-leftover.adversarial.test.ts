// M7C wave C5 slice S1 adversarial QA (M7-FB-010; the owner's Q6, 2026-10-01: *"Absorb gaps under 300 mm"*;
// ADR 0110 Amendment O10). Where the fridge ends an L wall with 50-299 mm beyond it and a plain door cabinet
// stands directly inboard, that cabinet grows by whole 50 mm steps up to 800 and the fridge moves out by
// the same amount.
//
// **The oracle is the BUILT document, read with interval arithmetic**, never the leaf's helpers nor the
// implementer's `support/fridge-end-leftover.ts`: the run's end is worked out from the room's own
// millimetres (wall A ends at the entered width, wall B 100 mm short of it, both floored to an even
// millimetre per ADR 0110's 2026-09-13 correction), the leftover from the fridge placement's span, and the
// expected kitchen is the pre-C5 kitchen with exactly the widened column and the moved fridge changed.
// "Pre-C5" is the same tree with the leaf mocked to the identity; QA separately confirmed that tree
// equal to HEAD `9b25d13` (plans over the full grid, designs over a 70 mm stride and every straight room).
import { fc, test as propertyTest } from "@fast-check/vitest";
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
} from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { leftoverAbsorbedBesideAFixedBody } from "../../src/generation/leftover-rule.js";
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
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import { APPROVED_ROOM_POLICY } from "../../src/room/approved-room-policy.js";
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
import { yieldToTheEventLoop } from "../support/yield-to-the-event-loop.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";

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
const SWEEP_TIMEOUT_MS = 300_000;
const probeAt = createFakeProbeFactory();

type LWall = "A" | "B";
const L_WALLS: readonly LWall[] = ["A", "B"];

interface Span {
  readonly startMm: number;
  readonly endMm: number;
}

// -------------------------------------------------------------------------------------------------
// The oracle: arithmetic on the room and on the pre-C5 document.
// -------------------------------------------------------------------------------------------------

function floorToEvenMm(mm: number): number {
  return mm - (mm % 2);
}

/** Where the free run ends: wall A of an L has no side wall, wall B keeps 100 mm free before its side wall. */
function runEndMm(room: DesignRoom, wall: LWall): number {
  return wall === "A"
    ? floorToEvenMm(room.widthMm)
    : floorToEvenMm(room.depthMm - SIDE_WALL_RESERVE_MM);
}

function ownersAbsorbMm(leftoverMm: number, cabinetWidthMm: number): number {
  if (leftoverMm < ABSORB_STEP_MM || leftoverMm >= ABSORB_BELOW_MM) return 0;
  const wholeSteps = (mm: number) =>
    Math.floor(mm / ABSORB_STEP_MM) * ABSORB_STEP_MM;
  // The cabinet grows *in 50 mm steps* up to 800: the headroom is whole steps too, so an off-grid cabinet
  // stops at the last whole step below the ceiling rather than being rounded up to it by an odd amount.
  return Math.max(
    0,
    Math.min(
      wholeSteps(leftoverMm),
      wholeSteps(CABINET_CEILING_MM - cabinetWidthMm),
    ),
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

interface EndFridge {
  readonly wall: LWall;
  readonly fridge: DesignPlacement;
  readonly inboard: DesignPlacement;
  readonly leftoverMm: number;
  readonly absorbedMm: number;
}

/** The end fridge on `wall` of a pre-C5 kitchen, the floor body flush inboard of it and the owner's share. */
function endFridgeOn(design: Design, wall: LWall): EndFridge | undefined {
  const floor = design.placements.filter(
    (p) => p.wall === wall && p.y0Mm === 0,
  );
  const fridge = floor.find((p) => p.body.buildId === FRIDGE);
  if (!fridge) return undefined;
  const fridgeSpan = spanOf(fridge);
  const isOutermost = floor.every((p) => spanOf(p).endMm <= fridgeSpan.endMm);
  const inboard = floor.find((p) => spanOf(p).endMm === fridgeSpan.startMm);
  if (!isOutermost || !inboard) return undefined;
  const leftoverMm = runEndMm(design.room, wall) - fridgeSpan.endMm;
  const absorbedMm =
    inboard.body.buildId === DOOR_CABINET
      ? ownersAbsorbMm(leftoverMm, inboard.body.widthMm)
      : 0;
  return { wall, fridge, inboard, leftoverMm, absorbedMm };
}

function ruledEndFridge(before: Design): EndFridge | undefined {
  return L_WALLS.map((wall) => endFridgeOn(before, wall)).find(
    (end) => end !== undefined && end.absorbedMm > 0,
  );
}

/** The pre-C5 placements with the owner's rule applied: the column over the inboard cabinet widens
 *  outward, everything within the fridge's span moves out, nothing else changes. */
function expectedPlacements(
  before: Design,
  end: EndFridge | undefined,
): readonly DesignPlacement[] {
  if (!end) return before.placements;
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
  if (!result.ok)
    throw new Error(`${labelOf(room)} refused: ${result.reason.code}`);
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
  return `${room.shape} ${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
}

function catalogOf(design: Design): BodyCatalog {
  return buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
}

function readingOrder(design: Design, wall: LWall): readonly string[] {
  return design.placements
    .filter((p) => p.wall === wall && p.y0Mm === 0)
    .sort((a, b) => a.alongMm - b.alongMm)
    .map((p) => p.body.buildId);
}

/** Floor spans on `wall` (placements and recorded empty columns standing on the floor), sorted. */
function floorSpansMm(design: Design, wall: LWall): readonly Span[] {
  const placed = design.placements
    .filter((p) => p.wall === wall && p.y0Mm === 0)
    .map(spanOf);
  const recorded = (design.emptyColumns ?? [])
    .filter((c) => c.wall === wall && c.y0Mm === 0)
    .map((c) => ({
      startMm: c.alongMm - c.widthMm / 2,
      endMm: c.alongMm + c.widthMm / 2,
    }));
  return [...placed, ...recorded].sort((a, b) => a.startMm - b.startMm);
}

/** Interior gaps and overlaps between consecutive floor spans, as text. */
function floorDefects(design: Design, wall: LWall): readonly string[] {
  const spans = floorSpansMm(design, wall);
  const defects: string[] = [];
  for (let i = 1; i < spans.length; i += 1) {
    const previous = spans[i - 1];
    const next = spans[i];
    if (!previous || !next) continue;
    if (next.startMm !== previous.endMm) {
      defects.push(
        `${wall}: ${String(previous.endMm)} then ${String(next.startMm)}`,
      );
    }
  }
  return defects;
}

function priceLinesById(design: Design): Map<string, number> {
  const result = priceDesign({
    design,
    catalog: catalogOf(design),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    selections: design.settings,
  });
  if (!result.ok)
    throw new Error(
      `${labelOf(design.room)} did not price: ${result.failure.code}`,
    );
  const lines = new Map<string, number>();
  for (const line of result.priced.lines) {
    const key =
      line.kind === "cabinet"
        ? `cabinet:${line.placementId}`
        : `${line.kind}:${JSON.stringify(line)}`;
    lines.set(key, (lines.get(key) ?? 0) + line.amountMinor);
  }
  return lines;
}

// -------------------------------------------------------------------------------------------------
// Criterion 1 on the number alone, odd and unreachable leftovers included.
// -------------------------------------------------------------------------------------------------

describe("criterion 1 — the absorbed width, against the owner's arithmetic", () => {
  it.each([
    [49, 600, 0],
    [50, 600, 50],
    [99, 600, 50],
    [100, 600, 100],
    [199, 600, 150],
    [200, 600, 200],
    [249, 600, 200],
    [299, 600, 200],
    [300, 600, 0],
    [299, 750, 50],
    [299, 800, 0],
    [120, 800, 0],
    [0, 600, 0],
    [-50, 600, 0],
    [299, 625, 150],
    [200, 601, 150],
  ])(
    "takes %i mm beside a %i mm cabinet as %i",
    (leftoverMm, neighbourWidthMm, expectedMm) => {
      expect(
        leftoverAbsorbedBesideAFixedBody({ neighbourWidthMm, leftoverMm }),
      ).toBe(expectedMm);
    },
  );

  propertyTest.prop([
    fc.integer({ min: 0, max: 2000 }),
    fc.integer({ min: 1, max: 1200 }),
  ])(
    "agrees with the owner's arithmetic and never grows a cabinet past 800 or by part of a step",
    (leftoverMm, neighbourWidthMm) => {
      const takenMm = leftoverAbsorbedBesideAFixedBody({
        neighbourWidthMm,
        leftoverMm,
      });

      expect(takenMm).toBe(ownersAbsorbMm(leftoverMm, neighbourWidthMm));
      expect(takenMm % ABSORB_STEP_MM).toBe(0);
      expect(takenMm).toBeGreaterThanOrEqual(0);
      if (takenMm > 0) {
        expect(neighbourWidthMm + takenMm).toBeLessThanOrEqual(
          CABINET_CEILING_MM,
        );
        expect(takenMm).toBeLessThanOrEqual(leftoverMm);
      }
    },
  );
});

// -------------------------------------------------------------------------------------------------
// Criteria 1-4 on the built document, over a stride of the approved L and at every reachable leftover.
// -------------------------------------------------------------------------------------------------

interface DesignCensus {
  rooms: number;
  changed: Record<LWall, number>;
  readonly defects: string[];
  readonly changedRooms: DesignRoom[];
  /** Rooms whose kitchen before the fill leaves no floor end of 200 mm or more: the fill has nothing to take there. */
  withoutAFillableEnd: number;
}

/** Holds one generated kitchen to the oracle; returns whether the rule changed it. */
function auditRoom(room: DesignRoom, census: DesignCensus): void {
  const before = composedBeforeC5(room);
  if (!before) return;
  census.rooms += 1;
  const live = composedBeforeTheFill(room);
  const where = labelOf(room);
  const end = ruledEndFridge(before);
  const fail = (message: string) => census.defects.push(`${where}: ${message}`);

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
    fail(
      "placements differ from the pre-C5 kitchen with the owner's rule applied",
    );
  }
  if (!end) {
    if (JSON.stringify(live) !== JSON.stringify(before))
      fail("outside the rule but not byte-identical");
    return;
  }
  census.changed[end.wall] += 1;
  census.changedRooms.push(room);
  auditChangedKitchen({ room, before, live, end, fail });
}

interface ChangedKitchen {
  readonly room: DesignRoom;
  readonly before: Design;
  readonly live: Design;
  readonly end: EndFridge;
  readonly fail: (message: string) => void;
}

function auditChangedKitchen({
  room,
  before,
  live,
  end,
  fail,
}: ChangedKitchen): void {
  const fridge = live.placements.find((p) => p.id === end.fridge.id);
  if (!fridge) {
    fail("the fridge is gone");
    return;
  }
  const fridgeSpan = spanOf(fridge);
  const bareMm = end.leftoverMm - end.absorbedMm;

  if (runEndMm(room, end.wall) - fridgeSpan.endMm !== bareMm)
    fail("the bare remainder is not r − absorbed");
  if (
    end.wall === "B" &&
    fridgeSpan.endMm > room.depthMm - SIDE_WALL_RESERVE_MM
  )
    fail("the side reserve is spent");
  if (end.wall === "A" && fridgeSpan.endMm > room.widthMm)
    fail("the fridge passes wall A");
  if (fridge.body.widthMm !== end.fridge.body.widthMm)
    fail("the fridge changed width");

  for (const p of live.placements) {
    const isPlainCabinet =
      p.body.buildId === DOOR_CABINET || p.body.buildId === "wall-cabinet";
    if (isPlainCabinet && p.body.widthMm > CABINET_CEILING_MM)
      fail(`${p.id} is ${String(p.body.widthMm)} wide`);
    const isWallBody = p.y0Mm >= WALL_ROW_FLOOR_MM && p.wall === end.wall;
    const standsBesideTheFridge =
      isWallBody && !overlapsByMoreThanNothing(spanOf(p), fridgeSpan);
    const wallDepthMm = WALL_DEPTH_AT_MM[cabinetDepthMmOf(live)] ?? 0;
    if (standsBesideTheFridge && (p.body.seatDepthMm ?? 0) > wallDepthMm) {
      fail(
        `${p.id} at y0 ${String(p.y0Mm)} is seated ${String(p.body.seatDepthMm)} deep`,
      );
    }
  }

  const cabinetSpan = {
    startMm: spanOf(end.inboard).startMm,
    endMm: fridgeSpan.startMm,
  };
  const column = live.placements.filter(
    (p) => p.wall === end.wall && isSameSpan(spanOf(p), cabinetSpan),
  );
  const rows = column.map((p) => p.y0Mm).sort((a, b) => a - b);
  const expectedRows = room.heightMm >= 2600 ? [0, 1500, 2200] : [0, 1500];
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows))
    fail(`the widened column holds rows ${JSON.stringify(rows)}`);

  for (const wall of L_WALLS) {
    if (
      JSON.stringify(readingOrder(live, wall)) !==
      JSON.stringify(readingOrder(before, wall))
    ) {
      fail(`reading order changed on ${wall}`);
    }
    for (const defect of floorDefects(live, wall)) fail(`floor ${defect}`);
  }

  const catalog = catalogOf(live);
  if (validateDesignForCatalog(live, catalog).length > 0)
    fail("validation findings");
  if (findOverflowingPlacementIds(live).length > 0) fail("overflow");

  const widenedIds = new Set(column.map((p) => p.id));
  const livePrices = priceLinesById(live);
  const beforePrices = priceLinesById(before);
  for (const [key, amount] of beforePrices) {
    const isWidened = [...widenedIds].some((id) => key === `cabinet:${id}`);
    if (!isWidened && livePrices.get(key) !== amount)
      fail(`price line ${key.slice(0, 80)} changed`);
  }
  for (const id of widenedIds) {
    if (
      (livePrices.get(`cabinet:${id}`) ?? 0) <=
      (beforePrices.get(`cabinet:${id}`) ?? 0)
    ) {
      fail(`the widened ${id} did not cost more`);
    }
  }
}

function emptyCensus(): DesignCensus {
  return {
    rooms: 0,
    changed: { A: 0, B: 0 },
    defects: [],
    changedRooms: [],
    withoutAFillableEnd: 0,
  };
}

describe("criteria 1-4 on the built kitchen, over a 70 mm stride of the approved L at 2400 and 2600", () => {
  it(
    "builds every kitchen as the pre-C5 kitchen with exactly the owner's rule applied, and nothing else",
    async () => {
      const census = emptyCensus();
      const approved = APPROVED_ROOM_POLICY.buildableShapes.L;
      if (!approved) throw new Error("no L policy");
      for (
        let widthMm = approved.wallA.minMm;
        widthMm <= approved.wallA.maxMm;
        widthMm += 70
      ) {
        for (
          let depthMm = approved.wallB.minMm;
          depthMm <= approved.wallB.maxMm;
          depthMm += 70
        ) {
          for (const heightMm of [2400, 2600]) {
            auditRoom({ shape: "L", widthMm, depthMm, heightMm }, census);
          }
        }
        await yieldToTheEventLoop();
      }

      expect(census.defects.slice(0, 20)).toEqual([]);
      expect(census.changed.A).toBeGreaterThan(0);
      expect(census.changed.B).toBeGreaterThan(0);
      expect(census.withoutAFillableEnd).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

/** Rooms at every reachable leftover from 40 to 310 mm on each wall, found by a 1 mm sweep of one entered
 *  wall against a few fixed others. */
function roomsAtEveryLeftover(heightMm: number): readonly DesignRoom[] {
  const found = new Map<string, DesignRoom>();
  const keep = (room: DesignRoom, wall: LWall) => {
    const before = composedBeforeC5(room);
    if (!before) return;
    const end = endFridgeOn(before, wall);
    if (!end || end.inboard.body.buildId !== DOOR_CABINET) return;
    if (end.leftoverMm < 40 || end.leftoverMm > 310) return;
    const key = `${wall}${String(end.leftoverMm)}`;
    if (!found.has(key)) found.set(key, room);
  };
  for (const depthMm of [2850, 3500]) {
    for (let widthMm = 2780; widthMm <= 3420; widthMm += 1) {
      keep({ shape: "L", widthMm, depthMm, heightMm }, "A");
    }
  }
  for (const widthMm of [3500, 4200]) {
    for (let depthMm = 2780; depthMm <= 3520; depthMm += 1) {
      keep({ shape: "L", widthMm, depthMm, heightMm }, "B");
    }
  }
  return [...found.values()];
}

describe("criteria 1-3 at every reachable leftover on both walls", () => {
  it.each([2200, 2600, 3900])(
    "at %i mm, every leftover from 40 to 310 mm builds as the owner's rule says, both walls",
    (heightMm) => {
      const rooms = roomsAtEveryLeftover(heightMm);
      const census = emptyCensus();
      for (const room of rooms) auditRoom(room, census);

      // Reachable leftovers are even: 136 values from 40 to 310 on each wall.
      expect(rooms.length).toBeGreaterThanOrEqual(2 * 120);
      expect(census.defects.slice(0, 20)).toEqual([]);
      // 50..298 even: 125 values per wall change, 40..48 and 300..310 do not.
      expect(census.changed).toEqual({ A: 125, B: 125 });
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe("criterion 1 — the right-hand L is the left-hand L's plan", () => {
  it(
    "builds every changed leftover's right-hand room with the same placements as its left-hand twin",
    () => {
      const mismatches: string[] = [];
      for (const room of roomsAtEveryLeftover(2600)) {
        const right = composed({ ...room, cornerDirection: "right" });
        if (
          JSON.stringify(right.placements) !==
          JSON.stringify(composed(room).placements)
        ) {
          mismatches.push(labelOf(room));
        }
      }

      expect(mismatches).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// -------------------------------------------------------------------------------------------------
// Criterion 5 — the editor on a generated widened kitchen.
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

/** Rooms where wall A or B's end cabinet was widened to 650, 700, 750 and 800. */
const WIDENED_ROOMS: readonly {
  readonly room: DesignRoom;
  readonly wall: LWall;
  readonly widthMm: number;
}[] = [
  {
    room: { shape: "L", widthMm: 2850, depthMm: 2851, heightMm: 2600 },
    wall: "A",
    widthMm: 650,
  },
  {
    room: { shape: "L", widthMm: 2900, depthMm: 2901, heightMm: 2600 },
    wall: "A",
    widthMm: 700,
  },
  {
    room: { shape: "L", widthMm: 2950, depthMm: 3500, heightMm: 2600 },
    wall: "A",
    widthMm: 750,
  },
  {
    room: { shape: "L", widthMm: 3098, depthMm: 3100, heightMm: 2600 },
    wall: "A",
    widthMm: 800,
  },
  {
    room: { shape: "L", widthMm: 3500, depthMm: 2950, heightMm: 2600 },
    wall: "B",
    widthMm: 650,
  },
  {
    room: { shape: "L", widthMm: 3500, depthMm: 3100, heightMm: 2600 },
    wall: "B",
    widthMm: 800,
  },
];

function widenedCabinetOf(design: Design, wall: LWall): DesignPlacement {
  const fridge = design.placements.find(
    (p) => p.wall === wall && p.body.buildId === FRIDGE,
  );
  if (!fridge) throw new Error(`no fridge on ${wall}`);
  const found = design.placements.find(
    (p) =>
      p.wall === wall &&
      p.y0Mm === 0 &&
      spanOf(p).endMm === spanOf(fridge).startMm,
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

function fridgeOf(design: Design, wall: LWall): DesignPlacement {
  const found = design.placements.find(
    (p) => p.wall === wall && p.body.buildId === FRIDGE,
  );
  if (!found) throw new Error(`no fridge on ${wall}`);
  return found;
}

describe("criterion 5 — the editor's commands on a generated widened cabinet", () => {
  it.each(WIDENED_ROOMS)(
    "generates $room.widthMm x $room.depthMm with a $widthMm mm cabinet beside the wall $wall fridge",
    ({ room, wall, widthMm }) => {
      expect(widenedCabinetOf(composed(room), wall).body.widthMm).toBe(widthMm);
    },
  );

  it.each(WIDENED_ROOMS)(
    "offers the $widthMm mm cabinet of $room.widthMm x $room.depthMm whole 50 mm steps, never past 800, and steps it down 50 without moving the fridge",
    ({ room, wall, widthMm }) => {
      const world = worldOf(composed(room));
      const cabinet = widenedCabinetOf(world.design, wall);
      const fridgeBefore = fridgeOf(world.design, wall);
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
      const resized = narrowed.design.placements.find(
        (p) => p.id === cabinet.id,
      );

      expect(resized?.body.widthMm).toBe(widthMm - ABSORB_STEP_MM);
      expect(fridgeOf(narrowed.design, wall)).toEqual(fridgeBefore);
      expect(
        validateDesignForCatalog(narrowed.design, narrowed.catalog),
      ).toEqual([]);
      expect(findOverflowingPlacementIds(narrowed.design)).toEqual([]);
    },
  );

  it.each(WIDENED_ROOMS)(
    "keeps $room.widthMm x $room.depthMm's $widthMm mm cabinet and its fridge through a depth change 600 → 700 → 600",
    ({ room, wall, widthMm }) => {
      const original = worldOf(composed(room));
      const deep = atDepth(original, 700);
      const back = atDepth(deep, 600);

      for (const [world, depthMm] of [
        [deep, 700],
        [back, 600],
      ] as const) {
        const cabinet = widenedCabinetOf(world.design, wall);
        const fridge = fridgeOf(world.design, wall);
        const fridgeSpan = spanOf(fridge);
        const label = `${labelOf(room)} at ${String(depthMm)}`;

        expect(cabinetDepthMmOf(world.design), label).toBe(depthMm);
        expect(cabinet.body.widthMm, label).toBe(widthMm);
        expect(fridge.body.widthMm, label).toBe(700);
        // Wall B's 100 mm is the slide reserve (`shell-design.ts` `plannedEndMm`): at 700 every wall-B body
        // slides 100 toward the side wall, so there the fridge may reach the wall and never pass it.
        if (wall === "B") {
          const reserveMm = depthMm === 600 ? SIDE_WALL_RESERVE_MM : 0;
          expect(fridgeSpan.endMm, label).toBeLessThanOrEqual(
            room.depthMm - reserveMm,
          );
        } else {
          expect(fridgeSpan.endMm, label).toBeLessThanOrEqual(room.widthMm);
        }
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
        for (const p of world.design.placements.filter(
          (q) => q.wall === wall && q.y0Mm >= WALL_ROW_FLOOR_MM,
        )) {
          if (overlapsByMoreThanNothing(spanOf(p), fridgeSpan)) continue;
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
      // Positions and widths only: the depth command re-probes the structural corner pieces, which the
      // generated shell carries without a seat, so seats differ on the way back in every room, C5 or not.
      expect(positionsOf(back.design), labelOf(room)).toEqual(
        positionsOf(original.design),
      );
    },
  );

  it.each(WIDENED_ROOMS)(
    "saves and reloads $room.widthMm x $room.depthMm's widened kitchen unchanged",
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
