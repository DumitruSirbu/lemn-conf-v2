import {
  isDesignRevisionShape,
  isPriceBookCurrency,
  type PricingFailureCode,
} from "@lemnaria/configurator-domain";

import type {
  StaffEstimateEmptyWire,
  StaffEstimateRefusedWire,
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
  StaffKitchenListWire,
  StaffKitchenMarkedListWire,
  StaffKitchenOpenedWire,
  StaffKitchenWire,
  StaffListedKitchenMarkedWire,
  StaffListedKitchenWire,
  StaffSeenMarkedWire,
} from "./staff-kitchens-wire-contract";
import { isCount, isInstant, ownValueOf } from "./staff-kitchens-wire-reading";

// What the staff list and the kitchen page answer beyond the shapes they had before the changed-after-seen mark: the
// mark itself, the revision the page displayed, and the two estimates. Each reader takes the body the older reader
// already judged and adds only its own members, so the older readers and their callers are untouched. A revision is
// opaque text: it is checked for its shape by the domain's one statement and never parsed, ordered or compared here.

const PRICING_FAILURE_CODES: Readonly<Record<PricingFailureCode, true>> = {
  INVALID_PRICE_BOOK: true,
  PRICING_VERSION_MISMATCH: true,
  UNKNOWN_BODY: true,
  NO_RULE_FOR_BODY: true,
  UNKNOWN_FORMULA_SHAPE: true,
  NO_PRICE_FOR_SIZE: true,
  UNKNOWN_TIER: true,
  REPLACEMENT_REQUIRED: true,
  UNDECLARED_HANDLE_COUNT: true,
  UNDECLARED_FRONT_POPULATION: true,
  UNBUILDABLE_DOOR_BAND: true,
  INVALID_AMOUNT: true,
};

/** The list with its marks, or nothing when the body is not the marked list the contract says: a row without a mark and
 *  a count that is not a count are both refused, so a badge is never hidden by an answer that forgot it. */
export function withMarksOfList(
  list: StaffKitchenListWire,
  body: unknown,
): StaffKitchenMarkedListWire | undefined {
  const changedCount = ownValueOf(body, "changedCount");
  const rawKitchens = ownValueOf(body, "kitchens");
  if (!isCount(changedCount) || !Array.isArray(rawKitchens)) return undefined;
  const markById = marksById(rawKitchens as readonly unknown[]);
  const kitchens = list.kitchens.map((kitchen) =>
    markedRowOf(kitchen, markById),
  );
  if (!kitchens.every(isMarkedRow)) return undefined;
  return { ...list, changedCount, kitchens };
}

/** What a raw row says of the mark, by the row's id: the first row naming an id is the one the older reader kept. */
function marksById(rawKitchens: readonly unknown[]): Map<string, RawMark> {
  const marks = new Map<string, RawMark>();
  for (const raw of rawKitchens) {
    const id = ownValueOf(raw, "id");
    if (typeof id === "string" && !marks.has(id)) {
      marks.set(id, {
        changedAfterSeen: ownValueOf(raw, "changedAfterSeen"),
        seenAt: ownValueOf(raw, "seenAt"),
      });
    }
  }
  return marks;
}

interface RawMark {
  readonly changedAfterSeen: unknown;
  readonly seenAt: unknown;
}

/** A row needs its mark and its seen instant, `null` or in the one form the server writes: a body that forgot either is
 *  refused, so a row never says "seen" from a member it did not read. */
function markedRowOf(
  kitchen: StaffListedKitchenWire,
  markById: ReadonlyMap<string, RawMark>,
): StaffListedKitchenMarkedWire | undefined {
  const mark = markById.get(kitchen.id);
  if (mark === undefined || typeof mark.changedAfterSeen !== "boolean") {
    return undefined;
  }
  const { seenAt } = mark;
  if (seenAt !== null && !isInstant(seenAt)) return undefined;
  return { ...kitchen, changedAfterSeen: mark.changedAfterSeen, seenAt };
}

function isMarkedRow(
  row: StaffListedKitchenMarkedWire | undefined,
): row is StaffListedKitchenMarkedWire {
  return row !== undefined;
}

/** The kitchen as the page opens it: the kitchen the older reader judged, its mark, the revision it displayed, and its
 *  two estimates. */
export function withMarksOfKitchen(
  kitchen: StaffKitchenWire,
  body: unknown,
): StaffKitchenOpenedWire | undefined {
  const changedAfterSeen = ownValueOf(body, "changedAfterSeen");
  const displayedRevision = ownValueOf(body, "displayedRevision");
  const estimates = estimatesFrom(body);
  if (typeof changedAfterSeen !== "boolean") return undefined;
  if (typeof displayedRevision !== "string") return undefined;
  if (!isDesignRevisionShape(displayedRevision)) return undefined;
  if (estimates === undefined) return undefined;
  return { ...kitchen, changedAfterSeen, displayedRevision, ...estimates };
}

function estimatesFrom(body: unknown): StaffKitchenEstimatesWire | undefined {
  const sentEstimate = sentEstimateFrom(ownValueOf(body, "sentEstimate"));
  const currentEstimate = currentEstimateFrom(
    ownValueOf(body, "currentEstimate"),
  );
  if (sentEstimate === undefined || currentEstimate === undefined) {
    return undefined;
  }
  return { sentEstimate: sentEstimate.value, currentEstimate };
}

function sentEstimateFrom(
  raw: unknown,
): { readonly value: StaffEstimateWire | null } | undefined {
  if (raw === null) return { value: null };
  const estimate = estimateFrom(raw);
  return estimate === undefined ? undefined : { value: estimate };
}

function currentEstimateFrom(
  raw: unknown,
):
  | StaffEstimateWire
  | StaffEstimateRefusedWire
  | StaffEstimateEmptyWire
  | undefined {
  const refused = ownValueOf(raw, "refused");
  if (refused !== undefined) {
    return isPricingFailureCode(refused) ? { refused } : undefined;
  }
  const empty = ownValueOf(raw, "empty");
  if (empty !== undefined) return empty === true ? { empty } : undefined;
  return estimateFrom(raw);
}

function estimateFrom(raw: unknown): StaffEstimateWire | undefined {
  const totalMinor = ownValueOf(raw, "totalMinor");
  const currency = ownValueOf(raw, "currency");
  if (!isCount(totalMinor) || !isPriceBookCurrency(currency)) return undefined;
  return { totalMinor, currency };
}

function isPricingFailureCode(value: unknown): value is PricingFailureCode {
  return (
    typeof value === "string" && Object.hasOwn(PRICING_FAILURE_CODES, value)
  );
}

/** `200` of a seen mark: whether the kitchen still reads as changed after it. */
export function seenMarkFrom(body: unknown): StaffSeenMarkedWire | undefined {
  const changedAfterSeen = ownValueOf(body, "changedAfterSeen");
  return typeof changedAfterSeen === "boolean"
    ? { changedAfterSeen }
    : undefined;
}
