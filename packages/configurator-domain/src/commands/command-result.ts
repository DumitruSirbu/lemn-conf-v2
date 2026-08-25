// The envelope every command returns (M3 work item 2; `CONFIGURATION_MODEL.md` "Commands and
// queries", the shape that survived the 2026-08-24 supersession).
//
// The failure branch returns the **exact original `Design` object** — identity, not a structural
// copy — so a store applying a result unconditionally cannot silently replace state with an equal
// but different object, and a rejection sweep can assert `toBe`.
import type { Design, DesignPlacement, Finish, Handle } from "../design.js";
import { ConfigurationTimestampSchema } from "../schemas.js";
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
 *  ids are regenerated on every recompute and a merge changes them (§5.1). */
export interface VacatedOpening {
  readonly col: string;
  readonly y0: number;
}

export interface PlacementRemovedEffect {
  readonly type: "placement_removed";
  readonly placementId: string;
  /** §3.1 / ADR 0011 Gap E: accessories the removed body carried, deleted in the same command. */
  readonly cascadedAccessoryIds: readonly string[];
  readonly vacated: VacatedOpening;
}

export interface BodyInsertedEffect {
  readonly type: "body_inserted";
  readonly placementId: string;
  readonly buildId: string;
  /** Present when this insert was a swap in place (§5.3) — one code path, two entry points. */
  readonly replacedPlacementId?: string;
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
