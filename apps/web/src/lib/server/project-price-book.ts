import "server-only";

import type {
  AccessoryRule,
  AnchoredFormula,
  BookAccessories,
  CabinetPriceRule,
  DepthRule,
  HardwareTier,
  LinkedAccessoryRule,
  MaterialTier,
  PriceBook,
  PricedSize,
  TierGroup,
  TierIdentity,
} from "@lemnaria/configurator-domain";

// A stored book is jsonb: it may carry members its type does not declare, and everything the server hands a page is
// serialised into it. The projection copies the declared members and no others, at every level a book has, so a member
// that is not part of a price never reaches a customer's browser (ADR 0062 seam 1: the book arrives from outside
// TypeScript). Each list of names is checked against the type it projects, in both directions: a name that is not a member
// fails to compile, and a member left out of the list fails to compile too, so a field added to the book cannot be dropped
// from a page without a build failing.

/**
 * A list of the members of one declared type, accepted only when it names every member: a name that is not a member fails
 * to compile, and so does a member left out.
 */
function membersOf<Declared>() {
  return <const List extends readonly (keyof Declared & string)[]>(
    list: List &
      ([Exclude<keyof Declared, List[number]>] extends [never]
        ? unknown
        : never),
  ): List => list;
}

const BOOK_MEMBERS = membersOf<PriceBook>()([
  "version",
  "currency",
  "status",
  "amountsProvisional",
  "cabinetRules",
  "hardware",
  "material",
  "depthRule",
  "accessories",
  "linkedAccessories",
]);

const RULE_MEMBERS = membersOf<CabinetPriceRule>()([
  "ruleId",
  "buildId",
  "formula",
  "suppliedBy",
]);

/** Every member any formula shape states, in one list. A formula of a shape that states fewer simply has fewer of them.
 *  The listed sizes of a `price-per-size` formula are copied apart. */
const FORMULA_MEMBERS = membersOf<AnchoredFormula>()([
  "shape",
  "anchorWidthMm",
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perExtraDoorLeafMinor",
  "anchorHeightMm",
  "perHeightStepMinor",
]);

const SIZE_MEMBERS = membersOf<PricedSize>()(["widthMm", "amountMinor"]);

const TIER_IDENTITY_MEMBERS = membersOf<TierIdentity>()([
  "tierId",
  "ruleId",
  "name",
  "description",
  "nameKey",
  "descriptionKey",
]);

const HARDWARE_MEMBERS = [
  ...TIER_IDENTITY_MEMBERS,
  ...membersOf<Omit<HardwareTier, keyof TierIdentity>>()([
    "perHingeMinor",
    "perDrawerMinor",
    "perPushToOpenMinor",
  ]),
] as const;

const MATERIAL_MEMBERS = [
  ...TIER_IDENTITY_MEMBERS,
  ...membersOf<Omit<MaterialTier, keyof TierIdentity>>()(["percentOfCabinets"]),
] as const;

const ACCESSORY_MEMBERS = membersOf<AccessoryRule>()([
  "ruleId",
  "name",
  "description",
  "nameKey",
  "descriptionKey",
  "perUnitMinor",
]);

/** A created accessory states authored Romanian and no key (A-21), so none is listed. */
const LINKED_ACCESSORY_MEMBERS = membersOf<LinkedAccessoryRule>()([
  "accessoryId",
  "ruleId",
  "linkedBuildId",
  "perUnitMinor",
  "name",
  "description",
]);

const ACCESSORIES_MEMBERS = membersOf<BookAccessories>()([
  "sinkProtectiveCover",
  "dishDryingRack",
]);

const DEPTH_RULE_MEMBERS = membersOf<DepthRule>()(["deepCabinetPercent"]);

/** The members of `source` that `members` names and `source` holds, copied; the rest are not read. */
function picked(
  source: unknown,
  members: readonly string[],
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  if (typeof source !== "object" || source === null) return copy;
  for (const member of members) {
    if (!Object.hasOwn(source, member)) continue;
    const value = (source as Record<string, unknown>)[member];
    if (value !== undefined) copy[member] = value;
  }
  return copy;
}

function listed(
  source: unknown,
  project: (element: unknown) => unknown,
): unknown[] {
  return Array.isArray(source) ? source.map(project) : [];
}

function projectFormula(formula: unknown): unknown {
  const projected = picked(formula, FORMULA_MEMBERS);
  const declared = formula as { readonly sizes?: unknown } | null;
  if (declared !== null && Array.isArray(declared.sizes)) {
    projected.sizes = listed(declared.sizes, (size) =>
      picked(size, SIZE_MEMBERS),
    );
  }
  return projected;
}

function projectRule(rule: unknown): unknown {
  const projected = picked(rule, RULE_MEMBERS);
  projected.formula = projectFormula((rule as { formula?: unknown }).formula);
  return projected;
}

function projectGroup<Tier extends TierIdentity>(
  group: unknown,
  members: readonly string[],
): TierGroup<Tier> {
  const declared = group as {
    readonly defaultTierId?: unknown;
    readonly tiers?: unknown;
  };
  return {
    defaultTierId: declared.defaultTierId,
    tiers: listed(declared.tiers, (tier) => picked(tier, members)),
  } as TierGroup<Tier>;
}

function projectAccessories(accessories: unknown): unknown {
  const projected: Record<string, unknown> = {};
  for (const id of ACCESSORIES_MEMBERS) {
    const rule = (accessories as Record<string, unknown>)[id];
    projected[id] = picked(rule, ACCESSORY_MEMBERS);
  }
  return projected;
}

/**
 * The book as declared and nothing more. It takes a book `parsePriceBook` has read, so every list and group named here is
 * present; a member left out of a list above is the only way a price member is lost, and the lists are exhaustive by type.
 */
export function projectPriceBook(book: PriceBook): PriceBook {
  const projected = picked(book, BOOK_MEMBERS);
  projected.cabinetRules = listed(book.cabinetRules, projectRule);
  projected.hardware = projectGroup<HardwareTier>(
    book.hardware,
    HARDWARE_MEMBERS,
  );
  projected.material = projectGroup<MaterialTier>(
    book.material,
    MATERIAL_MEMBERS,
  );
  projected.depthRule = picked(book.depthRule, DEPTH_RULE_MEMBERS);
  projected.accessories = projectAccessories(book.accessories);
  projected.linkedAccessories = listed(book.linkedAccessories, (linked) =>
    picked(linked, LINKED_ACCESSORY_MEMBERS),
  );
  return projected as unknown as PriceBook;
}
