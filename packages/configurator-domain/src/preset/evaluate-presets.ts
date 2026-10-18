// The list Step 1 shows for a room (ADR 0109 decision 4 and Amendment A4, plan M8C section 3.5): the presets in the
// room's window, each adapted once, the ones that cannot be offered left out, and the rest in the owner's order. The
// card, the preview and `Select` all read the one evaluation each offer carries, so none of them can disagree.

import type { BodyProbeFactory } from "../body-probe.js";
import type { Design, DesignRoom } from "../design.js";

import { adaptPresetToRoom, type AdaptablePreset } from "./adapt-preset.js";
import { matchPresets } from "./match-presets.js";
import type { PresetAdaptationChanges } from "./preset-adaptation-result.js";
import { presetRoomOf } from "./preset-candidate.js";

/** A preset the room is offered, with the design `Select` writes and what the card declares. */
export interface PresetOffer<Preset extends AdaptablePreset> {
  readonly preset: Preset;
  readonly design: Design;
  readonly changes: PresetAdaptationChanges;
}

/** The offers for `room`, in `presets`' order (newest first) refined by `orderPresetOffers`. A room that cannot be
 *  read offers nothing: Step 1 goes on to composition (plan M8C section 3.5, fail open). */
export function evaluatePresetOffers<Preset extends AdaptablePreset>(input: {
  readonly room: DesignRoom;
  readonly presets: readonly Preset[];
  readonly occurredAt: string;
  readonly probeAt: BodyProbeFactory;
}): readonly PresetOffer<Preset>[] {
  try {
    return offersFor(input);
  } catch {
    return [];
  }
}

function offersFor<Preset extends AdaptablePreset>(input: {
  readonly room: DesignRoom;
  readonly presets: readonly Preset[];
  readonly occurredAt: string;
  readonly probeAt: BodyProbeFactory;
}): readonly PresetOffer<Preset>[] {
  const { room, occurredAt, probeAt } = input;
  const offers = matchPresets(presetRoomOf({ room }), input.presets).flatMap(
    (preset): PresetOffer<Preset>[] => {
      const adaptation = adaptPresetToRoom({
        preset,
        room,
        occurredAt,
        probeAt,
      });
      return adaptation.ok
        ? [{ preset, design: adaptation.design, changes: adaptation.changes }]
        : [];
    },
  );
  return orderPresetOffers(offers);
}

/** ADR 0109 Amendment A4: the presets needing no change first, then those with fewer cabinets removed (a dropped
 *  ceiling row is a removal, since the card declares it as one), then the order the offers came in, which is newest
 *  first. A stable sort keeps that last rule. There is no score and no distance (ADR 0067). */
export function orderPresetOffers<Preset extends AdaptablePreset>(
  offers: readonly PresetOffer<Preset>[],
): readonly PresetOffer<Preset>[] {
  return [...offers].sort(
    (first, second) =>
      Number(second.changes.isUnchanged) - Number(first.changes.isUnchanged) ||
      first.changes.removed.length - second.changes.removed.length,
  );
}
