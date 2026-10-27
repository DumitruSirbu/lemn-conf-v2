// The handle a cabinet wears: its own, else the kitchen's, else the slot's default. It resolves and never
// writes: a resolved value stored on a body would stop it following the kitchen (see `built-body.ts`).
// The top row never follows the kitchen's `handle`; it follows the kitchen's `topRowHandle`, else `TOP_ROW_HANDLE`.
// Lane H rulings: docs/milestones/M10-price-dashboard.md.
import type { DesignSettings, Handle } from "../design.js";
import { pickDefined } from "../pick-defined.js";

export const DEFAULT_HANDLE: Handle = "steel";

export const TOP_ROW_HANDLE: Handle = "push";

/** The whole-kitchen settings the handle readers take, as one object rather than a lone value. */
export type KitchenHandleSettings = Pick<
  DesignSettings,
  "handle" | "topRowHandle"
>;

/** The kitchen's handle settings as the readers take them, built here so the price, the scene and the panel read one
 *  object and never a hand-copied pair. */
export function kitchenHandleSettingsOf(
  settings: DesignSettings | undefined,
): KitchenHandleSettings {
  return pickDefined(settings, ["handle", "topRowHandle"]);
}

/** A legacy `null` own handle is no choice: absent. Applied where a document becomes a record or a display entry, so
 *  no reader meets it and the resolver's return type stays `Handle | undefined`. */
export function ownHandleOf(recorded: Handle | undefined): Handle | undefined {
  const stored: unknown = recorded;
  return stored === null ? undefined : recorded;
}

export interface HandleResolutionQuery {
  readonly ownHandle: Handle | undefined;
  readonly kitchenSettings: KitchenHandleSettings;
  readonly canHandle: boolean;
  /** Decided by the caller from `isTopRowFloorMm` (`push-to-open.ts`), the one derivation of the module line. */
  readonly isTopRow: boolean;
}

/** `undefined` when the body's definition takes no handle, whatever the kitchen says. */
export function resolvedHandleOf(
  query: HandleResolutionQuery,
): Handle | undefined {
  if (!takesAHandle(query.canHandle)) return undefined;
  // `!== undefined`, not `??`. Builders turn a legacy `null` into absence (`ownHandleOf`) before it gets here.
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
  if (query.isTopRow)
    return query.kitchenSettings.topRowHandle ?? TOP_ROW_HANDLE;
  return query.kitchenSettings.handle ?? DEFAULT_HANDLE;
}

// Compared against `true` after an `unknown` read: the catalogue is a supplied port, and a truthy
// non-boolean must not pass here when `hardware-mechanisms.ts` refuses it.
function takesAHandle(canHandle: boolean): boolean {
  const declaresHandleCapability: unknown = canHandle;
  return declaresHandleCapability === true;
}
