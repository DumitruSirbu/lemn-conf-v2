// A book row states exactly the members its type declares. A tier or an accessory carrying any other key is refused,
// named by the row: the key would sit in the book unpriced while a dashboard offered it for editing, and a stray flat
// amount beside a percentage would be silently dropped from every price (M10 P3-Q3). The refusal names the key the book
// declared and never a retired field, so this module needs to know none. Every read goes through `readDeclared`.
import {
  boundedListOf,
  idAsText,
  isRecord,
  readDeclared,
  refuseUnreadFields,
} from "./book-reading.js";
import {
  ACCESSORY_IDS,
  type AccessoryRule,
  type HardwareTier,
  type LinkedAccessoryRule,
  type MaterialTier,
  type TierIdentity,
} from "./price-book.js";
import type { PricingFailure } from "./price-lines.js";

/**
 * A list of the members of one declared type, accepted only when it names every member: a name that is not a member
 * fails to compile, and so does a member left out. A field added to a row type cannot be refused as stray by a build
 * that forgot to list it.
 */
function membersOf<Declared>() {
  return <const List extends readonly (keyof Declared & string)[]>(
    list: List &
      ([Exclude<keyof Declared, List[number]>] extends [never]
        ? unknown
        : never),
  ): List => list;
}

const TIER_IDENTITY_MEMBERS = membersOf<TierIdentity>()([
  "tierId",
  "ruleId",
  "name",
  "description",
  "nameKey",
  "descriptionKey",
]);

const HARDWARE_TIER_MEMBERS: readonly string[] = [
  ...TIER_IDENTITY_MEMBERS,
  ...membersOf<Omit<HardwareTier, keyof TierIdentity>>()([
    "perHingeMinor",
    "perDrawerMinor",
    "perPushToOpenMinor",
  ]),
];

const MATERIAL_TIER_MEMBERS: readonly string[] = [
  ...TIER_IDENTITY_MEMBERS,
  ...membersOf<Omit<MaterialTier, keyof TierIdentity>>()(["percentOfCabinets"]),
];

const ACCESSORY_MEMBERS: readonly string[] = membersOf<AccessoryRule>()([
  "ruleId",
  "name",
  "description",
  "nameKey",
  "descriptionKey",
  "perUnitMinor",
]);

/** A created accessory states its words in Romanian alone: no key into the message files, and no Russian field. A field
 *  added to the rule is refused as stray until the list names it, and this list is the only thing that refuses one. */
const LINKED_ACCESSORY_MEMBERS: readonly string[] =
  membersOf<LinkedAccessoryRule>()([
    "accessoryId",
    "ruleId",
    "linkedBuildId",
    "perUnitMinor",
    "name",
    "description",
  ]);

interface RowKind {
  /** The row as a refusal names its shape: "hardware tier". */
  readonly shape: string;
  readonly members: readonly string[];
}

const HARDWARE_TIER: RowKind = {
  shape: "hardware tier",
  members: HARDWARE_TIER_MEMBERS,
};
const MATERIAL_TIER: RowKind = {
  shape: "material tier",
  members: MATERIAL_TIER_MEMBERS,
};
const ACCESSORY: RowKind = { shape: "accessory", members: ACCESSORY_MEMBERS };
const LINKED_ACCESSORY: RowKind = {
  shape: "linked accessory",
  members: LINKED_ACCESSORY_MEMBERS,
};

/** The parser's own bounds on the lists a row sits in, passed in so the two cannot differ. */
export interface RowListBounds {
  readonly maxTiersPerGroup: number;
  readonly maxLinkedAccessories: number;
}

/** Run once the book's sections are established as readable, and after the percentage form is, so a book still in a
 *  retired form is refused for the member it lacks before one it carries too many of. Every kind of row the book holds
 *  is listed here: `membersOf` catches a member missing from a kind, never a kind missing from this function. */
export function refuseUndeclaredRowMembers(
  book: Record<string, unknown>,
  bounds: RowListBounds,
): PricingFailure | undefined {
  return (
    refuseUndeclaredTierMembers(
      readDeclared(book, "hardware"),
      HARDWARE_TIER,
      bounds.maxTiersPerGroup,
    ) ??
    refuseUndeclaredTierMembers(
      readDeclared(book, "material"),
      MATERIAL_TIER,
      bounds.maxTiersPerGroup,
    ) ??
    refuseUndeclaredAccessoryMembers(readDeclared(book, "accessories")) ??
    refuseUndeclaredLinkedAccessoryMembers(
      readDeclared(book, "linkedAccessories"),
      bounds.maxLinkedAccessories,
    )
  );
}

function refuseUndeclaredTierMembers(
  group: unknown,
  kind: RowKind,
  maxTiersPerGroup: number,
): PricingFailure | undefined {
  if (!isRecord(group)) return undefined;
  const tiers = boundedListOf(readDeclared(group, "tiers"), maxTiersPerGroup);
  for (const tier of tiers ?? []) {
    if (!isRecord(tier)) continue;
    const tierId = readDeclared(tier, "tierId");
    const refused = refuseUnreadFields(tier, kind.members, {
      shape: kind.shape,
      named: `${kind.shape} "${idAsText(tierId)}"`,
      ...(typeof tierId === "string" ? { id: tierId } : {}),
    });
    if (refused) return refused;
  }
  return undefined;
}

function refuseUndeclaredAccessoryMembers(
  accessories: unknown,
): PricingFailure | undefined {
  if (!isRecord(accessories)) return undefined;
  for (const accessoryId of ACCESSORY_IDS) {
    const row = readDeclared(accessories, accessoryId);
    if (!isRecord(row)) continue;
    const refused = refuseUnreadFields(row, ACCESSORY.members, {
      shape: ACCESSORY.shape,
      named: `${ACCESSORY.shape} "${accessoryId}"`,
      id: accessoryId,
    });
    if (refused) return refused;
  }
  return undefined;
}

function refuseUndeclaredLinkedAccessoryMembers(
  declared: unknown,
  maxLinkedAccessories: number,
): PricingFailure | undefined {
  const rows = boundedListOf(declared, maxLinkedAccessories);
  for (const row of rows ?? []) {
    if (!isRecord(row)) continue;
    const accessoryId = readDeclared(row, "accessoryId");
    const refused = refuseUnreadFields(row, LINKED_ACCESSORY.members, {
      shape: LINKED_ACCESSORY.shape,
      named: `${LINKED_ACCESSORY.shape} "${idAsText(accessoryId)}"`,
      ...(typeof accessoryId === "string" ? { id: accessoryId } : {}),
    });
    if (refused) return refused;
  }
  return undefined;
}
