import {
  holdsUnknownKey,
  isPlainObject,
  ownValueOf,
} from "../contact/input-checks.js";

import { isRequestStatus, type RequestStatus } from "./request-status.js";

// What a staff member did, as a code and the few codes that qualify it. The closed list lives here and not in
// the database (ADR 0172 D10). A detail holds codes only, so an address, a name or a note's text has no field
// to be written into.

export const STAFF_AUDIT_ACTIONS = Object.freeze([
  "kitchen-opened",
  "note-added",
  "status-changed",
  "kitchen-unhidden",
] as const);
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

/** `from` is `new` when no status had been saved. */
export interface StatusChangedDetail {
  readonly from: RequestStatus;
  readonly to: RequestStatus;
}

interface StaffAuditDetailByAction {
  readonly "kitchen-opened": null;
  readonly "note-added": null;
  readonly "status-changed": StatusChangedDetail;
  readonly "kitchen-unhidden": null;
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

export function isStaffAuditAction(value: unknown): value is StaffAuditAction {
  return STAFF_AUDIT_ACTIONS.some((action) => action === value);
}

/** An action and its detail as one entry: what a store may write, and what it may read back from a row. */
export function readStaffAuditEntry(
  action: unknown,
  detail: unknown,
): StaffAuditEntryReading {
  if (!isStaffAuditAction(action)) return refused("UNKNOWN_ACTION");
  if (action === "status-changed") return readStatusChangedEntry(detail);
  return isAbsent(detail)
    ? { ok: true, entry: { action, detail: null } }
    : refused("INVALID_DETAIL");
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
    entry: { action: "status-changed", detail: { from, to } },
  };
}

function isAbsent(detail: unknown): boolean {
  return detail === null || detail === undefined;
}

function refused(code: StaffAuditRefusalCode): StaffAuditEntryReading {
  return { ok: false, code };
}
