// ADR 0031: a resize moves a whole column and adjacent empty space funds it. A growth needs a delete first, because
// the shipped kitchen derives no voids at load; a shrink funds itself (ADR 0035 decision 7).
// Rows assert every member plus the empty column: "the column grew" and "the run total is conserved" are different
// claims, and only the second makes an overlap unrepresentable.
import { describe, expect, it } from "vitest";

import { entryLabel, labelWithDoors } from "../../src/catalog.js";

import { setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement, Handle } from "../../src/design.js";
import type { Finish } from "../../src/materials.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  derivePlacementRecords,
  type PlacementRecord,
} from "../../src/void-engine.js";
import { clearBodies, OCCURRED_AT, resizeTo } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";
import { LEGACY_ENUM_FINISHES } from "../../src/materials.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

function recordOf(design: Design, placementId: string): PlacementRecord {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record for ${placementId}`);
  return record;
}

/** The along-wall span a body occupies, in millimetres — the pair of numbers a boundary move is
 *  entirely about. */
function spanMm(design: Design, placementId: string): [number, number] {
  const record = recordOf(design, placementId);
  const centreMm =
    1000 * (record.wall === "A" ? record.frame.x : record.frame.z);
  return [centreMm - record.widthMm / 2, centreMm + record.widthMm / 2];
}

function widthOf(design: Design, placementId: string): number {
  return recordOf(design, placementId).widthMm;
}

// A run of columns stacked base / wall / top, so one column can be cleared and its neighbour grown into the space.

type Level = "base" | "wall" | "top";

const LEVEL_GEOMETRY: Readonly<
  Record<Level, { readonly y0Mm: number; readonly heightMm: number }>
> = {
  base: { y0Mm: 0, heightMm: 820 },
  wall: { y0Mm: 1500, heightMm: 700 },
  top: { y0Mm: 2200, heightMm: 400 },
};

/** Entries whose §7 equivalents are all `widthFlex: 'fit'` on the standard set, so a column of them intersects to
 *  {400, 600, 800} and both directions of the rule are reachable. A base member is always present: §7's base carcass
 *  reaches the 860 mm worktop line. The top row is a shelf, not a seeded `-top` cabinet, which resolves `wall-2door`
 *  ({600, 800}) and could only be exercised in one direction. */
const DEFAULT_LEVELS: Readonly<Record<Level, string>> = {
  base: "base-drawer2-600",
  wall: "open-shelf-600",
  top: "open-shelf-600",
};

interface ColumnSpec {
  readonly id: string;
  readonly alongMm: number;
  readonly widthMm: number;
  /** Overrides per level. A level named here with `undefined` is omitted from the column. */
  readonly levels?: Partial<Record<Level, string | undefined>>;
  readonly finish?: Finish;
  readonly handle?: Handle;
}

function levelsOf(spec: ColumnSpec): readonly (readonly [Level, string])[] {
  const levels = { ...DEFAULT_LEVELS, ...spec.levels };
  return (Object.keys(LEVEL_GEOMETRY) as Level[])
    .filter((level) => levels[level] !== undefined)
    .map((level) => [level, levels[level] ?? ""] as const);
}

function memberIdsOf(spec: ColumnSpec): readonly string[] {
  return levelsOf(spec).map(([level]) => `${spec.id}-${level}`);
}

function placementsOf(spec: ColumnSpec): DesignPlacement[] {
  return levelsOf(spec).map(([level, buildId]) => ({
    id: `${spec.id}-${level}`,
    wall: "A" as const,
    alongMm: spec.alongMm,
    y0Mm: LEVEL_GEOMETRY[level].y0Mm,
    body: {
      buildId,
      widthMm: spec.widthMm,
      heightMm: LEVEL_GEOMETRY[level].heightMm,
      ...(spec.finish === undefined ? {} : { finish: spec.finish }),
      ...(spec.handle === undefined ? {} : { handle: spec.handle }),
    },
  }));
}

function runWorld(specs: readonly ColumnSpec[]): KitchenWorld {
  return syntheticWorld(specs.flatMap(placementsOf));
}

/** A run whose columns are frozen from the whole design and then emptied through the real delete, the only way to
 *  produce the empty column ADR 0031 spends. */
function runWithEmptyColumn(
  specs: readonly ColumnSpec[],
  emptyId: string,
): KitchenWorld {
  const empty = specs.find((spec) => spec.id === emptyId);
  if (!empty) throw new Error(`No column ${emptyId} in the fixture`);
  return clearBodies(runWorld(specs), memberIdsOf(empty));
}

/** Two columns of three members each, meeting at 1600 mm, with the right-hand one emptied. */
function pairWithEmptyRight(
  leftWidthMm = 600,
  rightWidthMm = 600,
): KitchenWorld {
  return runWithEmptyColumn(
    [
      { id: "L", alongMm: 1600 - leftWidthMm / 2, widthMm: leftWidthMm },
      { id: "R", alongMm: 1600 + rightWidthMm / 2, widthMm: rightWidthMm },
    ],
    "R",
  );
}

describe("ADR 0031 rule 1 — the scope is the column, not the level", () => {
  it("moves every member of the column to the new width and the same new centre", () => {
    const world = pairWithEmptyRight();

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["L-base", "L-wall", "L-top"]) {
      expect(widthOf(result.design, id)).toBe(800);
      expect(spanMm(result.design, id)).toEqual([1000, 1800]);
    }
    expect(result.effect.columnPlacementIds).toEqual([
      "L-base",
      "L-wall",
      "L-top",
    ]);
  });

  it("gives the same design whichever member of the column is selected", () => {
    const fromBase = resizeTo(pairWithEmptyRight(), "L-base", 800);
    const fromTop = resizeTo(pairWithEmptyRight(), "L-top", 800);

    expect(fromBase.ok && fromTop.ok).toBe(true);
    if (!fromBase.ok || !fromTop.ok) return;
    expect(fromTop.design.placements).toEqual(fromBase.design.placements);
  });

  it("leaves every body outside the column byte-identical (rule 6)", () => {
    const world = runWithEmptyColumn(
      [
        { id: "F", alongMm: 700, widthMm: 600 },
        { id: "L", alongMm: 1300, widthMm: 600 },
        { id: "R", alongMm: 1900, widthMm: 600 },
      ],
      "R",
    );
    const untouched = world.design.placements.filter((placement) =>
      placement.id.startsWith("F-"),
    );

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.design.placements.filter((placement) =>
        placement.id.startsWith("F-"),
      ),
    ).toEqual(untouched);
  });
});

describe("ADR 0031 rules 2–4 — the empty column funds it and resizes with it", () => {
  it("narrows the empty column when the run grows, conserving the total", () => {
    const world = pairWithEmptyRight();

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(spanMm(result.design, "L-base")[0]).toBe(1000);
    expect(result.effect.emptyColumnWidthMm).toBe(400);
    const empty = result.effect.columns.get("A|2.00");
    expect(empty?.w).toBeCloseTo(0.4, 9);
    expect(empty?.x).toBeCloseTo(2.0, 9);
  });

  it("widens the empty column when the run shrinks", () => {
    const world = pairWithEmptyRight();

    const result = resizeTo(world, "L-base", 400);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(spanMm(result.design, "L-base")).toEqual([1000, 1400]);
    expect(result.effect.emptyColumnWidthMm).toBe(800);
    expect(result.effect.columns.get("A|1.80")?.w).toBeCloseTo(0.8, 9);
  });

  it("resizes the empty column at every level, not only the one that was edited", () => {
    const world = pairWithEmptyRight();

    const result = resizeTo(world, "L-top", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const openings = [...result.effect.columns.values()].filter(
      (column) => column.key === "A|2.00",
    );
    expect(openings.map((column) => column.w)).toEqual([0.4]);
  });

  it("takes the space on the left when there is none on the right", () => {
    const world = runWithEmptyColumn(
      [
        { id: "L", alongMm: 1300, widthMm: 600 },
        { id: "R", alongMm: 1900, widthMm: 600 },
      ],
      "L",
    );

    const result = resizeTo(world, "R-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(spanMm(result.design, "R-base")).toEqual([1400, 2200]);
    expect(result.effect.emptyColumnWidthMm).toBe(400);
  });

  it("removes the empty column when the resize consumes it exactly", () => {
    const world = runWithEmptyColumn(
      [
        { id: "L", alongMm: 1300, widthMm: 600 },
        { id: "R", alongMm: 1700, widthMm: 200 },
      ],
      "R",
    );

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(0);
    expect(result.effect.columns.has("A|1.70")).toBe(false);
    expect(spanMm(result.design, "L-base")).toEqual([1000, 1800]);
  });
});

describe("ADR 0031 rule 5 — a column's widths are the intersection of its members' sets", () => {
  /** A 600 mm wall cabinet with an empty column beside it — the state a narrowing resize needs. */
  const wallColumnWithEmptyRight = () =>
    runWithEmptyColumn(
      [
        {
          id: "L",
          alongMm: 1300,
          widthMm: 600,
          levels: { wall: "wall-2door-600" },
        },
        { id: "R", alongMm: 1900, widthMm: 600 },
      ],
      "R",
    );

  it("takes a wall column to 400, where its cabinet becomes a one-door (ADR 0033)", () => {
    const world = wallColumnWithEmptyRight();

    const result = resizeTo(world, "L-wall", 400);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    const resized = after.records.find(
      (record) => record.id === result.effect.placementId,
    );
    expect(resized?.widthMm).toBe(400);
    expect(
      describeSelection({
        kitchenSettings: {},
        ...after,
        target: { kind: "placement", id: resized?.id ?? "" },
      })?.label,
    ).toEqual(labelWithDoors(entryLabel("wall-cabinet"), 1));
  });

  // §11 row 14 depends on this: a column holding the 450/600 dishwasher can only match at 450 if the `wall-cabinet`
  // above it can be built there.
  it("accepts 450, the width ADR 0030's retired cap used to forbid", () => {
    const result = resizeTo(wallColumnWithEmptyRight(), "L-wall", 450);

    expect(result.ok).toBe(true);
  });

  it("accepts 500, where two doors now start", () => {
    const result = resizeTo(wallColumnWithEmptyRight(), "L-wall", 500);
    expect(result.ok).toBe(true);
  });

  it("intersects the dishwasher's own set with its neighbours' (§11 row 14)", () => {
    const world = runWithEmptyColumn(
      [
        {
          id: "L",
          alongMm: 1300,
          widthMm: 600,
          levels: { base: "base-dishwasher-600" },
        },
        { id: "R", alongMm: 1900, widthMm: 600 },
      ],
      "R",
    );

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "WIDTH_NOT_SUPPORTED") {
      expect.unreachable("expected WIDTH_NOT_SUPPORTED");
    }
    // The dishwasher's `[450, 600]` is a discrete bound (ADR 0035 decision 3), so 800 is out however wide the shelves
    // above it could go; 450 is in and the shelves follow it there.
    expect(result.reason.params.sizesMm).toEqual([450, 600]);
    expect(resizeTo(world, "L-base", 450).ok).toBe(true);
  });

  it("refuses the width the column already sits at", () => {
    const result = resizeTo(pairWithEmptyRight(), "L-base", 600);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("WIDTH_UNCHANGED");
  });
});

describe("ADR 0031 — when there is no empty space to spend", () => {
  it("refuses growth on the shipped kitchen at load, naming both sides", () => {
    // Growth still has no space to consume at load (a shrink makes its own, ADR 0035 decision 7). `A|0.75` holds
    // `p10` and `p16`, both 300 mm cabinetry, with an occupied column hard against each side.
    const result = resizeTo(kitchen(), "p10", 350);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides).toEqual([
      { side: "right", reason: "absent" },
      { side: "left", reason: "absent" },
    ]);
    expect(result.reason.params.deltaMm).toBe(50);
  });

  it("does not count a column that is empty only at the level being edited", () => {
    const world = clearBodies(
      runWorld([
        { id: "L", alongMm: 1300, widthMm: 600 },
        { id: "R", alongMm: 1900, widthMm: 600 },
      ]),
      ["R-wall", "R-top"],
    );

    const result = resizeTo(world, "L-wall", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides).toEqual([
      { side: "right", reason: "absent" },
      { side: "left", reason: "absent" },
    ]);
  });

  it("does not spend an empty column on the other wall", () => {
    // Both walls originate at the same corner. Emptying `B|1.20` frees 0.90-1.50 along wall B while `A|0.75` presents
    // its right edge at exactly 0.90 along wall A, so without the wall test in `findAdjacentEmptyColumn` this growth
    // would be funded from a column around the corner. A growth, because a shrink needs no neighbour and would pass
    // without exercising the guard.
    const world = clearBodies(kitchen(), ["p5", "p22"]);

    const result = resizeTo(world, "p10", 350);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("NO_EMPTY_SPACE");
  });
});

describe("a member that cannot change width stops the whole column", () => {
  it("names the member rather than the body that was selected", () => {
    const world = clearBodies(kitchen(), ["p4", "p14", "p20"]);

    const result = resizeTo(world, "p19", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "COLUMN_MEMBER_NOT_RESIZABLE") {
      expect.unreachable("expected COLUMN_MEMBER_NOT_RESIZABLE");
    }
    // ADR 0033: a refusal names the cabinet, not a door count; a resize has no settled width to derive one from.
    expect(result.reason.params.label).toEqual(entryLabel("wall-cabinet"));
    expect(result.reason.params.memberLabel).toEqual(
      entryLabel("base-hob-2drawer"),
    );
  });

  it("refuses the selected body itself when it has no width to change", () => {
    // A corner return declares no catalogue equivalent (ADR 0022).
    const result = resizeTo(kitchen(), "p9", 600);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("NOT_RESIZABLE");
  });
});

describe("§11 row 11 is vacuous under ADR 0031, not false", () => {
  it("has no subject: nothing donates, so no corner or appliance can be made to", () => {
    // Nothing donates under ADR 0031, so the property that survives is that a structural body is never moved or
    // rebuilt by somebody else's resize.
    const world = clearBodies(kitchen(), ["p8", "p15"]);
    const corner = world.design.placements.find(
      (placement) => placement.id === "p25",
    );

    const result = resizeTo(world, "p10", 400);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.design.placements.find((placement) => placement.id === "p25"),
    ).toEqual(corner);
  });
});

describe("§11 rows 12 and 13 — appearance survives, for every member", () => {
  it("carries the chosen finish and handle through every rebuilt member", () => {
    const world = runWithEmptyColumn(
      [
        {
          id: "L",
          alongMm: 1300,
          widthMm: 600,
          // Three bodies that carry a front; a shelf and a hood declare `canFinish: false` and carry neither.
          levels: { wall: "wall-2door-600", top: "wall-2door-600-top" },
          finish: LEGACY_ENUM_FINISHES.sage,
          handle: "black",
        },
        { id: "R", alongMm: 1900, widthMm: 600 },
      ],
      "R",
    );

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["L-base", "L-wall", "L-top"]) {
      const placement = result.design.placements.find(
        (candidate) => candidate.id === id,
      );
      expect(placement?.body.finish).toEqual(LEGACY_ENUM_FINISHES.sage);
      expect(placement?.body.handle).toBe("black");
    }
  });

  it("leaves a top-row body with no chosen handle absent, so §6.5 still decides", () => {
    // An explicit `"push"` written into the placement would make the panel's default indistinguishable from a choice.
    const result = resizeTo(pairWithEmptyRight(), "L-base", 800);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const top = result.design.placements.find(
      (placement) => placement.id === "L-top",
    );
    expect(top?.body.handle).toBeUndefined();
  });
});

describe("a resize rebuilds through the declared catalogue equivalent", () => {
  it("migrates a seeded buildId, because no seeded id has a second width", () => {
    const world = clearBodies(kitchen(), ["p1", "p12", "p18"]);

    const result = resizeTo(world, "p0", 600);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.design.placements.find((placement) => placement.id === "p0")?.body
        .buildId,
    ).toBe("base-sink");
    expect(
      result.design.placements.find((placement) => placement.id === "p11")?.body
        .buildId,
    ).toBe("wall-cabinet");
    expect(result.effect.buildId).toBe("base-sink");
  });

  it("does not change any member's recorded depth", () => {
    const world = clearBodies(kitchen(), ["p1", "p12", "p18"]);

    const result = resizeTo(world, "p0", 600);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["p0", "p11", "p17"]) {
      expect(recordOf(result.design, id).frame.d).toBeCloseTo(
        recordOf(world.design, id).frame.d,
        9,
      );
    }
  });

  // A seeded base records its 820 mm carcass and §7's base row is 860, so the rebuild raises it once; the shelves
  // above build to the slots they already fill (see DEVELOPMENT-SPEC §5.4).
  it("keeps every member's module line and builds each at its §7 equivalent's height", () => {
    const world = pairWithEmptyRight();
    const lineAndHeightOf = (design: Design) =>
      ["L-base", "L-wall", "L-top"].map((id) => {
        const placement = design.placements.find(
          (candidate) => candidate.id === id,
        );
        return [id, placement?.y0Mm, placement?.body.heightMm];
      });

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(lineAndHeightOf(world.design)).toEqual([
      ["L-base", 0, 820],
      ["L-wall", 1500, 700],
      ["L-top", 2200, 400],
    ]);
    expect(lineAndHeightOf(result.design)).toEqual([
      ["L-base", 0, 860],
      ["L-wall", 1500, 700],
      ["L-top", 2200, 400],
    ]);
  });
});

describe("RESIZE_OPENS_GAP, re-stated: no opening where a body stands", () => {
  it("refuses a move that would offer an opening across the corner leg", () => {
    // Clear `A|1.30`, narrow `A|0.75` to 200: the empty column reaches 900 mm wide, with a base-level opening over the
    // floor `p25` stands in.
    const world = clearBodies(kitchen(), ["p0", "p11", "p17"]);

    const result = resizeTo(world, "p10", 200);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("RESIZE_OPENS_GAP");
  });

  it("still accepts the move in the other direction, which opens nothing", () => {
    const world = clearBodies(kitchen(), ["p0", "p11", "p17"]);
    const result = resizeTo(world, "p10", 400);
    expect(result.ok).toBe(true);
  });
});

/** Two 600 mm columns with one member of the left narrowed to `oddWidthMm` and the right emptied through the real
 *  delete: one column key holding two widths, reachable by inserting a 450 mm dishwasher into a 600 mm opening. */
function mixedWidthColumn(oddWidthMm: number): KitchenWorld {
  const run = runWorld([
    { id: "L", alongMm: 1300, widthMm: 600 },
    { id: "R", alongMm: 1900, widthMm: 600 },
  ]);
  return clearBodies(
    createWorld(
      {
        ...run.design,
        placements: run.design.placements.map((placement) =>
          placement.id === "L-wall"
            ? { ...placement, body: { ...placement.body, widthMm: oddWidthMm } }
            : placement,
        ),
      },
      KITCHEN_L_BODY_CATALOG,
    ),
    ["R-base", "R-wall", "R-top"],
  );
}

describe("ADR 0035 decision 6 — a column whose members are not flush is squared up", () => {
  it("brings every member to the requested width, the odd one included", () => {
    const result = resizeTo(mixedWidthColumn(450), "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["L-base", "L-wall", "L-top"]) {
      expect(widthOf(result.design, id)).toBe(800);
      // The union of the members' extents moves, so the held edge is the run's outer one at 1000, not the narrow
      // member's at 1075; measuring from anything narrower would spend 150 mm the 600 mm members stand in.
      expect(spanMm(result.design, id)).toEqual([1000, 1800]);
    }
  });

  it("squares up on a shrink too, and the odd member grows to meet it", () => {
    // 450 -> 500 is a growth for the member the customer sees, inside a shrink of the column that holds it.
    const result = resizeTo(mixedWidthColumn(450), "L-base", 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(widthOf(result.design, "L-wall")).toBe(500);
    expect(widthOf(result.design, "L-base")).toBe(500);
  });

  it("never produces an off-grid width, whatever the column is standing at", () => {
    // `refuseIllegalWidth` gates on `intersectColumnWidths`, built from `resolveBuildableSizes` (the 50 mm ladder), so
    // an off-grid width cannot come from the column's current extent. A 570 mm member, what corner returns are made
    // at, is the sharpest case.
    const world = mixedWidthColumn(570);

    for (const widthMm of [500, 550, 570, 600, 620, 650, 800]) {
      const result = resizeTo(world, "L-base", widthMm);
      if (!result.ok) continue;
      for (const id of ["L-base", "L-wall", "L-top"]) {
        expect(widthOf(result.design, id) % 50).toBe(0);
      }
    }

    for (const offGridMm of [570, 620]) {
      const result = resizeTo(world, "L-base", offGridMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
    }
  });
});

describe("refusals", () => {
  it("refuses a void selection", () => {
    const world = kitchen();
    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "void", id: "A|1.30:v0:0.00" },
      widthMm: 600,
      probe: createFakeProbe(),
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("VOID_SELECTED");
  });

  it("refuses a target that no longer exists", () => {
    const result = resizeTo(kitchen(), "does-not-exist", 600);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("TARGET_NOT_FOUND");
  });

  it("refuses an invalid occurredAt before touching anything", () => {
    const world = kitchen();
    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p0" },
      widthMm: 600,
      probe: createFakeProbe(),
      occurredAt: "not-a-timestamp",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
  });

  it("refuses when the rebuilt carcass does not come back at the requested size", () => {
    // §5.2's built-size re-check on every rebuild backs §9's promise that nothing is offered which cannot be satisfied.
    const world = pairWithEmptyRight();
    const result = resizeTo(
      world,
      "L-base",
      800,
      createFakeProbe({ carcassWidthM: 0.5 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("BUILT_SIZE_MISMATCH");
  });

  it("refuses when a rebuilt body cannot be measured", () => {
    const result = resizeTo(
      pairWithEmptyRight(),
      "L-base",
      800,
      createFakeProbe({ seatOffsetM: Number.NaN }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("MEASUREMENT_UNUSABLE");
  });

  it("writes nothing on a refused rebuild", () => {
    // The column is atomic: `refuse` returns the caller's own design object, so a failure at the third member
    // leaves nothing written.
    const world = pairWithEmptyRight();
    const result = resizeTo(
      world,
      "L-base",
      800,
      createFakeProbe({ carcassWidthM: 0.5 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.design).toBe(world.design);
  });

  it("returns the exact original design object on every refusal", () => {
    const world = kitchen();
    for (const [placementId, widthMm] of [
      ["p8", 800],
      // `p10` 300 -> 350 still refuses: growth has no space to consume in a kitchen at load.
      ["p10", 350],
      ["p2", 600],
      ["p1", 500],
    ] as const) {
      const result = resizeTo(world, placementId, widthMm);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.design).toBe(world.design);
    }
  });

  it("writes the caller's occurredAt to updatedAt only on success", () => {
    const result = resizeTo(pairWithEmptyRight(), "L-base", 800);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
  });
});
