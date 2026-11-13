import {
  ACCESSORY_FIELDS,
  BOOK_FIELD_ADDRESS_KINDS,
  CABINET_RULE_FIELDS,
  CREATED_ROW_TEXT_FIELDS,
  HARDWARE_RATE_FIELDS,
  ITEM_ID_MEMBER_OF_KIND,
  MATERIAL_FIELDS,
  type AddressOfKind,
  type BookFieldAddressKind,
  type CreatedRowItemRef,
  type DeletableItemRef,
} from "@lemnaria/configurator-domain";

import {
  hasMemberOutside,
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";

// An address read from outside TypeScript, a request's or a stored draft's: rebuilt member by member from the members its
// kind names, so nothing a crafted body adds ever reaches the draft's jsonb. The caller names the kinds it takes; a kind
// the address has but the caller did not name is answered before any member is read.

export type AddressReading<Address> =
  | { readonly kind: "address"; readonly address: Address }
  /** A kind some address has, which the caller did not take. */
  | { readonly kind: "not-accepted" }
  /** Not an object, a kind no address has, or a member missing or of another type. */
  | { readonly kind: "unknown" }
  /** A member the kind does not name. The request is one this route does not read. */
  | { readonly kind: "extra-member" };

type MemberReading =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reading: "unknown" | "extra-member" };

type DeletableItemKind = DeletableItemRef["kind"];
type CreatedRowItemKind = CreatedRowItemRef["kind"];

/** The item kinds a row's words or deletion may name, and the member each names its id in. */
const ITEM_ID_MEMBER: Readonly<
  Record<DeletableItemKind, "tierId" | "accessoryId">
> = {
  hardware: ITEM_ID_MEMBER_OF_KIND.hardware,
  material: ITEM_ID_MEMBER_OF_KIND.material,
  accessory: ITEM_ID_MEMBER_OF_KIND.accessory,
};
const DELETABLE_ITEM_KINDS = Object.keys(ITEM_ID_MEMBER) as DeletableItemKind[];
const CREATED_ROW_ITEM_KINDS: readonly CreatedRowItemKind[] = [
  "hardware",
  "accessory",
];

const MEMBERS_OF_KIND: Readonly<
  Record<BookFieldAddressKind, readonly string[]>
> = {
  cabinet: ["ruleId", "field"],
  "cabinet-size": ["ruleId", "widthMm"],
  hardware: ["tierId", "field"],
  material: ["tierId", "field"],
  "depth-rule": [],
  accessory: ["accessoryId", "field"],
  provisional: [],
  "hardware-tier-created": ["tierId"],
  "accessory-created": ["accessoryId"],
  "created-row-text": ["item", "field"],
  "item-deleted": ["item"],
};

/** The `field` each kind that has one may name: the closed list of its row. A word outside it is no address. */
const FIELDS_OF_KIND: Readonly<
  Partial<Record<BookFieldAddressKind, readonly string[]>>
> = {
  cabinet: CABINET_RULE_FIELDS,
  hardware: HARDWARE_RATE_FIELDS,
  material: MATERIAL_FIELDS,
  accessory: ACCESSORY_FIELDS,
  "created-row-text": CREATED_ROW_TEXT_FIELDS,
};

const NUMBER_MEMBERS: readonly string[] = ["widthMm"];

/** The item kinds the member `item` of a kind may name; the kinds without an `item` member name none. */
const ITEM_KINDS_OF_ADDRESS: Readonly<
  Partial<Record<BookFieldAddressKind, readonly DeletableItemKind[]>>
> = {
  "created-row-text": CREATED_ROW_ITEM_KINDS,
  "item-deleted": DELETABLE_ITEM_KINDS,
};

export function readDraftAddress<Kind extends BookFieldAddressKind>(
  declared: unknown,
  accepts: readonly Kind[],
): AddressReading<AddressOfKind<Kind>> {
  if (!isPlainRecord(declared)) return { kind: "unknown" };
  const kind = declared.kind;
  if (!isAddressKind(kind)) return { kind: "unknown" };
  if (!(accepts as readonly string[]).includes(kind)) {
    return { kind: "not-accepted" };
  }
  const names = MEMBERS_OF_KIND[kind];
  if (hasMemberOutside(declared, ["kind", ...names])) {
    return { kind: "extra-member" };
  }
  const members: Record<string, unknown> = { kind };
  for (const name of names) {
    const member = readMember(kind, name, declared[name]);
    if (!member.ok) return { kind: member.reading };
    members[name] = member.value;
  }
  return { kind: "address", address: members as AddressOfKind<Kind> };
}

function readMember(
  kind: BookFieldAddressKind,
  name: string,
  member: unknown,
): MemberReading {
  if (name === "item") {
    return readItem(ITEM_KINDS_OF_ADDRESS[kind] ?? [], member);
  }
  const fields = FIELDS_OF_KIND[kind];
  const isRight =
    name === "field" && fields !== undefined
      ? fields.includes(member as string)
      : isMemberOfRightType(name, member);
  return isRight
    ? { ok: true, value: member }
    : { ok: false, reading: "unknown" };
}

/** An item reference rebuilt from its kind and the one id member that kind names. */
function readItem(
  itemKinds: readonly DeletableItemKind[],
  declared: unknown,
): MemberReading {
  if (!isPlainRecord(declared)) return { ok: false, reading: "unknown" };
  const itemKind = itemKinds.find((known) => known === declared.kind);
  if (itemKind === undefined) return { ok: false, reading: "unknown" };
  const idMember = ITEM_ID_MEMBER[itemKind];
  if (hasMemberOutside(declared, ["kind", idMember])) {
    return { ok: false, reading: "extra-member" };
  }
  const id = declared[idMember];
  return isIdentifier(id)
    ? { ok: true, value: { kind: itemKind, [idMember]: id } }
    : { ok: false, reading: "unknown" };
}

function isMemberOfRightType(name: string, member: unknown): boolean {
  if (NUMBER_MEMBERS.includes(name)) {
    return typeof member === "number" && Number.isFinite(member);
  }
  return isIdentifier(member);
}

function isAddressKind(kind: unknown): kind is BookFieldAddressKind {
  return (BOOK_FIELD_ADDRESS_KINDS as readonly unknown[]).includes(kind);
}
