// Wave 6J-c — the along-wall chain's own arithmetic.
//
// The command-level criteria live in `commands/set-cabinet-depth.along-wall-chain.test.ts`. What is
// here is the module: the two chains carry **different** deltas, and the shift is a pure function of
// the setting. That `alongWallPositionFollows` has a production reader is what "the two chains" and
// "how far a column's own members moved" measure: a reader that ignored it would return one delta.
import { describe, expect, it } from "vitest";

import {
  alongWallExtentPositionAtMm,
  alongWallPositionAtMm,
  alongWallShiftByColumnMm,
  alongWallShiftMm,
  cornerReachAlongWallMm,
  cornerTakingWallsOf,
} from "../src/along-wall-chain-shift.js";
import {
  FOLLOWS_CABINET_DEPTH,
  type AlongWallDepthChain,
} from "../src/cabinet-depth-rule.js";
import type { DesignPlacement } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  derivePlacementRecords,
  type ColumnExtent,
} from "../src/void-engine.js";

const SHALLOW_MM = 600;
const DEEP_MM = 700;

/** A wall-B placement lifted out of the seeded fixture by id, so a test states a body rather than an
 *  index into a list that has been renumbered once already. */
function seeded(id: string): DesignPlacement {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.id === id,
  );
  if (!placement) throw new Error(`no seeded placement ${id}`);
  return placement;
}

describe("the two chains", () => {
  // **The reason the field exists at all** (ADR 0089): one uniform shift is wrong for one of the two
  // by 30 mm. Asserted as two numbers *and* as their inequality, so a reader that collapsed them to
  // one delta cannot pass by landing on whichever arm it chose.
  it("carry different deltas between the two declared depths", () => {
    const shiftOf = (chain: AlongWallDepthChain): number =>
      alongWallShiftMm({
        fromCabinetDepthMm: SHALLOW_MM,
        toCabinetDepthMm: DEEP_MM,
        chain,
      });

    expect(shiftOf("base-formula")).toBe(100);
    expect(shiftOf("wall-map")).toBe(70);
    expect(shiftOf("base-formula")).not.toBe(shiftOf("wall-map"));
  });

  // The reaches themselves, which are what those deltas are differences of: the base run's carcass
  // and the wall band's carcass seat, at both settings.
  it("reach the distances the two corner bands actually occupy", () => {
    expect(
      cornerReachAlongWallMm({
        cabinetDepthMm: SHALLOW_MM,
        chain: "base-formula",
      }),
    ).toBe(560);
    expect(
      cornerReachAlongWallMm({
        cabinetDepthMm: DEEP_MM,
        chain: "base-formula",
      }),
    ).toBe(660);
    expect(
      cornerReachAlongWallMm({ cabinetDepthMm: SHALLOW_MM, chain: "wall-map" }),
    ).toBe(291);
    expect(
      cornerReachAlongWallMm({ cabinetDepthMm: DEEP_MM, chain: "wall-map" }),
    ).toBe(361);
  });

  it.each(["base-formula", "wall-map"] as const)(
    "moves nothing on %s when the setting does not change",
    (chain) => {
      for (const cabinetDepthMm of [SHALLOW_MM, DEEP_MM]) {
        expect(
          alongWallShiftMm({
            fromCabinetDepthMm: cabinetDepthMm,
            toCabinetDepthMm: cabinetDepthMm,
            chain,
          }),
        ).toBe(0);
      }
    },
  );

  it.each(["base-formula", "wall-map"] as const)(
    "sums to nothing on %s over there and back",
    (chain) => {
      const out = alongWallShiftMm({
        fromCabinetDepthMm: SHALLOW_MM,
        toCabinetDepthMm: DEEP_MM,
        chain,
      });
      const back = alongWallShiftMm({
        fromCabinetDepthMm: DEEP_MM,
        toCabinetDepthMm: SHALLOW_MM,
        chain,
      });

      expect(out).not.toBe(0);
      expect(out + back).toBe(0);
    },
  );
});

describe("which placements the corner reaches", () => {
  const catalog = buildKitchenLBodyCatalog(DEEP_MM);
  const move = {
    fromCabinetDepthMm: SHALLOW_MM,
    toCabinetDepthMm: DEEP_MM,
    shape: "L" as const,
  };

  it("takes the wall it is declared to take from on an L, and no other", () => {
    expect([...cornerTakingWallsOf("L")]).toStrictEqual(["B"]);
  });

  // R1.3: a direct wall-C call is the superset `{B, C}`'s job, not the L's own singleton — wall C
  // never appears in an L's `TileRun`s or `CornerAssemblyPiece`s, so this is what `ownsTheCorner`
  // and `slideReserveMm` read for every wall, and it agrees with the L's own set on "A" and "B".
  it("takes both wall B and wall C on a U, and neither on a straight room", () => {
    expect([...cornerTakingWallsOf("U")].sort()).toStrictEqual(["B", "C"]);
    expect([...cornerTakingWallsOf("linear")]).toStrictEqual([]);
  });

  // Wall A is anchored at the corner (ADR 0083 decision 1), so a deeper corner never shortens it.
  it("leaves every wall-A placement where it stands", () => {
    const wallA = KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.wall === "A",
    );

    expect(wallA.length).toBeGreaterThan(0);
    for (const placement of wallA) {
      expect(
        alongWallPositionAtMm({ placement, catalog, ...move }),
        placement.id,
      ).toBe(placement.alongMm);
    }
  });

  // ADR 0058's pinned tops and the freestanding fridge do not follow the setting in **depth** and
  // still slide: where a body stands and what it is built to are two questions, and answering the
  // second for the first is what left the run overlapping itself at the pinned rows.
  it("slides a body whose own depth the setting does not reach", () => {
    for (const id of ["p7", "p22", "p24"]) {
      const placement = seeded(id);
      expect(alongWallPositionAtMm({ placement, catalog, ...move }), id).toBe(
        placement.alongMm + 100,
      );
    }
  });

  // The same stance `setCabinetDepth` takes for a body it cannot resolve: left where it is, so the
  // command's own refusal reports it rather than this module throwing on the way there.
  it("leaves a placement whose entry left the catalogue exactly where it is", () => {
    const orphan: DesignPlacement = {
      ...seeded("p5"),
      body: { ...seeded("p5").body, buildId: "no-such-entry" },
    };

    expect(alongWallPositionAtMm({ placement: orphan, catalog, ...move })).toBe(
      orphan.alongMm,
    );
  });
});

describe("which frozen extents the corner reaches", () => {
  const catalog = buildKitchenLBodyCatalog(DEEP_MM);
  const move = {
    fromCabinetDepthMm: SHALLOW_MM,
    toCabinetDepthMm: DEEP_MM,
    membersShiftMm: undefined,
    shape: "L" as const,
  };

  /** A frozen extent at an along-wall centre on wall B, shaped as `deriveColumns` builds one: the
   *  along-wall coordinate on the wall's tangent (`z` here) and the column's own half-depth on its
   *  normal. */
  function extentAt(alongM: number, depthFromBuildId?: string): ColumnExtent {
    const extent: ColumnExtent = {
      key: `B|${alongM.toFixed(2)}`,
      wall: "B",
      ry: Math.PI / 2,
      x: 0.3,
      z: alongM,
      w: 0.6,
      d: 0.6,
      top: 2.2,
      regions: [[0, 2.2]],
    };
    return depthFromBuildId === undefined
      ? extent
      : { ...extent, depthFromBuildId };
  }

  // **Rung 1.** Wall A is anchored at the corner and does not move at any setting, so its extents do
  // not either — even one carrying a wall-B body's id, which is a shape only a corrupt document
  // reaches and which the wall rung must answer before any other does.
  it("leaves a wall-A extent where it stands", () => {
    const onWallA: ColumnExtent = {
      ...extentAt(1.2, "tall-oven-tower-600"),
      key: "A|1.20",
      wall: "A",
      ry: 0,
      x: 1.2,
      z: 0.3,
    };

    expect(
      alongWallExtentPositionAtMm({ extent: onWallA, catalog, ...move }),
    ).toBe(1200);
  });

  // **Rung 2, and it outranks the recorded source.** An occupied extent *is* the column its members
  // are in, so it moves by the delta they moved — exactly, reading no chain at all. The fixture is
  // the failure the ladder was written for: a `wall-map` column whose extent records a body the
  // catalogue resolves to `base-formula` would slide +100 while its members slide +70.
  it("moves an occupied extent by the delta its own members moved", () => {
    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(0.615, "tall-oven-tower-600"),
        catalog,
        ...move,
        membersShiftMm: 70,
      }),
    ).toBe(685);
  });

  // **Rung 3.** ADR 0090 decision 2: the chain comes off `depthFromBuildId` — ADR 0073's recorded
  // source, read for a second axis — and the two chains are 30 mm apart at 700, which is why one is
  // not enough.
  it("slides a member-less extent on the chain its recorded source declares", () => {
    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(1.2, "tall-oven-tower-600"),
        catalog,
        ...move,
      }),
    ).toBe(1300);
    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(0.615, "wall-corner-return-570"),
        catalog,
        ...move,
      }),
    ).toBe(685);
  });

  // **Rung 4** (ADR 0090's 2026-09-06 amendment, which overturned decision 4a). Standing still is
  // not abstention: on a run that has moved it claims a third chain no entry declares, wrong by the
  // full 100 mm. The answer is the catalogue's own default, read from `FOLLOWS_CABINET_DEPTH`.
  it.each(["no recorded source", "a source the catalogue no longer holds"])(
    "slides a member-less extent with %s on the declared default",
    (_case, buildId?: string) => {
      expect(
        alongWallExtentPositionAtMm({
          extent: extentAt(1.2, buildId),
          catalog,
          ...move,
        }),
      ).toBe(1300);
    },
  );

  // The rung-4 default is a **read** of the catalogue's own declaration, not a literal of this
  // module's: it answers whatever `FOLLOWS_CABINET_DEPTH` declares, so a catalogue that changed its
  // default moves the fallback with it rather than parting from it.
  it("takes rung 4's chain from FOLLOWS_CABINET_DEPTH", () => {
    const declared = alongWallShiftMm({
      ...move,
      chain: FOLLOWS_CABINET_DEPTH.alongWallPositionFollows,
    });

    expect(
      alongWallExtentPositionAtMm({ extent: extentAt(1.2), catalog, ...move }),
    ).toBe(1200 + declared);
  });

  // It declines rather than inventing a coordinate, exactly as `clipEmptyColumnsAtWallEnd` does for
  // its own ungriddable input: a column off the millimetre grid is no column a document can carry.
  it("declines an extent whose coordinate is not a whole millimetre", () => {
    expect(
      alongWallExtentPositionAtMm({
        extent: extentAt(1.2005, "tall-oven-tower-600"),
        catalog,
        ...move,
      }),
    ).toBeUndefined();
  });

  // The arithmetic is in millimetres for the reason the module states: `0.615 + 0.07` in metres keys
  // to `B|0.54` on the way back down where `615 + 70` keys to `B|0.55`, and a map keyed a hair
  // differently from the records it describes is the whole defect wave 6J-d closes.
  it("returns to the coordinate it started at, over there and back", () => {
    for (const source of ["tall-oven-tower-600", "wall-corner-return-570"]) {
      const there = alongWallExtentPositionAtMm({
        extent: extentAt(0.615, source),
        catalog,
        ...move,
      });
      expect(there, source).toBeDefined();
      const back = alongWallExtentPositionAtMm({
        extent: extentAt((there ?? 0) / 1000, source),
        catalog,
        fromCabinetDepthMm: DEEP_MM,
        toCabinetDepthMm: SHALLOW_MM,
        membersShiftMm: undefined,
        shape: "L",
      });

      expect(back, source).toBe(615);
    }
  });
});

describe("how far a column's own members moved", () => {
  const catalog = buildKitchenLBodyCatalog(DEEP_MM);
  const move = {
    fromCabinetDepthMm: SHALLOW_MM,
    toCabinetDepthMm: DEEP_MM,
    shape: "L" as const,
  };

  /** The seeded kitchen's records at 600, and the same bodies where the corner leaves them at 700 —
   *  the exact pair `setCabinetDepth` builds rung 2's operand from. */
  function seededShift(): ReadonlyMap<string, number> {
    const at600 = buildKitchenLBodyCatalog(SHALLOW_MM);
    const before = derivePlacementRecords(KITCHEN_L_DESIGN, at600);
    const after = derivePlacementRecords(
      {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
          ...placement,
          alongMm: alongWallPositionAtMm({ placement, catalog, ...move }),
        })),
      },
      at600,
    );
    return alongWallShiftByColumnMm(before, after);
  }

  // The two chains, measured through the members themselves rather than through a declaration: the
  // one `wall-map` column moves 70 and every other wall-B column moves 100. This is the pair that
  // makes rung 2 necessary — a single default is wrong for one of them by 30 mm.
  it("reports each column's own delta, keyed at the coordinate it is leaving", () => {
    const shifts = seededShift();

    expect(shifts.get("B|0.61")).toBe(70);
    // B|0.74 → B|0.73 (ADR 0135): the return is centred at 735 since the joint moved.
    expect(shifts.get("B|0.73")).toBe(100);
    expect(shifts.get("B|1.20")).toBe(100);
    expect(shifts.get("B|1.80")).toBe(100);
    expect(shifts.get("B|2.45")).toBe(100);
  });

  // Wall A is anchored, so its columns move by nothing — reported as a real zero rather than as an
  // absence, because "held a member and did not move" and "held no member" are different answers and
  // rung 2 branches on which.
  it("reports zero for a wall-A column rather than nothing", () => {
    const shifts = seededShift();

    expect(shifts.get("A|1.30")).toBe(0);
    expect(shifts.has("A|1.30")).toBe(true);
  });

  it("reports nothing for a column no record is filed under", () => {
    expect(seededShift().has("B|9.99")).toBe(false);
  });
});
