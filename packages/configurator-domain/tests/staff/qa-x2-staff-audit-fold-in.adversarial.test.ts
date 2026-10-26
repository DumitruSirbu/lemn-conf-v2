// M10 X2, adversarial QA of the fold-in: the fifteen actions of `STAFF_AUDIT_ACTIONS` as the staff reader reads them.
// X0's file attacks `readDashboardAuditEntry`; this one attacks what X2 added around it: the list, the shape the table
// accepts, the staff reader's delegation, and the stored form (a detail that went through the JSON column).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  DASHBOARD_AUDIT_ACTIONS,
  readDashboardAuditEntry,
  type DashboardAuditAction,
} from "../../src/staff/dashboard-audit-action.js";
import {
  STAFF_AUDIT_ACTIONS,
  STAFF_AUDIT_ACTION_NAMES_DESIGN,
  auditActionAcceptsDesignId,
  auditActionNamesDesign,
  isStaffAuditAction,
  readStaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

/** Migration `0020`'s `staff_audit_events_action_shape`, written out here and not imported from the persistence package. */
const TABLE_ACTION_SHAPE = /^[a-z0-9-]{1,32}$/;
const SECRET = "ana@example.ro, tel 069 000 000";

const FULL_DETAILS: Readonly<Record<DashboardAuditAction, object>> = {
  "price-draft-changed": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "base-1",
    field: "anchorMinor",
    widthMm: 600,
  },
  "price-draft-reverted": {
    changeKind: "bulk-group",
    revertedCount: 4,
  },
  "price-bulk-changed": {
    scope: "group",
    groupCode: "corner",
    percent: -12,
    ruleCount: 5,
    amountCount: 9,
  },
  "price-published": { sequenceNumber: 3, changeCount: 0, provisional: false },
  "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 0 },
  "catalogue-item-active-changed": {
    itemKind: "finish",
    itemId: "finish.matte",
    active: true,
    availabilityRevision: "9223372036854775807",
  },
  "kitchen-defaults-saved": { changedFields: ["material", "depth", "finish"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "version" },
};

function stringKeysOf(detail: object): string[] {
  return Object.entries(detail)
    .filter(([, value]) => typeof value === "string")
    .map(([key]) => key);
}

describe("the fifteen actions against the table's action check", () => {
  it("lists the Lot 3 six first, then the nine, each once", () => {
    expect(STAFF_AUDIT_ACTIONS.slice(6)).toEqual([...DASHBOARD_AUDIT_ACTIONS]);
    expect(new Set(STAFF_AUDIT_ACTIONS).size).toBe(15);
  });

  it.each(STAFF_AUDIT_ACTIONS)(
    "%s is 1 to 32 of a-z, 0-9 and a hyphen",
    (action) => {
      expect(TABLE_ACTION_SHAPE.test(action)).toBe(true);
    },
  );

  it("is not vacuous: the shape refuses 33 characters, an underscore and a capital", () => {
    expect(TABLE_ACTION_SHAPE.test("a".repeat(33))).toBe(false);
    expect(TABLE_ACTION_SHAPE.test("price_published")).toBe(false);
    expect(TABLE_ACTION_SHAPE.test("Price-published")).toBe(false);
  });

  it("answers a design-naming flag for every action, as a boolean", () => {
    for (const action of STAFF_AUDIT_ACTIONS) {
      expect(typeof STAFF_AUDIT_ACTION_NAMES_DESIGN[action]).toBe("boolean");
    }
    expect(Object.keys(STAFF_AUDIT_ACTION_NAMES_DESIGN).sort()).toEqual(
      [...STAFF_AUDIT_ACTIONS].sort(),
    );
    expect(Object.isFrozen(STAFF_AUDIT_ACTION_NAMES_DESIGN)).toBe(true);
  });

  it("names a design for kitchen-seen and for the Lot 3 kitchen actions, and for no other dashboard action", () => {
    const naming = STAFF_AUDIT_ACTIONS.filter(auditActionNamesDesign);

    expect(naming).toEqual([
      "kitchen-opened",
      "note-added",
      "status-changed",
      "kitchen-unhidden",
      "kitchen-seen",
    ]);
  });

  it("accepts a design id exactly for the actions that name one", () => {
    for (const action of STAFF_AUDIT_ACTIONS) {
      const names = auditActionNamesDesign(action);
      expect(auditActionAcceptsDesignId(action, "d".repeat(21))).toBe(names);
      expect(auditActionAcceptsDesignId(action, null)).toBe(!names);
    }
  });
});

describe("the staff reader and the dashboard reader", () => {
  it("agree on every full detail", () => {
    for (const action of DASHBOARD_AUDIT_ACTIONS) {
      expect(readStaffAuditEntry(action, FULL_DETAILS[action])).toEqual(
        readDashboardAuditEntry(action, FULL_DETAILS[action]),
      );
      expect(readStaffAuditEntry(action, FULL_DETAILS[action]).ok).toBe(true);
    }
  });

  propertyTest.prop(
    [
      fc.constantFrom(...DASHBOARD_AUDIT_ACTIONS),
      fc.anything({ withNullPrototype: true, withBigInt: true }),
    ],
    { numRuns: 3000 },
  )("agree on any detail at all, and neither throws", (action, detail) => {
    expect(readStaffAuditEntry(action, detail)).toEqual(
      readDashboardAuditEntry(action, detail),
    );
  });

  propertyTest.prop(
    [
      fc.constantFrom(...DASHBOARD_AUDIT_ACTIONS),
      fc.string({ minLength: 0, maxLength: 12 }),
      fc.anything(),
    ],
    { numRuns: 1500 },
  )(
    "refuse a full detail that gained any key outside the action's list",
    (action, keyTail, extraValue) => {
      const detail = { ...FULL_DETAILS[action], [`x${keyTail}`]: extraValue };

      expect(readStaffAuditEntry(action, detail)).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
    },
  );

  it("refuses a key that belongs to another action's list", () => {
    expect(
      readStaffAuditEntry("price-published", {
        ...FULL_DETAILS["price-published"],
        changeKind: "depth-rule",
      }).ok,
    ).toBe(false);
    expect(
      readStaffAuditEntry("price-catalogue-viewed", {
        ...FULL_DETAILS["price-catalogue-viewed"],
        itemId: "base-1",
      }).ok,
    ).toBe(false);
    expect(
      readStaffAuditEntry("price-bulk-changed", {
        ...FULL_DETAILS["price-bulk-changed"],
        label: "June",
      }).ok,
    ).toBe(false);
  });

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s carries no key a caller hid as non-enumerable, symbol-keyed or accessor",
    (action) => {
      const hiddenNonEnumerable = { ...FULL_DETAILS[action] };
      Object.defineProperty(hiddenNonEnumerable, "secret", {
        value: SECRET,
        enumerable: false,
      });
      const hiddenSymbol = {
        ...FULL_DETAILS[action],
        [Symbol("secret")]: SECRET,
      };
      const hiddenAccessor = { ...FULL_DETAILS[action] };
      Object.defineProperty(hiddenAccessor, "secret", {
        get: () => SECRET,
        enumerable: false,
      });

      for (const detail of [
        hiddenNonEnumerable,
        hiddenSymbol,
        hiddenAccessor,
      ]) {
        const reading = readStaffAuditEntry(action, detail);
        if (reading.ok) {
          expect(JSON.stringify(reading.entry)).not.toContain("secret");
          expect(JSON.stringify(reading.entry)).not.toContain(SECRET);
          expect(Reflect.ownKeys(reading.entry.detail ?? {})).not.toContain(
            "secret",
          );
        }
      }
    },
  );

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s never accepts a person's text in a slot that holds a code",
    (action) => {
      for (const key of stringKeysOf(FULL_DETAILS[action])) {
        const reading = readStaffAuditEntry(action, {
          ...FULL_DETAILS[action],
          [key]: SECRET,
        });

        expect(reading.ok, `${action}.${key}`).toBe(false);
      }
    },
  );

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s reads back as itself after the JSON column",
    (action) => {
      const reading = readStaffAuditEntry(action, FULL_DETAILS[action]);
      if (!reading.ok) throw new Error("expected an entry");

      const stored: unknown = JSON.parse(JSON.stringify(reading.entry.detail));

      expect(readStaffAuditEntry(action, stored)).toEqual(reading);
    },
  );

  it("does not take a missing key from a polluted Object.prototype", () => {
    Reflect.defineProperty(Object.prototype, "section", {
      value: "history",
      configurable: true,
    });
    Reflect.defineProperty(Object.prototype, "changedFields", {
      value: ["finish"],
      configurable: true,
    });
    try {
      expect(readStaffAuditEntry("price-catalogue-viewed", {}).ok).toBe(false);
      expect(readStaffAuditEntry("kitchen-defaults-saved", {}).ok).toBe(false);
    } finally {
      Reflect.deleteProperty(Object.prototype, "section");
      Reflect.deleteProperty(Object.prototype, "changedFields");
    }
  });
});

describe("a number in a stored detail", () => {
  const ANY_NUMBER = fc.oneof(
    fc.double({ noNaN: false }),
    fc.integer(),
    fc.constantFrom(
      -0,
      0,
      1,
      -1,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      -Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER - 1,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      0.5,
    ),
  );
  const isWhole = (value: number) =>
    Number.isSafeInteger(value) && !Object.is(value, -0);

  const SLOTS = [
    ["price-bulk-changed", "percent", isWhole],
    ["price-bulk-changed", "ruleCount", (n: number) => isWhole(n) && n >= 0],
    ["price-bulk-changed", "amountCount", (n: number) => isWhole(n) && n >= 0],
    ["price-published", "sequenceNumber", (n: number) => isWhole(n) && n >= 1],
    ["price-published", "changeCount", (n: number) => isWhole(n) && n >= 0],
    [
      "price-restored-to-draft",
      "fromSequenceNumber",
      (n: number) => isWhole(n) && n >= 1,
    ],
    [
      "price-restored-to-draft",
      "changeCount",
      (n: number) => isWhole(n) && n >= 0,
    ],
    [
      "price-draft-reverted",
      "revertedCount",
      (n: number) => isWhole(n) && n >= 1,
    ],
    ["price-draft-changed", "widthMm", (n: number) => isWhole(n) && n >= 1],
  ] as const;

  it.each(SLOTS)(
    "%s.%s is accepted exactly when it is a whole count, and what is accepted is what JSON gives back",
    (action, key, isAcceptable) => {
      fc.assert(
        fc.property(ANY_NUMBER, (value) => {
          const reading = readStaffAuditEntry(action, {
            ...FULL_DETAILS[action],
            [key]: value,
          });

          if (!isAcceptable(value)) {
            expect(reading.ok).toBe(false);
            return;
          }
          expect(reading.ok).toBe(true);
          const stored: unknown = JSON.parse(
            JSON.stringify(reading.ok ? reading.entry.detail : null),
          );
          expect(readStaffAuditEntry(action, stored)).toEqual(reading);
        }),
        { numRuns: 400 },
      );
    },
  );

  it("is not vacuous: a plain zero count and a negative percent are accepted, minus zero is not", () => {
    const bulk = FULL_DETAILS["price-bulk-changed"];

    expect(
      readStaffAuditEntry("price-bulk-changed", { ...bulk, percent: 0 }).ok,
    ).toBe(true);
    expect(
      readStaffAuditEntry("price-bulk-changed", { ...bulk, percent: -7 }).ok,
    ).toBe(true);
    expect(
      readStaffAuditEntry("price-bulk-changed", { ...bulk, percent: -0 }).ok,
    ).toBe(false);
    expect(
      readStaffAuditEntry("price-bulk-changed", { ...bulk, ruleCount: -0 }).ok,
    ).toBe(false);
  });
});

describe("the action itself", () => {
  propertyTest.prop([fc.string()], { numRuns: 1500 })(
    "is UNKNOWN_ACTION for any string that is not one of the fifteen",
    (text) => {
      fc.pre(!STAFF_AUDIT_ACTIONS.some((action) => action === text));

      expect(isStaffAuditAction(text)).toBe(false);
      expect(readStaffAuditEntry(text, {})).toEqual({
        ok: false,
        code: "UNKNOWN_ACTION",
      });
    },
  );

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s is refused with a trailing space, in capitals, or as the old 32+ character spelling",
    (action) => {
      for (const variant of [
        `${action} `,
        action.toUpperCase(),
        `${action}-changed-meanwhile-and-more`,
      ]) {
        expect(readStaffAuditEntry(variant, FULL_DETAILS[action])).toEqual({
          ok: false,
          code: "UNKNOWN_ACTION",
        });
      }
    },
  );

  it("refuses the 33-character spelling the plan first used for the availability action", () => {
    const retired = "catalogue-item-activation-changed";

    expect(retired.length).toBeGreaterThan(32);
    expect(isStaffAuditAction(retired)).toBe(false);
    expect(
      readStaffAuditEntry(
        retired,
        FULL_DETAILS["catalogue-item-active-changed"],
      ),
    ).toEqual({ ok: false, code: "UNKNOWN_ACTION" });
  });
});

describe("the kitchen-seen detail", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an array", []],
    ["a string", ""],
    ["a key", { designId: "d".repeat(21) }],
  ])(
    "is refused for %s: the closed key list is empty and the detail is an object",
    (_label, detail) => {
      expect(readStaffAuditEntry("kitchen-seen", detail)).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
    },
  );

  it("is the empty object, stored as {} and read back as {}", () => {
    const reading = readStaffAuditEntry("kitchen-seen", {});

    expect(reading).toEqual({
      ok: true,
      entry: { action: "kitchen-seen", detail: {} },
    });
  });
});
