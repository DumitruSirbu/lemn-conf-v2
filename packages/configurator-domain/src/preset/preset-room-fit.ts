// The preset's document moved into the target room, as far as a document can move without a command (ADR 0109
// Amendments B and E). Every placement stays where the owner put it; what changes is the room, the corner pieces the
// ceiling does not admit, and, on a U whose back wall differs, the right corner's zone, which moves with the wall's
// end (E3). A corner assembly sized or composed differently in the target room is not shifted but refused: the preset
// is not offered and nothing is narrowed (E4, A5).

import { cornerOf } from "../corner-of.js";
import type {
  Design,
  DesignPlacement,
  DesignRoom,
  EmptyColumn,
} from "../design.js";
import { isBackWallBaseOnly } from "../generation/run-layout.js";
import { toMetres } from "../millimetres.js";
import {
  deriveColumnKeyAt,
  derivePlacementRecords,
  withFrozenMap,
  type BodyCatalog,
} from "../void-engine.js";

import type { PresetNotOfferedReason } from "./preset-adaptation-result.js";
import { floorRunsOf } from "./target-shell.js";

/** The back wall's right end of a U, where generation leaves its remainder (ADR 0110 N11.8): everything on wall A
 *  from `startMm` on is the right corner's zone, and moves with the wall by `deltaMm`. */
export interface RightCornerZone {
  readonly startMm: number;
  readonly deltaMm: number;
}

export interface PresetRoomFit {
  /** The preset in the target room: the pieces the ceiling excludes are gone with their recorded space; nothing
   *  has been shifted, removed or refilled yet. */
  readonly design: Design;
  readonly droppedCornerPieceCount: number;
  /** Present on a U, whose right corner is not a wall's free end even when the back wall keeps its length. */
  readonly rightCornerZone?: RightCornerZone;
}

export type PresetRoomFitResult =
  | { readonly ok: true; readonly fit: PresetRoomFit }
  | { readonly ok: false; readonly reason: PresetNotOfferedReason };

const CORNER_SIZED_DIFFERENTLY: PresetNotOfferedReason = {
  code: "CORNER_SIZED_DIFFERENTLY",
};

export function fitPresetToRoom(input: {
  readonly preset: Design;
  readonly room: DesignRoom;
  /** The shell of `room`, built once by the caller: the corner pieces the room admits are read off it. */
  readonly shell: Design;
  readonly presetId: string;
  readonly catalog: BodyCatalog;
  readonly occurredAt: string;
}): PresetRoomFitResult {
  const { preset, room, shell, catalog, occurredAt } = input;
  if (isBackWallBaseOnly(preset.room) !== isBackWallBaseOnly(room)) {
    return { ok: false, reason: CORNER_SIZED_DIFFERENTLY };
  }
  const deltaMm = rightCornerDeltaMm(preset.room, room);
  const comparison = compareCornerPieces({
    preset,
    room,
    shell,
    catalog,
    deltaMm,
  });
  if (comparison.differs) {
    return { ok: false, reason: CORNER_SIZED_DIFFERENTLY };
  }
  const design = withoutCornerPieces({
    design: { ...preset, room, presetId: input.presetId },
    droppedIds: comparison.droppedIds,
    catalog,
    occurredAt,
  });
  return {
    ok: true,
    fit: {
      design,
      droppedCornerPieceCount: comparison.droppedIds.size,
      ...(room.shape === "U"
        ? { rightCornerZone: rightCornerZoneOf(preset.room, deltaMm) }
        : {}),
    },
  };
}

/** How far the back wall's end moved: only a U has a right corner at that end. */
function rightCornerDeltaMm(saved: DesignRoom, room: DesignRoom): number {
  return room.shape === "U" ? room.widthMm - saved.widthMm : 0;
}

function rightCornerZoneOf(
  saved: DesignRoom,
  deltaMm: number,
): RightCornerZone {
  const backWallRun = floorRunsOf(saved).A;
  if (backWallRun === undefined) {
    throw new Error(
      "rightCornerZoneOf: a room with a right corner has a wall A",
    );
  }
  return { startMm: backWallRun.endMm, deltaMm };
}

interface CornerComparison {
  readonly differs: boolean;
  readonly droppedIds: ReadonlySet<string>;
}

/** Each corner piece the preset holds against the piece the target room's shell would stand at its id. A piece the
 *  shell does not have is dropped, which only a ceiling below it justifies (B); a piece with the same id that is
 *  built or placed otherwise is the corner "sized differently" (E4). The shell's pieces the preset lacks (a taller
 *  room admits one more) are not added: nothing is added above the preset. */
function compareCornerPieces(input: {
  readonly preset: Design;
  readonly room: DesignRoom;
  readonly shell: Design;
  readonly catalog: BodyCatalog;
  readonly deltaMm: number;
}): CornerComparison {
  const { preset, room, shell, catalog, deltaMm } = input;
  const droppedIds = new Set<string>();
  let differs = false;
  for (const piece of preset.placements.filter(isACornerPiece(catalog))) {
    const target = shell.placements.find(({ id }) => id === piece.id);
    if (target === undefined) {
      droppedIds.add(piece.id);
      differs ||= !isAboveTheCeiling(piece, room);
      continue;
    }
    const expectedAlongMm =
      cornerOf(piece, preset.room, catalog) === "right" && piece.wall === "A"
        ? piece.alongMm + deltaMm
        : piece.alongMm;
    differs ||= !isTheSamePiece(piece, target, expectedAlongMm);
  }
  return { differs, droppedIds };
}

function isACornerPiece(
  catalog: BodyCatalog,
): (placement: DesignPlacement) => boolean {
  return (placement) =>
    catalog.get(placement.body.buildId)?.structuralReason !== undefined;
}

function isAboveTheCeiling(
  placement: DesignPlacement,
  room: DesignRoom,
): boolean {
  return placement.y0Mm + placement.body.heightMm > room.heightMm;
}

function isTheSamePiece(
  piece: DesignPlacement,
  target: DesignPlacement,
  expectedAlongMm: number,
): boolean {
  return (
    target.wall === piece.wall &&
    target.y0Mm === piece.y0Mm &&
    target.alongMm === expectedAlongMm &&
    target.body.buildId === piece.body.buildId &&
    target.body.widthMm === piece.body.widthMm &&
    target.body.heightMm === piece.body.heightMm
  );
}

/** The design without `droppedIds`, and without the recorded space of their columns: "a structural piece above the
 *  ceiling is not instantiated" (Amendment B), so its zone stays unrecorded as the shell leaves it. */
function withoutCornerPieces(input: {
  readonly design: Design;
  readonly droppedIds: ReadonlySet<string>;
  readonly catalog: BodyCatalog;
  readonly occurredAt: string;
}): Design {
  const { design, droppedIds, catalog } = input;
  if (droppedIds.size === 0) return stamped(design, input.occurredAt);
  const droppedKeys = new Set(
    derivePlacementRecords(design, catalog)
      .filter(({ id }) => droppedIds.has(id))
      .map(({ col }) => col),
  );
  const isKept = (entry: EmptyColumn): boolean =>
    !droppedKeys.has(deriveColumnKeyAt(entry.wall, toMetres(entry.alongMm)));
  return stamped(
    withFrozenMap(
      {
        ...design,
        placements: design.placements.filter(({ id }) => !droppedIds.has(id)),
      },
      {
        emptyColumns: design.emptyColumns?.filter(isKept),
        columnExtents: design.columnExtents?.filter(isKept),
      },
    ),
    input.occurredAt,
  );
}

function stamped(design: Design, occurredAt: string): Design {
  return { ...design, createdAt: occurredAt, updatedAt: occurredAt };
}

/** Whether a span lies in the right corner's zone, which a back wall's change moves rather than shortens. */
export function isInTheRightCornerZone(
  span: { readonly wall: string; readonly startMm: number },
  zone: RightCornerZone | undefined,
): boolean {
  return (
    zone !== undefined && span.wall === "A" && span.startMm >= zone.startMm
  );
}

/** The right corner's zone moved with the wall's end (E3): its placements and its recorded space shift by the
 *  wall's change, the corner assembly was proved the same size by `compareCornerPieces`. */
export function withTheRightCornerZoneShifted(
  design: Design,
  zone: RightCornerZone,
): Design {
  const shiftIfInZone = <
    Span extends {
      readonly wall: string;
      readonly alongMm: number;
    },
  >(
    span: Span,
    widthMm: number,
  ): Span =>
    isInTheRightCornerZone(
      { wall: span.wall, startMm: span.alongMm - widthMm / 2 },
      zone,
    )
      ? { ...span, alongMm: span.alongMm + zone.deltaMm }
      : span;
  return withFrozenMap(
    {
      ...design,
      placements: design.placements.map((placement) =>
        shiftIfInZone(placement, placement.body.widthMm),
      ),
    },
    {
      emptyColumns: design.emptyColumns?.map((entry) =>
        shiftIfInZone(entry, entry.widthMm),
      ),
      columnExtents: design.columnExtents?.map((entry) =>
        shiftIfInZone(entry, entry.widthMm),
      ),
    },
  );
}

/** Recorded space never rises above the ceiling (Amendment B): an entry whose floor is at or above it is dropped,
 *  and the rest are capped at it. One helper for `emptyColumns` and `columnExtents` alike. */
export function withRecordedSpaceUnderTheCeiling(design: Design): Design {
  const { heightMm } = design.room;
  const underTheCeiling = (entries: readonly EmptyColumn[] | undefined) =>
    entries
      ?.filter((entry) => entry.y0Mm < heightMm)
      .map((entry) =>
        entry.topMm > heightMm ? { ...entry, topMm: heightMm } : entry,
      );
  return withFrozenMap(design, {
    emptyColumns: underTheCeiling(design.emptyColumns),
    columnExtents: underTheCeiling(design.columnExtents),
  });
}

/** The non-structural bodies whose top is above the ceiling, which `removePlacement` takes (Amendment B). */
export function bodiesAboveTheCeiling(
  design: Design,
  catalog: BodyCatalog,
): readonly DesignPlacement[] {
  const isCorner = isACornerPiece(catalog);
  return design.placements.filter(
    (placement) =>
      !isCorner(placement) && isAboveTheCeiling(placement, design.room),
  );
}
