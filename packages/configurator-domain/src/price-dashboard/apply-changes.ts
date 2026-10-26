import { MAX_IDENTIFIER_LENGTH } from "../design-bounds.js";
import { isRecord } from "../pricing/book-reading.js";
import { parsePriceBook } from "../pricing/parse-price-book.js";
import type { PricingFailure } from "../pricing/price-lines.js";
import type { PriceBook } from "../pricing/price-book.js";

import {
  BOOK_FIELD_ADDRESS_KINDS,
  type BookFieldAddress,
  type DraftChange,
} from "./book-field-address.js";
import {
  isSameAddress,
  prepareWrite,
  type BookUpdater,
  type ChangeRefusalCode,
} from "./editable-fields.js";

// The candidate book a draft would publish: `apply(activeBook, changes)` (plan A-15), pure, never mutating its input.
// Changes apply in order, so a later change of an equal address wins (X0-4). Every change is judged against the book it
// is applied to; one refused change refuses the whole candidate, and the result names each refused change by index.

/** One refused change: where it sits in the list and the closed code it was refused for. Never the value. */
export interface ChangeRefusal {
  readonly index: number;
  readonly code: ChangeRefusalCode;
}

export type ApplyChangesResult =
  | { readonly ok: true; readonly book: PriceBook }
  | {
      readonly ok: false;
      readonly reason: "changes-refused";
      readonly refusals: readonly ChangeRefusal[];
    }
  | {
      /** Every change was accepted and the book they make is not a book: a defect, not a person's mistake. */
      readonly ok: false;
      readonly reason: "candidate-refused";
      readonly failure: PricingFailure;
    };

/** The changes `applyChanges` applies: prices, sizes, the depth rule and the provisional switch. Bulk actions are
 *  price changes sharing a `groupId`. */
export function applyChanges(
  book: PriceBook,
  changes: readonly DraftChange[],
): ApplyChangesResult {
  const refusals: ChangeRefusal[] = [];
  const updaters: BookUpdater[] = [];
  changes.forEach((change, index) => {
    const judged = judgeChange(book, change, index);
    if ("code" in judged) refusals.push(judged);
    else updaters.push(judged);
  });
  if (refusals.length > 0)
    return { ok: false, reason: "changes-refused", refusals };
  return parseCandidate(updaters.reduce((current, set) => set(current), book));
}

/** The draft without the change that names `address`. A draft holds one change per address, so this removes one. */
export function revertChange(
  changes: readonly DraftChange[],
  address: BookFieldAddress,
): readonly DraftChange[] {
  return changes.filter((change) => !isSameAddress(change.address, address));
}

function parseCandidate(candidate: PriceBook): ApplyChangesResult {
  const parsed = parsePriceBook(candidate);
  return parsed.ok
    ? { ok: true, book: parsed.book }
    : { ok: false, reason: "candidate-refused", failure: parsed.failure };
}

/** The updater that makes one change, or the refusal. Takes `unknown`: a draft is stored and requested JSON. */
function judgeChange(
  book: PriceBook,
  change: unknown,
  index: number,
): BookUpdater | ChangeRefusal {
  if (!isRecord(change) || !isReadableAddress(change["address"]))
    return { index, code: "UNKNOWN_ADDRESS" };
  const address = change["address"];
  const prepared = prepareWrite(book, address, change["value"]);
  if (!prepared.isOk) return { index, code: prepared.code };
  return isGroupable(address, change["groupId"])
    ? prepared.value
    : { index, code: "NOT_EDITABLE" };
}

function isReadableAddress(address: unknown): address is BookFieldAddress {
  return (
    isRecord(address) &&
    typeof address["kind"] === "string" &&
    (BOOK_FIELD_ADDRESS_KINDS as readonly string[]).includes(address["kind"])
  );
}

/** A bulk action scales cabinet prices only (A-14): a percentage, a rate or a flag has no place in a group. */
function isGroupable(address: BookFieldAddress, groupId: unknown): boolean {
  if (groupId === undefined) return true;
  return (
    isUsableGroupId(groupId) &&
    (address.kind === "cabinet" || address.kind === "cabinet-size")
  );
}

function isUsableGroupId(groupId: unknown): boolean {
  return (
    typeof groupId === "string" &&
    groupId !== "" &&
    groupId.length <= MAX_IDENTIFIER_LENGTH
  );
}
