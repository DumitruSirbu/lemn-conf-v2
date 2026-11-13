import {
  DASHBOARD_AUDIT_ACTIONS,
  DASHBOARD_DETAIL_KEYS,
  readDashboardAuditEntry,
  type DashboardAuditAction,
} from "@lemnaria/configurator-domain";
import type { StaffAuditPage } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { staffAuditPageResponse } from "@/lib/server/staff/staff-responses";

// Wave X2 re-check (adversarial QA): the wire projection of a dashboard row copies every key of the action's closed list
// that the detail holds, and nothing else; absent optional members stay absent.

const FULL_DETAILS: Readonly<
  Record<DashboardAuditAction, Readonly<Record<string, unknown>>>
> = {
  "price-draft-changed": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "base-1",
    field: "anchorMinor",
    widthMm: 600,
  },
  "price-draft-reverted": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "base-1",
    field: "anchorMinor",
    widthMm: 600,
    revertedCount: 1,
  },
  "price-bulk-changed": {
    scope: "group",
    groupCode: "base",
    percent: 5,
    ruleCount: 1,
    amountCount: 2,
  },
  "price-published": { sequenceNumber: 1, changeCount: 1, provisional: false },
  "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 1 },
  "catalogue-item-active-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: true,
    availabilityRevision: "1",
  },
  "kitchen-defaults-saved": { changedFields: ["material", "depth"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "history" },
};

const MINIMAL_DETAILS: Readonly<
  Partial<Record<DashboardAuditAction, Readonly<Record<string, unknown>>>>
> = {
  "price-draft-changed": { changeKind: "depth-rule" },
  "price-draft-reverted": { changeKind: "bulk-group", revertedCount: 2 },
  "price-bulk-changed": {
    scope: "all",
    percent: -3,
    ruleCount: 0,
    amountCount: 0,
  },
};

function pageHolding(
  action: DashboardAuditAction,
  detail: object,
): StaffAuditPage {
  const reading = readDashboardAuditEntry(action, detail);
  if (!reading.ok) throw new Error(`${action} was refused`);
  return {
    total: 1,
    page: 1,
    pageSize: 25,
    events: [
      {
        id: "row-1",
        occurredAt: new Date("2026-10-21T09:00:00.000Z"),
        actor: { id: "A1b2C3d4E5f6G7h8I9j0_", email: null, name: null },
        subject: null,
        design: null,
        reading: { kind: "recognised", entry: reading.entry },
      },
    ],
  };
}

async function servedEntry(page: StaffAuditPage): Promise<{
  kind: string;
  action: string;
  detail: Record<string, unknown>;
}> {
  const body = (await staffAuditPageResponse(page).json()) as {
    events: {
      entry: { kind: string; action: string; detail: Record<string, unknown> };
    }[];
  };
  const [event] = body.events;
  if (event === undefined) throw new Error("no row served");
  return event.entry;
}

describe("the wire projection of a dashboard row", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s serves every key of its closed list for a full detail, and no other",
    async (action) => {
      const entry = await servedEntry(
        pageHolding(action, FULL_DETAILS[action]),
      );

      expect(entry.kind).toBe("recognised");
      expect(entry.action).toBe(action);
      expect(Object.keys(entry.detail).sort()).toEqual(
        [...DASHBOARD_DETAIL_KEYS[action]].sort(),
      );
      expect(entry.detail).toEqual(FULL_DETAILS[action]);
    },
  );

  it.each(Object.keys(MINIMAL_DETAILS) as DashboardAuditAction[])(
    "%s serves a minimal detail without the optional keys it lacks",
    async (action) => {
      const detail = MINIMAL_DETAILS[action] ?? {};

      const entry = await servedEntry(pageHolding(action, detail));

      expect(entry.detail).toEqual(detail);
      expect(Object.keys(entry.detail).sort()).toEqual(
        Object.keys(detail).sort(),
      );
    },
  );

  it("serves a list of changed fields in the reading's order, as the list and nothing else", async () => {
    const entry = await servedEntry(
      pageHolding("kitchen-defaults-saved", {
        changedFields: ["topRowHandle", "material", "handle"],
      }),
    );

    expect(entry.detail).toEqual({
      changedFields: ["topRowHandle", "material", "handle"],
    });
  });
});
