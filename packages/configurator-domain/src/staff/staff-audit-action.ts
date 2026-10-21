import {
  holdsUnknownKey,
  isPlainObject,
  ownValueOf,
} from "../contact/input-checks.js";

import { isRequestStatus, type RequestStatus } from "./request-status.js";
import {
  STAFF_KITCHEN_PAGE_SIZE,
  isStaffKitchenSegment,
  type StaffKitchenSegment,
} from "./staff-kitchen-query.js";

// What a staff member did, as a code and the few codes that qualify it. The closed list lives here and not in
// the database (ADR 0172 D10). A detail holds codes only, so an address, a name or a note's text has no field
// to be written into.

export const STAFF_AUDIT_ACTIONS = Object.freeze([
  "kitchen-opened",
  "note-added",
  "status-changed",
  "kitchen-unhidden",
  "kitchens-listed",
] as const);
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

/** `from` is `new` when no status had been saved. */
export interface StatusChangedDetail {
  readonly from: RequestStatus;
  readonly to: RequestStatus;
}

/** What one served page of the kitchens list was, as codes and counts: never the search text or a client. */
export interface KitchensListedDetail {
  readonly segment: StaffKitchenSegment;
  readonly status: RequestStatus | null;
  /** From 1. */
  readonly page: number;
  /** Rows on the page, 0 to the page size. */
  readonly rowCount: number;
  readonly hasSearch: boolean;
}

interface StaffAuditDetailByAction {
  readonly "kitchen-opened": null;
  readonly "note-added": null;
  readonly "status-changed": StatusChangedDetail;
  readonly "kitchen-unhidden": null;
  readonly "kitchens-listed": KitchensListedDetail;
}

export type StaffAuditEntry = {
  readonly [Action in StaffAuditAction]: {
    readonly action: Action;
    readonly detail: StaffAuditDetailByAction[Action];
  };
}[StaffAuditAction];

export type StaffAuditRefusalCode = "UNKNOWN_ACTION" | "INVALID_DETAIL";

export type StaffAuditEntryReading =
  | { readonly ok: true; readonly entry: StaffAuditEntry }
  | { readonly ok: false; readonly code: StaffAuditRefusalCode };

const STATUS_CHANGE_KEYS = Object.freeze(["from", "to"]);
const KITCHENS_LISTED_KEYS = Object.freeze([
  "segment",
  "status",
  "page",
  "rowCount",
  "hasSearch",
]);

/** Whether the row names a design. A new action must be classified here before it compiles. */
export const STAFF_AUDIT_ACTION_NAMES_DESIGN: Readonly<
  Record<StaffAuditAction, boolean>
> = Object.freeze({
  "kitchen-opened": true,
  "note-added": true,
  "status-changed": true,
  "kitchen-unhidden": true,
  "kitchens-listed": false,
});

export function auditActionNamesDesign(action: StaffAuditAction): boolean {
  return STAFF_AUDIT_ACTION_NAMES_DESIGN[action];
}

/** A row names a design exactly when its action does: the list names none, every other action names one. */
export function auditActionAcceptsDesignId(
  action: StaffAuditAction,
  designId: string | null,
): boolean {
  return auditActionNamesDesign(action) === (designId !== null);
}

export function isStaffAuditAction(value: unknown): value is StaffAuditAction {
  return STAFF_AUDIT_ACTIONS.some((action) => action === value);
}

/** An action and its detail as one entry: what a store may write, and what it may read back from a row. */
export function readStaffAuditEntry(
  action: unknown,
  detail: unknown,
): StaffAuditEntryReading {
  if (!isStaffAuditAction(action)) return refused("UNKNOWN_ACTION");
  switch (action) {
    case "status-changed":
      return readStatusChangedEntry(detail);
    case "kitchens-listed":
      return readKitchensListedEntry(detail);
    default:
      return isAbsent(detail)
        ? { ok: true, entry: { action, detail: null } }
        : refused("INVALID_DETAIL");
  }
}

function readStatusChangedEntry(detail: unknown): StaffAuditEntryReading {
  if (!isPlainObject(detail) || holdsUnknownKey(detail, STATUS_CHANGE_KEYS)) {
    return refused("INVALID_DETAIL");
  }
  const from = ownValueOf(detail, "from");
  const to = ownValueOf(detail, "to");
  if (!isRequestStatus(from) || !isRequestStatus(to)) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: { action: "status-changed", detail: Object.freeze({ from, to }) },
  };
}

function readKitchensListedEntry(detail: unknown): StaffAuditEntryReading {
  if (!isPlainObject(detail) || holdsUnknownKey(detail, KITCHENS_LISTED_KEYS)) {
    return refused("INVALID_DETAIL");
  }
  const segment = ownValueOf(detail, "segment");
  const status = ownValueOf(detail, "status");
  const page = ownValueOf(detail, "page");
  const rowCount = ownValueOf(detail, "rowCount");
  const hasSearch = ownValueOf(detail, "hasSearch");
  if (
    !isStaffKitchenSegment(segment) ||
    !(status === null || isRequestStatus(status)) ||
    !isPositiveSafeInteger(page) ||
    !isRowCount(rowCount) ||
    typeof hasSearch !== "boolean"
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "kitchens-listed",
      detail: Object.freeze({ segment, status, page, rowCount, hasSearch }),
    },
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRowCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= STAFF_KITCHEN_PAGE_SIZE
  );
}

function isAbsent(detail: unknown): boolean {
  return detail === null || detail === undefined;
}

function refused(code: StaffAuditRefusalCode): StaffAuditEntryReading {
  return { ok: false, code };
}
