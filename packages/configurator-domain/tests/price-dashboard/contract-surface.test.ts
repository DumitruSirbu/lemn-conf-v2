// M10 X0, adversarial QA of the domain contract's surface: the lists equal the plan's §8.4 (b) literally, the address
// holds identity members and nothing else, a creation carries no id, and the barrels re-export what X0 wrote. The
// type-level checks run in `pnpm typecheck`: a changed shape fails there, and the runtime ones fail in the suite.
import { describe, expect, expectTypeOf, it } from "vitest";

import * as barrel from "../../src/index.js";
import * as addressModule from "../../src/price-dashboard/book-field-address.js";
import type {
  AccessoryCreation,
  AddressField,
  BookFieldAddress,
  BookFieldAddressKind,
  DraftChange,
  DraftValueByKind,
  HardwareTierCreation,
} from "../../src/price-dashboard/book-field-address.js";
import type {
  CatalogueAvailability,
  ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import * as auditModule from "../../src/staff/staff-audit-action.js";

/** Every member name any address arm has. An address is identity: a payload member would widen this union. */
type AddressMemberName = BookFieldAddress extends infer Arm
  ? Arm extends unknown
    ? keyof Arm
    : never
  : never;

type FieldOfAnyArm = Extract<BookFieldAddress, { field: unknown }>["field"];

describe("the field address against the plan's §8.4 (b), literally", () => {
  it("has the eleven kinds the plan lists, and no other", () => {
    expect([...addressModule.BOOK_FIELD_ADDRESS_KINDS].sort()).toEqual(
      [
        "cabinet",
        "cabinet-size",
        "hardware",
        "material",
        "depth-rule",
        "accessory",
        "provisional",
        "hardware-tier-created",
        "accessory-created",
        "created-row-text",
        "item-deleted",
      ].sort(),
    );
  });

  it("has the plan's fields for each kind that names one", () => {
    expect([...addressModule.CABINET_RULE_FIELDS]).toEqual([
      "anchorMinor",
      "perStepWiderMinor",
      "perStepNarrowerMinor",
      "perExtraDoorLeafMinor",
      "perHeightStepMinor",
    ]);
    expect([...addressModule.HARDWARE_RATE_FIELDS]).toEqual([
      "perHingeMinor",
      "perDrawerMinor",
      "perPushToOpenMinor",
      "perLiftMinor",
    ]);
    expect([...addressModule.MATERIAL_FIELDS]).toEqual(["percentOfCabinets"]);
    expect([...addressModule.ACCESSORY_FIELDS]).toEqual(["perUnitMinor"]);
    expect([...addressModule.CREATED_ROW_TEXT_FIELDS]).toEqual([
      "name",
      "description",
    ]);
  });

  it("has the plan's five item kinds", () => {
    expect([...addressModule.ITEM_KINDS]).toEqual([
      "material",
      "hardware",
      "finish",
      "handle",
      "accessory",
    ]);
  });

  it("lists every field once, so the audit detail's field list has no duplicate or missing word", () => {
    const fields: readonly string[] = addressModule.ADDRESS_FIELDS;

    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toHaveLength(5 + 4 + 1 + 1 + 2);
    expect(auditModule.DRAFT_CHANGE_FIELDS).toBe(addressModule.ADDRESS_FIELDS);
  });

  it("freezes every list, so no lane can append a field at run time", () => {
    for (const list of [
      addressModule.BOOK_FIELD_ADDRESS_KINDS,
      addressModule.CABINET_RULE_FIELDS,
      addressModule.HARDWARE_RATE_FIELDS,
      addressModule.MATERIAL_FIELDS,
      addressModule.ACCESSORY_FIELDS,
      addressModule.CREATED_ROW_TEXT_FIELDS,
      addressModule.ITEM_KINDS,
      addressModule.ADDRESS_FIELDS,
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });
});

describe("the address is identity and nothing else (X0-4), checked by the compiler", () => {
  it("has only the members that name a row, a field or a size", () => {
    expectTypeOf<AddressMemberName>().toEqualTypeOf<
      | "kind"
      | "ruleId"
      | "field"
      | "widthMm"
      | "tierId"
      | "accessoryId"
      | "item"
    >();
  });

  it("names, as `field`, exactly the words the audit detail lists", () => {
    expectTypeOf<FieldOfAnyArm>().toEqualTypeOf<AddressField>();
  });

  it("has a value type for exactly the kinds there are", () => {
    expectTypeOf<
      keyof DraftValueByKind
    >().toEqualTypeOf<BookFieldAddressKind>();
  });

  it("types each change's value by its kind, and offers the optional group id on every arm", () => {
    expectTypeOf<
      Extract<DraftChange, { address: { kind: "provisional" } }>["value"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      Extract<DraftChange, { address: { kind: "item-deleted" } }>["value"]
    >().toEqualTypeOf<true>();
    expectTypeOf<DraftChange["groupId"]>().toEqualTypeOf<string | undefined>();
  });
});

describe("a creation carries no id (F5)", () => {
  it("is the text and rates of the row and nothing that names it: the server mints the id", () => {
    expectTypeOf<keyof HardwareTierCreation>().toEqualTypeOf<
      "name" | "description"
    >();
    expectTypeOf<keyof AccessoryCreation>().toEqualTypeOf<
      "linkedBuildId" | "perUnitMinor" | "name" | "description"
    >();
  });

  it("has Romanian text members only, in the creations and in the text field list", () => {
    const members: string[] = [
      ...addressModule.CREATED_ROW_TEXT_FIELDS,
      ...(["name", "description"] satisfies (keyof HardwareTierCreation)[]),
    ];

    expect(
      members.filter((member) => /ru|rus|lang|locale/i.test(member)),
    ).toEqual([]);
  });
});

describe("availability travels beside the book (A-17)", () => {
  it("has a revision and the disabled refs, and no flag per item", () => {
    expectTypeOf<keyof CatalogueAvailability>().toEqualTypeOf<
      "revision" | "disabled"
    >();
    expectTypeOf<CatalogueAvailability["disabled"]>().toEqualTypeOf<
      readonly ItemRef[]
    >();
  });

  it("names every item kind by the id member the plan gives it", () => {
    expectTypeOf<Extract<ItemRef, { kind: "handle" }>>().toEqualTypeOf<{
      readonly kind: "handle";
      readonly handle: "steel" | "black" | "push";
    }>();
    expectTypeOf<Extract<ItemRef, { kind: "finish" }>>().toEqualTypeOf<{
      readonly kind: "finish";
      readonly finishId: string;
    }>();
  });
});

describe("the domain barrels", () => {
  it("re-export, by identity, every list and reader X0 wrote", () => {
    expect(barrel.BOOK_FIELD_ADDRESS_KINDS).toBe(
      addressModule.BOOK_FIELD_ADDRESS_KINDS,
    );
    expect(barrel.ITEM_KINDS).toBe(addressModule.ITEM_KINDS);
    expect(barrel.ADDRESS_FIELDS).toBe(addressModule.ADDRESS_FIELDS);
    expect(barrel.CABINET_RULE_FIELDS).toBe(addressModule.CABINET_RULE_FIELDS);
    expect(barrel.HARDWARE_RATE_FIELDS).toBe(
      addressModule.HARDWARE_RATE_FIELDS,
    );
    expect(barrel.DASHBOARD_AUDIT_ACTIONS).toBe(
      auditModule.DASHBOARD_AUDIT_ACTIONS,
    );
    expect(barrel.readDashboardAuditEntry).toBe(
      auditModule.readDashboardAuditEntry,
    );
    expect(barrel.PRICE_GROUP_CODES).toBe(auditModule.PRICE_GROUP_CODES);
  });

  it("leave the Lot 3 list as it was: the six actions, so no store accepts a dashboard action until X2 folds it in", () => {
    expect([...barrel.STAFF_AUDIT_ACTIONS]).toHaveLength(6);
    for (const action of barrel.DASHBOARD_AUDIT_ACTIONS) {
      expect(barrel.STAFF_AUDIT_ACTIONS).not.toContain(action);
    }
  });
});
