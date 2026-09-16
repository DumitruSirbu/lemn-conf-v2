import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  MAX_GENERATED_LEFTOVER_MM,
  planKitchenComposition,
  planLeftover,
  type DesignRoom,
} from "../../src/index.js";

/** What `generateKitchen` reads off the catalogue and hands the planner (ADR 0110 E, wave 7D3). */
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/**
 * How many millimetres of a wall's free end the block's outermost column took into its own width.
 *
 * ADR 0110 Amendment E6.2, and **the only thing that moves a wall's reported remainder off the
 * leftover rule's modulo.** Read from the one body that may be planned over a module — the outermost
 * full-height column, found by the catalogue's own `column` band — so a wider body anywhere else in
 * the run still shows up as a mismatch rather than being absorbed into the arithmetic.
 *
 * `fridge-free` is declared in that same band and stands at wall B's free end, so it is the **role**
 * that excludes it: it is Amendment A1's body at its declared 700 mm, not a module the block widened.
 */
function absorbedIntoTheBlockMm(
  plan: ReturnType<typeof planKitchenComposition>,
  wall: "A" | "B",
): number {
  const outermost = plan.bases.filter((base) => base.wall === wall).at(-1);
  if (
    !outermost ||
    outermost.role !== "storage" ||
    CATALOG.get(outermost.buildId)?.band !== "column"
  ) {
    return 0;
  }
  return outermost.widthMm - DECLARED_COLUMNS.columnWidthMm;
}

describe("planKitchenComposition", () => {
  it("plans the reference room at the owner-ruled boundaries", () => {
    const room = KITCHEN_L_DESIGN.room;
    const plan = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room,
      runs: lShellFloorRuns(room),
    });

    expect(plan.minimumMet).toBe(true);
    expect(
      plan.bases
        .filter((body) => ["sink", "preparation", "hob"].includes(body.role))
        .map(({ role, wall, startMm, endMm }) => ({
          role,
          wall,
          startMm,
          endMm,
        })),
    ).toEqual([
      { role: "sink", wall: "A", startMm: 900, endMm: 1500 },
      { role: "preparation", wall: "A", startMm: 1500, endMm: 2100 },
      { role: "hob", wall: "A", startMm: 2100, endMm: 2700 },
    ]);
    expect(plan.remainderMm).toEqual({ A: 260, B: 20 });
  });

  it("declares the ruled order and widths as data", () => {
    // ADR 0110 Amendment A1's order, with A1's *interim data* amended once by Amendment F5: the
    // preparation body is `base-3drawer` from wave 7D4 on. The order, the widths and the required
    // flags are untouched, which is what criterion 11 asserts and what keeps criterion 2's width
    // neutrality true of this row. Spelled as a literal here rather than read from the leaf: this
    // is the test that would go green against a leaf whose ids were swapped.
    expect(GENERATION_PRIORITIES).toEqual([
      { role: "fridge", buildId: "fridge-free", widthMm: 700, required: false },
      { role: "sink", buildId: "base-sink", widthMm: 600, required: true },
      {
        role: "preparation",
        buildId: "base-3drawer",
        widthMm: 600,
        required: false,
      },
      { role: "hob", buildId: "base-hob-oven", widthMm: 600, required: true },
    ]);
  });

  it("lets the first optional core yield while preserving the minimum pair", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 2100,
      depthMm: 1600,
      heightMm: 2200,
    };
    const plan = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room,
      runs: lShellFloorRuns(room),
    });

    expect(plan.dropped).toEqual(["fridge"]);
    expect(
      plan.bases
        .filter((body) => body.role !== "storage")
        .map((body) => body.role)
        .sort(),
    ).toEqual(["hob", "preparation", "sink"]);
  });

  it.each([
    {
      depthMm: 1599,
      dropped: ["fridge"],
      storageIntervals: [],
      remainderMm: 598,
    },
    {
      depthMm: 1600,
      dropped: ["fridge"],
      storageIntervals: [[900, 1500]],
      remainderMm: 0,
    },
    {
      depthMm: 1699,
      dropped: ["fridge"],
      storageIntervals: [[900, 1500]],
      remainderMm: 98,
    },
    {
      depthMm: 1700,
      dropped: [],
      storageIntervals: [],
      remainderMm: 0,
    },
  ] as const)(
    "recomputes wall-B storage after the final core choice at depth $depthMm",
    ({ depthMm, dropped, storageIntervals, remainderMm }) => {
      const room: DesignRoom = {
        shape: "L",
        widthMm: 2700,
        depthMm,
        heightMm: 2200,
      };
      const plan = planKitchenComposition({
        columns: DECLARED_COLUMNS,
        room,
        runs: lShellFloorRuns(room),
      });

      expect(plan.dropped).toEqual(dropped);
      expect(
        plan.bases
          .filter((base) => base.wall === "B" && base.role === "storage")
          .map((base) => [base.startMm, base.endMm]),
      ).toEqual(storageIntervals);
      expect(plan.remainderMm.B).toBe(remainderMm);
    },
  );

  it("returns minimum-not-met arithmetic when sink and hob cannot both stand", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 900,
      depthMm: 2000,
      heightMm: 2200,
    };
    const plan = planKitchenComposition({
      columns: DECLARED_COLUMNS,
      room,
      runs: lShellFloorRuns(room),
    });

    expect(plan.minimumMet).toBe(false);
    expect(plan.bases).toEqual([]);
  });

  it("always leaves less than one storage module", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (freeEndMm) => {
        const result = planLeftover(freeEndMm);
        expect(result.remainderMm).toBeLessThanOrEqual(
          MAX_GENERATED_LEFTOVER_MM,
        );
        expect(result.storageCount * 600 + result.remainderMm).toBe(freeEndMm);
      }),
    );
  });

  it("plans every approved room deterministically with bounded leftovers or no minimum", () => {
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("approved policy has no L");
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.integer({ min: l.wallA.minMm, max: l.wallA.maxMm }),
          depthMm: fc.integer({ min: l.wallB.minMm, max: l.wallB.maxMm }),
          heightMm: fc.integer({
            min: APPROVED_ROOM_POLICY.heightBounds.minMm,
            max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
          }),
        }),
        (room) => {
          const first = planKitchenComposition({
            columns: DECLARED_COLUMNS,
            room,
            runs: lShellFloorRuns(room),
          });
          const second = planKitchenComposition({
            columns: DECLARED_COLUMNS,
            room,
            runs: lShellFloorRuns(room),
          });
          expect(second).toEqual(first);
          if (!first.minimumMet) return;
          expect(first.remainderMm.A).toBeLessThanOrEqual(
            MAX_GENERATED_LEFTOVER_MM,
          );
          expect(first.remainderMm.B).toBeLessThanOrEqual(
            MAX_GENERATED_LEFTOVER_MM,
          );
          expect(first.dropped).not.toContain("sink");
          expect(first.dropped).not.toContain("hob");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("applies floor and modulo storage arithmetic after whichever core roles remain", () => {
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("approved policy has no L");
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant("L" as const),
          widthMm: fc.integer({ min: l.wallA.minMm, max: l.wallA.maxMm }),
          depthMm: fc.integer({ min: l.wallB.minMm, max: l.wallB.maxMm }),
          heightMm: fc.constant(2200),
        }),
        (room) => {
          const runs = lShellFloorRuns(room);
          const plan = planKitchenComposition({
            columns: DECLARED_COLUMNS,
            room,
            runs,
          });
          if (!plan.minimumMet) return;
          for (const wall of ["A", "B"] as const) {
            const bases = plan.bases.filter((base) => base.wall === wall);
            const coreWidthMm = bases
              .filter((base) => base.role !== "storage")
              .reduce((sum, base) => sum + base.widthMm, 0);
            const finalLeftoverMm =
              runs[wall].endMm - runs[wall].startMm - coreWidthMm;
            expect(
              bases.filter((base) => base.role === "storage"),
            ).toHaveLength(Math.floor(finalLeftoverMm / 600));
            // Still the leftover rule's modulo, **less the one millimetre count E6.2 takes out of
            // it**: where the block's outermost column is the `'fit'` door column, it is planned at
            // the merged width and the bare wall it would have left goes to 0. Narrowed to that one
            // subtraction on that one wall rather than relaxed to `run − composed`, which is
            // *exactly* the quantity a body planned over its module and a remainder reduced to match
            // leave unchanged — a 700 mm cabinet sold as a 600 mm one, invisible to that form.
            expect(plan.remainderMm[wall]).toBe(
              (finalLeftoverMm % 600) - absorbedIntoTheBlockMm(plan, wall),
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
