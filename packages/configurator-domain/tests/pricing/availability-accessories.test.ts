// M10 P4a-d: a switched-off accessory is removed from the kitchen, not refused, and `removedAccessoriesSince` names
// what a customer has lost since they last looked (ADR 0062 Amendment 3: "it's just removed from the kitchen with the
// notice"; A-17: switching it back on restores the line).
//
// The shipped kitchen has one sink and a wall cabinet over it, so it earns both built-in accessories.
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import { removedAccessoriesSince } from "../../src/pricing/earned-accessories.js";
import type {
  AccessoryPriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import { findSinkAccessories } from "../../src/queries/sink-accessories.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import {
  accessory,
  availabilityOf,
  BOOK,
  CATALOG,
  priceUnder,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const COVER = accessory("sinkProtectiveCover");
const RACK = accessory("dishDryingRack");

function pricedOrThrow(result: ReturnType<typeof priceUnder>): PricedDesign {
  if (!result.ok) throw new Error(`refused: ${result.failure.code}`);
  return result.priced;
}

function accessoryIdsOf(priced: PricedDesign): readonly string[] {
  return priced.lines
    .filter((line): line is AccessoryPriceLine => line.kind === "accessory")
    .map((line) => line.accessoryId);
}

function entriesOf(design: Design) {
  return projectDesignForDisplay(design, CATALOG).flatMap(
    (group) => group.entries,
  );
}

/** The seeded kitchen with every wall cabinet the rack could hang in taken away: the cover is still earned, the rack
 *  is not. */
function kitchenWithASinkAndNoRackHost(): Design {
  let design = KITCHEN_L_DESIGN;
  for (;;) {
    const [sink] = findSinkAccessories(entriesOf(design), CATALOG);
    const hostId = sink?.rackHostPlacementId;
    if (hostId === undefined) return design;
    design = {
      ...design,
      placements: design.placements.filter(
        (placement) => placement.id !== hostId,
      ),
    };
  }
}

/** The seeded kitchen without its sink base: neither accessory is earned. */
function kitchenWithNoSink(): Design {
  const [sink] = findSinkAccessories(entriesOf(KITCHEN_L_DESIGN), CATALOG);
  if (sink === undefined) throw new Error("the seeded kitchen has no sink");
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.id !== sink.sinkPlacementId,
    ),
  };
}

describe("a switched-off built-in accessory yields no line and no refusal (P4a-d)", () => {
  const baseline = pricedOrThrow(priceUnder(NOTHING_DISABLED));

  it("starts from a kitchen that earns both, so the cases below remove something", () => {
    expect(accessoryIdsOf(baseline)).toEqual([
      "sinkProtectiveCover",
      "dishDryingRack",
    ]);
  });

  it("drops the cover's line and keeps the rack's, and the other lines do not move", () => {
    const priced = pricedOrThrow(priceUnder(availabilityOf([COVER])));
    const coverLine = baseline.lines.find(
      (line) => line.lineId === "accessory:sinkProtectiveCover",
    );

    expect(accessoryIdsOf(priced)).toEqual(["dishDryingRack"]);
    expect(priced.lines).toEqual(
      baseline.lines.filter((line) => line !== coverLine),
    );
    expect(priced.totalMinor).toBe(
      baseline.totalMinor - (coverLine?.amountMinor ?? Number.NaN),
    );
  });

  it("drops both lines when both are switched off, and still prices the kitchen", () => {
    const priced = pricedOrThrow(priceUnder(availabilityOf([COVER, RACK])));

    expect(accessoryIdsOf(priced)).toEqual([]);
    expect(priced.lines).toEqual(
      baseline.lines.filter((line) => line.kind !== "accessory"),
    );
  });

  it("restores both lines exactly when they are switched on again", () => {
    const off = pricedOrThrow(priceUnder(availabilityOf([COVER, RACK])));
    const on = priceUnder(availabilityOf([]));

    expect(off.lines.length).toBeLessThan(baseline.lines.length);
    expect(JSON.stringify(on)).toBe(
      JSON.stringify({ ok: true, priced: baseline }),
    );
  });

  it("is not a refusal for an accessory the kitchen does not earn, switched off or not", () => {
    const result = priceUnder(
      availabilityOf([COVER, RACK]),
      kitchenWithNoSink(),
    );

    expect(result.ok).toBe(true);
  });
});

describe("removedAccessoriesSince names what a customer has lost since they last looked (P4a-d)", () => {
  const removed = (
    seen: readonly ItemRef[],
    current: readonly ItemRef[],
    design: Design = KITCHEN_L_DESIGN,
  ) =>
    removedAccessoriesSince({
      design,
      catalog: CATALOG,
      seenBook: BOOK,
      activeBook: BOOK,
      seen: availabilityOf(seen, "seen-revision"),
      current: availabilityOf(current, "current-revision"),
    });

  it("names an accessory the kitchen earns that is now off and was on", () => {
    expect(removed([], [COVER])).toEqual([COVER]);
  });

  it("names both, in the one order of items", () => {
    expect(removed([], [COVER, RACK])).toEqual([RACK, COVER]);
    expect(removed([], [RACK, COVER])).toEqual([RACK, COVER]);
  });

  it("does not name one the customer already saw removed", () => {
    expect(removed([COVER], [COVER])).toEqual([]);
    expect(removed([COVER], [COVER, RACK])).toEqual([RACK]);
  });

  it("names nothing for one switched back on, or for nothing switched off", () => {
    expect(removed([COVER], [])).toEqual([]);
    expect(removed([], [])).toEqual([]);
  });

  it("does not name an accessory the kitchen does not earn", () => {
    expect(removed([], [COVER, RACK], kitchenWithNoSink())).toEqual([]);
    expect(removed([], [COVER, RACK], kitchenWithASinkAndNoRackHost())).toEqual(
      [COVER],
    );
  });

  it("does not depend on the revisions, only on what each availability lists", () => {
    const sameItems = removedAccessoriesSince({
      design: KITCHEN_L_DESIGN,
      catalog: CATALOG,
      seenBook: BOOK,
      activeBook: BOOK,
      seen: availabilityOf([], "a"),
      current: availabilityOf([COVER], "b"),
    });

    expect(sameItems).toEqual([COVER]);
  });

  it("agrees with the price: what it names is exactly the earned lines the price no longer bills", () => {
    const current = availabilityOf([COVER, RACK]);
    const billedBefore = accessoryIdsOf(
      pricedOrThrow(priceUnder(NOTHING_DISABLED)),
    );
    const billedNow = accessoryIdsOf(pricedOrThrow(priceUnder(current)));

    const lost = billedBefore.filter((id) => !billedNow.includes(id));

    expect(
      removedAccessoriesSince({
        design: KITCHEN_L_DESIGN,
        catalog: CATALOG,
        seenBook: BOOK,
        activeBook: BOOK,
        seen: NOTHING_DISABLED,
        current,
      })
        .map((item) => (item.kind === "accessory" ? item.accessoryId : ""))
        .sort(),
    ).toEqual([...lost].sort());
  });
});
