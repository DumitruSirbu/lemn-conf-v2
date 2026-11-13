import type { StaffAuditEntry } from "@lemnaria/configurator-domain";
import type { StaffAuditPage } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { staffAuditPageResponse } from "@/lib/server/staff/staff-responses";
import { staffAuditPageFrom } from "@/staff/staff-audit-wire-reading";

// See ADR 0180 d3.

const KITCHEN_ID = "K".repeat(21);

function pageHolding(entry: StaffAuditEntry): StaffAuditPage {
  return {
    total: 1,
    page: 1,
    pageSize: 25,
    events: [
      {
        id: "row-0",
        occurredAt: new Date("2026-11-13T09:00:00.000Z"),
        actor: { id: "A".repeat(21), email: "ana@example.test", name: null },
        subject: null,
        design: { id: KITCHEN_ID, name: null, client: null },
        reading: { kind: "recognised", entry },
      },
    ],
  };
}

describe("a kitchen-viewed-3d row in the audit page's answer", () => {
  it.each(["sent", "current"] as const)(
    "is served as a recognised row holding the %s version and no other member",
    async (version) => {
      const smuggling = {
        action: "kitchen-viewed-3d",
        detail: { version, clientEmail: "client@example.test" },
      } as unknown as StaffAuditEntry;

      const response = staffAuditPageResponse(pageHolding(smuggling));
      const text = await response.clone().text();
      const body: unknown = await response.json();

      expect(text).not.toContain("client@example.test");
      const [served] = (body as { events: { entry: unknown }[] }).events;
      expect(served?.entry).toEqual({
        kind: "recognised",
        action: "kitchen-viewed-3d",
        detail: { version },
      });
    },
  );

  it("is read back by the page as a recognised row", async () => {
    const body: unknown = await staffAuditPageResponse(
      pageHolding({ action: "kitchen-viewed-3d", detail: { version: "sent" } }),
    ).json();

    const [event] = staffAuditPageFrom(body)?.events ?? [];

    expect(event?.entry).toEqual({
      kind: "recognised",
      action: "kitchen-viewed-3d",
      detail: { version: "sent" },
    });
  });
});
