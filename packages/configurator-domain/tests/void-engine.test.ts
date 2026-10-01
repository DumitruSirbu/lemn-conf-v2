import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement } from "../src/design.js";
import { CHOOSES_ITS_OWN_COLOUR } from "../src/body-finish-rule.js";
import { pinnedAtFinishedDepthMm } from "../src/cabinet-depth-rule.js";
import { finishesAtMm, shellPlusFrontMm } from "../src/occupied-depth.js";
import {
  deriveColumns,
  derivePlacementRecords,
  LEVELS,
  MIN_SPAN_M,
  recomputeVoids,
  UnknownBodyError,
  type BodyCatalog,
  type BodyDefinition,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";
import { LEGACY_ENUM_FINISHES } from "../src/materials.js";

const now = "2026-08-25T00:00:00.000Z";

/** `deriveColumns`' fixtures below build occupied columns directly, with no design of their own —
 *  a room wide enough that none of them is anywhere near it. */
const ROOM = {
  shape: "L" as const,
  widthMm: 3600,
  depthMm: 2400,
  heightMm: 2600,
};

function makeDesign(placements: DesignPlacement[]): Design {
  return {
    room: ROOM,
    presetId: null,
    placements,
    createdAt: now,
    updatedAt: now,
  };
}

function makePlacement(
  overrides: Partial<DesignPlacement> = {},
): DesignPlacement {
  return {
    id: "p0",
    wall: "A",
    alongMm: 1300,
    y0Mm: 0,
    body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
    ...overrides,
  };
}

/** A synthetic base body whose finished depth is its own declared 560 — this file's worlds are
 *  about column arithmetic, not about any shipped body's geometry, so the entry declares the
 *  simplest rule that keeps the two numbers equal.
 *
 *  **And it declares a `depthRule`, because §3.2's MAX now reads one to break a tie** (ADR 0079
 *  decision 6 key 2). Every record below occupies 560, so every multi-member column here is an exact
 *  tie and the comparator reaches that key — where an entry declaring nothing throws, deliberately.
 *  `pinned` rather than `cabinet-depth`, because `finishesAtMm(560)` above is not a function of any
 *  setting: declaring that it follows one would be the lie ADR 0058 decision 2 exists to prevent, in
 *  a fixture. */
const baseDefinition: BodyDefinition = {
  kind: "base_cabinet",
  band: "base",
  frameDepthMm: 560,
  occupiedDepth: finishesAtMm(560),
  depthRule: pinnedAtFinishedDepthMm(560, "base-formula"),
  // And a `finishRule`, for the reason it declares a `depthRule`: `derivePlacementRecords` resolves
  // the colour it draws through the declaration, and an entry that says nothing is refused rather
  // than guessed at. Ordinary cabinetry, which is what `canFinish: true` beside it already says.
  canFinish: true,
  finishRule: CHOOSES_ITS_OWN_COLOUR,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
};

const tallDefinition: BodyDefinition = {
  ...baseDefinition,
  kind: "tall_unit",
  band: "column",
  frameHeightMm: 1850,
};

const wallDefinition: BodyDefinition = {
  ...baseDefinition,
  kind: "wall_cabinet",
  band: "wall",
  frameDepthMm: 330,
  // A synthetic carcass with no front assembly, so its shell and its finished depth agree and the
  // column arithmetic below stays about the arithmetic.
  occupiedDepth: shellPlusFrontMm(0),
  depthRule: pinnedAtFinishedDepthMm(330, "wall-map"),
};

const catalog: BodyCatalog = new Map([
  ["base-600", baseDefinition],
  ["fridge-700", { ...tallDefinition, kind: "fridge_freestanding" }],
  ["wall-only-330", wallDefinition],
]);

/** A column occupying the full 0–2.6 height in a single member, matching `recomputeVoids`'
 *  pseudocode variables `y`/`top`/`regions` directly, for tests that don't need a `Design`. */
function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    key: "A|1.30",
    wall: "A",
    ry: 0,
    x: 1.3,
    z: 0.3,
    w: 0.6,
    d: 0.56,
    top: 2.6,
    regions: [[0, 2.6]],
    hasFullHeightUnder: false,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return {
    id: "p0",
    buildId: "base-600",
    kind: "base_cabinet",
    frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 2.6, d: 0.56 },
    occupiedDepth: finishesAtMm(560),
    // Carried on the record the way `occupiedDepth` is, and read at the tie-break — see
    // `baseDefinition` for why a fixture that ties has to declare one.
    depthRule: pinnedAtFinishedDepthMm(560, "base-formula"),
    col: "A|1.30",
    wall: "A",
    rotated: false,
    band: "base",
    widthMm: 600,
    heightMm: 2600,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    ...overrides,
  };
}

describe("derivePlacementRecords", () => {
  it("derives frame width from the carcass, not a mesh bound", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.frame.w).toBe(0.6);
  });

  it("derives frame height/depth from the catalog's full extent, not the nominal carcass height", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "fridge-700", widthMm: 700, heightMm: 1850 },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.frame.h).toBeCloseTo(1.85, 6);
    expect(record?.frame.d).toBeCloseTo(0.56, 6);
  });

  it("keys the column A|<x> on wall A and B|<z> on wall B", () => {
    const design = makeDesign([
      makePlacement({ id: "a", wall: "A", alongMm: 1300 }),
      makePlacement({ id: "b", wall: "B", alongMm: 1200 }),
    ]);
    const [wallA, wallB] = derivePlacementRecords(design, catalog);
    expect(wallA?.col).toBe("A|1.30");
    expect(wallB?.col).toBe("B|1.20");
    expect(wallB?.rotated).toBe(true);
  });

  it("remembers finishKey/handleMode from the body", () => {
    const design = makeDesign([
      makePlacement({
        body: {
          buildId: "base-600",
          widthMm: 600,
          heightMm: 720,
          finish: LEGACY_ENUM_FINISHES.oak,
          handle: "black",
        },
      }),
    ]);
    const [record] = derivePlacementRecords(design, catalog);
    expect(record?.finishKey).toEqual(LEGACY_ENUM_FINISHES.oak);
    expect(record?.handleMode).toBe("black");
  });

  it("throws a domain error for an unknown buildId rather than returning null", () => {
    const design = makeDesign([
      makePlacement({
        body: { buildId: "missing", widthMm: 600, heightMm: 720 },
      }),
    ]);
    expect(() => derivePlacementRecords(design, catalog)).toThrow(
      UnknownBodyError,
    );
  });

  // M7B U1 slice S3 (ADR 0132 decisions 1, 2): wall C is a world wall of its own, not wall B's
  // canonical frame reflected — its along axis is `+z`, the same axis wall B's is, so it keys and
  // reads exactly as wall B does; only its world `x` differs.
  describe("wall C (ADR 0132 decision 1)", () => {
    it("keys the column C|<z>, same axis as wall B, and reads rotated", () => {
      const design = makeDesign([
        makePlacement({ id: "c", wall: "C", alongMm: 1200 }),
      ]);
      const [record] = derivePlacementRecords(design, catalog);
      expect(record?.col).toBe("C|1.20");
      expect(record?.rotated).toBe(true);
    });

    it("never collides a wall-C key with wall A's at the same along value (AC8)", () => {
      const design = makeDesign([
        makePlacement({ id: "a", wall: "A", alongMm: 1200 }),
        makePlacement({ id: "c", wall: "C", alongMm: 1200 }),
      ]);
      const [wallA, wallC] = derivePlacementRecords(design, catalog);
      expect(wallA?.col).not.toBe(wallC?.col);
      expect(wallA?.col).toBe("A|1.20");
      expect(wallC?.col).toBe("C|1.20");
    });

    // ADR 0132 decision 1: wall C's world position is pulled in from `x = W`, the mirror image of
    // wall B's own push out from `x = 0` — reflected about wall C's own plane, never about the
    // room's centre line (ADR 0129's rejected alternative).
    it("places a wall-C body's world x pulled in from the room's width", () => {
      const widthM = 3.6; // ROOM.widthMm / 1000
      const design = makeDesign([
        makePlacement({
          id: "c",
          wall: "C",
          alongMm: 1200,
          body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
        }),
      ]);
      const [record] = derivePlacementRecords(design, catalog);
      // frame.d is the seated depth (0.56 for base-600 via the fixture's own catalog); the pushed-
      // in x is W minus half that depth.
      expect(record?.frame.x).toBeCloseTo(
        widthM - (record?.frame.d ?? 0) / 2,
        9,
      );
      expect(record?.frame.z).toBeCloseTo(1.2, 9);
    });

    // AC6's mirror-equivariance, exercised directly rather than through the reviewed test utility:
    // a wall-B body and a wall-C body at the same along value and depth are each other's reflection
    // in the room's width, `x ↦ W − x`, with `z` shared and the column's own key differing only by
    // its wall letter.
    it("mirrors wall B's world x about the room's width, with z shared (AC6)", () => {
      const widthM = 3.6;
      const design = makeDesign([
        makePlacement({
          id: "b",
          wall: "B",
          alongMm: 1200,
          body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
        }),
        makePlacement({
          id: "c",
          wall: "C",
          alongMm: 1200,
          body: { buildId: "base-600", widthMm: 600, heightMm: 720 },
        }),
      ]);
      const [wallB, wallC] = derivePlacementRecords(design, catalog);
      expect(wallB?.frame.x).toBeDefined();
      expect(wallC?.frame.x).toBeCloseTo(widthM - (wallB?.frame.x ?? 0), 9);
      expect(wallC?.frame.z).toBeCloseTo(wallB?.frame.z ?? Number.NaN, 9);
    });

    it("keeps the column's off-wall origin pulled in from the room's width", () => {
      const widthM = 3.6;
      const record = makeRecord({
        id: "c",
        wall: "C",
        frame: {
          x: widthM - 0.28,
          z: 1.3,
          ry: -Math.PI / 2,
          y0: 0,
          w: 0.6,
          h: 0.86,
          d: 0.56,
        },
        col: "C|1.30",
      });
      const columns = deriveColumns([record], {}, ROOM);
      const column = columns.get("C|1.30");
      // Wall C: the normal axis is x, pulled in from W, and the along-wall z still comes from a
      // member — the same split wall A's own test above pins, mirrored.
      expect(column?.x).toBeCloseTo(widthM - 0.28, 9);
      expect(column?.z).toBe(1.3);
    });
  });
});

describe("deriveColumns", () => {
  // **The off-wall coordinate is derived, not borrowed** (5F QA finding B1). It used to come from
  // the deepest member's seat, which was the same number while every body was seated back-to-the-
  // plane. Wave 5F broke that: a fronted wall carcass records 39 mm less than it occupies and a
  // front-hung hood 200 mm more, so a borrowed seat put six of eleven columns off the plane — and a
  // column is *the space a run occupies*, which starts at the wall.
  it("puts the column's back face on the wall plane, and takes width from the narrowest", () => {
    const shallow = makeRecord({
      id: "shallow",
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.4 },
      col: "A|1.30",
    });
    const deep = makeRecord({
      id: "deep",
      frame: { x: 1.35, z: 0.32, ry: 0, y0: 1.5, w: 0.5, h: 0.7, d: 0.56 },
      col: "A|1.30",
    });
    const columns = deriveColumns([shallow, deep], {}, ROOM);
    const column = columns.get("A|1.30");
    // Wall A: the normal axis is z, so the coordinate is half the depth and the along-wall x still
    // comes from a member.
    expect(column?.z).toBe(0.28);
    expect(column?.x).toBe(1.3);
    expect(column?.w).toBe(0.5);
    expect(column?.d).toBe(0.56);
    // The property the number exists for, stated directly.
    expect((column?.z ?? 0) - (column?.d ?? 0) / 2).toBeCloseTo(0, 9);
  });

  it("derives top from the highest reach and regions from every member's vertical extent", () => {
    const lower = makeRecord({
      id: "lower",
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 1.85, d: 0.56 },
      col: "A|1.30",
    });
    const upper = makeRecord({
      id: "upper",
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 1.85, w: 0.6, h: 0.75, d: 0.56 },
      col: "A|1.30",
    });
    const columns = deriveColumns([lower, upper], {}, ROOM);
    const column = columns.get("A|1.30");
    expect(column?.top).toBeCloseTo(2.6, 6);
    expect(column?.regions).toEqual([
      [0, 1.85],
      [1.85, 2.6],
    ]);
  });

  it("gives a wall-only column its own lowest module as the floor, not 0", () => {
    const wallOnly = makeRecord({
      id: "wall-only",
      buildId: "wall-only-330",
      kind: "wall_cabinet",
      band: "wall",
      frame: { x: 0.3, z: 0.165, ry: 0, y0: 1.5, w: 0.6, h: 0.7, d: 0.33 },
      col: "A|0.30",
    });
    const columns = deriveColumns([wallOnly], {}, ROOM);
    expect(columns.get("A|0.30")?.regions[0]?.[0]).toBe(1.5);
  });
});

describe("recomputeVoids", () => {
  it("row 17: an interval intersecting no module line produces no void (no fallback)", () => {
    const column = makeColumn({ regions: [[0.86, 1.5]], top: 1.5 });
    const columns = new Map([[column.key, column]]);
    // Nothing occupies the column; its own regions already bound it to the backsplash gap.
    expect(recomputeVoids([], columns)).toEqual([]);
  });

  it("row 18: a wall-only column invents no floor space beneath it", () => {
    const column = makeColumn({ regions: [[1.5, 2.2]], top: 2.6 });
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    expect(voids.every((v) => v.y0 >= 1.5)).toBe(true);
    expect(voids.some((v) => v.y0 < 1.5)).toBe(false);
  });

  it("row 1: clearing a fridge column and re-inserting the fridge leaves one 750 mm slot, not two stubs", () => {
    const column = makeColumn({
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      top: 2.6,
    });
    const columns = new Map([[column.key, column]]);
    const fridge = makeRecord({
      id: "fridge",
      col: column.key,
      frame: {
        x: column.x,
        z: column.z,
        ry: 0,
        y0: 0,
        w: 0.7,
        h: 1.85,
        d: 0.56,
      },
    });
    const voids = recomputeVoids([fridge], columns);
    expect(voids).toHaveLength(1);
    expect(voids[0]?.y0).toBeCloseTo(1.85, 6);
    expect(voids[0]?.h).toBeCloseTo(0.75, 6);
  });

  it("clearing a standard full column yields exactly three slots, each reporting spanH = 2.6", () => {
    const column = makeColumn();
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    expect(voids.map((v) => [v.y0, v.y0 + v.h])).toEqual([
      [0, 0.86],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
    expect(voids.every((v) => v.spanH === 2.6)).toBe(true);
  });

  it("merges two vertically adjacent freed openings before subdividing: fridge + unit above both cleared", () => {
    const column = makeColumn({
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      top: 2.6,
    });
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    expect(voids.map((v) => [v.y0, v.y0 + v.h])).toEqual([
      [0, 0.86],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
    expect(voids.every((v) => v.spanH === 2.6)).toBe(true);
  });

  it("subdivides by module lines, not the column's original member history", () => {
    const column = makeColumn({
      regions: [
        [0, 1.85],
        [1.85, 2.6],
      ],
      top: 2.6,
    });
    const columns = new Map([[column.key, column]]);
    const voids = recomputeVoids([], columns);
    // Base/middle/top per LEVELS, never the fridge's own 0–1.85 / 1.85–2.6 split.
    expect(voids).toHaveLength(3);
    voids.forEach((v, index) => {
      expect(v.h).toBeCloseTo([0.86, 0.7, 0.4][index] ?? Number.NaN, 6);
    });
  });

  it(`a free interval shorter than MIN_SPAN (${String(MIN_SPAN_M)}) produces no void`, () => {
    const column = makeColumn({
      regions: [[0, 2.5]],
      top: 2.5 + MIN_SPAN_M / 2,
    });
    const columns = new Map([[column.key, column]]);
    const occupant = makeRecord({
      id: "filler",
      col: column.key,
      frame: {
        x: column.x,
        z: column.z,
        ry: 0,
        y0: 0,
        w: 0.6,
        h: 2.5,
        d: 0.56,
      },
    });
    expect(recomputeVoids([occupant], columns)).toEqual([]);
  });

  it("is deterministic and order-independent: same design produces the same void set", () => {
    const column = makeColumn();
    const columns = new Map([[column.key, column]]);
    const a = makeRecord({
      id: "a",
      col: column.key,
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
    });
    const b = makeRecord({
      id: "b",
      col: column.key,
      frame: { x: 1.3, z: 0.3, ry: 0, y0: 1.5, w: 0.6, h: 0.7, d: 0.56 },
    });
    const forward = recomputeVoids([a, b], columns);
    const reversed = recomputeVoids([b, a], columns);
    expect(reversed).toEqual(forward);
  });

  it("pins the LEVELS boundaries as named constants", () => {
    expect(LEVELS).toEqual([
      [0, 0.86],
      [1.5, 2.2],
      [2.2, 2.6],
    ]);
  });
});
