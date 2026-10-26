// M10 X0: the price dashboard's nine audit actions and their closed detail key lists (plan §8.4 e, A-22, F4). A detail
// holds kinds and codes from closed lists, server-minted ids and counts, and refuses any key outside its action's list,
// so a name, a label, a note or a search text has no field to be written into.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { BOOK_FIELD_ADDRESS_KINDS } from "../../src/price-dashboard/book-field-address.js";
import {
  DASHBOARD_AUDIT_ACTION_NAMES_DESIGN,
  DASHBOARD_AUDIT_ACTIONS,
  DRAFT_CHANGE_FIELDS,
  PRICE_GROUP_CODES,
  STAFF_AUDIT_ACTIONS,
  dashboardAuditActionNamesDesign,
  isDashboardAuditAction,
  readDashboardAuditEntry,
  readStaffAuditEntry,
  type DashboardAuditAction,
} from "../../src/staff/staff-audit-action.js";

/** One valid detail per action, the fullest form of each. Every other test derives from these. */
const VALID_DETAILS: Readonly<Record<DashboardAuditAction, object>> = {
  "price-draft-changed": {
    changeKind: "hardware",
    itemKind: "hardware",
    itemId: "hardware.premium",
    field: "perLiftMinor",
  },
  "price-draft-reverted": {
    changeKind: "item-deleted",
    itemKind: "accessory",
    itemId: "accessory.dish-drying-rack",
  },
  "price-bulk-changed": {
    scope: "group",
    groupCode: "tall",
    percent: -3,
    ruleCount: 3,
    amountCount: 10,
  },
  "price-published": { sequenceNumber: 7, changeCount: 6, provisional: true },
  "price-restored-to-draft": { fromSequenceNumber: 5, changeCount: 4 },
  "catalogue-item-activation-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: false,
    availabilityRevision: "12",
  },
  "kitchen-defaults-saved": { changedFields: ["material", "topRowHandle"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "hardware" },
};

/** The keys a valid detail may omit. Every other key is required. */
const OPTIONAL_KEYS: Readonly<
  Partial<Record<DashboardAuditAction, readonly string[]>>
> = {
  "price-draft-changed": ["itemKind", "itemId", "field"],
  "price-draft-reverted": ["itemKind", "itemId"],
};

const ALL_ACTIONS = [...DASHBOARD_AUDIT_ACTIONS];

function refusalOf(action: string, detail: unknown): string | undefined {
  const reading = readDashboardAuditEntry(action, detail);
  return reading.ok ? undefined : reading.code;
}

function withoutKey(detail: object, missingKey: string): object {
  return Object.fromEntries(
    Object.entries(detail).filter(([key]) => key !== missingKey),
  );
}

describe("the dashboard audit actions", () => {
  it("are the nine that §8.4 e names, each a code and not a sentence", () => {
    expect(DASHBOARD_AUDIT_ACTIONS).toEqual([
      "price-draft-changed",
      "price-draft-reverted",
      "price-bulk-changed",
      "price-published",
      "price-restored-to-draft",
      "catalogue-item-activation-changed",
      "kitchen-defaults-saved",
      "kitchen-seen",
      "price-catalogue-viewed",
    ]);
    expect(Object.isFrozen(DASHBOARD_AUDIT_ACTIONS)).toBe(true);
  });

  it("share no action with the six Lot 3 actions, whose list the audit page filters by", () => {
    const lotThree: readonly string[] = STAFF_AUDIT_ACTIONS;

    expect(DASHBOARD_AUDIT_ACTIONS.filter((a) => lotThree.includes(a))).toEqual(
      [],
    );
  });

  it("are refused by the Lot 3 reader, and the Lot 3 actions by this one", () => {
    expect(readStaffAuditEntry("price-published", {})).toEqual({
      ok: false,
      code: "UNKNOWN_ACTION",
    });
    expect(refusalOf("kitchen-opened", null)).toBe("UNKNOWN_ACTION");
    expect(isDashboardAuditAction("kitchen-opened")).toBe(false);
  });

  it.each(ALL_ACTIONS)("accepts %s as an action", (action) => {
    expect(isDashboardAuditAction(action)).toBe(true);
  });

  it.each([undefined, null, 3, {}, [], "Price-Published", "price-published "])(
    "refuses %j as an action",
    (value) => {
      expect(isDashboardAuditAction(value)).toBe(false);
      expect(refusalOf(value as string, {})).toBe("UNKNOWN_ACTION");
    },
  );
});

describe("a dashboard audit detail", () => {
  it.each(ALL_ACTIONS)("%s: a valid detail is read back as given", (action) => {
    const reading = readDashboardAuditEntry(action, VALID_DETAILS[action]);

    expect(reading).toEqual({
      ok: true,
      entry: { action, detail: VALID_DETAILS[action] },
    });
  });

  it.each(ALL_ACTIONS)(
    "%s: refuses the detail once it holds one key outside its list",
    (action) => {
      const withExtraKey = { ...VALID_DETAILS[action], name: "Hettich" };

      expect(refusalOf(action, withExtraKey)).toBe("INVALID_DETAIL");
    },
  );

  it.each(ALL_ACTIONS)(
    "%s: refuses a free-text key a label, a note, a search text or a customer value would arrive under",
    (action) => {
      for (const key of ["label", "note", "text", "search", "value", "name"]) {
        expect(
          refusalOf(action, { ...VALID_DETAILS[action], [key]: "x" }),
        ).toBe("INVALID_DETAIL");
      }
    },
  );

  propertyTest.prop([
    fc.constantFrom(...ALL_ACTIONS),
    fc.string({ minLength: 1, maxLength: 12 }),
  ])(
    "refuses any key its action does not list, whatever it is called",
    (action, key) => {
      const known = Object.keys(VALID_DETAILS[action]);
      fc.pre(!known.includes(key) && key !== "__proto__");

      const withExtraKey = { ...VALID_DETAILS[action], [key]: 1 };

      expect(refusalOf(action, withExtraKey)).toBe("INVALID_DETAIL");
    },
  );

  it.each(ALL_ACTIONS)(
    "%s: refuses the detail once a required key is missing, and accepts it once an optional one is",
    (action) => {
      const optional = OPTIONAL_KEYS[action] ?? [];

      for (const key of Object.keys(VALID_DETAILS[action])) {
        const reading = refusalOf(
          action,
          withoutKey(VALID_DETAILS[action], key),
        );

        expect(reading).toBe(
          optional.includes(key) ? undefined : "INVALID_DETAIL",
        );
      }
    },
  );

  it.each(ALL_ACTIONS)(
    "%s: refuses an absent detail and one that is not plain data",
    (action) => {
      for (const detail of [
        null,
        undefined,
        "x",
        3,
        [],
        [VALID_DETAILS[action]],
      ]) {
        expect(refusalOf(action, detail)).toBe("INVALID_DETAIL");
      }
    },
  );

  it("is rebuilt: an inherited key is not read, and the caller's object is not the stored one", () => {
    const inherited = Object.create({ changeKind: "cabinet" }) as object;
    const given = { ...VALID_DETAILS["price-published"] };
    const reading = readDashboardAuditEntry("price-published", given);

    expect(refusalOf("price-draft-changed", inherited)).toBe("INVALID_DETAIL");
    expect(reading.ok && reading.entry.detail).not.toBe(given);
    expect(reading.ok && Object.isFrozen(reading.entry.detail)).toBe(true);
  });

  it("survives the JSON column it is written to", () => {
    for (const action of ALL_ACTIONS) {
      const first = readDashboardAuditEntry(action, VALID_DETAILS[action]);
      if (!first.ok) throw new Error("expected an accepted detail");

      const stored: unknown = JSON.parse(JSON.stringify(first.entry.detail));

      expect(readDashboardAuditEntry(action, stored)).toEqual(first);
    }
  });
});

describe("the detail of each action", () => {
  it("a draft change names a listed kind, and optionally a listed item kind, an id and a listed field", () => {
    for (const changeKind of BOOK_FIELD_ADDRESS_KINDS) {
      expect(refusalOf("price-draft-changed", { changeKind })).toBeUndefined();
      expect(refusalOf("price-draft-reverted", { changeKind })).toBeUndefined();
    }
    for (const field of DRAFT_CHANGE_FIELDS) {
      expect(
        refusalOf("price-draft-changed", { changeKind: "cabinet", field }),
      ).toBeUndefined();
    }
    const refused: readonly object[] = [
      { changeKind: "active" },
      { changeKind: "cabinet", field: "nameRu" },
      { changeKind: "cabinet", itemKind: "colour" },
      { changeKind: "hardware", itemId: "Hettich Premium" },
      { changeKind: "hardware", itemId: 5 },
    ];

    for (const detail of refused) {
      expect(refusalOf("price-draft-changed", detail)).toBe("INVALID_DETAIL");
    }
  });

  it("a revert holds no field: the value it removes is not named", () => {
    expect(
      refusalOf("price-draft-reverted", {
        changeKind: "cabinet",
        field: "anchorMinor",
      }),
    ).toBe("INVALID_DETAIL");
  });

  it("a bulk change holds a listed scope, a group code only for a group, a whole percent and counts from zero", () => {
    const valid = VALID_DETAILS["price-bulk-changed"];
    const cases: readonly object[] = [
      { ...valid, scope: "everything" },
      { ...valid, scope: "selected" },
      { ...valid, scope: "all" },
      withoutKey(valid, "groupCode"),
      { ...valid, groupCode: "Kitchen columns" },
      { ...valid, ruleCount: -1 },
      { ...valid, amountCount: 1.5 },
      { ...valid, percent: 2.5 },
      { ...valid, percent: 2 ** 53 },
      { ...valid, percent: "5" },
    ];

    for (const detail of cases) {
      expect(refusalOf("price-bulk-changed", detail)).toBe("INVALID_DETAIL");
    }
    for (const groupCode of PRICE_GROUP_CODES) {
      expect(
        refusalOf("price-bulk-changed", { ...valid, groupCode }),
      ).toBeUndefined();
    }
    expect([...PRICE_GROUP_CODES]).toEqual(["base", "wall", "tall", "corner"]);
    expect(
      refusalOf("price-bulk-changed", { ...valid, groupCode: "hardware.x" }),
    ).toBe("INVALID_DETAIL");
    expect(
      refusalOf("price-bulk-changed", {
        scope: "selection",
        percent: 0,
        ruleCount: 0,
        amountCount: 0,
      }),
    ).toBeUndefined();
  });

  it("a publish names its sequence number, never the version's label or note", () => {
    const valid = VALID_DETAILS["price-published"];

    for (const key of ["label", "note", "versionId"]) {
      expect(refusalOf("price-published", { ...valid, [key]: "v1" })).toBe(
        "INVALID_DETAIL",
      );
    }
    expect(refusalOf("price-published", { ...valid, sequenceNumber: 0 })).toBe(
      "INVALID_DETAIL",
    );
    expect(
      refusalOf("price-published", { ...valid, sequenceNumber: 1.5 }),
    ).toBe("INVALID_DETAIL");
    expect(refusalOf("price-published", { ...valid, changeCount: -1 })).toBe(
      "INVALID_DETAIL",
    );
    expect(
      refusalOf("price-published", { ...valid, provisional: "true" }),
    ).toBe("INVALID_DETAIL");
  });

  it("a restore names the sequence number it restored from", () => {
    const valid = VALID_DETAILS["price-restored-to-draft"];

    expect(
      refusalOf("price-restored-to-draft", { ...valid, sequenceNumber: 5 }),
    ).toBe("INVALID_DETAIL");
    expect(
      refusalOf("price-restored-to-draft", { ...valid, fromSequenceNumber: 0 }),
    ).toBe("INVALID_DETAIL");
  });

  it("an activation names a listed kind, an id, a boolean and the availability revision it created", () => {
    const valid = VALID_DETAILS["catalogue-item-activation-changed"];
    const refused: readonly object[] = [
      { ...valid, itemKind: "colour" },
      { ...valid, itemId: "Hettich Premium" },
      { ...valid, active: "false" },
      { ...valid, availabilityRevision: 12 },
      { ...valid, availabilityRevision: "012" },
      { ...valid, availabilityRevision: "1e3" },
      { ...valid, availabilityRevision: "" },
      { ...valid, availabilityRevision: "1".repeat(20) },
    ];

    for (const detail of refused) {
      expect(refusalOf("catalogue-item-activation-changed", detail)).toBe(
        "INVALID_DETAIL",
      );
    }
    expect(
      refusalOf("catalogue-item-activation-changed", {
        ...valid,
        availabilityRevision: "0",
      }),
    ).toBeUndefined();
  });

  it("a defaults save names the rows it changed, from the closed list, at least one and none twice", () => {
    const refused: readonly unknown[] = [
      [],
      ["material", "material"],
      ["material", "colour"],
      ["top-row-handle"],
      "material",
      [{ field: "material" }],
    ];

    for (const changedFields of refused) {
      expect(refusalOf("kitchen-defaults-saved", { changedFields })).toBe(
        "INVALID_DETAIL",
      );
    }
  });

  it("a catalogue view names a listed section", () => {
    expect(refusalOf("price-catalogue-viewed", { section: "settings" })).toBe(
      "INVALID_DETAIL",
    );
    expect(refusalOf("price-catalogue-viewed", { section: "cabinets" })).toBe(
      "INVALID_DETAIL",
    );
  });

  it("the seen marker names nothing: the design is the row's own column", () => {
    expect(readDashboardAuditEntry("kitchen-seen", {})).toEqual({
      ok: true,
      entry: { action: "kitchen-seen", detail: {} },
    });
    expect(refusalOf("kitchen-seen", { revision: "7" })).toBe("INVALID_DETAIL");
    expect(refusalOf("kitchen-seen", { designId: "d" })).toBe("INVALID_DETAIL");
  });
});

describe("which dashboard actions name a design", () => {
  it("classifies every action, and only the seen marker names one", () => {
    expect(Object.keys(DASHBOARD_AUDIT_ACTION_NAMES_DESIGN).sort()).toEqual(
      [...DASHBOARD_AUDIT_ACTIONS].sort(),
    );
    expect(Object.isFrozen(DASHBOARD_AUDIT_ACTION_NAMES_DESIGN)).toBe(true);
    expect(
      DASHBOARD_AUDIT_ACTIONS.filter(dashboardAuditActionNamesDesign),
    ).toEqual(["kitchen-seen"]);
  });
});
