// M10 X0, adversarial QA of the dashboard wire contract against the plan's §8.4 (d) as amended: the members each body
// has, the defaults' names against the stored settings' own, the closed lists' separation, and the staff-kitchens
// additions. The type-level checks run in `pnpm typecheck`.
import type {
  BookFieldAddress,
  BookFieldAddressKind,
  PriceGroupCode,
  DesignSettings,
  ItemRef,
  KitchenDefaultsField,
} from "@lemnaria/configurator-domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BULK_REFUSAL_CODES,
  DASHBOARD_CONFLICTS,
  DEFAULTS_REFUSAL_CODES,
  DRAFT_CHANGE_REFUSAL_CODES,
  KITCHEN_DEFAULTS_MEMBERS,
  PRICE_NOTICE_REFUSALS,
  PUBLISH_TEXT_REFUSAL_CODES,
  TEXT_REFUSAL_CODES,
  type AvailabilityRequestWire,
  type CreateAccessoryRequestWire,
  type CreateHardwareClassRequestWire,
  type DashboardBookPayload,
  type BulkTargetWire,
  type DashboardItemIsDefaultWire,
  type DashboardItemUnavailableWire,
  type DashboardRequestField,
  type DraftRevertRequestWire,
  type DraftRevertTargetWire,
  type KitchenDefaultsSavedWire,
  type DraftChangeInputWire,
  type DraftChangeRequestWire,
  type KitchenDefaultsSaveRequestWire,
  type KitchenDefaultsWire,
  type PriceNoticeRefusedWire,
  type PublishRequestWire,
  type PublishedWire,
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

  it("a publish request is {expectedDraftRevision, expectedActiveSequence, expectedAvailabilityRevision, label, note}: no book, no provisional", () => {
    expectTypeOf<keyof PublishRequestWire>().toEqualTypeOf<
      | "expectedDraftRevision"
      | "expectedActiveSequence"
      | "expectedAvailabilityRevision"
      | "label"
      | "note"
    >();
    expectTypeOf<keyof PublishedWire>().toEqualTypeOf<
      "versionId" | "sequenceNumber" | "availabilityRevision"
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

describe("revert, bulk and the single-change input after the review rulings (M2, M3, m1)", () => {
  it("reverts a change by its address and a bulk group by its minted id, and has no index to go stale", () => {
    expectTypeOf<DraftRevertTargetWire>().toEqualTypeOf<
      | { readonly kind: "change"; readonly address: BookFieldAddress }
      | { readonly kind: "group"; readonly groupId: string }
    >();
    expectTypeOf<keyof DraftRevertRequestWire>().toEqualTypeOf<
      "expectedDraftRevision" | "target"
    >();
    // @ts-expect-error `changeIndex` left the request fields: an index goes stale under a replace
    const stale: DashboardRequestField = "changeIndex";

    expect(stale).toBe("changeIndex");
  });

  it("names a bulk group by the closed code, never by a free id; a selection by rule ids", () => {
    expectTypeOf<Extract<BulkTargetWire, { scope: "group" }>>().toEqualTypeOf<{
      readonly scope: "group";
      readonly groupCode: PriceGroupCode;
    }>();
    const target: BulkTargetWire = {
      scope: "group",
      // @ts-expect-error a group code is one of the four, not any string
      groupCode: "kitchen",
    };
    const asRequestField: DashboardRequestField = "groupCode";

    expect([target, asRequestField]).toHaveLength(2);
  });

  it("carries no group id in a single-change input: only the bulk route mints one", () => {
    type InputKeys = DraftChangeInputWire extends infer Change
      ? Change extends unknown
        ? keyof Change
        : never
      : never;

    expectTypeOf<InputKeys>().toEqualTypeOf<"address" | "value">();
  });
});

describe("the refusals the review moved (m2, m5, M5)", () => {
  it("answers a switch-off or a publish that deletes the default with the item, as `item-is-default`", () => {
    expectTypeOf<DashboardItemIsDefaultWire>().toEqualTypeOf<{
      readonly status: "item-is-default";
      readonly item: ItemRef;
    }>();
    expect(DASHBOARD_CONFLICTS).toContain("item-is-default");
  });

  it("keeps the two notice refusals out of the conflicts: they are a 400 list of their own", () => {
    const conflicts: readonly string[] = DASHBOARD_CONFLICTS;

    expect([...PRICE_NOTICE_REFUSALS]).toEqual([
      "unknown-version",
      "revision-ahead",
    ]);
    expect(Object.isFrozen(PRICE_NOTICE_REFUSALS)).toBe(true);
    for (const refusal of PRICE_NOTICE_REFUSALS) {
      expect(conflicts).not.toContain(refusal);
    }
    expectTypeOf<PriceNoticeRefusedWire["status"]>().toEqualTypeOf<
      "unknown-version" | "revision-ahead"
    >();
  });

  it("no longer refuses a defaults save for an unavailable item as malformed input", () => {
    const codes: readonly string[] = DEFAULTS_REFUSAL_CODES;

    expect(codes).not.toContain("NOT_AVAILABLE");
    expect(DASHBOARD_CONFLICTS).toContain("item-unavailable");
    expect(DASHBOARD_CONFLICTS).toContain("availability-changed-meanwhile");
  });

  it("answers a defaults save with both revisions", () => {
    expectTypeOf<keyof KitchenDefaultsSavedWire>().toEqualTypeOf<
      "revision" | "availabilityRevision"
    >();
  });
});
