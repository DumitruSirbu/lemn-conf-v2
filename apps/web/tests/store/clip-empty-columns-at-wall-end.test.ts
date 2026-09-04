// M6 — the store half of the owner's ruling on ADR 0069's open question: `applyCommandResult`'s
// write-time pipeline must never publish a `design.emptyColumns` entry reaching past its own wall.
//
// Not built on the seeded kitchen: wall A's placements end at 3500 on a 3560 mm wall and wall B's
// end exactly at 2800 on a 2830 mm wall (the fixture's own comment in `kitchen-l-design.ts`), so no
// delete of a seeded body — at either the 600 mm or the 700 mm depth — leaves a member-less column
// reaching past its wall; the domain-level file's own "seeded kitchen" case records the same
// finding. The realistic sequence this file builds instead is the one the owner's ruling actually
// targets: a wall shorter than the body that used to stand on it, which a delete lays bare.
import {
  buildKitchenLBodyCatalog,
  wallLengthMm,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";
const CREATED_AT = "2026-08-20T00:00:00.000Z";

/** Wall A is 750 mm — shorter than the 800 mm sink cabinet standing on it, which is legal to load
 *  (`PLACEMENT_PAST_WALL_END` is a mark since ADR 0069) and is what makes the delete below realistic
 *  rather than hand-forced: the body's own frozen extent, not a constructed empty column, is what
 *  reaches past the wall once nothing holds it up any more. */
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
    bodyProbe: createFakeBodyProbe(),
  });
}

describe("the write-time pipeline never publishes an emptyColumns entry past its wall", () => {
  it("clips the remnant a delete leaves on a wall shorter than the body it held", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().remove();

    expect(store.getState().lastRejection).toBeNull();
    const emptyColumns = store.getState().design.emptyColumns ?? [];
    expect(emptyColumns).toHaveLength(1);
    const [entry] = emptyColumns;
    const farEdgeMm = (entry?.alongMm ?? 0) + (entry?.widthMm ?? 0) / 2;
    expect(farEdgeMm).toBeLessThanOrEqual(wallLengthMm("A", DESIGN.room));
    // The near edge is exactly what the delete freed — clipping shrinks the far edge inward and
    // never moves the near one.
    expect((entry?.alongMm ?? 0) - (entry?.widthMm ?? 0) / 2).toBe(0);
    expect(entry?.widthMm).toBe(750);
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
