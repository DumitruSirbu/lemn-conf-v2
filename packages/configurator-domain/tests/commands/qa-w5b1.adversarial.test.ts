import { describe, expect, it } from "vitest";

import { resolveBuildableSizes } from "../../src/catalog.js";
import { insertBody } from "../../src/commands/insert-body.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { widthStepsFor } from "../../src/queries/width-steps.js";
import { MIN_SPAN_M, MIN_WIDTH_M, type Column } from "../../src/void-engine.js";
import { clearBodies, OCCURRED_AT, resizeTo } from "../support/commands.js";
import { pairWithEmptyColumnRight } from "../support/empty-column-pair.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** Applies a resize the way the store does, to the design and the published column map, so the next step sees
 *  the gap this one left. */
function step(world: KitchenWorld, id: string, widthMm: number): KitchenWorld {
  const result = resizeTo(world, id, widthMm);
  if (!result.ok) {
    throw new Error(`${id} → ${String(widthMm)}: ${result.reason.code}`);
  }
  return advanceWithColumns(world, result.design, result.effect.columns);
}

/** Every column on wall A as `key:widthMm`, sorted — the shape a leftover strip shows up in. */
function wallASignature(columns: ReadonlyMap<string, Column>): string[] {
  return [...columns.values()]
    .filter((column) => column.wall === "A")
    .map((column) => `${column.key}:${String(Math.round(column.w * 1000))}`)
    .sort();
}

/** The nine columns of the shipped kitchen every member of which is deletable. */
const CLEARABLE: readonly (readonly [string, readonly string[]])[] = [
  ["A|0.30", ["p8", "p15"]],
  ["A|0.75", ["p10", "p16"]],
  ["A|1.30", ["p0", "p11", "p17"]],
  ["A|2.00", ["p1", "p12", "p18"]],
  ["A|2.60", ["p2", "p13", "p19"]],
  ["A|3.20", ["p4", "p14", "p20"]],
  ["B|1.20", ["p5", "p22"]],
  ["B|1.80", ["p6", "p23"]],
  ["B|2.45", ["p7", "p24"]],
];

/** Every (world, placement, chip) tap the widened population contains: the kitchen at load and each
 *  of the nine single clears, over each body's own chip list. */
function everyTap(): {
  world: KitchenWorld;
  placementId: string;
  widthMm: number;
}[] {
  const worlds = [
    kitchen(),
    ...CLEARABLE.map(([, ids]) => clearBodies(kitchen(), [...ids])),
  ];
  return worlds.flatMap((world) =>
    world.design.placements.flatMap((placement) =>
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, placement.body.buildId).map(
        (widthMm) => ({ world, placementId: placement.id, widthMm }),
      ),
    ),
  );
}

describe("neither 300 mm constant moved", () => {
  // ADR 0043 names both constants as unchanged. Pinned as literals, not compared to each other, so lowering both
  // together still fails.
  it("keeps MIN_WIDTH_M at 300 mm and MIN_SPAN_M at 300 mm", () => {
    expect([MIN_WIDTH_M, MIN_SPAN_M]).toEqual([0.3, 0.3]);
  });

  it("still refuses to build any cabinet under 300 mm through a resize", () => {
    // The anti-invariant over the widened population: every tap the engine accepts is checked against §2's floor
    // and each entry's own declared one.
    const under: string[] = [];
    for (const { world, placementId, widthMm } of everyTap()) {
      const result = resizeTo(world, placementId, widthMm);
      if (!result.ok) continue;
      for (const placement of result.design.placements) {
        const definition = KITCHEN_L_BODY_CATALOG.get(placement.body.buildId);
        const floorMm = definition?.minWidthMm ?? 1000 * MIN_WIDTH_M;
        if (placement.body.widthMm < floorMm) {
          under.push(
            `${placementId}@${String(widthMm)} left ${placement.id} at ${String(placement.body.widthMm)} (floor ${String(floorMm)})`,
          );
        }
      }
    }
    expect(under).toEqual([]);
  });

  it("still refuses a growth larger than the space that is there", () => {
    // `remainderMm < 0` is the one arithmetic bound ADR 0043 leaves; it must be `too_narrow`, not an acceptance
    // that borrows 100 mm from nowhere.
    const result = resizeTo(pairWithEmptyColumnRight(100), "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NO_EMPTY_SPACE");
    expect(result.reason.params).toMatchObject({
      sides: [
        { side: "right", reason: "too_narrow" },
        { side: "left", reason: "absent" },
      ],
    });
  });

  it("still refuses a growth with no empty column on either side", () => {
    const result = resizeTo(kitchen(), "p10", 350);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NO_EMPTY_SPACE");
  });

  it("still derives no opening from a vertical interval of exactly MIN_SPAN_M", () => {
    // §4's exclusive floor (ADR 0015): ADR 0043 is horizontal and must not reach it, so a 300 mm-tall free
    // interval above a body is still no slot.
    const world = syntheticWorld([
      {
        id: "under",
        wall: "A" as const,
        alongMm: 1300,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 860 },
      },
      {
        id: "over",
        wall: "A" as const,
        alongMm: 1300,
        y0Mm: 1160,
        body: { buildId: "wall-cabinet", widthMm: 600, heightMm: 700 },
      },
    ]);

    expect(world.voids.filter((record) => record.h <= MIN_SPAN_M)).toEqual([]);
  });
});

describe("the remainder boundary", () => {
  // The superseded floor was `0 < remainder < 300`: rows at 0, 2, 50, 298, 300 and 302 straddle both ends and the
  // negative row is the surviving bound. Even widths only: an odd remainder needs an odd target, which `setWidth`
  // refuses `WIDTH_NOT_SUPPORTED` beforehand.
  it.each([
    { emptyMm: 200, targetMm: 800, remainderMm: 0 },
    { emptyMm: 202, targetMm: 800, remainderMm: 2 },
    { emptyMm: 250, targetMm: 800, remainderMm: 50 },
    { emptyMm: 498, targetMm: 800, remainderMm: 298 },
    { emptyMm: 500, targetMm: 800, remainderMm: 300 },
    { emptyMm: 502, targetMm: 800, remainderMm: 302 },
  ])(
    "accepts a growth into $emptyMm mm leaving $remainderMm mm",
    ({ emptyMm, targetMm, remainderMm }) => {
      const result = resizeTo(
        pairWithEmptyColumnRight(emptyMm),
        "L-base",
        targetMm,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.effect.emptyColumnWidthMm).toBe(remainderMm);
    },
  );

  it("removes the empty column entirely when the growth consumes it to zero", () => {
    // The other end of the boundary, which ADR 0031 always allowed: a zero-width column left in the frozen map
    // would be a gap of no width the customer can select.
    const world = pairWithEmptyColumnRight(200);

    const result = resizeTo(world, "L-base", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advanceWithColumns(
      world,
      result.design,
      result.effect.columns,
    );
    expect(
      [...after.columns.values()].filter((column) => column.w < 1e-6),
    ).toEqual([]);
    expect(after.voids).toEqual([]);
  });
});

// The gap ADR 0043 permits must be represented, as a column in the published map and an opening the panel can
// select; one the engine keeps but never shows is invisible dead wall.
describe("a gap a growth leaves is a state the design can show", () => {
  it.each([2, 50, 150, 200, 298])(
    "publishes a %i mm gap as a column with an opening in it",
    (remainderMm) => {
      const world = pairWithEmptyColumnRight(200 + remainderMm);

      const result = resizeTo(world, "L-base", 800);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const after = advanceWithColumns(
        world,
        result.design,
        result.effect.columns,
      );
      const gaps = [...after.columns.values()].filter(
        (column) => Math.round(column.w * 1000) === remainderMm,
      );
      expect(gaps).toHaveLength(1);
      expect(
        after.voids.filter((record) => record.col === gaps[0]?.key),
      ).toHaveLength(1);
    },
  );

  it("refuses an insert into that gap with a sentence naming the real width", () => {
    // The gap is selectable, so the refusal must name the opening's own width, not the width the growth asked for.
    const world = pairWithEmptyColumnRight(250);
    const grown = resizeTo(world, "L-base", 800);
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    const after = advanceWithColumns(world, grown.design, grown.effect.columns);
    const gap = after.voids[0];
    expect(gap).toBeDefined();
    if (!gap) return;

    const inserted = insertBody({
      design: after.design,
      catalog: after.catalog,
      columns: after.columns,
      voids: after.voids,
      target: { kind: "void", id: gap.id },
      buildId: "base-bottle-cargo",
      probe: createFakeProbe({ catalog: after.catalog }),
      occurredAt: OCCURRED_AT,
    });

    expect(inserted.ok).toBe(false);
    if (inserted.ok) return;
    expect(inserted.reason).toMatchObject({
      code: "WIDTH_TOO_SMALL",
      params: { availableMm: 50 },
    });
  });
});

describe("the stepper is reversible over a long chain", () => {
  it("returns the design and the column map after six shrinks and six growths", () => {
    // The whole descent and the whole ascent (press down six times, then try to get back), not one rung at a time.
    const before = kitchen();
    let world = before;
    for (let widthMm = 550; widthMm >= 300; widthMm -= 50) {
      world = step(world, "p4", widthMm);
    }
    expect(
      world.design.placements.find((entry) => entry.id === "p4")?.body.widthMm,
    ).toBe(300);

    for (let widthMm = 350; widthMm <= 600; widthMm += 50) {
      world = step(world, "p4", widthMm);
    }

    for (const id of ["p4", "p14", "p20"]) {
      const placement = world.design.placements.find(
        (entry) => entry.id === id,
      );
      expect([id, placement?.body.widthMm]).toEqual([id, 600]);
    }
    expect(wallASignature(world.columns)).toEqual(
      wallASignature(before.columns),
    );
    expect(world.voids).toEqual([]);
  });

  it("returns to the start under an alternating down-up-down-up chain", () => {
    const before = kitchen();
    let world = before;
    for (const widthMm of [550, 600, 550, 500, 550, 600]) {
      world = step(world, "p4", widthMm);
    }

    expect(wallASignature(world.columns)).toEqual(
      wallASignature(before.columns),
    );
    expect(world.voids).toEqual([]);
  });

  it("keeps every member's recorded depth across the whole round trip", () => {
    const before = kitchen();
    const depthsBefore = new Map(
      before.records.map((record) => [record.id, record.frame.d]),
    );
    let world = before;
    for (let widthMm = 550; widthMm >= 300; widthMm -= 50) {
      world = step(world, "p4", widthMm);
    }
    for (let widthMm = 350; widthMm <= 600; widthMm += 50) {
      world = step(world, "p4", widthMm);
    }

    for (const record of world.records) {
      expect([record.id, record.frame.d]).toEqual([
        record.id,
        depthsBefore.get(record.id),
      ]);
    }
  });

  it("climbs back to exactly the width it started at, and no further", () => {
    // A run stepped to its floor climbs again only through the space its own shrinks vacated: `A|3.20` is at the
    // far end of wall A, so the 300 mm it freed is the whole budget. Reaching 600 consumes it to zero and the next
    // `+50` must be refused.
    const before = kitchen();
    let world = before;
    for (let widthMm = 550; widthMm >= 300; widthMm -= 50) {
      world = step(world, "p4", widthMm);
    }
    for (let widthMm = 350; widthMm <= 600; widthMm += 50) {
      world = step(world, "p4", widthMm);
    }

    expect(wallASignature(world.columns)).toEqual(
      wallASignature(before.columns),
    );
    const overreach = resizeTo(world, "p4", 650);
    expect(overreach.ok).toBe(false);
    if (overreach.ok) return;
    expect(overreach.reason.code).toBe("NO_EMPTY_SPACE");
  });
});

describe("two columns competing for one shared empty space", () => {
  function threeInARow(): KitchenWorld {
    const world = syntheticWorld([
      {
        id: "left",
        wall: "A" as const,
        alongMm: 300,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 860 },
      },
      {
        id: "middle",
        wall: "A" as const,
        alongMm: 800,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 400, heightMm: 860 },
      },
      {
        id: "right",
        wall: "A" as const,
        alongMm: 1300,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 860 },
      },
    ]);
    return clearBodies(world, ["middle"]);
  }

  it("gives the first mover the space it asks for and leaves the rest", () => {
    const result = resizeTo(threeInARow(), "left", 800);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.emptyColumnWidthMm).toBe(200);
  });

  it("lets the loser take exactly the remainder, and no more", () => {
    const world = threeInARow();
    const first = resizeTo(world, "left", 800);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const after = advanceWithColumns(world, first.design, first.effect.columns);

    const takesTheRest = resizeTo(after, "right", 800);
    expect(takesTheRest.ok).toBe(true);
    if (!takesTheRest.ok) return;
    expect(takesTheRest.effect.emptyColumnWidthMm).toBe(0);

    const overreaches = resizeTo(
      advanceWithColumns(
        after,
        takesTheRest.design,
        takesTheRest.effect.columns,
      ),
      "right",
      800,
    );
    expect(overreaches.ok).toBe(false);
    if (overreaches.ok) return;
    expect(overreaches.reason.code).toBe("WIDTH_UNCHANGED");
  });

  /** Three 400 mm columns with the middle one emptied: narrow enough that one mover can take the whole gap under
   *  the 800 mm ceiling, and that the other still has a growth to be refused. */
  function threeNarrowInARow(): KitchenWorld {
    const member = (id: string, alongMm: number) => ({
      id,
      wall: "A" as const,
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-drawer2-600", widthMm: 400, heightMm: 860 },
    });
    return clearBodies(
      syntheticWorld([
        member("left", 200),
        member("middle", 600),
        member("right", 1000),
      ]),
      ["middle"],
    );
  }

  it("refuses the second mover a growth larger than what the first left", () => {
    const afterTheFirst = step(threeNarrowInARow(), "left", 600);

    const second = resizeTo(afterTheFirst, "right", 800);

    expect(second.ok ? "ok" : second.reason.code).toBe("NO_EMPTY_SPACE");
    if (second.ok) return;
    expect(second.reason.params).toMatchObject({
      sides: [
        { side: "right", reason: "absent" },
        { side: "left", reason: "too_narrow" },
      ],
    });
  });

  it("refuses the second mover once the first has taken the whole gap", () => {
    const world = threeNarrowInARow();
    const first = resizeTo(world, "left", 800);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.effect.emptyColumnWidthMm).toBe(0);
    const afterTheFirst = advanceWithColumns(
      world,
      first.design,
      first.effect.columns,
    );

    const second = resizeTo(afterTheFirst, "right", 600);

    expect(second.ok ? "ok" : second.reason.code).toBe("NO_EMPTY_SPACE");
    if (second.ok) return;
    expect(second.reason.params).toMatchObject({
      sides: [
        { side: "right", reason: "absent" },
        { side: "left", reason: "absent" },
      ],
    });
  });
});

// Both directions: a live `+50` on the stepper for a width the chip row greys out is the half a removed guard
// could break.
describe("the chip row, the stepper and the command give one answer", () => {
  function optionsFor(world: KitchenWorld, placementId: string) {
    return widthOptionsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: placementId },
      probe: createFakeProbe(),
    });
  }

  it("greys exactly the chips the command refuses, over the whole widened population", () => {
    const disagreements: string[] = [];
    for (const { world, placementId, widthMm } of everyTap()) {
      const chip = optionsFor(world, placementId).find(
        (option) => option.widthMm === widthMm,
      );
      if (!chip) continue;
      const free = chip.verdict.status === "available";
      const accepted = resizeTo(world, placementId, widthMm).ok;
      if (free !== accepted) {
        disagreements.push(
          `${placementId}@${String(widthMm)}: chip ${String(free)}, command ${String(accepted)}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("never shows a live step for a width the chip row greys, or the reverse", () => {
    const disagreements: string[] = [];
    const worlds = [
      kitchen(),
      ...CLEARABLE.map(([, ids]) => clearBodies(kitchen(), [...ids])),
    ];
    for (const world of worlds) {
      for (const placement of world.design.placements) {
        const steps = widthStepsFor({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: placement.id },
          probe: createFakeProbe(),
        });
        if (!steps) continue;
        for (const option of [steps.narrower, steps.wider]) {
          const chip = optionsFor(world, placement.id).find(
            (candidate) => candidate.widthMm === option.widthMm,
          );
          if (!chip) continue;
          if (
            (chip.verdict.status === "available") !==
            (option.verdict.status === "available")
          ) {
            disagreements.push(
              `${placement.id}@${String(option.widthMm)}: chip ${chip.verdict.status}, step ${option.verdict.status}`,
            );
          }
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe("the empty-space refusal descriptor", () => {
  it("is the descriptor a real refused growth actually produces", () => {
    const result = resizeTo(pairWithEmptyColumnRight(100), "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NO_EMPTY_SPACE");
    if (result.reason.code !== "NO_EMPTY_SPACE") return;
    expect(result.reason.params.requestedMm).toBe(800);
    expect(result.reason.params.deltaMm).toBe(200);
    expect(
      result.reason.params.sides.some((side) => side.reason === "too_narrow"),
    ).toBe(true);
  });

  it("no shrink can reach the empty-space refusal", () => {
    // On a shrink `evaluateEmptySpace` cannot fail with anything but `absent`, and `fundingScan` then supplies the
    // vacated space, so no command yields a `NO_EMPTY_SPACE` with negative `deltaMm` (ADR 0043). This sweep drives
    // the actual command path.
    const reached: string[] = [];
    for (const { world, placementId, widthMm } of everyTap()) {
      const result = resizeTo(world, placementId, widthMm);
      if (result.ok) continue;
      if (result.reason.code !== "NO_EMPTY_SPACE") continue;
      if (result.reason.params.deltaMm >= 0) continue;
      reached.push(
        `${result.reason.code}:${String(result.reason.params.deltaMm)}`,
      );
    }

    expect(reached).toEqual([]);
  });
});

describe("every per-side reason a command can still produce is typed", () => {
  /** The whole per-side union, written here and not read off `rejection.ts`: a reason renamed or added in
   *  production must fail here, not follow. */
  const EVERY_TYPED_SIDE_REASON = [
    "absent",
    "key_taken",
    "opens_a_gap",
    "too_narrow",
  ];

  /** The shipped kitchen's taps reach every reason but `too_narrow`, which needs an empty column narrower than the
   *  growth: the one tap that reaches it is added so the sweep covers the union. */
  function everyTapAndOneTooNarrow() {
    return [
      ...everyTap(),
      {
        world: pairWithEmptyColumnRight(100),
        placementId: "L-base",
        widthMm: 800,
      },
    ];
  }

  it("publishes a known reason for each side the sweep reaches", () => {
    const reasons = new Set<string>();
    for (const { world, placementId, widthMm } of everyTapAndOneTooNarrow()) {
      const result = resizeTo(world, placementId, widthMm);
      if (result.ok) continue;
      const params = result.reason.params as {
        sides?: readonly { readonly reason: string }[];
      };
      for (const side of params.sides ?? []) reasons.add(side.reason);
    }

    expect([...reasons].sort()).toEqual(EVERY_TYPED_SIDE_REASON);
  });
});

describe("the 200 mm cargo exception is neither widened nor closed", () => {
  it("keeps its declared floor at 200 mm", () => {
    expect(KITCHEN_L_BODY_CATALOG.get("base-bottle-cargo")?.minWidthMm).toBe(
      200,
    );
  });

  it("builds nothing under 300 mm but an entry that declares its own lower floor", () => {
    // A resize that now leaves a 200 mm gap must never leave a 200 mm cabinet whose row declares 300.
    const offenders: string[] = [];
    for (const { world, placementId, widthMm } of everyTap()) {
      const result = resizeTo(world, placementId, widthMm);
      if (!result.ok) continue;
      for (const placement of result.design.placements) {
        if (placement.body.widthMm >= 300) continue;
        const declaredMm = KITCHEN_L_BODY_CATALOG.get(
          placement.body.buildId,
        )?.minWidthMm;
        if (declaredMm === undefined || placement.body.widthMm < declaredMm) {
          offenders.push(
            `${placementId}@${String(widthMm)} built ${placement.body.buildId} at ${String(placement.body.widthMm)}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// The superseded rule (ADR 0031) is re-implemented from its text and applied to the engine's own answers, so the
// census delta is measured without reading the guard that was deleted.
describe("the census grew by exactly the taps the superseded floor refused", () => {
  /** ADR 0031's rule, written out again: a growth leaving the empty column strictly between 0 and
   *  `MIN_W` was refused. Applied to a tap the engine now accepts. */
  function theOldFloorWouldHaveRefused(
    world: KitchenWorld,
    placementId: string,
    widthMm: number,
  ): boolean {
    const result = resizeTo(world, placementId, widthMm);
    if (!result.ok) return false;
    const current = world.design.placements.find(
      (entry) => entry.id === placementId,
    )?.body.widthMm;
    if (current === undefined) return false;
    const remainderMm = result.effect.emptyColumnWidthMm;
    return (
      widthMm > current && remainderMm > 0 && remainderMm < 1000 * MIN_WIDTH_M
    );
  }

  it("adds nothing at load, where there is no empty column to leave a remainder in", () => {
    const world = kitchen();
    const unlocked = world.design.placements.flatMap((placement) =>
      resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, placement.body.buildId)
        .filter((widthMm) =>
          theOldFloorWouldHaveRefused(world, placement.id, widthMm),
        )
        .map((widthMm) => `${placement.id}@${String(widthMm)}`),
    );

    expect(unlocked).toEqual([]);
  });

  it("adds sixteen growths across the nine clears, and names every one", () => {
    // Every entry is a growth into a column the clear freed, stopping short of consuming it, which is what
    // ADR 0043 permits.
    const unlocked: string[] = [];
    for (const [key, ids] of CLEARABLE) {
      const world = clearBodies(kitchen(), [...ids]);
      for (const placement of world.design.placements) {
        for (const widthMm of resolveBuildableSizes(
          KITCHEN_L_BODY_CATALOG,
          placement.body.buildId,
        )) {
          if (theOldFloorWouldHaveRefused(world, placement.id, widthMm)) {
            unlocked.push(`${key} ${placement.id}@${String(widthMm)}`);
          }
        }
      }
    }

    expect(unlocked.sort()).toEqual([
      "A|0.30 p10@650",
      "A|0.30 p10@700",
      "A|0.30 p10@750",
      "A|0.30 p10@800",
      "A|0.30 p16@650",
      "A|0.30 p16@700",
      "A|0.30 p16@750",
      "A|0.30 p16@800",
      "A|0.75 p15@650",
      "A|0.75 p15@700",
      "A|0.75 p15@750",
      "A|0.75 p15@800",
      "A|0.75 p8@650",
      "A|0.75 p8@700",
      "A|0.75 p8@750",
      "A|0.75 p8@800",
    ]);
  });

  it("accepts 546 taps across the nine clears, of which 530 the old floor also allowed", () => {
    // Both totals come from one sweep, so the pinned 546 cannot go green on a different population. The seeded
    // pantry's moving placements (`p6`, `p23`) are no growth the superseded floor refused (ADR 0048), so the gap
    // between the totals stays sixteen.
    let accepted = 0;
    let unlockedByThisWave = 0;
    for (const [, ids] of CLEARABLE) {
      const world = clearBodies(kitchen(), [...ids]);
      for (const placement of world.design.placements) {
        for (const widthMm of resolveBuildableSizes(
          KITCHEN_L_BODY_CATALOG,
          placement.body.buildId,
        )) {
          if (!resizeTo(world, placement.id, widthMm).ok) continue;
          accepted += 1;
          if (theOldFloorWouldHaveRefused(world, placement.id, widthMm)) {
            unlockedByThisWave += 1;
          }
        }
      }
    }

    expect([accepted, accepted - unlockedByThisWave]).toEqual([546, 530]);
  });
});
