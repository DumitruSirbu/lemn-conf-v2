// M10 X0, adversarial QA of the dashboard wire contract against the plan's §8.4 (d) as amended: the members each body
// has, the defaults' names against the stored settings' own, the closed lists' separation, and the staff-kitchens
// additions. The type-level checks run in `pnpm typecheck`.
import type {
  BookFieldAddressKind,
  DesignSettings,
  KitchenDefaultsField,
} from "@lemnaria/configurator-domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BULK_REFUSAL_CODES,
  DASHBOARD_CONFLICTS,
  DEFAULTS_REFUSAL_CODES,
  DRAFT_CHANGE_REFUSAL_CODES,
  KITCHEN_DEFAULTS_MEMBERS,
  PUBLISH_TEXT_REFUSAL_CODES,
  TEXT_REFUSAL_CODES,
  type AvailabilityRequestWire,
  type CreateAccessoryRequestWire,
  type CreateHardwareClassRequestWire,
  type DashboardBookPayload,
  type DashboardItemUnavailableWire,
  type DraftChangeInputWire,
  type DraftChangeRequestWire,
  type KitchenDefaultsSaveRequestWire,
  type KitchenDefaultsWire,
  type PriceNoticeRefusedWire,
  type PublishRequestWire,
  type PriceVersionSummaryWire,
  type DashboardConflict,
} from "@/price-dashboard/price-dashboard-wire-contract";
import type {
  StaffSeenConflictWire,
  StaffSeenRefusalCode,
  StaffSeenRequestWire,
} from "@/staff/staff-kitchens-wire-contract";

describe("the bodies have the members the plan (as amended) names", () => {
  it("the editor's book payload is {versionId, book, availability}, with no `active` member", () => {
    expectTypeOf<keyof DashboardBookPayload>().toEqualTypeOf<
      "versionId" | "book" | "availability"
    >();
  });

  it("a publish request is {expectedDraftRevision, expectedActiveSequence, label, note, provisional}: no book", () => {
    expectTypeOf<keyof PublishRequestWire>().toEqualTypeOf<
      | "expectedDraftRevision"
      | "expectedActiveSequence"
      | "label"
      | "note"
      | "provisional"
    >();
  });

  it("a creation request has no id member: the server mints it", () => {
    expectTypeOf<keyof CreateHardwareClassRequestWire>().toEqualTypeOf<
      "expectedDraftRevision" | "value" | "rates"
    >();
    expectTypeOf<keyof CreateAccessoryRequestWire>().toEqualTypeOf<
      "expectedDraftRevision" | "value"
    >();
  });

  it("an ordinary change request cannot be a creation, and can be every other kind", () => {
    type Kind = DraftChangeInputWire["address"]["kind"];

    expectTypeOf<Kind>().toEqualTypeOf<
      Exclude<
        BookFieldAddressKind,
        "hardware-tier-created" | "accessory-created"
      >
    >();
    expectTypeOf<keyof DraftChangeRequestWire>().toEqualTypeOf<
      "expectedDraftRevision" | "change"
    >();
  });

  it("an availability request is the item, the flag and the expected revision", () => {
    expectTypeOf<keyof AvailabilityRequestWire>().toEqualTypeOf<
      "expectedRevision" | "item" | "active"
    >();
  });

  it("a version summary carries a derived change count (X0-5)", () => {
    expectTypeOf<PriceVersionSummaryWire["changeCount"]>().toBeNumber();
  });
});

describe("the new-kitchen defaults use the stored settings' own member names (X0-5)", () => {
  it("has every member DesignSettings has, with the same value type, and topRowHandle besides", () => {
    expectTypeOf<keyof DesignSettings>().toExtend<keyof KitchenDefaultsWire>();
    expectTypeOf<KitchenDefaultsWire["materialTierId"]>().toEqualTypeOf<
      NonNullable<DesignSettings["materialTierId"]>
    >();
    expectTypeOf<KitchenDefaultsWire["hardwareTierId"]>().toEqualTypeOf<
      NonNullable<DesignSettings["hardwareTierId"]>
    >();
    expectTypeOf<KitchenDefaultsWire["cabinetDepthMm"]>().toEqualTypeOf<
      NonNullable<DesignSettings["cabinetDepthMm"]>
    >();
    expectTypeOf<KitchenDefaultsWire["finish"]>().toEqualTypeOf<
      NonNullable<DesignSettings["finish"]>
    >();
    expectTypeOf<keyof KitchenDefaultsWire>().toEqualTypeOf<
      | "materialTierId"
      | "hardwareTierId"
      | "cabinetDepthMm"
      | "finish"
      | "handle"
      | "topRowHandle"
    >();
  });

  it("maps each member to a distinct audit code, and a save request carries both expected revisions", () => {
    const codes: readonly KitchenDefaultsField[] = Object.values(
      KITCHEN_DEFAULTS_MEMBERS,
    );

    expect(new Set(codes).size).toBe(6);
    expectTypeOf<keyof KitchenDefaultsSaveRequestWire>().toEqualTypeOf<
      "expectedRevision" | "expectedAvailabilityRevision" | "defaults"
    >();
  });
});

describe("the closed lists are separate, so a screen can switch on a code without ambiguity", () => {
  it("never reuse a conflict word as a refusal code, nor a refusal code as a conflict word", () => {
    const conflicts: readonly string[] = DASHBOARD_CONFLICTS;
    const codes: readonly string[] = [
      ...DRAFT_CHANGE_REFUSAL_CODES,
      ...BULK_REFUSAL_CODES,
      ...DEFAULTS_REFUSAL_CODES,
      ...PUBLISH_TEXT_REFUSAL_CODES,
    ];

    expect(codes.filter((code) => conflicts.includes(code))).toEqual([]);
    expect(
      conflicts.filter((word) =>
        ["invalid-input", "item-in-use", "version-not-found"].includes(word),
      ),
    ).toEqual([]);
  });

  it("let a draft change be refused for an amount a text states (ADR 0106 Amendment A), and a publish text not", () => {
    expect(DRAFT_CHANGE_REFUSAL_CODES).toContain("TEXT_STATES_AN_AMOUNT");
    expect(TEXT_REFUSAL_CODES).toContain("TEXT_STATES_AN_AMOUNT");
    expect(PUBLISH_TEXT_REFUSAL_CODES).not.toContain("TEXT_STATES_AN_AMOUNT");
  });

  it("answer a defaults save that names an unavailable item with the item, as a conflict word the list holds", () => {
    expectTypeOf<
      DashboardItemUnavailableWire["status"]
    >().toExtend<DashboardConflict>();
    expectTypeOf<PriceNoticeRefusedWire["status"]>().toEqualTypeOf<
      "unknown-version" | "revision-ahead"
    >();
  });
});

describe("the seen mark of the staff kitchens contract (F9)", () => {
  it("sends the displayed revision as text, and is refused with the two codes the plan names", () => {
    expectTypeOf<StaffSeenRequestWire["displayedRevision"]>().toBeString();
    expectTypeOf<StaffSeenRefusalCode>().toEqualTypeOf<
      "MISSING_VALUE" | "NOT_A_REVISION"
    >();
    expectTypeOf<
      StaffSeenConflictWire["status"]
    >().toEqualTypeOf<"displayed-revision-ahead">();
    expect(DASHBOARD_CONFLICTS).toContain("displayed-revision-ahead");
  });
});
