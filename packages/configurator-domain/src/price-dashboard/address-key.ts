import { isRecord } from "../pricing/book-reading.js";

import {
  BOOK_FIELD_ADDRESS_KINDS,
  type BookFieldAddressKind,
} from "./book-field-address.js";

// The identity of a draft change's address: two changes name the same field exactly when their keys are equal. The
// draft keeps one change per address, so the key is also how a revert and a diff find a change.

/**
 * A stable identity for an address, whatever order its members were written in. Equal keys are the same field. Total
 * over anything a draft may hold: a shape that is not a valid address (no kind, no `item`, a member of the wrong type)
 * gets a key containing an object, which no valid address's key does, so it equals no valid address.
 */
export function addressKey(address: unknown): string {
  if (!isRecord(address)) return INVALID_ADDRESS_KEY;
  const kind = address["kind"];
  const members = isAddressKind(kind)
    ? addressMembers(kind, address)
    : undefined;
  return JSON.stringify([kind, ...(members ?? [INVALID_MEMBER])]);
}

export function isSameAddress(left: unknown, right: unknown): boolean {
  return addressKey(left) === addressKey(right);
}

const INVALID_MEMBER = { invalid: true } as const;
const INVALID_ADDRESS_KEY = JSON.stringify([INVALID_MEMBER]);

function isAddressKind(kind: unknown): kind is BookFieldAddressKind {
  return (
    typeof kind === "string" &&
    (BOOK_FIELD_ADDRESS_KINDS as readonly string[]).includes(kind)
  );
}

function addressMembers(
  kind: BookFieldAddressKind,
  address: Record<string, unknown>,
): readonly unknown[] | undefined {
  switch (kind) {
    case "cabinet":
      return validMembers(address, ["ruleId", "field"]);
    case "cabinet-size":
      return validMembers(address, ["ruleId", "widthMm"]);
    case "hardware":
    case "material":
      return validMembers(address, ["tierId", "field"]);
    case "accessory":
      return validMembers(address, ["accessoryId", "field"]);
    case "depth-rule":
    case "provisional":
      return [];
    case "hardware-tier-created":
      return validMembers(address, ["tierId"]);
    case "accessory-created":
      return validMembers(address, ["accessoryId"]);
    case "created-row-text":
      return withItem(address, ["field"]);
    case "item-deleted":
      return withItem(address, []);
  }
}

/** The named members, each a string or a number, or `undefined` when one is missing or of another type. */
function validMembers(
  address: Record<string, unknown>,
  names: readonly string[],
): readonly unknown[] | undefined {
  const members = names.map((name) => address[name]);
  const isValid = members.every(
    (member) => typeof member === "string" || typeof member === "number",
  );
  return isValid ? members : undefined;
}

/** An item reference flattened to its kind and id, then the named members. */
function withItem(
  address: Record<string, unknown>,
  names: readonly string[],
): readonly unknown[] | undefined {
  const item = address["item"];
  if (!isRecord(item)) return undefined;
  const itemMembers = validMembers(item, ["kind", itemIdName(item["kind"])]);
  const rest = validMembers(address, names);
  return itemMembers === undefined || rest === undefined
    ? undefined
    : [...itemMembers, ...rest];
}

/** The member an item of this kind names its id in. */
function itemIdName(kind: unknown): string {
  return kind === "accessory" ? "accessoryId" : "tierId";
}
