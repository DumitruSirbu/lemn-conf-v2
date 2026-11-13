import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  STAFF_AUDIT_ACTIONS,
  STAFF_AUDIT_ACTION_NAMES_DESIGN,
  readStaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

/**
 * Adversarial QA of the `kitchen-viewed-3d` detail reader (M11 W3a-7b, ADR 0180 d3, F2): a closed key list, own keys only,
 * and no other action admitted a detail it would have refused before.
 */

const ACTION = "kitchen-viewed-3d";

function isRefused(detail: unknown): boolean {
  const reading = readStaffAuditEntry(ACTION, detail);
  return !reading.ok && reading.code === "INVALID_DETAIL";
}

describe("kitchen-viewed-3d detail reader, hostile shapes", () => {
  it("refuses an own __proto__ key that JSON.parse creates beside a valid version", () => {
    const parsed: unknown = JSON.parse(
      '{"version":"sent","__proto__":{"x":1}}',
    );

    expect(isRefused(parsed)).toBe(true);
  });

  it.each([
    [
      "a non-enumerable extra key",
      () => {
        const detail = { version: "sent" };
        Object.defineProperty(detail, "hidden", {
          value: "x",
          enumerable: false,
        });
        return detail;
      },
    ],
    [
      "a symbol-keyed extra member",
      () => ({ version: "sent", [Symbol("note")]: "x" }),
    ],
  ])(
    "lets %s through the reading but never into the rebuilt detail the store writes (JSON cannot carry it either)",
    (_title, build) => {
      const reading = readStaffAuditEntry(ACTION, build());

      expect(reading.ok).toBe(true);
      if (!reading.ok) return;
      expect(Reflect.ownKeys(reading.entry.detail ?? {})).toEqual(["version"]);
    },
  );

  it("does not accept a version that is an accessor which answers differently on a second read", () => {
    let reads = 0;
    const detail = {
      get version() {
        reads += 1;
        return reads === 1 ? "sent" : "<script>";
      },
    };

    const reading = readStaffAuditEntry(ACTION, detail);

    if (reading.ok) {
      expect(reading.entry).toEqual({
        action: ACTION,
        detail: { version: "sent" },
      });
    } else {
      expect(reading.code).toBe("INVALID_DETAIL");
    }
  });

  it("refuses an empty detail even while Object.prototype carries a version, since only an own member counts", () => {
    Object.defineProperty(Object.prototype, "version", {
      value: "sent",
      configurable: true,
      enumerable: false,
      writable: true,
    });
    try {
      expect(isRefused({})).toBe(true);
    } finally {
      Reflect.deleteProperty(Object.prototype, "version");
    }
  });

  it.each([
    ["a Date", new Date(0)],
    ["a Map", new Map([["version", "sent"]])],
    ["a function", () => ({ version: "sent" })],
    ["a number", 3],
    ["true", true],
    ["an empty string", ""],
  ])("refuses %s as a detail", (_title, detail) => {
    expect(isRefused(detail)).toBe(true);
  });

  it("accepts an object with a null prototype that holds only version", () => {
    const detail = Object.assign(Object.create(null) as object, {
      version: "current",
    });

    expect(readStaffAuditEntry(ACTION, detail)).toEqual({
      ok: true,
      entry: { action: ACTION, detail: { version: "current" } },
    });
  });
});

describe("kitchen-viewed-3d detail reader, swept", () => {
  it("accepts a detail exactly when it has one own key, version, valued sent or current", () => {
    const anyValue = fc.oneof(
      fc.constantFrom("sent", "current", "as-sent", "Sent", " sent", ""),
      fc.string(),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.boolean(),
    );
    const anyExtraKey = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(
        anyValue,
        fc.option(anyExtraKey, { nil: undefined }),
        (version, extraKey) => {
          const detail: Record<string, unknown> = { version };
          if (extraKey !== undefined && extraKey !== "version") {
            detail[extraKey] = "x";
          }
          const isExpected =
            Object.keys(detail).length === 1 &&
            (version === "sent" || version === "current");

          const reading = readStaffAuditEntry(ACTION, detail);

          expect(reading.ok).toBe(isExpected);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("always rebuilds a frozen detail that holds only the version", () => {
    fc.assert(
      fc.property(fc.constantFrom("sent", "current"), (version) => {
        const reading = readStaffAuditEntry(ACTION, { version });

        expect(reading.ok).toBe(true);
        if (!reading.ok) return;
        expect(Object.keys(reading.entry.detail ?? {})).toEqual(["version"]);
        expect(Object.isFrozen(reading.entry.detail)).toBe(true);
      }),
    );
  });
});

describe("no other action's reading moved", () => {
  const OTHER_ACTIONS_WITH_NO_DETAIL = STAFF_AUDIT_ACTIONS.filter(
    (action) =>
      ![
        ACTION,
        "status-changed",
        "kitchens-listed",
        "audit-viewed",
        "kitchen-seen",
      ].includes(action) && STAFF_AUDIT_ACTION_NAMES_DESIGN[action],
  );

  it("has at least one other action that takes no detail to compare against", () => {
    expect(OTHER_ACTIONS_WITH_NO_DETAIL).toContain("kitchen-opened");
  });

  it.each(OTHER_ACTIONS_WITH_NO_DETAIL)(
    "still refuses %s given the 3D view's detail, and still accepts it with none",
    (action) => {
      const withVersion = readStaffAuditEntry(action, { version: "sent" });
      const withNone = readStaffAuditEntry(action, null);

      expect(withVersion.ok).toBe(false);
      expect(withNone.ok).toBe(true);
    },
  );

  it("refuses the 3D view's action name with a different case or an edge space", () => {
    for (const name of [
      "Kitchen-Viewed-3d",
      "kitchen-viewed-3d ",
      "kitchen-viewed-3D",
    ]) {
      expect(readStaffAuditEntry(name, { version: "sent" }).ok).toBe(false);
    }
  });

  it("lists the action once and in the table's action shape", () => {
    expect(
      STAFF_AUDIT_ACTIONS.filter((action) => action === ACTION),
    ).toHaveLength(1);
    expect(new Set(STAFF_AUDIT_ACTIONS).size).toBe(STAFF_AUDIT_ACTIONS.length);
    for (const action of STAFF_AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z0-9-]{1,32}$/);
    }
  });
});
