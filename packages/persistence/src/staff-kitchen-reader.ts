import {
  STAFF_KITCHEN_SEARCH_MAX_LENGTH,
  STAFF_KITCHEN_SEGMENTS,
  isRequestStatus,
  isUnstorableText,
  shownRequestStatus,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import type {
  Design,
  RequestStatus,
  StaffKitchenQuery,
} from "@lemnaria/configurator-domain";

import type { StaffAuditAccountRef } from "./staff-audit-store.js";

export type StaffKitchenReaderOperation =
  | "list staff kitchens"
  | "read a staff kitchen";

/**
 * Why a call failed, in the few kinds a route acts on:
 * - `unavailable`: a table is missing (42P01) or the application role lacks a grant (42501). The route answers 503.
 * - `invalid-query`: code refused the request before any statement.
 * - `unexpected-answer`: the database answered with something that is not the row this port reads.
 * - `database`: any other refusal or failure.
 */
export type StaffKitchenReaderFailure =
  | "unavailable"
  | "invalid-query"
  | "unexpected-answer"
  | "database";

const FAILURE_REASON: Readonly<Record<StaffKitchenReaderFailure, string>> = {
  unavailable: "a table it reads, or the grant to read it, is not in place",
  "invalid-query": "the query is not one this reader runs",
  "unexpected-answer":
    "the database answered with something this port does not read",
  database: "the database gave no trustworthy answer",
};

/**
 * Its message is built from fixed text and holds no value: no id, address, search text or driver text. A cause, when
 * there is one, is built (ADR 0146 B3, ADR 0153 d3): the driver error's type name and SQLSTATE and nothing else.
 */
export class StaffKitchenReaderError extends Error {
  readonly operation: StaffKitchenReaderOperation;
  readonly failure: StaffKitchenReaderFailure;

  constructor(
    operation: StaffKitchenReaderOperation,
    failure: StaffKitchenReaderFailure,
    options?: ErrorOptions,
  ) {
    super(
      `The staff kitchen reader could not ${operation}: ${FAILURE_REASON[failure]}.`,
      options,
    );
    this.name = "StaffKitchenReaderError";
    this.operation = operation;
    this.failure = failure;
  }
}

/**
 * What the request status column holds, as staff are shown it. `null` is a draft, which has no request and so no
 * status. `unrecognised` is a stored status this build's list does not name; it is never read as `new`.
 */
export type ShownStaffStatus = RequestStatus | "unrecognised" | null;

/** The account behind a kitchen, from the profile: the e-mail as typed, and the two optional profile fields. The postal
 *  address and every credential column are never read. */
export interface StaffKitchenClient {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly phone: string | null;
}

export interface StaffListedKitchen {
  readonly id: string;
  readonly name: string | null;
  /** `null` for a kitchen no account owns, and for one whose account no longer resolves. */
  readonly client: StaffKitchenClient | null;
  readonly isSent: boolean;
  readonly isHidden: boolean;
  readonly sentAt: Date | null;
  readonly updatedAt: Date;
  readonly requestStatus: ShownStaffStatus;
}

export interface StaffKitchenPage {
  /** Every kitchen the query matches, counted in the snapshot of the page. */
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly kitchens: readonly StaffListedKitchen[];
}

/** The latest request stored for the kitchen: its reference and the day it was stored, and nothing the client typed in
 *  it (the application role cannot read those columns, ADR 0153 d1). */
export interface StaffKitchenRequest {
  readonly reference: string;
  readonly sentAt: Date;
}

export interface StaffKitchenStatus {
  readonly value: RequestStatus | "unrecognised";
  /** `null` while no status has been saved and the kitchen shows as new. */
  readonly change: {
    readonly by: StaffAuditAccountRef;
    readonly at: Date;
  } | null;
}

export interface StaffKitchenNote {
  readonly id: string;
  readonly text: string;
  readonly createdAt: Date;
  /** Shown to staff only; the client's own export leaves the author out. */
  readonly author: StaffAuditAccountRef;
}

export interface StaffKitchenDetail {
  readonly id: string;
  readonly name: string | null;
  /** `null` when this build cannot read the stored document. */
  readonly design: Design | null;
  readonly isSent: boolean;
  readonly isHidden: boolean;
  readonly sentAt: Date | null;
  readonly updatedAt: Date;
  readonly client: StaffKitchenClient | null;
  readonly request: StaffKitchenRequest | null;
  /** The kitchen as the shop's notice carried it, from the newest unrevoked copy of the latest request; `null` when
   *  none exists or this build cannot read it. */
  readonly asSent: Design | null;
  /** `null` for a draft. */
  readonly status: StaffKitchenStatus | null;
  /** Newest first. */
  readonly notes: readonly StaffKitchenNote[];
}

/** `none` answers an unknown id, a malformed id, a kitchen its client deleted, and a visitor's unsent draft alike. */
export type StaffKitchenReading =
  | { readonly kind: "found"; readonly kitchen: StaffKitchenDetail }
  | { readonly kind: "none" };

/**
 * The staff arm for reading kitchens (plan CG-L3-10), apart from the client and visitor arms so no predicate of theirs
 * is shared or loosened. A kitchen its client hid is included; one its client deleted is not. No method writes.
 */
export interface StaffKitchenReader {
  /** Throws `StaffKitchenReaderError`. Sent kitchens newest sent first, the others newest changed first; ties by id. */
  listPage(query: StaffKitchenQuery): Promise<StaffKitchenPage>;
  /** Throws `StaffKitchenReaderError`. */
  readOne(designId: string): Promise<StaffKitchenReading>;
}

/** What `designs.id` may hold (legacy ids are not all the generator's 21 characters), as `isKitchenCursor` accepts. */
const DESIGN_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

const LIKE_METACHARACTERS = /[\\%_]/g;

export function isWellFormedDesignId(value: unknown): value is string {
  return typeof value === "string" && DESIGN_ID_SHAPE.test(value);
}

/** Refuses a query the statement would answer wrongly or not at all; throws an `invalid-query` error. */
export function requireValidStaffKitchenQuery(query: StaffKitchenQuery): void {
  if (isValidStaffKitchenQuery(query)) return;
  throw new StaffKitchenReaderError("list staff kitchens", "invalid-query");
}

function isValidStaffKitchenQuery(query: StaffKitchenQuery): boolean {
  const { segment, status, search, page } = query;
  return (
    STAFF_KITCHEN_SEGMENTS.some((named) => named === segment) &&
    isValidStatusFilter(segment, status) &&
    isValidSearch(search) &&
    isCountablePage(page)
  );
}

/** A status filter means something only under the sent segment. */
function isValidStatusFilter(segment: string, status: unknown): boolean {
  return status === null || (segment === "sent" && isRequestStatus(status));
}

function isValidSearch(search: unknown): boolean {
  if (search === null) return true;
  return (
    typeof search === "string" &&
    search !== "" &&
    Array.from(search).length <= STAFF_KITCHEN_SEARCH_MAX_LENGTH &&
    !isUnstorableText(search)
  );
}

function isCountablePage(page: unknown): boolean {
  if (typeof page !== "number") return false;
  try {
    staffKitchenOffsetOf(page);
    return true;
  } catch {
    return false;
  }
}

/**
 * The text a `like` matches when the search is a substring of the column: the search with `\`, `%` and `_` made
 * literal, between two `%`. One pass over the characters, so a backslash it adds is never escaped again.
 */
export function likePatternContaining(search: string): string {
  return `%${search.replace(LIKE_METACHARACTERS, "\\$&")}%`;
}

/**
 * The status staff are shown for a stored status text. A stored text outside the list is `unrecognised` on a sent
 * kitchen, and is not read as `new`; a draft has none.
 */
export function shownStaffStatusOf(facts: {
  readonly isSent: boolean;
  readonly storedStatus: string | null;
}): ShownStaffStatus {
  const { isSent, storedStatus } = facts;
  if (storedStatus === null) {
    return shownRequestStatus({ isSent, recorded: null });
  }
  if (!isRequestStatus(storedStatus)) return isSent ? "unrecognised" : null;
  return shownRequestStatus({ isSent, recorded: storedStatus });
}
