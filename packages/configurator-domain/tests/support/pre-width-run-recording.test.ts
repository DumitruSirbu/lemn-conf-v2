// M7 wave 7D5 S1 — the pre-width recording's reader and the baseline writer are one contract.
//
// `parseRecordedCanonicalPlan` hand-decodes the string `canonicalPlan` writes in
// `composed-run-baseline.ts`. The two live in different files, so a field added, reordered or
// re-spelled on the writer's side would leave the reader decoding the old shape — and every 7D5
// comparison that reads the recording through it would compare against a mis-read plan while
// staying green. Round-tripping real plans through both halves pins that they agree field by field.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
  type KitchenCompositionPlan,
} from "../../src/index.js";
import {
  approvedLRoom,
  canonicalPlan,
  coreRolesOnWallB,
} from "./composed-run-baseline.js";
import { parseRecordedCanonicalPlan } from "./pre-width-run-recording.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const ROUND_TRIP_RUNS = 500;
const ROUND_TRIP_SEED = 20260921;

/** Rooms that reach the string's edge shapes, so the property is not left to draw them: a refused
 *  kitchen (no modules, every role dropped), a wall with no floor widths, a dropped list of two, and
 *  a bottle with a block. */
const EDGE_SHAPE_ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 900, depthMm: 2000, heightMm: 2200 },
  { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 912, depthMm: 2783, heightMm: 3539 },
  { shape: "L", widthMm: 3849, depthMm: 5065, heightMm: 3546 },
];

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** Every field the writer records, read off the plan itself rather than off either half under test. */
function fieldsTheWriterRecords(plan: KitchenCompositionPlan) {
  return {
    minimumMet: plan.minimumMet,
    cut: coreRolesOnWallB(plan),
    dropped: [...plan.dropped],
    remainderMm: { A: plan.remainderMm.A, B: plan.remainderMm.B },
    floorWidthsMm: {
      A: [...plan.floorWidthsMm.A],
      B: [...plan.floorWidthsMm.B],
    },
    bases: plan.bases.map(
      ({ id, role, buildId, wall, startMm, endMm, widthMm }) => ({
        id,
        role,
        buildId,
        wall,
        startMm,
        endMm,
        widthMm,
      }),
    ),
  };
}

describe("the pre-width recording reader decodes what the baseline writer writes", () => {
  it.each(EDGE_SHAPE_ROOMS)("round-trips the whole plan in %o", (room) => {
    const plan = planFor(room);

    expect(parseRecordedCanonicalPlan(canonicalPlan(plan))).toEqual(
      fieldsTheWriterRecords(plan),
    );
  });

  it("reaches every edge shape it names", () => {
    const plans = EDGE_SHAPE_ROOMS.map(planFor);

    expect(plans.some((plan) => !plan.minimumMet)).toBe(true);
    expect(plans.some((plan) => plan.floorWidthsMm.A.length === 0)).toBe(true);
    expect(plans.some((plan) => plan.dropped.length === 2)).toBe(true);
    expect(
      plans.some((plan) => plan.bases.some((base) => base.id === "bottle")),
    ).toBe(true);
  });

  it("round-trips every plan drawn from the approved policy", () => {
    fc.assert(
      fc.property(approvedLRoom(), (room) => {
        const plan = planFor(room);

        expect(parseRecordedCanonicalPlan(canonicalPlan(plan))).toEqual(
          fieldsTheWriterRecords(plan),
        );
      }),
      { numRuns: ROUND_TRIP_RUNS, seed: ROUND_TRIP_SEED },
    );
  });

  it("refuses a module whose wall is not one the writer can write", () => {
    const written = canonicalPlan(
      planFor(EDGE_SHAPE_ROOMS[1] ?? KITCHEN_L_DESIGN.room),
    );

    expect(() =>
      parseRecordedCanonicalPlan(written.replace("~B~", "~C~")),
    ).toThrow(/invalid module/);
  });
});
