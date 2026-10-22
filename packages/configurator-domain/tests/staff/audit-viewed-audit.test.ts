import { describe, expect, it } from "vitest";

import {
  STAFF_AUDIT_ACTIONS,
  STAFF_AUDIT_PAGE_SIZE,
  auditActionAcceptsDesignId,
  auditActionNamesDesign,
  readStaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

const VALID_DETAIL = {
  page: 2,
  rowCount: 25,
  hasActorFilter: true,
  hasActionFilter: false,
  hasDateFilter: true,
};

function refusalCodeOf(detail: unknown): string | undefined {
  const reading = readStaffAuditEntry("audit-viewed", detail);
  return reading.ok ? undefined : reading.code;
}

function detailOf(detail: unknown): object {
  const reading = readStaffAuditEntry("audit-viewed", detail);
  if (!reading.ok || reading.entry.detail === null) {
    throw new Error("expected an accepted audit-viewed detail");
  }
  return reading.entry.detail;
}

function withoutMember(key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(VALID_DETAIL).filter(([member]) => member !== key),
  );
}

describe("audit-viewed: one served page of the audit log", () => {
  it("is a listed action", () => {
    expect(STAFF_AUDIT_ACTIONS).toContain("audit-viewed");
  });

  it("pins the audit page size", () => {
    expect(STAFF_AUDIT_PAGE_SIZE).toBe(25);
  });

  describe("accepts the five codes and counts", () => {
    it.each([true, false])("with every filter flag %s", (flag) => {
      const detail = {
        ...VALID_DETAIL,
        hasActorFilter: flag,
        hasActionFilter: flag,
        hasDateFilter: flag,
      };

      expect(detailOf(detail)).toEqual(detail);
    });

    it.each([
      ["the first page", 1],
      ["a late page", 48],
      ["the largest safe integer", Number.MAX_SAFE_INTEGER],
    ])("accepts %s", (_label, page) => {
      expect(detailOf({ ...VALID_DETAIL, page })).toMatchObject({ page });
    });

    it.each([0, 1, 13, STAFF_AUDIT_PAGE_SIZE])(
      "accepts a page of %i rows",
      (rowCount) => {
        expect(detailOf({ ...VALID_DETAIL, rowCount })).toMatchObject({
          rowCount,
        });
      },
    );

    it.each(["hasActorFilter", "hasActionFilter", "hasDateFilter"])(
      "reads %s on its own",
      (flag) => {
        const detail = {
          ...VALID_DETAIL,
          hasActorFilter: false,
          hasActionFilter: false,
          hasDateFilter: false,
          [flag]: true,
        };

        expect(detailOf(detail)).toEqual(detail);
      },
    );
  });

  describe("refuses, as INVALID_DETAIL", () => {
    it.each([
      [
        "an actor id as a sixth member",
        { ...VALID_DETAIL, actorId: "Ab3_-Ab3_-Ab3_-Ab3_-Z" },
      ],
      ["the action filter's value", { ...VALID_DETAIL, action: "note-added" }],
      ["a date as a sixth member", { ...VALID_DETAIL, from: "2026-10-01" }],
      [
        "a design id as a sixth member",
        { ...VALID_DETAIL, designId: "Ab3_-Ab3_-Ab3_-Ab3_-Z" },
      ],
      ["page zero", { ...VALID_DETAIL, page: 0 }],
      ["a negative page", { ...VALID_DETAIL, page: -1 }],
      ["a fractional page", { ...VALID_DETAIL, page: 1.5 }],
      ["NaN as the page", { ...VALID_DETAIL, page: Number.NaN }],
      ["a page past the safe integers", { ...VALID_DETAIL, page: 2 ** 53 }],
      ["a page written as text", { ...VALID_DETAIL, page: "2" }],
      [
        "a row count one past the page size",
        { ...VALID_DETAIL, rowCount: STAFF_AUDIT_PAGE_SIZE + 1 },
      ],
      ["a negative row count", { ...VALID_DETAIL, rowCount: -1 }],
      ["a fractional row count", { ...VALID_DETAIL, rowCount: 1.5 }],
      ["a row count written as text", { ...VALID_DETAIL, rowCount: "3" }],
      [
        "hasActorFilter as the text true",
        { ...VALID_DETAIL, hasActorFilter: "true" },
      ],
      ["hasActionFilter as a number", { ...VALID_DETAIL, hasActionFilter: 1 }],
      ["hasDateFilter as null", { ...VALID_DETAIL, hasDateFilter: null }],
      ["no detail", undefined],
      ["a null detail", null],
      ["an empty object", {}],
      ["an array", [VALID_DETAIL]],
      ["a string", "page"],
    ])("%s", (_label, detail) => {
      expect(refusalCodeOf(detail)).toBe("INVALID_DETAIL");
    });

    it.each(Object.keys(VALID_DETAIL))("a detail missing %s", (key) => {
      expect(refusalCodeOf(withoutMember(key))).toBe("INVALID_DETAIL");
    });

    it("a detail whose members come off the prototype chain", () => {
      expect(refusalCodeOf(Object.create(VALID_DETAIL))).toBe("INVALID_DETAIL");
    });

    it.each(Object.entries(VALID_DETAIL))(
      "a detail whose %s comes off a polluted Object.prototype",
      (key, value) => {
        Reflect.defineProperty(Object.prototype, key, {
          value,
          configurable: true,
        });
        try {
          expect(refusalCodeOf(withoutMember(key))).toBe("INVALID_DETAIL");
        } finally {
          Reflect.deleteProperty(Object.prototype, key);
        }
      },
    );
  });

  describe("the stored detail is rebuilt from the five values", () => {
    it("is not the caller's object, and changing the input afterwards changes nothing", () => {
      const input = { ...VALID_DETAIL };

      const detail = detailOf(input);
      input.rowCount = 1;

      expect(detail).not.toBe(input);
      expect(detail).toMatchObject({ rowCount: 25 });
    });

    it("is frozen", () => {
      expect(Object.isFrozen(detailOf(VALID_DETAIL))).toBe(true);
    });

    it("drops a non-enumerable member the caller hid an actor in, and keeps it out of the stored form", () => {
      const input = { ...VALID_DETAIL };
      Object.defineProperty(input, "actorId", {
        value: "secret-actor",
        enumerable: false,
      });

      const detail = detailOf(input);

      expect(Reflect.ownKeys(detail)).not.toContain("actorId");
      expect(JSON.stringify(detail)).not.toContain("secret");
    });

    it("reads each member once, so a getter cannot pass one value and store another", () => {
      const reads: Record<string, number> = {};
      const input: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(VALID_DETAIL)) {
        Object.defineProperty(input, key, {
          enumerable: true,
          get: () => {
            reads[key] = (reads[key] ?? 0) + 1;
            return value;
          },
        });
      }

      detailOf(input);

      expect(reads).toEqual({
        page: 1,
        rowCount: 1,
        hasActorFilter: 1,
        hasActionFilter: 1,
        hasDateFilter: 1,
      });
    });

    it("holds exactly five members, none of them a value a person chose", () => {
      expect(Object.keys(detailOf(VALID_DETAIL)).sort()).toEqual([
        "hasActionFilter",
        "hasActorFilter",
        "hasDateFilter",
        "page",
        "rowCount",
      ]);
    });

    it("reads back as itself after the JSON column", () => {
      const reading = readStaffAuditEntry("audit-viewed", VALID_DETAIL);
      if (!reading.ok) throw new Error("expected an entry");
      const stored: unknown = JSON.parse(JSON.stringify(reading.entry.detail));

      expect(readStaffAuditEntry("audit-viewed", stored)).toEqual(reading);
    });
  });

  describe("names no design", () => {
    it("auditActionNamesDesign is false", () => {
      expect(auditActionNamesDesign("audit-viewed")).toBe(false);
    });

    it("accepts a null design id and refuses any other", () => {
      expect(auditActionAcceptsDesignId("audit-viewed", null)).toBe(true);
      expect(
        auditActionAcceptsDesignId("audit-viewed", "Ab3_-Ab3_-Ab3_-Ab3_-Z"),
      ).toBe(false);
    });
  });
});
