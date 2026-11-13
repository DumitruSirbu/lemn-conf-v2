import { fc, test as propertyTest } from "@fast-check/vitest";
import type { StaffAuditEntry } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSessionStore } from "../src/fake-session-store.js";
import { FakeStaffAuditStore } from "../src/fake-staff-audit-store.js";
import { NeonStaffAuditStore } from "../src/neon-staff-audit-store.js";
import {
  StaffAuditStoreError,
  prepareStaffAuditRecord,
} from "../src/staff-audit-store.js";
import type { StaffAuditRecord } from "../src/staff-audit-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

// Wave X2 (adversarial QA): the store refuses at write an action the table's `staff_audit_events_action_shape` would
// refuse (1 to 32 of a-z, 0-9, "-"). The domain's closed list cannot reach that edge by itself (the longest of the
// fifteen is 29 characters), so the domain's reader is doubled here to accept a planted action when its detail is the
// marker below; the store, not the reader, must be what stops it.

const PLANTED_DETAIL = "planted";

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    readStaffAuditEntry: (action: unknown, detail: unknown) =>
      detail === "planted"
        ? { ok: true, entry: { action, detail: null } }
        : actual.readStaffAuditEntry(action, detail),
    auditActionAcceptsDesignId: (action: unknown, designId: string | null) =>
      actual.isStaffAuditAction(action)
        ? actual.auditActionAcceptsDesignId(action, designId)
        : designId === null,
  };
});

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

const SESSION_HASH = "a".repeat(64);
const LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const MAX_ACTION_LENGTH = 32;

function plantedRecord(action: string): StaffAuditRecord {
  return {
    sessionTokenHash: SESSION_HASH,
    idleLifetimeSeconds: LIFETIMES,
    entry: { action, detail: PLANTED_DETAIL } as unknown as StaffAuditEntry,
    designId: null,
    subjectAccountId: null,
  };
}

function plantedOfLength(length: number): string {
  return `zz${"a".repeat(length - 2)}`;
}

function isActionTheTableAccepts(action: string): boolean {
  return (
    action.length >= 1 &&
    action.length <= MAX_ACTION_LENGTH &&
    Array.from(action).every((char) => /[a-z0-9-]/u.test(char))
  );
}

function refusalOf(record: StaffAuditRecord): string | undefined {
  try {
    prepareStaffAuditRecord(record);
  } catch (error) {
    if (error instanceof StaffAuditStoreError) {
      return `${error.failure}/${String(error.refusal)}`;
    }
    throw error;
  }
  return undefined;
}

beforeEach(resetQueryDriver);

describe("an action the domain reads but the table's shape would refuse", () => {
  it.each([
    [32, undefined],
    [33, "invalid-record/ENTRY_NOT_RECOGNISED"],
    [40, "invalid-record/ENTRY_NOT_RECOGNISED"],
    [200, "invalid-record/ENTRY_NOT_RECOGNISED"],
  ])(
    "an action of %s characters is prepared or refused at the 32 limit",
    (length, expected) => {
      expect(refusalOf(plantedRecord(plantedOfLength(length)))).toBe(expected);
    },
  );

  it.each([
    ["an upper-case letter", "zzPrice-published"],
    ["an underscore", "zz_price"],
    ["a space", "zz price"],
    ["a dot", "zz.price"],
    ["an accented letter", "zzpriceé"],
    ["the empty string", ""],
  ])("an action with %s is refused", (_label, action) => {
    expect(refusalOf(plantedRecord(action))).toBe(
      "invalid-record/ENTRY_NOT_RECOGNISED",
    );
  });

  propertyTest.prop(
    [
      fc.string({
        unit: fc.constantFrom(..."abcxyz09-_ AZ.é ".split("")),
        minLength: 0,
        maxLength: 45,
      }),
    ],
    { numRuns: 2000 },
  )(
    "is prepared exactly when it is 1 to 32 characters of a-z, 0-9 and a hyphen",
    (tail) => {
      const action = tail;
      const expected = isActionTheTableAccepts(action)
        ? undefined
        : "invalid-record/ENTRY_NOT_RECOGNISED";

      expect(refusalOf(plantedRecord(action))).toBe(expected);
    },
  );

  it("the fake store refuses a 33-character action before it looks at the session", async () => {
    const store = new FakeStaffAuditStore({
      sessions: new FakeSessionStore({
        now: () => new Date("2026-10-26T09:00:00.000Z"),
        accountOf: () => undefined,
        passwordHashOf: () => undefined,
        passwordChangedAtOf: () => undefined,
      }),
    });

    const failure = await rejectionOf(
      store.record(plantedRecord(plantedOfLength(33))),
    );

    expect(failure).toBeInstanceOf(StaffAuditStoreError);
    expect((failure as StaffAuditStoreError).refusal).toBe(
      "ENTRY_NOT_RECOGNISED",
    );
  });

  it("the live store refuses a 33-character action without sending a statement", async () => {
    const store = new NeonStaffAuditStore(WELL_FORMED_UNREACHABLE_VALUE);

    const failure = await rejectionOf(
      store.record(plantedRecord(plantedOfLength(33))),
    );

    expect(failure).toBeInstanceOf(StaffAuditStoreError);
    expect((failure as StaffAuditStoreError).refusal).toBe(
      "ENTRY_NOT_RECOGNISED",
    );
    expect(queryDriver.statements).toHaveLength(0);
  });
});
