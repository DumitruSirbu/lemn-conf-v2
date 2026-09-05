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

describe("the free-ground guard is idle, and is not hiding the rule", () => {
  // **ADR 0090 decision 4b's non-vacuity criterion, from the other side** — the wave's counterfactual
  // kept as a standing assertion rather than a one-off measurement.
  //
  // `clipEmptyColumnsToFreeGround` returns its input **by identity** when it drops nothing, so
  // asking it again over the published map answers exactly the question the counterfactual asks: is
  // there a member-less column standing on ground a placement occupies? Identity means no, which
  // means the document that was validated above **is** the pre-clip document — the guard is idle and
  // the ladder is what is keeping the map right.
  //
  // Under ADR 0090's struck decision 4a this fired in five of six wall-B legacy scenarios, and
  // disabling it put 9 and 10 refusal-class issues back on two of them. That is what it looks like
  // when the guard is hiding a wrong rule rather than backing up a right one.
  //
  // The other half of "drops nothing" — that no space vanished — is carried by the round-trip and
  // orphan criteria above: a dropped column does not come back at 600.
  it.each(CLEARED_SCENARIOS)(
    "%s, sourced, at both settings",
    (_name, members) => {
      const store = removeAll(createStore(), members);

      for (const cabinetDepthMm of [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM]) {
        setDepth(store, cabinetDepthMm);
        const { columns, records } = store.getState();
        expect(
          clipEmptyColumnsToFreeGround(columns, records),
          `at ${String(cabinetDepthMm)}`,
        ).toBe(columns);
      }
    },
  );

  it.each(CLEARED_SCENARIOS)("%s, as a legacy document", (_name, members) => {
    const store = asLegacyDocument(removeAll(createStore(), members));

    setDepth(store, DEEPER_MM);

    const { columns, records } = store.getState();
    expect(clipEmptyColumnsToFreeGround(columns, records)).toBe(columns);
  });

  // The guard can still fire — `clip-empty-columns-to-free-ground.test.ts` proves that on a
  // hand-built map. It is deliberately **not** a legacy document any more: under the ladder none of
  // them overlaps, so a legacy fixture would make the non-vacuity case silently vacuous.
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
