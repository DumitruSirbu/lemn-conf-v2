// An independent census of what ADR 0031 makes reachable in the shipped kitchen: the population, so a sweep cannot pass
// by accepting nothing and a catalogue edit that silently opens or closes a chip fails loudly. Every line is also
// asserted as a property in `set-width.test.ts` or `set-width.columns.test.ts`.
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
  it("derives no voids at all, and accepts fifty-nine taps — every one of them a shrink", () => {
    // A shrink funds itself out of the extent it vacates (ADR 0035 decision 7), so every accepted tap here is a
    // shrink: a growth has to consume space that already exists and there is none. The itemised list stops the count
    // going green on a different fifty-nine.
    const world = kitchen();
    expect(world.voids).toEqual([]);

    const accepted = census(world).accepted;
    expect(deltasOf(world, accepted).every((delta) => delta < 0)).toBe(true);
    // The list holds no `p2`, `p13`, `p19`, `p5` or `p7` tap, and that absence is part of the claim. Decision 7 funds a
    // move, it does not make an immovable column movable. `A|2.60` holds the `fixedWidth` hob base `p2`, so `p13` and
    // `p19` above it stay refused; `p13` is the hood, exempt from the column's width (decision 6) without being
    // resizable itself, because the seeded `hood-600` declares `fixedWidth: true`.
    // `p5` (oven tower) and `p7` (freestanding fridge) stay frozen: their contents are appliances at fixed sizes,
    // which is the owner's reason for exempting only the pantry (ADR 0048).
    expect(accepted).toEqual([
      // `A|1.30`, the 800 mm sink run stepping down: its floor is the sink's 560 mm aperture (ADR 0017), so it stops
      // at 600.
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
      // `A|2.00` holds the 450/600 dishwasher, so its column is discrete: 450 is the only width below 600 all three
      // members accept (§11 row 14).
      "p12@450",
      "p14@300",
      "p14@350",
      "p14@400",
      "p14@450",
      "p14@500",
      "p14@550",
      "p15@200",
      "p15@250",
      // No `p15@300` or `p8@300`: narrowing `A|0.30` to 300 vacates 0.30-0.60, which keys as `A|0.45`, the corner leg
      // `p25`'s column, and writing an empty column there would replace its frozen 900 mm extent, so it is refused
      // (`COLUMN_KEY_COLLISION`). Both come back once `A|0.75` is cleared (`CLEARABLE`).
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
      // ADR 0048: `B|1.80`'s two members. A column moves as one member set, so unfreezing the seeded pantry `p6`
      // unfroze the wall cabinet `p23` over it.
      "p23@400",
      "p23@450",
      "p23@500",
      "p23@550",
      "p4@300",
      "p4@350",
      "p4@400",
      "p4@450",
      "p4@500",
      "p4@550",
      "p6@400",
      "p6@450",
      "p6@500",
      "p6@550",
      "p8@200",
      "p8@250",
      "p8@350",
      "p8@400",
      "p8@450",
      "p8@500",
      "p8@550",
    ]);
  });

  it("refuses every chip for one of exactly six reasons", () => {
    // No `RESIZE_OPENS_GAP`: a shrink that makes its own space cannot widen a frozen extent over a neighbour's body.
    // `COLUMN_MEMBERS_UNALIGNED` is gone (ADR 0035 decision 6 deleted the code). The counts rise with the chips §9
    // renders (one per width the selected body's entry declares, stepped at 50 mm, ADR 0035 decision 2), not with new
    // refusals; `WIDTH_UNCHANGED` fires once per body, so it does not depend on the chip count. The seeded pantry `p6`
    // is resizable (ADR 0048): it offers nine chips instead of one and its column stops freezing `p23`, so those taps
    // are judged on the design rather than the flag.
    expect(census(kitchen()).refusals).toEqual({
      // `p2`, `p5`, `p7` and `p13` x5.
      NOT_RESIZABLE: 8,
      COLUMN_MEMBER_NOT_RESIZABLE: 39,
      WIDTH_NOT_SUPPORTED: 44,
      WIDTH_UNCHANGED: 15,
      NO_EMPTY_SPACE: 48,
      // The two taps whose vacated strip would key onto the corner leg's own column (`p8@300` and `p15@300`): the
      // space is there and the refusal is about where it would land.
      COLUMN_KEY_COLLISION: 2,
    });
  });

  it("names the forty-four chips §9 renders that the column cannot take", () => {
    // `WIDTH_NOT_SUPPORTED` is 5D's to close: ADR 0031 rule 5 intersects a column's members' sets while
    // `describeSelection` answers for one body, so the panel offers widths the engine refuses. Itemised rather than
    // counted, because a bare count goes green whether 5D closes the gap or replaces it with a different forty. An
    // 800 mm wall run still sits over a sink base bounded at its aperture, so every chip under 600 is rendered and
    // refused. `p1@450` is absent by §11 row 14: `A|2.00` accepts 450 once something funds the move. The two 450s that
    // remain, `p11@450` and `p17@450`, are `A|1.30`, where the sink base's 560 mm aperture bounds the column.
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
      // ADR 0048: `p23` is a 600 mm wall cabinet in the pantry's column, so §9 renders its whole hinged set and the
      // four widths below 400 are ones the pantry under it cannot be built at: the column disagreeing about a width.
      "p23@200",
      "p23@250",
      "p23@300",
      "p23@350",
    ]);
  });
});

describe("after one column is cleared", () => {
  // The nine columns of the shipped kitchen whose members are all deletable. The three others (`A|0.45`, `B|0.61`,
  // `B|0.74`) hold a structural corner that §13.1 makes non-deletable.
  //
  // A shrink funds itself (ADR 0035 decision 7), so most of the kitchen is resizable before anything is cleared; each
  // row pins the delta over the load census, which is what a clear buys:
  //
  // - `gained`: taps accepted here and refused at load. All but two are growths in a column beside the cleared key
  //   (ADR 0031 rule 2), and a clear buys every width up to the ceiling because a growth may leave part of the freed
  //   column standing (ADR 0043). The two exceptions are called out on the `A|0.75` row.
  // - `lostToDelete`: taps accepted at load on a body this row deletes; the body is gone.
  // - `lostToGap`: taps accepted at load and refused here on a body still standing. Only `RESIZE_OPENS_GAP` on the
  //   corner leg has any (test below), so it is split from the deletes rather than lumped in with them.
  /** ADR 0048: `B|1.80`'s two members reaching for widths above 600. Both are named because a column moves as one: the
   *  pantry cannot grow without the cabinet above it growing to the same width. */
  const PANTRY_COLUMN_GROWTHS = [
    "p23@650",
    "p23@700",
    "p23@750",
    "p23@800",
    "p6@650",
    "p6@700",
    "p6@750",
    "p6@800",
  ] as const;

  const CLEARABLE = [
    // `A|0.75` grows into the 600 mm this clear frees; the widths above 600 leave part of the freed column standing,
    // which is a legal gap (ADR 0043).
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
    // `A|0.30` (`p8`, `p15`) can only grow into the 300 mm this clear frees, so every width above 500 leaves a
    // remainder, a legal gap (ADR 0043): the eight growths. `A|1.30`'s 800 mm members are at the ceiling. The two
    // non-growths, `p8@300` and `p15@300`, are shrinks decision 7 could not fund at load (their vacated strip keys onto
    // the corner leg's column `A|0.45`); with `A|0.75` cleared there is a real empty column to return the width to.
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
      // The 800 mm column frees the most space, so `A|0.75` reaches the 800 mm ceiling from 300 and loses its two
      // shrinks, because those now widen the same empty column across the corner leg.
      lostToGap: ["p10@200", "p10@250", "p16@200", "p16@250"],
    },
    // The dishwasher column's neighbours are `A|1.30` and `A|2.60`, at their ceiling or frozen by the hob base, so its
    // 600 mm buys no growth.
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
    // Wall B's columns are appliances and full-height units that cannot change width, except `B|1.80`, the seeded
    // pantry and the cabinet above it (ADR 0048): clearing either neighbour buys that column the four growths its bound
    // reaches. `B|1.80` itself gains nothing: the column the clear would fund is the one it deleted.
    {
      key: "B|1.20",
      ids: ["p5", "p22"],
      gained: PANTRY_COLUMN_GROWTHS,
      lostToGap: [],
    },
    { key: "B|1.80", ids: ["p6", "p23"], gained: [], lostToGap: [] },
    {
      key: "B|2.45",
      ids: ["p7", "p24"],
      gained: PANTRY_COLUMN_GROWTHS,
      lostToGap: [],
    },
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

  it("keeps RESIZE_OPENS_GAP reachable, on the corner leg", () => {
    // Clearing `A|1.30` lets `A|0.75` narrow to 200, which widens the empty column to 900 mm, with a base-level
    // opening across the floor the corner leg `p25` stands in.
    const cleared = clearBodies(kitchen(), ["p0", "p11", "p17"]);
    for (const id of ["p10", "p16"]) {
      const result = resizeTo(cleared, id, 200);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("RESIZE_OPENS_GAP");
    }
  });
});
