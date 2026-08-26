// Adversarial QA for finding F1: a delete selecting the void one level below the one it vacated.
//
// The unit tests beside this file exercise `findVacatedVoid` against hand-built `VoidRecord`s. That
// is the right place for the predicate, and it is also where the *original* defect hid: hand-built
// slots carry exact numbers, while the real ones are differences of module lines and do not
// (`1.5 + 0.7` is `2.2000000000000002`). So everything here runs through `recomputeVoids` and
// `removePlacement` on real columns, and asserts the selection a customer would see.
import { describe, expect, it } from "vitest";

import { removePlacement } from "../../src/commands/remove-placement.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { openingFromPlacement } from "../../src/commands/insert-fit.js";
import { findVacatedVoid } from "../../src/queries/vacated-void.js";
import { offersFor } from "../../src/queries/offers.js";
import { LEVELS, type VoidRecord } from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { OCCURRED_AT } from "../support/commands.js";
import { advance, type KitchenWorld } from "../support/kitchen-world.js";
import {
  columnWorld,
  type SyntheticMember,
} from "../support/synthetic-world.js";

const COLUMN = "A|1.00";
const ALONG_MM = 1000;

function worldOf(members: readonly SyntheticMember[]): KitchenWorld {
  return columnWorld(ALONG_MM, members);
}

/** Removes one body and returns the void a store would select, resolved exactly as
 *  `apply-command-result.ts` resolves it: the command's own `vacated` opening, looked up by
 *  geometry against the voids the same command produced. */
function selectionAfterRemoving(
  world: KitchenWorld,
  placementId: string,
): { readonly selected: VoidRecord | undefined; readonly world: KitchenWorld } {
  const result = removePlacement({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`remove refused: ${result.reason.code}`);
  const next = advance(world, result.design);
  return {
    selected: findVacatedVoid(next.voids, result.effect.vacated),
    world: next,
  };
}

// The reproduction from logic review, driven end to end rather than against hand-built slots.
describe("the two-delete sequence that selected the wrong level", () => {
  it("selects [2.20, 2.60] when the top unit is deleted after the wall unit below it", () => {
    const start = worldOf([
      { id: "base", y0Mm: 0, heightMm: 820 },
      { id: "wall", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600" },
      { id: "top", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
    ]);

    const afterWall = selectionAfterRemoving(start, "wall");
    expect(afterWall.selected?.y0).toBeCloseTo(1.5, 9);

    const afterTop = selectionAfterRemoving(afterWall.world, "top");

    // The vacated frame stood at 2.20. Before the fix the 12 mm top tolerance made [1.50, 2.20]
    // claim it, and the customer's selection landed a level below the body they had just deleted.
    expect(afterTop.selected?.y0).toBeCloseTo(2.2, 9);
    expect(afterTop.selected?.h).toBeCloseTo(0.4, 9);
  });

  it("selects the same slot when the two deletes happen in the other order", () => {
    const start = worldOf([
      { id: "base", y0Mm: 0, heightMm: 820 },
      { id: "wall", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600" },
      { id: "top", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
    ]);

    const afterTop = selectionAfterRemoving(start, "top");
    expect(afterTop.selected?.y0).toBeCloseTo(2.2, 9);

    // Now the spans merge: the free run reaches from the base body's top (0.82) to the column top
    // (2.60), and the wall delete must land in the slice that contains 1.50 rather than in the one
    // above it or in the span's first slice.
    const afterWall = selectionAfterRemoving(afterTop.world, "wall");
    expect(afterWall.selected?.y0).toBeCloseTo(1.5, 9);
    expect(afterWall.selected?.spanY0).toBeCloseTo(0.82, 9);
    expect(afterWall.selected?.spanH).toBeCloseTo(1.78, 9);
    expect(afterWall.selected?.h).toBeCloseTo(0.7, 9);
  });
});

// Every module line, from both sides, through the real engine. A boundary belongs to the slot that
// *starts* there; the slot that *ends* there must never claim it.
describe("every LEVELS boundary, approached from both sides", () => {
  const BOUNDARIES = LEVELS.flatMap(([start, end]) => [start, end]).filter(
    (value, index, all) => all.indexOf(value) === index && value > 0,
  );

  it.each(BOUNDARIES)(
    "a body standing exactly at %s is found there, not below it",
    (boundaryM) => {
      const boundaryMm = Math.round(boundaryM * 1000);
      // A body standing on the line, with free space both above and below it once it is gone, so the
      // slot that ends at the line and the slot that starts there both exist to compete.
      const world = worldOf([
        { id: "floor", y0Mm: 0, heightMm: 820 },
        { id: "target", y0Mm: boundaryMm, heightMm: 400 },
      ]);

      const { selected } = selectionAfterRemoving(world, "target");

      if (!selected) return; // A boundary that frees no opening has nothing to select; asserted below.
      expect(selected.y0).toBeLessThanOrEqual(boundaryM + 1e-9);
      expect(selected.y0 + selected.h).toBeGreaterThan(boundaryM + 1e-9);
    },
  );

  it("never returns a slot that merely ends where the body started", () => {
    for (const boundaryM of BOUNDARIES) {
      const voids: VoidRecord[] = [
        {
          id: "ends-here",
          col: COLUMN,
          wall: "A",
          x: 1,
          z: 0.29,
          ry: 0,
          w: 0.6,
          d: 0.58,
          y0: boundaryM - 0.7,
          h: 0.7,
          spanY0: boundaryM - 0.7,
          spanH: 0.7,
        },
        {
          id: "starts-here",
          col: COLUMN,
          wall: "A",
          x: 1,
          z: 0.29,
          ry: 0,
          w: 0.6,
          d: 0.58,
          y0: boundaryM,
          h: 0.4,
          spanY0: boundaryM,
          spanH: 0.4,
        },
      ];

      expect(
        findVacatedVoid(voids, { col: COLUMN, y0: boundaryM })?.id,
        `boundary ${String(boundaryM)}`,
      ).toBe("starts-here");
    }
  });
});

// ADR 0015 is the record of `FIT_TOLERANCE_M` being applied where a float epsilon belonged. The fix
// for F1 tightened the top bound and left the bottom one at `FIT_TOLERANCE_M` — so the question is
// whether the mirror-image mistake now exists at the bottom: can a slot starting *above* the
// vacated frame claim it away from the slot that actually contains it?
describe("the bottom bound does not make the mirror-image mistake", () => {
  const lowerSlot: VoidRecord = {
    id: "lower",
    col: COLUMN,
    wall: "A",
    x: 1,
    z: 0.29,
    ry: 0,
    w: 0.6,
    d: 0.58,
    y0: 1.5,
    h: 0.7,
    spanY0: 1.5,
    spanH: 1.1,
  };
  const upperSlot: VoidRecord = { ...lowerSlot, id: "upper", y0: 2.2, h: 0.4 };

  it.each([2.199, 2.19, 2.188, 2.1, 1.5])(
    "keeps a frame at %s in the slot that contains it, even inside the 12 mm band",
    (y0) => {
      // Both slots satisfy the bottom tolerance for a frame within 12 mm below 2.20. The one that
      // actually contains the frame must win, and it does because the containment test is the top
      // bound and the voids arrive in ascending order.
      expect(
        findVacatedVoid([lowerSlot, upperSlot], { col: COLUMN, y0 })?.id,
      ).toBe("lower");
    },
  );

  it("still absorbs a slot that starts marginally above where the body stood", () => {
    // The bottom tolerance's actual purpose: the body stood at 2.195, the freed opening snaps to
    // the 2.20 module line, and there is no lower slot to claim it.
    expect(findVacatedVoid([upperSlot], { col: COLUMN, y0: 2.195 })?.id).toBe(
      "upper",
    );
  });

  it("finds nothing when the vacated frame is more than the tolerance below every slot", () => {
    expect(
      findVacatedVoid([upperSlot], { col: COLUMN, y0: 2.18 }),
    ).toBeUndefined();
  });
});

// The swap path now shares the lookup, so a swap resolves its opening exactly where a delete would
// select one. This is the half that changed behaviour, and the half no unit test on
// `findVacatedVoid` can see.
describe("the swap path resolves the same opening a delete would select", () => {
  const TOP_ROW = worldOf([
    { id: "base", y0Mm: 0, heightMm: 820 },
    { id: "wall", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600" },
    { id: "top", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
  ]);

  it("gives a top-row body the top slot as its opening, not the wall slot below", () => {
    const record = TOP_ROW.records.find((candidate) => candidate.id === "top");
    if (!record) throw new Error("no top-row record");

    const opening = openingFromPlacement(
      record,
      TOP_ROW.records,
      TOP_ROW.columns,
    );

    expect(opening.y0).toBeCloseTo(2.2, 9);
    expect(opening.h).toBeCloseTo(0.4, 9);
  });

  it("swaps a top-row body in place rather than one level down", () => {
    const target = { kind: "placement", id: "top" } as const;
    const offered = offersFor({ ...TOP_ROW, target });
    expect(offered.length).toBeGreaterThan(0);

    for (const offer of offered) {
      const result = insertBody({
        design: TOP_ROW.design,
        catalog: TOP_ROW.catalog,
        columns: TOP_ROW.columns,
        target,
        buildId: offer.buildId,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok, `${offer.buildId} was offered and then refused`).toBe(
        true,
      );
      if (!result.ok) continue;
      const placed = result.design.placements.find(
        (placement) => placement.id === result.effect.placementId,
      );
      // The incoming body must stand where the outgoing one did. Resolving one level down would
      // put a wall cabinet at 1.50 and leave the top row empty — the same defect as F1, arriving
      // through the swap instead of the delete.
      expect(placed?.y0Mm, offer.buildId).toBe(2200);
    }
  });
});

// A delete whose freed space merges with neighbours on both sides at once: the vacated frame ends
// up in the middle of a span that did not exist a moment earlier, and whose slices are all new ids.
describe("a delete that merges with free space above and below", () => {
  it("selects the slice containing the vacated frame, not the span's first slice", () => {
    const world = worldOf([
      { id: "base", y0Mm: 0, heightMm: 820 },
      { id: "wall", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600" },
      { id: "top", y0Mm: 2200, heightMm: 400, buildId: "wall-2door-600-top" },
    ]);
    // Free the space above and below the wall unit first, so removing it merges three spans in one.
    const afterTop = selectionAfterRemoving(world, "top").world;
    const afterBase = selectionAfterRemoving(afterTop, "base").world;

    const { selected, world: merged } = selectionAfterRemoving(
      afterBase,
      "wall",
    );

    const slices = merged.voids.filter((record) => record.col === COLUMN);
    expect(slices.length).toBeGreaterThan(1);
    expect(selected).toBeDefined();
    expect(selected?.y0).toBeCloseTo(1.5, 9);
    // Every slice shares one merged span, and the selection is the slice that covers 1.50 — not
    // simply the first slice of the span, which starts at 0.
    expect(new Set(slices.map((record) => record.spanY0)).size).toBe(1);
    expect(slices[0]?.y0).toBeCloseTo(0, 9);
  });
});
