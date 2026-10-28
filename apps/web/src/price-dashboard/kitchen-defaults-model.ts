import {
  declaredCabinetDepthsMm,
  HandleSchema,
  lookUpMaterial,
  materialOffersFinish,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  type Finish,
  type Handle,
  type ItemRef,
  type Material,
  type PaletteEntryId,
} from "@lemnaria/configurator-domain";

import type {
  DashboardRequestField,
  KitchenDefaultsMember,
  KitchenDefaultsSaveRequestWire,
  KitchenDefaultsStateWire,
  KitchenDefaultsWire,
} from "./price-dashboard-wire-contract";

// The rules of the new-kitchen defaults screen (frames D9A to D9C), without a pixel: which options are on offer, what a
// change of material does to the colour, what differs from the saved values, and what a save sends. The colour reset is
// the domain's own query (`materialOffersFinish`, the one `stampedSettingsOf` and `setMaterialTier` reset by), never a
// second table of which material offers which colour.

/** A tier of the active book as this screen offers it: its words are the book's, resolved by the screen. */
export interface TierOffer {
  readonly tierId: string;
  readonly name: string;
  readonly nameKey?: string | undefined;
}

/**
 * Everything the screen needs to be drawn, in two halves that come from two places. `state` is the saved defaults with the
 * two revisions a save expects. The tiers and what is switched off are the active book's and the availability head's: only
 * an item that is active is offered.
 */
export interface KitchenDefaultsPageInput {
  readonly state: KitchenDefaultsStateWire;
  readonly materials: readonly TierOffer[];
  readonly hardware: readonly TierOffer[];
  readonly disabled: readonly ItemRef[];
}

/** The rows in the order the frame draws them, and the order of the page's DOM. */
export const DEFAULTS_ROW_ORDER: readonly KitchenDefaultsMember[] = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
];

/** The depths a kitchen is manufactured in, from the domain's own declaration. */
export function depthOptions(): readonly number[] {
  return declaredCabinetDepthsMm();
}

/** What the colour row offers for a material (ADR 0071 decision 3): a list of decors or woods, a free colour (MDF's RAL
 *  picker), or nothing where the material is one this build does not declare. */
export type ColourOffer =
  | { readonly kind: "palette"; readonly entryIds: readonly PaletteEntryId[] }
  | { readonly kind: "free" }
  | { readonly kind: "none" };

export function activeMaterials(
  input: KitchenDefaultsPageInput,
): readonly TierOffer[] {
  return input.materials.filter((tier) =>
    isMaterialOffered(input, tier.tierId),
  );
}

export function activeHardware(
  input: KitchenDefaultsPageInput,
): readonly TierOffer[] {
  return input.hardware.filter((tier) => isHardwareOffered(input, tier.tierId));
}

export function activeHandles(
  input: KitchenDefaultsPageInput,
): readonly Handle[] {
  return HandleSchema.options.filter((handle) =>
    isHandleOffered(input, handle),
  );
}

export function isMaterialOffered(
  input: KitchenDefaultsPageInput,
  tierId: string,
): boolean {
  return (
    input.materials.some((tier) => tier.tierId === tierId) &&
    !isSwitchedOff(input.disabled, { kind: "material", tierId })
  );
}

export function isHardwareOffered(
  input: KitchenDefaultsPageInput,
  tierId: string,
): boolean {
  return (
    input.hardware.some((tier) => tier.tierId === tierId) &&
    !isSwitchedOff(input.disabled, { kind: "hardware", tierId })
  );
}

export function isHandleOffered(
  input: KitchenDefaultsPageInput,
  handle: Handle,
): boolean {
  return !isSwitchedOff(input.disabled, { kind: "handle", handle });
}

export function isDepthOffered(cabinetDepthMm: number): boolean {
  return depthOptions().includes(cabinetDepthMm);
}

/** Whether the colour the draft holds is on offer for the material it holds: in that material's palette and not switched
 *  off, or a free colour where the material takes one. */
export function isFinishOffered(
  input: KitchenDefaultsPageInput,
  draft: KitchenDefaultsWire,
): boolean {
  const offer = colourOfferFor(input, draft.materialTierId);
  const { finish } = draft;
  if (offer.kind === "none") return false;
  if (offer.kind === "free") return finish.kind === "free-colour";
  return (
    finish.kind === "palette-entry" && offer.entryIds.includes(finish.entryId)
  );
}

export function colourOfferFor(
  input: KitchenDefaultsPageInput,
  materialTierId: string,
): ColourOffer {
  const lookup = lookUpMaterial(materialTierId);
  if (lookup.kind === "undeclared") return { kind: "none" };
  const { colourControl } = lookup.material;
  if (colourControl.shape === "ral-picker") return { kind: "free" };
  const entryIds = paletteEntriesOf(lookup.material)
    .map((entry) => entry.entryId)
    .filter(
      (finishId) =>
        !isSwitchedOff(input.disabled, { kind: "finish", finishId }),
    );
  return { kind: "palette", entryIds };
}

/** A draft with the material changed, and the colour the change took away, if it did (the D9B note). */
export interface MaterialChange {
  readonly draft: KitchenDefaultsWire;
  readonly resetFrom: Finish | null;
}

/**
 * A colour the new material does not offer becomes that material's default colour, or its first colour that is not
 * switched off when the default is; any other stays. The colour a reset lands on is always one that can be saved.
 */
export function withMaterial(
  draft: KitchenDefaultsWire,
  materialTierId: string,
  switchedOff: readonly ItemRef[] = [],
): MaterialChange {
  const lookup = lookUpMaterial(materialTierId);
  const isOffered =
    lookup.kind === "undeclared" ||
    materialOffersFinish(lookup.material, draft.finish);
  if (isOffered)
    return { draft: { ...draft, materialTierId }, resetFrom: null };
  return {
    draft: {
      ...draft,
      materialTierId,
      finish: resetColourOf(lookup.material, switchedOff),
    },
    resetFrom: draft.finish,
  };
}

function resetColourOf(
  material: Material,
  switchedOff: readonly ItemRef[],
): Finish {
  const isAvailable = (finish: Finish): boolean =>
    finish.kind !== "palette-entry" ||
    !isSwitchedOff(switchedOff, { kind: "finish", finishId: finish.entryId });
  const preferred = material.defaultFinish;
  if (isAvailable(preferred)) return { ...preferred };
  const firstActive = paletteEntriesOf(material).find((entry) =>
    isAvailable(paletteFinish(entry.entryId)),
  );
  return firstActive === undefined
    ? { ...preferred }
    : paletteFinish(firstActive.entryId);
}

/**
 * The draft laid over defaults that moved while it was being edited: the fresh values, with only the rows the person
 * changed from what they read put back on top. A row they left alone takes the other member's saved value, so the next save
 * cannot undo it (the revision guard exists to prevent that lost update).
 */
export function rebasedOnto(
  fresh: KitchenDefaultsWire,
  savedAtEditStart: KitchenDefaultsWire,
  draft: KitchenDefaultsWire,
): KitchenDefaultsWire {
  const changedByPerson: Partial<KitchenDefaultsWire> = {};
  for (const member of modifiedMembers(savedAtEditStart, draft)) {
    Object.assign(changedByPerson, { [member]: draft[member] });
  }
  return { ...fresh, ...changedByPerson };
}

/** The rows whose value is not the saved one: the "Modificat" chips, and whether Save has anything to save. */
export function modifiedMembers(
  saved: KitchenDefaultsWire,
  draft: KitchenDefaultsWire,
): ReadonlySet<KitchenDefaultsMember> {
  return new Set(
    DEFAULTS_ROW_ORDER.filter((member) => !isSameValue(member, saved, draft)),
  );
}

/**
 * The rows whose chosen value is not on offer: switched off since it was saved, or not one a kitchen can have. Such a row
 * shows the "no longer available" error and Save stays off until another is chosen.
 */
export function unofferedMembers(
  input: KitchenDefaultsPageInput,
  draft: KitchenDefaultsWire,
): ReadonlySet<KitchenDefaultsMember> {
  const isOffered: Readonly<Record<KitchenDefaultsMember, boolean>> = {
    materialTierId: isMaterialOffered(input, draft.materialTierId),
    hardwareTierId: isHardwareOffered(input, draft.hardwareTierId),
    cabinetDepthMm: isDepthOffered(draft.cabinetDepthMm),
    finish: isFinishOffered(input, draft),
    handle: isHandleOffered(input, draft.handle),
    topRowHandle: isHandleOffered(input, draft.topRowHandle),
  };
  return new Set(DEFAULTS_ROW_ORDER.filter((member) => !isOffered[member]));
}

/**
 * The rows a `409 item-unavailable` names: the one an item belongs to, or both handle rows when each holds the handle. A
 * route names the item, never the row.
 */
export function membersHoldingItem(
  draft: KitchenDefaultsWire,
  item: ItemRef,
): readonly KitchenDefaultsMember[] {
  switch (item.kind) {
    case "material":
      return draft.materialTierId === item.tierId ? ["materialTierId"] : [];
    case "hardware":
      return draft.hardwareTierId === item.tierId ? ["hardwareTierId"] : [];
    case "finish":
      return draft.finish.kind === "palette-entry" &&
        draft.finish.entryId === item.finishId
        ? ["finish"]
        : [];
    case "handle":
      return (["handle", "topRowHandle"] as const).filter(
        (member) => draft[member] === item.handle,
      );
    case "accessory":
      return [];
  }
}

/** The rows a `400` names. A field of the request that is not a row of this screen names none, and the screen shows its
 *  generic failure. */
export function membersOfIssues(
  issues: readonly { readonly field: DashboardRequestField }[],
): readonly KitchenDefaultsMember[] {
  return DEFAULTS_ROW_ORDER.filter((member) =>
    issues.some((issue) => issue.field === member),
  );
}

/** The whole object, all six members, with the revisions the page read. A save is never a partial write. */
export function saveRequestOf(
  state: KitchenDefaultsStateWire,
  draft: KitchenDefaultsWire,
): KitchenDefaultsSaveRequestWire {
  return {
    expectedRevision: state.revision,
    expectedAvailabilityRevision: state.availabilityRevision,
    defaults: wholeDefaultsOf(draft),
  };
}

function wholeDefaultsOf(draft: KitchenDefaultsWire): KitchenDefaultsWire {
  return {
    materialTierId: draft.materialTierId,
    hardwareTierId: draft.hardwareTierId,
    cabinetDepthMm: draft.cabinetDepthMm,
    finish: { ...draft.finish },
    handle: draft.handle,
    topRowHandle: draft.topRowHandle,
  };
}

function isSwitchedOff(disabled: readonly ItemRef[], item: ItemRef): boolean {
  return disabled.some((off) => sameItem(off, item));
}

function sameItem(one: ItemRef, other: ItemRef): boolean {
  switch (one.kind) {
    case "material":
    case "hardware":
      return one.kind === other.kind && one.tierId === other.tierId;
    case "finish":
      return other.kind === "finish" && one.finishId === other.finishId;
    case "handle":
      return other.kind === "handle" && one.handle === other.handle;
    case "accessory":
      return (
        other.kind === "accessory" && one.accessoryId === other.accessoryId
      );
  }
}

function isSameValue(
  member: KitchenDefaultsMember,
  saved: KitchenDefaultsWire,
  draft: KitchenDefaultsWire,
): boolean {
  return member === "finish"
    ? sameFinish(saved.finish, draft.finish)
    : saved[member] === draft[member];
}
