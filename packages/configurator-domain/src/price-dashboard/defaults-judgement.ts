// The new-kitchen defaults (D9, A-9) as the lifecycle sees them: which items they make un-switch-off-able, what changing
// the default material does to the default colour, and whether a set of defaults names something a customer could not
// be offered.
//
// The defaults are stored unversioned and stamped into a design when it is created (`stampedSettingsOf`); a saved
// design never reads them again. Nothing is stored yet reads as `{}` (the store's `NONE_SAVED`), and a kitchen then
// starts from the fixed fallbacks.
import { DEFAULT_HANDLE, TOP_ROW_HANDLE } from "../kitchen-handle/index.js";
import type { Handle } from "../design.js";
import type { NewKitchenSettings } from "../generation/new-kitchen-settings.js";
import {
  DEFAULT_MATERIAL_ID,
  lookUpMaterial,
  MATERIALS,
  materialOffersFinish,
  type Finish,
} from "../materials.js";
import {
  distinctItemsInOrder,
  isItemDisabled,
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
 * The items that are "the default" and so can be neither switched off nor deleted (frames D4E, D5C, D5D, D6C; the
 * fix-round briefs): the book's fallback material and hardware class (PAL, Standard) whatever D9 names, what D9 names,
 * the handle a kitchen and its top row follow when none is stored, and each material's default colour, the reset target
 * of ADR 0057. A free colour is not an item, so MDF's default is not here.
 */
export function defaultItemsOf({
  book,
  defaults,
}: DefaultsContext): readonly ItemRef[] {
  return distinctItemsInOrder([
    ...tierItems("material", [
      book.material.defaultTierId,
      defaults.materialTierId,
    ]),
    ...tierItems("hardware", [
      book.hardware.defaultTierId,
      defaults.hardwareTierId,
    ]),
    ...MATERIALS.flatMap(({ defaultFinish }) => colourItem(defaultFinish)),
    ...colourItem(defaults.finish),
    ...handleItems([
      DEFAULT_HANDLE,
      TOP_ROW_HANDLE,
      defaults.handle,
      defaults.topRowHandle,
    ]),
  ]);
}

/** A colour the default material's change took away, and the one it was reset to (the D9B note). */
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
 * Changes the default material. A default colour the new material does not offer becomes that material's default
 * colour; any other stays (ADR 0057 decision 2, by the same offer query `setMaterialTier` and `stampedSettingsOf` reset
 * by). Defaults naming no colour, or one that is not a colour at all (the save judgement refuses it), have none to
 * reset, and a material no declaration names makes no offer, so it resets nothing. Nothing is chosen on the customer's
 * behalf beyond that: the target is always the material's own default, which is never switched off.
 */
export function withDefaultMaterial(
  defaults: NewKitchenSettings,
  materialTierId: string,
): DefaultMaterialChange {
  const changed = { ...defaults, materialTierId };
  const lookup = lookUpMaterial(materialTierId);
  const { finish } = defaults;
  if (
    !isColourObject(finish) ||
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

/**
 * What a save of the defaults is judged to be, in the order the dialog's rows are read (material, hardware class,
 * handle, top-row handle, then colour):
 * - `unavailable`: a value names an item that is switched off or that the active book does not state (A-17), the item
 *   named; the save is a state conflict;
 * - `colour-not-in-palette`: the colour is not one the default material offers, which the screen cannot produce (it
 *   resets, `withDefaultMaterial`), so the request is malformed;
 * - `acceptable`.
 *
 * Only what the defaults state is judged: a key left out falls back to the fixed fallback, which is never switched off.
 * A colour with no material named is judged against PAL, the material the stamp and the design's finish check read.
 * A depth nobody manufactures and a document the schema refuses are the stamp's to refuse (`stampedSettingsOf`).
 */
export type DefaultsJudgement =
  | { readonly kind: "acceptable" }
  | { readonly kind: "unavailable"; readonly item: ItemRef }
  | { readonly kind: "colour-not-in-palette" };

const ACCEPTABLE: DefaultsJudgement = Object.freeze({
  kind: "acceptable",
} as const);

export function judgeKitchenDefaults(
  defaults: NewKitchenSettings,
  context: ItemGroupContext,
): DefaultsJudgement {
  const unavailable = namedItems(defaults).find(
    (item) => !isItemOffered(item, context),
  );
  if (unavailable !== undefined)
    return { kind: "unavailable", item: unavailable };
  return judgeColour(defaults, context);
}

function namedItems(defaults: NewKitchenSettings): readonly ItemRef[] {
  return [
    ...tierItems("material", [defaults.materialTierId]),
    ...tierItems("hardware", [defaults.hardwareTierId]),
    ...handleItems([defaults.handle]),
    ...handleItems([defaults.topRowHandle]),
  ];
}

function judgeColour(
  defaults: NewKitchenSettings,
  { availability }: ItemGroupContext,
): DefaultsJudgement {
  const { finish } = defaults;
  if (finish === undefined) return ACCEPTABLE;
  const lookup = lookUpMaterial(defaults.materialTierId ?? DEFAULT_MATERIAL_ID);
  if (
    !isColourObject(finish) ||
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

/** Whether a stored colour is an object the offer query can read. A document the schema refuses may hold `null` or a
 *  scalar here; it is judged not in the palette (and the stamp refuses it), never a crash. */
function isColourObject(finish: unknown): finish is Finish {
  return typeof finish === "object" && finish !== null;
}

function tierItems(
  kind: "hardware" | "material",
  tierIds: readonly (string | undefined)[],
): readonly ItemRef[] {
  return tierIds.flatMap((tierId) =>
    tierId === undefined ? [] : [{ kind, tierId }],
  );
}

function handleItems(
  handles: readonly (Handle | undefined)[],
): readonly ItemRef[] {
  return handles.flatMap((handle) =>
    handle === undefined ? [] : [{ kind: "handle", handle }],
  );
}

function colourItem(finish: Finish | undefined): readonly ItemRef[] {
  return finish?.kind === "palette-entry"
    ? [{ kind: "finish", finishId: finish.entryId }]
    : [];
}
