// The envelope every command returns.
//
// The failure branch returns the **exact original `Design` object** (identity, not a structural copy),
// so a store applying a result unconditionally cannot replace state with an equal but different object.
import type {
  Design,
  DesignPlacement,
  DesignSettings,
  DesignWall,
  Handle,
} from "../design.js";
import type { Finish } from "../materials.js";
import { ConfigurationTimestampSchema } from "../schemas.js";
import type { Column } from "../void-engine.js";
import type { RejectionDetail, RejectionReason } from "./rejection.js";

/** What a command was pointed at. Named for commands rather than for picking, so the domain and
 *  the adapter's `Selection` never collide in a file that imports both. */
export interface CommandTarget {
  readonly kind: "placement" | "void";
  readonly id: string;
}

/** Where a removed body stood, so the caller can find the void covering it *by geometry*: void ids are
 *  regenerated on every recompute (§5.1). `wall` and `alongM` are not redundant with `col`: ADR 0046
 *  part 2's merge deletes the keys it folds together, so a delete that makes two empty columns adjacent
 *  leaves no void under the removed body's key. The key is the primary match; these two are the
 *  fallback. */
export interface VacatedOpening {
  readonly col: string;
  readonly y0: number;
  readonly wall: DesignWall;
  /** The removed body's own along-wall centre, in metres. */
  readonly alongM: number;
}

export interface PlacementRemovedEffect {
  readonly type: "placement_removed";
  readonly placementId: string;
  readonly vacated: VacatedOpening;
}

export interface BodyInsertedEffect {
  readonly type: "body_inserted";
  readonly placementId: string;
  readonly buildId: string;
  /** Present when this insert was a swap in place (§5.3) — one code path, two entry points. */
  readonly replacedPlacementId?: string;
  /** ADR 0046: an insert is the second command that writes the frozen map. A body narrower than its
   *  column splits it, and which keys may change is a rule about the command, never something a store
   *  re-derives globally (ADR 0011 Gap D). Always present, even when nothing was split, so the store
   *  has one thing to apply. */
  readonly columns: ReadonlyMap<string, Column>;
}

/** ADR 0031's resize: the one operation that changes bodies the customer did not select, and moves a
 *  body horizontally. A column's key is derived from a body's centre (§3.2), so a resize moves every
 *  member out of the key that held them. The updated map is published here, not recomputed by the
 *  store: the rule for which keys may change belongs to the command, and a global recompute would make
 *  §10's delete produce no openings (ADR 0011 Gap D). */
export interface BodyResizedEffect {
  readonly type: "body_resized";
  /** The body the customer selected. Its whole column moved with it (ADR 0031 rule 1). */
  readonly placementId: string;
  readonly buildId: string;
  readonly widthMm: number;
  /** Every placement in the resized column, `placementId` included — what the scene has to rebuild
   *  and what §11 row 12's appearance guarantee now covers. */
  readonly columnPlacementIds: readonly string[];
  /** The empty column that funded the move (ADR 0031 rule 2), as **the key it had before the move**.
   *  `columns` no longer holds it: the column moved, so its key moved with it. */
  readonly emptyColumnKey: string;
  /** **The key that same column holds afterwards**, which is the one to look up in `columns`.
   *  Absent when `emptyColumnWidthMm` is `0` — the resize consumed the space exactly and the column
   *  ceased to exist (rule 6). */
  readonly emptyColumnNewKey?: string;
  /** The width the empty column was left at; `0` means it was consumed exactly. Under ADR 0052 this is
   *  the **near** column when a shrink frees more than `MAX_EMPTY_COLUMN_WIDTH_MM` and the space
   *  splits: the piece against the run, which the next resize on this side funds from. The pieces
   *  beyond it are in `columns` only, since a field naming one the next tap cannot spend would be read
   *  as spendable. */
  readonly emptyColumnWidthMm: number;
  readonly columns: ReadonlyMap<string, Column>;
}

export interface FinishSetEffect {
  readonly type: "finish_set";
  readonly placementId: string;
  readonly finish: Finish;
}

/** ADR 0099 decision 8: this cabinet has stopped choosing and follows the kitchen. It carries no
 *  finish: a "cleared to X" effect would be a set under another name, leaving the key in the document. */
export interface FinishClearedEffect {
  readonly type: "finish_cleared";
  readonly placementId: string;
}

export interface HandleSetEffect {
  readonly type: "handle_set";
  readonly placementId: string;
  readonly handle: Handle;
}

/** The whole-kitchen pair, shaped on `FinishSetEffect` one scope up. Neither names a placement: a
 *  whole-kitchen setting points at no cabinet, which tells the store its selection was not moved. */
export interface MaterialTierSetEffect {
  readonly type: "material_tier_set";
  readonly materialTierId: string;
  /** How many cabinets ADR 0057's reset moved to the new material's default finish. The reset runs
   *  once and produces one result, never a per-cabinet cascade, so one result carrying *N* is what a
   *  test can measure a cascade against (cf. `CabinetDepthSetEffect.rebuiltCount`). Not rendered: a
   *  numeral in `ro.globalSettings` is refused by `starting-price.adversarial.test.ts`'s digit sweep. */
  readonly resolvedFinishCount: number;
}

/** The count of bodies actually rebuilt: a surface announcing that every cabinet moved needs the
 *  number, and a caller receiving 0 has a no-op it should not announce. */
export interface CabinetDepthSetEffect {
  readonly type: "cabinet_depth_set";
  readonly cabinetDepthMm: number;
  readonly rebuiltCount: number;
  /** ADR 0090 decisions 1 and 5: a depth change slides frozen extents along the wall (a deeper corner
   *  moves wall B's whole run), and `Design.emptyColumns` and `Design.columnExtents` record where a
   *  column stands, so carried forward unchanged they describe coordinates the command just vacated.
   *  Published here because the answer needs the pre-command design, the catalogue at the depth being
   *  left and the shift, which `setCabinetDepth` holds and the store does not
   *  (`frozen-map-at-cabinet-depth.ts`). */
  readonly columns: ReadonlyMap<string, Column>;
}

export interface HardwareTierSetEffect {
  readonly type: "hardware_tier_set";
  readonly hardwareTierId: string;
}

/** The whole-kitchen colour (ADR 0099). It carries no count and no placement id on purpose:
 *  `MaterialTierSetEffect.resolvedFinishCount` exists because ADR 0057's reset moves cabinets, and this
 *  command moves none. */
export interface GlobalFinishSetEffect {
  readonly type: "global_finish_set";
  readonly finish: Finish;
}

export type CommandEffect =
  | PlacementRemovedEffect
  | BodyInsertedEffect
  | BodyResizedEffect
  | FinishSetEffect
  | FinishClearedEffect
  | HandleSetEffect
  | MaterialTierSetEffect
  | HardwareTierSetEffect
  | GlobalFinishSetEffect
  | CabinetDepthSetEffect;

export interface CommandSuccess<TEffect extends CommandEffect = CommandEffect> {
  readonly ok: true;
  readonly design: Design;
  readonly effect: TEffect;
}

export interface CommandRejection {
  readonly ok: false;
  readonly design: Design;
  readonly reason: RejectionReason;
}

export type CommandResult<TEffect extends CommandEffect = CommandEffect> =
  | CommandSuccess<TEffect>
  | CommandRejection;

/** Builds the refusal branch. `design` is passed through untouched — the same object, so the
 *  caller's `===` check is the contract and not a coincidence. */
export function refuse(
  design: Design,
  detail: RejectionDetail,
): CommandRejection {
  return {
    ok: false,
    design,
    reason: detail,
  };
}

export function succeedWith<TEffect extends CommandEffect>(
  design: Design,
  effect: TEffect,
): CommandSuccess<TEffect> {
  return { ok: true, design, effect };
}

/** The one place a command writes a new `Design`. The domain reads no clock: `occurredAt` is the
 *  caller's, it reaches `updatedAt` only here — that is, only on success — and `createdAt` is never
 *  touched. */
export function withPlacements(
  design: Design,
  placements: readonly DesignPlacement[],
  occurredAt: string,
): Design {
  return { ...design, placements: [...placements], updatedAt: occurredAt };
}

/** `withPlacements`' whole-kitchen half: the settings container replaced, `updatedAt` moved to the
 *  caller's `occurredAt` the same way, and nothing else on the document touched. */
export function withSettings(
  design: Design,
  settings: DesignSettings,
  occurredAt: string,
): Design {
  return { ...design, settings, updatedAt: occurredAt };
}

/** Rejects a timestamp the domain would otherwise write verbatim into `updatedAt`. */
export function isValidOccurredAt(occurredAt: string): boolean {
  return ConfigurationTimestampSchema.safeParse(occurredAt).success;
}
