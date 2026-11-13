import {
  DASHBOARD_AUDIT_ACTIONS,
  readDashboardAuditEntry,
  type DashboardAuditAction,
} from "@lemnaria/configurator-domain";
import type { StaffAuditPage } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { staffAuditPageResponse } from "@/lib/server/staff/staff-responses";
import { staffAuditPageFrom } from "@/staff/staff-audit-wire-reading";

/** The price dashboard's audit rows on the wire: served as their action and detail, and read back as recognised. */

const VALID_DETAILS: Readonly<Record<DashboardAuditAction, object>> = {
  "price-draft-changed": { changeKind: "depth-rule" },
  "price-draft-reverted": { changeKind: "provisional", revertedCount: 1 },
  "price-bulk-changed": {
    scope: "group",
    groupCode: "wall",
    percent: -3,
    ruleCount: 4,
    amountCount: 9,
  },
  "price-published": { sequenceNumber: 2, changeCount: 3, provisional: false },
  "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 2 },
  "catalogue-item-active-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: true,
    availabilityRevision: "4",
  },
  "kitchen-defaults-saved": { changedFields: ["material", "handle"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "history" },
};

function pageOfDashboardRows(): StaffAuditPage {
  return {
    total: DASHBOARD_AUDIT_ACTIONS.length,
    page: 1,
    pageSize: 25,
    events: DASHBOARD_AUDIT_ACTIONS.map((action, index) => {
      const reading = readDashboardAuditEntry(action, VALID_DETAILS[action]);
      if (!reading.ok) throw new Error(`${action} was refused`);
      return {
        id: `row-${String(index)}`,
        occurredAt: new Date("2026-10-21T09:00:00.000Z"),
        actor: {
          id: "A1b2C3d4E5f6G7h8I9j0_",
          email: "ana@example.test",
          name: null,
        },
        subject: null,
        design: null,
        reading: { kind: "recognised", entry: reading.entry },
      };
    }),
  };
}

describe("the dashboard audit actions in the audit page's answer", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "serves %s as a recognised row holding its detail",
    async (action) => {
      const body: unknown = await staffAuditPageResponse(
        pageOfDashboardRows(),
      ).json();

      const served = (
        body as {
          events: readonly {
            entry: { kind: string; action: string; detail: unknown };
          }[];
        }
      ).events.find((event) => event.entry.action === action);
      expect(served?.entry).toEqual({
        kind: "recognised",
        action,
        detail: VALID_DETAILS[action],
      });
    },
  );

  it("is read back by the page as nine recognised rows", async () => {
    const body: unknown = await staffAuditPageResponse(
      pageOfDashboardRows(),
    ).json();

    const entries = staffAuditPageFrom(body)?.events.map(({ entry }) => entry);

    expect(entries?.map((entry) => entry.kind)).toEqual(
      DASHBOARD_AUDIT_ACTIONS.map(() => "recognised"),
    );
  });
});
