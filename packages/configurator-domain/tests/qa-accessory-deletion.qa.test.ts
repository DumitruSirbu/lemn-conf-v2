// Adversarial QA over the ADR 0038 deletion of the standalone accessory machinery.
//
// The wave's claim is that the deletion is behaviour-free. At HEAD every consumer branched on
// `PlacementRecord.accessory`, derived as `frame.h < ACCESSORY_MAX_HEIGHT_M` (0.3 m) — `groupByColumn`
// skipped one, `isFullHeightUnder` skipped one, `insert-fit` refused one as a swap target, `setWidth`
// excluded one from column membership and from the occupied-column set, and `removePlacement`
// refused one by name. The claim therefore reduces to a single property:
//
//     no design a customer can reach contains a placement whose frame height is below 0.3 m.
//
// If that property holds, every deleted branch was unreachable and the removal changed nothing. If
// it fails anywhere, the removal silently reclassified a body — it now joins its column, counts
// toward that column's regions and extent, and becomes deletable.
//
// The wave deleted the sweep that proved this (the "cannot be reached by inserting anything the
// catalogue offers, anywhere" case in `queries/hob-base.adversarial.test.ts`). It is rebuilt here in
// the post-deletion vocabulary, because the premise it pins outlived the concept it was written for.
import { listInsertableBodies } from "../src/catalog.js";
import {
  evaluateInsertFit,
  resolveInsertOpening,
} from "../src/commands/insert-fit.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../src/millimetres.js";
import { MIN_SPAN_M, type PlacementRecord } from "../src/void-engine.js";
import { describe, expect, it } from "vitest";

import { clearBodies, insertInto } from "./support/commands.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "./support/kitchen-world.js";

/** The height below which HEAD classified a record as a worktop accessory. */
const RETIRED_ACCESSORY_MAX_HEIGHT_M = 0.3;

const seeded = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function shortRecords(records: readonly PlacementRecord[]): string[] {
  return records
    .filter((record) => record.frame.h < RETIRED_ACCESSORY_MAX_HEIGHT_M)
    .map(
      (record) =>
        `${record.id} (${record.buildId}) at ${String(toMillimetres(record.frame.h))} mm`,
    );
}

describe("the deletion is behaviour-free: nothing reachable is accessory-height", () => {
  it("the shipped design carries no placement below 0.3 m", () => {
    expect(shortRecords(seeded().records)).toEqual([]);
  });

  // The catalogue is the population, not the fixture. `frame.h` is `frameHeightMm ?? heightMm`, so a
  // seeded entry can declare a height its placement does not — which is exactly how `cooktop-600`
  // became an accessory at 40 mm while its placement declared 40 too.
  it("no catalogue entry declares a frame height below 0.3 m", () => {
    const declared = [...KITCHEN_L_BODY_CATALOG.entries()]
      .filter(
        ([, definition]) =>
          definition.frameHeightMm !== undefined &&
          definition.frameHeightMm <
            toMillimetres(RETIRED_ACCESSORY_MAX_HEIGHT_M),
      )
      .map(([buildId]) => buildId);

    expect(declared).toEqual([]);
  });

  // The sweep the wave deleted, restated. Every insertable entry against every opening three
  // reachable worlds can produce: none of them builds a body short enough to have been an accessory.
  // §4 is the reason — an interval becomes an opening only when it exceeds `MIN_SPAN_M`, which is the
  // same 0.3 m — but "the constant happens to match" is not the same claim as "no path reaches it".
  it("cannot be reached by inserting anything the catalogue offers, anywhere", () => {
    const worlds = [seeded(), clearedHobColumn(), clearedFridgeColumn()];
    const bodies = listInsertableBodies(KITCHEN_L_BODY_CATALOG);
    let fitsSeen = 0;
    const tooShort: string[] = [];

    for (const world of worlds) {
      for (const record of world.voids) {
        const resolved = resolveInsertOpening({
          ...world,
          target: { kind: "void", id: record.id },
        });
        if (!resolved.ok) continue;
        for (const body of bodies) {
          const fit = evaluateInsertFit({
            body,
            opening: resolved.value.opening,
            column: resolved.value.column,
          });
          if (!fit.ok) continue;
          fitsSeen += 1;
          if (fit.plan.heightM < RETIRED_ACCESSORY_MAX_HEIGHT_M) {
            tooShort.push(
              `${body.buildId} → ${String(toMillimetres(fit.plan.heightM))} mm at ${record.id}`,
            );
          }
        }
      }
    }

    // The sweep must have found openings, or it proves nothing.
    expect(fitsSeen).toBeGreaterThan(0);
    expect(tooShort).toEqual([]);
  });

  // A separate claim, and deliberately not folded into the sweep above: that no *opening* can be
  // shorter than the retired threshold is a fact about `MIN_SPAN_M`, while the sweep proves no
  // *body* lands under it. The two agree today at 0.3 m, and the day they stop this test is what
  // says so.
  it("no opening can be shorter than the retired accessory threshold", () => {
    expect(MIN_SPAN_M).toBe(RETIRED_ACCESSORY_MAX_HEIGHT_M);
  });

  // A real insert, actually applied, rather than the fit plan alone: the placement that lands in the
  // design must not be accessory-height either. `heightMm` is written from `plan.heightM` through
  // `toExactMillimetres`, and it is the written value the next derivation reads.
  it("no applied insert writes a placement below 0.3 m", () => {
    const world = clearedHobColumn();
    const opening = world.voids.find((record) => record.col === "A|2.60");
    expect(opening).toBeDefined();
    if (!opening) return;

    const result = insertInto(
      world,
      { kind: "void", id: opening.id },
      "base-hob-2drawer",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(shortRecords(advance(world, result.design).records)).toEqual([]);
  });
});

function clearedHobColumn(): KitchenWorld {
  return clearBodies(seeded(), ["p2"]);
}

function clearedFridgeColumn(): KitchenWorld {
  return clearBodies(seeded(), ["p24", "p7"]);
}
