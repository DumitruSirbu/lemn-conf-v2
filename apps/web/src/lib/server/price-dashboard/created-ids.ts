import "server-only";

import { randomBytes } from "node:crypto";

import {
  ACCESSORY_IDS,
  HandleSchema,
  PALETTE_ENTRY_IDS,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

// The id of a row the dashboard creates is minted here and never taken from a request. One namespace serves
// every kind of row, so a class can never take an accessory's id nor the reverse, and the draw is random: an id derived
// from the name or a counter could be guessed, or issued again after the draft that held it was discarded.

/** The last path segment of a "new row" page: a row named so could not be opened. */
const NEW_ROW_SEGMENT = "new";

const ID_LENGTH = 21;

/**
 * Letters and digits only. A created id is named in an audit detail, whose ids begin with a letter or a digit, and in a
 * path segment, so the `-` and `_` a version's id may hold are left out.
 */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A byte at or above the largest multiple of the alphabet's size that a byte holds would favour the first characters. */
const UNBIASED_BYTE_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/** Drawing a taken id again is as unlikely as guessing one: a source that keeps answering one is a defect, not a retry. */
const MAX_ATTEMPTS = 8;

/** A draw of bytes loses 3 in 100 to the limit, so a second is rarely asked for; a source that never gives enough is a defect. */
const MAX_DRAWS_PER_ID = 8;

export type RandomSource = (byteCount: number) => Uint8Array;

/**
 * The ids a minted id is checked against: the active book's, the draft's, and every built-in and keyed id. Past those
 * (the books of earlier versions, a draft discarded since) nothing is checked, and uniqueness rests on the draw: about
 * 125 bits of it.
 */
export function takenIdsOf(
  book: PriceBook,
  draftChanges: readonly DraftChange[],
): ReadonlySet<string> {
  return new Set([
    NEW_ROW_SEGMENT,
    ...ACCESSORY_IDS,
    ...PALETTE_ENTRY_IDS,
    ...HandleSchema.options,
    ...idsOfBook(book),
    ...draftChanges.flatMap(idsNamedBy),
  ]);
}

/** An id of letters and digits, drawn until it is not in `taken`; `taken` is left as it is. */
export function mintCreatedId(
  taken: ReadonlySet<string>,
  source: RandomSource = randomBytes,
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = drawnId(source);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("created-id source answered only taken ids");
}

function drawnId(source: RandomSource): string {
  let id = "";
  for (
    let draw = 0;
    draw < MAX_DRAWS_PER_ID && id.length < ID_LENGTH;
    draw += 1
  ) {
    id = withBytesOf(id, source(ID_LENGTH));
  }
  if (id.length < ID_LENGTH) {
    throw new Error("created-id source answered too few usable bytes");
  }
  return id;
}

function withBytesOf(id: string, bytes: Uint8Array): string {
  let extended = id;
  for (const byte of bytes) {
    if (extended.length === ID_LENGTH) break;
    if (byte < UNBIASED_BYTE_LIMIT) {
      extended += ALPHABET.charAt(byte % ALPHABET.length);
    }
  }
  return extended;
}

function idsOfBook(book: PriceBook): readonly string[] {
  const linked = linkedAccessoriesOf(book);
  const rules = [...book.cabinetRules, ...linked].map(({ ruleId }) => ruleId);
  const tiers = [...book.hardware.tiers, ...book.material.tiers].flatMap(
    ({ tierId, ruleId }) => [tierId, ruleId],
  );
  const accessories = linked.map(({ accessoryId }) => accessoryId);
  return [...rules, ...tiers, ...accessories];
}

/** A book stored before linked accessories existed declares none, although `PriceBook` types the section as required. */
function linkedAccessoriesOf(
  book: Partial<Pick<PriceBook, "linkedAccessories">>,
): NonNullable<PriceBook["linkedAccessories"]> {
  return book.linkedAccessories ?? [];
}

const ID_MEMBERS = ["tierId", "accessoryId", "finishId", "handle"] as const;

/** Every id a change names, as its address or the item it is about states it: a creation the draft has since deleted
 *  still names its id, which is never given to a row again. */
function idsNamedBy({ address }: DraftChange): readonly string[] {
  return [address, Reflect.get(address, "item")].flatMap(idsOfMembers);
}

function idsOfMembers(members: unknown): readonly string[] {
  if (typeof members !== "object" || members === null) return [];
  return ID_MEMBERS.flatMap((name) => {
    const id: unknown = Reflect.get(members, name);
    return typeof id === "string" ? [id] : [];
  });
}
