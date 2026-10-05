// ADR 0080 decision 5: the fallback arm governs only documents descended from one saved before sources were recorded.
// Three legs: every producer of a column carries a source; the two declared catalogues hold identical `buildId` sets;
// a source-stripped document does reach the arm, so the check is not vacuous.
import {
  buildKitchenLBodyCatalog,
  columnBuildDepthM,
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
  DesignSchema,
  KITCHEN_L_DESIGN,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** The scenarios the fixture refuses, named so the sweep's coverage is a fact and not a count. */
const REFUSED_SCENARIOS: readonly string[] = [
  // The four structural corner bodies, `canDelete: false` — and the pair that needs two of them.
  "clear the corner return",
  "delete p21",
  "delete p25",
  "delete p26",
  "delete p9",
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

/** Every placement id the shipped fixture holds, read off the fixture rather than listed, so a
 *  future placement joins this sweep without anyone remembering to add it. */
function everyPlacementId(): readonly string[] {
  return createStore()
    .getState()
    .records.map((record) => record.id);
}

/** Deletes what can be deleted and reports honestly on what cannot — `base-corner-x-900` is
 *  `canDelete: false`, and a sweep that asserted every delete succeeds would be testing the
 *  catalogue rather than this wave. */
function tryRemove(store: Store, ids: readonly string[]): boolean {
  for (const id of ids) {
    if (!store.getState().records.some((record) => record.id === id)) continue;
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    if (store.getState().lastRejection) return false;
  }
  return true;
}

function setDepth(store: Store, cabinetDepthMm: number): Store {
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `setCabinetDepth ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

function reload(store: Store): Store {
  return createStore(
    DesignSchema.parse(JSON.parse(JSON.stringify(store.getState().design))),
  );
}

const stripSource = (entry: EmptyColumn): EmptyColumn => {
  const stripped = { ...entry };
  delete stripped.depthFromBuildId;
  return stripped;
};

function asLegacyDocument(store: Store): Store {
  const held = store.getState().design;
  return createStore(
    DesignSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...held,
          emptyColumns: (held.emptyColumns ?? []).map(stripSource),
          columnExtents: (held.columnExtents ?? []).map(stripSource),
        }),
      ),
    ),
  );
}

/** Every published column whose depth the fallback arm would have to answer for: no recorded source,
 *  or one the catalogue built at this setting does not hold. Both are the same answer at
 *  `recordedSourceEntry`, so they are counted as one here too. */
function columnsReachingTheFallback(store: Store): readonly string[] {
  const catalog = buildKitchenLBodyCatalog(
    store.getState().design.settings?.cabinetDepthMm ??
      DEFAULT_CABINET_DEPTH_MM,
  );
  return [...store.getState().columns]
    .filter(([, column]) => {
      const source = column.depthFromBuildId;
      return source === undefined || !catalog.has(source);
    })
    .map(
      ([key, column]) => `${key} ${column.depthFromBuildId ?? "(no source)"}`,
    );
}

describe("no current-schema document reaches the fallback arm", () => {
  /** Every single delete the fixture allows, the pairs that clear a whole column, and a full-height insert. */
  function everyScenario(): readonly (readonly [string, () => Store | null])[] {
    const singles = everyPlacementId().map(
      (id) =>
        [
          `delete ${id}`,
          () => {
            const store = createStore();
            return tryRemove(store, [id]) ? store : null;
          },
        ] as const,
    );
    const clearedColumns: readonly (readonly [string, readonly string[]])[] = [
      ["clear the wall run", ["p8", "p15"]],
      ["clear the dishwasher slot", ["p1", "p12", "p18"]],
      ["clear the sink run", ["p0", "p11", "p17"]],
      ["clear the hob run", ["p2", "p13", "p19"]],
      ["clear the oven tower", ["p5", "p22"]],
      ["clear the pantry", ["p6", "p23"]],
      ["clear the fridge niche", ["p7", "p24"]],
      ["clear the corner return", ["p9", "p21"]],
      ["clear two adjacent wall columns", ["p8", "p15", "p10", "p16"]],
      [
        "clear three adjacent columns",
        ["p8", "p15", "p10", "p16", "p0", "p11", "p17"],
      ],
      ["clear both full-height columns", ["p5", "p22", "p6", "p23"]],
      [
        "clear the whole of wall B's column band",
        ["p5", "p22", "p6", "p23", "p7", "p24"],
      ],
    ];
    const pairs = clearedColumns.map(
      ([name, ids]) =>
        [
          name,
          () => {
            const store = createStore();
            return tryRemove(store, ids) ? store : null;
          },
        ] as const,
    );
    const withAnInsert = [
      [
        "insert a pantry into a cleared sink run",
        () => {
          const store = createStore();
          if (!tryRemove(store, ["p0", "p11", "p17"])) return null;
          const opening = store
            .getState()
            .voids.find((record) => record.id.startsWith("A|1.30:"));
          if (!opening) return null;
          store.getState().select({ kind: "void", id: opening.id });
          store.getState().insert("tall-pantry");
          return store.getState().lastRejection ? null : store;
        },
      ],
      [
        "insert a wall cabinet into a cleared wall run",
        () => {
          const store = createStore();
          if (!tryRemove(store, ["p8", "p15"])) return null;
          const opening = store
            .getState()
            .voids.find((record) => record.id.startsWith("A|0.30:"));
          if (!opening) return null;
          store.getState().select({ kind: "void", id: opening.id });
          store.getState().insert("wall-cabinet");
          return store.getState().lastRejection ? null : store;
        },
      ],
    ] as const;
    return [...singles, ...pairs, ...withAnInsert];
  }

  // Leg 1, swept at both declared settings, after a depth round trip and after a reload: a source that survives one
  // command and not a save still reaches the arm.
  it("carries a catalogue-known source on every column of every reachable state", () => {
    const reached: string[] = [];
    const refused: string[] = [];
    let inspected = 0;

    for (const [name, open] of everyScenario()) {
      const store = open();
      if (!store) {
        refused.push(name);
        continue;
      }
      const states: readonly (readonly [string, Store])[] = [
        ["@start", store],
        ["@700", setDepth(store, DEEPER_MM)],
        ["@600", setDepth(store, DEFAULT_CABINET_DEPTH_MM)],
        ["@reload", reload(store)],
        ["@reload@700", setDepth(reload(store), DEEPER_MM)],
      ];
      for (const [label, state] of states) {
        inspected += state.getState().columns.size;
        reached.push(
          ...columnsReachingTheFallback(state).map(
            (column) => `${name} ${label} ${column}`,
          ),
        );
      }
    }

    expect(reached).toStrictEqual([]);
    // Non-vacuity: the sweep visited a large state set, and the refusals are enumerated so a scenario that silently
    // stopped being buildable shows up as a name.
    expect(inspected).toBeGreaterThan(1000);
    expect([...refused].sort()).toStrictEqual(REFUSED_SCENARIOS);
  });

  // Leg 2: the catalogues must hold the same ids, or a source recorded at one setting is unresolvable at the other.
  it("offers identical buildId sets at every declared setting", () => {
    const byDepth = declaredCabinetDepthsMm().map(
      (cabinetDepthMm) =>
        [
          cabinetDepthMm,
          new Set(buildKitchenLBodyCatalog(cabinetDepthMm).keys()),
        ] as const,
    );
    const [first, ...rest] = byDepth;
    if (!first) throw new Error("no declared cabinet depths");

    expect(rest.length).toBeGreaterThan(0);
    expect(first[1].size).toBeGreaterThan(0);
    for (const [cabinetDepthMm, ids] of rest) {
      expect(ids.size, `catalogue size at ${String(cabinetDepthMm)}`).toBe(
        first[1].size,
      );
      expect([...ids].filter((id) => !first[1].has(id))).toStrictEqual([]);
      expect([...first[1]].filter((id) => !ids.has(id))).toStrictEqual([]);
    }
  });

  // A stored document's sources are seeded row ids, not the parameterised ones a rebuild swaps in; they must resolve at
  // both settings.
  it("resolves every source the shipped fixture's frozen map records, at both settings", () => {
    const store = createStore();
    const sources = [...store.getState().columns]
      .map(([, column]) => column.depthFromBuildId)
      .filter((source): source is string => source !== undefined);

    expect(sources.length).toBeGreaterThan(0);
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      expect(
        sources.filter((source) => !catalog.has(source)),
        `unresolvable at ${String(cabinetDepthMm)}`,
      ).toStrictEqual([]);
    }
  });

  // Leg 3: the check can fail. The fixture ships no frozen map, so the stripping happens on a document a command has
  // already frozen, which is also the only shape the legacy population takes.
  it("is reached by a document written before wave 6K-c", () => {
    const cleared = createStore();
    expect(tryRemove(cleared, ["p8", "p15"])).toBe(true);

    expect(
      columnsReachingTheFallback(asLegacyDocument(cleared)).length,
    ).toBeGreaterThan(0);
  });

  // ADR 0080 decision 5's "every column a later build publishes carries a source" is false of this build: decision 4's
  // own answer carries none by design and `projectFrozenMap` writes it, so a legacy document is saved still sourceless
  // and reaches the arm on every later load. The behaviour is fine; the population is documents descended from a
  // pre-source one, not documents saved before it.
  it("saves a sourceless column of its own, so the population is closed under descent and not by date", () => {
    const cleared = createStore();
    expect(tryRemove(cleared, ["p8", "p15"])).toBe(true);
    const legacy = asLegacyDocument(cleared);
    setDepth(legacy, DEEPER_MM);

    const savedWithoutASource = (
      legacy.getState().design.emptyColumns ?? []
    ).filter((entry) => !("depthFromBuildId" in entry));

    expect(savedWithoutASource.length).toBeGreaterThan(0);
    // And the document it saved reaches the arm again, one reload later.
    expect(columnsReachingTheFallback(reload(legacy)).length).toBeGreaterThan(
      0,
    );
  });
});

describe("what actually changed, measured over a wider scenario set than the wave's", () => {
  function publishedMillimetres(store: Store): Record<string, number> {
    return Object.fromEntries(
      [...store.getState().columns].map(([key, column]) => [
        key,
        Math.round(column.d * 1e6) / 1000,
      ]),
    );
  }

  function everyState(
    open: () => Store,
  ): Record<string, Record<string, number>> {
    const store = open();
    const states: Record<string, Record<string, number>> = {
      "@start": publishedMillimetres(store),
    };
    setDepth(store, DEEPER_MM);
    states["@700"] = publishedMillimetres(store);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);
    states["@600"] = publishedMillimetres(store);
    states["@reload"] = publishedMillimetres(reload(store));
    return states;
  }

  // A legacy document must publish what its sourced twin publishes, except where the missing source is the whole point
  // (a base run's 620/720, which `columnBuildDepthM` cannot express at either setting). The scenario-free statement is
  // in
  // `cabinet-depth-legacy-fallback.test.ts`: no difference where `columnBuildDepthM` could have expressed the sourced
  // answer at both declared settings. That qualifier is load-bearing (ADR 0080 amendments J and K): an entry on the
  // ceiling at one setting and off it at the other does differ. The set below is written out whole.
  it("differs from its sourced twin only on a base run at the deeper setting", () => {
    const differences: string[] = [];
    for (const id of everyPlacementId()) {
      const open = (): Store => {
        const store = createStore();
        if (!tryRemove(store, [id])) throw new Error(`cannot delete ${id}`);
        return store;
      };
      if (REFUSED_SCENARIOS.includes(`delete ${id}`)) continue;
      const sourced = everyState(open);
      const legacy = everyState(() => asLegacyDocument(open()));
      for (const [label, depths] of Object.entries(sourced)) {
        for (const [key, depthMm] of Object.entries(depths)) {
          const legacyMm = legacy[label]?.[key];
          if (legacyMm !== undefined && Math.abs(legacyMm - depthMm) < 1e-6)
            continue;
          differences.push(
            `delete ${id} ${label} ${key}: sourced ${String(depthMm)} legacy ${String(legacyMm)}`,
          );
        }
      }
    }

    // Written out whole rather than counted: a count hid a slice in an earlier draft. A wall-A body's depth is measured
    // along wall B, so a deeper corner slides wall B's run (ADR 0090 decision 2): `B|1.80` → `B|1.90` and `B|1.20` →
    // `B|1.30`, no value moved. `p2`'s 620/600 pair at both settings, an unsourced surplus the ceiling cannot express,
    // keeps the snapshot non-vacuous.
    expect([...differences].sort()).toMatchInlineSnapshot(`
      [
        "delete p0 @700 A|1.30: sourced 720 legacy 620",
        "delete p1 @700 A|2.00: sourced 720 legacy 620",
        "delete p2 @600 A|2.60: sourced 620 legacy 600",
        "delete p2 @700 A|2.60: sourced 720 legacy 700",
        "delete p2 @reload A|2.60: sourced 620 legacy 600",
        "delete p4 @700 A|3.20: sourced 720 legacy 620",
        "delete p5 @700 B|1.30: sourced 738 legacy 638",
      ]
    `);
  });
});

describe("the ratchet as an anti-invariant", () => {
  /** Every depth `columnBuildDepthM` can produce at a setting the design is not declaring: an unsourced depth
   *  landing on one was produced at another setting and then held, which is the ratchet as a shape. */
  function ceilingsOfOtherSettings(
    currentMm: number,
    hasFullHeightUnder: boolean,
  ): readonly number[] {
    return declaredCabinetDepthsMm()
      .filter((cabinetDepthMm) => cabinetDepthMm !== currentMm)
      .map(
        (cabinetDepthMm) =>
          Math.round(
            1e6 * columnBuildDepthM({ cabinetDepthMm, hasFullHeightUnder }),
          ) / 1000,
      );
  }

  const LEGACY_SCENARIOS: readonly (readonly [string, readonly string[]])[] = [
    ["a cleared wall column", ["p8", "p15"]],
    ["a cleared neighbouring wall column", ["p10", "p16"]],
    ["a cleared base slot", ["p1", "p12", "p18"]],
    ["a cleared sink run", ["p0", "p11", "p17"]],
    ["a cleared oven tower", ["p5", "p22"]],
    ["a cleared pantry", ["p6", "p23"]],
    ["a cleared fridge niche", ["p7", "p24"]],
    ["a cleared wall pair", ["p8", "p15", "p10", "p16"]],
  ];

  // A wall column at 400 in a 600 mm kitchen is a depth off the other setting's row of ADR 0028's map. Written as a
  // property over the whole map, so a future column with that shape fails without anyone widening a list.
  it("publishes no unsourced depth off another setting's row of the map", () => {
    const violations: string[] = [];
    let unsourcedInspected = 0;
    let sawTheDeeperRow = false;
    for (const [name, members] of LEGACY_SCENARIOS) {
      const cleared = createStore();
      if (!tryRemove(cleared, members)) throw new Error(`cannot clear ${name}`);
      const store = asLegacyDocument(cleared);
      for (const cabinetDepthMm of [
        DEEPER_MM,
        DEFAULT_CABINET_DEPTH_MM,
        DEEPER_MM,
        DEFAULT_CABINET_DEPTH_MM,
        DEFAULT_CABINET_DEPTH_MM,
      ]) {
        setDepth(store, cabinetDepthMm);
        for (const [key, column] of store.getState().columns) {
          if (column.depthFromBuildId !== undefined) continue;
          unsourcedInspected += 1;
          const publishedMm = Math.round(column.d * 1e6) / 1000;
          if (cabinetDepthMm === DEEPER_MM && publishedMm === 400) {
            sawTheDeeperRow = true;
          }
          if (
            ceilingsOfOtherSettings(
              cabinetDepthMm,
              column.hasFullHeightUnder,
            ).includes(publishedMm)
          ) {
            violations.push(
              `${name} at ${String(cabinetDepthMm)}: ${key} publishes ${String(publishedMm)}`,
            );
          }
        }
      }
    }

    expect(violations).toStrictEqual([]);
    // Non-vacuity: unsourced columns were inspected, and the ratcheted depth (400 on a wall column) was published at
    // the
    // setting that owns it.
    expect(unsourcedInspected).toBeGreaterThan(0);
    expect(sawTheDeeperRow).toBe(true);
  });
});
