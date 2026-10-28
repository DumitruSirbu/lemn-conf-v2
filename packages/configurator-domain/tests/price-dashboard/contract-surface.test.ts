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
  CreatedRowItemRef,
  DeletableItemRef,
  DraftChange,
  DraftValueByKind,
  HardwareTierCreation,
} from "../../src/price-dashboard/book-field-address.js";
import type {
  CatalogueAvailability,
  ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import * as auditModule from "../../src/staff/dashboard-audit-action.js";
import type {
  CatalogueActivationAuditInput,
  DashboardAuditEntry,
  DraftChangeTarget,
  PriceDraftChangedDetail,
  PriceDraftRevertedDetail,
} from "../../src/staff/dashboard-audit-action.js";

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
    expect(barrel.ADDRESS_FIELDS).toBe(addressModule.ADDRESS_FIELDS);
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

  it("fold the dashboard list into the staff list: the six Lot 3 actions, then the nine", () => {
    expect([...barrel.STAFF_AUDIT_ACTIONS]).toHaveLength(15);
    expect(barrel.STAFF_AUDIT_ACTIONS.slice(6)).toEqual([
      ...barrel.DASHBOARD_AUDIT_ACTIONS,
    ]);
  });
});

describe("which rows can carry text or be deleted (m9)", () => {
  it("lets text belong to a hardware class or an accessory, and a deletion to those and a material", () => {
    expectTypeOf<CreatedRowItemRef["kind"]>().toEqualTypeOf<
      "hardware" | "accessory"
    >();
    expectTypeOf<DeletableItemRef["kind"]>().toEqualTypeOf<
      "hardware" | "material" | "accessory"
    >();
    expectTypeOf<
      Extract<BookFieldAddress, { kind: "created-row-text" }>["item"]
    >().toEqualTypeOf<CreatedRowItemRef>();
    expectTypeOf<
      Extract<BookFieldAddress, { kind: "item-deleted" }>["item"]
    >().toEqualTypeOf<DeletableItemRef>();
  });

  it("refuses text on a material, a finish or a handle, and a deletion of a finish or a handle", () => {
    const materialText: BookFieldAddress = {
      kind: "created-row-text",
      // @ts-expect-error a material's text is read-only: only created rows have any
      item: { kind: "material", tierId: "material.painted-mdf" },
      field: "name",
    };
    const finishText: BookFieldAddress = {
      kind: "created-row-text",
      // @ts-expect-error a finish is declared in code
      item: { kind: "finish", finishId: "white" },
      field: "name",
    };
    const handleDeletion: BookFieldAddress = {
      kind: "item-deleted",
      // @ts-expect-error a handle can be disabled, never deleted
      item: { kind: "handle", handle: "steel" },
    };
    const finishDeletion: BookFieldAddress = {
      kind: "item-deleted",
      // @ts-expect-error a finish can be disabled, never deleted
      item: { kind: "finish", finishId: "white" },
    };
    const accessoryDeletion: BookFieldAddress = {
      kind: "item-deleted",
      item: { kind: "accessory", accessoryId: "accessory.linked-rack" },
    };

    expect([
      materialText,
      finishText,
      handleDeletion,
      finishDeletion,
      accessoryDeletion,
    ]).toHaveLength(5);
  });
});

describe("the activation the availability store is handed (M4)", () => {
  it("is the five members of an activation but the revision, which the store stamps", () => {
    expectTypeOf<keyof CatalogueActivationAuditInput["detail"]>().toEqualTypeOf<
      "itemKind" | "itemId" | "active"
    >();
    expectTypeOf<
      Extract<
        DashboardAuditEntry,
        { action: typeof auditModule.CATALOGUE_ACTIVATION_AUDIT_ACTION }
      >["detail"]
    >().toHaveProperty("availabilityRevision");
  });

  it("is not a `DashboardAuditEntry`: the reader's full entry cannot be handed in its place unchecked", () => {
    expectTypeOf<CatalogueActivationAuditInput>().not.toExtend<DashboardAuditEntry>();
  });
});

describe("a draft change input and a revert, by the compiler", () => {
  it("lets a group revert report a count and no item (m7), and a single one report an address", () => {
    expectTypeOf<PriceDraftRevertedDetail["changeKind"]>().toEqualTypeOf<
      BookFieldAddressKind | "bulk-group" | "discard-all"
    >();
    expectTypeOf<
      PriceDraftChangedDetail["changeKind"]
    >().toEqualTypeOf<BookFieldAddressKind>();
    expectTypeOf<DraftChangeTarget["widthMm"]>().toEqualTypeOf<
      number | undefined
    >();
  });
});
