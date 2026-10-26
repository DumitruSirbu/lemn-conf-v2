// The handle a cabinet wears: its own, else the kitchen's, else the slot's default. It resolves and never
// writes: a resolved value stored on a body would stop it following the kitchen (see `built-body.ts`).
// The top row never follows the kitchen. Lane H rulings: docs/milestones/M10-price-dashboard.md.
import type { DesignSettings, Handle } from "../design.js";

export const DEFAULT_HANDLE: Handle = "steel";

export const TOP_ROW_HANDLE: Handle = "push";

/** The whole-kitchen settings the handle readers take, as an object so a new key reaches them unchanged. */
export type KitchenHandleSettings = Pick<DesignSettings, "handle">;

export interface HandleResolutionQuery {
  readonly ownHandle: Handle | undefined;
  readonly kitchenSettings: KitchenHandleSettings;
  readonly canHandle: boolean;
  /** Decided by the caller from its own floor: the module line lives in `push-to-open.ts` and `bands.ts`. */
  readonly isTopRow: boolean;
}

/** `undefined` when the body's definition takes no handle, whatever the kitchen says. */
export function resolvedHandleOf(
  query: HandleResolutionQuery,
): Handle | undefined {
  if (!takesAHandle(query.canHandle)) return undefined;
  // `!== undefined`, not `??`: a `null` from an untyped route has always counted as a recorded mode.
  if (query.ownHandle !== undefined) return query.ownHandle;
  return followedHandleOf(query);
}

/** What the panel marks when the cabinet has chosen nothing; a body that takes no handle gets the slot's. */
export function defaultHandleOf(
  query: Omit<HandleResolutionQuery, "ownHandle">,
): Handle {
  return followedHandleOf({
    ...query,
    kitchenSettings: takesAHandle(query.canHandle) ? query.kitchenSettings : {},
  });
}

function followedHandleOf(
  query: Pick<HandleResolutionQuery, "kitchenSettings" | "isTopRow">,
): Handle {
  if (query.isTopRow) return TOP_ROW_HANDLE;
  return query.kitchenSettings.handle ?? DEFAULT_HANDLE;
}

// Compared against `true` after an `unknown` read: the catalogue is a supplied port, and a truthy
// non-boolean must not pass here when `hardware-mechanisms.ts` refuses it.
function takesAHandle(canHandle: boolean): boolean {
  const declaresHandleCapability: unknown = canHandle;
  return declaresHandleCapability === true;
}
