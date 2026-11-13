// The staff audit list holds the price dashboard's nine actions: the audit page, the stores and the wire reading all
// ask `isStaffAuditAction` and `readStaffAuditEntry`, so what they accept is decided here.
import { describe, expect, it } from "vitest";

import {
  DASHBOARD_AUDIT_ACTIONS,
  type DashboardAuditAction,
} from "../../src/staff/dashboard-audit-action.js";
import {
  STAFF_AUDIT_ACTIONS,
  auditActionAcceptsDesignId,
  auditActionNamesDesign,
  isStaffAuditAction,
  readStaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

const VALID_DETAILS: Readonly<Record<DashboardAuditAction, object>> = {
  "price-draft-changed": { changeKind: "depth-rule" },
  "price-draft-reverted": { changeKind: "provisional", revertedCount: 1 },
  "price-bulk-changed": {
    scope: "all",
    percent: 5,
    ruleCount: 12,
    amountCount: 40,
  },
  "price-published": { sequenceNumber: 2, changeCount: 3, provisional: false },
  "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 2 },
  "catalogue-item-active-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: true,
    availabilityRevision: "4",
  },
  "kitchen-defaults-saved": { changedFields: ["finish"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "publish" },
};

describe("the dashboard actions in the staff audit list", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "isStaffAuditAction accepts %s",
    (action) => {
      expect(isStaffAuditAction(action)).toBe(true);
      expect(STAFF_AUDIT_ACTIONS).toContain(action);
    },
  );

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "readStaffAuditEntry reads %s under its detail and refuses a key outside its list",
    (action) => {
      const detail = VALID_DETAILS[action];

      expect(readStaffAuditEntry(action, detail)).toEqual({
        ok: true,
        entry: { action, detail },
      });
      expect(readStaffAuditEntry(action, { ...detail, note: "x" })).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
    },
  );

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s names a design exactly when its row's column says so",
    (action) => {
      const namesDesign = action === "kitchen-seen";

      expect(auditActionNamesDesign(action)).toBe(namesDesign);
      expect(auditActionAcceptsDesignId(action, "design-1")).toBe(namesDesign);
      expect(auditActionAcceptsDesignId(action, null)).toBe(!namesDesign);
    },
  );
});
