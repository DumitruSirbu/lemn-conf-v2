// What adapting a preset to a room answers (ADR 0109 decision 3 and Amendments A3, B, E): the design the room is
// offered, with the changes the card declares, or the one reason the preset is not offered. A code and its facts,
// never a sentence (ADR 0095 decision 3). Nothing here throws to the caller: every failure is a reason.

import type { Design, DesignWall } from "../design.js";

import type {
  MinimumKitchenPart,
  PRESET_HAS_FINDINGS,
  PRESET_MINIMUM_NOT_MET,
  PresetFindingCode,
} from "./preset-candidate.js";

/** Why a body the preset held is gone: its column passed the shorter wall's free end (A3.1), or it rose above the
 *  lower ceiling (Amendment B). */
export type PresetRemovalCause = "free-end" | "ceiling";

export interface PresetRemoval {
  readonly wall: DesignWall;
  readonly buildId: string;
  readonly widthMm: number;
  readonly cause: PresetRemovalCause;
}

/** A body the refill placed at a free end (A3.2, ADR 0167): one per level the filled column carries. */
export interface PresetAddition {
  readonly wall: DesignWall;
  readonly buildId: string;
  readonly widthMm: number;
  readonly y0Mm: number;
}

/** What the card declares (A3.3): never silent (`ARCHITECTURE_PROPOSAL.md` section 4.4). */
export interface PresetAdaptationChanges {
  readonly removed: readonly PresetRemoval[];
  readonly added: readonly PresetAddition[];
  /** Corner pieces the lower ceiling does not admit, not instantiated rather than removed (Amendment B). */
  readonly droppedCornerPieceCount: number;
  /** Nothing removed, nothing added and no corner piece dropped: the room is the preset's own. */
  readonly isUnchanged: boolean;
}

/** A body the kitchen must keep, which a shorter wall would have taken (A3.1). */
export type KeptBody = "sink" | "hob" | "structural";

export type PresetNotOfferedReason =
  /** The shape differs or a wall is beyond `PRESET_WINDOW_MM` (A2). */
  | { readonly code: "NOT_IN_WINDOW" }
  | { readonly code: "BODY_NOT_IN_CATALOGUE"; readonly buildId: string }
  /** The corner assembly would be sized, or composed, differently in the room (E4); nothing is narrowed (A5). */
  | { readonly code: "CORNER_SIZED_DIFFERENTLY" }
  | { readonly code: "FREE_END_HOLDS_A_KEPT_BODY"; readonly kept: KeptBody }
  /** A command the adaptation needs was refused: the preset is not offered rather than half adapted. */
  | {
      readonly code: "COMMAND_REFUSED";
      readonly command: "remove" | "insert" | "depth";
      readonly refusalCode: string;
    }
  | {
      readonly code: typeof PRESET_HAS_FINDINGS;
      readonly depthMm: number;
      readonly finding: PresetFindingCode;
    }
  | {
      readonly code: typeof PRESET_MINIMUM_NOT_MET;
      readonly missing: readonly MinimumKitchenPart[];
    }
  /** Something the adaptation did not foresee threw. Fail closed; the count of these is a defect count. */
  | { readonly code: "ADAPTATION_FAILED" };

export type PresetAdaptation =
  | {
      readonly ok: true;
      /** The design `Select` writes (ADR 0109 decision 4), at the preset's own cabinet depth. */
      readonly design: Design;
      readonly changes: PresetAdaptationChanges;
    }
  | { readonly ok: false; readonly reason: PresetNotOfferedReason };

export function notOffered(reason: PresetNotOfferedReason): PresetAdaptation {
  return { ok: false, reason };
}
