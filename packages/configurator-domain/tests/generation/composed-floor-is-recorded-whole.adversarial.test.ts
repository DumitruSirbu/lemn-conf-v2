// **Measured on the design, never on the plan.**
//
// A generated kitchen was shipping a 10–200 mm strip of bare floor between the corner cabinet and
// the run beside it, on 4 413 of 211 551 placed rooms — and every instrument in the suite agreed the
// kitchen was correct, because every one of them measured `KitchenCompositionPlan` and **the plan
// was right**. On the witness below the plan puts wall A's sink at 900–1500 and the built design
// ships `base-corner-x-900[0,900]`, 50 mm of nothing, then `base-sink[950,1550]`. A composed design
// that contradicts its own plan is exactly what a plan-side assertion cannot see, so this file
// compares the two and then asks the design alone.
//
// **The defect belongs to the resize, not to the composer** — the same strip is reachable by hand on
// the shipped reference kitchen, which `tests/commands/set-width.records-the-strip-it-hands-over.test.ts`
// walks. What generation contributes is reach: the free-end fit-body shrink runs on every room whose
// prefix wall ends in a fit body, so a command-level defect became a shipped one.
//
// **The sweep is over the whole approved L**, on one grid, and is deliberately not narrowed to where
// the strip was found — the wall A entered lengths 1 510–1 700 carry every one of the 4 413, and a
// sweep shaped around that answer would prove only that the answer was copied correctly. Measured at
// 10 mm over all 222 351 rooms the pre-7A3 policy admitted, the symptom set was 4 413 rooms, all on wall A and all with
// the strip against the corner; **21 of them fall on this file's 100 mm grid**, which is the arm that
// makes it fail. The height is held at one value because the strip is a floor fact — the run, the
// corner body and the wall row's origin do not move with the ceiling — so sweeping it would multiply
// the cost by a constant for no new arm.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  deriveColumns,
  derivePlacementRecords,
  generateKitchen,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type BodyCatalog,
  type Column,
  type Design,
  type DesignRoom,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { unrecordedFloorStripsMm } from "../support/floor-coverage.js";

const OCCURRED_AT = "2026-09-17T12:00:00.000Z";
const CATALOG: BodyCatalog = buildKitchenLBodyCatalog(
  cabinetDepthMmOf(KITCHEN_L_DESIGN),
);
const GRID_STEP_MM = 100;
const SWEPT_HEIGHT_MM = 2600;

/** The room the defect was found on, and the narrowest one that shows it: wall A's remainder is
 *  50 mm, its only base is the sink, and its outermost body is a fit body against the free end. */
const WITNESS: DesignRoom = {
  shape: "L",
  widthMm: 1550,
  depthMm: 1600,
  heightMm: 2600,
};

function compose(room: DesignRoom): Design | undefined {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  return result.ok ? result.design : undefined;
}

/** The published column map of a composed design — what the store would hold and the scene would
 *  draw, rather than anything generation said about it on the way. */
function publishedColumns(design: Design): ReadonlyMap<string, Column> {
  return deriveColumns(
    derivePlacementRecords(design, CATALOG),
    design,
    design.room,
  );
}

/** One wall's base row as the design ships it: build id and the two edges, corner outwards. */
function builtFloorRow(design: Design): readonly string[] {
  return design.placements
    .filter((placement) => placement.wall === "A" && placement.y0Mm === 0)
    .sort((left, right) => left.alongMm - right.alongMm)
    .map((placement) => {
      const halfMm = placement.body.widthMm / 2;
      return `${placement.body.buildId}[${String(placement.alongMm - halfMm)},${String(placement.alongMm + halfMm)}]`;
    });
}

describe("the witness room", () => {
  it("builds wall A's run where its own plan put it", () => {
    const plan = planKitchenComposition({
      room: WITNESS,
      runs: lShellFloorRuns(WITNESS),
      columns: declaredColumnSizes(CATALOG),
    });
    const design = compose(WITNESS);

    expect(design).toBeDefined();
    if (!design) return;
    const planned = plan.bases
      .filter((base) => base.wall === "A")
      .map(
        (base) =>
          `${base.buildId}[${String(base.startMm)},${String(base.endMm)}]`,
      );
    expect(planned).toEqual(["base-sink[900,1500]"]);
    expect(builtFloorRow(design)).toEqual([
      "base-corner-x-900[0,900]",
      "base-sink[900,1500]",
    ]);
  });

  it("records the 50 mm it does not build on", () => {
    // The remainder does not disappear and is not required to: ADR 0037 and ADR 0043 both say an
    // opening too narrow for any cabinet is a legal thing to leave. What it may not be is unrecorded.
    const design = compose(WITNESS);

    expect(design).toBeDefined();
    if (!design) return;
    expect(unrecordedFloorStripsMm(publishedColumns(design), "A")).toEqual([]);
  });
});

describe("every composed kitchen on the approved grid", () => {
  it("records every piece of floor its runs stand on", () => {
    const offenders: string[] = [];
    let composed = 0;
    for (const room of approvedGrid()) {
      const design = compose(room);
      if (!design) continue;
      composed += 1;
      const columns = publishedColumns(design);
      const strips = [
        ...unrecordedFloorStripsMm(columns, "A"),
        ...unrecordedFloorStripsMm(columns, "B"),
      ];
      if (strips.length > 0) {
        offenders.push(
          `${String(room.widthMm)}x${String(room.depthMm)} ${strips.join(",")}`,
        );
      }
    }

    // The count is asserted beside the verdict so that a sweep which silently stopped composing
    // anything cannot pass by having found no offender. 2202 before M7 7A3 moved both wall maxima to
    // 6000 mm; the grid follows the policy, so it gained wall B 5100–6000 and lost wall A 6100–6300.
    expect({
      composed,
      offending: offenders.length,
      first: offenders.slice(0, 5),
    }).toEqual({ composed: 2544, offending: 0, first: [] });
  });
});

/** Every L the approved policy admits, on one grid, at one height. */
function approvedGrid(): readonly DesignRoom[] {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy states no L to sweep");
  const rooms: DesignRoom[] = [];
  for (
    let widthMm = l.wallA.minMm;
    widthMm <= l.wallA.maxMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = l.wallB.minMm;
      depthMm <= l.wallB.maxMm;
      depthMm += GRID_STEP_MM
    ) {
      rooms.push({
        shape: "L",
        widthMm,
        depthMm,
        heightMm: SWEPT_HEIGHT_MM,
      });
    }
  }
  return rooms;
}
