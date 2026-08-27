// An independent census of what ADR 0031 actually makes reachable in the shipped kitchen.
//
// Wave 5C's first implementation shipped §5.4's donor rule and was measured at **two** accepted
// resizes in the whole kitchen. The number is why the rule was replaced, so the replacement is
// measured the same way and the figure is pinned here rather than left to be re-derived.
//
// It is a census and not a rule: every line below is also asserted as a property somewhere in
// `set-width.test.ts` or `set-width.columns.test.ts`. What this file adds is the *population* —
// a sweep that cannot pass by accepting nothing, and that fails loudly when a catalogue edit
// silently opens or closes a chip.
import { describe, expect, it } from "vitest";

import { resolveBuildableSizes } from "../../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { RejectionCode } from "../../src/commands/rejection.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** Every chip §9 would render on a body, which is the set a customer can actually tap. */
function chipsFor(buildId: string): readonly number[] {
  return resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, buildId);
}

interface Census {
  readonly accepted: readonly string[];
  readonly refusals: Readonly<Partial<Record<RejectionCode, number>>>;
  /** Every refused tap, named, so a code's count can be read back to the chips that produced it. */
  readonly refusedBy: Readonly<
    Partial<Record<RejectionCode, readonly string[]>>
  >;
}

function census(world: KitchenWorld): Census {
  const accepted: string[] = [];
  const refusedBy = new Map<RejectionCode, string[]>();
  for (const placement of world.design.placements) {
    for (const widthMm of chipsFor(placement.body.buildId)) {
      const result = resizeTo(world, placement.id, widthMm);
      if (result.ok) {
        accepted.push(`${placement.id}@${String(widthMm)}`);
        continue;
      }
      const tap = `${placement.id}@${String(widthMm)}`;
      refusedBy.set(result.reason.code, [
        ...(refusedBy.get(result.reason.code) ?? []),
        tap,
      ]);
    }
  }
  return {
    accepted: accepted.sort(),
    refusals: Object.fromEntries(
      [...refusedBy].map(([code, taps]) => [code, taps.length]),
    ),
    refusedBy: Object.fromEntries(
      [...refusedBy].map(([code, taps]) => [code, [...taps].sort()]),
    ),
  };
}

describe("the shipped kitchen at load", () => {
  it("derives no voids at all, so no width chip is reachable", () => {
    // ADR 0031's accepted consequence, stated as the measurement it was accepted on. Width editing
    // is in practice a second step of deleting, and wave 5E's browser pass needs a delete in front
    // of it to demonstrate anything.
    const world = kitchen();
    expect(world.voids).toEqual([]);
    expect(census(world).accepted).toEqual([]);
  });

  it("refuses every chip for one of exactly five reasons", () => {
    // No `RESIZE_OPENS_GAP` and no `COLUMN_MEMBERS_UNALIGNED` here: nothing gets far enough to
    // reach either, because there is no empty space to spend.
    //
    // No `RESIZE_OPENS_GAP` and no `COLUMN_MEMBERS_UNALIGNED` here: nothing gets far enough to
    // reach either, because there is no empty space to spend.
    expect(census(kitchen()).refusals).toEqual({
      NOT_RESIZABLE: 6,
      COLUMN_MEMBER_NOT_RESIZABLE: 8,
      WIDTH_NOT_SUPPORTED: 5,
      WIDTH_UNCHANGED: 13,
      NO_EMPTY_SPACE: 12,
    });
  });

  it("names the five chips §9 renders that the column cannot take", () => {
    // **`WIDTH_NOT_SUPPORTED` is the interesting count**, and it is 5D's to close: ADR 0031 rule 5
    // intersects a column's members' sets, while `describeSelection` still answers for one body, so
    // the panel offers widths the engine refuses.
    //
    // Itemised rather than counted, following `width-chips.adversarial.test.ts`, whose own comment
    // says a count alone would have read green through the change that halved it (logic review
    // R1.13). A bare `5` goes green whether 5D fixes this or makes it worse by a different five.
    //
    // Four are `A|2.00`, where a 450/600 dishwasher, a 400/600/800 shelf and a 600/800 two-door
    // intersect to {600} alone. The fifth is `p4`'s 400, under two `wall-2door` rows that stop at
    // 600.
    expect(census(kitchen()).refusedBy.WIDTH_NOT_SUPPORTED).toEqual([
      "p12@400",
      "p12@800",
      "p18@800",
      "p1@450",
      "p4@400",
    ]);
  });
});

describe("after one column is cleared", () => {
  // The nine columns of the shipped kitchen whose members are all deletable. Three more exist —
  // `A|0.45`, `B|0.61` and `B|0.74` — and each holds a structural corner §13.1 makes
  // non-deletable, so none of them can ever become the empty space ADR 0031 spends.
  const CLEARABLE = [
    { key: "A|0.30", ids: ["p8", "p15"], accepted: ["p10", "p16"] },
    { key: "A|0.75", ids: ["p10", "p16"], accepted: ["p0", "p11", "p17"] },
    { key: "A|1.30", ids: ["p0", "p11", "p17"], accepted: ["p10", "p16"] },
    {
      key: "A|2.00",
      ids: ["p1", "p12", "p18"],
      accepted: ["p0", "p11", "p17"],
    },
    {
      key: "A|2.60",
      ids: ["p2", "p13", "p19"],
      accepted: ["p4", "p14", "p20"],
    },
    { key: "A|3.20", ids: ["p4", "p14", "p20"], accepted: [] },
    { key: "B|1.20", ids: ["p5", "p22"], accepted: [] },
    { key: "B|1.80", ids: ["p6", "p23"], accepted: [] },
    { key: "B|2.45", ids: ["p7", "p24"], accepted: [] },
  ] as const;

  it.each(CLEARABLE)(
    "clearing $key makes exactly the $accepted column resizable",
    ({ ids, accepted }) => {
      const result = census(clearBodies(kitchen(), [...ids]));
      expect(
        [
          ...new Set(result.accepted.map((entry) => entry.split("@")[0])),
        ].sort(),
      ).toEqual([...accepted].sort());
    },
  );

  it("names every accepted chip in the whole kitchen", () => {
    // Fifteen accepted taps across the nine deletable columns — which is **six distinct column
    // moves**, each offered from every member of the column it moves. Compare with the donor rule's
    // two, both sides of one boundary. The gain is not the count so much as its shape: the moves
    // are whole columns, and each one is next to the space that funds it.
    const all = CLEARABLE.flatMap(({ key, ids }) =>
      census(clearBodies(kitchen(), [...ids])).accepted.map(
        (entry) => `${key}:${entry}`,
      ),
    );
    expect(all.sort()).toEqual([
      "A|0.30:p10@200",
      "A|0.30:p10@400",
      "A|0.30:p16@200",
      "A|0.30:p16@400",
      "A|0.75:p0@600",
      "A|0.75:p11@600",
      "A|0.75:p17@600",
      "A|1.30:p10@400",
      "A|1.30:p16@400",
      "A|2.00:p0@600",
      "A|2.00:p11@600",
      "A|2.00:p17@600",
      "A|2.60:p14@800",
      "A|2.60:p20@800",
      "A|2.60:p4@800",
    ]);
  });

  it("keeps RESIZE_OPENS_GAP reachable, on the corner leg", () => {
    // The re-stated refusal, still able to fire. Clearing `A|1.30` lets `A|0.75` narrow to 200,
    // which widens the empty column to 900 mm — with a base-level opening across the stretch of
    // floor the corner leg `p25` is standing in.
    const cleared = clearBodies(kitchen(), ["p0", "p11", "p17"]);
    for (const id of ["p10", "p16"]) {
      const result = resizeTo(cleared, id, 200);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("RESIZE_OPENS_GAP");
    }
  });
});
