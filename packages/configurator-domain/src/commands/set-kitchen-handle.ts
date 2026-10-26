// The whole-kitchen handle as a command (M10 wave H1, backlog 278): one choice that every cabinet with no
// handle of its own follows, as `setGlobalFinish` does for colour.
//
// The input names a design and a handle and deliberately not the placements, so no implementation can
// reach `placement.body.handle`: a cabinet that chose its own handle keeps it, and one that chose nothing
// follows because `resolvedHandleOf` reads `settings.handle` for it, so the document grows no `handle` key
// on any body (the owner's "do not overwrite a cabinet's own choice" as a shape, ADR 0099 decision 2).
//
// Its result is not a `CommandResult`: `CommandEffect`, the union that type is bounded by, is closed over
// the store's `intendSelection`, whose last branch reads `effect.placementId`. A new member would break
// that read in `apps/web`, which this wave does not own, so the effect is defined here and the wave that
// wires the store (Q2) adds it to the union beside `GlobalFinishSetEffect` in the same change.
import {
  HandleSchema,
  type Design,
  type DesignSettings,
  type Handle,
} from "../design.js";

import {
  isValidOccurredAt,
  refuse,
  withSettings,
  type CommandRejection,
} from "./command-result.js";

export interface KitchenHandleInput {
  readonly design: Design;
  readonly handle: Handle;
  readonly occurredAt: string;
}

/** The whole-kitchen handle. Like `GlobalFinishSetEffect` it carries no placement and no count: this
 *  command moves no cabinet. */
export interface KitchenHandleSetEffect {
  readonly type: "kitchen_handle_set";
  readonly handle: Handle;
}

export interface KitchenHandleSetSuccess {
  readonly ok: true;
  readonly design: Design;
  readonly effect: KitchenHandleSetEffect;
}

export type KitchenHandleResult = KitchenHandleSetSuccess | CommandRejection;

/**
 * Writes exactly one field, `settings.handle`, and touches no cabinet. Setting the handle already set is
 * not a refusal, as in `setGlobalFinish`.
 *
 * It judges its own input (M10 ruling H-4): a value outside `HandleSchema` is refused with
 * `UNKNOWN_HANDLE` and the design is returned as given, because the type is no guard against a caller
 * outside TypeScript and a stored `"gold"` would make the document unreadable at the load seam. The
 * guards run in `findRefusal`'s order: the timestamp, then the value.
 *
 * Whether the manufacturer has withdrawn a valid handle is not asked here (ADR 0178 A-16): the domain
 * imports no book and no availability list (ADR 0062 seam 1); the caller offers only active handles.
 */
export function setKitchenHandle(
  input: KitchenHandleInput,
): KitchenHandleResult {
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(input.design, { code: "INVALID_OCCURRED_AT", params: {} });
  }
  if (!HandleSchema.safeParse(input.handle).success) {
    return refuse(input.design, { code: "UNKNOWN_HANDLE", params: {} });
  }
  const settings: DesignSettings = {
    ...input.design.settings,
    handle: input.handle,
  };
  return {
    ok: true,
    design: withSettings(input.design, settings, input.occurredAt),
    effect: { type: "kitchen_handle_set", handle: input.handle },
  };
}
