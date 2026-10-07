import {
  buildKitchenLBodyCatalog,
  columnBuildDepthM,
  DEFAULT_CABINET_DEPTH_MM,
  DesignSchema,
  KITCHEN_L_DESIGN,
  occupiedDepthOfEntryM,
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
  PINNED_TOP_WITNESS_PLACEMENT_ID,
} from "../support/pinned-top-witness";
import { columnKeyAt } from "../support/wall-b-column-keys";
import {
  assertSourcesExplainTheirDepths,
  columnsWithKnownSources,
  unexplainedColumns,
} from "../support/frozen-source-invariant";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `A|2.00`: a dishwasher niche under an open shelf and a top box. Clearing the base member leaves an occupied
 *  column whose 620 mm reach no surviving member explains (ADR 0073). */
const DISHWASHER_KEY = "A|2.00";
const DISHWASHER_ALONG_MM = 2000;
const DISHWASHER_BUILD_ID = "base-dishwasher-600";

/** `B|2.45`: the freestanding fridge, whose 742 mm is a real machine's and which no setting moves. */
const FRIDGE_KEY = "B|2.45";
const FRIDGE_BUILD_ID = "fridge-free-700";

/** `B|1.80`: a pantry under a top that wins §3.2's MAX here — 600 against the pantry's 599.
 *  The top is this suite's own pinned witness (`tests/support/pinned-top-witness.ts`, ADR 0101 decision 3), so
 *  the file stays red-capable now that no shipped cabinet is pinned. */
const PANTRY_KEY = "B|1.80";
const PANTRY_MEMBERS: readonly string[] = [
  "p6",
  PINNED_TOP_WITNESS_PLACEMENT_ID,
];

/** `A|0.30`: a wall run with nothing under it but the corner base, so clearing it leaves a member-less
 *  **wall** column — the one shape in ADR 0073's residue that reaches a body somebody builds. */
const WALL_KEY = "A|0.30";
const WALL_MEMBERS = ["p8", "p15"];

const DISHWASHER_MEMBERS = ["p1", "p12", "p18"];

/** A **wall** body of this kitchen standing one column over, in the shipped catalogue at both
 *  settings — so the invariant will inspect it — and in no lifted column. The band matters: the
 *  acknowledged exemption is offered to wall and top sources only, so a source of any other band
 *  would fail for the wrong reason and prove nothing about the keying. */
const INTRUDING_WALL_BUILD_ID = "wall-corner-return-570";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

/** The shipped kitchen with this suite's pinned top at `B|1.80`, for the claim that a body the setting does not move
 *  keeps its depth. */
function createStoreWithAPinnedTop() {
  return createConfiguratorStore({
    design: designWithAPinnedTop(),
    catalogAt: catalogWithAPinnedTop,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** What this entry declares it fills, at this cabinet depth — the one answer ADR 0073 decision 2
 *  re-asks, read the same way the store reads it. */
function declaredDepthM(buildId: string, cabinetDepthMm: number): number {
  const definition = catalogWithAPinnedTop(cabinetDepthMm).get(buildId);
  if (!definition) throw new Error(`${buildId} is not in the catalogue`);
  return occupiedDepthOfEntryM({ buildId, definition });
}

/** Guards the member-less arm: `projectFrozenMap` partitions the arrays by exactly this predicate, so an entry in
 *  `emptyColumns` has nothing standing in it. */
function isMemberLess(store: Store, alongMm: number): boolean {
  return (store.getState().design.emptyColumns ?? []).some(
    (entry) => entry.alongMm === alongMm,
  );
}

function columnOf(store: Store, key: string): Column {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

function removeAll(store: Store, ids: readonly string[]): Store {
  for (const id of ids) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
  }
  return store;
}

/** The design as a save and a reload deliver it, with every recorded source rewritten; `undefined` drops it, as a
 *  document written before sources were recorded would. */
function reloadWithSource(store: Store, source: string | undefined): Store {
  const rewrite = (entry: EmptyColumn): EmptyColumn => {
    const rewritten = { ...entry };
    delete rewritten.depthFromBuildId;
    return source === undefined
      ? rewritten
      : { ...rewritten, depthFromBuildId: source };
  };
  const held = store.getState().design;
  const rewritten = {
    ...held,
    emptyColumns: (held.emptyColumns ?? []).map(rewrite),
    columnExtents: (held.columnExtents ?? []).map(rewrite),
  };
  return createStore(DesignSchema.parse(JSON.parse(JSON.stringify(rewritten))));
}

describe("the depth a cleared slot keeps through a depth change", () => {
  it("follows the body that froze it, not the members that are left", () => {
    const store = removeAll(createStore(), ["p1"]);
    const frozenM = columnOf(store, DISHWASHER_KEY).d;

    store.getState().setCabinetDepth(DEEPER_MM);

    assertSourcesExplainTheirDepths(store.getState(), "after setCabinetDepth");
    expect(frozenM).toBeCloseTo(
      declaredDepthM(DISHWASHER_BUILD_ID, DEFAULT_CABINET_DEPTH_MM),
      6,
    );
    expect(columnOf(store, DISHWASHER_KEY).d).toBeCloseTo(
      declaredDepthM(DISHWASHER_BUILD_ID, DEEPER_MM),
      6,
    );
    // Non-vacuous: the declaration really does move between the two settings.
    expect(declaredDepthM(DISHWASHER_BUILD_ID, DEEPER_MM)).not.toBeCloseTo(
      declaredDepthM(DISHWASHER_BUILD_ID, DEFAULT_CABINET_DEPTH_MM),
      6,
    );
  });

  // `projectFrozenMap` writes this map into the document the coalescer saves, so a stale extent reloads stale for good.
  it("writes the re-answered extent into the document it hands on to be saved", () => {
    const store = removeAll(createStore(), ["p1"]);

    store.getState().setCabinetDepth(DEEPER_MM);

    const stored = store
      .getState()
      .design.columnExtents?.find(
        (extent) =>
          extent.wall === "A" && extent.alongMm === DISHWASHER_ALONG_MM,
      );
    expect(stored?.depthMm).toBe(720);
    expect(stored?.depthFromBuildId).toBe(DISHWASHER_BUILD_ID);
  });
});

describe("an extent whose depth came from a body the setting does not move", () => {
  // The depth falls out of the entry's own `finishesAtMm`, which is not a function of the cabinet depth (ADR 0073
  // decision 2); the store names none of these ids or bands.
  it.each([
    {
      name: "a freestanding appliance",
      key: FRIDGE_KEY,
      members: ["p7"] as readonly string[],
      buildId: FRIDGE_BUILD_ID,
      openStore: createStore,
    },
    {
      name: "a pinned cabinet this suite declares",
      key: PANTRY_KEY,
      members: PANTRY_MEMBERS,
      buildId: PINNED_TOP_WITNESS_BUILD_ID,
      openStore: createStoreWithAPinnedTop,
    },
  ])("does not move either: $name", ({ key, members, buildId, openStore }) => {
    const store = removeAll(openStore(), members);
    const frozenM = columnOf(store, key).d;

    store.getState().setCabinetDepth(DEEPER_MM);

    // The witness catalogue is handed over (ADR 0101 decision 3): a source the helper cannot look up is skipped as
    // legal,
    // so a declared body checked against the shipped map would be invisible to the invariant.
    assertSourcesExplainTheirDepths(
      { ...store.getState(), catalogAt: catalogWithAPinnedTop },
      "after setCabinetDepth",
    );
    expect(frozenM).toBeCloseTo(
      declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM),
      6,
    );
    // The depth does not move; the wall-B coordinate it is read at does, since a deeper corner on wall A takes more of
    // wall B (ADR 0090 decision 2).
    expect(columnOf(store, columnKeyAt(key, DEEPER_MM)).d).toBeCloseTo(
      frozenM,
      6,
    );
    expect(declaredDepthM(buildId, DEEPER_MM)).toBeCloseTo(frozenM, 6);
  });

  it("holds the appliance's own depth on the way back down as well", () => {
    const store = removeAll(createStore(), ["p7"]);
    const frozenM = columnOf(store, FRIDGE_KEY).d;

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    expect(columnOf(store, FRIDGE_KEY).d).toBeCloseTo(frozenM, 6);
  });
});

// Resize and split write the extent through a spread, so a rule that rebuilt one field by hand would show here;
// depth and source move together (ADR 0073 decision 8).
describe("a command that moves an extent along the wall", () => {
  it("carries its depth and its source across a resize untouched", () => {
    const store = removeAll(createStore(), DISHWASHER_MEMBERS);
    const frozen = store
      .getState()
      .design.emptyColumns?.find(
        (entry) => entry.alongMm === DISHWASHER_ALONG_MM,
      );
    const opening = store
      .getState()
      .voids.find(
        (record) => record.col === DISHWASHER_KEY && record.y0 < 0.01,
      );
    if (!opening) throw new Error(`no base opening in ${DISHWASHER_KEY}`);

    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert("base-cabinet");
    const inserted = store.getState().design.placements.at(-1)?.id ?? "";
    store.getState().select({ kind: "placement", id: inserted });
    store.getState().setWidth(400);

    expect(store.getState().lastRejection).toBeNull();
    const freed = store.getState().design.emptyColumns ?? [];
    // The freed space is narrower and elsewhere; its depth and source are the cleared column's.
    expect(freed).toHaveLength(1);
    expect(freed[0]?.widthMm).toBeLessThan(frozen?.widthMm ?? 0);
    expect(freed[0]?.depthMm).toBe(frozen?.depthMm);
    expect(freed[0]?.depthFromBuildId).toBe(DISHWASHER_BUILD_ID);
  });
});

describe("an extent this wave cannot re-answer exactly", () => {
  /** The two inputs a document can arrive carrying: no source (written before sources were recorded) and a source the
   *  catalogue no longer holds. */
  const UNANSWERABLE: readonly (readonly [string, string | undefined])[] = [
    ["written before this wave", undefined],
    ["naming a buildId the catalogue does not hold", "retired-cabinet-600"],
  ];

  // `resolveDepthM` floors an inserted wall cabinet at the column's own clearance, so a member-less wall column frozen
  // at 330 caps one 70 mm shallower than the map declares in a 700 mm kitchen; deepening it closes that.
  it.each(UNANSWERABLE)(
    "deepens a member-less wall column to the declared build depth (%s)",
    (_name, source) => {
      const cleared = removeAll(createStore(), WALL_MEMBERS);
      const store = reloadWithSource(cleared, source);
      const frozenM = columnOf(store, WALL_KEY).d;

      store.getState().setCabinetDepth(DEEPER_MM);

      expect(isMemberLess(store, 300)).toBe(true);

      const declaredM = columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: false,
      });
      expect(frozenM).toBeLessThan(declaredM);
      expect(columnOf(store, WALL_KEY).d).toBeCloseTo(declaredM, 6);
    },
  );

  // A stated residual, not fixed by inventing a number: a base column frozen at 620 already exceeds the declared build
  // depth, the fact that would move it was never recorded, and deeper-only keeps ADR 0011 Gap D's freed opening intact.
  it.each(UNANSWERABLE)(
    "leaves a member-less base column where it was frozen (%s)",
    (_name, source) => {
      const cleared = removeAll(createStore(), DISHWASHER_MEMBERS);
      const store = reloadWithSource(cleared, source);
      const frozenM = columnOf(store, DISHWASHER_KEY).d;

      store.getState().setCabinetDepth(DEEPER_MM);

      expect(isMemberLess(store, DISHWASHER_ALONG_MM)).toBe(true);
      expect(frozenM).toBeGreaterThan(
        columnBuildDepthM({
          cabinetDepthMm: DEEPER_MM,
          hasFullHeightUnder: false,
        }),
      );
      expect(columnOf(store, DISHWASHER_KEY).d).toBeCloseTo(frozenM, 6);
    },
  );

  // ADR 0052: a load that refuses is a dead link, so neither shape may be refused at the parse or at the store.
  it.each(UNANSWERABLE)(
    "is loaded rather than refused (%s)",
    (_name, source) => {
      const cleared = removeAll(createStore(), DISHWASHER_MEMBERS);

      const store = reloadWithSource(cleared, source);

      expect(store.getState().lastRejection).toBeNull();
      expect(store.getState().columns.size).toBeGreaterThan(0);
    },
  );
});

/** Every column the store publishes, as `key -> d`, at full precision. */
function publishedDepthsM(store: Store): Record<string, number> {
  return Object.fromEntries(
    [...store.getState().columns].map(([key, column]) => [key, column.d]),
  );
}

/** Every frozen entry the document carries, as `wall|alongMm -> depthMm`. */
function savedDepthsMm(store: Store): Record<string, number> {
  const held = store.getState().design;
  return Object.fromEntries(
    [...(held.emptyColumns ?? []), ...(held.columnExtents ?? [])].map(
      (entry) => [`${entry.wall}|${String(entry.alongMm)}`, entry.depthMm],
    ),
  );
}

describe("a published depth names the body it came from", () => {
  // A state predicate rather than a transition check: a false record beside a correct depth is only cashed commands
  // later.
  it("holds after every command of an ordinary session", () => {
    const store = createStore();
    assertSourcesExplainTheirDepths(store.getState(), "load");

    const script: readonly (readonly [string, () => void])[] = [
      [
        "delete the pinned top over B|1.80",
        () => {
          removeAll(store, ["p23"]);
        },
      ],
      [
        "deepen",
        () => {
          store.getState().setCabinetDepth(DEEPER_MM);
        },
      ],
      [
        "delete the pantry under it",
        () => {
          removeAll(store, ["p6"]);
        },
      ],
      [
        "return to the default",
        () => {
          store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);
        },
      ],
      [
        "clear the dishwasher niche",
        () => {
          removeAll(store, ["p1"]);
        },
      ],
      [
        "deepen again",
        () => {
          store.getState().setCabinetDepth(DEEPER_MM);
        },
      ],
    ];

    for (const [label, run] of script) {
      run();
      expect(store.getState().lastRejection, label).toBeNull();
      assertSourcesExplainTheirDepths(store.getState(), label);
    }
  });

  // The predicate is satisfied by a map with no sources at all, so the number of columns inspected must be on record.
  it("inspects most of the shipped kitchen rather than nothing", () => {
    const store = createStore();

    expect(columnsWithKnownSources(store.getState()).length).toBe(
      store.getState().columns.size,
    );
    expect(store.getState().columns.size).toBeGreaterThan(1);
  });

  // A check that cannot fail is the failure this project has shipped twice: the state below is what the pre-fix code
  // published (ADR 0079 F1 table).
  it("reports the pair the pre-fix code published, so it can fail at all", () => {
    const store = createStore();
    removeAll(store, [PINNED_TOP_WITNESS_PLACEMENT_ID]);
    store.getState().setCabinetDepth(DEEPER_MM);
    // The corrupted column is the same one, but its anchor depends on the setting (ADR 0090 decision 7): naming
    // `B|1.80`
    // at 700 names no column, and a guard that throws before it asserts cannot fail.
    const pantryKey = columnKeyAt(PANTRY_KEY, DEEPER_MM);
    const repaired = columnOf(store, pantryKey);

    // The pre-fix answer: a correct depth beside a source the old code carried across untouched.
    // The corrupting source is `fridge-free-700`: a manufactured 742 at every setting, in the shipped catalogue, which
    // `unexplainedColumns` requires of a source before it inspects one. A deep-top row now follows the setting
    // (ADR 0101) and could not make the predicate fire.
    const asPublishedBeforeTheFix = new Map(store.getState().columns).set(
      pantryKey,
      { ...repaired, depthFromBuildId: FRIDGE_BUILD_ID },
    );

    expect(
      unexplainedColumns({
        design: store.getState().design,
        columns: asPublishedBeforeTheFix,
      }),
    ).toHaveLength(1);
    // And the depth itself was never the defect (ADR 0079 decision 9).
    expect(repaired.d).toBeCloseTo(
      declaredDepthM(repaired.depthFromBuildId ?? "", DEEPER_MM),
      9,
    );
  });

  // The same F1 shape inside the one column the acknowledged exemption covers (ADR 0102 decision 3a): `B|1.90` at 700
  // publishes `columnBuildDepthM`'s lifted arm, so a predicate keyed on the depth would pass every source id there.
  // Keyed on the standing member, a record naming a body no member carries fails.
  it("reports a lifted column whose source no member standing in it carries", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);
    const liftedKey = columnKeyAt(PANTRY_KEY, DEEPER_MM);
    const lifted = columnOf(store, liftedKey);
    // Non-vacuous: this is the lifted column publishing the lifted arm, not an ordinary column beside it.
    expect(lifted.hasFullHeightUnder).toBe(true);
    expect(lifted.d).toBeCloseTo(
      columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: true,
      }),
      9,
    );

    const namingABodyThatIsNotThere = new Map(store.getState().columns).set(
      liftedKey,
      { ...lifted, depthFromBuildId: INTRUDING_WALL_BUILD_ID },
    );

    expect(
      unexplainedColumns({
        design: store.getState().design,
        columns: namingABodyThatIsNotThere,
      }),
    ).toHaveLength(1);
  });
});

describe("the depths this wave promised not to move", () => {
  /** Golden depths at full precision, deliberately not re-asked from the catalogue: this fixture holds the previous
   *  build's output, so "identical" is checkable. Values follow ADR 0135: the X-leg's worktop sits on the run's line
   *  and the base return carries its 50 mm overhang. `B|1.80`'s `0.6000000000000001` is the ULP ADR 0079 decision 5
   *  rounds away in the comparison, not in the value. */
  const BEFORE_THIS_WAVE = {
    "at the default setting": {
      columns: {
        "A|0.30": 0.32999999999999996,
        "A|0.45": 0.62,
        "A|0.75": 0.32999999999999996,
        "A|1.30": 0.62,
        "A|2.00": 0.62,
        "A|2.60": 0.62,
        "A|3.20": 0.62,
        "B|0.61": 0.32999999999999996,
        "B|0.73": 0.62,
        "B|1.20": 0.638,
        "B|1.80": 0.6000000000000001,
        "B|2.45": 0.742,
      },
      saved: {
        "A|300": 330,
        "A|450": 620,
        "A|750": 330,
        "A|1300": 620,
        "A|2000": 620,
        "A|2600": 620,
        "A|3200": 620,
        "B|615": 330,
        "B|735": 620,
        "B|1200": 638,
        "B|1800": 600,
        "B|2450": 742,
      },
    },
    // A wall-A body's depth is measured along wall B, so a deeper corner slides wall B's whole run: the keys here are
    // read
    // at the coordinate the run stands at (ADR 0090 decision 2).
    "at the deeper setting": {
      columns: {
        "A|0.30": 0.39999999999999997,
        "A|0.45": 0.72,
        "A|0.75": 0.39999999999999997,
        "A|1.30": 0.72,
        "A|2.00": 0.72,
        "A|2.60": 0.72,
        "A|3.20": 0.72,
        "B|0.69": 0.39999999999999997,
        "B|0.83": 0.72,
        "B|1.30": 0.738,
        // 0.700 is the top's: the pantry finishes at 699 and the deep top above it at 700, so §3.2's MAX is the top's.
        "B|1.90": 0.7000000000000001,
        "B|2.55": 0.742,
      },
      saved: {
        "A|300": 400,
        "A|450": 720,
        "A|750": 400,
        "A|1300": 720,
        "A|2000": 720,
        "A|2600": 720,
        "A|3200": 720,
        "B|685": 400,
        "B|835": 720,
        "B|1300": 738,
        "B|1900": 700,
        "B|2550": 742,
      },
    },
  } as const;

  it("publishes the deeper kitchen exactly as the build before this wave did", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);

    const expected = BEFORE_THIS_WAVE["at the deeper setting"];
    expect(publishedDepthsM(store)).toStrictEqual(expected.columns);
    expect(savedDepthsMm(store)).toStrictEqual(expected.saved);
  });

  it("brings it back exactly as the build before this wave did", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    const expected = BEFORE_THIS_WAVE["at the default setting"];
    expect(publishedDepthsM(store)).toStrictEqual(expected.columns);
    expect(savedDepthsMm(store)).toStrictEqual(expected.saved);
  });

  it("loads the shipped kitchen exactly as the build before this wave did", () => {
    expect(publishedDepthsM(createStore())).toStrictEqual(
      BEFORE_THIS_WAVE["at the default setting"].columns,
    );
  });
});

describe("a source survives exactly when the depth it explains survives", () => {
  // A member-less wall column frozen at 330 is deepened to 400 by `columnBuildDepthM`, a declared size and no body's
  // declaration, so its id explains nothing and must not travel with the new depth (ADR 0079 decision 2).
  it("drops an id the fallback's declared size overtook", () => {
    const cleared = removeAll(createStore(), WALL_MEMBERS);
    const store = reloadWithSource(cleared, "retired-cabinet-600");
    const frozenM = columnOf(store, WALL_KEY).d;
    const declaredM = columnBuildDepthM({
      cabinetDepthMm: DEEPER_MM,
      hasFullHeightUnder: columnOf(store, WALL_KEY).hasFullHeightUnder,
    });

    store.getState().setCabinetDepth(DEEPER_MM);

    // Non-vacuous: the declared size really does overtake the frozen depth here.
    expect(frozenM).toBeLessThan(declaredM);
    expect(columnOf(store, WALL_KEY).d).toBeCloseTo(declaredM, 9);
    expect(columnOf(store, WALL_KEY).depthFromBuildId).toBeUndefined();
    const stored = store
      .getState()
      .design.emptyColumns?.find((entry) => entry.alongMm === 300);
    expect(stored?.depthMm).toBe(400);
    expect(stored && "depthFromBuildId" in stored).toBe(false);
  });

  // Where the frozen depth wins the fallback's MAX it is still the depth the id was recorded against, so the id travels
  // with it, even one the catalogue no longer holds.
  it("keeps an unknown id on the depth that id was recorded against", () => {
    const cleared = removeAll(createStore(), DISHWASHER_MEMBERS);
    const store = reloadWithSource(cleared, "retired-cabinet-600");
    const frozenM = columnOf(store, DISHWASHER_KEY).d;

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(frozenM).toBeGreaterThan(
      columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: columnOf(store, DISHWASHER_KEY).hasFullHeightUnder,
      }),
    );
    expect(columnOf(store, DISHWASHER_KEY).d).toBeCloseTo(frozenM, 9);
    expect(columnOf(store, DISHWASHER_KEY).depthFromBuildId).toBe(
      "retired-cabinet-600",
    );
  });
});
