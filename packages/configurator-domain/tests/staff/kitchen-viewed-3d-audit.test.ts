import { describe, expect, it } from "vitest";

import {
  KITCHEN_VIEWED_3D_VERSIONS,
  STAFF_AUDIT_ACTIONS,
  isKitchenViewed3dVersion,
  STAFF_AUDIT_ACTION_NAMES_DESIGN,
  auditActionAcceptsDesignId,
  readStaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

const ACTION = "kitchen-viewed-3d";
const TABLE_ACTION_SHAPE = /^[a-z0-9-]{1,32}$/;

class VersionHolder {
  readonly version = "sent";
}

function codeOfRefusal(detail: unknown): string | undefined {
  const reading = readStaffAuditEntry(ACTION, detail);
  return reading.ok ? undefined : reading.code;
}

describe("kitchen-viewed-3d: the copy of a kitchen a staff member viewed in 3D", () => {
  it("is a listed action the table's action check accepts", () => {
    expect(STAFF_AUDIT_ACTIONS).toContain(ACTION);
    expect(TABLE_ACTION_SHAPE.test(ACTION)).toBe(true);
  });

  it("names a design, so a row is stored with one and is refused without", () => {
    expect(STAFF_AUDIT_ACTION_NAMES_DESIGN[ACTION]).toBe(true);
    expect(auditActionAcceptsDesignId(ACTION, "d".repeat(21))).toBe(true);
    expect(auditActionAcceptsDesignId(ACTION, null)).toBe(false);
  });

  it("lists exactly the two copies a view can serve", () => {
    expect(KITCHEN_VIEWED_3D_VERSIONS).toEqual(["sent", "current"]);
    expect(Object.isFrozen(KITCHEN_VIEWED_3D_VERSIONS)).toBe(true);
  });

  it.each([
    ["sent", true],
    ["current", true],
    ["as-sent", false],
    ["Sent", false],
    ["", false],
    [undefined, false],
    [["sent"], false],
  ])("the guard answers %j with %s", (value, expected) => {
    expect(isKitchenViewed3dVersion(value)).toBe(expected);
  });

  describe("accepts an object whose only key is version, sent or current", () => {
    it.each(KITCHEN_VIEWED_3D_VERSIONS)(
      "reads %s back as itself after the JSON column",
      (version) => {
        const stored: unknown = JSON.parse(JSON.stringify({ version }));

        expect(readStaffAuditEntry(ACTION, stored)).toEqual({
          ok: true,
          entry: { action: ACTION, detail: { version } },
        });
      },
    );

    it("stores a rebuilt, frozen detail and not the caller's object", () => {
      const input = { version: "current" };

      const reading = readStaffAuditEntry(ACTION, input);

      expect(reading.ok).toBe(true);
      if (!reading.ok) return;
      expect(reading.entry.detail).not.toBe(input);
      expect(Object.isFrozen(reading.entry.detail)).toBe(true);
    });
  });

  describe("refuses everything else as INVALID_DETAIL", () => {
    it.each([
      ["a null detail", null],
      ["an absent detail", undefined],
      ["an empty object", {}],
      ["a version named and undefined", { version: undefined }],
      ["an extra key beside a valid version", { version: "sent", note: "x" }],
      [
        "an extra key that is a client's name",
        { version: "sent", name: "Ana" },
      ],
      ["a different key", { source: "sent" }],
      ["the wire's word for the copy", { version: "as-sent" }],
      ["a capital", { version: "Sent" }],
      ["an edge space", { version: "sent " }],
      ["the empty string", { version: "" }],
      ["a number", { version: 1 }],
      ["null", { version: null }],
      ["an array of the value", { version: ["sent"] }],
      ["a String object", { version: new String("sent") }],
      ["an array", ["sent"]],
      ["the bare string", "sent"],
      ["a class instance holding the member", new VersionHolder()],
    ])("%s", (_label, detail) => {
      expect(codeOfRefusal(detail)).toBe("INVALID_DETAIL");
    });

    it("does not read a version the prototype supplies", () => {
      const inherited = Object.create({ version: "sent" }) as object;

      expect(codeOfRefusal(inherited)).toBe("INVALID_DETAIL");
    });
  });
});
