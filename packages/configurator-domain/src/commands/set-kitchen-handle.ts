// The whole-kitchen handle. The input names no placements, so no cabinet's own `body.handle` can be
// written: cabinets with none follow through `resolvedHandleOf`.
import {
  HandleSchema,
  type Design,
  type DesignSettings,
  type Handle,
} from "../design.js";

import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withSettings,
  type CommandResult,
  type KitchenHandleSetEffect,
} from "./command-result.js";

export interface KitchenHandleInput {
  readonly design: Design;
  readonly handle: Handle;
  readonly occurredAt: string;
}

export type KitchenHandleResult = CommandResult<KitchenHandleSetEffect>;

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
  return succeedWith(withSettings(input.design, settings, input.occurredAt), {
    type: "kitchen_handle_set",
    handle: input.handle,
  });
}
