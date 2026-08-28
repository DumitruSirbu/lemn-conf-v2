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
    // **Every count but `WIDTH_UNCHANGED` rose at ADR 0033 and again at ADR 0035**, and none of it
    // is a new refusal: §9 renders a chip per width the *selected* body's entry declares, and
    // ADR 0035 decision 2 replaced each entry's hand-maintained list with a bound stepped at 50 mm.
    // More chips are rendered, so more chips are tried, so more are refused — by the same rules, in
    // the same places. `WIDTH_UNCHANGED` is the one count that does not depend on how many chips
    // exist: it fires once per body, at the width the body already stands on.
    //
    // Retiring ADR 0030's 400 mm one-door cap (owner, 2026-08-28) then gave every hinged row a 450
    // chip and moved these once more — 48 → 52, 83 → 93 — while **`WIDTH_NOT_SUPPORTED` went the
    // other way**, 41 → 40. That direction is the evidence, not an oddity: the new 450s land in
    // columns whose members can now all be built there, so they are refused for a reason about the
    // *design* (no empty space to fund the move) rather than about the width.
    expect(census(kitchen()).refusals).toEqual({
      NOT_RESIZABLE: 9,
      COLUMN_MEMBER_NOT_RESIZABLE: 52,
      WIDTH_NOT_SUPPORTED: 40,
      WIDTH_UNCHANGED: 13,
      NO_EMPTY_SPACE: 93,
    });
  });

  it("names the forty chips §9 renders that the column cannot take", () => {
    // **`WIDTH_NOT_SUPPORTED` is the interesting count**, and it is 5D's to close: ADR 0031 rule 5
    // intersects a column's members' sets, while `describeSelection` still answers for one body, so
    // the panel offers widths the engine refuses.
    //
    // Itemised rather than counted, following `width-chips.adversarial.test.ts`, whose own comment
    // says a count alone would have read green through the change that halved it (logic review
    // R1.13). A bare `5` goes green whether 5D fixes this or makes it worse by a different five.
    //
    // **Five before ADR 0033, fifteen after it, forty after ADR 0035**, and the widening is the same
    // each time: the *selected* body renders more chips while the column intersection behind it is
    // unchanged. An 800 mm wall run still sits over a sink base bounded at its aperture, so every
    // chip under 600 is rendered and refused — there are simply more of them once the chips step at
    // 50 mm instead of listing five widths. This is 5D's gap getting wider, not a new defect, and it
    // is itemised for the reason the count alone was never trusted (logic review R1.13): a bare
    // number goes green whether 5D closes it or replaces it with a different forty.
    //
    // **`p1@450` is not on this list, and its absence is §11 row 14.** "Dishwasher niche: only
    // 450 / 600" was true of the entry and false of the column while ADR 0030's 400 mm one-door cap
    // put 450 in a hole the `wall-cabinet` above `p1` could not be built in; the owner retired that
    // cap on 2026-08-28, so `A|2.00` genuinely accepts 450 once something funds the move. The two
    // 450s that remain — `p11@450` and `p17@450` — are `A|1.30`, where the sink base's 560 mm
    // aperture bounds the column and no door rule is involved at all.
    expect(census(kitchen()).refusedBy.WIDTH_NOT_SUPPORTED).toEqual([
      "p11@200",
      "p11@250",
      "p11@300",
      "p11@350",
      "p11@400",
      "p11@450",
      "p11@500",
      "p11@550",
      "p12@300",
      "p12@350",
      "p12@400",
      "p12@500",
      "p12@550",
      "p12@650",
      "p12@700",
      "p12@750",
      "p12@800",
      "p14@200",
      "p14@250",
      "p17@200",
      "p17@250",
      "p17@300",
      "p17@350",
      "p17@400",
      "p17@450",
      "p17@500",
      "p17@550",
      "p18@200",
      "p18@250",
      "p18@300",
      "p18@350",
      "p18@400",
      "p18@500",
      "p18@550",
      "p18@650",
      "p18@700",
      "p18@750",
      "p18@800",
      "p20@200",
      "p20@250",
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
    // `p1`, `p12` and `p18` joined on 2026-08-28, when the owner retired ADR 0030's one-door cap:
    // column `A|2.00` holds the 450/600 dishwasher under a `wall-cabinet` that could not be built at
    // 450, so the column could match at no width at all. It can now, which is §11 row 14 restored.
    {
      key: "A|1.30",
      ids: ["p0", "p11", "p17"],
      accepted: ["p1", "p10", "p12", "p16", "p18"],
    },
    {
      key: "A|2.00",
      ids: ["p1", "p12", "p18"],
      accepted: ["p0", "p11", "p17"],
    },
    // Same cause as `A|1.30`: the dishwasher column is adjacent on this side too.
    {
      key: "A|2.60",
      ids: ["p2", "p13", "p19"],
      accepted: ["p1", "p4", "p12", "p14", "p18", "p20"],
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
    // 112 accepted taps across the nine deletable columns: fifteen before ADR 0033, thirty-two after
    // it, ninety-seven after ADR 0035's bounds, and this once the owner retired ADR 0030's one-door
    // cap and column `A|2.00` could match the dishwasher's 450. Each jump has the same cause
    // measured a different way. ADR 0033 removed the *entry* boundary — a wall column used to be
    // bounded by whichever door entry its members happened to be, so a run of two-door cabinets
    // could never reach 400 however much space stood beside it. ADR 0035 removed the *list*: the
    // same columns move to the same places, and now to every 50 mm width in between.
    //
    // The gain was never the count so much as its shape: the moves are whole columns, and each one
    // is next to the space that funds it. **Cabinetry has stopped constraining them** — every
    // refusal left in the census is an appliance, a floor, or the absence of empty space — ADR 0030's
    // swing-arc gap is gone, and with it the last cabinetry-shaped refusal.
    const all = CLEARABLE.flatMap(({ key, ids }) =>
      census(clearBodies(kitchen(), [...ids])).accepted.map(
        (entry) => `${key}:${entry}`,
      ),
    );
    expect(all.sort()).toEqual([
      "A|0.30:p10@200",
      "A|0.30:p10@250",
      "A|0.30:p10@350",
      "A|0.30:p10@400",
      "A|0.30:p10@450",
      "A|0.30:p10@500",
      "A|0.30:p10@550",
      "A|0.30:p10@600",
      "A|0.30:p16@200",
      "A|0.30:p16@250",
      "A|0.30:p16@350",
      "A|0.30:p16@400",
      "A|0.30:p16@450",
      "A|0.30:p16@500",
      "A|0.30:p16@550",
      "A|0.30:p16@600",
      "A|0.75:p0@600",
      "A|0.75:p0@650",
      "A|0.75:p0@700",
      "A|0.75:p0@750",
      "A|0.75:p11@600",
      "A|0.75:p11@650",
      "A|0.75:p11@700",
      "A|0.75:p11@750",
      "A|0.75:p15@200",
      "A|0.75:p15@250",
      "A|0.75:p15@300",
      "A|0.75:p15@350",
      "A|0.75:p15@400",
      "A|0.75:p15@450",
      "A|0.75:p15@500",
      "A|0.75:p15@550",
      "A|0.75:p17@600",
      "A|0.75:p17@650",
      "A|0.75:p17@700",
      "A|0.75:p17@750",
      "A|0.75:p8@200",
      "A|0.75:p8@250",
      "A|0.75:p8@300",
      "A|0.75:p8@350",
      "A|0.75:p8@400",
      "A|0.75:p8@450",
      "A|0.75:p8@500",
      "A|0.75:p8@550",
      "A|1.30:p10@350",
      "A|1.30:p10@400",
      "A|1.30:p10@450",
      "A|1.30:p10@500",
      "A|1.30:p10@550",
      "A|1.30:p10@600",
      "A|1.30:p10@650",
      "A|1.30:p10@700",
      "A|1.30:p10@750",
      "A|1.30:p10@800",
      "A|1.30:p12@450",
      "A|1.30:p16@350",
      "A|1.30:p16@400",
      "A|1.30:p16@450",
      "A|1.30:p16@500",
      "A|1.30:p16@550",
      "A|1.30:p16@600",
      "A|1.30:p16@650",
      "A|1.30:p16@700",
      "A|1.30:p16@750",
      "A|1.30:p16@800",
      "A|1.30:p18@450",
      "A|1.30:p1@450",
      "A|2.00:p0@600",
      "A|2.00:p0@650",
      "A|2.00:p0@700",
      "A|2.00:p0@750",
      "A|2.00:p11@600",
      "A|2.00:p11@650",
      "A|2.00:p11@700",
      "A|2.00:p11@750",
      "A|2.00:p17@600",
      "A|2.00:p17@650",
      "A|2.00:p17@700",
      "A|2.00:p17@750",
      "A|2.60:p12@450",
      "A|2.60:p14@300",
      "A|2.60:p14@350",
      "A|2.60:p14@400",
      "A|2.60:p14@450",
      "A|2.60:p14@500",
      "A|2.60:p14@550",
      "A|2.60:p14@650",
      "A|2.60:p14@700",
      "A|2.60:p14@750",
      "A|2.60:p14@800",
      "A|2.60:p18@450",
      "A|2.60:p1@450",
      "A|2.60:p20@300",
      "A|2.60:p20@350",
      "A|2.60:p20@400",
      "A|2.60:p20@450",
      "A|2.60:p20@500",
      "A|2.60:p20@550",
      "A|2.60:p20@650",
      "A|2.60:p20@700",
      "A|2.60:p20@750",
      "A|2.60:p20@800",
      "A|2.60:p4@300",
      "A|2.60:p4@350",
      "A|2.60:p4@400",
      "A|2.60:p4@450",
      "A|2.60:p4@500",
      "A|2.60:p4@550",
      "A|2.60:p4@650",
      "A|2.60:p4@700",
      "A|2.60:p4@750",
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
