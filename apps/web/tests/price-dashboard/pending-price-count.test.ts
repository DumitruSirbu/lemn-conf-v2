// The number the header chip, the menu badge, the tab, the publish button and its confirmation show: one for each price the
// person set and one for each class or accessory they made or removed, whatever the draft stores to say it.
import { describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { pendingPriceCountOf } from "@/price-dashboard/cabinet-list-model";
import { countPendingPrices } from "@/price-dashboard/pending-price-count";
import { readPendingDraft } from "@/price-dashboard/publish-model";

import {
  ACTIVE,
  CABINET_NAMES,
  change,
  createAccessoryChange,
  createTierChanges,
  firstNamedBuildId,
  NEW_ACCESSORY,
  NEW_TIER,
} from "./publish-structural-rows.support";

const OTHER_TIER = "hardware.other";
const ANCHOR = change(
  { kind: "cabinet", ruleId: "cabinet.base-cabinet", field: "anchorMinor" },
  400_000,
);
const OTHER_ANCHOR = change(
  { kind: "cabinet", ruleId: "cabinet.wall-cabinet", field: "anchorMinor" },
  300_000,
);
const BULK_OF_THREE: readonly DraftChange[] = ["a", "b", "c"].map(
  (suffix) =>
    ({
      address: {
        kind: "cabinet",
        ruleId: `cabinet.rule-${suffix}`,
        field: "anchorMinor",
      },
      value: 100_000,
      groupId: "group-1",
      bulk: { percent: 5, scope: "all" },
    }) as DraftChange,
);
const DELETES = (tierId: string): DraftChange =>
  change({ kind: "item-deleted", item: { kind: "hardware", tierId } }, true);

describe("the count of prices waiting to be published", () => {
  it("is zero for an empty draft, which is a known zero and not an absent count", () => {
    expect(countPendingPrices([])).toBe(0);
  });

  it("is one for each price the person set, a bulk action's every price included", () => {
    expect(countPendingPrices([ANCHOR, OTHER_ANCHOR])).toBe(2);
    expect(countPendingPrices(BULK_OF_THREE)).toBe(3);
  });

  it("is one for a created class and its rates together, where the draft stores each of them", () => {
    const changes = createTierChanges();

    expect(changes.length).toBeGreaterThan(1);
    expect(countPendingPrices(changes)).toBe(1);
  });

  it("counts a created class beside the prices around it, and two created classes as two", () => {
    const second = createTierChanges().map((stored) =>
      JSON.stringify(stored).includes(NEW_TIER)
        ? (JSON.parse(
            JSON.stringify(stored).replaceAll(NEW_TIER, OTHER_TIER),
          ) as DraftChange)
        : stored,
    );

    expect(
      countPendingPrices([ANCHOR, ...createTierChanges(), OTHER_ANCHOR]),
    ).toBe(3);
    expect(countPendingPrices([...createTierChanges(), ...second])).toBe(2);
  });

  it("is one for a created accessory, and one for a class that is created and then deleted again, which the draft still stores", () => {
    expect(
      countPendingPrices([createAccessoryChange(firstNamedBuildId())]),
    ).toBe(1);
    expect(
      countPendingPrices([...createTierChanges(), DELETES(NEW_TIER)]),
    ).toBe(1);
  });

  it("is one for a row of the book that is deleted, and still one for each price set on it", () => {
    const rate = change(
      {
        kind: "hardware",
        tierId: "hardware.soft-close",
        field: "perHingeMinor",
      },
      2_000,
    );

    expect(countPendingPrices([DELETES("hardware.soft-close")])).toBe(1);
    expect(countPendingPrices([rate, DELETES("hardware.soft-close")])).toBe(2);
  });

  it("does not take a price set on another row for a part of the created one", () => {
    const rateOfOther = change(
      {
        kind: "hardware",
        tierId: "hardware.soft-close",
        field: "perHingeMinor",
      },
      2_000,
    );
    const accessoryPrice = change(
      { kind: "accessory", accessoryId: NEW_ACCESSORY, field: "perUnitMinor" },
      9_000,
    );

    expect(countPendingPrices([...createTierChanges(), rateOfOther])).toBe(2);
    expect(
      countPendingPrices([
        createAccessoryChange(firstNamedBuildId()),
        accessoryPrice,
      ]),
    ).toBe(1);
  });

  it("is the number every screen of the dashboard draws, from the draft and from the publish review alike", () => {
    const changes = [ANCHOR, ...createTierChanges()];
    const reading = readPendingDraft({
      active: ACTIVE,
      changes,
      cabinetNames: CABINET_NAMES,
    });

    expect(pendingPriceCountOf({ draftRevision: "1", changes })).toBe(2);
    expect(reading.kind === "ready" && reading.view.changeCount).toBe(2);
  });
});
