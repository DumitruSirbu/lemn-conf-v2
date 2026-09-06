// M6 — the store half of the owner's ruling on ADR 0069's open question: `applyCommandResult`'s
// pipeline must never **publish** a column reaching past its own wall.
//
// **Amended 2026-09-06 by ADR 0090 Amendment B and ADR 0069's own amendment of the same date.** The
// ruling is unchanged and the seam moved: a pass that derives its answer from the **room** bounds
// what the map publishes and does not rewrite what the document records. So the entry in
// `design.emptyColumns` keeps the width the delete freed and is **marked**
// (`EMPTY_COLUMN_PAST_WALL_END`, a `mark` since ADR 0069), while the published map, the openings
// derived from it and everything offered are bounded by the wall exactly as before. This file
// asserts both faces, because either one alone is the defect: the record clipped is 6J-d's D1, and
// the publication unclipped is what ADR 0069 forbids.
//
// Not built on the seeded kitchen: wall A's placements end at 3500 on a 3560 mm wall and wall B's
// end exactly at 2800 on a 2920 mm wall (the fixture's own comment in `kitchen-l-design.ts`), so no
// delete of a seeded body — at either the 600 mm or the 700 mm depth — leaves a member-less column
// reaching past its wall; the domain-level file's own "seeded kitchen" case records the same
// finding. The realistic sequence this file builds instead is the one the owner's ruling actually
// targets: a wall shorter than the body that used to stand on it, which a delete lays bare.
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";
const CREATED_AT = "2026-08-20T00:00:00.000Z";

/** Wall A is 750 mm — shorter than the 800 mm sink cabinet standing on it, which is legal to load
 *  (`PLACEMENT_PAST_WALL_END` is a mark since ADR 0069) and is what makes the delete below realistic
 *  rather than hand-forced: the body's own frozen extent, not a constructed empty column, is what
 *  reaches past the wall once nothing holds it up any more.
 *
 *  The 2830 mm depth is filler — nothing in this file stands on wall B — so it is **not** the demo's
 *  wall B and did not move with it. */
const DESIGN: Design = {
  room: { shape: "L", widthMm: 750, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [
    {
      id: "p0",
      wall: "A",
      alongMm: 400,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

function createStore() {
  return createConfiguratorStore({
    design: DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

describe("the write-time pipeline never publishes an emptyColumns entry past its wall", () => {
  it("bounds the column a delete leaves on a wall shorter than the body it held", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().remove();

    expect(store.getState().lastRejection).toBeNull();
    const [column] = [...store.getState().columns.values()];
    if (!column) throw new Error("no column is published");
    const farEdgeMm = Math.round((column.x + column.w / 2) * 1000);
    expect(farEdgeMm).toBeLessThanOrEqual(wallLengthMm("A", DESIGN.room));
    // The near edge is exactly what the delete freed — the cap shrinks the far edge inward and
    // never moves the near one.
    expect(Math.round((column.x - column.w / 2) * 1000)).toBe(0);
    expect(Math.round(column.w * 1000)).toBe(750);
    // And the opening offered from it is bounded too, which is what the owner ruling is about.
    const [opening] = store.getState().voids;
    expect(Math.round((opening?.w ?? 0) * 1000)).toBe(750);
  });

  // The other face, and the half ADR 0090 Amendment B moved: the document keeps the width the
  // delete freed and says so, rather than carrying a truncation the room imposed. A recorded extent
  // the wall no longer covers is marked — the same treatment ADR 0065 gives a *placement* past the
  // end of the same wall, which is what `p0` itself was before it was deleted.
  it("records the width the delete freed, and marks it rather than shortening it", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().remove();

    const emptyColumns = store.getState().design.emptyColumns ?? [];
    expect(emptyColumns).toHaveLength(1);
    const [entry] = emptyColumns;
    expect(entry?.widthMm).toBe(800);
    expect((entry?.alongMm ?? 0) - (entry?.widthMm ?? 0) / 2).toBe(0);

    const issues = validateDesignForCatalog(
      store.getState().design,
      buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "EMPTY_COLUMN_PAST_WALL_END",
    );
    expect(fatalDesignValidationIssues(issues)).toEqual([]);
  });

  it("keeps every column of the resulting map on or inside its own wall", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().remove();

    for (const column of store.getState().columns.values()) {
      const farEdgeM =
        (column.wall === "A" ? column.x : column.z) + column.w / 2;
      const wallLengthM = wallLengthMm(column.wall, DESIGN.room) / 1000;
      expect(farEdgeM).toBeLessThanOrEqual(wallLengthM + 1e-9);
    }
  });
});
