import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  fixedDefaultItemsOf,
  isBuiltInAccessoryId,
  isItemOffered,
  isItemStated,
  isSameItem,
  judgeAvailabilityChange,
  judgeDeletion,
  remainingOptionsIfSwitchedOff,
  savedDefaultItemsOf,
  usageCountOf,
  UsageNotCountedError,
  type AvailabilityRefusalCode,
  type CatalogueAvailability,
  type DeletableItemRef,
  type DeletionRequest,
  type ItemRef,
  type ItemUsageCounts,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

// What may be done to a switchable item, as a screen offers it. Every verdict is the domain's own
// (`judgeAvailabilityChange`, `judgeDeletion`), so the order the guards are read in is never written a second time
// here: this module maps a verdict to the control a person is shown. The server judges the same write again when it is
// made.

/** What a screen knows to judge a change by. `defaults` is absent when they could not be read: what the book alone
 *  refuses is still refused, and what it allows is left unjudged. */
export interface LifecycleContext {
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
  readonly defaults: NewKitchenSettings | undefined;
  /** Whether a switch can be written at all; where it cannot, no switch-on is offered. */
  readonly canWrite: boolean;
}

/** Why a control is off: the sentence under it says which. */
export type OffReason =
  | "item-is-default"
  | "item-is-fixed-default"
  | "item-not-in-active-book"
  /** The always-present accessory is never switched off (`ALWAYS_PRESENT_ACCESSORY_ID` says why). */
  | "item-always-present"
  /** ...and never deleted. */
  | "always-present-accessory"
  /** A built-in accessory comes with the catalogue: it can be switched off, never deleted. */
  | "built-in-accessory"
  | "cannot-judge";

/** What the switch of an item does when pressed. */
export type SwitchStand =
  /** On, and another option stays on: the dialog that says what happens. */
  | { readonly kind: "disable"; readonly remaining: readonly ItemRef[] }
  /** On, and the only one of its group that is: the dialog that says why it stays. */
  | { readonly kind: "last-active-option" }
  | { readonly kind: "enable" }
  | { readonly kind: "off"; readonly reason: OffReason };

export type DeleteStand =
  /** Nothing in the book or the defaults forbids it: how many saved kitchens use the item decides. */
  | { readonly kind: "count-first" }
  | { readonly kind: "off"; readonly reason: OffReason };

/** What deleting an item comes to once the saved kitchens that use it have been counted. */
export type CountedDeletion =
  | { readonly kind: "allowed" }
  | { readonly kind: "in-use"; readonly count: number }
  | { readonly kind: "off"; readonly reason: OffReason };

/** Whether customers are offered the item now: the book states it and availability has not switched it off. */
export function isItemOn(item: ItemRef, context: LifecycleContext): boolean {
  return isItemOffered(item, context);
}

export function switchStandOf(
  item: ItemRef,
  context: LifecycleContext,
): SwitchStand {
  const { book, availability, defaults } = context;
  if (!isItemOn(item, context)) {
    const verdict = judgeAvailabilityChange(
      { item, active: true },
      { book, availability, defaults: defaults ?? {} },
    );
    if (verdict.kind === "refused") return standOfRefusal(verdict.code);
    return context.canWrite
      ? { kind: "enable" }
      : { kind: "off", reason: "cannot-judge" };
  }
  const verdict = judgeAvailabilityChange(
    { item, active: false },
    { book, availability, defaults: defaults ?? {} },
  );
  if (verdict.kind === "refused") return standOfRefusal(verdict.code);
  if (defaults === undefined || !context.canWrite) {
    return { kind: "off", reason: "cannot-judge" };
  }
  return {
    kind: "disable",
    remaining: remainingOptionsIfSwitchedOff(item, context),
  };
}

function standOfRefusal(code: AvailabilityRefusalCode): SwitchStand {
  return code === "last-active-option"
    ? { kind: "last-active-option" }
    : { kind: "off", reason: code };
}

/** Whether the item is one of the defaults: the fixed ones, and the saved ones where the saved are known. */
export function isDefaultItem(
  item: ItemRef,
  { book, defaults }: LifecycleContext,
): boolean {
  return [
    ...fixedDefaultItemsOf(book),
    ...savedDefaultItemsOf(defaults ?? {}),
  ].some((held) => isSameItem(held, item));
}

/**
 * A default is refused before any use is counted, so a default needs no count; any other item does. Where nothing can
 * be written, no deletion is offered either, an item only the draft holds included: nothing could carry it out.
 */
export function deleteStandOf(
  item: DeletableItemRef,
  context: LifecycleContext,
): DeleteStand {
  const reason = deletionRefusalWithoutCount(item, context);
  if (reason !== undefined) return { kind: "off", reason };
  return context.canWrite
    ? { kind: "count-first" }
    : { kind: "off", reason: "cannot-judge" };
}

/** The verdict of the domain on a deletion, with the counts the usage reader answered. */
export function countedDeletionOf(
  item: DeletableItemRef,
  context: LifecycleContext,
  counts: ItemUsageCounts,
): CountedDeletion {
  const { book, defaults } = context;
  const verdict = judgeDeletion({
    item,
    usage: counts,
    book,
    defaults: defaults ?? {},
  });
  if (verdict.kind === "allowed") {
    return mustAwaitDefaults(item, context)
      ? { kind: "off", reason: "cannot-judge" }
      : { kind: "allowed" };
  }
  if (verdict.code === "item-in-use") {
    return { kind: "in-use", count: usageCountOf(counts, item) };
  }
  return { kind: "off", reason: verdict.code };
}

/**
 * What forbids a deletion before anything is counted. `judgeDeletion` names a default first and counts afterwards, and
 * throws for an item no count names: that throw is "not counted yet" here, never a zero. Judged without the saved
 * defaults first: what that refuses stays refused, and only an allowance waits for them.
 */
function deletionRefusalWithoutCount(
  item: DeletableItemRef,
  context: LifecycleContext,
): OffReason | undefined {
  const { book, defaults } = context;
  if (isAlwaysPresentAccessory(item)) return "always-present-accessory";
  if (isBuiltInAccessory(item)) return "built-in-accessory";
  const reason = refusalOfUncountedDeletion({
    item,
    usage: [],
    book,
    defaults: defaults ?? {},
  });
  if (reason !== undefined) return reason;
  return mustAwaitDefaults(item, context) ? "cannot-judge" : undefined;
}

function isAlwaysPresentAccessory(item: ItemRef): boolean {
  return (
    item.kind === "accessory" &&
    item.accessoryId === ALWAYS_PRESENT_ACCESSORY_ID
  );
}

function isBuiltInAccessory(item: ItemRef): boolean {
  return item.kind === "accessory" && isBuiltInAccessoryId(item.accessoryId);
}

function refusalOfUncountedDeletion(
  request: DeletionRequest,
): OffReason | undefined {
  try {
    const verdict = judgeDeletion(request);
    return verdict.kind === "refused" && verdict.code !== "item-in-use"
      ? verdict.code
      : undefined;
  } catch (failure) {
    if (failure instanceof UsageNotCountedError) return undefined;
    throw failure;
  }
}

/** Saved defaults that could not be read leave an allowance open for an item the book states; an item it never stated
 *  cannot be named by any saved default. */
function mustAwaitDefaults(
  item: ItemRef,
  { book, defaults }: LifecycleContext,
): boolean {
  return defaults === undefined && isItemStated(item, book);
}

/** The number of saved kitchens that use the item, or `undefined` where the reader named none for it. */
export function countOfUse(
  counts: ItemUsageCounts,
  item: ItemRef,
): number | undefined {
  try {
    return usageCountOf(counts, item);
  } catch (failure) {
    if (failure instanceof UsageNotCountedError) return undefined;
    throw failure;
  }
}
