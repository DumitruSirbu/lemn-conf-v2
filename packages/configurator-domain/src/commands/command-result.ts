// The envelope every command returns (M3 work item 2; `CONFIGURATION_MODEL.md` "Commands and
// queries", the shape that survived the 2026-08-24 supersession).
//
// The failure branch returns the **exact original `Design` object** — identity, not a structural
// copy — so a store applying a result unconditionally cannot silently replace state with an equal
// but different object, and a rejection sweep can assert `toBe`.
import type {
  Design,
  DesignPlacement,
  DesignWall,
  Finish,
  Handle,
} from "../design.js";
import { ConfigurationTimestampSchema } from "../schemas.js";
import type { Column } from "../void-engine.js";
import {
  renderRejection,
  type RejectionDetail,
  type RejectionReason,
} from "./rejection.js";

/** What a command was pointed at. Named for commands rather than for picking, so the domain and
 *  the adapter's `Selection` never collide in a file that imports both. */
export interface CommandTarget {
  readonly kind: "placement" | "void";
  readonly id: string;
}

/** Where a removed body stood, so the caller can find the void that covers it *by geometry* — void
 *  ids are regenerated on every recompute and a merge changes them (§5.1).
 *
 *  **The wall and the along-wall centre are part of it, and they are not redundant with `col`.**
 *  ADR 0046 part 2's merge deletes the keys it folds together and writes a new one, so a delete that
 *  makes two empty columns adjacent leaves *no* void carrying the key the removed body was filed
 *  under — and §5.1's selection came back `null` where the customer expected the space they just
 *  freed. The key is still the primary match; these two are what the fallback measures against. */
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
  /** ADR 0046: an insert is the **second** command that writes the frozen map. A body narrower than
   *  the column it goes into splits that column in two, so the keys the map holds change — and
   *  *which* keys may change is a rule about the command, never something a store may re-derive
   *  globally (ADR 0011 Gap D, and `BodyResizedEffect` below for what re-deriving costs).
   *
   *  Always present, including when nothing was split: an insert that fills its column exactly
   *  publishes the map it was given, so the store has one thing to apply rather than two. */
  readonly columns: ReadonlyMap<string, Column>;
}

/** ADR 0031's resize: the one operation that changes bodies the customer did not select, and the
 *  one that moves a body horizontally.
 *
 *  It is therefore the only effect carrying `columns`. A column's key is derived from a body's
 *  centre (§3.2), so a resize moves every member of a column out of the key that held them; every
 *  other command leaves the frozen extents alone and the store passes its own map through (ADR 0011
 *  Gap D). The updated map is published here rather than recomputed by the store because the rule
 *  for *which* keys may change belongs to the command that moved them — a store that recomputed
 *  globally would make §10's delete produce no openings at all, which is Gap D verbatim. */
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
  /** The width the empty column was left at. `0` means it was consumed exactly. */
  readonly emptyColumnWidthMm: number;
  readonly columns: ReadonlyMap<string, Column>;
}

export interface FinishSetEffect {
  readonly type: "finish_set";
  readonly placementId: string;
  readonly finish: Finish;
}

export interface HandleSetEffect {
  readonly type: "handle_set";
  readonly placementId: string;
  readonly handle: Handle;
}

export type CommandEffect =
  | PlacementRemovedEffect
  | BodyInsertedEffect
  | BodyResizedEffect
  | FinishSetEffect
  | HandleSetEffect;

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
    reason: { ...detail, message: renderRejection(detail) },
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

/** Rejects a timestamp the domain would otherwise write verbatim into `updatedAt`. */
export function isValidOccurredAt(occurredAt: string): boolean {
  return ConfigurationTimestampSchema.safeParse(occurredAt).success;
}
