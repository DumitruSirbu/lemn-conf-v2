import { describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "../src/m10-ports.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";
import { auditRecordOf } from "./support/dashboard-contract-support.js";

// The domain's closed list of dashboard actions cannot reach the table's action shape (the longest is 29 characters), so
// the domain's reader is doubled to accept a planted action: it is the ledger, not the reader, that must refuse one the
// table's `staff_audit_events_action_shape` would. The same device as `qa-x2-audit-action-shape.adversarial.test.ts`.

const PLANTED_DETAIL = { planted: true };
const MAX_ACTION_LENGTH = 32;

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    readDashboardAuditEntry: (action: unknown, detail: unknown) =>
      (detail as { planted?: boolean }).planted === true
        ? { ok: true, entry: { action, detail: {} } }
        : actual.readDashboardAuditEntry(action as never, detail),
  };
});

async function stageAction(action: string) {
  const world = newFakeDashboardWorld();
  const staff = await world.aStaffMember();
  return world.ledger.stage({
    operation: "write the price draft",
    record: auditRecordOf(staff, {
      action,
      detail: PLANTED_DETAIL,
    }) as never,
    accepts: [action as never],
  });
}

describe("the fake dashboard ledger against the table's action shape", () => {
  it("stages an action of the table's longest length", async () => {
    await expect(
      stageAction("a".repeat(MAX_ACTION_LENGTH)),
    ).resolves.toBeDefined();
  });

  it.each([
    {
      what: "one character past the longest",
      action: "a".repeat(MAX_ACTION_LENGTH + 1),
    },
    { what: "an upper-case letter", action: "Price-draft-changed" },
    { what: "an underscore", action: "price_draft_changed" },
    { what: "nothing", action: "" },
  ])(
    "refuses an action of $what as an invalid request, before it writes",
    async ({ action }) => {
      const rejection = await stageAction(action).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(rejection).toBeInstanceOf(DashboardStoreError);
      expect((rejection as DashboardStoreError).failure).toBe(
        "invalid-request",
      );
    },
  );
});
