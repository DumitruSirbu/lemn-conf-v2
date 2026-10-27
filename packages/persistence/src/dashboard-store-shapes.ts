import { HandleSchema } from "@lemnaria/configurator-domain";
import type { ItemRef } from "@lemnaria/configurator-domain";

// The shapes the M10 stores refuse before any statement: the fakes and the Neon stores share them, so both turn away
// the same request. None of these reads a value as a number: a revision is an opaque digit run, and the only ordering
// of two of them is `isRevisionAhead`, which stands for the `bigint` comparison SQL makes and is never used to decide
// a write.

/** The id an item is known by within its kind, as the audit detail names it. */
export function itemIdOf(item: ItemRef): string {
  switch (item.kind) {
    case "material":
    case "hardware":
      return item.tierId;
    case "finish":
      return item.finishId;
    case "handle":
      return item.handle;
    case "accessory":
      return item.accessoryId;
  }
}

export function isNamedItem(item: ItemRef): boolean {
  const id: unknown = itemIdOf(item);
  return typeof id === "string" && id !== "";
}

/**
 * An item id as `catalogue_availability_changes.item_id` (`0025`) and an audit detail hold one: 1 to 64 characters, the
 * first a letter or a digit. The domain's audit reader checks the same shape for an id it is handed.
 */
const STORABLE_ITEM_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** The kinds whose id is free text of the shape above: every kind but the closed list of handles. */
const STORABLE_TIER_KINDS: readonly ItemRef["kind"][] = [
  "material",
  "hardware",
  "finish",
  "accessory",
];

/**
 * Whether the table (`0025`) can hold a row for the item **and the stores can read the row back**. The log is
 * append-only, so a row no reader accepts would make `readCurrent` fail for good: a handle must be one the design lists,
 * and every other kind is an id of the shape above.
 */
export function isStorableItem(item: ItemRef): boolean {
  if (item.kind === "handle") {
    return HandleSchema.safeParse(item.handle).success;
  }
  const id: unknown = itemIdOf(item);
  return (
    typeof id === "string" &&
    STORABLE_ITEM_ID_SHAPE.test(id) &&
    STORABLE_TIER_KINDS.includes(item.kind)
  );
}

export function isJsonObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A revision as a head or a row holds it: a digit run from 0, no leading zero, as wide as a `bigint`. */
const REVISION_SHAPE = /^(0|[1-9][0-9]{0,18})$/;

/** The widest revision a `bigint` column holds: a 19-digit run above it is a revision SQL would refuse to cast. */
const WIDEST_REVISION = "9223372036854775807";

/** Whether the text is a revision's digit shape and fits a `bigint`. Nothing here orders two revisions. */
export function isRevisionShape(value: unknown): value is string {
  return (
    typeof value === "string" &&
    REVISION_SHAPE.test(value) &&
    !isWiderThanABigint(value)
  );
}

/** Both are canonical digit runs, so of two of one length the greater is the greater as text. */
function isWiderThanABigint(canonicalDigits: string): boolean {
  return (
    canonicalDigits.length === WIDEST_REVISION.length &&
    canonicalDigits > WIDEST_REVISION
  );
}

/**
 * The most JSON a store sends for a book, a change summary or a draft's changes: 2 MiB of compact text. The tables check
 * 4 MiB of `jsonb` text (`0023`, `0024`; `0011`'s ceiling). `jsonb` prints a number out in full (5e-324 as 326
 * characters, 1e21 as 22), which no byte count of compact text bounds, so `isStorableJsonText` also refuses any number
 * that is not a safe integer: with only whole numbers `jsonb` adds a space after each colon and comma and nothing else,
 * which cannot double the length of compact JSON, so nothing it lets through is refused by a table.
 */
export const MAX_STORED_JSON_BYTES = 2_097_152;

/** A high surrogate with no low one after it, or a low one with no high one before it. */
const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Whether the JSON text is one a table takes and reads back as it was sent: at most `MAX_STORED_JSON_BYTES` of UTF-8,
 * every number a safe integer (every amount and percentage of a book is whole), and no string or key holding U+0000 or a
 * lone surrogate, which `jsonb` refuses (22P05, 22P02). The walk is iterative, so a deeply nested value cannot overflow
 * the stack.
 */
export function isStorableJsonText(jsonText: string): boolean {
  if (new TextEncoder().encode(jsonText).length > MAX_STORED_JSON_BYTES) {
    return false;
  }
  const parsed = parseOrUndefined(jsonText);
  if (parsed === undefined) return false;
  const pending: unknown[] = [parsed];
  while (pending.length > 0) {
    if (!isStorableLeafOrQueue(pending.pop(), pending)) return false;
  }
  return true;
}

/** The value of JSON text, or `undefined` for text no parser takes (a nesting deeper than the parser's stack). */
function parseOrUndefined(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    return undefined;
  }
}

/** Judges a leaf, or queues a container's members; `false` for a value a table would refuse. */
function isStorableLeafOrQueue(value: unknown, pending: unknown[]): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value === "string") return isStorableString(value);
  if (Array.isArray(value)) {
    for (const member of value as unknown[]) pending.push(member);
    return true;
  }
  if (typeof value === "object" && value !== null) {
    const members = value as Record<string, unknown>;
    for (const key of Object.keys(members)) {
      if (!isStorableString(key)) return false;
      pending.push(members[key]);
    }
  }
  return true;
}

function isStorableString(text: string): boolean {
  return !text.includes("\u0000") && !LONE_SURROGATE.test(text);
}

/** An id a store mints for a row: the shape of `accounts.id` and of a design's id, which the tables check. */
const MINTED_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

export function isMintedId(value: unknown): value is string {
  return typeof value === "string" && MINTED_ID_SHAPE.test(value);
}

/** The bounds of a version's authored text, as `0023` checks them (`MAX_BOOK_NAME_LENGTH`, `MAX_BOOK_DESCRIPTION_LENGTH`
 *  in the domain's price book parser), counted in characters as `char_length` counts them. */
export const MAX_VERSION_LABEL_CHARACTERS = 80;
export const MAX_VERSION_NOTE_CHARACTERS = 240;

export function isVersionLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !holdsNul(value) &&
    countCharacters(value) >= 1 &&
    countCharacters(value) <= MAX_VERSION_LABEL_CHARACTERS
  );
}

export function isVersionNote(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !holdsNul(value) &&
    countCharacters(value) <= MAX_VERSION_NOTE_CHARACTERS
  );
}

/** Unicode code points, which is what Postgres's `char_length` counts, where `String.length` counts UTF-16 units. */
function countCharacters(text: string): number {
  return Array.from(text).length;
}

/** A `text` column cannot hold U+0000, and the server refuses it with an error this store would report as a failure. */
function holdsNul(text: string): boolean {
  return text.includes("\u0000");
}
