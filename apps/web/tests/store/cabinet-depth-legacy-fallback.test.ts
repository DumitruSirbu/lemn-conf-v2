// Everything here is legacy-only: a current-schema document carries a source on every column (ADR 0080 decision 5).
import {
  buildKitchenLBodyCatalog,
  columnBuildDepthM,
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
  DesignSchema,
  KITCHEN_L_DESIGN,
  occupiedDepthOfEntryM,
  type BodyCatalog,
  type Column,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  catalogWithAPinnedTop,
  designWithAPinnedTop,
  PINNED_TOP_WITNESS_BUILD_ID,
} from "../support/pinned-top-witness";
import { columnKeyAt } from "../support/wall-b-column-keys";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `A|0.30`: a wall run with nothing under it but the corner base. Cleared, it is a member-less **wall**
 *  column, the shape the ratchet bites. */
const WALL_KEY = "A|0.30";
const WALL_MEMBERS = ["p8", "p15"];

/** `A|2.00`: the dishwasher niche. Cleared, it is a member-less **base** column frozen at 620, a depth
 *  `columnBuildDepthM` cannot express at either setting. */
const BASE_KEY = "A|2.00";
const BASE_MEMBERS = ["p1", "p12", "p18"];

/** `B|2.45`: the freestanding fridge's slot, frozen at its 742 mm machine depth. */
const FRIDGE_KEY = "B|2.45";
const FRIDGE_MEMBERS = ["p7", "p24"];

/** `B|1.80`: a pantry frozen at 600. Cleared, it loses its full-height member, which pins
 *  `hasFullHeightUnder`'s asymmetry. */
const PANTRY_KEY = "B|1.80";
const PANTRY_MEMBERS = ["p6", "p23"];

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** The one member-less column on a wall, wherever the setting left it: ADR 0090's slide and ADR 0069's clip move
 *  columns between settings. Uniqueness is asserted so a fixture that grew a second space fails here. */
function theOneClearedColumnOn(store: Store, wall: "A" | "B"): Column {
  const { columns, records } = store.getState();
  const cleared = [...columns].filter(
    ([key, column]) =>
      column.wall === wall && !records.some((record) => record.col === key),
  );
  const [only] = cleared;
  if (cleared.length !== 1 || !only) {
    throw new Error(
      `expected one member-less column on wall ${wall}, found ${String(cleared.length)}`,
    );
  }
  return only[1];
}

function columnOf(store: Store, key: string): Column {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

function depthMOf(store: Store, key: string): number {
  return columnOf(store, key).d;
}

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
    `setCabinetDepth ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

/** The held design as a document predating recorded sources: every `depthFromBuildId` stripped through the wire
 *  (ADR 0080 decision 5). */
function asLegacyDocument(
  store: Store,
  rewrite: (entry: EmptyColumn) => EmptyColumn = (entry) => entry,
): Store {
  const held = store.getState().design;
  const strip = (entry: EmptyColumn): EmptyColumn => {
    const stripped = { ...rewrite(entry) };
    delete stripped.depthFromBuildId;
    return stripped;
  };
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

function reload(store: Store): Store {
  return createStore(
    DesignSchema.parse(JSON.parse(JSON.stringify(store.getState().design))),
  );
}

/** The build ceiling this rule answers with at one setting: 330/400 with nothing full-height under the opening,
 *  600/700 with one. */
function ceilingM(cabinetDepthMm: number, hasFullHeightUnder: boolean): number {
  return columnBuildDepthM({ cabinetDepthMm, hasFullHeightUnder });
}

describe("a depth the fallback itself produced follows the setting back down", () => {
  // Nothing produced the 400 except this rule one setting ago. Both ends are asserted against `columnBuildDepthM`,
  // not 330 and 400, so the test follows the map.
  it("takes a member-less wall column back to the map's own row", () => {
    const store = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));
    const { hasFullHeightUnder } = columnOf(store, WALL_KEY);
    const frozenM = depthMOf(store, WALL_KEY);

    setDepth(store, DEEPER_MM);
    const deepenedM = depthMOf(store, WALL_KEY);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(frozenM).toBeCloseTo(
      ceilingM(DEFAULT_CABINET_DEPTH_MM, hasFullHeightUnder),
      9,
    );
    expect(deepenedM).toBeCloseTo(ceilingM(DEEPER_MM, hasFullHeightUnder), 9);
    expect(depthMOf(store, WALL_KEY)).toBeCloseTo(
      ceilingM(DEFAULT_CABINET_DEPTH_MM, hasFullHeightUnder),
      9,
    );
    expect(deepenedM).toBeGreaterThan(depthMOf(store, WALL_KEY));
  });

  it("claims no body for a depth the build ceiling supplied", () => {
    const store = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));

    setDepth(store, DEEPER_MM);

    expect(columnOf(store, WALL_KEY).depthFromBuildId).toBeUndefined();
    const stored = store
      .getState()
      .design.emptyColumns?.find((entry) => entry.alongMm === 300);
    expect(stored?.depthMm).toBe(400);
    expect(stored && "depthFromBuildId" in stored).toBe(false);
  });
});

describe("a depth the fallback could never have produced is kept", () => {
  // `columnBuildDepthM` is a ceiling that cannot reach a base run's 620 at either setting, so an unsourced 620
  // was never this rule's answer.
  it.each([
    ["a cleared base slot", BASE_KEY, BASE_MEMBERS],
    ["a cleared appliance niche", FRIDGE_KEY, FRIDGE_MEMBERS],
  ])("holds %s at both declared settings", (_name, key, members) => {
    const store = asLegacyDocument(removeAll(createStore(), members));
    const wall = key.startsWith("B") ? "B" : "A";
    const { hasFullHeightUnder } = columnOf(store, key);
    const frozenM = depthMOf(store, key);

    setDepth(store, DEEPER_MM);
    // The space is found on its wall, not at its coordinate: wall-B columns slide and clip with the setting
    // (ADR 0090 decision 2), so `B|2.45` names no column at 700.
    const deepenedM = theOneClearedColumnOn(store, wall).d;
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    // Why it is a surplus: no setting makes the ceiling reach it, so the fallback cannot be its author.
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      expect(
        frozenM,
        `${key} against the ceiling at ${String(cabinetDepthMm)}`,
      ).toBeGreaterThan(ceilingM(cabinetDepthMm, hasFullHeightUnder));
    }
    expect(deepenedM).toBeCloseTo(frozenM, 9);
    expect(theOneClearedColumnOn(store, wall).d).toBeCloseTo(frozenM, 9);
  });

  it("keeps an unresolvable source on a surplus and drops it on a ceiling answer", () => {
    const withSource = (store: Store, source: string): Store => {
      const held = store.getState().design;
      const tag = (entry: EmptyColumn): EmptyColumn => ({
        ...entry,
        depthFromBuildId: source,
      });
      return createStore(
        DesignSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...held,
              emptyColumns: (held.emptyColumns ?? []).map(tag),
              columnExtents: (held.columnExtents ?? []).map(tag),
            }),
          ),
        ),
      );
    };
    const surplus = withSource(
      removeAll(createStore(), BASE_MEMBERS),
      "retired-cabinet-600",
    );
    const ceiling = withSource(
      removeAll(createStore(), WALL_MEMBERS),
      "retired-cabinet-600",
    );

    setDepth(surplus, DEEPER_MM);
    setDepth(ceiling, DEEPER_MM);

    expect(columnOf(surplus, BASE_KEY).depthFromBuildId).toBe(
      "retired-cabinet-600",
    );
    expect(columnOf(ceiling, WALL_KEY).depthFromBuildId).toBeUndefined();
  });
});

describe("hasFullHeightUnder feeds both ceilings, and keeping more is a theorem", () => {
  // The rising direction (a member-less column whose predicate turns true) has an empty population; it is a
  // declared witness in `frozen-map-declared-witnesses.test.ts` (ADR 0123), and
  // `qa-6k-j-fallback-rule.adversarial.test.ts` pins that no product path reaches it.

  // The falling direction, end to end: clearing `B|1.80` deletes its full-height pantry, so the freeze-time ceiling
  // drops 600 → 330, the frozen 600 is no longer this rule's own answer, and the surplus arm keeps it.
  it("keeps a 600 mm extent whose full-height member was deleted", () => {
    const store = asLegacyDocument(removeAll(createStore(), PANTRY_MEMBERS));
    const { hasFullHeightUnder } = columnOf(store, PANTRY_KEY);
    const frozenM = depthMOf(store, PANTRY_KEY);

    setDepth(store, DEEPER_MM);

    expect(hasFullHeightUnder).toBe(false);
    expect(ceilingM(DEFAULT_CABINET_DEPTH_MM, true)).toBeCloseTo(frozenM, 9);
    expect(ceilingM(DEFAULT_CABINET_DEPTH_MM, false)).toBeLessThan(frozenM);
    // ADR 0090 decision 2: the depth does not move and the wall-B coordinate does.
    expect(depthMOf(store, columnKeyAt(PANTRY_KEY, DEEPER_MM))).toBeCloseTo(
      frozenM,
      9,
    );
  });
});

describe("a ratchet the old rule already wrote into a document survives the load", () => {
  // Declared behaviour (ADR 0080 amendment F): the rule runs on a depth change and never re-answers an extent on
  // load (ADR 0055), so a 400 mm opening saved under the old rule shows until the depth is changed.
  it("still publishes the stale 400 in a 600 mm kitchen until the depth moves", () => {
    // A member-less wall column at 400 in a document that declares 600, written directly because the current rule
    // cannot write it.
    const carried = asLegacyDocument(
      removeAll(createStore(), WALL_MEMBERS),
      (entry) =>
        entry.wall === "A" && entry.alongMm === 300
          ? { ...entry, depthMm: 400 }
          : entry,
    );

    expect(depthMOf(carried, WALL_KEY) * 1000).toBeCloseTo(400, 6);
    expect(carried.getState().design.settings?.cabinetDepthMm).toBe(
      DEFAULT_CABINET_DEPTH_MM,
    );

    setDepth(carried, DEEPER_MM);
    setDepth(carried, DEFAULT_CABINET_DEPTH_MM);
    expect(depthMOf(carried, WALL_KEY)).toBeCloseTo(
      ceilingM(DEFAULT_CABINET_DEPTH_MM, false),
      9,
    );
  });
});

describe("one document answers one way, whatever route reached it", () => {
  // The predicate reads only `column.d` and the document's `settings.cabinetDepthMm`, never the command history
  // (ADR 0011 Gap D).
  it("publishes the same map by three different routes to the same state", () => {
    const opened = () =>
      asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));

    const short = setDepth(
      setDepth(opened(), DEEPER_MM),
      DEFAULT_CABINET_DEPTH_MM,
    );
    const long = setDepth(
      setDepth(
        setDepth(setDepth(opened(), DEEPER_MM), DEFAULT_CABINET_DEPTH_MM),
        DEEPER_MM,
      ),
      DEFAULT_CABINET_DEPTH_MM,
    );
    const reloaded = reload(short);

    expect(publishedDepths(long)).toStrictEqual(publishedDepths(short));
    // Through the wire `toEmptyColumn` writes whole millimetres (a restored 0.33 is exact, an in-session one
    // accumulates to 0.32999999999999996), so this compares at the millimetre the document carries.
    expect(inMillimetres(reloaded)).toStrictEqual(inMillimetres(short));
    // Non-vacuous: the routes really are different lengths and the state really did move.
    expect(depthMOf(short, WALL_KEY)).toBeLessThan(
      ceilingM(DEEPER_MM, columnOf(short, WALL_KEY).hasFullHeightUnder),
    );
  });
});

/** Whether `columnBuildDepthM` could have expressed this column's sourced answer at both declared settings
 *  (ADR 0080 amendment J); an entry on the ceiling at one setting only is the hazard trapped at the file's foot. */
function isCeilingExpressibleAtBothSettings(
  sourced: Record<string, Record<string, number>>,
  ceilings: Record<string, Record<string, number>>,
  key: string,
): boolean {
  return (["@600", "@700"] as const).every((label) => {
    const ceiling = ceilings[label]?.[key];
    const answer = sourced[label]?.[key];
    return (
      ceiling !== undefined &&
      answer !== undefined &&
      Math.abs(ceiling - answer) < 1e-9
    );
  });
}

/** The wall columns, whose sourced answer `columnBuildDepthM` states exactly. Named, because a derived set would
 *  restate the predicate it checks. */
const WALL_KEYS = new Set(["A|0.30", "A|0.75", "B|0.61"]);

/** Every placement the shipped fixture lets a customer delete, so no scenario list bounds the sweep. */
function deletablePlacementIds(): readonly string[] {
  return createStore()
    .getState()
    .records.filter((record) => record.canDelete)
    .map((record) => record.id);
}

const SCENARIOS: readonly (readonly [string, () => Store])[] = [
  ["the untouched fixture", () => createStore()],
  ["one base member deleted", () => removeAll(createStore(), ["p1"])],
  ["a cleared base column", () => removeAll(createStore(), BASE_MEMBERS)],
  ["a cleared wall column", () => removeAll(createStore(), WALL_MEMBERS)],
  ["a deleted appliance", () => removeAll(createStore(), ["p7"])],
  ["a cleared appliance niche", () => removeAll(createStore(), FRIDGE_MEMBERS)],
];

/** The published map at the millimetre the document carries, so comparing a session with a reload measures the
 *  rule and not `toEmptyColumn`'s rounding. */
function inMillimetres(store: Store): Record<string, number> {
  return Object.fromEntries(
    [...store.getState().columns].map(([key, column]) => [
      key,
      Math.round(column.d * 1000),
    ]),
  );
}

function publishedDepths(store: Store): Record<string, number> {
  return Object.fromEntries(
    [...store.getState().columns].map(([key, column]) => [key, column.d]),
  );
}

/** Each scenario at both declared settings and after a reload, as `label -> published depths`. */
function everyState(
  open: () => Store,
  read: (store: Store) => Record<string, number> = publishedDepths,
): Record<string, Record<string, number>> {
  const store = open();
  const states: Record<string, Record<string, number>> = {
    "@start": read(store),
  };
  setDepth(store, DEEPER_MM);
  states["@700"] = read(store);
  setDepth(store, DEFAULT_CABINET_DEPTH_MM);
  states["@600"] = read(store);
  states["@reload"] = read(reload(store));
  return states;
}

describe("no current-schema document reaches the fallback arm at all", () => {
  // ADR 0080 decision 5's premise: every producer of a column carries a source, so only a legacy document
  // reaches the fallback arm.
  it("publishes a catalogue-known source on every column of every scenario", () => {
    const sourceless: string[] = [];
    let inspected = 0;
    for (const [name, open] of SCENARIOS) {
      const store = open();
      for (const label of ["@600", "@700"] as const) {
        setDepth(
          store,
          label === "@700" ? DEEPER_MM : DEFAULT_CABINET_DEPTH_MM,
        );
        const catalog = buildKitchenLBodyCatalog(
          label === "@700" ? DEEPER_MM : DEFAULT_CABINET_DEPTH_MM,
        );
        for (const [key, column] of store.getState().columns) {
          const source = column.depthFromBuildId;
          if (source !== undefined && catalog.has(source)) inspected += 1;
          else sourceless.push(`${name} ${label} ${key} ${source ?? "(none)"}`);
        }
      }
    }

    expect(sourceless).toStrictEqual([]);
    // Non-vacuous: it inspected something.
    expect(inspected).toBeGreaterThan(0);
  });

  // Non-vacuous: a source the catalogue no longer holds is unreachable across a depth change, because the two
  // declared catalogues hold identical id sets.
  it("offers the same buildId set at every declared setting", () => {
    const [first, ...rest] = declaredCabinetDepthsMm().map(
      (depthMm) => new Set(buildKitchenLBodyCatalog(depthMm).keys()),
    );
    if (!first) throw new Error("no declared cabinet depths");

    expect(rest.length).toBeGreaterThan(0);
    for (const other of rest) {
      expect([...other].filter((id) => !first.has(id))).toStrictEqual([]);
      expect([...first].filter((id) => !other.has(id))).toStrictEqual([]);
    }
  });

  // Non-vacuous: a deliberately source-stripped document does reach the arm.
  it("is reached by a document written before wave 6K-c", () => {
    const legacy = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));

    const reached = [...legacy.getState().columns].filter(
      ([, column]) => column.depthFromBuildId === undefined,
    );

    expect(reached.length).toBeGreaterThan(0);
  });
});

describe("a legacy document differs from its sourced twin only where the source was the point", () => {
  // A shape, not a count: a legacy document never differs from its sourced twin where `columnBuildDepthM` could
  // have expressed the sourced answer at both declared settings (ADR 0080 amendment H). "At both" is load-bearing:
  // the follow arm carries an entry on the ceiling at one setting only to the setting where it is not (amendment K),
  // and the describe at the foot of this file is the tripwire. The difference set is written out, not counted.
  it("never differs where the build ceiling could have said the same thing", () => {
    const differences: string[] = [];
    let inspected = 0;
    let onTheCeiling = 0;
    let expressibleAtBoth = 0;

    for (const placementId of deletablePlacementIds()) {
      const open = () => removeAll(createStore(), [placementId]);
      const sourced = everyState(open);
      const legacy = everyState(() => asLegacyDocument(open()));
      const ceilings = everyState(open, (store) =>
        Object.fromEntries(
          [...store.getState().columns].map(([key, column]) => [
            key,
            ceilingM(
              store.getState().design.settings?.cabinetDepthMm ??
                DEFAULT_CABINET_DEPTH_MM,
              column.hasFullHeightUnder,
            ),
          ]),
        ),
      );

      for (const [label, depths] of Object.entries(sourced)) {
        for (const [key, sourcedM] of Object.entries(depths)) {
          inspected += 1;
          if (isCeilingExpressibleAtBothSettings(sourced, ceilings, key)) {
            expressibleAtBoth += 1;
          }
          const legacyM = legacy[label]?.[key];
          if (legacyM !== undefined && Math.abs(legacyM - sourcedM) < 1e-9) {
            continue;
          }
          // It differs; the only licence is a sourced answer the ceiling cannot express at both settings.
          if (!isCeilingExpressibleAtBothSettings(sourced, ceilings, key)) {
            continue;
          }
          onTheCeiling += 1;
          differences.push(
            `${placementId} ${label} ${key}: sourced ${String(
              Math.round(sourcedM * 1000),
            )} is the ceiling, legacy ${String(
              Math.round((legacyM ?? 0) * 1000),
            )}`,
          );
        }
      }
    }

    expect(differences).toStrictEqual([]);
    expect(onTheCeiling).toBe(0);
    // Non-vacuous: the licensing condition must be live, not merely the sweep. A reading can only fail where the
    // ceiling could have expressed the sourced answer at both settings.
    expect(deletablePlacementIds().length).toBeGreaterThan(10);
    expect(inspected).toBeGreaterThan(100);
    expect(expressibleAtBoth).toBeGreaterThan(0);
  });

  // So the test above cannot pass by there being no differences: the legacy population does diverge.
  it("does diverge, and only on a chain the ceiling cannot express", () => {
    const diverging = new Set<string>();
    for (const placementId of deletablePlacementIds()) {
      const open = () => removeAll(createStore(), [placementId]);
      const sourced = everyState(open);
      const legacy = everyState(() => asLegacyDocument(open()));
      for (const [label, depths] of Object.entries(sourced)) {
        for (const [key, sourcedM] of Object.entries(depths)) {
          const legacyM = legacy[label]?.[key];
          if (legacyM === undefined || Math.abs(legacyM - sourcedM) >= 1e-9) {
            diverging.add(key);
          }
        }
      }
    }

    expect(diverging.size).toBeGreaterThan(0);
    // Never a wall column: its sourced answer is the map row, so a missing source costs nothing there.
    expect([...diverging].filter((key) => WALL_KEYS.has(key))).toStrictEqual(
      [],
    );
  });
});

describe("an entry that sits on a build ceiling at one declared setting only", () => {
  /** The hazard (ADR 0080 amendment K): the follow arm reads a depth on `columnBuildDepthM` as its own previous
   *  answer, so an entry on the ceiling at one setting only is carried to the setting where it is not (a pinned 600
   *  reaches 700). Empty since ADR 0101: every shipped entry follows the setting. The sweep stays falsifiable by the
   *  declared witness below (ADR 0093 decision 1). */
  const KNOWN_HAZARD_ENTRIES: readonly string[] = [];

  function sitsOnTheCeiling(
    catalogAt: (cabinetDepthMm: number) => BodyCatalog,
    buildId: string,
    cabinetDepthMm: number,
    hasFullHeightUnder: boolean,
  ): boolean {
    const definition = catalogAt(cabinetDepthMm).get(buildId);
    if (!definition) throw new Error(`${buildId} is not in the catalogue`);
    return (
      Math.abs(
        occupiedDepthOfEntryM({ buildId, definition }) -
          ceilingM(cabinetDepthMm, hasFullHeightUnder),
      ) < 1e-9
    );
  }

  /** Every entry of one catalogue with the hazard's shape, plus the count of (entry, predicate) pairs on a ceiling
   *  at both settings, read from one catalogue so the two cannot be measured over different ones. */
  function hazardsIn(catalogAt: (cabinetDepthMm: number) => BodyCatalog): {
    readonly hazards: readonly string[];
    readonly onTheCeilingAtBoth: number;
  } {
    const settings = declaredCabinetDepthsMm();
    const hazards = new Set<string>();
    let onTheCeilingAtBoth = 0;

    for (const buildId of catalogAt(DEFAULT_CABINET_DEPTH_MM).keys()) {
      for (const hasFullHeightUnder of [false, true]) {
        const on = settings.map((cabinetDepthMm) =>
          sitsOnTheCeiling(
            catalogAt,
            buildId,
            cabinetDepthMm,
            hasFullHeightUnder,
          ),
        );
        if (on.every(Boolean)) onTheCeilingAtBoth += 1;
        if (new Set(on).size > 1) hazards.add(buildId);
      }
    }
    return { hazards: [...hazards].sort(), onTheCeilingAtBoth };
  }

  it("is no entry of the shipped catalogue", () => {
    const { hazards, onTheCeilingAtBoth } = hazardsIn(buildKitchenLBodyCatalog);

    expect(hazards).toStrictEqual([...KNOWN_HAZARD_ENTRIES].sort());
    // Non-vacuous: coinciding with a ceiling at both settings is common, so "at one setting only" has a large
    // population to be wrong about.
    expect(onTheCeilingAtBoth).toBeGreaterThan(0);
    expect(declaredCabinetDepthsMm().length).toBeGreaterThan(1);
  });

  // The arm's witness (ADR 0093 decision 2): the list above is empty, so the same sweep runs over a catalogue
  // holding a top pinned at 600 at every setting. Breaking `sitsOnTheCeiling` turns this red where the shipped
  // catalogue cannot.
  it("is found by the same sweep on a catalogue that holds one", () => {
    const { hazards } = hazardsIn(catalogWithAPinnedTop);

    expect(hazards).toStrictEqual([PINNED_TOP_WITNESS_BUILD_ID]);
  });

  // Fixture-bounded safety, not a structural guarantee: `B|1.80` records the pin but always holds a full-height
  // member, so it is never member-less. It becomes reachable when a member-less column's depth is a pinned 600 while
  // `hasFullHeightUnder` is true. Measured on the witness fixture, since the shipped one has no hazard entry.
  it("is unreachable on this fixture, for a reason the fixture supplies", () => {
    const store = createConfiguratorStore({
      design: designWithAPinnedTop(),
      catalogAt: catalogWithAPinnedTop,
      probeAt: createFakeProbeFactory(),
      now: () => OCCURRED_AT,
    });
    const sourcedByColumn = new Map(
      [...store.getState().columns].map(([key, column]) => [
        key,
        column.depthFromBuildId,
      ]),
    );

    const pinnedColumns = [...sourcedByColumn]
      .filter(([, source]) => source === PINNED_TOP_WITNESS_BUILD_ID)
      .map(([key]) => key);

    // One column records the pin, and a full-height member always stands in it.
    expect(pinnedColumns).toStrictEqual([PANTRY_KEY]);
    expect(
      store
        .getState()
        .records.filter((record) => record.col === PANTRY_KEY)
        .map((record) => record.band),
    ).toContain("column");
  });
});
