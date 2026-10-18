// The refill of the columns past a wall's last occupied one (ADR 0109 Amendment E1, Q-3): every free end of an
// adapted preset is filled by generation's own rule at every level its column carries, a bare end the owner saved
// included. The rule is the leftover rule and ADR 0167 together: whole 600 mm storage cabinets from the last column
// outward, then, if what remains is as wide as the narrowest cabinet of the column (200 mm, read from the
// catalogue), one base cabinet built to exactly that. A remainder narrower than that stays bare, recorded as empty
// space the customer can insert into. Uppers and tops follow by the generator's own policy (`isAnUpperOwedOver`,
// `hasRoomForATopRow`), the top row only on a wall whose own columns carry one. The columns before it are the
// owner's and stay as saved: an upper, top or hood removed there is not refilled.
//
// Nothing the preset holds moves to make room (the generator's end-group move, ADR 0167 D5, would rearrange the
// owner's work): the fill stands beyond the last column. Each tile is recorded at its planned width by the shell's
// own tiling and held apart by composition's planned boundaries (D6), so a `'fit'` body is built to its tile.

import { DOOR_BASE_BUILD_ID } from "../generation/body-choice.js";
import {
  planLeftover,
  STORAGE_BODY_WIDTH_MM,
} from "../generation/leftover-rule.js";
import {
  plannedBaseAt,
  type UPlannedGenerationBase,
} from "../generation/run-layout.js";
import {
  hasRoomForATopRow,
  isAnUpperOwedOver,
  WALL_CABINET_BUILD_ID,
  WALL_ROW_Y0_MM,
} from "../generation/upper-policy.js";
import { TOP_ROW_Y0_MM } from "../push-to-open.js";
import type { BodyProbe } from "../body-probe.js";
import type { Design, DesignRoom, DesignWall, EmptyColumn } from "../design.js";
import {
  deriveColumnKeyAt,
  type BodyCatalog,
  type PlannedBoundariesMm,
} from "../void-engine.js";

import type { FreeEnd } from "./free-end-spans.js";
import type {
  PresetAddition,
  PresetNotOfferedReason,
} from "./preset-adaptation-result.js";
import {
  isInTheRightCornerZone,
  withTheRightCornerZoneShifted,
  type RightCornerZone,
} from "./preset-room-fit.js";
import {
  afterInserting,
  loadPresetWorld,
  type PresetWorld,
} from "./preset-world.js";
import { shellOf, type ShellTiling } from "./target-shell.js";

const MILLIMETRES_PER_METRE = 1000;

/** One planned column of a free end. A tile narrower than the cabinet floor is recorded and left empty. */
interface FillTile {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly widthMm: number;
  readonly isFilled: boolean;
}

type RefillStep =
  | {
      readonly ok: true;
      readonly world: PresetWorld;
      readonly added: readonly PresetAddition[];
    }
  | { readonly ok: false; readonly reason: PresetNotOfferedReason };

/** The narrowest width the filled column's bodies all share, from the catalogue (ADR 0167 D2). */
export function fillFloorMmOf(catalog: BodyCatalog): number {
  return Math.max(
    ...[DOOR_BASE_BUILD_ID, WALL_CABINET_BUILD_ID].map((buildId) => {
      const floorMm = catalog.get(buildId)?.minWidthMm;
      if (floorMm === undefined) {
        throw new Error(`fillFloorMmOf: ${buildId} declares no width floor`);
      }
      return floorMm;
    }),
  );
}

/** The free end cut into its columns: whole storage modules, then the remainder. A remainder is kept to an even
 *  width, since a document holds whole-millimetre centres (the shell's own rule for an odd span). */
export function tilesOfFreeEnd(
  freeEnd: FreeEnd,
  floorMm: number,
): readonly FillTile[] {
  const { wall } = freeEnd;
  const { storageCount, remainderMm } = planLeftover(
    freeEnd.endMm - freeEnd.startMm,
  );
  const storage = Array.from({ length: storageCount }, (_, index) => ({
    wall,
    startMm: freeEnd.startMm + index * STORAGE_BODY_WIDTH_MM,
    widthMm: STORAGE_BODY_WIDTH_MM,
    isFilled: true,
  }));
  const evenRemainderMm = remainderMm - (remainderMm % 2);
  if (evenRemainderMm === 0) return storage;
  return [
    ...storage,
    {
      wall,
      startMm: freeEnd.startMm + storageCount * STORAGE_BODY_WIDTH_MM,
      widthMm: evenRemainderMm,
      isFilled: evenRemainderMm >= floorMm,
    },
  ];
}

/** The design with each free end's trailing empty space replaced by its planned tiles: the old trailing columns
 *  go (outside the right corner's zone), the zone moves with its wall's end, and the tiles are recorded as the
 *  shell would record them. The order is what keeps the new tiles out of the zone's shift. */
export function withTheFreeEndsTiled(input: {
  readonly design: Design;
  readonly room: DesignRoom;
  readonly freeEnds: readonly FreeEnd[];
  readonly tiles: readonly FillTile[];
  readonly zone: RightCornerZone | undefined;
  readonly occurredAt: string;
}): Design {
  const { design, freeEnds, zone } = input;
  const cleared = withoutTrailingEmptySpace(design, freeEnds, zone);
  const shifted =
    zone === undefined ? cleared : withTheRightCornerZoneShifted(cleared, zone);
  if (input.tiles.length === 0) return shifted;
  const tiling = tilingOf(input);
  const tileEntries = shellOf({
    room: input.room,
    occurredAt: input.occurredAt,
    tiling,
  }).emptyColumns?.filter((entry) => isATile(entry, input.tiles));
  return {
    ...shifted,
    emptyColumns: [...(shifted.emptyColumns ?? []), ...(tileEntries ?? [])],
  };
}

function withoutTrailingEmptySpace(
  design: Design,
  freeEnds: readonly FreeEnd[],
  zone: RightCornerZone | undefined,
): Design {
  const isTrailing = (entry: EmptyColumn): boolean =>
    freeEnds.some(
      (freeEnd) =>
        entry.wall === freeEnd.wall &&
        entry.alongMm - entry.widthMm / 2 >= freeEnd.startMm &&
        !isInTheRightCornerZone(
          { wall: entry.wall, startMm: entry.alongMm - entry.widthMm / 2 },
          zone,
        ),
    );
  return {
    ...design,
    emptyColumns: design.emptyColumns?.filter((entry) => !isTrailing(entry)),
  };
}

/** The shell's tiling for the free ends: a lead tile as wide as the occupied stretch, which is discarded, then
 *  the planned tiles; and a boundary at every tile's near edge, the lead's included, so none is merged into a
 *  neighbour. */
function tilingOf(input: {
  readonly freeEnds: readonly FreeEnd[];
  readonly tiles: readonly FillTile[];
}): ShellTiling {
  const widthsMm: Partial<Record<DesignWall, readonly number[]>> = {};
  const boundaries = new Map<DesignWall, readonly number[]>();
  for (const freeEnd of input.freeEnds) {
    const tiles = input.tiles.filter(({ wall }) => wall === freeEnd.wall);
    if (tiles.length === 0) continue;
    const leadMm = freeEnd.startMm - freeEnd.runStartMm;
    widthsMm[freeEnd.wall] = [
      ...(leadMm > 0 ? [leadMm] : []),
      ...tiles.map(({ widthMm }) => widthMm),
    ];
    boundaries.set(
      freeEnd.wall,
      tiles.slice(leadMm > 0 ? 0 : 1).map(({ startMm }) => startMm),
    );
  }
  return { widthsMm, plannedBoundariesMm: boundaries };
}

/** Whether a recorded floor-run entry of the planned shell is one of the planned tiles: the shell also records
 *  the lead tile and the wall rows, which are not. */
function isATile(entry: EmptyColumn, tiles: readonly FillTile[]): boolean {
  const startMm = entry.alongMm - entry.widthMm / 2;
  return (
    entry.y0Mm === 0 &&
    tiles.some((tile) => tile.wall === entry.wall && tile.startMm === startMm)
  );
}

/** The planned boundaries of `tiles`, for the world the refill inserts in. */
function boundariesOf(tiles: readonly FillTile[]): PlannedBoundariesMm {
  const boundaries = new Map<DesignWall, number[]>();
  for (const tile of tiles) {
    boundaries.set(tile.wall, [
      ...(boundaries.get(tile.wall) ?? []),
      tile.startMm,
    ]);
  }
  return boundaries;
}

/** Bases first, then the uppers over them, then the tops over the uppers: the order generation inserts in. */
export function afterTheTilesAreFilled(
  design: Design,
  input: {
    readonly catalog: BodyCatalog;
    readonly tiles: readonly FillTile[];
    readonly topRowWalls: ReadonlySet<DesignWall>;
    readonly probe: BodyProbe;
    readonly occurredAt: string;
  },
): RefillStep {
  const filled = input.tiles.filter(({ isFilled }) => isFilled);
  let world = loadPresetWorld({
    design,
    catalog: input.catalog,
    plannedBoundaries: boundariesOf(input.tiles),
  });
  const added: PresetAddition[] = [];
  for (const level of levelsOf(design.room, input)) {
    for (const tile of filled.filter(level.isOwedOver)) {
      const step = afterInsertingOver(world, tile, {
        buildId: level.buildId,
        floorMm: level.floorMm,
        probe: input.probe,
        occurredAt: input.occurredAt,
      });
      if (!step.ok) return step;
      world = step.world;
      added.push(step.added);
    }
  }
  return { ok: true, world, added };
}

interface FillLevel {
  readonly buildId: string;
  readonly floorMm: number;
  readonly isOwedOver: (tile: FillTile) => boolean;
}

/** The rows a filled column carries: its base always, its wall row where the generator owes an upper over such a
 *  base, and its top row over that upper where the room is tall enough and the preset's own columns on that wall
 *  carry a top row (the owner's ruling: a fill continues a preset's top row, it does not start one). */
function levelsOf(
  room: DesignRoom,
  input: {
    readonly catalog: BodyCatalog;
    readonly topRowWalls: ReadonlySet<DesignWall>;
  },
): readonly FillLevel[] {
  const { catalog } = input;
  const isAnUpperOwed = (tile: FillTile): boolean =>
    isAnUpperOwedOver(plannedBaseOf(tile), { room, catalog });
  const base: FillLevel = {
    buildId: DOOR_BASE_BUILD_ID,
    floorMm: 0,
    isOwedOver: () => true,
  };
  const wallRow: FillLevel = {
    buildId: WALL_CABINET_BUILD_ID,
    floorMm: WALL_ROW_Y0_MM,
    isOwedOver: isAnUpperOwed,
  };
  const topRow: FillLevel = {
    ...wallRow,
    floorMm: TOP_ROW_Y0_MM,
    isOwedOver: (tile) =>
      input.topRowWalls.has(tile.wall) && isAnUpperOwed(tile),
  };
  return hasRoomForATopRow(room) ? [base, wallRow, topRow] : [base, wallRow];
}

/** The walls on which the design stands a top-row body of its own: a corner piece is the room's, not the owner's. */
export function wallsCarryingATopRow(
  design: Design,
  catalog: BodyCatalog,
): ReadonlySet<DesignWall> {
  return new Set(
    design.placements
      .filter(
        (placement) =>
          placement.y0Mm === TOP_ROW_Y0_MM &&
          catalog.get(placement.body.buildId)?.structuralReason === undefined,
      )
      .map(({ wall }) => wall),
  );
}

function plannedBaseOf(tile: FillTile): UPlannedGenerationBase {
  return plannedBaseAt({
    id: `free-end:${tile.wall}:${String(tile.startMm)}`,
    role: "storage",
    buildId: DOOR_BASE_BUILD_ID,
    widthMm: tile.widthMm,
    wall: tile.wall,
    startMm: tile.startMm,
  });
}

type InsertOverStep =
  | {
      readonly ok: true;
      readonly world: PresetWorld;
      readonly added: PresetAddition;
    }
  | { readonly ok: false; readonly reason: PresetNotOfferedReason };

/** One insert into the opening of `tile`'s column at a row's floor. */
function afterInsertingOver(
  world: PresetWorld,
  tile: FillTile,
  input: {
    readonly buildId: string;
    readonly floorMm: number;
    readonly probe: BodyProbe;
    readonly occurredAt: string;
  },
): InsertOverStep {
  const columnKey = deriveColumnKeyAt(
    tile.wall,
    (tile.startMm + tile.widthMm / 2) / MILLIMETRES_PER_METRE,
  );
  const opening = world.voids.find(
    (candidate) =>
      candidate.col === columnKey &&
      Math.round(candidate.y0 * MILLIMETRES_PER_METRE) === input.floorMm,
  );
  if (opening === undefined) return insertRefused("NO_OPENING");
  const step = afterInserting(world, {
    voidId: opening.id,
    buildId: input.buildId,
    probe: input.probe,
    occurredAt: input.occurredAt,
  });
  if (!step.ok) return insertRefused(step.refusalCode);
  const placed = step.world.design.placements.find(
    ({ id }) => id === step.placementId,
  );
  if (placed?.body.widthMm !== tile.widthMm) {
    return insertRefused("TILE_JOINED");
  }
  return {
    ok: true,
    world: step.world,
    added: {
      wall: tile.wall,
      buildId: input.buildId,
      widthMm: tile.widthMm,
      y0Mm: input.floorMm,
    },
  };
}

function insertRefused(refusalCode: string): InsertOverStep {
  return {
    ok: false,
    reason: { code: "COMMAND_REFUSED", command: "insert", refusalCode },
  };
}
