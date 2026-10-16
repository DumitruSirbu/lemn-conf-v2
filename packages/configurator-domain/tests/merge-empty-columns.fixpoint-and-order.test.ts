// 8U criteria 2 and 5 on the hand-built tolerance chains (F4 table; ADR 0093): a second merge pass changes no
// generated map, so only a chain built by hand can show that one pass equals two, and where the clear order may and
// may not decide the result (plan §6.3).
//
// Tops 2.56 / 2.60 / 2.58, the bridged chain: the left pair disagrees by 40 mm and the right pair agrees, so the chain
// is one column only once the right pair's envelope (top 2.58) is judged against the left. The fixpoint loop makes it
// one column in every clear order; it is the loop's witness.
//
// Depths 620 / 600 / 580 and tops 2600 / 2580 / 2560, the monotone chains: every neighbour agrees and the ends do
// not. Clearing the right pair first merges it to the far end's value, which no longer agrees with the near end, so
// those orders give two columns and the others one. That is §6.3's known limit (R14): pinned as today's shapes, with
// the every-order equality as an `it.fails`. Within tolerance (every dimension's spread at most 20 mm) the order
// cannot decide, and the criterion 5 property below draws exactly that domain.
//
// What this adds: `merge-empty-columns.test.ts` checks a fixpoint on three 300s and 300 + 500 + 300, whose members
// agree exactly, so no envelope ever narrows there.
//
// R6, each run through a mocked copy of the merge (src untouched): a single merge pass with no fixpoint loop turns the
// 2.56 / 2.60 / 2.58 chain red in four of the six clear orders (0,1,2; 0,2,1; 1,0,2; 2,0,1), in the every-order
// equality and in "one pass equals two"; the envelope taking the highest top turns the envelope pin red; the template
// taking the rightmost of equal depths turns the template pin red. Writing merged columns into the map in another
// order, extents unchanged, keeps all of it green. S4b's sabotage of `merge-empty-columns.ts` (each reverted): halving
// the tolerance turns the criterion 5 property red; exact agreement turns the known-limit pins and `it.fails` red;
// dropping `planOneWall`'s sort turns the property red.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import {
  DesignSchema,
  type Design,
  type EmptyColumn,
  type StoredColumnExtent,
} from "../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import { MILLIMETRES_PER_METRE, toMetres } from "../src/millimetres.js";
import { deriveColumnKeyAt, LEVEL_SNAP_M } from "../src/module-grid.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  mergeAdjacentEmptyColumns,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";
import {
  measureSpace,
  memberlessSpaces,
  type MeasuredSpace,
} from "./support/merge-oracle.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const COLUMN_WIDTH_MM = 600;
const CHAIN_CENTRES_MM = [1700, 2300, 2900] as const;
const CHAIN_LEFT_EDGE_MM = 1400;
const CHAIN_SPLIT_EDGE_MM = 2000;
const CHAIN_RIGHT_EDGE_MM = 3200;
const ROOM_HEIGHT_MM = 2600;
const BASE_DEPTH_MM = 600;
const KNOWN_LIMIT = "8U §6.3 known limit (R14)";

interface Chain {
  readonly name: string;
  readonly topsMm: readonly [number, number, number];
  readonly depthsMm: readonly [number, number, number];
}

/** A monotone chain and the two columns it is left as when its right pair is cleared first (§6.3). */
interface MonotoneChain extends Chain {
  readonly rightPairFirst: {
    readonly near: { readonly topMm: number; readonly depthMm: number };
    readonly far: { readonly topMm: number; readonly depthMm: number };
  };
}

const TOP_CHAIN: Chain = {
  name: "tops 2560 / 2600 / 2580",
  topsMm: [2560, 2600, 2580],
  depthsMm: [BASE_DEPTH_MM, BASE_DEPTH_MM, BASE_DEPTH_MM],
};
const DEPTH_CHAIN: MonotoneChain = {
  name: "depths 620 / 600 / 580",
  topsMm: [ROOM_HEIGHT_MM, ROOM_HEIGHT_MM, ROOM_HEIGHT_MM],
  depthsMm: [620, 600, 580],
  rightPairFirst: {
    near: { topMm: ROOM_HEIGHT_MM, depthMm: 620 },
    far: { topMm: ROOM_HEIGHT_MM, depthMm: 580 },
  },
};
const MONOTONE_TOP_CHAIN: MonotoneChain = {
  name: "tops 2600 / 2580 / 2560",
  topsMm: [2600, 2580, 2560],
  depthsMm: [BASE_DEPTH_MM, BASE_DEPTH_MM, BASE_DEPTH_MM],
  rightPairFirst: {
    near: { topMm: 2600, depthMm: BASE_DEPTH_MM },
    far: { topMm: 2560, depthMm: BASE_DEPTH_MM },
  },
};
const CHAINS = [TOP_CHAIN, DEPTH_CHAIN, MONOTONE_TOP_CHAIN];
const MONOTONE_CHAINS = [DEPTH_CHAIN, MONOTONE_TOP_CHAIN];

/** Every order the three bases can be removed in, as indices into the chain. */
const CLEAR_ORDERS: readonly (readonly number[])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
/** The orders that merge a monotone chain's right pair before its near end is free. */
const RIGHT_PAIR_FIRST_ORDERS: readonly (readonly number[])[] = [
  [1, 2, 0],
  [2, 1, 0],
];
const NEAR_END_IN_TIME_ORDERS = CLEAR_ORDERS.filter(
  (order) => !RIGHT_PAIR_FIRST_ORDERS.some((other) => sameOrder(order, other)),
);

interface World {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
}

describe("the bridged tolerance chain, tops 2560 / 2600 / 2580 (8U criteria 2 and 5, F4)", () => {
  it.each(CLEAR_ORDERS)(
    "is one column over 1400-3200 with the conservative envelope when the bases are removed in the order %i, %i, %i",
    (...order) => {
      const cleared = clearedInOrder(TOP_CHAIN, order);

      expect(
        memberlessSpaces(cleared.recordedColumns, cleared.records),
      ).toEqual([oneColumnOver(TOP_CHAIN)]);
    },
  );

  it("publishes deep-equal maps and stores one document in every clear order", () => {
    const [first, ...others] = CLEAR_ORDERS.map((order) =>
      clearedInOrder(TOP_CHAIN, order),
    );

    for (const other of others) {
      expect(other.recordedColumns).toStrictEqual(first?.recordedColumns);
      expect(other.columns).toStrictEqual(first?.columns);
      expect(other.design.emptyColumns).toStrictEqual(
        first?.design.emptyColumns,
      );
    }
  });
});

describe.each(MONOTONE_CHAINS)(
  "the monotone tolerance chain with $name (8U §6.3, R14)",
  (chain) => {
    it.each(NEAR_END_IN_TIME_ORDERS)(
      "is one column over 1400-3200 with the conservative envelope when the bases are removed in the order %i, %i, %i",
      (...order) => {
        const cleared = clearedInOrder(chain, order);

        expect(
          memberlessSpaces(cleared.recordedColumns, cleared.records),
        ).toEqual([oneColumnOver(chain)]);
      },
    );

    it.each(RIGHT_PAIR_FIRST_ORDERS)(
      `${KNOWN_LIMIT}: is two columns, A|1.70 at 1400-2000 and A|2.60 at 2000-3200, when the right pair is cleared first, in the order %i, %i, %i`,
      (...order) => {
        const cleared = clearedInOrder(chain, order);

        expect(
          memberlessSpaces(cleared.recordedColumns, cleared.records),
        ).toEqual([
          {
            key: "A|1.70",
            wall: "A",
            leftMm: CHAIN_LEFT_EDGE_MM,
            rightMm: CHAIN_SPLIT_EDGE_MM,
            floorMm: 0,
            ...chain.rightPairFirst.near,
          },
          {
            key: "A|2.60",
            wall: "A",
            leftMm: CHAIN_SPLIT_EDGE_MM,
            rightMm: CHAIN_RIGHT_EDGE_MM,
            floorMm: 0,
            ...chain.rightPairFirst.far,
          },
        ]);
      },
    );

    // Expected to fail while the limit stands: it passes, and so turns red, only once the clear order no longer
    // decides the map, which closes the backlog row.
    it.fails(
      `${KNOWN_LIMIT}: the clear order decides the map, so every-order equality fails`,
      () => {
        const [first, ...others] = CLEAR_ORDERS.map((order) =>
          clearedInOrder(chain, order),
        );

        for (const other of others) {
          expect(other.recordedColumns).toStrictEqual(first?.recordedColumns);
          expect(other.columns).toStrictEqual(first?.columns);
          expect(other.design.emptyColumns).toStrictEqual(
            first?.design.emptyColumns,
          );
        }
      },
    );
  },
);

describe.each(CHAINS)(
  "the tolerance chain with $name, loaded as stored spaces (8U criterion 2, F4)",
  (chain) => {
    it("merges in one call to the fixpoint, and a second call returns the map it was given", () => {
      const loaded = loadedAsStoredSpaces(chain);
      const once = memberlessSpaces(loaded.columns, loaded.records);

      const twice = mergeAdjacentEmptyColumns(loaded.columns, loaded.records);

      expect(once).toHaveLength(1);
      expect(twice).toStrictEqual(loaded.columns);
    });

    it("never gives the merged column more height, a lower floor or more depth than any member had", () => {
      const loaded = loadedAsStoredSpaces(chain);
      const members = storedSpaces(chain).map(asMeasured);

      const spaces = memberlessSpaces(loaded.columns, loaded.records);

      for (const space of spaces) {
        for (const member of members.filter((candidate) =>
          liesWithin(candidate, space),
        )) {
          expect(space.topMm).toBeLessThanOrEqual(member.topMm);
          expect(space.floorMm).toBeGreaterThanOrEqual(member.floorMm);
          expect(space.depthMm).toBeLessThanOrEqual(member.depthMm);
        }
      }
    });
  },
);

describe("the merged column's template is the leftmost of its shallowest members (8U §12, ADR 0079 decision 7)", () => {
  const SOURCES = ["base-cabinet", "base-3drawer", "base-panbank"] as const;

  // A depth tie decided by geometry, never by the order the map happens to hold its columns.
  propertyTest.prop([
    fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }),
  ])(
    "takes depthFromBuildId from the leftmost of three equally deep spaces whatever order the map holds",
    (order) => {
      const spaces = CHAIN_CENTRES_MM.map((alongMm, index) => ({
        ...storedSpace(alongMm, ROOM_HEIGHT_MM, BASE_DEPTH_MM),
        depthFromBuildId: SOURCES[index],
      }));
      const loaded = loadedFrom(
        designWith(
          order.map((index) => spaces[index] as EmptyColumn),
          [],
          [],
        ),
      );

      const [merged] = [...loaded.columns.values()];

      expect(loaded.columns.size).toBe(1);
      expect(merged?.depthFromBuildId).toBe(SOURCES[0]);
    },
  );
});

describe("8U criterion 5, restated (§6.3): within tolerance the clear order cannot decide the map", () => {
  const TOLERANCE_MM = LEVEL_SNAP_M * MILLIMETRES_PER_METRE;
  const MIN_RUN = 3;
  const MAX_RUN = 5;
  const RUN_LEFT_EDGE_MM = 600;
  const LOWEST_TOP_MM = ROOM_HEIGHT_MM - TOLERANCE_MM;
  const SHALLOWEST_DEPTH_MM = 580;
  const RUNS = 200;
  /** One per column and one for the neighbour, so a template chosen by anything but geometry shows. */
  const SOURCES = [
    "base-cabinet",
    "base-3drawer",
    "base-panbank",
    "base-sink",
    "base-hob-oven",
    "base-dishwasher",
  ] as const;

  interface Offsets {
    readonly floorMm: number;
    readonly topMm: number;
    readonly depthMm: number;
  }

  interface InToleranceRun {
    readonly columns: readonly Offsets[];
    readonly neighbour: Offsets | undefined;
    readonly order: readonly number[];
  }

  /** Whole millimetres in [0, 20], and as often the set {0, 10, 20}, so ties at the shallowest depth occur. */
  const offsetMm = fc.oneof(
    fc.integer({ min: 0, max: TOLERANCE_MM }),
    fc.constantFrom(0, TOLERANCE_MM / 2, TOLERANCE_MM),
  );
  const offsets = fc.record({
    floorMm: offsetMm,
    topMm: offsetMm,
    depthMm: offsetMm,
  });
  const inToleranceRun: fc.Arbitrary<InToleranceRun> = fc
    .integer({ min: MIN_RUN, max: MAX_RUN })
    .chain((length) =>
      fc.record({
        columns: fc.array(offsets, { minLength: length, maxLength: length }),
        neighbour: fc.option(offsets, { nil: undefined }),
        order: fc.shuffledSubarray(
          Array.from({ length }, (_, index) => index),
          { minLength: length, maxLength: length },
        ),
      }),
    );

  it("clearing 3 to 5 abutting columns whose floor, top and depth each spread at most 20 mm, with any empty neighbour the run joins, publishes the one-call load's maps in every order", () => {
    const reach = { spreadDrawn: 0, tiedShallowest: 0, neighbourJoined: 0 };

    fc.assert(
      fc.property(inToleranceRun, (run) => {
        const spaces = storedRun(run);
        const start = designWith(
          spaces.neighbour ? [spaces.neighbour] : [],
          placementsUnder(spaces.columns),
          spaces.columns,
        );

        const cleared = removedInOrder(
          loadedFrom(start),
          run.order.map((index) => `p${String(index)}`),
        );
        const inPlaceOrder = removedInOrder(
          loadedFrom(start),
          spaces.columns.map((_, index) => `p${String(index)}`),
        );
        const oneCall = loadedFrom(designWith(spaces.all, [], []));

        expect(
          memberlessSpaces(cleared.recordedColumns, cleared.records),
        ).toEqual([envelopeOf(spaces.all)]);
        expect(cleared.recordedColumns).toStrictEqual(oneCall.recordedColumns);
        expect(cleared.columns).toStrictEqual(oneCall.columns);
        expect(cleared.design.emptyColumns).toStrictEqual(
          inPlaceOrder.design.emptyColumns,
        );
        countReach(reach, spaces.all, run);
      }),
      { numRuns: RUNS },
    );

    // The drawn values survive the clear (the envelope assertion reads them), so these say the domain was reached.
    expect(reach.spreadDrawn).toBeGreaterThan(0);
    expect(reach.tiedShallowest).toBeGreaterThan(0);
    expect(reach.neighbourJoined).toBeGreaterThan(0);
  });

  interface StoredRun {
    readonly columns: readonly StoredColumnExtent[];
    readonly neighbour: EmptyColumn | undefined;
    readonly all: readonly StoredColumnExtent[];
  }

  function storedRun(run: InToleranceRun): StoredRun {
    const columns = run.columns.map((drawn, index) =>
      storedAt(index, drawn, SOURCES[index]),
    );
    const neighbour = run.neighbour
      ? storedAt(columns.length, run.neighbour, SOURCES[SOURCES.length - 1])
      : undefined;
    return {
      columns,
      neighbour,
      all: neighbour ? [...columns, neighbour] : columns,
    };
  }

  function storedAt(
    index: number,
    drawn: Offsets,
    depthFromBuildId: string | undefined,
  ): StoredColumnExtent {
    return {
      wall: "A",
      alongMm: RUN_LEFT_EDGE_MM + COLUMN_WIDTH_MM * index + COLUMN_WIDTH_MM / 2,
      widthMm: COLUMN_WIDTH_MM,
      y0Mm: drawn.floorMm,
      topMm: LOWEST_TOP_MM + drawn.topMm,
      depthMm: SHALLOWEST_DEPTH_MM + drawn.depthMm,
      ...(depthFromBuildId === undefined ? {} : { depthFromBuildId }),
    };
  }

  /** The one column the run must become: its outer edges and the conservative envelope (§4 rule 1). */
  function envelopeOf(spaces: readonly StoredColumnExtent[]): MeasuredSpace {
    const leftMm = RUN_LEFT_EDGE_MM;
    const rightMm = RUN_LEFT_EDGE_MM + COLUMN_WIDTH_MM * spaces.length;
    return {
      key: deriveColumnKeyAt("A", toMetres(leftMm + (rightMm - leftMm) / 2)),
      wall: "A",
      leftMm,
      rightMm,
      floorMm: Math.max(...spaces.map((space) => space.y0Mm)),
      topMm: Math.min(...spaces.map((space) => space.topMm)),
      depthMm: Math.min(...spaces.map((space) => space.depthMm)),
    };
  }

  function countReach(
    reach: {
      spreadDrawn: number;
      tiedShallowest: number;
      neighbourJoined: number;
    },
    spaces: readonly StoredColumnExtent[],
    run: InToleranceRun,
  ): void {
    const depths = spaces.map((space) => space.depthMm);
    const shallowest = Math.min(...depths);
    if (Math.max(...depths) > shallowest) reach.spreadDrawn += 1;
    if (depths.filter((depth) => depth === shallowest).length > 1)
      reach.tiedShallowest += 1;
    if (run.neighbour) reach.neighbourJoined += 1;
  }
});

function clearedInOrder(chain: Chain, order: readonly number[]): World {
  return removedInOrder(
    loadedFrom(designWithOccupiedChain(chain)),
    order.map((index) => `p${String(index)}`),
  );
}

function removedInOrder(start: World, ids: readonly string[]): World {
  return ids.reduce(removeThroughTheStore, start);
}

function removeThroughTheStore(world: World, id: string): World {
  const result = removePlacement({
    design: world.design,
    catalog: CATALOG,
    target: { kind: "placement", id },
    occurredAt: NOW,
  });
  if (!result.ok)
    throw new Error(`removing ${id} refused: ${result.reason.code}`);
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: CATALOG,
    previousRecordedColumns: world.recordedColumns,
  });
  return {
    design: reconciled.design,
    records: reconciled.records,
    recordedColumns: reconciled.recordedColumns,
    columns: reconciled.columns,
  };
}

function sameOrder(first: readonly number[], second: readonly number[]) {
  return first.join() === second.join();
}

function oneColumnOver(chain: Chain): MeasuredSpace {
  return {
    key: "A|2.30",
    wall: "A",
    leftMm: CHAIN_LEFT_EDGE_MM,
    rightMm: CHAIN_RIGHT_EDGE_MM,
    floorMm: 0,
    topMm: Math.min(...chain.topsMm),
    depthMm: Math.min(...chain.depthsMm),
  };
}

function loadedAsStoredSpaces(chain: Chain): World {
  return loadedFrom(designWith(storedSpaces(chain), [], []));
}

function loadedFrom(design: Design): World {
  const records = derivePlacementRecords(design, CATALOG);
  return {
    design,
    records,
    recordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    columns: deriveColumns(records, design, design.room),
  };
}

/** Three 600 mm base columns whose frozen extents carry the chain's tops and depths (ADR 0053), so each removal
 *  leaves a member-less column with exactly those values. */
function designWithOccupiedChain(chain: Chain): Design {
  const extents = storedSpaces(chain);
  return designWith([], placementsUnder(extents), extents);
}

/** One 600 mm base body `p<i>` standing in each frozen extent. */
function placementsUnder(extents: readonly StoredColumnExtent[]): unknown[] {
  return extents.map((extent, index) => ({
    id: `p${String(index)}`,
    wall: "A",
    alongMm: extent.alongMm,
    y0Mm: 0,
    body: {
      buildId: "base-drawer3-600",
      widthMm: COLUMN_WIDTH_MM,
      heightMm: 820,
    },
  }));
}

function storedSpaces(chain: Chain): StoredColumnExtent[] {
  return CHAIN_CENTRES_MM.map((alongMm, index) =>
    storedSpace(
      alongMm,
      chain.topsMm[index] ?? ROOM_HEIGHT_MM,
      chain.depthsMm[index] ?? BASE_DEPTH_MM,
    ),
  );
}

function storedSpace(
  alongMm: number,
  topMm: number,
  depthMm: number,
): StoredColumnExtent {
  return {
    wall: "A",
    alongMm,
    widthMm: COLUMN_WIDTH_MM,
    y0Mm: 0,
    topMm,
    depthMm,
  };
}

function liesWithin(member: MeasuredSpace, space: MeasuredSpace): boolean {
  return member.leftMm >= space.leftMm && member.rightMm <= space.rightMm;
}

function asMeasured(space: StoredColumnExtent): MeasuredSpace {
  return measureSpace({
    key: "member",
    wall: space.wall,
    ry: 0,
    x: toMetres(space.alongMm),
    z: toMetres(space.depthMm) / 2,
    w: toMetres(space.widthMm),
    d: toMetres(space.depthMm),
    top: toMetres(space.topMm),
    regions: [[toMetres(space.y0Mm), toMetres(space.topMm)]],
  });
}

function designWith(
  emptyColumns: readonly EmptyColumn[],
  placements: readonly unknown[],
  columnExtents: readonly StoredColumnExtent[],
): Design {
  return DesignSchema.parse({
    room: {
      shape: "L",
      widthMm: 4200,
      depthMm: 2400,
      heightMm: ROOM_HEIGHT_MM,
    },
    presetId: null,
    placements,
    emptyColumns,
    columnExtents,
    createdAt: NOW,
    updatedAt: NOW,
  });
}
