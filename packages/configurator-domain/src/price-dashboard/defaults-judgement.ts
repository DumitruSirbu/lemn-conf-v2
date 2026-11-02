// The new-kitchen defaults (D9, A-9) as the lifecycle sees them: which items they make un-switch-off-able, what changing
// the default material does to the default colour, and whether a set of defaults names something a customer could not
// be offered.
//
// The defaults are stored unversioned and stamped into a design when it is created (`stampedSettingsOf`); a saved
// design never reads them again. Nothing is stored yet reads as `{}` (the store's `NONE_SAVED`), and a kitchen then
// starts from the fixed fallbacks.
import { DEFAULT_HANDLE, TOP_ROW_HANDLE } from "../kitchen-handle/index.js";
import type { NewKitchenSettings } from "../generation/new-kitchen-settings.js";
import {
  DEFAULT_MATERIAL_ID,
  FinishSchema,
  lookUpMaterial,
  MATERIALS,
  materialOffersFinish,
  type Finish,
} from "../materials.js";
import {
  colourItem,
  distinctItemsInOrder,
  handleItem,
  handleRef,
  isItemDisabled,
  tierRef,
  type ItemRef,
} from "../pricing/catalogue-availability.js";
import type { PriceBook } from "../pricing/price-book.js";

import { isItemOffered, type ItemGroupContext } from "./item-groups.js";

/** The book whose fallback tiers are defaults too, and the defaults saved (`{}` when none were). */
export interface DefaultsContext {
  readonly book: PriceBook;
  readonly defaults: NewKitchenSettings;
}

/**
 * The fixed defaults, which no saved defaults release (ADR 0057, A-9): the book's fallback material and hardware class
 * (PAL, Standard), the handle a kitchen and its top row follow when none is stored, and each material's default colour,
 * the reset target of ADR 0057. A free colour is not an item, so MDF's default is not here.
 */
export function fixedDefaultItemsOf(book: PriceBook): readonly ItemRef[] {
  return distinctItemsInOrder([
    tierRef("material", book.material.defaultTierId),
    tierRef("hardware", book.hardware.defaultTierId),
    ...MATERIALS.flatMap(({ defaultFinish }) => colourItem(defaultFinish)),
    ...handleItem(DEFAULT_HANDLE),
    ...handleItem(TOP_ROW_HANDLE),
  ]);
}

/** The items the saved defaults name (D9): moving D9 to other items releases these. */
export function savedDefaultItemsOf(
  defaults: NewKitchenSettings,
): readonly ItemRef[] {
  return distinctItemsInOrder([
    ...tierAndHandleItemsOf(defaults),
    ...colourItem(defaults.finish),
  ]);
}

/** Every item that is a default, fixed or saved: none of them can be switched off or deleted. */
export function defaultItemsOf({
  book,
  defaults,
}: DefaultsContext): readonly ItemRef[] {
  return distinctItemsInOrder([
    ...fixedDefaultItemsOf(book),
    ...savedDefaultItemsOf(defaults),
  ]);
}

/** A colour the default material's change took away, and the one it was reset to. */
export interface ColourReset {
  readonly from: Finish;
  readonly to: Finish;
}

/** The defaults with the material changed, and the reset the change made, when it made one. */
export interface DefaultMaterialChange {
  readonly defaults: NewKitchenSettings;
  readonly colourReset?: ColourReset;
}

/**
 * Changes the default material. A well-formed default colour the new material does not offer becomes that material's
 * default colour; any other stays (ADR 0057 decision 2, by the same offer query `setMaterialTier` and `stampedSettingsOf`
 * reset by). Defaults naming no colour, or one `FinishSchema` refuses, have none to reset: the stamp refuses a malformed
 * colour rather than healing it, so it is kept for the save judgement to refuse. A material no declaration names makes
 * no offer, so it resets nothing. The reset target is always the material's own default, which is never switched off.
 */
export function withDefaultMaterial(
  defaults: NewKitchenSettings,
  materialTierId: string,
): DefaultMaterialChange {
  const changed = { ...defaults, materialTierId };
  const lookup = lookUpMaterial(materialTierId);
  const { finish } = defaults;
  if (
    !isWellFormedColour(finish) ||
    lookup.kind === "undeclared" ||
    materialOffersFinish(lookup.material, finish)
  ) {
    return { defaults: changed };
  }
  const to = { ...lookup.material.defaultFinish };
  return {
    defaults: { ...changed, finish: to },
    colourReset: { from: finish, to },
  };
}

/** What a save of the defaults is judged to be. */
export type DefaultsJudgement =
  | { readonly kind: "acceptable" }
  | { readonly kind: "unavailable"; readonly item: ItemRef }
  | { readonly kind: "colour-not-in-palette" };

const ACCEPTABLE: DefaultsJudgement = Object.freeze({
  kind: "acceptable",
} as const);

/**
 * Judges a save of the defaults, in the order the dialog's rows are read (material, hardware class, handle, top-row
 * handle, then colour):
 * - `unavailable`: a value names an item that is switched off or that the active book does not state (A-17), the item
 *   named; the save is a state conflict;
 * - `colour-not-in-palette`: the colour is not a well-formed one the default material offers, which the screen cannot
 *   produce (it resets, `withDefaultMaterial`), so the request is malformed;
 * - `acceptable`: never for a colour `stampedSettingsOf` refuses.
 *
 * Only what the defaults state is judged: a key left out falls back to the fixed fallback, which is never switched off.
 * A colour with no material named is judged against PAL, the material the stamp and the design's finish check read.
 * A depth nobody manufactures and a document the schema refuses are the stamp's to refuse (`stampedSettingsOf`).
 */
export function judgeKitchenDefaults(
  defaults: NewKitchenSettings,
  context: ItemGroupContext,
): DefaultsJudgement {
  const unavailable = tierAndHandleItemsOf(defaults).find(
    (item) => !isItemOffered(item, context),
  );
  if (unavailable !== undefined) {
    return { kind: "unavailable", item: unavailable };
  }
  return judgeColour(defaults, context);
}

function judgeColour(
  defaults: NewKitchenSettings,
  { availability }: ItemGroupContext,
): DefaultsJudgement {
  const { finish } = defaults;
  if (finish === undefined) return ACCEPTABLE;
  const lookup = lookUpMaterial(defaults.materialTierId ?? DEFAULT_MATERIAL_ID);
  if (
    !isWellFormedColour(finish) ||
    lookup.kind === "undeclared" ||
    !materialOffersFinish(lookup.material, finish)
  ) {
    return { kind: "colour-not-in-palette" };
  }
  const [item] = colourItem(finish);
  return item !== undefined && isItemDisabled(availability, item)
    ? { kind: "unavailable", item }
    : ACCEPTABLE;
}

/** Whether a stored colour is one `FinishSchema` admits. Anything else (`null`, a scalar, `{}`, a stray palette id, an
 *  extra key) is what the stamp refuses, so it is neither healed nor judged acceptable. */
function isWellFormedColour(finish: unknown): finish is Finish {
  return FinishSchema.safeParse(finish).success;
}

/** The items the defaults name for a tier or a handle, one for each key present. A key present holding `null` still
 *  names an item, one nobody offers, so the judgement refuses it as the stamp does. */
function tierAndHandleItemsOf(
  defaults: NewKitchenSettings,
): readonly ItemRef[] {
  return [
    ...whenPresent(defaults.materialTierId, (tierId) =>
      tierRef("material", tierId),
    ),
    ...whenPresent(defaults.hardwareTierId, (tierId) =>
      tierRef("hardware", tierId),
    ),
    ...whenPresent(defaults.handle, handleRef),
    ...whenPresent(defaults.topRowHandle, handleRef),
  ];
}

function whenPresent<Value>(
  value: Value | undefined,
  itemOf: (value: Value) => ItemRef,
): readonly ItemRef[] {
  return value === undefined ? [] : [itemOf(value)];
}
