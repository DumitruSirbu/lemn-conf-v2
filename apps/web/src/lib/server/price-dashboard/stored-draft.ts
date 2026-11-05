import {
  BOOK_FIELD_ADDRESS_KINDS,
  readBulk,
  type BookFieldAddress,
  type DraftBulk,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { readDraftAddress } from "@/lib/server/price-dashboard/draft-address";
import {
  hasMemberOutside,
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";

// A stored draft is jsonb: it was written by this build, but the database is not part of its type system, so every change
// is rebuilt member by member before anything judges or serves it. A change that is not exactly what a draft holds makes the
// whole draft unreadable; a route never serves, and never applies, a part of it.

export type StoredDraftReading =
  | { readonly ok: true; readonly changes: readonly DraftChange[] }
  | { readonly ok: false };

/** `stored` is whatever the store answered: a draft that is not a list at all is unreadable, never a thrown error. */
export function readStoredDraft(stored: unknown): StoredDraftReading {
  if (!Array.isArray(stored)) return { ok: false };
  const changes: DraftChange[] = [];
  for (const declared of stored as readonly unknown[]) {
    const change = readStoredChange(declared);
    if (change === undefined) return { ok: false };
    changes.push(change);
  }
  return { ok: true, changes };
}

function readStoredChange(declared: unknown): DraftChange | undefined {
  if (!isPlainRecord(declared)) return undefined;
  const members = declared;
  const address = readDraftAddress(members.address, BOOK_FIELD_ADDRESS_KINDS);
  if (address.kind !== "address") return undefined;
  const value = readStoredValue(address.address, members.value);
  const grouping = readGrouping(members);
  if (!value.ok || grouping === undefined) return undefined;
  return {
    address: address.address,
    value: value.value,
    ...grouping,
  } as DraftChange;
}

type ValueReading =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };

const UNREADABLE_VALUE: ValueReading = { ok: false };

/** The value a change of this kind holds, rebuilt member by member where it is an object; the domain judges its content. */
function readStoredValue(
  address: BookFieldAddress,
  value: unknown,
): ValueReading {
  switch (address.kind) {
    case "hardware-tier-created":
      return readTierCreationValue(value);
    case "accessory-created":
      return readAccessoryCreationValue(value);
    case "created-row-text":
      return typeof value === "string" ? { ok: true, value } : UNREADABLE_VALUE;
    case "item-deleted":
      return value === true ? { ok: true, value } : UNREADABLE_VALUE;
    default:
      return isNumberOrFlag(value) ? { ok: true, value } : UNREADABLE_VALUE;
  }
}

const TIER_CREATION_MEMBERS = ["name", "description"];
const ACCESSORY_CREATION_MEMBERS = [
  "linkedBuildId",
  "perUnitMinor",
  "name",
  "description",
];

function readTierCreationValue(value: unknown): ValueReading {
  if (!isPlainRecord(value) || hasMemberOutside(value, TIER_CREATION_MEMBERS)) {
    return UNREADABLE_VALUE;
  }
  const { name, description } = value;
  return typeof name === "string" && typeof description === "string"
    ? { ok: true, value: { name, description } }
    : UNREADABLE_VALUE;
}

/** A description may be left out, which reads as empty. */
function readAccessoryCreationValue(value: unknown): ValueReading {
  if (
    !isPlainRecord(value) ||
    hasMemberOutside(value, ACCESSORY_CREATION_MEMBERS)
  ) {
    return UNREADABLE_VALUE;
  }
  const { linkedBuildId, perUnitMinor, name, description } = value;
  const isDescriptionRight =
    description === undefined || typeof description === "string";
  if (
    typeof linkedBuildId !== "string" ||
    typeof perUnitMinor !== "number" ||
    typeof name !== "string" ||
    !isDescriptionRight
  ) {
    return UNREADABLE_VALUE;
  }
  const words = description === undefined ? {} : { description };
  return {
    ok: true,
    value: { linkedBuildId, perUnitMinor, name, ...words },
  };
}

function isNumberOrFlag(value: unknown): value is number | boolean {
  return typeof value === "number" || typeof value === "boolean";
}

interface Grouping {
  readonly groupId?: string;
  readonly bulk?: DraftBulk;
}

/** `groupId` and `bulk` come together or not at all; `undefined` is a pair that does not. */
function readGrouping(
  members: Readonly<Record<string, unknown>>,
): Grouping | undefined {
  const groupId = members.groupId;
  const declaredBulk = members.bulk;
  if (groupId === undefined && declaredBulk === undefined) return {};
  const bulk = readBulk(declaredBulk);
  if (!isIdentifier(groupId) || bulk === undefined) return undefined;
  return { groupId, bulk: copiedBulk(bulk) };
}

function copiedBulk(bulk: DraftBulk): DraftBulk {
  const { percent, scope, groupCode } = bulk;
  return groupCode === undefined
    ? { percent, scope }
    : { percent, scope, groupCode };
}
