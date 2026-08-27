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
    // **Every count but `NOT_RESIZABLE` and `WIDTH_UNCHANGED` rose at ADR 0033**, and none of it is
    // a new refusal: §9 renders a chip per width the *selected* body's entry declares, and a seeded
    // wall body now resolves to one merged entry with five widths where it resolved to a two- or
    // three-width one. More chips are rendered, so more chips are tried, so more are refused — by
    // the same rules, in the same places. The two counts that did not move are the two that do not
    // depend on how many chips exist.
    expect(census(kitchen()).refusals).toEqual({
      NOT_RESIZABLE: 6,
      COLUMN_MEMBER_NOT_RESIZABLE: 20,
      WIDTH_NOT_SUPPORTED: 15,
      WIDTH_UNCHANGED: 13,
      NO_EMPTY_SPACE: 27,
    });
  });

  it("names the fifteen chips §9 renders that the column cannot take", () => {
    // **`WIDTH_NOT_SUPPORTED` is the interesting count**, and it is 5D's to close: ADR 0031 rule 5
    // intersects a column's members' sets, while `describeSelection` still answers for one body, so
    // the panel offers widths the engine refuses.
    //
    // Itemised rather than counted, following `width-chips.adversarial.test.ts`, whose own comment
    // says a count alone would have read green through the change that halved it (logic review
    // R1.13). A bare `5` goes green whether 5D fixes this or makes it worse by a different five.
    //
    // **Five before ADR 0033 and fifteen after, and the widening is the merge**: a seeded wall body
    // now renders five chips instead of two, while the column intersection behind it is unchanged —
    // an 800 mm wall run still sits over a 600/800 sink base, so 200, 300 and 400 are rendered and
    // refused. This is 5D's gap getting wider, not a new defect, and it is itemised for the reason
    // the count alone was never trusted (logic review R1.13): a bare number goes green whether 5D
    // closes it or replaces it with a different fifteen.
    //
    // `p1@450` is the one refusal here that is **not** cabinetry: the dishwasher niche is 450/600
    // and the column around it is not. That is the residue ADR 0033 says is legitimate and permanent
    // — a fact about appliances, explainable in one sentence.
    expect(census(kitchen()).refusedBy.WIDTH_NOT_SUPPORTED).toEqual([
      "p11@200",
      "p11@300",
      "p11@400",
      "p12@400",
      "p12@800",
      "p14@200",
      "p17@200",
      "p17@300",
      "p17@400",
      "p18@200",
      "p18@300",
      "p18@400",
      "p18@800",
      "p1@450",
      "p20@200",
    ]);
  });
});

describe("after one column is cleared", () => {
  // The nine columns of the shipped kitchen whose members are all deletable. Three more exist —
  // `A|0.45`, `B|0.61` and `B|0.74` — and each holds a structural corner §13.1 makes
  // non-deletable, so none of them can ever become the empty space ADR 0031 spends.
  const CLEARABLE = [
    { key: "A|0.30", ids: ["p8", "p15"], accepted: ["p10", "p16"] },
    // ADR 0033 added `p8` and `p15` here: clearing `A|0.75` funds the `A|0.30` column as well, and
    // that column is two wall cabinets whose merged entry now reaches 200, 300 and 400. Under the
    // split pair they were `wall-2door` rows bounded at 600, so the space beside them was unspendable.
    {
      key: "A|0.75",
      ids: ["p10", "p16"],
      accepted: ["p0", "p8", "p11", "p15", "p17"],
    },
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
    // Thirty-two accepted taps across the nine deletable columns, from fifteen before ADR 0033 —
    // and the jump is the merge, measured. A wall column used to be bounded by whichever of the two
    // door entries its members happened to be: `wall-2door` allowed 600 and 800 and nothing else, so
    // a run of two-door cabinets could never reach 400 however much space stood beside it. One
    // entry with `[200, 300, 400, 600, 800]` means the column moves and the door count follows,
    // which is precisely the migration-without-changing-entries the record was written for.
    //
    // The gain was never the count so much as its shape: the moves are whole columns, and each one
    // is next to the space that funds it. What ADR 0033 adds is that **cabinetry has almost stopped
    // constraining them** — every refusal left in the census below is an appliance, a floor, or the
    // absence of empty space.
    const all = CLEARABLE.flatMap(({ key, ids }) =>
      census(clearBodies(kitchen(), [...ids])).accepted.map(
        (entry) => `${key}:${entry}`,
      ),
    );
    expect(all.sort()).toEqual([
      "A|0.30:p10@200",
      "A|0.30:p10@400",
      "A|0.30:p10@600",
      "A|0.30:p16@200",
      "A|0.30:p16@400",
      "A|0.30:p16@600",
      "A|0.75:p0@600",
      "A|0.75:p11@600",
      "A|0.75:p15@200",
      "A|0.75:p15@300",
      "A|0.75:p15@400",
      "A|0.75:p17@600",
      "A|0.75:p8@200",
      "A|0.75:p8@300",
      "A|0.75:p8@400",
      "A|1.30:p10@400",
      "A|1.30:p10@600",
      "A|1.30:p10@800",
      "A|1.30:p16@400",
      "A|1.30:p16@600",
      "A|1.30:p16@800",
      "A|2.00:p0@600",
      "A|2.00:p11@600",
      "A|2.00:p17@600",
      "A|2.60:p14@300",
      "A|2.60:p14@400",
      "A|2.60:p14@800",
      "A|2.60:p20@300",
      "A|2.60:p20@400",
      "A|2.60:p20@800",
      "A|2.60:p4@400",
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
