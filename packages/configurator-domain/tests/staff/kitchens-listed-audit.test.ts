import { describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "../../src/staff/request-status.js";
import {
  STAFF_AUDIT_ACTIONS,
  STAFF_AUDIT_ACTION_NAMES_DESIGN,
  auditActionAcceptsDesignId,
  auditActionNamesDesign,
  readStaffAuditEntry,
  type StaffAuditAction,
} from "../../src/staff/staff-audit-action.js";
import {
  STAFF_KITCHEN_PAGE_SIZE,
  STAFF_KITCHEN_SEGMENTS,
} from "../../src/staff/staff-kitchen-query.js";

const VALID_DETAIL = {
  segment: "sent",
  status: "new",
  page: 2,
  rowCount: 20,
  hasSearch: true,
};

function refusalCodeOf(detail: unknown): string | undefined {
  const reading = readStaffAuditEntry("kitchens-listed", detail);
  return reading.ok ? undefined : reading.code;
}

function withoutMember(key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(VALID_DETAIL).filter(([member]) => member !== key),
  );
}

function detailOf(detail: unknown): object {
  const reading = readStaffAuditEntry("kitchens-listed", detail);
  if (!reading.ok || reading.entry.detail === null) {
    throw new Error("expected an accepted kitchens-listed detail");
  }
  return reading.entry.detail;
}

describe("kitchens-listed: one served page of the kitchens list", () => {
  it("is a listed action", () => {
    expect(STAFF_AUDIT_ACTIONS).toContain("kitchens-listed");
  });

  describe("accepts the five codes and counts", () => {
    const everyFilter = STAFF_KITCHEN_SEGMENTS.flatMap((segment) =>
      [null, ...REQUEST_STATUSES].map((status) => [segment, status] as const),
    );

    it.each(everyFilter)("segment %s with status %s", (segment, status) => {
      const detail = { ...VALID_DETAIL, segment, status };

      expect(detailOf(detail)).toEqual(detail);
    });

    it.each([
      ["the first page", 1],
      ["a late page", 143],
      ["the largest safe integer", Number.MAX_SAFE_INTEGER],
    ])("accepts %s", (_label, page) => {
      expect(detailOf({ ...VALID_DETAIL, page })).toMatchObject({ page });
    });

    it.each([0, 1, 7, STAFF_KITCHEN_PAGE_SIZE])(
      "accepts a page of %i rows",
      (rowCount) => {
        expect(detailOf({ ...VALID_DETAIL, rowCount })).toMatchObject({
          rowCount,
        });
      },
    );

    it.each([true, false])("accepts hasSearch %s", (hasSearch) => {
      expect(detailOf({ ...VALID_DETAIL, hasSearch })).toMatchObject({
        hasSearch,
      });
    });
  });

  describe("refuses, as INVALID_DETAIL", () => {
    it.each([
      [
        "the search text as a sixth member",
        { ...VALID_DETAIL, q: "ana@example.ro" },
      ],
      ["a search member", { ...VALID_DETAIL, search: "ana" }],
      [
        "a client's e-mail as a sixth member",
        { ...VALID_DETAIL, email: "a@b.ro" },
      ],
      ["page zero", { ...VALID_DETAIL, page: 0 }],
      ["a negative page", { ...VALID_DETAIL, page: -1 }],
      ["a fractional page", { ...VALID_DETAIL, page: 1.5 }],
      ["NaN as the page", { ...VALID_DETAIL, page: Number.NaN }],
      ["a page past the safe integers", { ...VALID_DETAIL, page: 2 ** 53 }],
      ["a page written as text", { ...VALID_DETAIL, page: "2" }],
      [
        "a row count one past the page size",
        { ...VALID_DETAIL, rowCount: STAFF_KITCHEN_PAGE_SIZE + 1 },
      ],
      ["a negative row count", { ...VALID_DETAIL, rowCount: -1 }],
      ["a fractional row count", { ...VALID_DETAIL, rowCount: 1.5 }],
      ["a row count written as text", { ...VALID_DETAIL, rowCount: "3" }],
      ["a status outside the list", { ...VALID_DETAIL, status: "won" }],
      [
        "an absent status, which is null and not undefined",
        { ...VALID_DETAIL, status: undefined },
      ],
      ["a segment outside the list", { ...VALID_DETAIL, segment: "x" }],
      [
        "an inherited segment name",
        { ...VALID_DETAIL, segment: "constructor" },
      ],
      ["hasSearch as the text true", { ...VALID_DETAIL, hasSearch: "true" }],
      ["hasSearch as a number", { ...VALID_DETAIL, hasSearch: 1 }],
      ["hasSearch as null", { ...VALID_DETAIL, hasSearch: null }],
      ["no detail", undefined],
      ["a null detail", null],
      ["an empty object", {}],
      ["an array", [VALID_DETAIL]],
      ["a string", "sent"],
    ])("%s", (_label, detail) => {
      expect(refusalCodeOf(detail)).toBe("INVALID_DETAIL");
    });

    it.each(Object.keys(VALID_DETAIL))("a detail missing %s", (key) => {
      const rest = withoutMember(key);

      expect(refusalCodeOf(rest)).toBe("INVALID_DETAIL");
    });

    it("a detail whose members come off the prototype chain", () => {
      expect(refusalCodeOf(Object.create(VALID_DETAIL))).toBe("INVALID_DETAIL");
    });

    it("a detail whose members come off a polluted Object.prototype", () => {
      Reflect.defineProperty(Object.prototype, "rowCount", {
        value: 3,
        configurable: true,
      });
      try {
        const rest = withoutMember("rowCount");

        expect(refusalCodeOf(rest)).toBe("INVALID_DETAIL");
      } finally {
        Reflect.deleteProperty(Object.prototype, "rowCount");
      }
    });
  });

  describe("the stored detail is rebuilt from the five values", () => {
    it("is not the caller's object, and changing the input afterwards changes nothing", () => {
      const input = { ...VALID_DETAIL };

      const detail = detailOf(input);
      input.rowCount = 1;

      expect(detail).not.toBe(input);
      expect(detail).toMatchObject({ rowCount: 20 });
    });

    it("is frozen", () => {
      expect(Object.isFrozen(detailOf(VALID_DETAIL))).toBe(true);
    });

    it("drops a non-enumerable member the caller hid text in, and keeps it out of the stored form", () => {
      const input = { ...VALID_DETAIL };
      Object.defineProperty(input, "q", {
        value: "ana@example.ro",
        enumerable: false,
      });

      const detail = detailOf(input);

      expect(Reflect.ownKeys(detail)).not.toContain("q");
      expect(JSON.stringify(detail)).not.toContain("example");
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
        segment: 1,
        status: 1,
        page: 1,
        rowCount: 1,
        hasSearch: 1,
      });
    });

    it("holds exactly five members, none of them text a person typed", () => {
      expect(Object.keys(detailOf(VALID_DETAIL)).sort()).toEqual([
        "hasSearch",
        "page",
        "rowCount",
        "segment",
        "status",
      ]);
    });

    it("reads back as itself after the JSON column", () => {
      const entry = readStaffAuditEntry("kitchens-listed", VALID_DETAIL);
      if (!entry.ok) throw new Error("expected an entry");
      const stored: unknown = JSON.parse(JSON.stringify(entry.entry.detail));

      expect(readStaffAuditEntry("kitchens-listed", stored)).toEqual(entry);
    });
  });
});

describe("which audit actions name a design", () => {
  const ACTIONS_THAT_NAME_ONE: readonly StaffAuditAction[] = [
    "kitchen-opened",
    "note-added",
    "status-changed",
    "kitchen-unhidden",
  ];

  it("classifies exactly the listed actions", () => {
    expect(Object.keys(STAFF_AUDIT_ACTION_NAMES_DESIGN).sort()).toEqual(
      [...STAFF_AUDIT_ACTIONS].sort(),
    );
    expect(Object.isFrozen(STAFF_AUDIT_ACTION_NAMES_DESIGN)).toBe(true);
  });

  it.each(ACTIONS_THAT_NAME_ONE)("%s names a design", (action) => {
    expect(auditActionNamesDesign(action)).toBe(true);
  });

  it("kitchens-listed names none", () => {
    expect(auditActionNamesDesign("kitchens-listed")).toBe(false);
  });

  describe("auditActionAcceptsDesignId", () => {
    it.each(ACTIONS_THAT_NAME_ONE)("%s needs a design id", (action) => {
      expect(auditActionAcceptsDesignId(action, "Ab3_-Ab3_-Ab3_-Ab3_-Z")).toBe(
        true,
      );
      expect(auditActionAcceptsDesignId(action, null)).toBe(false);
    });

    it("kitchens-listed accepts null and refuses any design id", () => {
      expect(auditActionAcceptsDesignId("kitchens-listed", null)).toBe(true);
      expect(
        auditActionAcceptsDesignId("kitchens-listed", "Ab3_-Ab3_-Ab3_-Ab3_-Z"),
      ).toBe(false);
    });
  });
});
