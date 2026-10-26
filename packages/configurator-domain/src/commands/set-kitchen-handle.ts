// The whole-kitchen handle. The input names no placements, so no cabinet's own `body.handle` can be
// written: cabinets with none follow through `resolvedHandleOf`.
//
// Its result is not a `CommandResult`: `CommandEffect` is read by the web store's `intendSelection`
// (`effect.placementId`), so the effect joins that union in the same change as the store branch.
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
 * Writes `settings.handle` and nothing else. Refuses an invalid timestamp, then a value outside
 * `HandleSchema` (`UNKNOWN_HANDLE`), returning the design as given. Availability is the caller's.
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
