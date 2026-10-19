import { migrateDesign } from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";

import { showablePresetName } from "./preset-name.js";
import type {
  PresetShape,
  PresetThumbnailType,
  PresetWalls,
  StoredPreset,
} from "./preset-repository.js";

/** What a stored row holds of a preset, before its document is read. */
export interface PresetFields {
  readonly id: string;
  readonly shape: PresetShape;
  readonly walls: PresetWalls;
  readonly heightMm: number;
  readonly schemaVersion: number;
  readonly document: unknown;
  readonly typedName: string | null | undefined;
  readonly thumbnailType: PresetThumbnailType;
}

/**
 * The preset a row stands for, or `undefined` when this build cannot read its document: `migrateDesign` refused it. A
 * row nobody can open must not fail the Step 1 listing of every room near it, so the failure is dropped here and
 * nothing of it is kept: not the error, whose message may carry document content, and not the document. The caller
 * counts the `undefined`. A typed name that fails the name rule is shown as no name (the generated one), never thrown
 * for. Shared by both repositories.
 */
export function readablePresetOf(
  fields: PresetFields,
): StoredPreset | undefined {
  const design = migratedDesignOf(fields);
  if (design === undefined) return undefined;
  const typedName = showablePresetName(fields.typedName);
  return {
    id: fields.id,
    shape: fields.shape,
    walls: { ...fields.walls },
    heightMm: fields.heightMm,
    ...(typedName === undefined ? {} : { typedName }),
    thumbnailType: fields.thumbnailType,
    design,
  };
}

function migratedDesignOf({
  schemaVersion,
  document,
}: PresetFields): Design | undefined {
  try {
    return migrateDesign(schemaVersion, document);
  } catch {
    return undefined;
  }
}
