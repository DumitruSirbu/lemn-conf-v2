import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  PriceNoticeWire,
  PriceStampWire,
  RemovedAccessoryWire,
  RequiredReplacementWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// The price notice's wire: a union of two arms, both carrying `isSent`, with closed keys (see ADR 0178). The type-level
// checks run in `pnpm typecheck`.

type ActiveVersionNotice = Extract<PriceNoticeWire, { kind: "active-version" }>;
type NoActiveVersionNotice = Extract<
  PriceNoticeWire,
  { kind: "no-active-version" }
>;

describe("the price notice is a union of two arms", () => {
  it("is exactly the active-version arm and the no-active-version arm", () => {
    expectTypeOf<PriceNoticeWire["kind"]>().toEqualTypeOf<
      "active-version" | "no-active-version"
    >();
  });

  it("has the active-version arm carry isSent beside the pair, the judgement and the removed accessories", () => {
    expectTypeOf<keyof ActiveVersionNotice>().toEqualTypeOf<
      | "kind"
      | "isSent"
      | "current"
      | "pricesChanged"
      | "replacementsRequired"
      | "removedAccessories"
    >();
    expectTypeOf<ActiveVersionNotice["isSent"]>().toEqualTypeOf<boolean>();
    expectTypeOf<
      ActiveVersionNotice["current"]
    >().toEqualTypeOf<PriceStampWire>();
    expectTypeOf<ActiveVersionNotice["replacementsRequired"]>().toEqualTypeOf<
      readonly RequiredReplacementWire[]
    >();
    expectTypeOf<ActiveVersionNotice["removedAccessories"]>().toEqualTypeOf<
      readonly RemovedAccessoryWire[]
    >();
  });

  it("has the no-active-version arm carry isSent and nothing that needs a book", () => {
    expectTypeOf<keyof NoActiveVersionNotice>().toEqualTypeOf<
      "kind" | "isSent"
    >();
    expectTypeOf<NoActiveVersionNotice["isSent"]>().toEqualTypeOf<boolean>();
  });

  it("lets a reader reach the pair only after it has narrowed to the active-version arm", () => {
    const readCurrent = (
      notice: PriceNoticeWire,
    ): PriceStampWire | undefined =>
      notice.kind === "active-version" ? notice.current : undefined;

    expect(readCurrent({ kind: "no-active-version", isSent: true })).toBe(
      undefined,
    );
    expect(
      readCurrent({
        kind: "active-version",
        isSent: false,
        current: { versionId: "V".repeat(21), availabilityRevision: "3" },
        pricesChanged: false,
        replacementsRequired: [],
        removedAccessories: [],
      }),
    ).toEqual({ versionId: "V".repeat(21), availabilityRevision: "3" });
  });
});

describe("a removed accessory names its id, and its authored name only when it has one", () => {
  it("has the closed keys accessoryId and an optional authoredName", () => {
    expectTypeOf<keyof RemovedAccessoryWire>().toEqualTypeOf<
      "accessoryId" | "authoredName"
    >();
    expectTypeOf<RemovedAccessoryWire["accessoryId"]>().toEqualTypeOf<string>();
    expectTypeOf<RemovedAccessoryWire>().toExtend<{
      readonly authoredName?: string;
    }>();
  });

  it("accepts a built-in with no name and a linked row with one", () => {
    const builtIn: RemovedAccessoryWire = { accessoryId: "dishDryingRack" };
    const linked: RemovedAccessoryWire = {
      accessoryId: "A".repeat(21),
      authoredName: "Linked shelf",
    };

    expect(Object.keys(builtIn)).toEqual(["accessoryId"]);
    expect(Object.keys(linked)).toEqual(["accessoryId", "authoredName"]);
  });
});
