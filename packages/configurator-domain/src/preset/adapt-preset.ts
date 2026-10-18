// A preset in a room that is not the one it was saved in (ADR 0109 Amendments A3, B, C, E; plan M8C section 3.5).
//
// In order: the preset is taken to the shell's cabinet depth, where the floor runs are stated; moved into the room
// (the corner pieces the ceiling admits, a U's right corner zone); stripped of what the room cannot hold (the bodies
// above its ceiling, then whole columns from each free end); and its free ends refilled by generation's own rule. The
// result is held to zero findings at every declared depth and to the minimum kitchen (decision 3, Amendment C, A3.4),
// and comes back at the preset's own depth (decision 5). Anything short of that is a reason, never a throw: a card
// is shown only for a preset `Select` cannot fail on.
//
// Every change to the document goes through `removePlacement`, `insertBody` or `setCabinetDepth`. I/O-free: the
// probe is leased from the caller's factory, one lease at a time.

import type { BodyProbe, BodyProbeFactory } from "../body-probe.js";
import { setCabinetDepth } from "../commands/set-cabinet-depth.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "../design.js";
import { buildKitchenLBodyCatalog } from "../fixtures/kitchen-l-design.js";
import { wallsOf } from "../room/walls-of-shape.js";
import { declaredCabinetDepthsMm } from "../worktop-depth.js";
import type { BodyCatalog } from "../void-engine.js";

import {
  afterTheTilesAreFilled,
  fillFloorMmOf,
  tilesOfFreeEnd,
  wallsCarryingATopRow,
  withTheFreeEndsTiled,
} from "./free-end-refill.js";
import { freeEndsOf } from "./free-end-spans.js";
import { isRoomInPresetWindow } from "./match-presets.js";
import {
  notOffered,
  type PresetAdaptation,
  type PresetAdaptationChanges,
  type PresetAddition,
  type PresetNotOfferedReason,
  type PresetRemoval,
} from "./preset-adaptation-result.js";
import {
  PRESET_HAS_FINDINGS,
  presetRoomOf,
  refusalOfPresetCandidate,
  type PresetRoom,
} from "./preset-candidate.js";
import {
  bodiesAboveTheCeiling,
  fitPresetToRoom,
  withRecordedSpaceUnderTheCeiling,
  type PresetRoomFit,
  type RightCornerZone,
} from "./preset-room-fit.js";
import {
  afterRemovingBodies,
  afterTheFreeEndsAreShortened,
} from "./preset-subtraction.js";
import {
  inTheEditorsCanonicalForm,
  loadPresetWorld,
  type PresetWorld,
} from "./preset-world.js";
import { floorRunsOf, shellOf, type WallRunMm } from "./target-shell.js";

/** A stored preset as adaptation reads it: the room it was saved in and its document. The persistence package's
 *  `StoredPreset` satisfies it, so the domain names no storage type. */
export interface AdaptablePreset extends PresetRoom {
  readonly id: string;
  readonly design: Design;
}

export interface AdaptPresetInput {
  readonly preset: AdaptablePreset;
  /** The room the customer entered, whole: its ceiling, its corner direction and the wall lengths. */
  readonly room: DesignRoom;
  readonly occurredAt: string;
  readonly probeAt: BodyProbeFactory;
}

type FlowStep<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: PresetNotOfferedReason };

/** `preset` adapted to `room`, or the reason it is not offered there. Never throws. */
export function adaptPresetToRoom(input: AdaptPresetInput): PresetAdaptation {
  try {
    return adaptOrExplain(input);
  } catch {
    return notOffered({ code: "ADAPTATION_FAILED" });
  }
}

function adaptOrExplain(input: AdaptPresetInput): PresetAdaptation {
  const { preset, room, probeAt } = input;
  if (!isInTheWindowOfBoth(preset, presetRoomOf({ room }))) {
    return notOffered({ code: "NOT_IN_WINDOW" });
  }
  const fit = fitToTheRoom(input);
  if (!fit.ok) return notOffered(fit.reason);

  const { shellDepthMm } = fit.value;
  const adapted = probeAt(shellDepthMm).use((probe) =>
    adaptInTheRoom({ fit: fit.value.fit, input, shellDepthMm, probe }),
  );
  if (!adapted.ok) return notOffered(adapted.reason);

  const held = holdAtEveryDepth(input, adapted.value.design);
  if (!held.ok) return notOffered(held.reason);
  return { ok: true, design: held.value, changes: adapted.value.changes };
}

interface FitToTheRoom {
  readonly fit: PresetRoomFit;
  readonly shellDepthMm: number;
}

/** The preset at the shell's depth, where the floor runs are stated, moved into the room. */
/** The stored walls are a claim the list is searched by; the document is what is adapted. Both must hold the room in
 *  the window, so a row whose columns disagree with its document cannot be offered by either one. */
function isInTheWindowOfBoth(
  preset: AdaptablePreset,
  room: PresetRoom,
): boolean {
  return (
    isRoomInPresetWindow({ saved: preset, room }) &&
    isRoomInPresetWindow({ saved: presetRoomOf(preset.design), room })
  );
}

function fitToTheRoom(input: AdaptPresetInput): FlowStep<FitToTheRoom> {
  const { preset, room, occurredAt } = input;
  const shell = shellOf({ room, occurredAt });
  const shellDepthMm = cabinetDepthMmOf(shell);
  const unknown = firstUnknownBody(preset.design, shellDepthMm);
  if (unknown !== undefined) return { ok: false, reason: unknown };
  const atShellDepth = atCabinetDepth(input, preset.design, shellDepthMm);
  if (!atShellDepth.ok) return atShellDepth;
  const fit = fitPresetToRoom({
    preset: atShellDepth.value,
    room,
    shell,
    presetId: preset.id,
    catalog: buildKitchenLBodyCatalog(shellDepthMm),
    occurredAt,
  });
  return fit.ok ? { ok: true, value: { fit: fit.fit, shellDepthMm } } : fit;
}

function firstUnknownBody(
  design: Design,
  cabinetDepthMm: number,
): PresetNotOfferedReason | undefined {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const unknown = design.placements.find(
    (placement) => !catalog.has(placement.body.buildId),
  );
  return unknown === undefined
    ? undefined
    : { code: "BODY_NOT_IN_CATALOGUE", buildId: unknown.body.buildId };
}

/** `design` at `cabinetDepthMm`, through the editor's own depth command; the design itself if it stands there. */
function atCabinetDepth(
  input: Pick<AdaptPresetInput, "occurredAt" | "probeAt">,
  design: Design,
  cabinetDepthMm: number,
): FlowStep<Design> {
  if (cabinetDepthMmOf(design) === cabinetDepthMm) {
    return { ok: true, value: design };
  }
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: input.probeAt,
    occurredAt: input.occurredAt,
  });
  return result.ok
    ? { ok: true, value: result.design }
    : {
        ok: false,
        reason: {
          code: "COMMAND_REFUSED",
          command: "depth",
          refusalCode: result.reason.code,
        },
      };
}

interface AdaptedInTheRoom {
  readonly design: Design;
  readonly changes: PresetAdaptationChanges;
}

/** What every step of the work in the room reads: the room, its catalogue at the shell's depth and its floor runs. */
interface RoomWork {
  readonly room: DesignRoom;
  readonly catalog: BodyCatalog;
  readonly walls: readonly DesignWall[];
  readonly runs: Partial<Readonly<Record<DesignWall, WallRunMm>>>;
  readonly zone: RightCornerZone | undefined;
  /** The walls whose own columns carry a top row in the preset, which a fill may then continue (and no other). */
  readonly topRowWalls: ReadonlySet<DesignWall>;
  readonly probe: BodyProbe;
  readonly occurredAt: string;
}

/** Subtracts what the room cannot hold, then refills the free ends: all in one probe lease at the shell's depth. */
function adaptInTheRoom(args: {
  readonly fit: PresetRoomFit;
  readonly input: AdaptPresetInput;
  readonly shellDepthMm: number;
  readonly probe: BodyProbe;
}): FlowStep<AdaptedInTheRoom> {
  const { fit, input, shellDepthMm, probe } = args;
  const { room, occurredAt } = input;
  const catalog = buildKitchenLBodyCatalog(shellDepthMm);
  const work: RoomWork = {
    room,
    catalog,
    walls: wallsOf(room.shape),
    runs: floorRunsOf(room),
    zone: fit.rightCornerZone,
    topRowWalls: wallsCarryingATopRow(fit.design, catalog),
    probe,
    occurredAt,
  };
  const subtracted = subtractWhatTheRoomCannotHold(fit.design, work);
  if (!subtracted.ok) return subtracted;
  const refilled = refillTheFreeEnds(subtracted.value.world, work);
  if (!refilled.ok) return refilled;
  return {
    ok: true,
    value: {
      design: inTheEditorsCanonicalForm(refilled.value.world),
      changes: changesOf({
        removed: subtracted.value.removed,
        added: refilled.value.added,
        droppedCornerPieceCount: fit.droppedCornerPieceCount,
      }),
    },
  };
}

interface Subtracted {
  readonly world: PresetWorld;
  readonly removed: readonly PresetRemoval[];
}

function subtractWhatTheRoomCannotHold(
  design: Design,
  work: RoomWork,
): FlowStep<Subtracted> {
  const loaded = loadPresetWorld({ design, catalog: work.catalog });
  const lowered = afterRemovingBodies(loaded, {
    placements: bodiesAboveTheCeiling(loaded.design, work.catalog),
    cause: "ceiling",
    occurredAt: work.occurredAt,
  });
  if (!lowered.ok) return lowered;
  const shortened = afterTheFreeEndsAreShortened(lowered.world, work);
  if (!shortened.ok) return shortened;
  return {
    ok: true,
    value: {
      world: shortened.world,
      removed: [...lowered.removed, ...shortened.removed],
    },
  };
}

interface Refilled {
  readonly world: PresetWorld;
  readonly added: readonly PresetAddition[];
}

function refillTheFreeEnds(
  subtracted: PresetWorld,
  work: RoomWork,
): FlowStep<Refilled> {
  const freeEnds = freeEndsOf(subtracted, work);
  const tiles = freeEnds.flatMap((freeEnd) =>
    tilesOfFreeEnd(freeEnd, fillFloorMmOf(work.catalog)),
  );
  const tiled = withTheFreeEndsTiled({
    design: withRecordedSpaceUnderTheCeiling(subtracted.design),
    freeEnds,
    tiles,
    ...work,
  });
  const filled = afterTheTilesAreFilled(tiled, { tiles, ...work });
  return filled.ok ? { ok: true, value: filled } : filled;
}

function changesOf(input: {
  readonly removed: readonly PresetRemoval[];
  readonly added: readonly PresetAddition[];
  readonly droppedCornerPieceCount: number;
}): PresetAdaptationChanges {
  return {
    ...input,
    isUnchanged:
      input.removed.length === 0 &&
      input.added.length === 0 &&
      input.droppedCornerPieceCount === 0,
  };
}

/** Zero findings and the minimum kitchen at every declared depth (Amendment C, A3.4), the design returned at the
 *  preset's own depth. The rest of the depths are reached through the depth command and discarded. */
function holdAtEveryDepth(
  input: AdaptPresetInput,
  adapted: Design,
): FlowStep<Design> {
  const ownDepthMm = cabinetDepthMmOf(input.preset.design);
  let atOwnDepth: Design | undefined;
  for (const depthMm of declaredCabinetDepthsMm()) {
    const reached = atCabinetDepth(input, adapted, depthMm);
    if (!reached.ok) return reached;
    const reason = refusalAt(reached.value, depthMm);
    if (reason !== undefined) return { ok: false, reason };
    if (depthMm === ownDepthMm) atOwnDepth = reached.value;
  }
  return atOwnDepth === undefined
    ? atCabinetDepth(input, adapted, ownDepthMm)
    : { ok: true, value: atOwnDepth };
}

function refusalAt(
  design: Design,
  depthMm: number,
): PresetNotOfferedReason | undefined {
  const refusal = refusalOfPresetCandidate(
    design,
    buildKitchenLBodyCatalog(depthMm),
  );
  if (refusal === undefined) return undefined;
  return refusal.code === PRESET_HAS_FINDINGS
    ? { code: "PRESET_HAS_FINDINGS", depthMm, finding: refusal.finding }
    : { code: "PRESET_MINIMUM_NOT_MET", missing: refusal.missing };
}
