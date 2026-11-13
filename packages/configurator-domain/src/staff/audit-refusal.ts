// What the two audit-entry readers (`staff-audit-action.ts`, `dashboard-audit-action.ts`) refuse with, and the checks
// they share. Neither reader owns these, so neither imports the other.

export type StaffAuditRefusalCode = "UNKNOWN_ACTION" | "INVALID_DETAIL";

export interface StaffAuditRefusal {
  readonly ok: false;
  readonly code: StaffAuditRefusalCode;
}

export function refused(code: StaffAuditRefusalCode): StaffAuditRefusal {
  return { ok: false, code };
}

export function isAbsent(detail: unknown): boolean {
  return detail === null || detail === undefined;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
