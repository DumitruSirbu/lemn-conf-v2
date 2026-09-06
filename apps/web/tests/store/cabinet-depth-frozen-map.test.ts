// Wave 6J-d at the store seam — **the map the store publishes is the map the command wrote, and it
// describes the kitchen the command actually built** (ADR 0090).
//
// The measurement this closes, at `2bdd923` on the shipped kitchen with the oven tower cleared,
// through `setCabinetDepth(700)`: the `columns` map kept all 12 of its 600 mm keys while the records
// moved to `B|0.69 B|0.84 B|1.90 B|2.55`, so four standing runs were filed under no column at all.
// `projectFrozenMap` partitions on `occupiedKeys.has(key)`, so those four were written to
// `emptyColumns` — 1 entry became 5 and `columnExtents` 11 became 7 — `recomputeVoids` published
// openings through them (3 → 12), and `validateDesignForCatalog` returned **five
// `EMPTY_COLUMN_OVERLAPS_PLACEMENT`** at the seam `refuseUnexecutableDesign` runs. A 700 mm kitchen
// could not be saved.
//
// The domain half of these criteria — the same claims one package earlier, with no store and no
// probe — is `packages/configurator-domain/tests/commands/set-cabinet-depth.frozen-map.test.ts`.
import {
  buildKitchenLBodyCatalog,
  clipEmptyColumnsToFreeGround,
  DEFAULT_CABINET_DEPTH_MM,
  DesignSchema,
  fatalDesignValidationIssues,
  KITCHEN_L_DESIGN,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-06T12:00:00.000Z";
const DEEPER_MM = 700;

/** The oven tower and the deep top above it: the pair whose removal leaves `B|1.20` the one true
 *  member-less space in ADR 0090's measurement. */
const OVEN_TOWER_MEMBERS = ["p5", "p22"];

/** The four cleared scenarios `qa-6k-j-fallback-rule` builds, by the members each clears. */
const CLEARED_SCENARIOS: readonly (readonly [string, readonly string[]])[] = [
  ["a cleared wall column", ["p8", "p15"]],
  ["a cleared base slot", ["p1", "p12", "p18"]],
  ["a cleared appliance niche", ["p7", "p24"]],
  ["a cleared oven tower", OVEN_TOWER_MEMBERS],
  ["a cleared pantry", ["p6", "p23"]],
];

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function removeAll(store: Store, ids: readonly string[]): Store {
  for (const id of ids) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    expect(store.getState().lastRejection, `remove ${id}`).toBeNull();
  }
  return store;
}

function setDepth(store: Store, cabinetDepthMm: number): Store {
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `set ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

/** The design as a save and a reload deliver it, through the wire schema. */
function reload(store: Store): Store {
  return createStore(
    DesignSchema.parse(JSON.parse(JSON.stringify(store.getState().design))),
  );
}

/** The same document with every recorded source stripped — a session before wave 6K-c, and the
 *  population ADR 0090 decision 4a answers. */
function asLegacyDocument(store: Store): Store {
  const strip = (entry: EmptyColumn): EmptyColumn => {
    const stripped = { ...entry };
    delete stripped.depthFromBuildId;
    return stripped;
  };
  const held = store.getState().design;
  return createStore(
    DesignSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...held,
          emptyColumns: (held.emptyColumns ?? []).map(strip),
          columnExtents: (held.columnExtents ?? []).map(strip),
        }),
      ),
    ),
  );
}

function cabinetDepthMmOfStore(store: Store): number {
  return (
    store.getState().design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM
  );
}

function refusalsOf(store: Store): readonly string[] {
  const { design } = store.getState();
  return fatalDesignValidationIssues(
    validateDesignForCatalog(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOfStore(store)),
    ),
  ).map((issue) => `${issue.code} ${issue.path}`);
}

/** Every published column's depth, in whole millimetres, by the key it stands at. */
function depthsByKey(
  state: ReturnType<Store["getState"]>,
): Record<string, number> {
  return Object.fromEntries(
    [...state.columns].map(([key, column]) => [
      key,
      Math.round(column.d * 1000),
    ]),
  );
}

/** Where the document says each recorded space and extent stands, and how big it is — the
 *  positioned half of the frozen map, which is the half this wave moves. */
function storedCoordinates(design: Design): readonly string[] {
  return [...(design.emptyColumns ?? []), ...(design.columnExtents ?? [])]
    .map(
      (entry) =>
        `${entry.wall}|${String(entry.alongMm)} w${String(entry.widthMm)} d${String(entry.depthMm)}`,
    )
    .sort();
}

/** Every recorded run as one string, so "the population is the same" is a single comparison rather
 *  than a set difference a reader has to reconstruct. Depths are deliberately **not** in it: they
 *  follow the setting by design and this claim is about which runs exist. */
function recordedPopulation(store: Store): string {
  const { design } = store.getState();
  return [...(design.emptyColumns ?? []), ...(design.columnExtents ?? [])]
    .map((entry) => `${entry.wall}|${String(entry.widthMm)}`)
    .sort()
    .join(" ");
}

/** The width the document records for the one member-less run on this wall. */
function recordedWidthMm(store: Store, wall: "A" | "B"): number {
  const spaces = (store.getState().design.emptyColumns ?? []).filter(
    (entry) => entry.wall === wall,
  );
  const [only] = spaces;
  if (spaces.length !== 1 || !only) {
    throw new Error(
      `expected one recorded space on wall ${wall}, found ${String(spaces.length)}`,
    );
  }
  return only.widthMm;
}

/** The width the store publishes for that same run, which ADR 0069's cap may have bounded. */
function publishedWidthMm(store: Store, key: string): number {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return Math.round(column.w * 1000);
}

function orphanRecordColumns(store: Store): readonly string[] {
  const { records, columns } = store.getState();
  return [...new Set(records.map((record) => record.col))]
    .filter((key) => !columns.has(key))
    .sort();
}

describe("the published map holds a column for every record", () => {
  // **The head of the whole defect, and falsifiable in one line.** Four wall-B records failed it at
  // 700 before this wave.
  it.each(CLEARED_SCENARIOS)(
    "%s, at both settings and across a save and a reload",
    (_name, members) => {
      const store = removeAll(createStore(), members);

      for (const cabinetDepthMm of [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM]) {
        setDepth(store, cabinetDepthMm);
        expect(
          orphanRecordColumns(store),
          `at ${String(cabinetDepthMm)}`,
        ).toEqual([]);
        expect(
          orphanRecordColumns(reload(store)),
          `reloaded at ${String(cabinetDepthMm)}`,
        ).toEqual([]);
      }
    },
  );

  it("finds records to check at all", () => {
    expect(
      new Set(
        createStore()
          .getState()
          .records.map((record) => record.col),
      ).size,
    ).toBeGreaterThan(1);
  });
});

describe("the document the store holds is one the write seam accepts", () => {
  // `EMPTY_COLUMN_OVERLAPS_PLACEMENT` is declared a **refusal**, and
  // `apps/web/src/app/api/designs/[id]/route.ts`'s `refuseUnexecutableDesign` runs this exact
  // validator at the `PUT`. Over `fatalDesignValidationIssues` rather than the whole list, because
  // ADR 0065's two `PLACEMENT_PAST_WALL_END` marks at 700 are expected and must remain.
  it.each(CLEARED_SCENARIOS)("%s, at both settings", (_name, members) => {
    const store = removeAll(createStore(), members);

    for (const cabinetDepthMm of [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM]) {
      setDepth(store, cabinetDepthMm);
      expect(refusalsOf(store), `at ${String(cabinetDepthMm)}`).toEqual([]);
    }
  });

  // The same, on documents written before wave 6K-c — ADR 0090 decision 4a's population, where a
  // sourceless extent cannot follow the run and decision 4b's clip is what keeps the result
  // saveable.
  it.each(CLEARED_SCENARIOS)("%s, as a legacy document", (_name, members) => {
    const store = asLegacyDocument(removeAll(createStore(), members));

    setDepth(store, DEEPER_MM);

    expect(refusalsOf(store)).toEqual([]);
  });

  it("accepts the seeded kitchen at both settings, untouched", () => {
    const store = createStore();

    expect(refusalsOf(store)).toEqual([]);
    setDepth(store, DEEPER_MM);
    expect(refusalsOf(store)).toEqual([]);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);
    expect(refusalsOf(store)).toEqual([]);
  });
});

describe("the openings the map publishes", () => {
  // ADR 0090's measurement: `voids` went 3 → 12 at 700, openings drawn straight through four
  // standing runs.
  it("stays at three on the measured scenario, at both settings", () => {
    const store = removeAll(createStore(), OVEN_TOWER_MEMBERS);

    expect(store.getState().voids).toHaveLength(3);
    setDepth(store, DEEPER_MM);
    expect(store.getState().voids).toHaveLength(3);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);
    expect(store.getState().voids).toHaveLength(3);
  });

  it("draws every opening in a column the map holds", () => {
    const store = removeAll(createStore(), OVEN_TOWER_MEMBERS);

    setDepth(store, DEEPER_MM);

    const { voids, columns } = store.getState();
    expect(voids.length).toBeGreaterThan(0);
    for (const opening of voids) {
      expect(columns.has(opening.col), opening.col).toBe(true);
    }
  });
});

describe("what this wave promised not to move", () => {
  // **Value-preserving at 600.** A wave that changes a 600 mm number has done the wrong thing, and
  // this wave moves an anchor and re-keys a map — no depth, at either setting (ADR 0090 decision 8).
  //
  // Keys and depths, deliberately, rather than whole entries: a depth change at the setting it is
  // already at still re-resolves every body to the catalogue built at that setting, so
  // `base-drawer3-600` becomes the parameterised `base-3drawer` and the recorded source with it.
  // That is wave 6J-b's rebuild, long-standing and unrelated, and asserting entry equality here
  // would be this file claiming it.
  //
  // The whole-document form of this criterion is `cabinet-depth-frozen-source.test.ts`'s
  // `BEFORE_THIS_WAVE["at the default setting"]` golden map, which wave 6J-d left untouched.
  it.each(CLEARED_SCENARIOS)(
    "%s publishes the same coordinates and depths at the default setting",
    (_name, members) => {
      const before = removeAll(createStore(), members).getState();

      const after = setDepth(
        removeAll(createStore(), members),
        DEFAULT_CABINET_DEPTH_MM,
      ).getState();

      expect(depthsByKey(after)).toStrictEqual(depthsByKey(before));
      expect(storedCoordinates(after.design)).toStrictEqual(
        storedCoordinates(before.design),
      );
    },
  );

  // **600 → 700 → 600 returns the whole map, keys included** — not just the depths, which was true
  // by accident before this wave because nothing moved.
  it("returns the whole map across a round trip", () => {
    const store = removeAll(createStore(), OVEN_TOWER_MEMBERS);
    const start = setDepth(store, DEFAULT_CABINET_DEPTH_MM).getState();
    const startColumns = new Map(start.columns);
    const startEmpty = start.design.emptyColumns;
    const startExtents = start.design.columnExtents;

    setDepth(store, DEEPER_MM);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    const back = store.getState();
    expect([...back.columns.keys()].sort()).toEqual(
      [...startColumns.keys()].sort(),
    );
    for (const [key, column] of startColumns) {
      expect(back.columns.get(key), key).toStrictEqual(column);
    }
    expect(back.design.emptyColumns).toStrictEqual(startEmpty);
    expect(back.design.columnExtents).toStrictEqual(startExtents);
  });

  // ADR 0090 decision 8: no schema change, no new `Design` field, no migration. `depthFromBuildId`
  // is read for a second axis and its shape does not change.
  it("adds no field to the document and needs no schema bump", () => {
    const store = removeAll(createStore(), OVEN_TOWER_MEMBERS);

    setDepth(store, DEEPER_MM);

    const { design } = store.getState();
    // The wire schema is the check, and it is a strict one — it rejects an unrecognised key. A field
    // this wave had invented would fail to parse back, and a document that parses at the current
    // shape needed no migration to get here.
    const written = JSON.parse(JSON.stringify(design)) as unknown;
    expect(DesignSchema.parse(written)).toStrictEqual(design);

    const stored = [
      ...(design.emptyColumns ?? []),
      ...(design.columnExtents ?? []),
    ];
    expect(stored.length).toBeGreaterThan(0);
    for (const entry of stored) {
      expect(Object.keys(entry).sort()).toStrictEqual(
        [
          "alongMm",
          "depthFromBuildId",
          "depthMm",
          "topMm",
          "wall",
          "widthMm",
          "y0Mm",
        ].sort(),
      );
    }
  });
});

describe("the free-ground guard drops nothing, and can still fire", () => {
  // **QA's criterion, and it replaces one of mine that was vacuous.** Asserting
  // `clipEmptyColumnsToFreeGround(state.columns, state.records) === state.columns` proves
  // *idempotence*, not idleness: the pass only removes and `state.columns` has already been through
  // it, so `clip(clip(m)) === clip(m)` holds whatever the first pass did. Idleness on the input the
  // funnel actually hands the guard is asserted where the funnel's input can be reconstructed —
  // `packages/configurator-domain/tests/commands/set-cabinet-depth.frozen-map.test.ts`. This is the
  // other claim and neither discharges the other: **the population of recorded runs is the same
  // before, at 700 and back**, so nothing was dropped by anything.
  it.each(CLEARED_SCENARIOS)("%s, sourced", (_name, members) => {
    const store = removeAll(createStore(), members);
    const before = recordedPopulation(store);

    setDepth(store, DEEPER_MM);
    const deep = recordedPopulation(store);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(deep, "at 700").toBe(before);
    expect(recordedPopulation(store), "back at 600").toBe(before);
  });

  it.each(CLEARED_SCENARIOS)("%s, as a legacy document", (_name, members) => {
    const store = asLegacyDocument(removeAll(createStore(), members));
    const before = recordedPopulation(store);

    setDepth(store, DEEPER_MM);
    const deep = recordedPopulation(store);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(deep, "at 700").toBe(before);
    expect(recordedPopulation(store), "back at 600").toBe(before);
  });

  // The guard can still fire — `clip-empty-columns-to-free-ground.test.ts` proves that on a
  // hand-built map, and this is its store-level twin. It is deliberately **not** a legacy document:
  // since ADR 0090's Amendment A every extent slides, so no reachable document overlaps and a legacy
  // fixture would make the non-vacuity case silently vacuous.
  it("is a guard that can fire, on a map no rule produces", () => {
    const { columns, records } = removeAll(
      createStore(),
      OVEN_TOWER_MEMBERS,
    ).getState();
    const stranded = [...columns.values()].find(
      (column) => !records.some((record) => record.col === column.key),
    );
    if (!stranded) throw new Error("no member-less column to strand");
    const onOccupiedGround = new Map(columns).set(stranded.key, {
      ...stranded,
      w: 2.4,
    });

    expect(
      clipEmptyColumnsToFreeGround(onOccupiedGround, records).has(stranded.key),
    ).toBe(false);
  });
});

describe("the cap bounds what is published and not what is recorded", () => {
  // ADR 0090 Amendment B, as two reads of one command's output. A wave that makes the two agree at
  // 700 has re-introduced D1; one that makes them differ at 600 has broken ADR 0069's cap.
  //
  // **The room is the fixture's own here on purpose**, because this pair is about the seam rather
  // than about the far end: the space is put where the shipped wall B already ends. The far-end
  // round trip, in a room the test declares so 6N-0 cannot hide it, is the domain file's.
  const FAR_END = {
    wall: "B",
    alongMm: 2620,
    widthMm: 600,
    y0Mm: 0,
    topMm: 2600,
    depthMm: 742,
    depthFromBuildId: "fridge-free-700",
  } as const;

  function withASpaceAtTheFarEnd(): Store {
    return createStore({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !["p7", "p24"].includes(placement.id),
      ),
      emptyColumns: [FAR_END],
    });
  }

  it("differs at the deeper setting and agrees at the default one", () => {
    const store = withASpaceAtTheFarEnd();

    setDepth(store, DEEPER_MM);
    const deepRecorded = recordedWidthMm(store, "B");
    // **The published key is the cap's, not the record's.** `clipEmptyColumnsAtWallEnd` re-derives a
    // clipped column's key from its new centre, so the record stands at 2720 while what is offered
    // stands at 2670 — 2420 to the wall's own 2920. The two faces differ in coordinate as well as in
    // width, and an insert is matched against the offered one.
    const deepPublished = publishedWidthMm(store, "B|2.67");
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(deepRecorded).toBe(600);
    expect(deepPublished).toBe(500);
    expect(recordedWidthMm(store, "B")).toBe(600);
    expect(publishedWidthMm(store, "B|2.62")).toBe(600);
  });

  // The half ADR 0069's owner ruling keeps: nothing past the end of a wall is ever offered. The
  // opening derived at 700 is the capped one, and it is the capped column an insert would match.
  it("offers only the bounded column", () => {
    const store = withASpaceAtTheFarEnd();

    setDepth(store, DEEPER_MM);

    const opening = store
      .getState()
      .voids.find((record) => record.col === "B|2.67");
    expect(Math.round((opening?.w ?? 0) * 1000)).toBe(500);
    for (const column of store.getState().columns.values()) {
      const farEdgeMm = Math.round(
        ((column.wall === "A" ? column.x : column.z) + column.w / 2) * 1000,
      );
      expect(farEdgeMm, column.key).toBeLessThanOrEqual(
        wallLengthMm(column.wall, store.getState().design.room),
      );
    }
  });
});
