// Adversarial QA for waves 6J-c, 6J-d and 6N-0 — written to falsify rather than to confirm.
//
// The three claims attacked here are the ones the waves' own suites state most confidently and
// check least directly.
//
//  1. **The ladder's rung boundaries.** `alongWallExtentPositionAtMm` has four rungs and the wave's
//     own file exercises one input per rung. What it does not exercise is the *boundary*: a column
//     whose members disagree about how far they moved. `along-wall-chain-shift.ts` claims in prose
//     that such a column "gets no entry either… so the extent falls to rung 3", and nothing asserts
//     it — so the fall-through is undemonstrated and could be dead.
//  2. **Rung 4 by value.** The wave asserts `[2200..2900]`, `[1600..2200]` and `[1000..1600]` as
//     literals. Literals agreeing with the implementation that produced them is not evidence. Here
//     the same intervals are derived from the neighbours' **own post-command coordinates**, so the
//     claim under test is *abutting*, which is what ADR 0090's amendment actually measured.
//  3. **6N-0's envelope claim.** `demo-room-envelope.test.ts` asserts four derived artefacts are
//     byte-identical at 2830 and at 2920 — true, and only at the **600 mm** setting. At 700 the same
//     seeded design is judged differently by the two rooms, which is both the strongest non-vacuity
//     case available and the statement that 6N-0 is load-bearing for 6J-c rather than cosmetic.
import { describe, expect, it } from "vitest";

import {
  alongWallExtentPositionAtMm,
  alongWallShiftByColumnMm,
} from "../src/along-wall-chain-shift.js";
import { baseCarcassDepthMm, wallCarcassSeatDepthMm } from "../src/catalog.js";
import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import type { Design, EmptyColumn } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { findOverflowingPlacementIds } from "../src/queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  derivePlacementRecords,
  type ColumnExtent,
  type PlacementRecord,
} from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";

const OCCURRED_AT = "2026-09-06T14:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;

/** Wall B as the design reference measures it, and the length the demo carried until wave 6N-0. */
const REFERENCE_WALL_B_MM = 2830;

const DEEP_CATALOG = buildKitchenLBodyCatalog(DEEP_MM);

const MOVE = {
  fromCabinetDepthMm: SHALLOW_MM,
  toCabinetDepthMm: DEEP_MM,
} as const;

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

// =================================================================================================
// The ladder's rung boundaries
// =================================================================================================

describe("a column whose members disagree about how far they moved", () => {
  /** A frozen extent on wall B at an along-wall centre, shaped as `deriveColumns` builds one. */
  function extentAt(alongM: number, depthFromBuildId?: string): ColumnExtent {
    const extent: ColumnExtent = {
      key: `B|${alongM.toFixed(2)}`,
      wall: "B",
      ry: Math.PI / 2,
      x: 0.3,
      z: alongM,
      w: 0.57,
      d: 0.33,
      top: 2.6,
      regions: [[1.5, 2.6]],
    };
    return depthFromBuildId === undefined
      ? extent
      : { ...extent, depthFromBuildId };
  }

  /** One wall-B record filed under `col` and standing at `alongM`, built from a real seeded record
   *  so every field the pairing reads is the shape production hands it. */
  function recordAt(id: string, col: string, alongM: number): PlacementRecord {
    const seeded = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      buildKitchenLBodyCatalog(SHALLOW_MM),
    ).find((record) => record.wall === "B");
    if (!seeded) throw new Error("no seeded wall-B record");
    return {
      ...seeded,
      id,
      col,
      frame: { ...seeded.frame, x: 0.3, z: alongM },
    };
  }

  const TORN_KEY = "B|0.61";
  const before = [
    recordAt("m1", TORN_KEY, 0.615),
    recordAt("m2", TORN_KEY, 0.615),
  ];

  // **The fall-through the module claims in prose and nothing asserted.** `docs/BACKLOG.md` 51's
  // torn column: two members of one column moving by two different deltas. "The delta its own
  // members moved" is not a number, so rung 2 must decline rather than pick one of them.
  it("reports no delta at all rather than picking one of the two", () => {
    const torn = alongWallShiftByColumnMm(before, [
      recordAt("m1", "B|0.68", 0.685),
      recordAt("m2", "B|0.71", 0.715),
    ]);

    expect(torn.has(TORN_KEY)).toBe(false);
    // Not vacuous: the same pair with the members agreeing does produce an entry.
    expect(
      alongWallShiftByColumnMm(before, [
        recordAt("m1", "B|0.68", 0.685),
        recordAt("m2", "B|0.68", 0.685),
      ]).get(TORN_KEY),
    ).toBe(70);
  });

  // **The fall-through is reachable, not dead.** A torn column's extent lands on rung 3 — its
  // recorded source's declared chain — which for `wall-corner-return-570` is `wall-map`, +70.
  it("falls to the chain its recorded source declares", () => {
    const torn = alongWallShiftByColumnMm(before, [
      recordAt("m1", "B|0.68", 0.685),
      recordAt("m2", "B|0.71", 0.715),
    ]);

    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(0.615, "wall-corner-return-570"),
        catalog: DEEP_CATALOG,
        ...MOVE,
        membersShiftMm: torn.get(TORN_KEY),
      }),
    ).toBe(685);
  });

  // And a torn column with no recorded source falls all the way to rung 4, at the catalogue's own
  // default — so no input lands between two rungs or on none.
  it("falls to the declared default when it also records no source", () => {
    const torn = alongWallShiftByColumnMm(before, [
      recordAt("m1", "B|0.68", 0.685),
      recordAt("m2", "B|0.71", 0.715),
    ]);

    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(0.615),
        catalog: DEEP_CATALOG,
        ...MOVE,
        membersShiftMm: torn.get(TORN_KEY),
      }),
    ).toBe(
      615 + (baseCarcassDepthMm(DEEP_MM) - baseCarcassDepthMm(SHALLOW_MM)),
    );
  });

  // **Rung 2 outranks rung 3 unconditionally**, which is the whole reason the amendment put it
  // above the source: where the two disagree the members win, even by 93 mm. If this ever inverts,
  // ADR 0090's `B|615` failure returns.
  it("takes its members' delta over its recorded source's chain where the two disagree", () => {
    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(1.2, "tall-oven-tower-600"),
        catalog: DEEP_CATALOG,
        ...MOVE,
        membersShiftMm: 7,
      }),
    ).toBe(1207);
  });

  // **Zero is an answer, not an absence.** A wall-B column whose members held still keeps its
  // coordinate on rung 2 rather than being slid by a declaration — the distinction
  // `alongWallShiftByColumnMm` reports a real `0` for, and the one a `?? undefined` would erase.
  it("holds a wall-B extent still when its own members held still", () => {
    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(1.2, "tall-oven-tower-600"),
        catalog: DEEP_CATALOG,
        ...MOVE,
        membersShiftMm: 0,
      }),
    ).toBe(1200);
  });

  // A member whose coordinate is off the millimetre grid is skipped rather than disqualifying its
  // column: the remaining members still answer rung 2. Pinned because it is a silent arm — the
  // `continue` in `alongWallShiftByColumnMm` — and the alternative reading (any ungriddable member
  // drops the column to rung 3) is equally defensible and would be a different product.
  it("still answers from the members that are on the grid", () => {
    const shifts = alongWallShiftByColumnMm(before, [
      recordAt("m1", "B|0.68", 0.685),
      recordAt("m2", "B|0.68", 0.6851234),
    ]);

    expect(shifts.get(TORN_KEY)).toBe(70);
  });
});

// =================================================================================================
// Rung 4, derived rather than restated
// =================================================================================================

describe("where a sourceless wall-B space lands, derived from its neighbours", () => {
  /** The shipped kitchen with the named bodies removed, their column recorded as a space, and
   *  **every** recorded source stripped — a document written before wave 6K-c. */
  function legacyWith(members: readonly string[], space: EmptyColumn): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !members.includes(placement.id),
      ),
      emptyColumns: [space],
    };
  }

  function spaceAt(alongMm: number, widthMm: number): EmptyColumn {
    return { wall: "B", alongMm, widthMm, y0Mm: 0, topMm: 2600, depthMm: 600 };
  }

  /** Where a surviving seeded body's own edges are **after the command** — the operand that makes
   *  "abutting" a derivation rather than a restatement of the number under test. */
  function edgesOf(design: Design, id: string): readonly [number, number] {
    const placement = design.placements.find(
      (candidate) => candidate.id === id,
    );
    if (!placement) throw new Error(`no placement ${id}`);
    return [
      placement.alongMm - placement.body.widthMm / 2,
      placement.alongMm + placement.body.widthMm / 2,
    ];
  }

  const CASES: readonly (readonly [
    string,
    readonly string[],
    EmptyColumn,
    string,
    string,
  ])[] = [
    // name, members cleared, the space they leave, the body below it, the body above it
    ["the oven tower", ["p5", "p22"], spaceAt(1200, 600), "p26", "p6"],
    ["the pantry", ["p6", "p23"], spaceAt(1800, 600), "p5", "p7"],
    ["the appliance niche", ["p7", "p24"], spaceAt(2450, 700), "p6", ""],
  ];

  // **The claim is *abutting*, and the operands are the neighbours' own post-command coordinates.**
  // ADR 0090's amendment measured that a sourceless space lands exactly against the run that used to
  // stand beside it, to the millimetre — a rule off by anything at all leaves a gap or an overlap.
  // Asserting `[1000..1600]` against a literal cannot tell those apart from a rule that produced the
  // literal; asserting it against `p26`'s far edge can.
  it.each(CASES)(
    "abuts the run that stands beside %s",
    (_name, members, space, below, above) => {
      const changed = changeTo(legacyWith(members, space), DEEP_MM);
      const moved = changed.emptyColumns?.[0];
      if (!moved) throw new Error("the space did not survive the change");

      const nearEdgeMm = moved.alongMm - moved.widthMm / 2;
      const farEdgeMm = moved.alongMm + moved.widthMm / 2;

      expect(nearEdgeMm).toBe(edgesOf(changed, below)[1]);
      if (above !== "") expect(farEdgeMm).toBe(edgesOf(changed, above)[0]);
      // And the space is the customer's own width throughout — nothing was cut back to fit.
      expect(moved.widthMm).toBe(space.widthMm);
    },
  );

  // The delta rung 4 applies is the catalogue's own base-run arithmetic and not a literal, so the
  // interval above is the one `baseCarcassDepthMm` produces rather than one this file chose. The
  // wall-map arm is measured beside it because a single number cannot distinguish the two chains.
  it("moves by the base run's own gain and not by the wall band's", () => {
    const baseDeltaMm =
      baseCarcassDepthMm(DEEP_MM) - baseCarcassDepthMm(SHALLOW_MM);
    const wallDeltaMm =
      wallCarcassSeatDepthMm(DEEP_MM) - wallCarcassSeatDepthMm(SHALLOW_MM);
    expect(baseDeltaMm).not.toBe(wallDeltaMm);

    const changed = changeTo(
      legacyWith(["p5", "p22"], spaceAt(1200, 600)),
      DEEP_MM,
    );

    expect(changed.emptyColumns?.[0]?.alongMm).toBe(1200 + baseDeltaMm);
  });
});

// =================================================================================================
// 6N-0's envelope claim, from the side that can falsify it
// =================================================================================================

describe("the room the demo declares, at the setting the envelope was moved for", () => {
  const OLD: Design = {
    ...KITCHEN_L_DESIGN,
    room: { ...KITCHEN_L_DESIGN.room, depthMm: REFERENCE_WALL_B_MM },
  };

  // `demo-room-envelope.test.ts` asserts four derived artefacts are byte-identical under the two
  // rooms. That is true, and it is true **at 600 only** — which is the setting the seeded run ends
  // at 2800 in. At 700 the run ends at 2900 and the two rooms disagree about the same design.
  //
  // Stated here so the byte-identity above reads as "the room is an envelope and this design fits
  // both" rather than as "the room is inert", and so that a later wave shortening wall B back to the
  // reference measurement fails on the seeded kitchen rather than only on a synthetic body.
  it("judges the seeded kitchen differently at the deeper setting", () => {
    const inTheDemoRoom = changeTo(KITCHEN_L_DESIGN, DEEP_MM);
    const inTheReferenceRoom = changeTo(OLD, DEEP_MM);

    expect(findOverflowingPlacementIds(inTheDemoRoom)).toEqual([]);
    expect(findOverflowingPlacementIds(inTheReferenceRoom)).toEqual([
      "p24",
      "p7",
    ]);
  });

  // The same discrimination through the validator, which is what the write seam runs: the marking
  // family appears under the reference room and not under the demo's.
  it("reports the past-the-wall family under the reference room and none under the demo's", () => {
    const codesOf = (design: Design): readonly string[] =>
      validateDesignForCatalog(design, DEEP_CATALOG).map((issue) => issue.code);

    expect(codesOf(changeTo(KITCHEN_L_DESIGN, DEEP_MM))).toEqual([]);
    expect(codesOf(changeTo(OLD, DEEP_MM))).toEqual([
      "PLACEMENT_PAST_WALL_END",
      "PLACEMENT_PAST_WALL_END",
      "COLUMN_EXTENT_PAST_WALL_END",
    ]);
  });

  // And the byte-identity the wave claims is re-checked at the setting it holds at, so this file
  // does not read as a claim that the two rooms always disagree.
  it("still derives the same placements under both rooms at the default setting", () => {
    expect(
      JSON.stringify(
        derivePlacementRecords(
          changeTo(KITCHEN_L_DESIGN, SHALLOW_MM),
          buildKitchenLBodyCatalog(SHALLOW_MM),
        ),
      ),
    ).toBe(
      JSON.stringify(
        derivePlacementRecords(
          changeTo(OLD, SHALLOW_MM),
          buildKitchenLBodyCatalog(SHALLOW_MM),
        ),
      ),
    );
  });
});
