// Adversarial QA for wave 5D2b — ADR 0035 decisions 6 and 7.
//
// The wave lets a resize *create* a column where none existed, and exempts the hood from its
// column's width. Both change what the frozen column map holds after a command and what physically
// stands where, so every test here is about the map and the geometry it names rather than about the
// placement widths the implementer's own tests already pin.
//
// **Three of these failed when QA wrote them; all three are closed.** FINDING C was the last, and it
// was an open product decision rather than a defect — the owner answered it on 2026-08-29 and the row
// below now asserts the answer.
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
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

function alongOf(
  wall: "A" | "B",
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

/** Every key in the map is the key its own geometry derives — the invariant the wave's collision
 *  guard exists to protect, stated over the whole map rather than over the one key it checks. */
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

/** Two solid bodies occupying the same place — §3.1 read across columns rather than within one.
 *  Nothing in the engine asks this, and the hood exemption is the first rule that can produce it. */
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

// **FIXED.** The resize is now refused `COLUMN_KEY_COLLISION` rather than silently overwriting the
// third column. Refusing is the decided answer and matches how the *created strip's* collision was
// already handled: §3.2's key is a position, two columns cannot hold one, and losing a run with no
// command naming it is the worst of the three outcomes. These assertions were written expecting the
// move to succeed and preserve both columns; they now pin the refusal instead.
describe("FINDING A — the resized column's new key must not replace another column", () => {
  // §3.2's columns may overlap along the wall, which is exactly the premise the wave's own guard is
  // built on: `vacatedEmptySpace` (set-width.ts:~880) refuses when the **created** strip keys onto a
  // column the frozen map already holds. The **resized** column's new key is never asked the same
  // question, and every accepted resize moves that key.
  //
  // `moveFrozenColumns` (set-width.ts:~1200) deletes the two old keys and then `updated.set`s the
  // two new ones. A `set` onto a third column's key overwrites it — `regions`, `top`, `d`, `w` and
  // all. The bodies filed under that key still derive it, so `refuseColumnDrift` sees nothing.
  //
  // A 600 mm base run at 1000 (700–1300) and a 300 mm wall unit at 950 (800–1100), filed under
  // `A|1.00` and `A|0.95`. Shrinking the base run to 500 holds its left edge at 700 and puts its new
  // centre at 950 — `A|0.95`, the wall unit's own column.
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
    // The wall unit was neither resized nor moved, so ADR 0011 Gap D says its frozen extent comes
    // through untouched. Before the fix it came through as the base run's.
    const world = overlappingColumns();
    const before = world.columns.get("A|0.95");

    const result = resizeTo(world, "base-run", 500);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_KEY_COLLISION");
    // The design is untouched, so the column it would have clobbered is still exactly itself.
    const untouched = world.columns.get("A|0.95");
    expect(untouched && extentOf(untouched)).toEqual(
      before && extentOf(before),
    );
  });

  it("conserves the along-wall total, by refusing the move that would not", () => {
    // 900 mm of column before (600 + 300). The accepted move gave 600 (500 + the 100 strip): the
    // wall unit's 300 mm column simply gone. Refusing is what conserves it.
    const world = overlappingColumns();
    const before = totalOn(world.columns, "A");

    const result = resizeTo(world, "base-run", 500);

    expect(result.ok).toBe(false);
    expect(totalOn(world.columns, "A")).toBe(before);
  });

  it("does the same thing on a growth, so the hole predates decision 7", () => {
    // The guard added by this wave is on the created strip only, and the identical collision on the
    // resized column's own key is reachable through ADR 0031's original path — a growth consuming an
    // empty column that was already there.
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

// **FIXED.** The exemption is now scoped to the hoods of the column being resized, so a hood in a
// different column is visible to the phantom check again and this move is refused. The assertion
// below was written expecting the move to succeed with no opening over the hood; the honest outcome
// is that it does not succeed at all.
describe("FINDING B — the hood exemption must not let a real phantom opening through", () => {
  // `bodiesUnderOpenings` (set-width.ts:~1390) skips **every** hood in the design, on both sides of
  // the before/after diff — not only the hood in the column being resized. A hood standing in a
  // different column is therefore invisible to the phantom check, and the empty column funding a
  // shrink can widen straight over it.
  //
  // This is the shipped kitchen's own measured `RESIZE_OPENS_GAP` scenario with a hood in the role
  // of the corner leg. A 600 mm run at 1000 (700–1300); an empty column at 1600 (1300–1900); a hood
  // in its own overlapping column at 950 (650–1250). Shrinking the run to 300 holds its left edge at
  // 700 and hands 300 mm back to the empty column, which becomes 1000–1900 — 250 mm of it over the
  // hood, at wall level, where before the resize there was none.
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

    // `RESIZE_OPENS_GAP` is the whole point of the phantom check: the empty column funding this
    // shrink would widen across 250 mm of a hood standing in another column. The hood is exempt
    // from this check only while it belongs to the column being resized.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("RESIZE_OPENS_GAP");
    expect(bodiesInOpenings(world.records, world.voids)).toEqual([]);
  });
});

describe("FINDING C — a re-centring hood may not be pushed through the cabinet next door", () => {
  // ADR 0035 decision 6 as amended keeps the hood's width and re-centres it on the run. When the run
  // shrinks, the hood therefore overhangs **both** edges — the vacated strip on one side, and
  // whatever is standing on the other. Nothing checked the far side.
  //
  // A wall cabinet at 400 (100–700) beside a 600 mm run at 1000 (700–1300) carrying a 600 mm hood.
  // Shrinking the run to 300 leaves the run at 700–1000 and the hood at 550–1150: 150 mm of hood
  // inside the wall cabinet. Both bodies are wall-level, both are solid, and they now share the
  // space. Before this wave the hood was a full member and took the column's width, so this shape
  // was not representable.
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

  // **DECIDED 2026-08-29, and un-skipped as the assertion that the shrink is refused.** QA left this
  // skipped because ADR 0039 sanctions the hood overhanging and says nothing about the overhang
  // landing on a *cabinet*, so the three answers — refuse the shrink, allow the overlap, clamp the
  // hood — were a product question rather than a defect.
  //
  // The owner chose none of the three as a guard: *"if 600 is minimum for the hood, then is logic to
  // set the minimum 600 mm, and grey out the −50mm button."* **The floor makes the state
  // unreachable**, which is why the assertion below is a refusal and not a geometry check. A column
  // holding a 600 mm hood cannot be narrowed to 300, so there is no "after the shrink" to inspect —
  // and the `−50` carries that as its reason before the tap, per ADR 0032, rather than failing on it.
  it("refuses the shrink that would push it there", () => {
    const world = hoodBesideACabinet();

    const result = resizeTo(world, "run-base", 300);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_HOOD_FLOOR");
  });

  it("still refuses at the first step past the hood's width, not only at the extreme", () => {
    // 550 is the tap a customer actually makes: one press of `−50` from 600. It re-centred the hood
    // 25 mm into the neighbour, and eight presses buried 200 mm of it. One press is refused for the
    // same reason the eighth is.
    const world = hoodBesideACabinet();

    const result = resizeTo(world, "run-base", 550);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_HOOD_FLOOR");
  });

  it("leaves nothing interpenetrating at any width the column still accepts", () => {
    // The invariant behind the refusal, swept rather than argued: every width the run can still
    // reach leaves the hood inside it, so no accepted move produces the overlap.
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
  // Every body, at every chip §9 can render, and the four facts an accepted resize must not break.
  // All four hold: the shipped kitchen has no two columns whose keys a resize can collide, so
  // FINDING A is unreachable from this fixture.
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
    // ADR 0037 permits leaving an unusable strip empty, and `MIN_SPAN_M` floors an opening's
    // **height**, never its width — so the strip is not filtered out of §4's openings. Recorded
    // rather than asserted against: three openings, 50 mm wide, sixteen catalogue rows offered and
    // none of them buildable. That is the §11 row 17 shape ("an opening with zero valid contents"),
    // arrived at from the other direction.
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
    // `VACATED_SPACE_SIDE` is fixed to `right` and the collision guard has no mirror: a strip whose
    // key is taken ends the shrink with `NO_EMPTY_SPACE`, without trying the left edge — which here
    // is open wall with nothing on it at all.
    const world = syntheticWorld([
      placement("run-base", 1000, 0, "base-panbank", 600, 860),
      placement("blocker", 1150, 1500, "open-shelf", 300, 700),
    ]);

    const result = resizeTo(world, "run-base", 300);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // One guard answers this since clean-code review R3.5, and it answers with *where* the strip
    // would land rather than with "there is no space" — the space is exactly what there is.
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
  // **The last row is ADR 0048 and it is the only one that moved.** The seeded pantry `p6` declared
  // `fixedWidth: true` until the owner flipped it on 2026-09-01, so its column contributed nothing
  // to any of the three counts; the pantry's own 400 mm floor is what makes the intersection start
  // there rather than at the wall cabinet's 200.
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
    // `A|0.30` spans 0–600 and `A|0.45` — the corner leg `p25` — spans 0–900. Narrowing to 300
    // vacates 300–600, centre 450, key `A|0.45`. Every other step misses it: 200 → `A|0.40`,
    // 250 → `A|0.43`, 350 → `A|0.48`, 400 → `A|0.50`, 450 → `A|0.53`, 500 → `A|0.55`,
    // 550 → `A|0.58`. So 300 and only 300 collides, on both members.
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
