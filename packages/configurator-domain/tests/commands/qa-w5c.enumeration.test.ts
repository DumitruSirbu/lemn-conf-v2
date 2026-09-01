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

/** Every accepted tap, as the delta it asks for: negative shrinks, positive grows. */
function deltasOf(
  world: KitchenWorld,
  taps: readonly string[],
): readonly number[] {
  return taps.map((tap) => {
    const [placementId, widthMm] = tap.split("@");
    const placement = world.design.placements.find(
      (candidate) => candidate.id === placementId,
    );
    if (!placement) throw new Error(`No placement ${String(placementId)}`);
    return Number(widthMm) - placement.body.widthMm;
  });
}

describe("the shipped kitchen at load", () => {
  it("derives no voids at all, and accepts fifty-one taps — every one of them a shrink", () => {
    // **ADR 0035 decision 7 replaces ADR 0031's headline consequence with half of itself.** The
    // measurement the ADR was accepted on was that `recomputeVoids` returns nothing at load, so
    // *nothing at all* was resizable until the customer deleted something first — width editing was
    // in practice a second step of deleting. A shrink now creates the empty column it needs, so the
    // consequence survives only for growth: **0 accepted taps becomes 51, and every one is a shrink.**
    //
    // The first assertion is unchanged and still the reason: the kitchen really does load with no
    // void anywhere. What changed is that a resize no longer needs one.
    //
    // The sign check is the rule rather than the list. A growth has to consume space that already
    // exists and there is none, so a growth accepted here would be the engine spending something it
    // does not have; a shrink funds itself out of the extent it vacates. The itemised list beside it
    // is what stops the count going green on a different fifty-one.
    const world = kitchen();
    expect(world.voids).toEqual([]);

    const accepted = census(world).accepted;
    expect(deltasOf(world, accepted).every((delta) => delta < 0)).toBe(true);
    expect(accepted).toEqual([
      // `A|1.30` — the 800 mm sink run, stepping down. Its floor is the sink's 560 mm aperture
      // (ADR 0017), which is why it stops at 600 rather than reaching 200.
      "p0@600",
      "p0@650",
      "p0@700",
      "p0@750",
      "p10@200",
      "p10@250",
      "p11@600",
      "p11@650",
      "p11@700",
      "p11@750",
      // `A|2.00` holds the 450/600 dishwasher, so its whole column is discrete: 450 is the only
      // width below 600 all three members accept (§11 row 14).
      "p12@450",
      "p14@300",
      "p14@350",
      "p14@400",
      "p14@450",
      "p14@500",
      "p14@550",
      "p15@200",
      "p15@250",
      // No `p15@300` or `p8@300` — and the gap is the sharpest single thing decision 7
      // measures. Narrowing `A|0.30` from 600 to 300 vacates 0.30–0.60, whose centre keys as
      // `A|0.45`: the corner leg `p25`'s own column. Writing an empty column there would replace
      // that column's frozen 900 mm extent, so the shrink is refused (`NO_EMPTY_SPACE`) rather
      // than allowed to corrupt the map. Both taps come back the moment `A|0.75` is cleared and a
      // real empty column exists to return the width to — see `CLEARABLE` below.
      "p15@350",
      "p15@400",
      "p15@450",
      "p15@500",
      "p15@550",
      "p16@200",
      "p16@250",
      "p17@600",
      "p17@650",
      "p17@700",
      "p17@750",
      "p18@450",
      "p1@450",
      "p20@300",
      "p20@350",
      "p20@400",
      "p20@450",
      "p20@500",
      "p20@550",
      "p4@300",
      "p4@350",
      "p4@400",
      "p4@450",
      "p4@500",
      "p4@550",
      "p8@200",
      "p8@250",
      "p8@350",
      "p8@400",
      "p8@450",
      "p8@500",
      "p8@550",
    ]);
  });

  it("still accepts nothing at all in the two columns an appliance freezes", () => {
    // The anti-invariant beside the census: decision 7 funds a move, it does not make an immovable
    // column movable. `A|2.60` holds the `fixedWidth` hob base `p2`, so `p13` and `p19` above it
    // stay refused however much space a shrink could make — and `p13` is the **hood**, which
    // decision 6 exempts from the column's width without making it resizable in its own right,
    // because the seeded `hood-600` instance declares `fixedWidth: true`.
    const accepted = new Set(
      census(kitchen()).accepted.map((tap) => tap.split("@")[0]),
    );
    for (const frozen of ["p2", "p13", "p19", "p5", "p6", "p7"]) {
      expect(accepted.has(frozen)).toBe(false);
    }
  });

  it("refuses every chip for one of exactly six reasons", () => {
    // No `RESIZE_OPENS_GAP` here: nothing gets far enough to reach it, because a shrink that makes
    // its own space cannot widen a *frozen* extent over a neighbour's body — the strip it enters is
    // one its own members just withdrew from. `COLUMN_MEMBERS_UNALIGNED` is not here either, and
    // that is not a reachability claim any more: ADR 0035 decision 6 deleted the code.
    //
    // **`NO_EMPTY_SPACE` fell 93 → 42, and the arithmetic is exact: 93 − 51 = 42.** Every one of the
    // 51 taps the load census now accepts was refused with this code before decision 7, and no other
    // count moved at all. That is the decision stated as a subtraction — a shrink stopped needing a
    // neighbour, and nothing else about the engine changed.
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
      NO_EMPTY_SPACE: 40,
      // The two taps whose vacated strip would key onto the corner leg's own column (`p8@300` and
      // `p15@300`). They were counted as "no free space" until clean-code review R3.5 collapsed the
      // two collision guards into one: the space was there, and the refusal is about where it would
      // land, which is the sharper answer.
      COLUMN_KEY_COLLISION: 2,
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
  //
  // **What each row pins changed with ADR 0035 decision 7, and it had to.** Before decision 7 the
  // load census was empty, so "which bodies does clearing this column make resizable" and "which
  // bodies are resizable" were the same question and `accepted` could be an absolute list. A shrink
  // now funds itself, so most of the kitchen is resizable before anything is cleared, and an
  // absolute list would be 464 rows of which 420 say nothing about the clear.
  //
  // So each row pins the **delta over the load census**, which is what a clear actually buys:
  //
  // - `gained` — taps accepted here and refused at load. All but two are **growths** in a column
  //   immediately left or right of the cleared key, which is ADR 0031 rule 2 unchanged: growth still
  //   consumes an empty column, and clearing one is still the only way to make one. The two
  //   exceptions are shrinks whose vacated strip collides with the corner leg's column key, and they
  //   are called out on the `A|0.75` row. **What ADR 0043 changed is how far a growth reaches**: a
  //   width that would leave part of the freed column standing is no longer refused, so a clear now
  //   buys every width up to the ceiling rather than only the ones that consume it exactly.
  // - `lostToDelete` — taps that were accepted at load on a body this row deletes. Not a behaviour
  //   change; the body is gone.
  // - `lostToGap` — taps accepted at load and refused here on a body that is **still standing**.
  //   Exactly one row has any, and it is `RESIZE_OPENS_GAP` on the corner leg (see the test below).
  //   Its presence is why the losses are split in two rather than counted together: a body that
  //   stops being resizable while it is still there is the interesting case, and lumping it in with
  //   the deletes would have hidden it.
  const CLEARABLE = [
    // **ADR 0043, 2026-09-01: the run to the 800 mm ceiling is new.** `A|0.75` grows into the 600 mm
    // this clear frees, and until the remainder floor went it had to stop at 600 — the widths above
    // that leave part of the freed column standing, which is now a legal gap rather than a refusal.
    {
      key: "A|0.30",
      ids: ["p8", "p15"],
      gained: [
        "p10@350",
        "p10@400",
        "p10@450",
        "p10@500",
        "p10@550",
        "p10@600",
        "p10@650",
        "p10@700",
        "p10@750",
        "p10@800",
        "p16@350",
        "p16@400",
        "p16@450",
        "p16@500",
        "p16@550",
        "p16@600",
        "p16@650",
        "p16@700",
        "p16@750",
        "p16@800",
      ],
      lostToGap: [],
    },
    // **`A|0.75` gains nothing, and that is not a defect.** Its neighbours are `A|0.30` — `p8` and
    // `p15`, already able to shrink and blocked from growing on their other side — and `A|1.30`,
    // whose 800 mm members are at the ceiling and have nowhere to grow to. The 300 mm this clear
    // frees can only be consumed by a growth, and neither neighbour has one to make.
    // **`A|0.75` gains two, and they are not growths — they are shrinks decision 7 could not fund
    // on its own.** `p8@300` and `p15@300` narrow `A|0.30` from 600, and the strip that vacates keys
    // as `A|0.45`, the corner leg's column; with `A|0.75` cleared there is a real empty column to
    // return the width to instead, so no strip has to be created at all. The two exceptions to
    // "every gain is a growth" are therefore the two taps the key-collision guard refuses at load.
    // **The eight growths beside them are ADR 0043's.** `A|0.30` can only grow into the 300 mm this
    // clear frees, so every width above 500 leaves a remainder — refused until 2026-09-01, kept now.
    {
      key: "A|0.75",
      ids: ["p10", "p16"],
      gained: [
        "p15@300",
        "p15@650",
        "p15@700",
        "p15@750",
        "p15@800",
        "p8@300",
        "p8@650",
        "p8@700",
        "p8@750",
        "p8@800",
      ],
      lostToGap: [],
    },
    {
      key: "A|1.30",
      ids: ["p0", "p11", "p17"],
      gained: [
        "p10@350",
        "p10@400",
        "p10@450",
        "p10@500",
        "p10@550",
        "p10@600",
        "p10@650",
        "p10@700",
        "p10@750",
        "p10@800",
        "p16@350",
        "p16@400",
        "p16@450",
        "p16@500",
        "p16@550",
        "p16@600",
        "p16@650",
        "p16@700",
        "p16@750",
        "p16@800",
      ],
      // The 800 mm column frees the most space of any clear, so `A|0.75` reaches the 800 mm ceiling
      // from 300 — and loses its two shrinks, because those now widen the same empty column across
      // the corner leg.
      lostToGap: ["p10@200", "p10@250", "p16@200", "p16@250"],
    },
    // The dishwasher column's neighbours are `A|1.30` and `A|2.60`, both at their ceiling or frozen
    // by the hob base, so its 600 mm buys no growth either.
    { key: "A|2.00", ids: ["p1", "p12", "p18"], gained: [], lostToGap: [] },
    {
      key: "A|2.60",
      ids: ["p2", "p13", "p19"],
      gained: [
        "p14@650",
        "p14@700",
        "p14@750",
        "p14@800",
        "p20@650",
        "p20@700",
        "p20@750",
        "p20@800",
        "p4@650",
        "p4@700",
        "p4@750",
        "p4@800",
      ],
      lostToGap: [],
    },
    // `A|3.20` is the end of the run: clearing it leaves an empty column with an occupied neighbour
    // on one side only, and that neighbour is `A|2.60`, frozen by the `fixedWidth` hob base `p2`.
    { key: "A|3.20", ids: ["p4", "p14", "p20"], gained: [], lostToGap: [] },
    // Wall B is three columns of appliances and full-height units, none of which can change width,
    // so clearing any of them funds nothing at all. Unchanged by both of ADR 0035's rules.
    { key: "B|1.20", ids: ["p5", "p22"], gained: [], lostToGap: [] },
    { key: "B|1.80", ids: ["p6", "p23"], gained: [], lostToGap: [] },
    { key: "B|2.45", ids: ["p7", "p24"], gained: [], lostToGap: [] },
  ] as const;

  const LOAD_ACCEPTED = census(kitchen()).accepted;

  it.each(CLEARABLE)(
    "clearing $key gains exactly $gained over the load census",
    ({ ids, gained, lostToGap }) => {
      const accepted = new Set(
        census(clearBodies(kitchen(), [...ids])).accepted,
      );
      const deleted = new Set<string>(ids);

      expect(
        [...accepted].filter((tap) => !LOAD_ACCEPTED.includes(tap)).sort(),
      ).toEqual([...gained].sort());

      const lost = LOAD_ACCEPTED.filter((tap) => !accepted.has(tap));
      expect(
        lost.filter((tap) => !deleted.has(tap.split("@")[0] ?? "")).sort(),
      ).toEqual([...lostToGap].sort());
    },
  );

  it("accepts 466 taps across the nine deletable columns", () => {
    // The population, as one number over the whole sweep — 112 before ADR 0035 decision 7, 450
    // after it, and 466 since ADR 0043 removed the remainder floor. The itemisation that used to
    // live here has moved into `CLEARABLE`'s `gained` rows and the load census's own list, which
    // between them name every tap; what is left for a total to add is that no *tenth* source of
    // acceptance has appeared.
    //
    // It is exactly `9 × 51 − 51 − 4 + 62`: nine copies of the load census, less the 51 taps whose
    // body each row deletes, less the 4 that `A|1.30` loses to `RESIZE_OPENS_GAP`, plus the 62
    // taps the clears buy — 46 of them before ADR 0043 and 16 growths that leave a gap behind.
    // Every one of those four terms is pinned above rather than folded into this number.
    const all = CLEARABLE.flatMap(
      ({ ids }) => census(clearBodies(kitchen(), [...ids])).accepted,
    );
    expect(all.length).toBe(466);
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
