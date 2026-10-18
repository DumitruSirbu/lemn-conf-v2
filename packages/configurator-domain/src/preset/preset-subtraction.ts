// What adaptation subtracts, and only that (ADR 0117 decision 6: the preset's refinement survives except what
// adaptation must remove). Two kinds, both through `removePlacement`:
//
// - the bodies above a lower ceiling (Amendment B), the corner pieces aside, which are not instantiated instead;
// - the whole columns whose far edge passes the shorter wall's free end (A3.1), taken from that end, never a corner
//   piece, the sink or the hob. If a column that must go holds one of those, the preset is not offered.
//
// A column is removed whole: a half-removed column would leave a body standing in a wall it no longer reaches.

import { declaresASink, type BodyCatalog } from "../void-engine.js";
import { HOB_ACCESSORY_KIND } from "../catalog.js";
import type { DesignPlacement, DesignWall } from "../design.js";

import { occupiedSpansOn } from "./free-end-spans.js";
import type {
  KeptBody,
  PresetNotOfferedReason,
  PresetRemoval,
  PresetRemovalCause,
} from "./preset-adaptation-result.js";
import type { RightCornerZone } from "./preset-room-fit.js";
import { afterRemoving, type PresetWorld } from "./preset-world.js";
import type { WallRunMm } from "./target-shell.js";

export type SubtractionStep =
  | {
      readonly ok: true;
      readonly world: PresetWorld;
      readonly removed: readonly PresetRemoval[];
    }
  | { readonly ok: false; readonly reason: PresetNotOfferedReason };

interface SubtractionContext {
  readonly occurredAt: string;
}

/** The world without `placements`, each recorded as removed for `cause`. */
export function afterRemovingBodies(
  world: PresetWorld,
  input: {
    readonly placements: readonly DesignPlacement[];
    readonly cause: PresetRemovalCause;
  } & SubtractionContext,
): SubtractionStep {
  let current = world;
  const removed: PresetRemoval[] = [];
  for (const placement of input.placements) {
    const kept = keptBodyOf(current.catalog, placement);
    if (kept !== undefined) {
      return refusal({ code: "FREE_END_HOLDS_A_KEPT_BODY", kept });
    }
    const step = afterRemoving(current, {
      placementId: placement.id,
      occurredAt: input.occurredAt,
    });
    if (!step.ok) return commandRefused(step.refusalCode);
    current = step.world;
    removed.push(removalOf(placement, input.cause));
  }
  return { ok: true, world: current, removed };
}

/** Every wall's columns past its run's end, removed whole. */
export function afterTheFreeEndsAreShortened(
  world: PresetWorld,
  input: {
    readonly walls: readonly DesignWall[];
    readonly runs: Partial<Readonly<Record<DesignWall, WallRunMm>>>;
    readonly zone: RightCornerZone | undefined;
  } & SubtractionContext,
): SubtractionStep {
  let current = world;
  const removed: PresetRemoval[] = [];
  for (const wall of input.walls) {
    const run = input.runs[wall];
    if (run === undefined) continue;
    const step = afterRemovingBodies(current, {
      placements: placementsPastTheRunEnd(current, {
        wall,
        run,
        zone: input.zone,
      }),
      cause: "free-end",
      occurredAt: input.occurredAt,
    });
    if (!step.ok) return step;
    current = step.world;
    removed.push(...step.removed);
  }
  return { ok: true, world: current, removed };
}

function placementsPastTheRunEnd(
  world: PresetWorld,
  input: {
    readonly wall: DesignWall;
    readonly run: WallRunMm;
    readonly zone: RightCornerZone | undefined;
  },
): readonly DesignPlacement[] {
  const memberIds = new Set(
    occupiedSpansOn(world, input)
      .filter((span) => span.endMm > input.run.endMm)
      .flatMap((span) => span.memberIds),
  );
  return world.design.placements.filter((placement) =>
    memberIds.has(placement.id),
  );
}

/** The kind of body the kitchen must keep that `placement` is, or nothing when it may go. */
function keptBodyOf(
  catalog: BodyCatalog,
  placement: DesignPlacement,
): KeptBody | undefined {
  const definition = catalog.get(placement.body.buildId);
  if (definition?.structuralReason !== undefined) return "structural";
  if (declaresASink(definition)) return "sink";
  if (definition?.carriesAccessoryKind === HOB_ACCESSORY_KIND) return "hob";
  return undefined;
}

function removalOf(
  placement: DesignPlacement,
  cause: PresetRemovalCause,
): PresetRemoval {
  return {
    wall: placement.wall,
    buildId: placement.body.buildId,
    widthMm: placement.body.widthMm,
    cause,
  };
}

function refusal(reason: PresetNotOfferedReason): SubtractionStep {
  return { ok: false, reason };
}

function commandRefused(refusalCode: string): SubtractionStep {
  return refusal({ code: "COMMAND_REFUSED", command: "remove", refusalCode });
}
