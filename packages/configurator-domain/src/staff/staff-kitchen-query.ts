import {
  isPlainObject,
  ownValueOf,
  readTypedText,
  type TextRefusalCode,
} from "../contact/input-checks.js";

import { isRequestStatus, type RequestStatus } from "./request-status.js";

// What a staff member asks the kitchens list for: a segment, a status inside "sent", a search and a page. The
// members arrive as URL text; this reads them to a value or to the fields that are wrong, as codes (plan P-L3-4,
// P-L3-12, P-L3-13). Escaping the search for a SQL pattern, and case folding, belong to the store that runs it.

export const STAFF_KITCHEN_SEGMENTS = Object.freeze([
  "sent",
  "drafts",
  "all",
] as const);
export type StaffKitchenSegment = (typeof STAFF_KITCHEN_SEGMENTS)[number];

const SENT_SEGMENT = "sent" as const satisfies StaffKitchenSegment;

export const DEFAULT_STAFF_KITCHEN_SEGMENT = SENT_SEGMENT;

/** Characters, as code points, of the search text. */
export const STAFF_KITCHEN_SEARCH_MAX_LENGTH = 100;

export const STAFF_KITCHEN_PAGE_SIZE = 20;

const FIRST_PAGE = 1;

/** Digits only, no sign, no leading zero: the one way a page number is written. */
const PAGE_NUMBER_TEXT = /^[1-9][0-9]*$/;

export interface StaffKitchenQuery {
  readonly segment: StaffKitchenSegment;
  /** Set only under the "sent" segment. */
  readonly status: RequestStatus | null;
  /** The text as typed and trimmed, still unescaped; `null` for no search. */
  readonly search: string | null;
  /** From 1. */
  readonly page: number;
}

export type StaffKitchenQueryField =
  | "segment"
  | "status"
  | "q"
  | "page"
  | "query";

export type StaffKitchenQueryRefusalCode =
  | TextRefusalCode
  | "NOT_AN_OBJECT"
  | "UNKNOWN_VALUE"
  | "NOT_A_PAGE_NUMBER"
  | "STATUS_NEEDS_SENT_SEGMENT";

export interface StaffKitchenQueryIssue {
  readonly field: StaffKitchenQueryField;
  readonly code: StaffKitchenQueryRefusalCode;
}

export type StaffKitchenQueryReading =
  | { readonly ok: true; readonly query: StaffKitchenQuery }
  | { readonly ok: false; readonly issues: readonly StaffKitchenQueryIssue[] };

type FieldReading<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issue: StaffKitchenQueryIssue };

/**
 * `raw` holds the URL's members as text. A member that is absent or empty takes its default, and a member
 * this does not name is ignored. Every wrong field is reported, not only the first.
 */
export function readStaffKitchenQuery(raw: unknown): StaffKitchenQueryReading {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: "query", code: "NOT_AN_OBJECT" }] };
  }
  const segment = readSegment(ownValueOf(raw, "segment"));
  const status = readStatusFilter(ownValueOf(raw, "status"));
  const search = readSearch(ownValueOf(raw, "q"));
  const page = readPage(ownValueOf(raw, "page"));
  const statusConflicts = statusOutsideSentConflicts(segment, status);
  if (
    !segment.ok ||
    !status.ok ||
    !search.ok ||
    !page.ok ||
    statusConflicts.length > 0
  ) {
    const fieldIssues = [segment, status, search, page].flatMap(issueOf);
    return { ok: false, issues: [...fieldIssues, ...statusConflicts] };
  }
  return {
    ok: true,
    query: {
      segment: segment.value,
      status: status.value,
      search: search.value,
      page: page.value,
    },
  };
}

/** Rows to skip before `page`. */
export function staffKitchenOffsetOf(page: number): number {
  return (page - FIRST_PAGE) * STAFF_KITCHEN_PAGE_SIZE;
}

/** A status filter means something only under "sent": drafts and the union have no request to hold one. */
function statusOutsideSentConflicts(
  segment: FieldReading<StaffKitchenSegment>,
  status: FieldReading<RequestStatus | null>,
): readonly StaffKitchenQueryIssue[] {
  const isOutsideSent =
    segment.ok &&
    status.ok &&
    status.value !== null &&
    segment.value !== SENT_SEGMENT;
  return isOutsideSent
    ? [{ field: "status", code: "STATUS_NEEDS_SENT_SEGMENT" }]
    : [];
}

function readSegment(value: unknown): FieldReading<StaffKitchenSegment> {
  if (isAbsent(value)) return accepted(DEFAULT_STAFF_KITCHEN_SEGMENT);
  if (typeof value !== "string") return refused("segment", "NOT_TEXT");
  const segment = STAFF_KITCHEN_SEGMENTS.find((named) => named === value);
  return segment === undefined
    ? refused("segment", "UNKNOWN_VALUE")
    : accepted(segment);
}

function readStatusFilter(value: unknown): FieldReading<RequestStatus | null> {
  if (isAbsent(value)) return accepted(null);
  if (typeof value !== "string") return refused("status", "NOT_TEXT");
  return isRequestStatus(value)
    ? accepted(value)
    : refused("status", "UNKNOWN_VALUE");
}

function readSearch(value: unknown): FieldReading<string | null> {
  const reading = readTypedText(value, STAFF_KITCHEN_SEARCH_MAX_LENGTH);
  if (!reading.ok) return refused("q", reading.code);
  return accepted(reading.value === "" ? null : reading.value);
}

function readPage(value: unknown): FieldReading<number> {
  if (isAbsent(value)) return accepted(FIRST_PAGE);
  if (typeof value !== "string") return refused("page", "NOT_TEXT");
  if (!PAGE_NUMBER_TEXT.test(value)) {
    return refused("page", "NOT_A_PAGE_NUMBER");
  }
  const page = Number(value);
  return Number.isSafeInteger(page * STAFF_KITCHEN_PAGE_SIZE)
    ? accepted(page)
    : refused("page", "NOT_A_PAGE_NUMBER");
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === "";
}

function accepted<Value>(value: Value): FieldReading<Value> {
  return { ok: true, value };
}

function refused(
  field: StaffKitchenQueryField,
  code: StaffKitchenQueryRefusalCode,
): FieldReading<never> {
  return { ok: false, issue: { field, code } };
}

function issueOf(
  reading: FieldReading<unknown>,
): readonly StaffKitchenQueryIssue[] {
  return reading.ok ? [] : [reading.issue];
}
