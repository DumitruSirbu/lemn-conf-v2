// M10 X0: the price dashboard's nine audit actions and their closed detail key lists (plan §8.4 e, A-22, F4). A detail
// holds kinds and codes from closed lists, server-minted ids and counts, and refuses any key outside its action's list,
// so a name, a label, a note or a search text has no field to be written into.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  ADDRESS_FIELDS,
  BOOK_FIELD_ADDRESS_KINDS,
} from "../../src/price-dashboard/book-field-address.js";
import {
  BULK_GROUP_CHANGE_KIND,
  CHANGE_ITEM_KINDS,
  DASHBOARD_AUDIT_ACTION_NAMES_DESIGN,
  DASHBOARD_AUDIT_ACTIONS,
  PRICE_GROUP_CODES,
  dashboardAuditActionNamesDesign,
  isDashboardAuditAction,
  readDashboardAuditEntry,
  type DashboardAuditAction,
} from "../../src/staff/dashboard-audit-action.js";
import {
  STAFF_AUDIT_ACTIONS,
  readStaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

/** One valid detail per action, the fullest form of each. Every other test derives from these. */
const VALID_DETAILS: Readonly<Record<DashboardAuditAction, object>> = {
  "price-draft-changed": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "cabinet.base-bottle-cargo",
    field: "perUnitMinor",
    widthMm: 200,
  },
  "price-draft-reverted": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "cabinet.base-bottle-cargo",
    field: "perUnitMinor",
    widthMm: 200,
    revertedCount: 1,
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
  "catalogue-item-active-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: false,
    availabilityRevision: "12",
  },
  "kitchen-defaults-saved": { changedFields: ["material", "topRowHandle"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "hardware" },
};

/** The keys a valid detail may omit on its own. The item keys go together, and `widthMm` needs `cabinet-size`. */
const OPTIONAL_KEYS: Readonly<
  Partial<Record<DashboardAuditAction, readonly string[]>>
> = {
  "price-draft-changed": ["field", "widthMm"],
  "price-draft-reverted": ["field", "widthMm"],
};

const ALL_ACTIONS = [...DASHBOARD_AUDIT_ACTIONS];

function refusalOf(action: string, detail: unknown): string | undefined {
  const reading = readDashboardAuditEntry(action, detail);
  return reading.ok ? undefined : reading.code;
}

function withoutKeys(detail: object, ...missing: readonly string[]): object {
  return Object.fromEntries(
    Object.entries(detail).filter(([key]) => !missing.includes(key)),
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
      "catalogue-item-active-changed",
      "kitchen-defaults-saved",
      "kitchen-seen",
      "price-catalogue-viewed",
    ]);
    expect(Object.isFrozen(DASHBOARD_AUDIT_ACTIONS)).toBe(true);
  });

  it("follow the six Lot 3 actions in the staff audit list, each once", () => {
    expect(STAFF_AUDIT_ACTIONS).toEqual([
      "kitchen-opened",
      "note-added",
      "status-changed",
      "kitchen-unhidden",
      "kitchens-listed",
      "audit-viewed",
      ...DASHBOARD_AUDIT_ACTIONS,
    ]);
    expect(new Set(STAFF_AUDIT_ACTIONS).size).toBe(STAFF_AUDIT_ACTIONS.length);
  });

  it.each(ALL_ACTIONS)(
    "%s is read through the staff reader as this reader reads it",
    (action) => {
      expect(readStaffAuditEntry(action, VALID_DETAILS[action])).toEqual(
        readDashboardAuditEntry(action, VALID_DETAILS[action]),
      );
    },
  );

  it("are refused by the staff reader for a key outside the list, and the Lot 3 actions by this reader", () => {
    expect(
      readStaffAuditEntry("price-published", {
        ...VALID_DETAILS["price-published"],
        label: "June",
      }),
    ).toEqual({ ok: false, code: "INVALID_DETAIL" });
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
      const itemKeys = ["itemKind", "itemId"];

      for (const key of Object.keys(VALID_DETAILS[action])) {
        if (itemKeys.includes(key)) continue;
        const reading = refusalOf(
          action,
          withoutKeys(VALID_DETAILS[action], key),
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

describe("the detail of a draft change and of a revert (m7)", () => {
  const CHANGED = VALID_DETAILS["price-draft-changed"];
  const REVERTED = VALID_DETAILS["price-draft-reverted"];

  it("names a listed kind alone, and every listed kind is accepted", () => {
    for (const changeKind of BOOK_FIELD_ADDRESS_KINDS) {
      expect(refusalOf("price-draft-changed", { changeKind })).toBeUndefined();
      expect(
        refusalOf("price-draft-reverted", { changeKind, revertedCount: 1 }),
      ).toBeUndefined();
    }
    expect(refusalOf("price-draft-changed", { changeKind: "active" })).toBe(
      "INVALID_DETAIL",
    );
  });

  it("names a field by one of the address fields' own words, and no other", () => {
    for (const field of ADDRESS_FIELDS) {
      expect(
        refusalOf("price-draft-changed", { changeKind: "cabinet", field }),
      ).toBeUndefined();
    }
    expect(
      refusalOf("price-draft-changed", {
        changeKind: "cabinet",
        field: "nameRu",
      }),
    ).toBe("INVALID_DETAIL");
  });

  it("takes an item kind from the six the plan lists", () => {
    expect([...CHANGE_ITEM_KINDS].sort()).toEqual([
      "accessory",
      "cabinet",
      "finish",
      "handle",
      "hardware",
      "material",
    ]);
    expect(
      refusalOf("price-draft-changed", {
        changeKind: "hardware",
        itemKind: "colour",
        itemId: "x",
      }),
    ).toBe("INVALID_DETAIL");
  });

  it("holds the item kind and the item id together, or neither", () => {
    for (const detail of [
      withoutKeys(CHANGED, "itemId", "widthMm", "field"),
      withoutKeys(CHANGED, "itemKind", "widthMm", "field"),
    ]) {
      expect(refusalOf("price-draft-changed", detail)).toBe("INVALID_DETAIL");
    }
    expect(
      refusalOf(
        "price-draft-changed",
        withoutKeys(CHANGED, "itemKind", "itemId"),
      ),
    ).toBeUndefined();
  });

  it("takes an id, never a name", () => {
    for (const itemId of ["Hettich Premium", "", 5, "x".repeat(65)]) {
      expect(refusalOf("price-draft-changed", { ...CHANGED, itemId })).toBe(
        "INVALID_DETAIL",
      );
    }
  });

  it("takes a width only for a fixed-size cabinet price, and only a whole positive one", () => {
    expect(
      refusalOf("price-draft-changed", { ...CHANGED, changeKind: "cabinet" }),
    ).toBe("INVALID_DETAIL");
    for (const widthMm of [0, -200, 1.5, "200"]) {
      expect(refusalOf("price-draft-changed", { ...CHANGED, widthMm })).toBe(
        "INVALID_DETAIL",
      );
    }
  });

  it("names no item for a rule or a switch of the book", () => {
    for (const changeKind of ["depth-rule", "provisional"]) {
      expect(
        refusalOf("price-draft-changed", {
          changeKind,
          itemKind: "cabinet",
          itemId: "cabinet.x",
        }),
      ).toBe("INVALID_DETAIL");
      expect(refusalOf("price-draft-changed", { changeKind })).toBeUndefined();
    }
  });

  it("reports a single revert as one, and a group revert as the bulk-group kind with its count and no item keys", () => {
    expect(
      refusalOf("price-draft-reverted", { ...REVERTED, revertedCount: 2 }),
    ).toBe("INVALID_DETAIL");
    expect(
      refusalOf("price-draft-reverted", withoutKeys(REVERTED, "revertedCount")),
    ).toBe("INVALID_DETAIL");
    expect(
      refusalOf("price-draft-reverted", {
        changeKind: BULK_GROUP_CHANGE_KIND,
        revertedCount: 4,
      }),
    ).toBeUndefined();
    expect(
      refusalOf("price-draft-reverted", {
        changeKind: BULK_GROUP_CHANGE_KIND,
        revertedCount: 0,
      }),
    ).toBe("INVALID_DETAIL");
    expect(
      refusalOf("price-draft-reverted", {
        changeKind: BULK_GROUP_CHANGE_KIND,
        itemKind: "cabinet",
        itemId: "cabinet.x",
        revertedCount: 4,
      }),
    ).toBe("INVALID_DETAIL");
  });

  it("refuses the group-revert kind on a change, which names an address", () => {
    expect(
      refusalOf("price-draft-changed", { changeKind: BULK_GROUP_CHANGE_KIND }),
    ).toBe("INVALID_DETAIL");
  });
});

describe("the detail of the other actions", () => {
  it("a bulk change holds a listed scope, a closed group code only for a group, a whole percent and counts from zero", () => {
    const valid = VALID_DETAILS["price-bulk-changed"];
    const cases: readonly object[] = [
      { ...valid, scope: "everything" },
      { ...valid, scope: "selected" },
      { ...valid, scope: "all" },
      withoutKeys(valid, "groupCode"),
      { ...valid, groupCode: "Kitchen columns" },
      { ...valid, groupCode: "hardware.x" },
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
    const valid = VALID_DETAILS["catalogue-item-active-changed"];
    const refused: readonly object[] = [
      { ...valid, itemKind: "cabinet" },
      { ...valid, itemKind: "colour" },
      { ...valid, itemId: "Hettich Premium" },
      { ...valid, active: "false" },
      { ...valid, availabilityRevision: 12 },
      { ...valid, availabilityRevision: "012" },
      { ...valid, availabilityRevision: "1e3" },
      { ...valid, availabilityRevision: "" },
    ];

    for (const detail of refused) {
      expect(refusalOf("catalogue-item-active-changed", detail)).toBe(
        "INVALID_DETAIL",
      );
    }
  });

  it("an availability revision is 0 or 1 to 19 digits with no leading zero, and at 19 digits at most the bigint's maximum, compared as text (m6)", () => {
    const valid = VALID_DETAILS["catalogue-item-active-changed"];
    const accepted = [
      "0",
      "1",
      "9",
      "9".repeat(18),
      "9223372036854775807",
      "1000000000000000000",
    ];
    const refused = [
      "9223372036854775808",
      "9999999999999999999",
      "1".repeat(20),
      "00",
      "-1",
    ];

    for (const availabilityRevision of accepted) {
      expect(
        refusalOf("catalogue-item-active-changed", {
          ...valid,
          availabilityRevision,
        }),
      ).toBeUndefined();
    }
    for (const availabilityRevision of refused) {
      expect(
        refusalOf("catalogue-item-active-changed", {
          ...valid,
          availabilityRevision,
        }),
      ).toBe("INVALID_DETAIL");
    }
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

  it("the seen marker names nothing: its detail is the empty key list, `{ }`, and the design is the row's own column", () => {
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

describe("a negative zero in a dashboard audit detail", () => {
  const NUMERIC_KEYS: readonly (readonly [DashboardAuditAction, string])[] = [
    ["price-draft-changed", "widthMm"],
    ["price-draft-reverted", "revertedCount"],
    ["price-bulk-changed", "percent"],
    ["price-bulk-changed", "ruleCount"],
    ["price-bulk-changed", "amountCount"],
    ["price-published", "sequenceNumber"],
    ["price-published", "changeCount"],
    ["price-restored-to-draft", "fromSequenceNumber"],
    ["price-restored-to-draft", "changeCount"],
  ];

  it.each(NUMERIC_KEYS)(
    "is refused for %s.%s, because JSON would store it as 0",
    (action, key) => {
      expect(refusalOf(action, { ...VALID_DETAILS[action], [key]: -0 })).toBe(
        "INVALID_DETAIL",
      );
    },
  );

  it("still accepts a plain zero where zero is a legal count and percent", () => {
    expect(
      readDashboardAuditEntry("price-bulk-changed", {
        ...VALID_DETAILS["price-bulk-changed"],
        percent: 0,
        ruleCount: 0,
        amountCount: 0,
      }).ok,
    ).toBe(true);
  });
});
