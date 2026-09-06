// **The fact that makes the owner's *no height rule* ruling and the 900 mm hinge threshold
// consistent with each other, rather than merely coexisting** (ADR 0092 decision 5).
//
// The owner ruled on 2026-09-05 that a taller cabinet adds no mechanism: there is no height-keyed
// *mechanism* rule, and width decides, through the door and drawer counts a body's width already
// determines. ADR 0070's third hinge over 900 mm looks like a counter-example to that ruling — a
// height that changes a mechanism count — and it is not one, because **no flexible row can reach
// the threshold**. Every leaf over 900 mm in the catalogue is a fixed declaration.
//
// That is a claim about the whole catalogue at every size it can be built to, so it is asserted as
// a swept property and not as two examples. The bound is real rather than incidental:
// `CABINET_SIZED_OPENING_MAX_M` caps a cabinet-sized opening at 900 mm and
// `WALL_DOOR_BAND_INSET_MM` takes 6 more off it, so **894 mm is the tallest band such a row can
// ever declare** — six millimetres below the threshold, and it is that six millimetres the ruling
// rests on.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  doorLeafHeightsMm,
  KITCHEN_L_BODY_CATALOG,
  TALL_DOOR_LEAF_THRESHOLD_MM,
  WALL_DOOR_BAND_INSET_MM,
  type BodyDefinition,
  type FrontPopulationQuery,
} from "../src/index.js";
import {
  CABINET_SIZED_OPENING_MAX_M,
  HEIGHT_FLEX_MIN_OPENING_MM,
} from "../src/commands/insert-fit.js";
import { KITCHEN_L_PLACEMENTS } from "../src/fixtures/kitchen-l-design.js";

/** §5.2's cap, in the millimetres this file works in. */
const CABINET_SIZED_OPENING_MAX_MM = CABINET_SIZED_OPENING_MAX_M * 1000;

/** The tallest band a `one-band-under-frame` row can ever declare. Derived from the two constants
 *  rather than typed as `894`, so a wave that moves either one moves this with it. */
const TALLEST_FLEXIBLE_BAND_MM =
  CABINET_SIZED_OPENING_MAX_MM - WALL_DOOR_BAND_INSET_MM;

/** The widths each seeded row actually stands at in the fixture. A seeded entry declares no width of
 *  its own (ADR 0011 Gap A: it *is* one already-built body), so the built size has to be read off
 *  the placements rather than guessed at with a nominal the definition does not carry. */
const SEEDED_WIDTHS_BY_BUILD_ID: ReadonlyMap<string, readonly number[]> =
  KITCHEN_L_PLACEMENTS.reduce((widths, placement) => {
    const known = widths.get(placement.body.buildId) ?? [];
    return widths.set(placement.body.buildId, [
      ...known,
      placement.body.widthMm,
    ]);
  }, new Map<string, number[]>());

/** Every width a row can be built to — the sizes an insertable row declares, and the already built
 *  sizes a seeded row stands at (ADR 0011 Gap A). */
function legalWidthsMm(
  buildId: string,
  definition: BodyDefinition,
): readonly number[] {
  if (definition.insertable === true) return definition.sizesMm ?? [];
  return SEEDED_WIDTHS_BY_BUILD_ID.get(buildId) ?? [];
}

/** Every frame height a row can be built to. A `heightFlex` row fills any cabinet-sized opening and
 *  otherwise builds its nominal (`resolveHeightM`), so its legal heights are the whole opening range
 *  **and** the nominal it falls back to above the cap. A fixed row is only ever its nominal. */
function legalFrameHeightsMm(definition: BodyDefinition): readonly number[] {
  const nominalMm = definition.nominalHeightMm ?? 0;
  if (!definition.heightFlex) return [nominalMm];

  const openings: number[] = [];
  for (
    let heightMm = HEIGHT_FLEX_MIN_OPENING_MM;
    heightMm <= CABINET_SIZED_OPENING_MAX_MM;
    heightMm += 1
  ) {
    openings.push(heightMm);
  }
  return [...openings, nominalMm];
}

interface SweptLeaf {
  readonly buildId: string;
  readonly widthMm: number;
  readonly frameHeightMm: number;
  readonly leafHeightMm: number;
  readonly measuredFrom: string;
}

/** Every leaf of every catalogue entry at every legal size — the whole sweep, materialised once so
 *  the assertions below read off one measurement rather than three. */
const EVERY_LEAF: readonly SweptLeaf[] = [...KITCHEN_L_BODY_CATALOG].flatMap(
  ([buildId, definition]) =>
    legalWidthsMm(buildId, definition).flatMap((widthMm) =>
      legalFrameHeightsMm(definition).flatMap((frameHeightMm) => {
        const query: FrontPopulationQuery = {
          buildId,
          rule: definition.fronts,
          widthMm,
          frameHeightMm,
        };
        return doorLeafHeightsMm(query).map((leafHeightMm) => ({
          buildId,
          widthMm,
          frameHeightMm,
          leafHeightMm,
          measuredFrom: definition.fronts?.doorBands.measuredFrom ?? "none",
        }));
      }),
    ),
);

describe("no leaf over 900 mm can come from a flexible row", () => {
  it("sweeps every entry at every legal size, and is not a vacuous sweep", () => {
    const sweptIds = new Set(EVERY_LEAF.map((leaf) => leaf.buildId));

    expect(sweptIds.size).toBeGreaterThan(20);
    expect(EVERY_LEAF.length).toBeGreaterThan(1000);
  });

  it("keeps every one-band-under-frame leaf at or under 894 mm", () => {
    const overTheCeiling = EVERY_LEAF.filter(
      (leaf) =>
        leaf.measuredFrom === "one-band-under-frame" &&
        leaf.leafHeightMm > TALLEST_FLEXIBLE_BAND_MM,
    );

    expect(overTheCeiling).toEqual([]);
    // The ceiling is six millimetres below the threshold, which is the whole margin.
    expect(TALLEST_FLEXIBLE_BAND_MM).toBeLessThan(TALL_DOOR_LEAF_THRESHOLD_MM);
  });

  it("finds every leaf over the threshold in a declared-heights row", () => {
    const tall = EVERY_LEAF.filter(
      (leaf) => leaf.leafHeightMm > TALL_DOOR_LEAF_THRESHOLD_MM,
    );

    expect(tall.every((leaf) => leaf.measuredFrom === "declared-heights")).toBe(
      true,
    );
    // The pantry's 1290 and the fridge housing's 1350, and nothing else in the catalogue.
    expect([...new Set(tall.map((leaf) => leaf.leafHeightMm))].sort()).toEqual([
      1290, 1350,
    ]);
  });

  // The enumeration above is exhaustive over the shipped rows; this states the *rule* it rests on,
  // over frame heights the catalogue does not happen to contain, so a row added at a size nobody
  // swept is still covered.
  propertyTest.prop([
    fc.integer({
      min: HEIGHT_FLEX_MIN_OPENING_MM,
      max: CABINET_SIZED_OPENING_MAX_MM,
    }),
  ])(
    "holds for any cabinet-sized opening, not only the swept ones",
    (frameHeightMm) => {
      const leaves = doorLeafHeightsMm({
        buildId: "wall-lift",
        rule: KITCHEN_L_BODY_CATALOG.get("wall-lift")?.fronts,
        widthMm: 600,
        frameHeightMm,
      });

      expect(
        leaves.every(
          (leafHeightMm) => leafHeightMm <= TALLEST_FLEXIBLE_BAND_MM,
        ),
      ).toBe(true);
    },
  );
});
