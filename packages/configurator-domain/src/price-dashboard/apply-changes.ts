import { MAX_IDENTIFIER_LENGTH } from "../design-bounds.js";
import { isRecord } from "../pricing/book-reading.js";
import { parsePriceBook } from "../pricing/parse-price-book.js";
import type { PriceBook } from "../pricing/price-book.js";
import type { PricingFailure } from "../pricing/price-lines.js";
import {
  BULK_CHANGE_SCOPES,
  PRICE_GROUP_CODES,
} from "../staff/dashboard-audit-action.js";

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
  type Judged,
} from "./editable-fields.js";

// The candidate book a draft would publish: `apply(activeBook, changes)` (plan A-15), pure, never mutating its input.
// Changes apply in order, so a later change of an equal address wins (X0-4), and each is judged against the running
// candidate (the book with the earlier changes applied): a change may name a row an earlier change introduced, and is
// refused when moved ahead of it. One refused change refuses the whole candidate; the result names each by index.

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
 *  cabinet price changes sharing a `groupId` and one `bulk`. */
export function applyChanges(
  book: PriceBook,
  changes: readonly DraftChange[],
): ApplyChangesResult {
  const groupCodes = judgeGroups(changes);
  const refusals: ChangeRefusal[] = [];
  let candidate = book;
  changes.forEach((change, index) => {
    const judged = judgeChange(candidate, change);
    const code = judged.isOk ? groupCodes.get(index) : judged.code;
    if (code !== undefined) refusals.push({ index, code });
    else if (judged.isOk) candidate = judged.value(candidate);
  });
  if (refusals.length > 0)
    return { ok: false, reason: "changes-refused", refusals };
  return parseCandidate(candidate);
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

/** The updater that makes one change on `book`, or the code it is refused for. Takes `unknown`: a draft is stored and
 *  requested JSON. */
function judgeChange(book: PriceBook, change: unknown): Judged<BookUpdater> {
  if (!isRecord(change) || !isReadableAddress(change["address"]))
    return { isOk: false, code: "UNKNOWN_ADDRESS" };
  return prepareWrite(book, change["address"], change["value"]);
}

function isReadableAddress(address: unknown): address is BookFieldAddress {
  return (
    isRecord(address) &&
    typeof address["kind"] === "string" &&
    (BOOK_FIELD_ADDRESS_KINDS as readonly string[]).includes(address["kind"])
  );
}

/**
 * The code each grouped or bulk-marked change is refused for, by index. `groupId` and `bulk` come together or not at
 * all, a group holds cabinet prices only (A-14), and every change of one group carries the same `bulk` as the group's
 * first. Judged on the list as written, so it does not depend on the order the changes apply in.
 */
function judgeGroups(
  changes: readonly DraftChange[],
): ReadonlyMap<number, ChangeRefusalCode> {
  const codes = new Map<number, ChangeRefusalCode>();
  const firstBulkOfGroup = new Map<string, string>();
  changes.forEach((change: unknown, index) => {
    if (!isRecord(change)) return;
    const code = judgeMembership(change, firstBulkOfGroup);
    if (code !== undefined) codes.set(index, code);
  });
  return codes;
}

function judgeMembership(
  change: Record<string, unknown>,
  firstBulkOfGroup: Map<string, string>,
): ChangeRefusalCode | undefined {
  const groupId = change["groupId"];
  const bulk = change["bulk"];
  if (groupId === undefined && bulk === undefined) return undefined;
  if (
    !isUsableGroupId(groupId) ||
    bulk === undefined ||
    !isCabinetPrice(change)
  )
    return "NOT_EDITABLE";
  const malformed = judgeBulk(bulk);
  if (malformed !== undefined) return malformed;
  const key = bulkKey(bulk);
  const first = firstBulkOfGroup.get(groupId) ?? key;
  firstBulkOfGroup.set(groupId, first);
  return first === key ? undefined : "NOT_EDITABLE";
}

function isCabinetPrice(change: Record<string, unknown>): boolean {
  const address = change["address"];
  return (
    isRecord(address) &&
    (address["kind"] === "cabinet" || address["kind"] === "cabinet-size")
  );
}

function isUsableGroupId(groupId: unknown): groupId is string {
  return (
    typeof groupId === "string" &&
    groupId !== "" &&
    groupId.length <= MAX_IDENTIFIER_LENGTH
  );
}

const BULK_MEMBERS: readonly string[] = ["percent", "scope", "groupCode"];

/** A bulk action's shape: a whole percent, a known scope, a group code exactly when the scope is a group. Whether the
 *  percent is inside the bulk bound is M2's. */
function judgeBulk(bulk: unknown): ChangeRefusalCode | undefined {
  if (!isRecord(bulk)) return "NOT_EDITABLE";
  const percent = bulk["percent"];
  if (typeof percent !== "number" || !Number.isInteger(percent))
    return "NOT_A_WHOLE_NUMBER";
  if (Object.is(percent, -0)) return "NEGATIVE";
  const { scope, groupCode } = bulk;
  const isKnownScope = (BULK_CHANGE_SCOPES as readonly unknown[]).includes(
    scope,
  );
  const isGroupCodeKnown = (PRICE_GROUP_CODES as readonly unknown[]).includes(
    groupCode,
  );
  const hasUnknownMember = Object.keys(bulk).some(
    (member) => !BULK_MEMBERS.includes(member),
  );
  const isGroupCodeRight =
    scope === "group" ? isGroupCodeKnown : groupCode === undefined;
  return isKnownScope && isGroupCodeRight && !hasUnknownMember
    ? undefined
    : "NOT_EDITABLE";
}

function bulkKey(bulk: unknown): string {
  const { percent, scope, groupCode } = bulk as Record<string, unknown>;
  return JSON.stringify([percent, scope, groupCode ?? null]);
}
