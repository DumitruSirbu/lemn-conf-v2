// A recorded seat is authoritative only at the setting it was measured at, so a depth change plans against the
// catalogue, not against seats or columns derived from them (ADR 0077 decision 8): otherwise a capped arm
// returns `min(declared 400, stale 330)`, a 600 mm shell built in a 700 mm kitchen.
//
// The trigger is a state (every depth-following member of a column carries a seat from another setting), not a
// change count: `KITCHEN_L_DESIGN` is the only seatless state, so the two routes below reach it as a customer does.
//
// The fake probe reads the entry's own `occupiedDepth` declaration, so a `recorded-shell` body reports the shell
// it was asked for less its front. The real-adapter measurements are in
// `packages/three-adapter/tests/qa-6k-de-repeated-real-probe.adversarial.test.ts`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  wallCarcassDepthMm,
  wallCarcassSeatDepthMm,
} from "../../src/catalog.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
} from "../../src/void-engine.js";
import {
  DEFAULT_CABINET_DEPTH_MM,
  WALL_FRONT_ASSEMBLY_MM,
} from "../../src/worktop-depth.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** One factory for the whole file: a depth change rebuilds every body and the property below runs many
 *  sequences. */
const PROBE_AT = createFakeProbeFactory();

/** The two wall-A columns whose every member is a fronted wall cabinet, so §3.2's MAX over them is a
 *  pure function of what those bodies were last rebuilt to — the only two the defect reaches. */
const STUCK_KEYS = ["A|0.30", "A|0.75"] as const;

/** Their members: `p8` and `p15` in `A|0.30`, `p10` and `p16` in `A|0.75`. */
const STUCK_PLACEMENT_IDS = ["p8", "p10", "p15", "p16"] as const;

/** Columns whose depth the change must leave where the broken command already left it, with the number the
 *  ruling's simulation measured at 700 mm. Named by a member, not a column key: wall B's columns slide along
 *  the wall when the corner deepens (ADR 0089), so `B|1.20` is `B|1.30` at 700. `p9`'s column is absent on
 *  purpose: the fake probe seats a `wall-plane` body at its declared `frameDepthMm` (361) where the real one
 *  measures the built return (400), so its number belongs in the real-probe suite. */
const UNTOUCHED_DEPTHS_AT_700_MM: ReadonlyMap<string, number> = new Map([
  ["p11", 720],
  ["p5", 738],
  // The top over the pantry sets the column's §3.2 MAX at 700, one millimetre past the pantry (ADR 0101).
  ["p6", 700],
  // The freestanding fridge: a manufactured size, and the deepest member of its column at every setting.
  ["p7", 742],
]);

/** The column key it publishes now, read off the record because ADR 0031's resize moves the column it rebuilds. */
function columnKeyOf(
  design: Design,
  cabinetDepthMm: number,
  placementId: string,
): string {
  const record = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  ).find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record for ${placementId}`);
  return record.col;
}

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: PROBE_AT,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function columnDepthsMm(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, number> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  return new Map(
    [...deriveColumns(records, {}, design.room)].map(([key, column]) => [
      key,
      Math.round(column.d * 1000),
    ]),
  );
}

function columnDepthMm(
  design: Design,
  cabinetDepthMm: number,
  key: string,
): number {
  const depthMm = columnDepthsMm(design, cabinetDepthMm).get(key);
  if (depthMm === undefined) throw new Error(`no column ${key} is published`);
  return depthMm;
}

/** Every placement's recorded seat, keyed by id — the field `rebuild` and `reseat` write and the one
 *  `deriveFrame` reads back forever. */
function seatsById(design: Design): ReadonlyMap<string, number | undefined> {
  return new Map(
    design.placements.map((placement) => [
      placement.id,
      placement.body.seatDepthMm,
    ]),
  );
}

function seatMm(design: Design, placementId: string): number | undefined {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`no placement ${placementId}`);
  return placement.body.seatDepthMm;
}

function bodyOf(design: Design, placementId: string): DesignPlacement["body"] {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`no placement ${placementId}`);
  return placement.body;
}

/** The seeded fixture with a seat written by hand at the shallow setting on the named bodies: the state
 *  isolated to exactly the members a test means to stale, which no route produces on its own. */
function withSeatsWrittenAtTheShallowDepth(
  placementIds: readonly string[],
): Design {
  const staleSeatMm = wallCarcassSeatDepthMm(DEFAULT_CABINET_DEPTH_MM);
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placementIds.includes(placement.id)
        ? {
            ...placement,
            body: { ...placement.body, seatDepthMm: staleSeatMm },
          }
        : placement,
    ),
  };
}

describe("the two routes into the state that triggers this", () => {
  // Route 1: a depth change to the value the design already has rebuilds every body and writes every seat, as
  // does the return leg of any round trip.
  it("deepens a run whose seats were written by a change to the depth it already had", () => {
    const settled = changeTo(KITCHEN_L_DESIGN, DEFAULT_CABINET_DEPTH_MM);
    // Non-vacuity: the route left the shallow seat on every member, or the deepening is the seatless easy case.
    for (const id of STUCK_PLACEMENT_IDS) {
      expect(seatMm(settled, id), id).toBe(
        wallCarcassSeatDepthMm(DEFAULT_CABINET_DEPTH_MM),
      );
    }

    const deepened = changeTo(settled, DEEPER_MM);

    for (const id of STUCK_PLACEMENT_IDS) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEPER_MM));
    }
    for (const key of STUCK_KEYS) {
      expect(columnDepthMm(deepened, DEEPER_MM, key), key).toBe(
        wallCarcassDepthMm(DEEPER_MM),
      );
    }
  });

  // Route 2: a width command rebuilds and seats every member of its column (ADR 0031), a different command
  // reaching the same state.
  it("deepens a run whose seats were written by a resize of its own column", () => {
    const resized = afterResizingTheWallColumn();
    for (const id of ["p8", "p15"]) {
      expect(seatMm(resized, id), id).toBe(
        wallCarcassSeatDepthMm(DEFAULT_CABINET_DEPTH_MM),
      );
    }

    const deepened = changeTo(resized, DEEPER_MM);

    for (const id of ["p8", "p15"]) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEPER_MM));
    }
    expect(
      columnDepthMm(
        deepened,
        DEEPER_MM,
        columnKeyOf(deepened, DEEPER_MM, "p8"),
      ),
    ).toBe(wallCarcassDepthMm(DEEPER_MM));
  });
});

/** ADR 0031's resize pointed at `p8` resizes its whole column: one step narrower, since an unchanged width is
 *  refused and a wider one has no empty space to take. */
const RESIZED_WALL_COLUMN_WIDTH_MM = 550;

function afterResizingTheWallColumn(): Design {
  const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  const records = derivePlacementRecords(KITCHEN_L_DESIGN, catalog);
  const result = setWidth({
    design: KITCHEN_L_DESIGN,
    catalog,
    columns: deriveColumns(records, {}, KITCHEN_L_DESIGN.room),
    target: { kind: "placement", id: "p8" },
    widthMm: RESIZED_WALL_COLUMN_WIDTH_MM,
    probe: createFakeProbe({ catalog }),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`resize refused: ${result.reason.code}`);
  return result.design;
}

describe("the MAX over a column, which decides how much of it has to be stale", () => {
  // With only `p8` stale, `p15`'s declared 400 wins §3.2's MAX and the column is already right before any command
  // runs, so a test seating one body passes while the defect stands.
  it("is rescued by a deeper sibling when one member alone carries a stale seat", () => {
    const oneStale = withSeatsWrittenAtTheShallowDepth(["p8"]);

    expect(columnDepthMm(oneStale, DEEPER_MM, "A|0.30")).toBe(
      wallCarcassDepthMm(DEEPER_MM),
    );
    expect(
      columnDepthMm(changeTo(oneStale, DEEPER_MM), DEEPER_MM, "A|0.30"),
    ).toBe(wallCarcassDepthMm(DEEPER_MM));
  });

  // With every member stale no sibling rescues the MAX and the column the command plans against publishes the
  // shallow setting's row: the input the fix has to be right on.
  it("deepens the column whose every member carries one, which no sibling can rescue", () => {
    const wholeColumn = withSeatsWrittenAtTheShallowDepth(["p8", "p15"]);
    expect(columnDepthMm(wholeColumn, DEEPER_MM, "A|0.30")).toBe(
      wallCarcassDepthMm(DEFAULT_CABINET_DEPTH_MM),
    );

    const deepened = changeTo(wholeColumn, DEEPER_MM);

    expect(columnDepthMm(deepened, DEEPER_MM, "A|0.30")).toBe(
      wallCarcassDepthMm(DEEPER_MM),
    );
    for (const id of ["p8", "p15"]) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEPER_MM));
    }
  });
});

describe("what the clearing must not reach", () => {
  // A `manufactured-size` body's seat is a fact about a real machine, not the setting, so it survives and keeps
  // its share of the MAX; clearing every seat instead of the declared ones fails here.
  it("leaves a manufactured size carrying its seat and its whole share of the MAX", () => {
    const fridgeBefore = bodyOf(KITCHEN_L_DESIGN, "p7");

    for (const design of [
      changeTo(KITCHEN_L_DESIGN, DEEPER_MM),
      changeTo(changeTo(KITCHEN_L_DESIGN, DEFAULT_CABINET_DEPTH_MM), DEEPER_MM),
      [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM, DEEPER_MM].reduce(
        changeTo,
        KITCHEN_L_DESIGN,
      ),
    ]) {
      expect(bodyOf(design, "p7")).toStrictEqual(fridgeBefore);
      // The key is resolved off the design because wall B's columns slide along the wall when the corner deepens.
      expect(
        columnDepthMm(design, DEEPER_MM, columnKeyOf(design, DEEPER_MM, "p7")),
      ).toBe(742);
    }
  });

  // The three deep tops on every path: their depth is answered by `columnBuildDepthM`'s lifted arm because each
  // hangs over a full-height column (ADR 0101), so a walked route leaves them at the cabinet-depth line and a
  // route back through 600 returns them to it.
  it("lands the three deep tops on the cabinet-depth line, on every path", () => {
    const deepTopIds = ["p22", "p23", "p24"] as const;

    const walked = [
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    ].reduce(changeTo, KITCHEN_L_DESIGN);
    const home = changeTo(walked, DEFAULT_CABINET_DEPTH_MM);

    for (const id of deepTopIds) {
      expect(seatMm(walked, id), id).toBe(DEEPER_MM - WALL_FRONT_ASSEMBLY_MM);
      // Deliberately not the map row: a wall body over a lifted column is deeper than a wall cabinet.
      expect(seatMm(walked, id), id).not.toBe(
        wallCarcassSeatDepthMm(DEEPER_MM),
      );
      expect(seatMm(home, id), id).toBe(
        DEFAULT_CABINET_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
      );
    }
  });

  // A `wall-cabinet` over a full-height column is built to the cabinet-depth line, not the map row, and 661 is a
  // number no catalogue field states, so it is recorded as a seat. It survives the clearing because
  // `resolveDepthM`'s lifted arm reads `column.hasFullHeightUnder`, never `column.d`. The witness is declared here
  // rather than borrowed from the seeded kitchen: its ability to fail must not depend on which bodies the demo
  // carries (ADR 0093 decision 2).
  it("rebuilds a wall cabinet over a full-height column to the cabinet-depth line", () => {
    const overTheOvenTower = withAFollowingTopOverTheOvenTower();

    const settled = changeTo(overTheOvenTower, DEFAULT_CABINET_DEPTH_MM);
    expect(seatMm(settled, "p22")).toBe(
      DEFAULT_CABINET_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
    );

    // From the state the fix is about: the body already carries the shallow setting's own lifted seat.
    const deepened = changeTo(settled, DEEPER_MM);

    expect(seatMm(deepened, "p22")).toBe(DEEPER_MM - WALL_FRONT_ASSEMBLY_MM);
    expect(seatMm(deepened, "p22")).not.toBe(wallCarcassSeatDepthMm(DEEPER_MM));
  });
});

/** The fixture with `p22`, the deep top over the oven tower in `B|1.20`, swapped for an ordinary top at the same
 *  width and height: both rows follow the setting, but a different arm answers (ADR 0101). */
function withAFollowingTopOverTheOvenTower(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === "p22"
        ? {
            ...placement,
            body: { ...placement.body, buildId: "wall-2door-600-top" },
          }
        : placement,
    ),
  };
}

describe("arrival at a depth, whatever path reached it", () => {
  // Not a claim that a round trip is byte-equal (ADR 0073): frozen extents are outside this comparison. The claim
  // is narrower: the seats and columns at the terminal depth are those the straight path from the seatless fixture
  // writes. A property over the ordering, because the defect is a function of it.
  propertyTest.prop([
    fc.array(fc.constantFrom(DEFAULT_CABINET_DEPTH_MM, DEEPER_MM), {
      minLength: 1,
      maxLength: 4,
    }),
  ])(
    "writes the seats and columns of the straight path to the same depth",
    (sequence: readonly number[]) => {
      const terminalMm = sequence.at(-1);
      if (terminalMm === undefined) {
        throw new Error("the generator must produce at least one change");
      }

      const walked = sequence.reduce(changeTo, KITCHEN_L_DESIGN);
      const straight = changeTo(KITCHEN_L_DESIGN, terminalMm);

      expect(seatsById(walked)).toEqual(seatsById(straight));
      expect(columnDepthsMm(walked, terminalMm)).toEqual(
        columnDepthsMm(straight, terminalMm),
      );
    },
  );

  // The columns that must not move: the simulation has these five byte-identical between the broken and the fixed
  // command, so a fix widening past the declared entries shows up here.
  it("moves only the two columns the defect reaches", () => {
    const walked = [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM, DEEPER_MM].reduce(
      changeTo,
      KITCHEN_L_DESIGN,
    );

    const depths = columnDepthsMm(walked, DEEPER_MM);
    for (const [memberId, depthMm] of UNTOUCHED_DEPTHS_AT_700_MM) {
      const key = columnKeyOf(walked, DEEPER_MM, memberId);
      expect(depths.get(key), `${memberId} in ${key}`).toBe(depthMm);
    }
    // `p9`'s column: its number is the real probe's to state but its stability is this suite's; both sides resolve
    // the key off their own design because the two paths put that column in the same place.
    const straight = changeTo(KITCHEN_L_DESIGN, DEEPER_MM);
    expect(depths.get(columnKeyOf(walked, DEEPER_MM, "p9"))).toBe(
      columnDepthsMm(straight, DEEPER_MM).get(
        columnKeyOf(straight, DEEPER_MM, "p9"),
      ),
    );
    // The two that may move, so the assertion above is not a claim that nothing moved at all.
    for (const key of STUCK_KEYS) {
      expect(depths.get(key), key).toBe(wallCarcassDepthMm(DEEPER_MM));
    }
  });
});

describe("what a stored document is owed", () => {
  it("accepts a document carrying stale seats without touching the one it was given", () => {
    const stale = withSeatsWrittenAtTheShallowDepth([...STUCK_PLACEMENT_IDS]);
    const asHandedIn: unknown = JSON.parse(JSON.stringify(stale));

    const result = setCabinetDepth({
      design: stale,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: DEEPER_MM,
      probeAt: PROBE_AT,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(stale))).toEqual(asHandedIn);
  });
});
