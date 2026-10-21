import { describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "../../src/staff/request-status.js";
import {
  STAFF_AUDIT_ACTIONS,
  isStaffAuditAction,
  readStaffAuditEntry,
  type StaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

const ACTIONS_WITHOUT_DETAIL = [
  "kitchen-opened",
  "note-added",
  "kitchen-unhidden",
] as const;

function codeOfRefusal(action: unknown, detail: unknown): string | undefined {
  const reading = readStaffAuditEntry(action, detail);
  return reading.ok ? undefined : reading.code;
}

function entryOf(action: unknown, detail: unknown): StaffAuditEntry {
  const reading = readStaffAuditEntry(action, detail);
  if (!reading.ok)
    throw new Error(`expected an entry, refused as ${reading.code}`);
  return reading.entry;
}

describe("the staff audit actions", () => {
  it("are the six that Lot 3 builds, each a code and not a sentence", () => {
    expect(STAFF_AUDIT_ACTIONS).toEqual([
      "kitchen-opened",
      "note-added",
      "status-changed",
      "kitchen-unhidden",
      "kitchens-listed",
      "audit-viewed",
    ]);
  });

  it("cannot be edited by a caller that imports the list", () => {
    expect(Object.isFrozen(STAFF_AUDIT_ACTIONS)).toBe(true);
  });

  it.each(STAFF_AUDIT_ACTIONS)("isStaffAuditAction accepts %s", (action) => {
    expect(isStaffAuditAction(action)).toBe(true);
  });

  it.each([
    ["the empty string", ""],
    ["a different case", "Kitchen-Opened"],
    ["a preset action no wave builds yet", "preset-hidden"],
    ["an invitation action no wave builds yet", "staff-invited"],
    ["an inherited object member", "constructor"],
    ["the prototype key", "__proto__"],
    ["null", null],
    ["a number", 1],
  ])("isStaffAuditAction refuses %s", (_label, value) => {
    expect(isStaffAuditAction(value)).toBe(false);
  });
});

describe("readStaffAuditEntry: an action and the codes that qualify it", () => {
  describe.each(ACTIONS_WITHOUT_DETAIL)("%s carries no detail", (action) => {
    it.each([
      ["null", null],
      ["an absent detail", undefined],
    ])("accepts %s", (_label, detail) => {
      expect(entryOf(action, detail)).toEqual({ action, detail: null });
    });

    it.each([
      ["an empty object", {}],
      ["a note's text", { text: "client called" }],
      ["a kitchen name", { name: "Ana's kitchen" }],
      ["a string", "client called"],
      ["zero", 0],
      ["an empty array", []],
    ])(
      "refuses %s as INVALID_DETAIL, so no free text reaches a row",
      (_label, detail) => {
        expect(codeOfRefusal(action, detail)).toBe("INVALID_DETAIL");
      },
    );
  });

  describe("status-changed carries the status it left and the status it set", () => {
    const everyPair = REQUEST_STATUSES.flatMap((from) =>
      REQUEST_STATUSES.map((to) => [from, to] as const),
    );

    it.each(everyPair)(
      "accepts %s to %s: any status may follow any",
      (from, to) => {
        expect(entryOf("status-changed", { from, to })).toEqual({
          action: "status-changed",
          detail: { from, to },
        });
      },
    );

    it("returns a detail holding only from and to", () => {
      const entry = entryOf("status-changed", { from: "new", to: "closed" });

      expect(Object.keys(entry.detail ?? {}).sort()).toEqual(["from", "to"]);
    });

    it.each([
      ["no detail", undefined],
      ["null", null],
      ["a missing to", { from: "new" }],
      ["a missing from", { to: "new" }],
      ["a status outside the list", { from: "new", to: "won" }],
      ["a display word for a code", { from: "Noua", to: "closed" }],
      ["an inherited name for a status", { from: "constructor", to: "new" }],
      ["a number for a status", { from: 0, to: 1 }],
      [
        "a third member, a note's text",
        { from: "new", to: "closed", text: "call back" },
      ],
      [
        "a third member, a client address",
        { from: "new", to: "closed", email: "a@b.ro" },
      ],
      ["an array", ["new", "closed"]],
      ["a string", "new closed"],
    ])("refuses %s as INVALID_DETAIL", (_label, detail) => {
      expect(codeOfRefusal("status-changed", detail)).toBe("INVALID_DETAIL");
    });

    it("does not read from or to off a polluted Object.prototype", () => {
      Reflect.defineProperty(Object.prototype, "from", {
        value: "new",
        configurable: true,
      });
      try {
        expect(codeOfRefusal("status-changed", { to: "closed" })).toBe(
          "INVALID_DETAIL",
        );
      } finally {
        Reflect.deleteProperty(Object.prototype, "from");
      }
    });

    it("does not read from or to off the prototype chain", () => {
      const inherited = Object.create({ from: "new", to: "closed" }) as unknown;

      expect(codeOfRefusal("status-changed", inherited)).toBe("INVALID_DETAIL");
    });
  });

  describe("an action outside the list", () => {
    it.each([
      ["a made-up code", "kitchen-deleted"],
      ["the empty string", ""],
      ["an inherited object member", "toString"],
      ["null", null],
      ["undefined", undefined],
    ])("refuses %s as UNKNOWN_ACTION", (_label, action) => {
      expect(codeOfRefusal(action, null)).toBe("UNKNOWN_ACTION");
    });

    it("reports the unknown action before it looks at the detail", () => {
      expect(codeOfRefusal("kitchen-deleted", { text: "x" })).toBe(
        "UNKNOWN_ACTION",
      );
    });
  });

  it("answers with a code and never the detail it was given", () => {
    const reading = readStaffAuditEntry("note-added", { text: "secret-note" });

    expect(JSON.stringify(reading)).not.toContain("secret");
  });

  it("gives a note-added entry no field a note's text could be typed into", () => {
    const accepted: StaffAuditEntry = { action: "note-added", detail: null };
    const leaking: StaffAuditEntry = {
      action: "note-added",
      // @ts-expect-error a note-added entry's detail is null, so a note's text has nowhere to go
      detail: { text: "call back" },
    };

    expect(accepted.detail).toBeNull();
    expect(leaking.action).toBe("note-added");
  });
});
