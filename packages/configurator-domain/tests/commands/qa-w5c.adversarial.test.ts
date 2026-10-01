// Adversarial QA on M5 wave 5C, rebuilt on ADR 0031 — a resize moves a whole column, funded by an
// adjacent empty column.
//
// The population is enumerated here independently of `qa-w5c.enumeration.test.ts` rather than
// re-asserted from it: the census below is built from the column map and the adjacency arithmetic,
// and the two-column clears are territory the implementer's census does not enter at all.
//
// Three blocks are **left failing on purpose**. Each names a production location and the case that
// demonstrates it; none of them is weakened to go green.
import { describe, expect, it } from "vitest";

import type {
  BodyMeasurement,
  BodyProbe,
  BodyProbeRequest,
} from "../../src/body-probe.js";
import {
  EXTRACTOR_HOOD_KIND,
  INSERTABLE_BODY_DEFINITIONS,
  resolveBuildableSizes,
} from "../../src/catalog.js";
import { setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { deriveColumnKeyAt } from "../../src/void-engine.js";
import {
  clearBodies,
  insertInto,
  OCCURRED_AT,
  resizeTo,
} from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advance,
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";
import { LEGACY_ENUM_FINISHES } from "../../src/materials.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** The nine columns of the shipped kitchen whose every member is deletable. The other three each
 *  hold a structural corner (§13.1), so none of them can ever become empty space. */
const CLEARABLE: readonly {
  readonly key: string;
  readonly ids: readonly string[];
}[] = [
  { key: "A|0.30", ids: ["p8", "p15"] },
  { key: "A|0.75", ids: ["p10", "p16"] },
  { key: "A|1.30", ids: ["p0", "p11", "p17"] },
  { key: "A|2.00", ids: ["p1", "p12", "p18"] },
  { key: "A|2.60", ids: ["p2", "p13", "p19"] },
  { key: "A|3.20", ids: ["p4", "p14", "p20"] },
  { key: "B|1.20", ids: ["p5", "p22"] },
  { key: "B|1.80", ids: ["p6", "p23"] },
  { key: "B|2.45", ids: ["p7", "p24"] },
];

/** Every width any shipped body lists, so the sweep cannot miss an accepted tap by guessing the
 *  chip set. Wider than §9 renders on purpose. */
const ALL_WIDTHS_MM: readonly number[] = [
  200, 300, 400, 450, 600, 700, 800, 900,
];

function acceptedTaps(world: KitchenWorld): readonly string[] {
  const accepted: string[] = [];
  for (const placement of world.design.placements) {
    for (const widthMm of ALL_WIDTHS_MM) {
      if (resizeTo(world, placement.id, widthMm).ok) {
        accepted.push(`${placement.id}@${String(widthMm)}`);
      }
    }
  }
  return accepted.sort();
}

/** The along-wall span of every body, in millimetres — the only thing a boundary move is about. */
function spansMm(design: Design): readonly string[] {
  return design.placements
    .map(
      (placement) =>
        `${placement.id}:${String(placement.alongMm - placement.body.widthMm / 2)}..${String(placement.alongMm + placement.body.widthMm / 2)}`,
    )
    .sort();
}

function openingKeys(world: KitchenWorld): readonly string[] {
  return world.voids
    .map(
      (opening) =>
        `${opening.col}@${opening.y0.toFixed(2)}+${opening.h.toFixed(2)}`,
    )
    .sort();
}

function placementAt(
  id: string,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm,
    y0Mm,
    body: { buildId, widthMm, heightMm },
  };
}

/** Every tap this sweep's coarse width set accepts on the shipped kitchen **at load**, measured
 *  after ADR 0035 decision 7 made a shrink fund itself. Zero before that decision.
 *
 *  Named once and subtracted below, because after decision 7 a clear no longer *creates* the
 *  resizable population — it adds the growths to it. What a clear buys is the delta, and pinning the
 *  absolute list nine times over would bury eleven interesting rows under 233 uninteresting ones. */
const LOAD_ACCEPTED_TAPS: readonly string[] = [
  // `A|1.30`, the 800 mm sink run, down to the sink aperture's floor.
  "p0@600",
  "p0@700",
  "p10@200",
  "p11@600",
  "p11@700",
  // `A|2.00`, whose 450/600 dishwasher makes the whole column discrete (§11 row 14).
  "p12@450",
  "p14@300",
  "p14@400",
  "p14@450",
  "p15@200",
  // No `p15@300` or `p8@300`: narrowing `A|0.30` from 600 to 300 vacates 0.30–0.60, whose centre
  // keys as `A|0.45` — the corner leg `p25`'s own column. The strip cannot be written there without
  // replacing that column's frozen 900 mm extent, so the shrink refuses. Both come back the moment
  // `A|0.75` is cleared and there is a real empty column to give the width back to.
  "p15@400",
  "p15@450",
  "p16@200",
  "p17@600",
  "p17@700",
  "p18@450",
  "p1@450",
  "p20@300",
  "p20@400",
  "p20@450",
  // ADR 0048: `B|1.80`'s two members. The seeded pantry `p6` stopped being `fixedWidth` when the
  // owner flipped it on 2026-09-01, and a column moves as one, so the wall cabinet `p23` above it
  // came with it.
  "p23@400",
  "p23@450",
  "p4@300",
  "p4@400",
  "p4@450",
  "p6@400",
  "p6@450",
  "p8@200",
  "p8@400",
  "p8@450",
];

// ---------------------------------------------------------------------------
// The population, derived independently.
// ---------------------------------------------------------------------------

describe("Q1 — the legal-resize population, enumerated independently", () => {
  it("has no empty column at load, and every tap it accepts there is a shrink", () => {
    // **ADR 0035 decision 7 rewrote this row's headline.** ADR 0031 required an adjacent empty
    // column in both directions, and the shipped kitchen has none at load, so nothing at all was
    // resizable until the customer deleted something. A shrink now creates the column it needs, so
    // the first assertion holds unchanged — there really is no void — while the second becomes 26
    // accepted taps, every one of them narrowing a column.
    //
    // The sign is asserted rather than the list's shape, because it is the rule: growth still has to
    // consume space that exists, and there is none.
    const world = kitchen();
    expect(world.voids).toEqual([]);

    const accepted = acceptedTaps(world);
    for (const tap of accepted) {
      const [placementId, widthMm] = tap.split("@");
      const placement = world.design.placements.find(
        (candidate) => candidate.id === placementId,
      );
      expect(Number(widthMm)).toBeLessThan(placement?.body.widthMm ?? 0);
    }
    expect(accepted).toEqual(LOAD_ACCEPTED_TAPS);
  });

  // **ADR 0048 killed half of this row, and the half it left is the interesting one.** Wall B used
  // to be dead everywhere: every one of its columns held a corner or a `fixedWidth` full-height
  // unit, so no wall-B clear ever made a wall-B body resizable. `B|1.80` is the seeded pantry, and
  // the owner unfroze it on 2026-09-01, so that column is alive — which is what report item 8 asked
  // for. The other four are still dead, for the reasons they always were.
  it("is dead on wall B apart from the pantry column ADR 0048 unfroze", () => {
    // Derived rather than asserted: for each wall-B column, name the member that stops it.
    const blockers = new Map<string, string>();
    for (const record of kitchen().records.filter(
      (candidate) => candidate.wall === "B",
    )) {
      const definition = KITCHEN_L_BODY_CATALOG.get(record.buildId);
      const blocked =
        definition?.fixedWidth === true ||
        definition?.structuralReason === "corner" ||
        definition?.catalogEquivalentId === undefined;
      if (blocked && !blockers.has(record.col)) {
        blockers.set(record.col, record.id);
      }
    }
    expect([...blockers.keys()].sort()).toEqual([
      "B|0.61",
      "B|0.73", // B|0.74 until ADR 0135 moved the return's centre from 740 to 735
      "B|1.20",
      "B|2.45",
    ]);

    // And so no wall-B clear, alone or paired, ever makes one of the **blocked** columns' bodies
    // resizable. `p6` and `p23` are deliberately not on this list any more: they are the pantry
    // column, and their moving is the decision rather than a leak.
    const wallB = CLEARABLE.filter((column) => column.key.startsWith("B|"));
    for (const cleared of wallB) {
      const taps = acceptedTaps(clearBodies(kitchen(), cleared.ids));
      expect(
        taps.filter(
          (tap) =>
            tap.startsWith("p5") ||
            tap.startsWith("p7") ||
            tap.startsWith("p22") ||
            tap.startsWith("p24"),
        ),
      ).toEqual([]);
    }
  });

  // **Six moves and fifteen taps before ADR 0033; fourteen and thirty-three after it; eighteen and
  // forty-four after ADR 0035's bounds; twenty-four and fifty-nine once the owner retired ADR 0030's
  // one-door cap on 2026-08-28.** Each of those steps widened what a *clear* unlocked, and the
  // history is kept because the shape of the reasoning is still what this row checks.
  //
  // **ADR 0035 decision 7 changes the question rather than the number.** With shrinking self-funded,
  // 26 taps are accepted before anything is cleared and a clear can only add growths on top of them.
  // "Taps accepted after one clear" is therefore no longer a measure of what the clear does — it is
  // 230, of which 206 are the load census repeated. So this row now pins the **delta**, which is
  // what ADR 0031 rule 2 still governs: a growth consumes an adjacent empty column, and clearing one
  // is the only way to make one.
  //
  // Every gained tap below is in a column immediately left or right of the cleared key, and all but
  // two are growths. Five of the nine clears gain nothing, and each has a reason on its row.
  it("gains only moves in the columns adjacent to the clear", () => {
    const gains = CLEARABLE.map((cleared) => ({
      key: cleared.key,
      gained: acceptedTaps(clearBodies(kitchen(), cleared.ids))
        .filter((tap) => !LOAD_ACCEPTED_TAPS.includes(tap))
        .sort(),
    }));

    expect(gains).toEqual([
      // `A|0.75` grows into the 600 mm `A|0.30` frees, and — since **ADR 0043**, 2026-09-01 — all
      // the way to the 800 mm ceiling rather than stopping at 600. Growing from 300 to 700 leaves
      // 200 mm of the freed column standing, which ADR 0031's remainder floor used to refuse and
      // which is now a legal gap of its own.
      {
        key: "A|0.30",
        gained: [
          "p10@400",
          "p10@450",
          "p10@600",
          "p10@700",
          "p10@800",
          "p16@400",
          "p16@450",
          "p16@600",
          "p16@700",
          "p16@800",
        ],
      },
      // `p8@300` and `p15@300` narrow `A|0.30` from 600, and at load the strip they vacate collides
      // with the corner leg's `A|0.45` key; with `A|0.75` cleared there is a real empty column to
      // return the width to and no strip is created at all. **The four growths beside them are
      // ADR 0043's**: `A|0.30` can only grow into `A|0.75`'s 300 mm, so 700 and 800 each leave a
      // remainder the floor used to refuse.
      {
        key: "A|0.75",
        gained: ["p15@300", "p15@700", "p15@800", "p8@300", "p8@700", "p8@800"],
      },
      // The 800 mm clear is the largest, so `A|0.75` reaches the ceiling from 300 — it already did
      // before ADR 0043, because 800 consumes the freed 800 exactly.
      {
        key: "A|1.30",
        gained: [
          "p10@400",
          "p10@450",
          "p10@600",
          "p10@700",
          "p10@800",
          "p16@400",
          "p16@450",
          "p16@600",
          "p16@700",
          "p16@800",
        ],
      },
      // Its neighbours are `A|1.30` at the ceiling and `A|2.60`, frozen by the hob base.
      { key: "A|2.00", gained: [] },
      // `A|3.20` grows into the hob column's 600 mm. The **hood** `p13` is deleted along with it and
      // gains nothing on its own account: the seeded `hood-600` is `fixedWidth`, so decision 6's
      // exemption from the column's width never makes it resizable in its own right.
      {
        key: "A|2.60",
        gained: [
          "p14@700",
          "p14@800",
          "p20@700",
          "p20@800",
          "p4@700",
          "p4@800",
        ],
      },
      // The end of the run: one occupied neighbour, and it is the frozen hob column.
      { key: "A|3.20", gained: [] },
      // Wall B is corners, appliances and full-height units; nothing on it can change width, and
      // nothing on wall A abuts a wall-B column.
      // **ADR 0048: wall B funds a growth now.** `B|1.80` is the pantry column, and clearing either
      // of its neighbours gives it the empty column ADR 0031 rule 2 requires — so `p6` and `p23`
      // reach 700 and 800. Clearing `B|1.80` itself still gains nothing: the column that would
      // grow is the column the clear just emptied. This is the §5.4 consequence the owner accepted.
      { key: "B|1.20", gained: ["p23@700", "p23@800", "p6@700", "p6@800"] },
      { key: "B|1.80", gained: [] },
      { key: "B|2.45", gained: ["p23@700", "p23@800", "p6@700", "p6@800"] },
    ]);
  });

  it("loses two load taps to RESIZE_OPENS_GAP, and none to anything else", () => {
    // The anti-invariant beside the gains: a clear must not take away a tap on a body that is still
    // standing, **except** where widening the freed column would put an opening over one. Exactly
    // one clear does that, and it is the corner leg — clearing `A|1.30` lets `A|0.75` widen the
    // empty column to 900 mm across the floor `p25` occupies, so `p10@200` and `p16@200` stop being
    // accepted while `p10` and `p16` are still there.
    const survivors = CLEARABLE.map((cleared) => {
      const accepted = new Set(
        acceptedTaps(clearBodies(kitchen(), cleared.ids)),
      );
      const deleted = new Set<string>(cleared.ids);
      return {
        key: cleared.key,
        lost: LOAD_ACCEPTED_TAPS.filter(
          (tap) => !accepted.has(tap) && !deleted.has(tap.split("@")[0] ?? ""),
        ),
      };
    });

    expect(survivors.filter((row) => row.lost.length > 0)).toEqual([
      { key: "A|1.30", lost: ["p10@200", "p16@200"] },
    ]);
  });

  it("accepts 278 taps across the nine clears", () => {
    // The total, so that a tenth source of acceptance cannot appear unnamed: `9 × 30 − 30 − 2 + 40`
    // — nine copies of the load census, less the 30 taps whose body each clear deletes, less the two
    // lost to the corner leg, plus the 40 taps gained. **It was 230 with 24 gained until ADR 0043**
    // removed the remainder floor, then 238 with 32; **ADR 0048 took it to 278** by adding four
    // shrinks to the load census (`p6` and `p23`, twice each) and eight growths to the gains.
    // Every one of those taps is on a row above.
    const total = CLEARABLE.flatMap((cleared) =>
      acceptedTaps(clearBodies(kitchen(), cleared.ids)),
    ).length;
    expect(total).toBe(278);
  });

  it("opens no new column move when a second column is cleared", () => {
    // Untested territory: 36 pairs. Every accepted tap is still one of the single-clear moves, so
    // clearing more space widens the population of *situations* and never the population of moves.
    // That claim is what this row protects, and neither ADR 0033 nor ADR 0035 touched it — the list
    // below grew from four to eleven, then to fourteen, with ADR 0043 to twenty, and with ADR 0048
    // to twenty-four, because the
    // moves themselves grew, not because a pair unlocked anything a single clear could not. The two
    // ADR 0043 adds here, `A|0.30@700` and `A|0.30@800`, are both in the single-clear gains above.
    const pairs: string[] = [];
    for (let left = 0; left < CLEARABLE.length; left += 1) {
      for (let right = left + 1; right < CLEARABLE.length; right += 1) {
        const first = CLEARABLE[left];
        const second = CLEARABLE[right];
        if (!first || !second) continue;
        const world = clearBodies(kitchen(), [...first.ids, ...second.ids]);
        for (const tap of acceptedTaps(world)) {
          const [id, widthMm] = tap.split("@");
          const column = kitchen().records.find(
            (record) => record.id === id,
          )?.col;
          pairs.push(`${column ?? ""}@${widthMm ?? ""}`);
        }
      }
    }
    expect([...new Set(pairs)].sort()).toEqual([
      "A|0.30@200",
      "A|0.30@300",
      "A|0.30@400",
      "A|0.30@450",
      "A|0.30@700",
      "A|0.30@800",
      "A|0.75@200",
      "A|0.75@400",
      "A|0.75@450",
      "A|0.75@600",
      "A|0.75@700",
      "A|0.75@800",
      "A|1.30@600",
      "A|1.30@700",
      "A|2.00@450",
      "A|3.20@300",
      "A|3.20@400",
      "A|3.20@450",
      "A|3.20@700",
      "A|3.20@800",
      // ADR 0048: the pantry column. Its four widths are exactly the ones a *single* clear already
      // reaches — `@400` and `@450` at load, `@700` and `@800` from either neighbour — so the claim
      // this row protects is unchanged: a pair unlocks no move a single clear could not.
      "B|1.80@400",
      "B|1.80@450",
      "B|1.80@700",
      "B|1.80@800",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Conservation.
// ---------------------------------------------------------------------------

describe("Q2 — conservation and the inverse", () => {
  const INVERSES = [
    { clear: ["p8", "p15"], id: "p10", to: 400, back: 300 },
    { clear: ["p8", "p15"], id: "p10", to: 200, back: 300 },
    { clear: ["p10", "p16"], id: "p0", to: 600, back: 800 },
    { clear: ["p0", "p11", "p17"], id: "p10", to: 400, back: 300 },
    { clear: ["p1", "p12", "p18"], id: "p0", to: 600, back: 800 },
    { clear: ["p2", "p13", "p19"], id: "p4", to: 800, back: 600 },
  ] as const;

  it.each(INVERSES)(
    "$id $to then $back restores every span and every column extent",
    ({ clear, id, to, back }) => {
      const base = clearBodies(kitchen(), [...clear]);
      const spansBefore = spansMm(base.design);
      const columnsBefore = [...base.columns.values()]
        .map((column) => `${column.key}:${column.w.toFixed(4)}`)
        .sort();

      const grown = resizeTo(base, id, to);
      expect(grown.ok).toBe(true);
      if (!grown.ok) return;
      const middle = advanceWithColumns(
        base,
        grown.design,
        grown.effect.columns,
      );

      const shrunk = resizeTo(middle, id, back);
      expect(shrunk.ok).toBe(true);
      if (!shrunk.ok) return;
      const end = advanceWithColumns(
        middle,
        shrunk.design,
        shrunk.effect.columns,
      );

      expect(spansMm(end.design)).toEqual(spansBefore);
      expect(
        [...end.columns.values()]
          .map((column) => `${column.key}:${column.w.toFixed(4)}`)
          .sort(),
      ).toEqual(columnsBefore);
    },
  );

  it("conserves the run total on every accepted tap, to the millimetre", () => {
    // **The un-cleared kitchen joins the sweep with ADR 0035 decision 7**, and it is not a formality:
    // a shrink now writes a column into the frozen map that was not there before, and the first
    // version of that code silently *replaced* the corner leg's `A|0.45` column when narrowing
    // `A|0.30` — 900 mm of frozen extent traded for 300. This sum is what caught it, and it caught it
    // only because the sweep reaches the shrink. Left as a sweep over both worlds for that reason.
    const worlds = [
      kitchen(),
      ...CLEARABLE.map((cleared) => clearBodies(kitchen(), cleared.ids)),
    ];
    for (const base of worlds) {
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          const after = advanceWithColumns(
            base,
            result.design,
            result.effect.columns,
          );
          for (const wall of ["A", "B"] as const) {
            const total = (world: KitchenWorld): number =>
              [...world.columns.values()]
                .filter((column) => column.wall === wall)
                .reduce((sum, column) => sum + Math.round(column.w * 1000), 0);
            expect(total(after)).toBe(total(base));
          }
        }
      }
    }
  });

  it("allows an empty column to be consumed exactly to zero and removes its key", () => {
    // A 400 mm empty column beside a 600 mm column that can reach 1000 is not in the shipped
    // catalogue, so the exact-consumption case is built: 'fit' members on the standard set, with
    // the empty column at exactly the 200 mm delta.
    const world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 700, 0, "base-panbank", 600, 860),
        placementAt("a-wall", 700, 1500, "open-shelf", 600, 700),
        placementAt("b-base", 1100, 0, "base-panbank", 200, 860),
        placementAt("b-wall", 1100, 1500, "open-shelf", 200, 700),
      ]),
      ["b-base", "b-wall"],
    );
    expect(world.columns.get("A|1.10")?.w).toBeCloseTo(0.2, 6);

    const result = resizeTo(world, "a-base", 800);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(0);
    expect(result.effect.columns.has("A|1.10")).toBe(false);
    expect(spansMm(result.design)).toEqual([
      "a-base:400..1200",
      "a-wall:400..1200",
    ]);
  });

  it("accepts a remainder between zero and MIN_W (ADR 0043)", () => {
    const world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 700, 0, "base-panbank", 600, 860),
        placementAt("a-wall", 700, 1500, "open-shelf", 600, 700),
        placementAt("b-base", 1150, 0, "base-panbank", 300, 860),
        placementAt("b-wall", 1150, 1500, "open-shelf", 300, 700),
      ]),
      ["b-base", "b-wall"],
    );

    // Asserted the refusal until 2026-09-01. A 600 mm column growing to 800 into a 300 mm empty one
    // leaves 100 mm, which the owner has decided is a state a design may hold: *"Empty space can be
    // even 100 mm or 50 mm, if somebody want to keep it."* The conservation this section is about is
    // unchanged — the 100 mm is still there, in a column of its own.
    const result = resizeTo(world, "a-base", 800);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(100);
    expect(spansMm(result.design)).toEqual([
      "a-base:400..1200",
      "a-wall:400..1200",
    ]);
  });
});

// ---------------------------------------------------------------------------
// FINDING Q1.1 — a resize destroys an opening a delete freed, in the resized column.
// ---------------------------------------------------------------------------

describe("Q3 — ADR 0011 Gap D through the resized column", () => {
  it("FINDING Q1.1: keeps the opening a delete freed in the column being resized", () => {
    // The defect, as it was when this test was written: `setWidth` handed the resized column to
    // `rederiveTouchedColumns` (`void-engine.ts:460`) and nothing else, and that function re-derives
    // a key **from the members that are left**. Every region belonging to a member deleted earlier
    // in the session went with it, and the opening the customer had just freed disappeared — ADR
    // 0011 Gap D verbatim, in the one column the ADR's own protection did not cover. The *empty*
    // column was protected and the resized one was not.
    //
    // Fixed by `moveFrozenColumns` (`set-width.ts:751`), which now carries **both** columns'
    // frozen extents. `rederiveTouchedColumns` is unchanged: its member-derived contract is what
    // backlog 2's re-split needs.
    //
    // Three deletes and one tap on the shipped kitchen. Clear `A|0.30` for the empty space, delete
    // `p10` — the wall cabinet at `A|0.75` — and its 700 mm slot is derived. Then narrow the top
    // cabinet `p16` still standing above it, and the slot is gone: no void, no way to put a wall
    // cabinet back, and nothing the customer did says it should have vanished.
    const world = clearBodies(kitchen(), ["p8", "p15", "p10"]);
    expect(openingKeys(world)).toContain("A|0.75@1.50+0.70");

    const result = resizeTo(world, "p16", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );

    // The column moved from `A|0.75` to `A|0.70`, so the opening should move with it — not vanish.
    expect(openingKeys(after)).toContain("A|0.70@1.50+0.70");
  });

  it("FINDING Q1.1 (second shape): the sink's freed floor space survives narrowing the wall run", () => {
    // The same defect one level down, and the more expensive one: the base slot is the only place
    // a base cabinet can go back.
    const world = clearBodies(kitchen(), ["p0", "p1", "p12", "p18"]);
    expect(openingKeys(world)).toContain("A|1.30@0.00+0.86");

    const result = resizeTo(world, "p11", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );

    expect(openingKeys(after)).toContain("A|1.20@0.00+0.86");
  });
});

// ---------------------------------------------------------------------------
// FINDING Q1.2 — the funding side is chosen before the gap test, and never reconsidered.
// ---------------------------------------------------------------------------

describe("Q4 — choosing which empty column funds the move", () => {
  it("refuses on the right rather than falling back to the left, when only the left works", () => {
    // Baseline: with only the **left** column empty, narrowing `A|0.75` to 200 is legal and
    // accepted. It is one of the fifteen taps above.
    const leftOnly = clearBodies(kitchen(), ["p8", "p15"]);
    expect(resizeTo(leftOnly, "p10", 200).ok).toBe(true);

    // With only the **right** column empty it is refused, correctly: widening `A|1.30` to 900 mm
    // puts a base opening over the corner leg `p25`.
    const rightOnly = clearBodies(kitchen(), ["p0", "p11", "p17"]);
    const refusedRight = resizeTo(rightOnly, "p10", 200);
    expect(refusedRight.ok).toBe(false);
    if (!refusedRight.ok) {
      expect(refusedRight.reason.code).toBe("RESIZE_OPENS_GAP");
    }
  });

  it("FINDING Q1.2: accepts the move when the left column can fund it and the right cannot", () => {
    // The defect, as it was when this test was written: the scan picked the first side that could
    // fund the move on geometry and the `MIN_W` floor alone, and the phantom check ran once,
    // afterwards, on the side already chosen. There was no fallback, so a side that would have
    // succeeded was never tried.
    //
    // Fixed by `fundColumnResize` (`set-width.ts:453`), which carries each side through the rebuild
    // and treats `opensAnOpeningOverABody` (`set-width.ts:875`) as one of the ways a side answers
    // no — `evaluateEmptySpace` (`set-width.ts:509`) still answers everything decidable from
    // geometry alone.
    //
    // Both sides empty. The right (`A|1.30`) is chosen because `EMPTY_SPACE_ORDER` tries right
    // first, widening to 900 mm over the corner leg; the left (`A|0.30`) would widen to 700 mm and
    // stand over nothing at all — the very move accepted in the baseline above.
    const bothEmpty = clearBodies(kitchen(), ["p8", "p15", "p0", "p11", "p17"]);
    // Nothing is wrong with the state going in: the five openings the two clears derived all stand
    // over empty space, so the refusal is created by the resize's own choice of side and by
    // nothing else.
    expect(openingKeys(bothEmpty)).toEqual([
      "A|0.30@1.50+0.70",
      "A|0.30@2.20+0.40",
      "A|1.30@0.00+0.86",
      "A|1.30@1.50+0.70",
      "A|1.30@2.20+0.40",
    ]);

    const result = resizeTo(bothEmpty, "p10", 200);

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FINDING Q1.3 — ADR 0031 rule 5 and the intersection.
// ---------------------------------------------------------------------------

describe("Q5 — a column's legal widths are the intersection of its members' sets", () => {
  it("keeps a two-door column off every width below 600", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    for (const widthMm of [200, 300, 400, 450]) {
      const result = resizeTo(world, "p0", widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
    expect(resizeTo(world, "p0", 600).ok).toBe(true);
  });

  it("resolves each member's set through its declared catalogue equivalent", () => {
    // `A|2.00` holds a seeded dishwasher, an open shelf and a top hinged cabinet. None of the three
    // declares a set of its own (ADR 0011 Gap A); the intersection is what it is only because each
    // resolves through `catalogEquivalentId` (ADR 0022) to `base-dishwasher` {450, 600}, `open-shelf`
    // (cabinetry, 300–800) and `wall-cabinet` (cabinetry, 200–800).
    //
    // **The intersection is {450, 600}, and it used to be {600} alone.** The dishwasher is discrete,
    // so it bounds the column to its own two widths; before the owner retired ADR 0030's one-door cap
    // on 2026-08-28 the hinged cabinet above could not be built at 450, and the column could match at
    // 600 only. That gap is §11 row 14, and this is the test that would catch it reopening.
    const world = clearBodies(kitchen(), ["p2", "p13", "p19"]);
    for (const widthMm of [400, 800]) {
      const result = resizeTo(world, "p1", widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
    expect(resizeTo(world, "p1", 450).ok).toBe(true);
    const unchanged = resizeTo(world, "p1", 600);
    expect(unchanged.ok).toBe(false);
    if (!unchanged.ok) expect(unchanged.reason.code).toBe("WIDTH_UNCHANGED");
  });

  it("has no empty intersection left to refuse: the hood was its only half", () => {
    // **This row used to reach `WIDTH_NOT_SUPPORTED` on every width, and it cannot any more.** The
    // pair it was built on was `base-bottle-cargo` {200, 300} under a `hood` 600–800 — the only
    // disjoint pair the catalogue still had after ADR 0033 merged the door-count rows into one
    // 200–800 bound. ADR 0035 decision 6 takes the hood out of the column's width membership, so
    // that pair no longer disagrees about anything: the column is the cargo's {200, 300}, and the
    // hood keeps its own width above it.
    //
    // Asserted by sweep rather than by re-stating the rule, because "the branch is unreachable" is
    // the kind of claim that quietly stops being true. Every base row under every wall row, which is
    // every column a design can physically hold at two levels: none of them intersects to nothing.
    const bands = [...INSERTABLE_BODY_DEFINITIONS];
    const baseRows = bands.filter(([, entry]) => entry.band === "base");
    const wallRows = bands.filter(([, entry]) => entry.band === "wall");
    const disjoint: string[] = [];
    for (const [baseId, baseEntry] of baseRows) {
      for (const [wallId, wallEntry] of wallRows) {
        if (wallEntry.kind === EXTRACTOR_HOOD_KIND) continue;
        const shared = resolveBuildableSizes(
          KITCHEN_L_BODY_CATALOG,
          baseId,
        ).filter((widthMm) =>
          resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, wallId).includes(
            widthMm,
          ),
        );
        if (shared.length === 0) disjoint.push(`${baseId}+${wallId}`);
        expect(baseEntry.band).toBe("base");
      }
    }
    expect(disjoint).toEqual([]);
  });

  it("freezes a column whose hood is wider than anything its members are built at", () => {
    // **Re-measured 2026-08-29.** This asserted the 300 mm bottle cargo under a 600 mm hood shrinking
    // to 200, on the reading that a hood constrains nothing. ADR 0035 decision 6's amendment says a
    // hood **floors** its column, and 200 is 400 mm under this hood — the extreme of the overhang the
    // owner's floor exists to make unreachable.
    //
    // The consequence is worth stating rather than discovering: `base-bottle-cargo` is built at 200
    // and 300 only (ADR 0026), both below the hood's 600, so the floor leaves this column **no legal
    // width at all** and it is frozen in both directions. That is a coherent answer to an incoherent
    // fixture — a 600 mm hood over a 300 mm bottle cargo is not a kitchen anyone builds — and it is
    // reachable only by seeding it, never by resizing into it, precisely because of this floor.
    const world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 700, 0, "base-bottle-cargo", 300, 860),
        placementAt("a-wall", 700, 1500, "hood", 600, 710),
        placementAt("b-base", 1600, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1600, 1500, "open-shelf", 600, 700),
      ]),
      ["b-base", "b-wall"],
    );

    const refused = resizeTo(world, "a-base", 200);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason.code).toBe("COLUMN_HOOD_FLOOR");
  });

  it("FINDING Q1.3: does not let a 'fit' member narrow the intersection", () => {
    // ADR 0031 rule 5, verbatim: "`widthFlex: 'fit'` members accept any width above their floor
    // and so do not narrow the intersection."
    //
    // `intersectColumnWidths` (`set-width.ts:353`) intersects `resolveBuildableSizes`, which reads
    // `sizesMm` and never looks at `widthFlex`. A `'fit'` base carcass therefore contributes
    // {400, 600, 800} and takes 300 away from the one-door cabinet above it — a width §9 renders
    // as a chip on that cabinet, and a width the base member would build perfectly well.
    //
    // The column here is a `'fit'` pan bank under a 400 mm one-door wall cabinet, flush at 400.
    const world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 600, 0, "base-panbank", 400, 860),
        placementAt("a-wall", 600, 1500, "wall-cabinet", 400, 700),
        placementAt("b-base", 1100, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1100, 1500, "base-panbank", 600, 700),
      ]),
      ["b-base", "b-wall"],
    );

    const result = resizeTo(world, "a-wall", 300);

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mixed-width columns: reachability, breadth, and what a resize now does with one.
// ---------------------------------------------------------------------------

describe("Q6 — a mixed-width column", () => {
  it("is reachable with one ordinary insert, and is squared up rather than locked out", () => {
    // ADR 0026's own motivating body. Clear a 600 mm column's base slot, put the bottle cargo the
    // catalogue was extended for into it, and the column holds a 300 mm body under a 600 mm one.
    //
    // **This row asserted the opposite until ADR 0035 decision 6.** Every width refused with
    // `COLUMN_MEMBERS_UNALIGNED`, and the ADR that introduced the refusal called the state a
    // permanent lockout — "ADR 0026's whole 600+600+200 run is a run that can never be resized
    // again", in the row below. The owner overruled it on 2026-08-28: *"let's make them editable,
    // I didn't get why we need to refuse."* So the sweep now asserts the square-up, and that the
    // widths it accepts are the ones the **column** agrees on rather than the ones either member
    // offers alone.
    let world = clearBodies(
      syntheticWorld([
        placementAt("a-base", 1000, 0, "base-panbank", 600, 860),
        placementAt("a-wall", 1000, 1500, "wall-cabinet", 600, 700),
        placementAt("b-base", 1600, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1600, 1500, "wall-cabinet", 600, 700),
      ]),
      ["a-base"],
    );
    const slot = world.voids.find(
      (opening) => opening.col === "A|1.00" && opening.y0 < 0.1,
    );
    expect(slot).toBeDefined();
    if (!slot) return;

    const inserted = insertInto(
      world,
      { kind: "void", id: slot.id },
      "base-bottle-cargo",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    world = advance(world, inserted.design);

    const withSpace = clearBodies(world, ["b-base", "b-wall"]);
    const columnKey = withSpace.records.find(
      (record) => record.id === "a-wall",
    )?.col;
    const memberIds = withSpace.records
      .filter((record) => record.col === columnKey)
      .map((record) => record.id);
    const widthsOf = (design: Design): readonly number[] =>
      design.placements
        .filter((placement) => memberIds.includes(placement.id))
        .map((placement) => placement.body.widthMm);
    expect(new Set(widthsOf(withSpace.design)).size).toBeGreaterThan(1);

    let squaredUp = 0;
    for (const widthMm of ALL_WIDTHS_MM) {
      const result = resizeTo(withSpace, "a-wall", widthMm);
      if (!result.ok) {
        // Whatever still refuses does so for a reason about the widths or the space, never about
        // alignment — the code that used to answer here no longer exists.
        expect([
          "WIDTH_NOT_SUPPORTED",
          "WIDTH_UNCHANGED",
          "NO_EMPTY_SPACE",
          "RESIZE_OPENS_GAP",
        ]).toContain(result.reason.code);
        continue;
      }
      squaredUp += 1;
      const after = result.design.placements.filter((placement) =>
        memberIds.includes(placement.id),
      );
      // The whole point of the decision: one width and one centre at every level.
      for (const placement of after) {
        expect(placement.body.widthMm).toBe(widthMm);
        expect(placement.alongMm).toBe(after[0]?.alongMm);
      }
    }
    expect(squaredUp).toBeGreaterThan(0);
  });

  it("is produced by 13 of the 129 single-body inserts the shipped kitchen accepts", () => {
    // The breadth question, measured. For each clearable column, each member deleted on its own,
    // each opening that frees, and each §7 entry the engine accepts into it: does the column stay
    // flush? The eight rows for `base-bottle-cargo` are every column it fits.
    //
    // **The measurement is unchanged; what it means is not.** These thirteen were lockouts — ADR
    // 0026's whole 600+600+200 run was a run that could never be resized again — and under ADR 0035
    // decision 6 they are thirteen columns that a resize squares up. The count is kept because it is
    // still the population the square-up has to be right for, and because a catalogue edit that
    // changed it would be worth noticing either way.
    //
    // **154 → 125 (ADR 0032) → 124 (ADR 0033) → 126 (its amendment) → 129 (the sink and hood
    // decisions).** The merge removed one entry from each band, so the population lost the inserts
    // naming the retired ids and gained the ones the merged rows accept; ranges then restored the
    // fridge column's 700 mm openings; and the last three are `base-sink` reaching 700 as cabinetry
    // with a fixed aperture, plus the hood narrowing into openings it used to refuse.
    //
    // **The numerator moved twice and is back where it started: thirteen → fifteen → thirteen, and
    // both rows that came and went are the hood.** ADR 0033's amendment made the hood *narrow* into a
    // wider opening like every discrete row, which gave it `base-dishwasher`'s consequence — install
    // a 600 in an 800 mm opening and the column holds two widths, which `COLUMN_MEMBERS_UNALIGNED`
    // then refuses to resize. ADR 0035 decision 5 makes the hood cabinetry bounded 600–800 instead,
    // so it **fills** the opening and the column stays flush. The mixed-width question is unchanged
    // and still the owner's (ADR 0032 says so by name); it simply no longer reaches this row.
    //
    // `base-sink` adds none — its range means it *fills* the opening rather than narrowing into it,
    // so the column stays flush.
    //
    // **What stopped being accepted, stated as it now stands.** ADR 0032 gave a bounded set its bite
    // on the `'fit'` path, and the denominator's fall to 125 was that: entries refused at openings
    // whose width their own set did not list. Three of the four rows that named have since changed
    // shape — `base-1door` and `wall-1door` were merged away by ADR 0033, `wall-2door` with them, and
    // the hood no longer refuses a wider opening at all but narrows into it. What is left of the
    // original effect is a hinged cabinet refusing the band between its two door counts, and the
    // discrete appliance rows refusing what they are not made at.
    const locked: string[] = [];
    let accepted = 0;
    for (const cleared of CLEARABLE) {
      for (const removed of cleared.ids) {
        const world = clearBodies(kitchen(), [removed]);
        for (const opening of world.voids.filter(
          (candidate) => candidate.col === cleared.key,
        )) {
          for (const [buildId] of INSERTABLE_BODY_DEFINITIONS) {
            const inserted = insertInto(
              world,
              { kind: "void", id: opening.id },
              buildId,
            );
            if (!inserted.ok) continue;
            accepted += 1;
            const after = advance(world, inserted.design);
            const members = after.design.placements.filter((placement) =>
              after.records.some(
                (record) =>
                  record.id === placement.id && record.col === cleared.key,
              ),
            );
            const first = members[0];
            const flush = members.every(
              (placement) =>
                first !== undefined &&
                placement.alongMm === first.alongMm &&
                placement.body.widthMm === first.body.widthMm,
            );
            if (!flush) locked.push(`${cleared.key}<-${buildId}`);
          }
        }
      }
    }

    expect(accepted).toBe(129);
    expect(locked.sort()).toEqual(
      [
        "A|1.30<-base-bottle-cargo",
        "A|1.30<-base-dishwasher",
        "A|1.30<-base-hob-2drawer",
        "A|1.30<-base-hob-oven",
        "A|2.00<-base-bottle-cargo",
        "A|2.60<-base-bottle-cargo",
        "A|3.20<-base-bottle-cargo",
        "B|1.20<-base-bottle-cargo",
        "B|1.80<-base-bottle-cargo",
        "B|2.45<-base-bottle-cargo",
        "B|2.45<-base-dishwasher",
        "B|2.45<-base-hob-2drawer",
        "B|2.45<-base-hob-oven",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// RESIZE_OPENS_GAP, re-stated.
// ---------------------------------------------------------------------------

describe("Q7 — no opening may appear where a body physically stands", () => {
  it("holds on every accepted tap in the whole population", () => {
    for (const cleared of CLEARABLE) {
      const base = clearBodies(kitchen(), cleared.ids);
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          const after = advanceWithColumns(
            base,
            result.design,
            result.effect.columns,
          );
          const phantom = after.voids.filter((opening) =>
            after.records.some((record) => {
              if (record.wall !== opening.wall) return false;
              const bodyAlong =
                record.wall === "A" ? record.frame.x : record.frame.z;
              const openingAlong = opening.wall === "A" ? opening.x : opening.z;
              const along =
                Math.min(
                  bodyAlong + record.frame.w / 2,
                  openingAlong + opening.w / 2,
                ) -
                Math.max(
                  bodyAlong - record.frame.w / 2,
                  openingAlong - opening.w / 2,
                );
              const vertical =
                Math.min(
                  record.frame.y0 + record.frame.h,
                  opening.y0 + opening.h,
                ) - Math.max(record.frame.y0, opening.y0);
              return along > 1e-6 && vertical > 1e-6;
            }),
          );
          expect(phantom).toEqual([]);
        }
      }
    }
  });

  it("does not refuse a run that merely meets the empty column on a boundary", () => {
    // Touching is not overlapping, and the normal case is that every accepted resize leaves the
    // resized column and the empty one sharing exactly one coordinate. If the predicate counted a
    // shared edge, none of the fifteen taps would be accepted at all.
    const world = clearBodies(kitchen(), ["p1", "p12", "p18"]);
    const result = resizeTo(world, "p0", 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    const resized = after.records.find((record) => record.id === "p0");
    const empty = after.voids.find((opening) => opening.y0 < 0.1);
    expect(resized).toBeDefined();
    expect(empty).toBeDefined();
    if (!resized || !empty) return;
    expect(resized.frame.x + resized.frame.w / 2).toBeCloseTo(
      empty.x - empty.w / 2,
      9,
    );
  });
});

// ---------------------------------------------------------------------------
// §10's signature flow, and the empty column's carried extent.
// ---------------------------------------------------------------------------

describe("Q8 — the empty column's frozen extent, and §10", () => {
  it("still yields three openings from a cleared fridge column, before and after a resize elsewhere", () => {
    const cleared = clearBodies(kitchen(), ["p7", "p24"]);
    const fridge = (world: KitchenWorld): readonly string[] =>
      openingKeys(world).filter((key) => key.startsWith("B|2.45@"));
    expect(fridge(cleared)).toEqual([
      "B|2.45@0.00+0.86",
      "B|2.45@1.50+0.70",
      "B|2.45@2.20+0.40",
    ]);

    const world = clearBodies(cleared, ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );

    expect(fridge(after)).toEqual([
      "B|2.45@0.00+0.86",
      "B|2.45@1.50+0.70",
      "B|2.45@2.20+0.40",
    ]);
  });

  it("carries the empty column's regions, top and depth onto its new key unchanged", () => {
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const before = world.columns.get("A|0.30");
    expect(before).toBeDefined();
    if (!before) return;

    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const moved = result.effect.columns.get("A|0.25");
    expect(moved).toBeDefined();
    if (!moved) return;

    expect(moved.regions).toEqual(before.regions);
    expect(moved.top).toBe(before.top);
    expect(moved.d).toBe(before.d);
    expect(moved.ry).toBe(before.ry);
    expect(moved.w).toBeCloseTo(0.5, 9);
    expect(result.effect.columns.has("A|0.30")).toBe(false);
  });

  it("GAP Q1.4: names the empty column by a key its own published map no longer holds", () => {
    // Documented on `BodyResizedEffect.emptyColumnKey` as "the key it had **before** it moved", so
    // this pins the shape rather than claiming a defect. It is still a trap for any consumer: the
    // key is a miss against `effect.columns` whenever the column survived, and the new key is not
    // published anywhere in the effect, so nothing downstream can point at the space that moved.
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.effect.emptyColumnKey).toBe("A|0.30");
    expect(result.effect.emptyColumnWidthMm).toBe(500);
    expect(result.effect.columns.has(result.effect.emptyColumnKey)).toBe(false);
    expect(result.effect.columns.has("A|0.25")).toBe(true);
  });

  it("derives the moved empty column's key the way an occupied one is derived", () => {
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.effect.columns.keys()]).toContain(
      deriveColumnKeyAt("A", 0.25),
    );
  });

  it("takes a body inserted into the moved empty column under a key the map holds", () => {
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    expect(after.voids.map((opening) => opening.col)).toEqual([
      "A|0.25",
      "A|0.25",
    ]);

    for (const opening of after.voids) {
      // `open-shelf` rather than a hinged cabinet, and it no longer matters which: the 500 mm moved
      // column fell in the gap a hinged cabinet skipped until the owner retired ADR 0030's one-door
      // cap, and now both fit. Column identity is the subject here, so the body stays the one that
      // fitted throughout rather than becoming a second thing this case is about.
      const inserted = insertInto(
        after,
        { kind: "void", id: opening.id },
        "open-shelf",
      );
      expect(inserted.ok).toBe(true);
      if (!inserted.ok) continue;
      const reloaded = advance(after, inserted.design);
      for (const record of reloaded.records) {
        expect(after.columns.has(record.col)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Atomicity, appearance, and what a resize is allowed to change.
// ---------------------------------------------------------------------------

describe("Q9 — atomicity", () => {
  it("writes nothing when a member half-way down the column fails its built-size re-check", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    const asked: string[] = [];
    const probe: BodyProbe = {
      measure(request: BodyProbeRequest): BodyMeasurement {
        asked.push(request.buildId);
        const broken = request.buildId === "wall-cabinet";
        return {
          carcassWidthM: broken ? 0.123 : request.widthM,
          carcassHeightM: request.heightM,
          fullHeightM: request.heightM + 0.36,
          seatOffsetM: request.depthM / 2,
        };
      },
    };

    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p0" },
      widthMm: 600,
      probe,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("BUILT_SIZE_MISMATCH");
    // The sink was built first and passed; the wall cabinet failed. Nothing was written.
    expect(asked).toEqual(["base-sink", "wall-cabinet"]);
    expect(result.design).toEqual(world.design);
  });
});

describe("Q10 — §11 rows 12 and 13, for every member", () => {
  it("carries the finish and the handle onto every member that can take them", () => {
    const design: Design = {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        {
          id: "a-base",
          wall: "A",
          alongMm: 400,
          y0Mm: 0,
          body: {
            buildId: "base-panbank",
            widthMm: 600,
            heightMm: 860,
            finish: LEGACY_ENUM_FINISHES.sage,
            handle: "black",
          },
        },
        {
          id: "a-wall",
          wall: "A",
          alongMm: 400,
          y0Mm: 1500,
          body: {
            buildId: "wall-cabinet",
            widthMm: 600,
            heightMm: 700,
            finish: LEGACY_ENUM_FINISHES.sage,
            handle: "black",
          },
        },
        placementAt("a-top", 400, 2200, "open-shelf", 600, 400),
        placementAt("b-base", 1000, 0, "base-panbank", 600, 860),
        placementAt("b-wall", 1000, 1500, "wall-cabinet", 600, 700),
        placementAt("b-top", 1000, 2200, "open-shelf", 600, 400),
      ],
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    };
    const world = clearBodies(createWorld(design, KITCHEN_L_BODY_CATALOG), [
      "b-base",
      "b-wall",
      "b-top",
    ]);

    const result = resizeTo(world, "a-base", 800);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = (id: string) =>
      result.design.placements.find((placement) => placement.id === id)?.body;
    expect(body("a-base")?.finish).toEqual(LEGACY_ENUM_FINISHES.sage);
    expect(body("a-base")?.handle).toBe("black");
    // The selected body is the base one; the wall cabinet above it is the recorded defect —
    // a sage door with black bars reset to white with steel.
    expect(body("a-wall")?.finish).toEqual(LEGACY_ENUM_FINISHES.sage);
    expect(body("a-wall")?.handle).toBe("black");
    // An open shelf carries neither, and must not be given one.
    expect(body("a-top")?.finish).toBeUndefined();
    expect(body("a-top")?.handle).toBeUndefined();
  });
});

describe("Q11 — what a resize changes besides the width", () => {
  it("migrates a seeded base cabinet from its 820 mm frame to §7's 860 mm one, once", () => {
    // Not a wave 5C defect: the seeded base rows are 820 mm tall while §7's base carcass reaches
    // the 860 mm worktop line, and `insertBody` into the same vacated slot already builds 860.
    // Recorded because it means "growing then shrinking back returns the exact original geometry"
    // is true of every span and every column width — and false of the document, which keeps the
    // migrated `buildId`, `heightMm` and `seatDepthMm`. The migration is idempotent, so the second
    // resize changes nothing further.
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    expect(
      world.design.placements.find((placement) => placement.id === "p0")?.body,
    ).toEqual({ buildId: "base-sink-800", widthMm: 800, heightMm: 820 });

    const shrunk = resizeTo(world, "p0", 600);
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;
    const middle = advanceWithColumns(
      world,
      shrunk.design,
      shrunk.effect.columns,
    );
    expect(
      middle.design.placements.find((placement) => placement.id === "p0")?.body,
    ).toEqual({
      buildId: "base-sink",
      widthMm: 600,
      heightMm: 860,
      seatDepthMm: 580,
    });

    const grown = resizeTo(middle, "p0", 800);
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(
      grown.design.placements.find((placement) => placement.id === "p0")?.body,
    ).toEqual({
      buildId: "base-sink",
      widthMm: 800,
      heightMm: 860,
      seatDepthMm: 580,
    });
  });

  it("never changes a member's wall or module line", () => {
    for (const cleared of CLEARABLE) {
      const base = clearBodies(kitchen(), cleared.ids);
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          for (const after of result.design.placements) {
            const before = base.design.placements.find(
              (candidate) => candidate.id === after.id,
            );
            expect(after.wall).toBe(before?.wall);
            expect(after.y0Mm).toBe(before?.y0Mm);
          }
        }
      }
    }
  });

  it("resizes only the members of the selected column, and nothing else", () => {
    for (const cleared of CLEARABLE) {
      const base = clearBodies(kitchen(), cleared.ids);
      for (const placement of base.design.placements) {
        for (const widthMm of ALL_WIDTHS_MM) {
          const result = resizeTo(base, placement.id, widthMm);
          if (!result.ok) continue;
          const moved = new Set(result.effect.columnPlacementIds);
          for (const after of result.design.placements) {
            if (moved.has(after.id)) continue;
            const before = base.design.placements.find(
              (candidate) => candidate.id === after.id,
            );
            expect(after).toEqual(before);
          }
        }
      }
    }
  });
});

describe("Q12 — the request itself", () => {
  it("refuses a void, a missing target and an unusable timestamp before anything else", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    const probe = createFakeProbe();
    const call = (
      target: Parameters<typeof setWidth>[0]["target"],
      occurredAt: string,
    ) =>
      setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target,
        widthMm: 600,
        probe,
        occurredAt,
      });

    const onVoid = call({ kind: "void", id: "anything" }, OCCURRED_AT);
    expect(onVoid.ok).toBe(false);
    if (!onVoid.ok) expect(onVoid.reason.code).toBe("VOID_SELECTED");

    const missing = call({ kind: "placement", id: "nope" }, OCCURRED_AT);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason.code).toBe("TARGET_NOT_FOUND");

    const stamped = call({ kind: "placement", id: "p0" }, "not-a-date");
    expect(stamped.ok).toBe(false);
    if (!stamped.ok) expect(stamped.reason.code).toBe("INVALID_OCCURRED_AT");

    expect(probe.requests).toEqual([]);
  });

  it("refuses a width that is not one of the column's, however it is expressed", () => {
    const world = clearBodies(kitchen(), ["p10", "p16"]);
    for (const widthMm of [
      Number.NaN,
      -600,
      0,
      599.5,
      601,
      Number.POSITIVE_INFINITY,
    ]) {
      const result = resizeTo(world, "p0", widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
  });
});
