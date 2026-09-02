// **Shrinking frees one space, not a row of slivers** — ADR 0035 decision 7, and the half of it
// that was missing until 2026-08-29.
//
// Six presses of `−50` on a 600 mm run used to leave **six separate 50 mm columns**: 300 mm of
// contiguous wall that could hold nothing, because each press created a new strip beside the last
// instead of widening it. The cause was `remainder_below_floor` firing on a *shrink* — the second
// press found the first strip, computed a 100 mm remainder, refused it as a sliver, fell through,
// and parked another. A shrink only ever widens the column it returns space to, so that floor now
// applies to growth alone.
//
// **This file was `set-width.merges-empty-columns.test.ts`.** ADR 0037's merge shipped beside the
// fix and was withdrawn the same day (QA finding A) — see the note at the foot of this file and
// `void-engine.ts`'s `recomputeVoids`. What is asserted here never depended on it: these
// numbers are unchanged with the merge disabled, which is how it was established that the merge was
// not what fixed them.
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
import {
  advanceWithColumns,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { resizeTo } from "../support/commands.js";
import { syntheticWorld } from "../support/synthetic-world.js";

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

/** The empty spaces on wall A, as `[key, widthMm]` per column — the only shape these tests care
 *  about, because ADR 0035 decision 7 is a rule about how many spaces a shrink leaves and how wide each one is. */
function emptySpans(world: KitchenWorld): [string, number][] {
  const occupied = new Set(world.records.map((record) => record.col));
  return [...world.columns.values()]
    .filter((column) => !occupied.has(column.key) && column.wall === "A")
    .map((column): [string, number] => [
      column.key,
      Math.round(column.w * 1000),
    ])
    .sort((left, right) => left[0].localeCompare(right[0]));
}

/** One `−50` press, applied the way the store applies it: the design **and** the map the command
 *  published (ADR 0011 Gap D — a resize is the one command that moves an empty column). */
function stepDown(world: KitchenWorld, id: string, toMm: number): KitchenWorld {
  const result = resizeTo(world, id, toMm);
  if (!result.ok) {
    throw new Error(`Step to ${String(toMm)} refused: ${result.reason.code}`);
  }
  return advanceWithColumns(world, result.design, result.effect.columns);
}

describe("six presses of −50 free one space, not six slivers", () => {
  // A 600 mm cabinet with a 300 mm floor, stepped all the way down. Before the merge each shrink
  // fell through to `vacatedEmptySpace` and created a **new** strip: the second press could not
  // widen the first 50 mm strip because `evaluateEmptySpace` refused `remainder_below_floor` at a
  // remainder of 100. The fix here was to stop applying that floor to a shrink — returning space to
  // a strip cannot make a sliver, it can only unmake one. It went on guarding a growth until
  // **ADR 0043** removed it from that side too, and the refusal no longer exists at all.
  function oneRun(): KitchenWorld {
    return syntheticWorld([
      placement("run-base", 1000, 0, "base-panbank", 600, 860),
    ]);
  }

  it("leaves a single 300 mm space where six 50 mm strips used to stand", () => {
    let world = oneRun();

    for (const widthMm of [550, 500, 450, 400, 350, 300]) {
      world = stepDown(world, "run-base", widthMm);
    }

    // The run is 600 at 1000, so it spans 700–1300; every shrink holds the left edge, and the
    // 300 mm it ends up giving back is one strip at 1000–1300, keyed on its centre.
    expect(emptySpans(world)).toEqual([["A|1.15", 300]]);
  });

  it("widens the same space on every press rather than adding one", () => {
    let world = oneRun();
    const counts: number[] = [];

    for (const widthMm of [550, 500, 450, 400, 350, 300]) {
      world = stepDown(world, "run-base", widthMm);
      counts.push(emptySpans(world).length);
    }

    expect(counts).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

// **The merge's own cases were here and are withdrawn with it** (QA finding A, 2026-08-29). They
// asserted what ADR 0037 promises — two cleared columns giving one 1400 mm space, still capped at
// 800 for any single cabinet, nothing merging across a part-emptied column or a non-neighbour — and
// every one of them passed. The merge was correct and still made the customer worse off, because §4
// has no horizontal half: a 600 mm cabinet inserted into that 1400 mm space closes the level and
// strands 800 mm of wall. `void-engine.ts`'s `recomputeVoids` carries the full reasoning.
//
// They belong with backlog 2's re-split, in the wave that builds it. What survives above is the
// half this wave was actually asked for, and it never needed the merge: the slivers were
// `remainder_below_floor` firing on shrinks, and fixing that is what makes six presses free one
// space. Measured with the merge disabled, and it is unchanged.
