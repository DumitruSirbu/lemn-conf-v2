import {
  BOOK_FIELD_ADDRESS_KINDS,
  CREATED_ROW_TEXT_FIELDS,
  type AddressOfKind,
  type BookFieldAddressKind,
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

/** The item kinds a row's words or deletion may name, and the member each names its id in. */
const ITEM_ID_MEMBER: Readonly<Record<string, string>> = {
  hardware: "tierId",
  material: "tierId",
  accessory: "accessoryId",
};
const CREATED_ROW_ITEM_KINDS: readonly string[] = ["hardware", "accessory"];

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

/**
 * The kinds whose `field` is read against a closed list. The older kinds' fields are judged by `applyChanges`, which
 * answers a word outside its list as an unknown address of the change.
 */
const FIELDS_OF_KIND: Readonly<
  Partial<Record<BookFieldAddressKind, readonly string[]>>
> = {
  "created-row-text": CREATED_ROW_TEXT_FIELDS,
};

const NUMBER_MEMBERS: readonly string[] = ["widthMm"];

/** The item kinds the member `item` of a kind may name; the kinds without an `item` member name none. */
const ITEM_KINDS_OF_ADDRESS: Readonly<
  Partial<Record<BookFieldAddressKind, readonly string[]>>
> = {
  "created-row-text": CREATED_ROW_ITEM_KINDS,
  "item-deleted": Object.keys(ITEM_ID_MEMBER),
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
  if (name === "item")
    return readItem(ITEM_KINDS_OF_ADDRESS[kind] ?? [], member);
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
  itemKinds: readonly string[],
  declared: unknown,
): MemberReading {
  if (!isPlainRecord(declared)) return { ok: false, reading: "unknown" };
  const itemKind = declared.kind;
  if (typeof itemKind !== "string" || !itemKinds.includes(itemKind)) {
    return { ok: false, reading: "unknown" };
  }
  const idMember = ITEM_ID_MEMBER[itemKind];
  if (idMember === undefined) return { ok: false, reading: "unknown" };
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
