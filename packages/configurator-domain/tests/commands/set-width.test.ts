// ADR 0031 — a resize moves a whole column, and adjacent empty space funds it.
//
// **Every test of a successful resize needs a delete in front of it.** The shipped kitchen derives
// zero voids at load, so nothing is resizable until something is cleared; that is a consequence the
// ADR accepts deliberately, and it is why these fixtures all start by emptying a column.
//
// Each row asserts the widths and the two edges that must not move on **every** member of the
// column plus the empty one, because "the column grew" and "the run total is conserved" are
// different claims and only the second makes an overlap unrepresentable.
import { describe, expect, it } from "vitest";

import { setWidth } from "../../src/commands/set-width.js";
import type {
  Design,
  DesignPlacement,
  Finish,
  Handle,
} from "../../src/design.js";
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
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

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

// ---------------------------------------------------------------------------
// A run of columns, each stacked base / wall / top, so a whole column can be cleared and the one
// beside it grown into the space. The shipped kitchen has exactly one shape like this and no empty
// column at all, so the rule is exercised here and confirmed against the shipped bodies below.
// ---------------------------------------------------------------------------

type Level = "base" | "wall" | "top";

const LEVEL_GEOMETRY: Readonly<
  Record<Level, { readonly y0Mm: number; readonly heightMm: number }>
> = {
  base: { y0Mm: 0, heightMm: 820 },
  wall: { y0Mm: 1500, heightMm: 700 },
  top: { y0Mm: 2200, heightMm: 400 },
};

/** Entries whose §7 equivalents are all `widthFlex: 'fit'` on the standard set, so a column of them
 *  intersects to {400, 600, 800} and both directions of the rule are reachable. A base member is
 *  always present: §7's base carcass reaches the 860 mm worktop line, and a wall-only column has no
 *  room for one to be rebuilt into.
 *
 *  The top row is a shelf rather than one of the seeded `-top` cabinets on purpose. Those resolve
 *  `wall-2door`, whose set ADR 0029 narrowed to {600, 800} — a correct column, but one that can only
 *  ever be exercised in one direction. The shipped bodies are used where the rule is confirmed
 *  against the real kitchen further down. */
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

/** A run whose columns are frozen from the whole design and then emptied through the real delete —
 *  the only way to produce the empty column ADR 0031 spends, and the same route a customer takes. */
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
    // The customer taps a cabinet; the rule is about the column it stands in. Selecting the top
    // row and selecting the base must not be two different operations.
    const fromBase = resizeTo(pairWithEmptyRight(), "L-base", 800);
    const fromTop = resizeTo(pairWithEmptyRight(), "L-top", 800);

    expect(fromBase.ok && fromTop.ok).toBe(true);
    if (!fromBase.ok || !fromTop.ok) return;
    expect(fromTop.design.placements).toEqual(fromBase.design.placements);
  });

  it("leaves every body outside the column byte-identical (rule 6)", () => {
    // The property the whole rule exists for: no cabinet is ever resized as a side effect of
    // editing another one.
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
    // The column's outer edge — away from the empty space — holds, and so does the empty column's
    // far edge. The single boundary between them absorbs the whole delta.
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
    // Rule 4. The empty column has no members to move, so the claim is about its extent: one width
    // and one centre, which every level of it derives its openings from.
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
    // The run's right edge holds; the empty column's left edge holds.
    expect(spanMm(result.design, "R-base")).toEqual([1400, 2200]);
    expect(result.effect.emptyColumnWidthMm).toBe(400);
  });

  it("removes the empty column when the resize consumes it exactly", () => {
    // ADR 0031 rule 6's other half: exactly to zero is allowed, and the key goes.
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
  it("cannot go below 600 while the column holds a two-door (ADR 0029)", () => {
    // `open-shelf` offers 400; `wall-2door` does not. The column offers what both can be built at.
    const world = runWithEmptyColumn(
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

    const result = resizeTo(world, "L-wall", 400);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "WIDTH_NOT_SUPPORTED") {
      expect.unreachable("expected WIDTH_NOT_SUPPORTED");
    }
    expect(result.reason.params.sizesMm).toEqual([600, 800]);
  });

  it("is not narrowed by a `widthFlex: 'fit'` member above its floor", () => {
    // Three `'fit'` bodies on the standard set intersect to the standard set: 400 stays reachable.
    const result = resizeTo(pairWithEmptyRight(), "L-base", 400);
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
    // §11 row 14 read through ADR 0031 rule 5: the dishwasher's `[450, 600]` is a **bound** — a
    // niche is made in exactly two sizes — so 800 is out of the column however wide the shelves
    // above it could go. 450 is in, and the shelves follow it there: their `[400, 600, 800]` is the
    // standard ladder, not a claim that a shelf cannot be 450 (FINDING Q1.3).
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
  it("refuses every chip on the shipped kitchen at load, naming both sides", () => {
    // The consequence the ADR accepts: `recomputeVoids` returns nothing at load, so nothing is
    // resizable until the customer deletes something first.
    const result = resizeTo(kitchen(), "p0", 600);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides).toEqual([
      { side: "right", reason: "absent" },
      { side: "left", reason: "absent" },
    ]);
    expect(result.reason.params.deltaMm).toBe(-200);
  });

  it("refuses growth that would leave the empty column under MIN_W", () => {
    const world = pairWithEmptyRight(600, 400);

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides[0]).toEqual({
      side: "right",
      reason: "remainder_below_floor",
    });
  });

  it("refuses growth larger than the empty column", () => {
    const world = pairWithEmptyRight(400, 300);

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "NO_EMPTY_SPACE") {
      expect.unreachable("expected NO_EMPTY_SPACE");
    }
    expect(result.reason.params.sides[0]).toEqual({
      side: "right",
      reason: "too_narrow",
    });
  });

  it("does not count a column that is empty only at the level being edited", () => {
    // ADR 0031's third coordinator detail: the resize moves all levels, so the space must be free
    // at all of them.
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
    // Both walls originate at the same corner, so a wall-B column can sit at the same along-wall
    // coordinate as a wall-A one without being anywhere near it.
    const world = clearBodies(kitchen(), ["p5", "p22"]);

    const result = resizeTo(world, "p0", 600);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("NO_EMPTY_SPACE");
  });
});

describe("a member that cannot change width stops the whole column", () => {
  it("names the member rather than the body that was selected", () => {
    // The customer tapped the top cabinet; what is in the way is the hob base three levels down.
    const world = clearBodies(kitchen(), ["p4", "p14", "p20"]);

    const result = resizeTo(world, "p19", 800);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason.code !== "COLUMN_MEMBER_NOT_RESIZABLE") {
      expect.unreachable("expected COLUMN_MEMBER_NOT_RESIZABLE");
    }
    expect(result.reason.params.label).toBe("Corp suspendat 2 uși");
    expect(result.reason.params.memberLabel).toBe("Corp plită și 2 sertare");
    expect(result.reason.message).toContain("Corp plită și 2 sertare");
  });

  it("refuses the selected body itself when it has no width to change", () => {
    // §9's `canWidth` from the engine's end. A corner return declares no catalogue equivalent
    // (ADR 0022), which is the correct answer for it rather than a missing one.
    const result = resizeTo(kitchen(), "p9", 600);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("NOT_RESIZABLE");
  });
});

describe("§11 row 11 is vacuous under ADR 0031, not false", () => {
  it("has no subject: nothing donates, so no corner or appliance can be made to", () => {
    // The row read "corners and appliances never donate". There is no donor any more — the width
    // comes from empty space — so the rule it stated cannot be violated. What survives, and is
    // asserted here, is the stronger property it existed to protect: a structural body is never
    // moved or rebuilt by somebody else's resize.
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
    // The recorded defect: resizing silently reset a sage door with black bars to white with
    // steel. Under column scope it must not do so at any level.
    const world = runWithEmptyColumn(
      [
        {
          id: "L",
          alongMm: 1300,
          widthMm: 600,
          // Three bodies that all carry a front, so all three have a finish and a handle to
          // preserve. A shelf and a hood declare `canFinish: false` and correctly carry neither.
          levels: { wall: "wall-2door-600", top: "wall-2door-600-top" },
          finish: "sage",
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
      expect(placement?.body.finish).toBe("sage");
      expect(placement?.body.handle).toBe("black");
    }
  });

  it("leaves a top-row body with no chosen handle absent, so §6.5 still decides", () => {
    // Row 13: choice beats default, default beats nothing. An explicit `"push"` written into the
    // placement would make the panel's default indistinguishable from a choice.
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
    ).toBe("wall-2door");
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

  it("does not change any member's module line or height", () => {
    const world = pairWithEmptyRight();

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ["L-base", "L-wall", "L-top"]) {
      expect(recordOf(result.design, id).frame.y0).toBe(
        recordOf(world.design, id).frame.y0,
      );
    }
  });
});

describe("RESIZE_OPENS_GAP, re-stated: no opening where a body stands", () => {
  it("refuses a move that would offer an opening across the corner leg", () => {
    // Measured on the shipped kitchen. Clear `A|1.30`, narrow `A|0.75` to 200, and the empty
    // column reaches 900 mm wide — with a base-level opening over the stretch of floor `p25` is
    // standing in. The refusal is what keeps the customer's empty slots all real.
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

describe("a column whose members are not flush", () => {
  it("refuses rather than silently squaring it up", () => {
    // Reachable: a 450 mm dishwasher inserted into a 600 mm column's opening leaves one key
    // holding two widths. There is no single boundary to move, and moving both would resize a body
    // nobody selected — which is the one thing ADR 0031 exists to prevent.
    const run = runWorld([
      { id: "L", alongMm: 1300, widthMm: 600 },
      { id: "R", alongMm: 1900, widthMm: 600 },
    ]);
    const mixed = clearBodies(
      createWorld(
        {
          ...run.design,
          placements: run.design.placements.map((placement) =>
            placement.id === "L-wall"
              ? { ...placement, body: { ...placement.body, widthMm: 450 } }
              : placement,
          ),
        },
        KITCHEN_L_BODY_CATALOG,
      ),
      ["R-base", "R-wall", "R-top"],
    );

    const result = resizeTo(mixed, "L-base", 800);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("COLUMN_MEMBERS_UNALIGNED");
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
    // §5.2's built-size re-check, applied to every rebuild: the backstop behind §9's promise that
    // nothing is offered which cannot be satisfied.
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
    // The column is atomic: a rebuild that fails at the third member must not leave the first two
    // written. `refuse` returns the caller's own design object, which is the strongest form of it.
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
      ["p0", 600],
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
