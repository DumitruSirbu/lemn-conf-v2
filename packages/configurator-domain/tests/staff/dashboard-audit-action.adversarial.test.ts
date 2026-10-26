// M10 X0, adversarial QA of the dashboard audit readers (plan §8.4 e, F4): what an accepted detail can hold is closed
// whatever the input, the ids a real book mints fit the id shape, and no input makes a reader throw.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { HandleSchema } from "../../src/design.js";
import { PALETTE_ENTRIES } from "../../src/materials.js";
import { ACCESSORY_IDS } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  DASHBOARD_AUDIT_ACTIONS,
  PRICE_GROUP_CODES,
  readDashboardAuditEntry,
  type DashboardAuditAction,
} from "../../src/staff/dashboard-audit-action.js";

/** A detail as the readers' own tests build each, the fullest form. */
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
    itemId: "dishDryingRack",
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

/** The keys plan §8.4 (e) lists for each action, written out here and not read from the reader. */
const PLAN_KEYS: Readonly<Record<DashboardAuditAction, readonly string[]>> = {
  "price-draft-changed": [
    "changeKind",
    "itemKind",
    "itemId",
    "field",
    "widthMm",
  ],
  "price-draft-reverted": [
    "changeKind",
    "itemKind",
    "itemId",
    "field",
    "widthMm",
    "revertedCount",
  ],
  "price-bulk-changed": [
    "scope",
    "groupCode",
    "percent",
    "ruleCount",
    "amountCount",
  ],
  "price-published": ["sequenceNumber", "changeCount", "provisional"],
  "price-restored-to-draft": ["fromSequenceNumber", "changeCount"],
  "catalogue-item-activation-changed": [
    "itemKind",
    "itemId",
    "active",
    "availabilityRevision",
  ],
  "kitchen-defaults-saved": ["changedFields"],
  "kitchen-seen": [],
  "price-catalogue-viewed": ["section"],
};

const ALL_ACTIONS = [...DASHBOARD_AUDIT_ACTIONS];

/** A letter the id shape excludes, built from its code point so no Romanian literal is written. */
const A_ROMANIAN_LETTER = String.fromCodePoint(0x103);

/** The shape of any string an accepted detail may hold: a closed word, a revision or an id. No space, no text. */
const ID_OR_WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** Text a person would type into a label, a note, a name or a search box, and values a hostile client would try. */
const HOSTILE_STRING = fc.oneof(
  fc.constantFrom(
    "Hettich Premium",
    "New price, from 1 January",
    "ion.popescu@example.md",
    "+373 69 123 456",
    "  ",
    "",
    "x\n",
    "<script>alert(1)</script>",
    "__proto__",
    "constructor",
  ),
  fc.string({ unit: "binary", maxLength: 80 }),
);

const JUNK_VALUE: fc.Arbitrary<unknown> = fc.oneof(
  HOSTILE_STRING,
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(HOSTILE_STRING, { maxLength: 4 }),
  fc.object({ maxDepth: 1 }),
);

/** The valid detail of an action with one thing done to it: a member replaced, a member removed or a member added. */
const TAMPERED_DETAIL = fc.constantFrom(...ALL_ACTIONS).chain((action) =>
  fc
    .tuple(
      fc.constantFrom(
        ...PLAN_KEYS[action],
        "label",
        "note",
        "search",
        "name",
        "customer",
        "email",
      ),
      fc.constantFrom("replace", "remove", "add"),
      JUNK_VALUE,
    )
    .map(([key, operation, junk]) => {
      const given: Record<string, unknown> = { ...VALID_DETAILS[action] };
      const detail =
        operation === "remove"
          ? Object.fromEntries(
              Object.entries(given).filter(([member]) => member !== key),
            )
          : { ...given, [key]: junk };
      return { action, detail };
    }),
);

function stringsIn(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}

describe("what an accepted dashboard audit detail can hold, whatever it was given", () => {
  propertyTest.prop([TAMPERED_DETAIL], { numRuns: 1000 })(
    "holds only its action's keys, and no string that is not a closed word, a revision or an id",
    ({ action, detail }) => {
      const reading = readDashboardAuditEntry(action, detail);
      if (!reading.ok) return;

      const allowed = PLAN_KEYS[action];
      const stored = reading.entry.detail as Record<string, unknown>;

      expect(Object.keys(stored).every((key) => allowed.includes(key))).toBe(
        true,
      );
      expect(stringsIn(stored).every((text) => ID_OR_WORD.test(text))).toBe(
        true,
      );
      expect(Object.values(stored).some((v) => v === null)).toBe(false);
      expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    },
  );

  it("is not vacuous: the generator above gets both accepted and refused details", () => {
    const readings = fc
      .sample(TAMPERED_DETAIL, 1000)
      .map(({ action, detail }) => readDashboardAuditEntry(action, detail).ok);

    expect(readings.filter(Boolean).length).toBeGreaterThan(50);
    expect(readings.filter((ok) => !ok).length).toBeGreaterThan(50);
  });

  propertyTest.prop([fc.anything(), fc.anything()], { numRuns: 500 })(
    "never throws, and answers only a reading, for any action and any detail",
    (action, detail) => {
      const reading = readDashboardAuditEntry(action, detail);

      expect(typeof reading.ok).toBe("boolean");
    },
  );

  propertyTest.prop(
    [
      fc.constantFrom(...ALL_ACTIONS),
      fc.anything({ withNullPrototype: true, withObjectString: true }),
    ],
    { numRuns: 300 },
  )(
    "never throws for a detail with no prototype or a hostile toString",
    (action, detail) => {
      expect(() => readDashboardAuditEntry(action, detail)).not.toThrow();
    },
  );

  it.each(ALL_ACTIONS)(
    "%s: a valid detail plus an own __proto__ key from JSON is refused and pollutes nothing",
    (action) => {
      const members = Object.entries(VALID_DETAILS[action]).map(
        ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
      );
      const json = `{${['"__proto__": {"label": "x"}', ...members].join(",")}}`;

      expect(readDashboardAuditEntry(action, JSON.parse(json))).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
      expect(({} as Record<string, unknown>)["label"]).toBeUndefined();
    },
  );
});

describe("the bulk change's group code", () => {
  const bulk = VALID_DETAILS["price-bulk-changed"];
  const read = (detail: object) =>
    readDashboardAuditEntry("price-bulk-changed", detail).ok;

  it("is required for a group and refused for each of the other scopes, for every closed code", () => {
    for (const groupCode of PRICE_GROUP_CODES) {
      expect(read({ ...bulk, scope: "group", groupCode })).toBe(true);
      expect(read({ ...bulk, scope: "all", groupCode })).toBe(false);
      expect(read({ ...bulk, scope: "selection", groupCode })).toBe(false);
    }
  });

  it.each([
    null,
    "",
    "BASE",
    "base ",
    "Base",
    "kitchen",
    "hardware.premium",
    1,
    true,
    ["base"],
  ])("refuses %j as a group code, and as an absent one", (groupCode) => {
    expect(read({ ...bulk, scope: "group", groupCode })).toBe(false);
    expect(read({ ...bulk, scope: "all", groupCode })).toBe(false);
  });

  it("refuses a group scope without its code, and a null code for a scope that has none", () => {
    const withoutCode = { ...bulk, groupCode: undefined };

    expect(read(withoutCode)).toBe(false);
    expect(read({ ...withoutCode, scope: "all", groupCode: null })).toBe(false);
  });

  it("holds the closed group list to the four groups of D2", () => {
    expect([...PRICE_GROUP_CODES]).toEqual(["base", "wall", "tall", "corner"]);
  });
});

/** The detail of a change that names one item: the kind of item and its id, both. */
interface ItemTarget {
  readonly itemKind: string;
  readonly itemId: string;
}

describe("the ids a real book mints", () => {
  const MINTED_IDS: readonly (readonly [string, string, readonly string[]])[] =
    [
      [
        "a cabinet rule",
        "cabinet",
        SAMPLE_PRICE_BOOK.cabinetRules.map((r) => r.ruleId),
      ],
      [
        "a hardware tier",
        "hardware",
        SAMPLE_PRICE_BOOK.hardware.tiers.map((t) => t.tierId),
      ],
      [
        "a material tier",
        "material",
        SAMPLE_PRICE_BOOK.material.tiers.map((t) => t.tierId),
      ],
      ["an accessory", "accessory", [...ACCESSORY_IDS]],
      ["a palette finish", "finish", PALETTE_ENTRIES.map((e) => e.entryId)],
      ["a handle", "handle", [...HandleSchema.options]],
    ];

  it.each(MINTED_IDS)(
    "%s fits the id an audit detail may hold, so an audit of a real change is never refused",
    (_what, itemKind, ids) => {
      expect(ids.length).toBeGreaterThan(0);
      for (const itemId of ids) {
        const target: ItemTarget = { itemKind, itemId };

        expect(
          readDashboardAuditEntry("price-draft-changed", {
            changeKind: "created-row-text",
            ...target,
          }).ok,
          itemId,
        ).toBe(true);
        expect(
          readDashboardAuditEntry("price-draft-reverted", {
            changeKind: "created-row-text",
            ...target,
            revertedCount: 1,
          }).ok,
          itemId,
        ).toBe(true);
      }
    },
  );

  it("fits at the length the domain allows an identifier, and not past it", () => {
    const longest = `a${"b".repeat(63)}`;
    const named = (itemId: string) =>
      readDashboardAuditEntry("price-draft-changed", {
        changeKind: "hardware",
        itemKind: "hardware",
        itemId,
      }).ok;

    expect(named(longest)).toBe(true);
    expect(named(`${longest}b`)).toBe(false);
  });

  it.each([
    "",
    " ",
    ".a",
    "-a",
    "a b",
    "a\n",
    "a@b",
    A_ROMANIAN_LETTER,
    "a/b",
    "a,b",
  ])("refuses %j as an id: it is not a server-minted id", (itemId) => {
    expect(
      readDashboardAuditEntry("price-draft-changed", {
        changeKind: "hardware",
        itemKind: "hardware",
        itemId,
      }).ok,
    ).toBe(false);
  });
});

describe("the target of a draft change (m7): kind and id together, a width only for a size", () => {
  const changed = (detail: object) =>
    readDashboardAuditEntry("price-draft-changed", detail).ok;
  const reverted = (detail: object) =>
    readDashboardAuditEntry("price-draft-reverted", {
      revertedCount: 1,
      ...detail,
    }).ok;
  const BOTH_READERS = [
    ["price-draft-changed", changed],
    ["price-draft-reverted", reverted],
  ] as const;

  it.each(BOTH_READERS)(
    "%s: an item kind without its id, or an id without its kind, is refused; both or neither is read",
    (_action, read) => {
      expect(read({ changeKind: "hardware", itemKind: "hardware" })).toBe(
        false,
      );
      expect(read({ changeKind: "hardware", itemId: "hardware.premium" })).toBe(
        false,
      );
      expect(
        read({
          changeKind: "hardware",
          itemKind: "hardware",
          itemId: "hardware.premium",
        }),
      ).toBe(true);
      expect(read({ changeKind: "hardware" })).toBe(true);
    },
  );

  it.each(BOTH_READERS)(
    "%s: a kind that names no item (depth rule, provisional) is refused once it names one",
    (_action, read) => {
      for (const changeKind of ["depth-rule", "provisional"]) {
        expect(read({ changeKind })).toBe(true);
        expect(read({ changeKind, itemKind: "material", itemId: "m" })).toBe(
          false,
        );
      }
    },
  );

  it.each(BOTH_READERS)(
    "%s: a cabinet is named by the kind `cabinet`, and no other kind outside the item list is read",
    (_action, read) => {
      expect(
        read({
          changeKind: "cabinet",
          itemKind: "cabinet",
          itemId: "cabinet.base-3drawer",
          field: "anchorMinor",
        }),
      ).toBe(true);
      for (const itemKind of ["colour", "Cabinet", "bulk-group", "", 5, null]) {
        expect(read({ changeKind: "cabinet", itemKind, itemId: "x" })).toBe(
          false,
        );
      }
    },
  );

  it.each(BOTH_READERS)(
    "%s: a width belongs to a cabinet size alone, and is a positive whole number",
    (_action, read) => {
      const size = {
        changeKind: "cabinet-size",
        itemKind: "cabinet",
        itemId: "cabinet.base-bottle-cargo",
      };

      expect(read({ ...size, widthMm: 200 })).toBe(true);
      for (const widthMm of [
        0,
        -200,
        200.5,
        "200",
        null,
        Number.NaN,
        2 ** 53,
      ]) {
        expect(read({ ...size, widthMm })).toBe(false);
      }
      for (const changeKind of ["cabinet", "hardware", "depth-rule"]) {
        expect(read({ ...size, changeKind, widthMm: 200 })).toBe(false);
      }
    },
  );

  it("a change names no revert count, and a revert names one", () => {
    expect(changed({ changeKind: "hardware", revertedCount: 1 })).toBe(false);
    expect(
      readDashboardAuditEntry("price-draft-reverted", {
        changeKind: "hardware",
      }).ok,
    ).toBe(false);
  });

  it("a single revert counts exactly one; a bulk-group revert counts one or more", () => {
    const revert = (changeKind: string, revertedCount: unknown) =>
      readDashboardAuditEntry("price-draft-reverted", {
        changeKind,
        revertedCount,
      }).ok;

    expect(revert("hardware", 1)).toBe(true);
    for (const count of [0, 2, -1, 1.5, "1", null, true]) {
      expect(revert("hardware", count)).toBe(false);
    }
    expect(revert("bulk-group", 1)).toBe(true);
    expect(revert("bulk-group", 12)).toBe(true);
    for (const count of [0, -1, 1.5, "12", null, Number.NaN, 2 ** 53]) {
      expect(revert("bulk-group", count)).toBe(false);
    }
  });

  it("a bulk-group revert names no item, no width, and is no draft change", () => {
    const group = { changeKind: "bulk-group", revertedCount: 3 };

    expect(
      readDashboardAuditEntry("price-draft-reverted", {
        ...group,
        itemKind: "cabinet",
        itemId: "cabinet.base-3drawer",
      }).ok,
    ).toBe(false);
    expect(
      readDashboardAuditEntry("price-draft-reverted", {
        ...group,
        widthMm: 200,
      }).ok,
    ).toBe(false);
    expect(
      readDashboardAuditEntry("price-draft-changed", {
        changeKind: "bulk-group",
      }).ok,
    ).toBe(false);
  });

  it("is rebuilt from the members it read: a group revert stores its count and its kind alone", () => {
    const reading = readDashboardAuditEntry("price-draft-reverted", {
      changeKind: "bulk-group",
      revertedCount: 4,
    });

    expect(reading).toEqual({
      ok: true,
      entry: {
        action: "price-draft-reverted",
        detail: { changeKind: "bulk-group", revertedCount: 4 },
      },
    });
  });
});

describe("an availability revision in the activation audit (m6)", () => {
  const BIGINT_MAX = 2n ** 63n - 1n;
  const activation = (availabilityRevision: unknown) =>
    readDashboardAuditEntry("catalogue-item-activation-changed", {
      itemKind: "material",
      itemId: "material.painted-mdf",
      active: false,
      availabilityRevision,
    }).ok;

  it.each([
    ["0", true],
    ["1", true],
    ["9", true],
    ["10", true],
    ["9223372036854775806", true],
    ["9223372036854775807", true],
    ["9223372036854775808", false],
    ["9223372036854775809", false],
    ["9999999999999999999", false],
    ["10000000000000000000", false],
    ["00", false],
    ["01", false],
    ["-1", false],
    ["+1", false],
    ["1e3", false],
    ["0x10", false],
    [" 1", false],
    ["1 ", false],
    ["1\n", false],
    ["", false],
    ["1".repeat(20), false],
    ["9".repeat(20), false],
    ["1".repeat(19), true],
    [1, false],
    [0, false],
    [BigInt(1), false],
    [null, false],
    [undefined, false],
  ])("reads %s as an availability revision: %s", (revision, accepted) => {
    expect(activation(revision)).toBe(accepted);
  });

  propertyTest.prop([fc.stringMatching(/^[0-9]{1,22}$/)], { numRuns: 2000 })(
    "accepts a digit run exactly when it has no leading zero (or is 0) and fits a bigint",
    (digits) => {
      const isWellFormed = digits === "0" || !digits.startsWith("0");

      expect(activation(digits)).toBe(
        isWellFormed && BigInt(digits) <= BIGINT_MAX,
      );
    },
  );

  it("is exact at the boundary, compared as text: one below, at and one above the widest bigint", () => {
    for (const offset of [-2n, -1n, 0n, 1n, 2n]) {
      const revision = (BIGINT_MAX + offset).toString();

      expect(activation(revision)).toBe(offset <= 0n);
    }
  });

  it("is required by the reader: the activation the caller hands the store has none and is refused here", () => {
    expect(
      readDashboardAuditEntry("catalogue-item-activation-changed", {
        itemKind: "material",
        itemId: "material.painted-mdf",
        active: true,
      }).ok,
    ).toBe(false);
  });

  it("names an item kind from the five a switch can name, never a cabinet", () => {
    const withKind = (itemKind: string) =>
      readDashboardAuditEntry("catalogue-item-activation-changed", {
        itemKind,
        itemId: "x",
        active: true,
        availabilityRevision: "1",
      }).ok;

    for (const itemKind of [
      "material",
      "hardware",
      "finish",
      "handle",
      "accessory",
    ]) {
      expect(withKind(itemKind)).toBe(true);
    }
    expect(withKind("cabinet")).toBe(false);
  });
});
