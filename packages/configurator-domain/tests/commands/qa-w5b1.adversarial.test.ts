// Adversarial QA for wave 5B1 — ADR 0043, "an empty space of any width is a legal state".
//
// The implementer removed the `remainder_below_floor` guard and edited six existing tests to match.
// This file tests what that change *assumed* rather than what it built:
//
//   1. the two constants ADR 0043 promises not to move really did not move, and no path through
//      `plan-width-funding.ts` still applies either to an empty column;
//   2. the anti-invariants still hold over the **widened** population, not just over the old one —
//      a cabinet is never built under its own floor, a growth never spends space it does not have,
//      and a growth with no empty column anywhere is still refused;
//   3. the leftover gap the decision now permits is a *represented* state and not an invisible one,
//      because the owner's whole argument is that the customer sees it and resizes it away;
//   4. the stepper is reversible over a long chain and not merely one rung at a time;
//   5. §9's two width controls and the command still agree, in **both** directions, over every
//      width the decision newly unlocks.
import { describe, expect, it } from "vitest";

import { resolveBuildableSizes } from "../../src/catalog.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { renderRejection } from "../../src/commands/rejection.js";
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

/** Applies a resize the way the store does — design **and** published column map, which is the only
 *  way the next step sees the gap this one left. */
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

// ---------------------------------------------------------------------------
// Q — the constants ADR 0043 promises are untouched.
// ---------------------------------------------------------------------------

describe("neither 300 mm constant moved", () => {
  // `docs/BACKLOG.md` entry 2 records a near-miss of lowering the wrong one, and ADR 0043 names both
  // in a *What is explicitly not changed* section. Pinned as literals rather than compared to each
  // other, so lowering both together still fails.
  it("keeps MIN_WIDTH_M at 300 mm and MIN_SPAN_M at 300 mm", () => {
    expect([MIN_WIDTH_M, MIN_SPAN_M]).toEqual([0.3, 0.3]);
  });

  it("still refuses to build any cabinet under 300 mm through a resize", () => {
    // The anti-invariant, over the **widened** population: every tap the engine now accepts, in
    // every scenario, checked against §2's floor and each entry's own declared one.
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
    // `remainderMm < 0` is the one arithmetic bound ADR 0043 leaves, and it must be a `too_narrow`
    // and not an acceptance that borrows 100 mm from nowhere.
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
    // §4's exclusive floor (ADR 0015). ADR 0043 is horizontal and must not have reached it: a
    // 300 mm-tall free interval above a body is still no slot.
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

// ---------------------------------------------------------------------------
// Q — the remainder boundary, one millimetre either side of the superseded floor.
// ---------------------------------------------------------------------------

describe("the remainder boundary", () => {
  // The superseded floor was `0 < remainder < 300`. Rows at 0, 2, 50, 298, 300 and 302 straddle both
  // of its ends, and the negative row is the bound that survives. Even widths only: an odd
  // remainder needs an odd target, which `setWidth` refuses `WIDTH_NOT_SUPPORTED` beforehand.
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
    // The other end of the boundary, and the one ADR 0031 always allowed. A zero-width column left
    // standing in the frozen map would be a gap of no width the customer can select.
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

// ---------------------------------------------------------------------------
// Q — the gap ADR 0043 permits must be a state the customer can see.
//
// The decision rests entirely on the owner's second sentence: *"Such narrow empty space will force
// user to resize accordingly and not leave such spaces."* That is only true if the narrow space is
// **represented** — a column in the published map and an opening the panel can select. A 50 mm gap
// the engine keeps but never shows is not self-correcting; it is invisible dead wall.
// ---------------------------------------------------------------------------

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
    // The gap is selectable, so the panel will ask what fits in it. The refusal must name the
    // opening's own width — not the width the growth asked for, and not a floor read off a
    // superseded constant.
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
      target: { kind: "void", id: gap.id },
      buildId: "base-bottle-cargo",
      probe: createFakeProbe({ catalog: after.catalog }),
      occurredAt: OCCURRED_AT,
    });

    expect(inserted.ok).toBe(false);
    if (inserted.ok) return;
    expect(inserted.reason.code).toBe("WIDTH_TOO_SMALL");
    expect(inserted.reason.message).toContain("50 mm");
  });
});

// ---------------------------------------------------------------------------
// Q — reversibility over a chain, not one rung at a time.
// ---------------------------------------------------------------------------

describe("the stepper is reversible over a long chain", () => {
  it("returns the design and the column map after six shrinks and six growths", () => {
    // The implementer's own row does one `−50` and one `+50` at each rung. This does the whole
    // descent and the whole ascent, which is the shape the owner reported: press down six times,
    // then try to get back.
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
    // The anti-invariant hiding inside reversibility: ADR 0043 lets a growth stop short of consuming
    // the gap, so a run stepped to its floor can climb again — but only through the space its own
    // shrinks vacated. `A|3.20` sits at the far end of wall A with the wall on one side, so the
    // 300 mm it freed is the whole budget. Reaching 600 must consume it to zero, and the next `+50`
    // must be refused rather than conjuring wall that is not there.
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

// ---------------------------------------------------------------------------
// Q — two neighbours reaching for one gap.
// ---------------------------------------------------------------------------

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

  it("refuses the second mover once the first has taken the whole gap", () => {
    const world = threeInARow();
    const first = resizeTo(world, "left", 1000);
    // 1000 is above the 800 ceiling, so the whole gap is taken in two steps instead.
    expect(first.ok).toBe(false);

    const takeAll = resizeTo(world, "left", 800);
    expect(takeAll.ok).toBe(true);
    if (!takeAll.ok) return;
    const mid = advanceWithColumns(
      world,
      takeAll.design,
      takeAll.effect.columns,
    );
    const second = resizeTo(mid, "right", 800);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const done = advanceWithColumns(mid, second.design, second.effect.columns);

    const third = resizeTo(done, "left", 800);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.reason.code).toBe("WIDTH_UNCHANGED");
  });
});

// ---------------------------------------------------------------------------
// Q — §9's two controls and the command still agree, in both directions.
//
// The implementer's new row in `width-options.test.ts` skips a placement whenever the chip is not
// `available`, so it only ever proves *chip free ⇒ step live*. The converse — a live `+50` on the
// stepper for a width the chip row greys out — is the half that was not swept, and it is the half a
// removed guard could break.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Q — the reworded Romanian sentence, judged beside its siblings.
// ---------------------------------------------------------------------------

describe("the reworded empty-space sentence", () => {
  const GROWTH = {
    code: "NO_EMPTY_SPACE",
    params: {
      label: "Corp spălător",
      requestedMm: 700,
      deltaMm: 50,
      sides: [
        { side: "right", reason: "too_narrow" },
        { side: "left", reason: "absent" },
      ],
    },
  } as const;

  it("never says the column would *be* the delta wide", () => {
    // The defect the reword fixes: „coloana ar trebui să ocupe 50 mm" reads as a 50 mm-wide column.
    // Neither verb may come back.
    //
    // **The negative delta below guards `renderRejection` in isolation, not a reachable state** — no
    // command produces a `NO_EMPTY_SPACE` with one, which the row at the end of this file measures.
    // It is here because the renderer takes signed params from three codes and must not grow a
    // second clause again on the strength of the sign alone (review finding R1.9).
    const growth = renderRejection(GROWTH);
    const shrink = renderRejection({
      ...GROWTH,
      params: { ...GROWTH.params, requestedMm: 600, deltaMm: -50 },
    });

    for (const message of [growth, shrink]) {
      expect(message).not.toContain("ocupe");
      expect(message).not.toContain("elibereze");
      expect(message).not.toContain("ar trebui");
    }
  });

  it("never names a width the customer did not ask for", () => {
    // The number in the clause is the *space* the move needs, so the only width in the sentence must
    // be the one that was tapped. A growth of 50 to reach 700 must not read "700" twice or leak the
    // current width.
    const message = renderRejection(GROWTH);

    expect(message.match(/\d+ mm/g)).toEqual(["700 mm", "50 mm"]);
  });

  it("reads as one grammatical sentence beside the other two verdicts", () => {
    // The three refusals share a scan and a shape. Each must open with the quoted label, close with
    // a full stop, and carry no double space or dangling connector from the edit.
    const messages = [
      renderRejection(GROWTH),
      renderRejection({ ...GROWTH, code: "RESIZE_OPENS_GAP" }),
      renderRejection({ ...GROWTH, code: "COLUMN_KEY_COLLISION" }),
    ];

    for (const message of messages) {
      expect(message.startsWith("„Corp spălător”")).toBe(true);
      expect(message.endsWith(".")).toBe(true);
      expect(message).not.toContain("  ");
      expect(message).not.toMatch(/,\s*\./);
    }
  });

  it("is the sentence a real refused growth actually produces", () => {
    // Rendered directly is not the same as reachable. This drives it out of `setWidth`.
    const result = resizeTo(pairWithEmptyColumnRight(100), "L-base", 800);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.message).toContain("ar mai avea nevoie de 200 mm");
    expect(result.reason.message).toContain("spațiul liber este prea îngust");
  });

  it("no shrink can reach the empty-space refusal", () => {
    // **FINDING Q1, and this row is its resolution.** The reword arrived with a second clause for a
    // shrink — „coloana ar elibera N mm" — and it was dead copy: no command can produce a
    // `NO_EMPTY_SPACE` whose `deltaMm` is negative. The clause is gone, and the sweep that found it
    // stays, inverted into the anti-invariant that keeps it gone. **The assertion is the same
    // measurement**; what changed is which way round it reads, because the deletion is the fix.
    //
    // The deadness predates wave 5B1: ADR 0035 decision 7 made every shrink self-funding, and that
    // is what closed the path. ADR 0043 records the removal.
    //
    // The argument, from `plan-width-funding.ts`: on a shrink `evaluateEmptySpace` cannot fail with
    // anything but `absent` — `remainderMm = extent − delta` and `delta < 0`, so the remainder is
    // always above the extent and `remainderMm < 0` is unreachable — and when both sides are
    // `absent`, `fundingScan` appends `vacatedEmptySpace`, which is `undefined` only on a growth.
    // Every shrink therefore reaches `fundColumnResize` with at least one `ok` attempt, and the only
    // reasons that can be pushed after that are `key_taken` and `opens_a_gap`, which
    // `refuseNoSideFunds` renders as `COLUMN_KEY_COLLISION` and `RESIZE_OPENS_GAP`.
    //
    // The sweep below is the evidence rather than the argument — the same reason the row it replaced
    // in `rejection.test.ts` could not carry it: that one called `renderRejection` directly.
    const reached: string[] = [];
    for (const { world, placementId, widthMm } of everyTap()) {
      const result = resizeTo(world, placementId, widthMm);
      if (result.ok) continue;
      if (result.reason.code !== "NO_EMPTY_SPACE") continue;
      if (result.reason.params.deltaMm >= 0) continue;
      reached.push(result.reason.message);
    }

    expect(reached).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Q — the removed union arm leaves nothing unrenderable.
// ---------------------------------------------------------------------------

describe("every per-side reason a command can still produce has a sentence", () => {
  it("renders a non-empty Romanian clause for each reason the sweep reaches", () => {
    const reasons = new Set<string>();
    let refusals = 0;
    for (const { world, placementId, widthMm } of everyTap()) {
      const result = resizeTo(world, placementId, widthMm);
      if (result.ok) continue;
      const params = result.reason.params as {
        sides?: readonly { readonly reason: string }[];
      };
      for (const side of params.sides ?? []) reasons.add(side.reason);
      expect(result.reason.message).not.toContain("undefined");
      refusals += 1;
    }

    // `absent` and `too_narrow` are the two the shipped kitchen reaches; `opens_a_gap` comes from
    // the corner leg. `remainder_below_floor` must not appear, and nothing must appear that the
    // Romanian map has no entry for.
    expect([...reasons].sort()).not.toContain("remainder_below_floor");
    expect(reasons.size).toBeGreaterThan(0);
    expect(refusals).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Q — `base-bottle-cargo`, ADR 0026's 200 mm exception.
// ---------------------------------------------------------------------------

describe("the 200 mm cargo exception is neither widened nor closed", () => {
  it("keeps its declared floor at 200 mm", () => {
    expect(KITCHEN_L_BODY_CATALOG.get("base-bottle-cargo")?.minWidthMm).toBe(
      200,
    );
  });

  it("builds nothing under 300 mm but an entry that declares its own lower floor", () => {
    // The near-miss `docs/BACKLOG.md` entry 2 records is a floor leaking sideways. A resize that now
    // leaves a 200 mm *gap* must never leave a 200 mm *cabinet* whose row declares 300.
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

// ---------------------------------------------------------------------------
// Q — the census delta, derived independently of the code that changed.
//
// The edited counts (450 → 466 in `qa-w5c.enumeration.test.ts`, 230 → 238 in three other files) are
// only the *correct* new behaviour if every newly-accepted tap is a growth ADR 0043 should unlock.
// The superseded rule is re-implemented from ADR 0031's text below and applied to the engine's own
// answers, so this row measures the delta without reading the guard that was deleted.
// ---------------------------------------------------------------------------

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
    // 466 − 450. Every entry is a growth into a column the clear freed, stopping short of consuming
    // it — which is precisely and only what ADR 0043 permits.
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

  it("accepts 466 taps across the nine clears, of which 450 the old floor also allowed", () => {
    // Both totals from one sweep, so the pinned 466 cannot go green on a different population.
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

    expect([accepted, accepted - unlockedByThisWave]).toEqual([466, 450]);
  });
});
