import "server-only";

import { presetNameFactsOf } from "@lemnaria/configurator-domain";
import {
  isWithinPresetDesignBound,
  type StoredPreset,
} from "@lemnaria/persistence";

import {
  presetImagePath,
  type PresetSummary,
} from "@/preset/preset-summary-wire";

/** What a listing makes of the rows the repository handed back. */
export interface PresetSummaries {
  readonly summaries: readonly PresetSummary[];
  /** Snapshots left out for their size, a count and nothing more. */
  readonly oversizedCount: number;
}

/** The summaries of `presets`, in their order, minus any snapshot over `MAX_PRESET_DESIGN_BYTES`. The write refuses such
 *  a snapshot, so this is a second line for a row that got in by another way (the owner's console, an older build). */
export function summariesOf(presets: readonly StoredPreset[]): PresetSummaries {
  const summaries: PresetSummary[] = [];
  let oversizedCount = 0;
  for (const preset of presets) {
    if (isWithinPresetDesignBound(preset.design)) {
      summaries.push(presetSummaryOf(preset));
    } else {
      oversizedCount += 1;
    }
  }
  return { summaries, oversizedCount };
}

/** A stored preset as the wire has it: the repository's status-free row, its design with no `presetId`, and the
 *  address of its image. Fields are named one by one, so a field added to the row is not served until it is added here. */
function presetSummaryOf(preset: StoredPreset): PresetSummary {
  return {
    id: preset.id,
    shape: preset.shape,
    walls: preset.walls,
    heightMm: preset.heightMm,
    ...(preset.typedName === undefined ? {} : { typedName: preset.typedName }),
    nameFacts: presetNameFactsOf(preset.design),
    imageUrl: presetImagePath(preset.id),
    design: { ...preset.design, presetId: null },
  };
}
