// What may be done to a switchable item (ADR 0062 Amendment 3 and the 2026-10-26 Amendment, A-16, A-17, A-18): switch it
// off or on, and delete it. A pure judgement over the state the caller read; it is applied at write time, so the guards
// hold whatever the screen showed.
//
// Switching off is refused for the default (D9 and the fixed fallbacks, `defaultItemsOf`) and for the last active option
// of a group (`item-groups.ts`): either would leave a customer nothing to be priced at or moved to. Switching on is
// refused for an item the active book does not state: a row only the draft knows is activated after it is published.
// Deleting is refused for the default and for an item any saved kitchen uses; an unused, non-default item may go.
//
// The refusal codes are the wire's own words (`item-is-default`, `last-active-option`, `item-not-in-active-book`,
// `item-in-use`), so a route maps them and names nothing new.
import {
  isItemDisabled,
  isSameItem,
  type ItemRef,
} from "../pricing/catalogue-availability.js";

import type { DeletableItemRef } from "./book-field-address.js";
import { defaultItemsOf, type DefaultsContext } from "./defaults-judgement.js";
import {
  isItemStated,
  remainingOptionsIfSwitchedOff,
  type ItemGroupContext,
} from "./item-groups.js";
import { usageCountOf, type ItemUsageCounts } from "./item-usage.js";

/** Why an availability write is refused. */
export const AVAILABILITY_REFUSAL_CODES = Object.freeze([
  "item-not-in-active-book",
  "item-is-default",
  "last-active-option",
] as const);
export type AvailabilityRefusalCode =
  (typeof AVAILABILITY_REFUSAL_CODES)[number];

/** Why a deletion is refused. */
export const DELETION_REFUSAL_CODES = Object.freeze([
  "item-is-default",
  "item-in-use",
] as const);
export type DeletionRefusalCode = (typeof DELETION_REFUSAL_CODES)[number];

export type AvailabilityVerdict =
  | { readonly kind: "allowed" }
  | { readonly kind: "refused"; readonly code: AvailabilityRefusalCode };

export type DeletionVerdict =
  | { readonly kind: "allowed" }
  | { readonly kind: "refused"; readonly code: DeletionRefusalCode };

/** The state an availability write is judged against: what is switched off, the active book, and the defaults saved
 *  (`{}` when none were). */
export interface AvailabilityState extends ItemGroupContext, DefaultsContext {}

/** The write: the item, and whether it is to be on (`active: true`) or off. */
export interface AvailabilityChange {
  readonly item: ItemRef;
  readonly active: boolean;
}

const ALLOWED = Object.freeze({ kind: "allowed" } as const);

/**
 * Whether the item may be switched on or off, and the code if it may not.
 *
 * An item the active book does not state is refused either way: the log never names a row that is not there. Switching
 * off is then judged for the default before the last active option, so the default is told "pick another default" and
 * not "keep one active". An item already off is allowed to be switched off again, since that removes no option.
 */
export function judgeAvailabilityChange(
  { item, active }: AvailabilityChange,
  state: AvailabilityState,
): AvailabilityVerdict {
  if (!isItemStated(item, state.book)) {
    return refusal("item-not-in-active-book");
  }
  if (active) return ALLOWED;
  if (isDefault(item, state)) return refusal("item-is-default");
  if (isLastActiveOption(item, state)) return refusal("last-active-option");
  return ALLOWED;
}

/** Whether switching the item off would be allowed. */
export function canDisable(item: ItemRef, state: AvailabilityState): boolean {
  return (
    judgeAvailabilityChange({ item, active: false }, state).kind === "allowed"
  );
}

/** The item to delete, the saved kitchens that use each item the caller counted, the active book and the defaults. */
export interface DeletionRequest extends DefaultsContext {
  readonly item: DeletableItemRef;
  readonly usage: ItemUsageCounts;
}

/**
 * Whether the item may be deleted, and the code if it may not: the default first (it is told to choose another default,
 * not to switch off), then any use. Throws `UsageNotCountedError` when `usage` holds no count for the item, rather than
 * read a missing count as unused.
 *
 * Which kinds a deletion applies to (not a colour, a handle or a built-in accessory) is the draft change's rule, M4's.
 */
export function judgeDeletion(request: DeletionRequest): DeletionVerdict {
  if (isDefault(request.item, request)) return refusal("item-is-default");
  if (usageCountOf(request.usage, request.item) > 0) {
    return refusal("item-in-use");
  }
  return ALLOWED;
}

/** Whether the item may be deleted. */
export function canDelete(request: DeletionRequest): boolean {
  return judgeDeletion(request).kind === "allowed";
}

function isDefault(item: ItemRef, context: DefaultsContext): boolean {
  return defaultItemsOf(context).some((candidate) =>
    isSameItem(candidate, item),
  );
}

/** Whether the item is on and the only option of its group that is: switching it off would leave the group nothing. An
 *  item already off removes no option, and an accessory has no group (its line just drops). */
function isLastActiveOption(item: ItemRef, state: AvailabilityState): boolean {
  if (item.kind === "accessory") return false;
  if (isItemDisabled(state.availability, item)) return false;
  return remainingOptionsIfSwitchedOff(item, state).length === 0;
}

function refusal<Code extends string>(
  code: Code,
): { readonly kind: "refused"; readonly code: Code } {
  return { kind: "refused", code };
}
