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
} from "../../src/staff/staff-audit-action.js";

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
        ...Object.keys(VALID_DETAILS[action]),
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

      const allowed = Object.keys(VALID_DETAILS[action]);
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

describe("the ids a real book mints", () => {
  const MINTED_IDS: readonly (readonly [string, readonly string[]])[] = [
    ["a cabinet rule", SAMPLE_PRICE_BOOK.cabinetRules.map((r) => r.ruleId)],
    ["a hardware tier", SAMPLE_PRICE_BOOK.hardware.tiers.map((t) => t.tierId)],
    ["a material tier", SAMPLE_PRICE_BOOK.material.tiers.map((t) => t.tierId)],
    ["an accessory", [...ACCESSORY_IDS]],
    ["a palette finish", PALETTE_ENTRIES.map((entry) => entry.entryId)],
    ["a handle", [...HandleSchema.options]],
  ];

  it.each(MINTED_IDS)(
    "%s fits the id an audit detail may hold, so an audit of a real change is never refused",
    (_what, ids) => {
      expect(ids.length).toBeGreaterThan(0);
      for (const itemId of ids) {
        expect(
          readDashboardAuditEntry("price-draft-changed", {
            changeKind: "cabinet",
            itemId,
          }).ok,
          itemId,
        ).toBe(true);
        expect(
          readDashboardAuditEntry("price-draft-reverted", {
            changeKind: "cabinet",
            itemId,
          }).ok,
          itemId,
        ).toBe(true);
      }
    },
  );

  it("fits at the length the domain allows an identifier, and not past it", () => {
    const longest = `a${"b".repeat(63)}`;

    expect(
      readDashboardAuditEntry("price-draft-changed", {
        changeKind: "cabinet",
        itemId: longest,
      }).ok,
    ).toBe(true);
    expect(
      readDashboardAuditEntry("price-draft-changed", {
        changeKind: "cabinet",
        itemId: `${longest}b`,
      }).ok,
    ).toBe(false);
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
        changeKind: "cabinet",
        itemId,
      }).ok,
    ).toBe(false);
  });
});
