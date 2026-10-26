// The handle a cabinet actually wears (M10 wave H1, ADR 0061, ADR 0092 Amendment C), the only authority
// on the order. It is `resolved-finish.ts`'s order for colour, with one exception the top row makes:
//
// ```
// placement.body.handle            the cabinet's own choice — highest priority
//   ?? design.settings.handle      the whole-kitchen choice, never the top row's
//   ?? the slot's default          today's: TOP_ROW_HANDLE on the top row, DEFAULT_HANDLE below it
// ```
//
// It resolves and never writes. An absent `body.handle` is a legal state that has chosen nothing and
// stays absent, so a cabinet with no choice keeps following the next kitchen change; a resolved value
// written into a body would turn the cabinet into one that overrides (`built-body.ts` carries a recorded
// handle across a swap).
//
// A body whose definition takes no handle has none: the answer is `undefined`, never the kitchen's.
// Where such a body is nevertheless push-to-open (a corner return in the top row), the slot decides, and
// that is `isPushToOpen`'s fallback, not this module's.
//
// The top row is passed in as a fact rather than a floor: its module line lives in `push-to-open.ts`
// (millimetres) and `bands.ts` (metres), and this module must not import either, because the former
// imports this one.
import type { Handle } from "../design.js";

/** §6.5's fallback below the top row: a bar handle, which every non-top-row seeded body renders with. */
export const DEFAULT_HANDLE: Handle = "steel";

/** §6.5: at or above the top module line, handles are built and hidden. */
export const TOP_ROW_HANDLE: Handle = "push";

/** The four facts the answer is made of, as a parameter object so none can be transposed. */
export interface HandleResolutionQuery {
  /** What the placement records, absent when the customer has chosen nothing for this cabinet. */
  readonly ownHandle: Handle | undefined;
  /** `design.settings.handle`, absent when the kitchen has chosen nothing. */
  readonly kitchenHandle: Handle | undefined;
  /** Whether the body's own definition permits a handle choice (`BodyDefinition.canHandle`). */
  readonly canHandle: boolean;
  /** Whether the front stands on or above the top module line, decided by the caller's own floor. */
  readonly isTopRow: boolean;
}

/**
 * The handle this cabinet wears, or `undefined` when its definition takes none.
 *
 * `canHandle` is read as `unknown` and compared against `true`, as `isPushToOpen` always has: the
 * catalogue is a supplied port, and a truthy non-boolean must not pass here when it fails there.
 */
export function resolvedHandleOf(
  query: HandleResolutionQuery,
): Handle | undefined {
  if (!takesAHandle(query.canHandle)) return undefined;
  // `!== undefined` and not `??`: a `null` from an untyped route has always counted as a recorded
  // mode and suppressed the slot rule (`qa-6w-carry-overs.adversarial.test.ts` pins it), so the
  // resolver keeps `isPushToOpen`'s answer for it rather than quietly normalising it.
  if (query.ownHandle !== undefined) return query.ownHandle;
  return followedHandleOf(query);
}

/**
 * What §6.5 gives this body when it has chosen nothing: published so a panel can mark the chip the
 * customer is looking at. Defined for every body, including one that takes no handle: such a body
 * reports the slot's default and never the kitchen's, since the answer is never read for it.
 */
export function defaultHandleOf(
  query: Omit<HandleResolutionQuery, "ownHandle">,
): Handle {
  if (!takesAHandle(query.canHandle))
    return slotDefaultHandleOf(query.isTopRow);
  return followedHandleOf(query);
}

/**
 * What a cabinet with no choice of its own wears: the kitchen's handle below the top row, the slot's
 * default on it. The top row never follows the kitchen — it ships push-to-open by module line, and a
 * kitchen asking for steel bars must not turn its latches into bars.
 */
function followedHandleOf(
  query: Pick<HandleResolutionQuery, "kitchenHandle" | "isTopRow">,
): Handle {
  if (query.isTopRow) return TOP_ROW_HANDLE;
  return query.kitchenHandle ?? DEFAULT_HANDLE;
}

function slotDefaultHandleOf(isTopRow: boolean): Handle {
  return isTopRow ? TOP_ROW_HANDLE : DEFAULT_HANDLE;
}

function takesAHandle(canHandle: boolean): boolean {
  const declaresHandleCapability: unknown = canHandle;
  return declaresHandleCapability === true;
}
