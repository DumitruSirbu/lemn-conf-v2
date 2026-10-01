// M7B wave U1 slice S2 (ADR 0132 decision 5): the storage bounds grow by exactly one wall's worth,
// because wall C is additive to the wire shape the same way wall B's run already is (ADR 0130 D3's
// precedent). AC5 is owned here: before/after figures for the four SEC-002 caps, and a U packed to
// `MAX_PLACEMENTS` across three walls and three bands, shown to serialise under `MAX_DESIGN_BYTES`
// and to parse. `qa-5h.adversarial.test.ts` pins the same four numbers for `columnExtents` and
// `emptyColumns`'s own history; this file is the bound derivation's own home, named in the M7B plan.
import { describe, expect, it } from "vitest";

import {
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_BYTES,
  MAX_EMPTY_COLUMNS,
  MAX_PLACEMENTS,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
  NARROWEST_CATALOG_WIDTH_MM,
} from "../src/design-bounds.js";
import {
  DesignSchema,
  type DesignPlacement,
  type DesignWall,
} from "../src/design.js";
import { LEVELS } from "../src/index.js";

/** ADR 0132 decision 5, measured: growing a U's own wall run by one entry in
 *  `MAX_WALL_RUNS_MM` moves every cap that is derived from it, and by exactly the third wall's
 *  worth — not by a chosen margin. Before/after, from this run (AC5): `MAX_PLACEMENTS` 186 → 279,
 *  `MAX_EMPTY_COLUMNS` 1262 → 1893, `MAX_COLUMN_EXTENTS` 186 → 279 (it is `MAX_PLACEMENTS`),
 *  `MAX_DESIGN_BYTES` 349 656 → 523 972. */
describe("the storage bounds after ADR 0132's third wall (AC5)", () => {
  it("grows MAX_PLACEMENTS by exactly one wall's worth of packed bodies", () => {
    const perWallPerBand = Math.floor(
      MAX_ROOM_WIDTH_MM / NARROWEST_CATALOG_WIDTH_MM,
    );
    expect(MAX_PLACEMENTS).toBe(perWallPerBand * 3 * LEVELS.length);
    expect(MAX_PLACEMENTS).toBe(279);
  });

  it("grows MAX_EMPTY_COLUMNS by exactly one wall's worth of column keys", () => {
    expect(MAX_EMPTY_COLUMNS).toBe((MAX_ROOM_DEPTH_MM / 10 + 1) * 3);
    expect(MAX_EMPTY_COLUMNS).toBe(1893);
  });

  it("keeps MAX_COLUMN_EXTENTS equal to MAX_PLACEMENTS, never a separately chosen cap", () => {
    expect(MAX_COLUMN_EXTENTS).toBe(MAX_PLACEMENTS);
  });

  it("moves MAX_DESIGN_BYTES by exactly the per-entry allowances the extra rows cost", () => {
    expect(MAX_DESIGN_BYTES).toBe(523_972);
  });
});

/** Packed edge to edge from the corner, in each of §2's three module bands, with the catalogue's
 *  narrowest declared body — the same construction `MAX_PLACEMENTS`'s own comment describes, built
 *  rather than hand-picked so a "worst case" this cap would have refused cannot stand in for one. */
function packedWallPlacements(
  wall: DesignWall,
  startIndex: number,
): readonly DesignPlacement[] {
  const perWallPerBand = Math.floor(
    MAX_ROOM_WIDTH_MM / NARROWEST_CATALOG_WIDTH_MM,
  );
  return LEVELS.flatMap(([floorM], bandIndex) => {
    const y0Mm = Math.round(floorM * 1000);
    return Array.from({ length: perWallPerBand }, (_unused, slot) => {
      const alongMm = NARROWEST_CATALOG_WIDTH_MM * (slot + 0.5);
      const index = startIndex + bandIndex * perWallPerBand + slot;
      return {
        id: `n${String(index)}`,
        wall,
        alongMm,
        y0Mm,
        body: {
          buildId: "n",
          widthMm: NARROWEST_CATALOG_WIDTH_MM,
          heightMm: 1,
        },
      } satisfies DesignPlacement;
    });
  });
}

describe("a U packed to MAX_PLACEMENTS across three walls and three bands (AC5)", () => {
  it("serialises under MAX_DESIGN_BYTES and parses", () => {
    const perWallPerBand = Math.floor(
      MAX_ROOM_WIDTH_MM / NARROWEST_CATALOG_WIDTH_MM,
    );
    const perWall = perWallPerBand * LEVELS.length;
    const placements = [
      ...packedWallPlacements("A", 0),
      ...packedWallPlacements("B", perWall),
      ...packedWallPlacements("C", perWall * 2),
    ];
    // Not vacuous: the packing is built from the same factors `MAX_PLACEMENTS` is, so the two must
    // agree exactly, or the cap and this "worst case" have quietly drifted apart.
    expect(placements.length).toBe(MAX_PLACEMENTS);

    const design = {
      room: {
        shape: "U" as const,
        widthMm: MAX_ROOM_WIDTH_MM,
        depthMm: MAX_ROOM_DEPTH_MM,
        wallCMm: MAX_ROOM_DEPTH_MM,
        heightMm: MAX_ROOM_HEIGHT_MM,
      },
      presetId: null,
      placements,
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    };
    const json = JSON.stringify(design);

    expect(Buffer.byteLength(json, "utf8")).toBeLessThan(MAX_DESIGN_BYTES);
    expect(DesignSchema.safeParse(design).success).toBe(true);
  });
});
