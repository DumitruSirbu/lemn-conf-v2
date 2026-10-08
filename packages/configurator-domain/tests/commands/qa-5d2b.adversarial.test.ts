import { describe, expect, it } from "vitest";

import type { DesignPlacement, DesignWall } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../../src/queries/offers.js";
import type {
  Column,
  PlacementRecord,
  VoidRecord,
} from "../../src/void-engine.js";
import { clearBodies, resizeTo } from "../support/commands.js";
import { extentOf } from "../support/column-extents.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

function placement(
  id: string,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall: "A", alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

const OVERLAP_EPSILON_M = 1e-6;

// `Column["wall"]` includes "C"; ADR 0132 decision 1 keeps wall C's along on world `z`, like wall B's, so the
// `wall === "A" ? x : z` split stays correct for every wall.
function alongOf(
  wall: DesignWall,
  at: { readonly x: number; readonly z: number },
): number {
  return wall === "A" ? at.x : at.z;
}

function spansOverlap(
  leftCentre: number,
  leftSize: number,
  rightCentre: number,
  rightSize: number,
): number {
  return (
    Math.min(leftCentre + leftSize / 2, rightCentre + rightSize / 2) -
    Math.max(leftCentre - leftSize / 2, rightCentre - rightSize / 2)
  );
}

function totalOn(
  columns: ReadonlyMap<string, Column>,
  wall: "A" | "B",
): number {
  return [...columns.values()]
    .filter((column) => column.wall === wall)
    .reduce((sum, column) => sum + Math.round(column.w * 1e6) / 1e3, 0);
}

/** Every key in the map is the key its own geometry derives, asked of the whole map rather than of the one
 *  key the collision guard checks. */
function findMiskeyedColumns(columns: ReadonlyMap<string, Column>): string[] {
  const violations: string[] = [];
  for (const [key, column] of columns) {
    const alongM = alongOf(column.wall, column);
    const derived = `${column.wall === "B" ? "B|" : "A|"}${alongM.toFixed(2)}`;
    if (key !== column.key) {
      violations.push(`map key ${key} holds a column keyed ${column.key}`);
    }
    if (derived !== column.key) {
      violations.push(
        `${column.key} sits at ${alongM.toFixed(3)}, which derives ${derived}`,
      );
    }
  }
  return violations;
}

/** Bodies standing inside a derived opening, **whatever column either belongs to** — the fact
 *  `RESIZE_OPENS_GAP` exists to prevent, asked of the world rather than of one column. */
function bodiesInOpenings(
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
): string[] {
  const found: string[] = [];
  for (const opening of voids) {
    for (const record of records) {
      if (record.wall !== opening.wall) continue;
      const along = spansOverlap(
        alongOf(record.wall, record.frame),
        record.frame.w,
        alongOf(opening.wall, opening),
        opening.w,
      );
      const up = spansOverlap(
        record.frame.y0 + record.frame.h / 2,
        record.frame.h,
        opening.y0 + opening.h / 2,
        opening.h,
      );
      if (along > OVERLAP_EPSILON_M && up > OVERLAP_EPSILON_M) {
        found.push(`${record.id} in ${opening.col}@${opening.y0.toFixed(2)}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/** Two solid bodies in the same place (§3.1 read across columns); the hood exemption is the first rule that
 *  can produce it. */
function findInterpenetratingBodies(
  records: readonly PlacementRecord[],
): string[] {
  const found: string[] = [];
  for (const left of records) {
    for (const right of records) {
      if (left.id >= right.id) continue;
      if (left.wall !== right.wall) continue;
      const along = spansOverlap(
        alongOf(left.wall, left.frame),
        left.frame.w,
        alongOf(right.wall, right.frame),
        right.frame.w,
      );
      const up = spansOverlap(
        left.frame.y0 + left.frame.h / 2,
        left.frame.h,
        right.frame.y0 + right.frame.h / 2,
        right.frame.h,
      );
      if (along > OVERLAP_EPSILON_M && up > OVERLAP_EPSILON_M) {
        found.push(
          `${left.id} and ${right.id} interpenetrate by ${(along * 1000).toFixed(0)} mm`,
        );
      }
    }
  }
  return found;
}

/** The widths §9 can render for a body of the shipped kitchen, stepped as ADR 0035 decision 2
 *  publishes them. Wide enough to cover every chip any member offers. */
const STEPS = [200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800];

// §3.2's key is a position and two columns cannot hold one, so a colliding resize is refused, not overwritten.
describe("FINDING A — the resized column's new key must not replace another column", () => {
  // §3.2's columns may overlap along the wall: a 600 mm base run at 1000 (700–1300) and a 300 mm wall unit at
  // 950 (800–1100), filed under `A|1.00` and `A|0.95`. Shrinking the base run to 500 holds its left edge and
  // puts its new centre at 950, the wall unit's own column.
  function overlappingColumns(): KitchenWorld {
    return syntheticWorld([
      placement("base-run", 1000, 0, "base-panbank", 600, 860),
      placement("wall-unit", 950, 1500, "wall-cabinet", 300, 700),
    ]);
  }

  it("starts from two distinct columns", () => {
    expect([...overlappingColumns().columns.keys()].sort()).toEqual([
      "A|0.95",
      "A|1.00",
    ]);
  });

  it("refuses rather than losing the wall unit's frozen column", () => {
    // The wall unit was neither resized nor moved, so its frozen extent must come through untouched (ADR 0011 Gap D).
    const world = overlappingColumns();
    const before = world.columns.get("A|0.95");

    const result = resizeTo(world, "base-run", 500);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_KEY_COLLISION");
    const untouched = world.columns.get("A|0.95");
    expect(untouched && extentOf(untouched)).toEqual(
      before && extentOf(before),
    );
  });

  it("does the same thing on a growth, so the hole predates decision 7", () => {
    // The guard on the created strip does not cover the resized column's own key: a growth consuming an empty
    // column that was already there reaches the same collision (ADR 0031).
    const world = clearBodies(
      syntheticWorld([
        placement("run-base", 1000, 0, "base-panbank", 300, 860),
        placement("wall-unit", 1050, 1500, "wall-cabinet", 300, 700),
        placement("gap-base", 1450, 0, "base-panbank", 600, 860),
      ]),
      ["gap-base"],
    );
    const before = totalOn(world.columns, "A");

    const result = resizeTo(world, "run-base", 400);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_KEY_COLLISION");
    expect(totalOn(world.columns, "A")).toBe(before);
  });
});

describe("FINDING B — the hood exemption must not let a real phantom opening through", () => {
  // The exemption is scoped to the hoods of the column being resized, so a hood in another column stays visible
  // to the phantom check. A 600 mm run at 1000 (700–1300); an empty column at 1600 (1300–1900); a hood in its own
  // overlapping column at 950 (650–1250). Shrinking the run to 300 would widen the empty column to 1000–1900,
  // 250 mm of it over the hood.
  function hoodBesideEmptySpace(): KitchenWorld {
    return clearBodies(
      syntheticWorld([
        placement("run-base", 1000, 0, "base-panbank", 600, 860),
        placement("hood", 950, 1500, "hood", 600, 710),
        placement("gap-base", 1600, 0, "base-panbank", 600, 860),
        placement("gap-wall", 1600, 1500, "open-shelf", 600, 700),
      ]),
      ["gap-base", "gap-wall"],
    );
  }

  it("has no opening over the hood before the resize", () => {
    const world = hoodBesideEmptySpace();

    expect(bodiesInOpenings(world.records, world.voids)).toEqual([]);
  });

  it("refuses the shrink that would put one over the hood", () => {
    const world = hoodBesideEmptySpace();

    const result = resizeTo(world, "run-base", 300);

    // The empty column funding this shrink would widen across 250 mm of a hood standing in another column.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("RESIZE_OPENS_GAP");
    expect(bodiesInOpenings(world.records, world.voids)).toEqual([]);
  });
});

describe("FINDING C — a re-centring hood may not be pushed through the cabinet next door", () => {
  // ADR 0035 decision 6 keeps the hood's width and re-centres it on the run, so a shrinking run leaves the hood
  // overhanging both edges. A wall cabinet at 400 (100–700) beside a 600 mm run at 1000 (700–1300) carrying a
  // 600 mm hood: shrinking the run to 300 would put 150 mm of hood inside the wall cabinet.
  function hoodBesideACabinet(): KitchenWorld {
    return syntheticWorld([
      placement("left-base", 400, 0, "base-panbank", 600, 860),
      placement("left-wall", 400, 1500, "open-shelf", 600, 700),
      placement("run-base", 1000, 0, "base-panbank", 600, 860),
      placement("hood", 1000, 1500, "hood", 600, 710),
    ]);
  }

  it("starts with nothing interpenetrating", () => {
    expect(findInterpenetratingBodies(hoodBesideACabinet().records)).toEqual(
      [],
    );
  });

  it("still refuses at the first step past the hood's width, not only at the extreme", () => {
    // 550 is the tap a customer actually makes, one press of `−50` from 600; it is refused like the extreme.
    const world = hoodBesideACabinet();

    const result = resizeTo(world, "run-base", 550);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_HOOD_FLOOR");
  });

  it("leaves nothing interpenetrating at any width the column still accepts", () => {
    const world = hoodBesideACabinet();
    const violations: string[] = [];

    for (const widthMm of STEPS) {
      const result = resizeTo(world, "run-base", widthMm);
      if (!result.ok) continue;
      const after = advanceWithColumns(
        world,
        result.design,
        result.effect.columns,
      );
      violations.push(
        ...findInterpenetratingBodies(after.records).map(
          (problem) => `@${String(widthMm)}: ${problem}`,
        ),
      );
    }
    expect(violations).toEqual([]);
  });
});

describe("run-total conservation and geometry, swept over the shipped kitchen", () => {
  // Every body at every chip §9 can render, against the four facts an accepted resize must not break. The
  // shipped kitchen has no two columns whose keys a resize can collide.
  function sweep(
    check: (world: KitchenWorld, result: never, tap: string) => string[],
  ): string[] {
    const world = kitchen();
    const violations: string[] = [];
    for (const record of world.records) {
      for (const widthMm of STEPS) {
        const result = resizeTo(world, record.id, widthMm);
        if (!result.ok) continue;
        violations.push(
          ...check(world, result as never, `${record.id}@${String(widthMm)}`),
        );
      }
    }
    return [...new Set(violations)];
  }

  it("conserves both walls' totals on every accepted resize", () => {
    expect(
      sweep((world, result: never, tap) => {
        const columns = (
          result as { effect: { columns: ReadonlyMap<string, Column> } }
        ).effect.columns;
        return (["A", "B"] as const).flatMap((wall) =>
          Math.abs(totalOn(world.columns, wall) - totalOn(columns, wall)) > 1e-6
            ? [
                `${tap} wall ${wall}: ${String(totalOn(world.columns, wall))} → ${String(totalOn(columns, wall))}`,
              ]
            : [],
        );
      }),
    ).toEqual([]);
  });

  it("keeps every column keyed by its own geometry", () => {
    expect(
      sweep((_world, result: never, tap) =>
        findMiskeyedColumns(
          (result as { effect: { columns: ReadonlyMap<string, Column> } })
            .effect.columns,
        ).map((problem) => `${tap}: ${problem}`),
      ),
    ).toEqual([]);
  });

  it("never disturbs a column that was not one of the two the move touched", () => {
    expect(
      sweep((world, result: never, tap) => {
        const effect = (
          result as {
            effect: {
              columns: ReadonlyMap<string, Column>;
              emptyColumnKey: string;
            };
          }
        ).effect;
        const target = tap.split("@")[0];
        const touched = new Set([
          world.records.find((record) => record.id === target)?.col ?? "",
          effect.emptyColumnKey,
        ]);
        return [...world.columns].flatMap(([key, column]) => {
          if (touched.has(key)) return [];
          const after = effect.columns.get(key);
          if (!after) return [`${tap}: lost untouched column ${key}`];
          return JSON.stringify(extentOf(after)) ===
            JSON.stringify(extentOf(column))
            ? []
            : [`${tap}: untouched column ${key} changed extent`];
        });
      }),
    ).toEqual([]);
  });

  it("leaves no body standing inside any derived opening", () => {
    expect(
      sweep((world, result: never, tap) => {
        const { design, effect } = result as {
          design: KitchenWorld["design"];
          effect: { columns: ReadonlyMap<string, Column> };
        };
        const after = advanceWithColumns(world, design, effect.columns);
        return bodiesInOpenings(after.records, after.voids).map(
          (problem) => `${tap}: ${problem}`,
        );
      }),
    ).toEqual([]);
  });
});

describe("the strip a shrink creates", () => {
  it("becomes a selectable opening at 50 mm, with nothing that can be built in it", () => {
    // ADR 0037 permits leaving an unusable strip empty, and `MIN_SPAN_M` floors an opening's height, never its
    // width, so the strip stays among §4's openings: three 50 mm openings with no offers (§11 row 17's shape).
    const world = kitchen();

    const result = resizeTo(world, "p4", 550);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    const strip = after.voids.filter((record) => record.col === "A|3.48");
    expect(strip.map((record) => Math.round(record.w * 1000))).toEqual([
      50, 50, 50,
    ]);
    for (const opening of strip) {
      const offers = offersFor({
        records: after.records,
        catalog: after.catalog,
        columns: after.columns,
        voids: after.voids,
        cabinetDepthMm: after.cabinetDepthMm,
        target: { kind: "void", id: opening.id },
      });
      expect(offers).toEqual([]);
    }
  });

  it("is refused outright when its key collides, even though the other side is empty", () => {
    // `VACATED_SPACE_SIDE` is fixed to `right` and the collision guard has no mirror: a strip whose key is taken
    // ends the shrink with `COLUMN_KEY_COLLISION` without trying the left edge, which here is open wall.
    const world = syntheticWorld([
      placement("run-base", 1000, 0, "base-panbank", 600, 860),
      placement("blocker", 1150, 1500, "open-shelf", 300, 700),
    ]);

    const result = resizeTo(world, "run-base", 300);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The code names where the strip would land, not that there is no space.
    expect(result.reason.code).toBe("COLUMN_KEY_COLLISION");
  });
});

describe("the load census, re-derived from the rules rather than from the code", () => {
  // ADR 0031 rule 5 plus ADR 0035 decision 7, applied by hand per column of the shipped kitchen:
  //
  // | column | members | intersection | shrinks | growths |
  // | --- | --- | --- | --- | --- |
  // | `A|1.30` 800 | p0, p11, p17 | 600–800 (the sink's 560 aperture, ADR 0017) | 4 | 0 |
  // | `A|3.20` 600 | p4, p14, p20 | 300–800 | 6 | 4 |
  // | `A|0.30` 600 | p8, p15 | 200–800 (ADR 0026 floor) | 8, less the `A|0.45` collision | 4 |
  // | `A|0.75` 300 | p10, p16 | 200–800 | 2 | 10 |
  // | `A|2.00` 600 | p1, p12, p18 | {450, 600} (§11 row 14) | 1 | 0 |
  // | `B|1.80` 600 | p6, p23 | 400–800 (ADR 0048's pantry bound) | 4 | 4 |
  //
  // Shrinks accepted: 4×3 + 6×3 + 7×2 + 2×2 + 1×3 + 4×2 = 12 + 18 + 14 + 4 + 3 + 8 = **59**.
  // `NO_EMPTY_SPACE`: every growth, since the kitchen loads with no empty column, plus the two
  // collision-refused shrinks: 0 + 4×3 + 4×2 + 10×2 + 0 + 4×2 + 2 = **48**.
  // `WIDTH_UNCHANGED` fires once per body that gets that far: 3 + 3 + 2 + 2 + 3 + 2 = **15**.
  it("accepts the fifty-nine shrinks the rules predict and refuses the forty-eight growths", () => {
    const world = kitchen();
    let accepted = 0;
    let noEmptySpace = 0;
    let unchanged = 0;
    for (const placement of world.design.placements) {
      for (const widthMm of STEPS) {
        const result = resizeTo(world, placement.id, widthMm);
        if (result.ok) {
          accepted += 1;
          continue;
        }
        if (result.reason.code === "NO_EMPTY_SPACE") noEmptySpace += 1;
        if (result.reason.code === "WIDTH_UNCHANGED") unchanged += 1;
      }
    }
    expect([accepted, noEmptySpace, unchanged]).toEqual([59, 48, 15]);
  });

  it("refuses exactly the two taps whose vacated strip keys onto the corner leg's column", () => {
    // `A|0.30` spans 0–600 and the corner leg `p25`'s `A|0.45` spans 0–900. Narrowing to 300 vacates 300–600,
    // centre 450, key `A|0.45`; every other step lands on a free key (200 → `A|0.40` … 550 → `A|0.58`).
    const world = kitchen();
    const refused: string[] = [];
    for (const id of ["p8", "p15"]) {
      for (const widthMm of [200, 250, 300, 350, 400, 450, 500, 550]) {
        const result = resizeTo(world, id, widthMm);
        if (!result.ok)
          refused.push(`${id}@${String(widthMm)}:${result.reason.code}`);
      }
    }
    expect(refused).toEqual([
      "p8@300:COLUMN_KEY_COLLISION",
      "p15@300:COLUMN_KEY_COLLISION",
    ]);
  });
});
