// Whether a stored kitchen may be kept as a preset (ADR 0112 decision 4, plan M8C section 3.3), and the room it was
// saved in. I/O-free: the catalogue is handed in, and nothing here reads a request, a store or a clock.

import { HOB_ACCESSORY_KIND } from "../catalog.js";
import type { Design, DesignRoomShape } from "../design.js";
import { findOverflowingPlacementIds } from "../queries/overflowing-placements.js";
import {
  validateDesignForCatalog,
  type DesignValidationCode,
} from "../validate-design.js";
import {
  declaresASink,
  type BodyCatalog,
  type BodyDefinition,
} from "../void-engine.js";

/** The refusal codes a save answers with; the dialog maps each to a message of its own (ADR 0095 decision 3). */
export const PRESET_HAS_FINDINGS = "PRESET_HAS_FINDINGS";
export const PRESET_MINIMUM_NOT_MET = "PRESET_MINIMUM_NOT_MET";

/** What a kitchen must hold to be a kitchen (owner, 2026-09-11): a sink and a hob. */
export type MinimumKitchenPart = "sink" | "hob";

/** A body past the end of its wall: the review's own word for it (`judgeSubmissionEligibility`). */
export const BODIES_PAST_WALL_FINDING = "BODIES_PAST_WALL";

export type PresetFindingCode =
  | DesignValidationCode
  | typeof BODIES_PAST_WALL_FINDING;

export type PresetRefusal =
  | {
      readonly code: typeof PRESET_HAS_FINDINGS;
      /** The first finding, validation's before the wall's: a stable code and never a value of the document. */
      readonly finding: PresetFindingCode;
    }
  | {
      readonly code: typeof PRESET_MINIMUM_NOT_MET;
      readonly missing: readonly MinimumKitchenPart[];
    };

/**
 * The room a preset is saved in, in the form the `presets` columns copy it: wall A is the room's width, wall B its
 * depth (a straight room has none, its `depthMm` being the drawn floor's and no wall), wall C a U's `wallCMm`. A key
 * the shape does not have is absent and never `undefined`.
 */
export interface PresetRoom {
  readonly shape: DesignRoomShape;
  readonly walls: {
    readonly aMm: number;
    readonly bMm?: number;
    readonly cMm?: number;
  };
  readonly heightMm: number;
}

export function presetRoomOf(design: Pick<Design, "room">): PresetRoom {
  const { room } = design;
  const walls: { aMm: number; bMm?: number; cMm?: number } = {
    aMm: room.widthMm,
  };
  if (room.shape !== "linear") walls.bMm = room.depthMm;
  if (room.shape === "U" && room.wallCMm !== undefined) {
    walls.cMm = room.wallCMm;
  }
  return { shape: room.shape, walls, heightMm: room.heightMm };
}

/**
 * Why this stored design may not be a preset, or nothing when it may. A kitchen the product would propose has zero
 * validation findings of either severity in its own room (the marks included, which is where it differs from the load
 * seam) and no body past its wall, and holds a sink and a hob. Both are read off the catalogue's declarations, never a
 * build-id list (ADR 0121).
 *
 * The first rule that fails answers, findings before the minimum: a design with findings is not worth telling it
 * lacks a hob.
 */
export function refusalOfPresetCandidate(
  design: Design,
  catalog: BodyCatalog,
): PresetRefusal | undefined {
  const finding = firstFindingOf(design, catalog);
  if (finding !== undefined) return { code: PRESET_HAS_FINDINGS, finding };
  const missing = missingKitchenPartsOf(design, catalog);
  if (missing.length > 0) return { code: PRESET_MINIMUM_NOT_MET, missing };
  return undefined;
}

function firstFindingOf(
  design: Design,
  catalog: BodyCatalog,
): PresetFindingCode | undefined {
  const [firstValidationIssue] = validateDesignForCatalog(design, catalog);
  if (firstValidationIssue !== undefined) return firstValidationIssue.code;
  return findOverflowingPlacementIds(design).length > 0
    ? BODIES_PAST_WALL_FINDING
    : undefined;
}

function missingKitchenPartsOf(
  design: Design,
  catalog: BodyCatalog,
): readonly MinimumKitchenPart[] {
  const definitions = design.placements.map((placement) =>
    catalog.get(placement.body.buildId),
  );
  const missing: MinimumKitchenPart[] = [];
  if (!definitions.some(declaresASink)) missing.push("sink");
  if (!definitions.some(declaresAHob)) missing.push("hob");
  return missing;
}

function declaresAHob(definition: BodyDefinition | undefined): boolean {
  return definition?.carriesAccessoryKind === HOB_ACCESSORY_KIND;
}
