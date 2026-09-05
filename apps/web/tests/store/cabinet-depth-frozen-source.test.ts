// Wave 6K-c at the store seam: the residue wave 6K-a named and could not close.
//
// 6K-a re-answered a frozen extent from the members standing in it. The half **no member explains** —
// a cleared slot under a wall run, and a column with no member at all — kept the depth the session
// opened at, and `projectFrozenMap` saved it. ADR 0073 records the `buildId` whose clearance supplied
// that depth, and this file measures what a depth change then does with it.
//
// **Nothing below is compared against a hand-written millimetre where the catalogue can be asked.**
// Every expected depth is `occupiedDepthOfEntryM` over the map built at the depth under test, so a
// test that passed while `baseFinishedDepthMm` moved underneath it is unwritable here — which is the
// same falsifiability the wave's own criterion asks for, stated as an assertion instead of a claim.
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
import { columnKeyAt } from "../support/wall-b-column-keys";
import {
  assertSourcesExplainTheirDepths,
  columnsWithKnownSources,
  unexplainedColumns,
} from "../support/frozen-source-invariant";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `A|2.00`: a dishwasher niche under an open shelf and a top box. Clearing the base member leaves an
 *  occupied column whose 620 mm reach no surviving member explains — ADR 0073's own worked example. */
const DISHWASHER_KEY = "A|2.00";
const DISHWASHER_ALONG_MM = 2000;
const DISHWASHER_BUILD_ID = "base-dishwasher-600";

/** `B|2.45`: the freestanding fridge, whose 742 mm is a real machine's and which no setting moves. */
const FRIDGE_KEY = "B|2.45";
const FRIDGE_BUILD_ID = "fridge-free-700";

/** `B|1.80`: a pantry under one of ADR 0058's two deliberately deep tops. The **top** wins §3.2's MAX
 *  here (600 against the pantry's 599), so this column's recorded source is a pinned row. */
const PANTRY_KEY = "B|1.80";
const PANTRY_MEMBERS = ["p6", "p23"];
const PINNED_TOP_BUILD_ID = "wall-2door-600-deep-top";

/** `A|0.30`: a wall run with nothing under it but the corner base, so clearing it leaves a member-less
 *  **wall** column — the one shape in ADR 0073's residue that reaches a body somebody builds. */
const WALL_KEY = "A|0.30";
const WALL_MEMBERS = ["p8", "p15"];

const DISHWASHER_MEMBERS = ["p1", "p12", "p18"];

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** What this entry declares it fills, at this cabinet depth — the one answer ADR 0073 decision 2
 *  re-asks, read the same way the store reads it. */
function declaredDepthM(buildId: string, cabinetDepthMm: number): number {
  const definition = buildKitchenLBodyCatalog(cabinetDepthMm).get(buildId);
  if (!definition) throw new Error(`${buildId} is not in the catalogue`);
  return occupiedDepthOfEntryM({ buildId, definition });
}

/** That the column really has no member left, so a test about the member-less arm cannot pass by
 *  accident on the arm that measures one: the two arrays are partitioned by exactly this predicate
 *  (`projectFrozenMap`), so an entry in `emptyColumns` is a column with nothing standing in it. */
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

/** The design as a save and a reload deliver it, with every recorded source rewritten — `undefined`
 *  produces exactly the document a session before this wave would have written. */
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
  // The measured residue, in ADR 0073's own numbers: 0.6200 -> 0.6200 before this wave.
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
    // Not a value compared with itself: the declaration really does move between the two settings.
    expect(declaredDepthM(DISHWASHER_BUILD_ID, DEEPER_MM)).not.toBeCloseTo(
      declaredDepthM(DISHWASHER_BUILD_ID, DEFAULT_CABINET_DEPTH_MM),
      6,
    );
  });

  // The durable half: `projectFrozenMap` writes this map into the document the coalescer saves, so a
  // stale extent does not merely mis-answer the session — it reloads stale for good.
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
  // ADR 0073 decision 2: this falls out of the entry's own `finishesAtMm` declaration, which is not a
  // function of the cabinet depth. Nothing in the store names these ids or their bands.
  it.each([
    ["a freestanding appliance", FRIDGE_KEY, ["p7"], FRIDGE_BUILD_ID],
    [
      "one of the two pinned deep tops",
      PANTRY_KEY,
      PANTRY_MEMBERS,
      PINNED_TOP_BUILD_ID,
    ],
  ])("does not move either: %s", (_name, key, members, buildId) => {
    const store = removeAll(createStore(), members);
    const frozenM = columnOf(store, key).d;

    store.getState().setCabinetDepth(DEEPER_MM);

    assertSourcesExplainTheirDepths(store.getState(), "after setCabinetDepth");
    expect(frozenM).toBeCloseTo(
      declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM),
      6,
    );
    // ADR 0090 decision 2: the **depth** does not move, which is what this test is about, and the
    // wall-B coordinate it is read at does — a deeper corner on wall A takes more of wall B. Only
    // the anchor is setting-dependent; the three assertions are the ones this test always made.
    expect(columnOf(store, columnKeyAt(key, DEEPER_MM)).d).toBeCloseTo(
      frozenM,
      6,
    );
    expect(declaredDepthM(buildId, DEEPER_MM)).toBeCloseTo(frozenM, 6);
  });

  // And back again, because a depth change is a control the customer can tap twice.
  it("holds the appliance's own depth on the way back down as well", () => {
    const store = removeAll(createStore(), ["p7"]);
    const frozenM = columnOf(store, FRIDGE_KEY).d;

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    expect(columnOf(store, FRIDGE_KEY).d).toBeCloseTo(frozenM, 6);
  });
});

// ADR 0073 decision 8's other half: the commands that move an extent along the wall move its depth
// and its source together, because they are the same fact about the same space. Asserted at the
// store, where the move actually publishes a map — `moveFrozenColumns` and the split write the
// extent through a spread, so a rule that reconstructed one field by hand would show up here.
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
    // The space the resize freed is narrower and stands somewhere else; its depth and the body that
    // supplied it are the ones the cleared column was frozen with.
    expect(freed).toHaveLength(1);
    expect(freed[0]?.widthMm).toBeLessThan(frozen?.widthMm ?? 0);
    expect(freed[0]?.depthMm).toBe(frozen?.depthMm);
    expect(freed[0]?.depthFromBuildId).toBe(DISHWASHER_BUILD_ID);
  });
});

describe("an extent this wave cannot re-answer exactly", () => {
  /** The two inputs decision 3 names that a document can actually arrive carrying: no source at all —
   *  every document written before this wave — and a source the catalogue no longer holds. */
  const UNANSWERABLE: readonly (readonly [string, string | undefined])[] = [
    ["written before this wave", undefined],
    ["naming a buildId the catalogue does not hold", "retired-cabinet-600"],
  ];

  // The case that reaches a body somebody builds: `resolveDepthM` floors an inserted wall cabinet at
  // the column's own clearance, so a member-less wall column frozen at 330 caps one 70 mm shallower
  // than the map declares in a 700 mm kitchen. Deepening it to the declared build depth closes that.
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

  // **The stated residual, asserted as a residual rather than fixed by inventing a number.** A base
  // column frozen at 620 is already deeper than the declared build depth, the fact that would move it
  // was never recorded, and deeper-only is what keeps ADR 0011 Gap D's freed opening intact.
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

  // ADR 0052: a load that refuses is a dead link. Neither shape is a refusal at either seam — the
  // reload above already proves the parse, and this proves the store went on to publish a map.
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

// =================================================================================================
// ADR 0079 — the pairing invariant, its non-vacuity, and the depths this wave promised not to move.
// =================================================================================================

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
  // Decision 10 part 2. A state predicate rather than a transition assertion, because that is the one
  // shape both 6K-c defects hid from: each published a **correct** depth beside a false record, and
  // the record is only cashed a command or two later. Checked after every step of an ordinary script,
  // not only at its end.
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

  // Decision 10 part 3, second claim. The predicate is satisfied by a map with no sources at all and
  // by one whose every source has left the catalogue, and both are reachable — so a green run means
  // nothing until the number of columns it actually inspected is on the record.
  it("inspects most of the shipped kitchen rather than nothing", () => {
    const store = createStore();

    expect(columnsWithKnownSources(store.getState()).length).toBe(
      store.getState().columns.size,
    );
    expect(store.getState().columns.size).toBeGreaterThan(1);
  });

  // Decision 10 part 3, third claim: **a check that cannot fail is the failure this project has
  // shipped twice.** The state below is what the pre-fix code published — measured, and ADR 0079's
  // F1 table records the same trail — so this asserts the predicate catches the defect it exists for
  // rather than merely being green beside the fix.
  it("reports the pair the pre-fix code published, so it can fail at all", () => {
    const store = createStore();
    removeAll(store, ["p23"]);
    store.getState().setCabinetDepth(DEEPER_MM);
    // **The guard's assertion is unchanged and its anchor is now setting-dependent** (ADR 0090
    // decision 7). The column this test corrupts is the same column; wave 6J-d slid it 100 mm along
    // wall B, so naming `B|1.80` at 700 names no column at all — and a guard that throws before it
    // asserts is the check-that-cannot-fail this test exists to prevent.
    const pantryKey = columnKeyAt(PANTRY_KEY, DEEPER_MM);
    const repaired = columnOf(store, pantryKey);

    // The pre-fix answer: the same depth — 699 is correct, the pantry is standing in it — beside the
    // source the old code carried across untouched, which declares 600 at every setting.
    const asPublishedBeforeTheFix = new Map(store.getState().columns).set(
      pantryKey,
      { ...repaired, depthFromBuildId: PINNED_TOP_BUILD_ID },
    );

    expect(
      unexplainedColumns({
        design: store.getState().design,
        columns: asPublishedBeforeTheFix,
      }),
    ).toHaveLength(1);
    // And the depth itself was never the defect, which is decision 9's whole point.
    expect(repaired.d).toBeCloseTo(
      declaredDepthM(repaired.depthFromBuildId ?? "", DEEPER_MM),
      9,
    );
  });
});

describe("the depths this wave promised not to move", () => {
  /** **Golden, measured at `52e3c70` — the commit before this wave — by driving the same script
   *  against the pre-wave code.** ADR 0079 decision 9: no rule in this wave changes a published depth,
   *  only the record beside it. Written out at full precision on purpose: these are not catalogue
   *  facts to be re-asked but the *previous build's output*, and the only way to say "identical" is to
   *  hold the old numbers. `B|1.80`'s `0.6000000000000001` is the ULP decision 5 rounds away in the
   *  **comparison** while leaving the value alone — if decision 5 had been fixed in
   *  `occupiedDepthFromSeat` instead, this line is what would have caught it.
   *
   *  The `A|2.00` residue this wave *does* close is deliberately not here: it needs a delete first, so
   *  it is not the untouched fixture, and it is asserted at the top of this file. */
  const BEFORE_THIS_WAVE = {
    "at the default setting": {
      columns: {
        "A|0.30": 0.32999999999999996,
        "A|0.45": 0.63,
        "A|0.75": 0.32999999999999996,
        "A|1.30": 0.62,
        "A|2.00": 0.62,
        "A|2.60": 0.62,
        "A|3.20": 0.62,
        "B|0.61": 0.32999999999999996,
        "B|0.74": 0.6,
        "B|1.20": 0.638,
        "B|1.80": 0.6000000000000001,
        "B|2.45": 0.742,
      },
      saved: {
        "A|300": 330,
        "A|450": 630,
        "A|750": 330,
        "A|1300": 620,
        "A|2000": 620,
        "A|2600": 620,
        "A|3200": 620,
        "B|615": 330,
        "B|740": 600,
        "B|1200": 638,
        "B|1800": 600,
        "B|2450": 742,
      },
    },
    // **Wave 6J-d moved the wall-B keys of this half, and no depth in it** (ADR 0090 decisions 2 and
    // 8). A wall-A body's depth is measured along wall B, so a deeper corner slides wall B's whole
    // run: `wall-map` by 70 mm and `base-formula` by 100. Every number below is the number this
    // fixture carried before that wave — 400, 700, 738, 699, 742 — read at the coordinate the run
    // now stands at. The `at the default setting` half above is untouched, which is the wave's own
    // "value-preserving at 600" criterion stated as a fixture.
    "at the deeper setting": {
      columns: {
        "A|0.30": 0.39999999999999997,
        "A|0.45": 0.73,
        "A|0.75": 0.39999999999999997,
        "A|1.30": 0.72,
        "A|2.00": 0.72,
        "A|2.60": 0.72,
        "A|3.20": 0.72,
        "B|0.69": 0.39999999999999997,
        "B|0.84": 0.7,
        "B|1.30": 0.738,
        "B|1.90": 0.699,
        "B|2.55": 0.742,
      },
      saved: {
        "A|300": 400,
        "A|450": 730,
        "A|750": 400,
        "A|1300": 720,
        "A|2000": 720,
        "A|2600": 720,
        "A|3200": 720,
        "B|685": 400,
        "B|840": 700,
        "B|1300": 738,
        "B|1900": 699,
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

  // The load itself, which writes no document — so only the published half exists to compare.
  it("loads the shipped kitchen exactly as the build before this wave did", () => {
    expect(publishedDepthsM(createStore())).toStrictEqual(
      BEFORE_THIS_WAVE["at the default setting"].columns,
    );
  });
});

describe("a source survives exactly when the depth it explains survives", () => {
  // ADR 0079 decision 2's amended rule, on the arm that needed it named. A member-less **wall** column
  // frozen at 330 is deepened to the map's 400 by `columnBuildDepthM` — a declared size, and no body's
  // declaration — so whatever id it was carrying no longer explains anything and must not travel with
  // the new depth. Keeping it would write a fresh F1-shaped lie against the day that id comes back to
  // the catalogue.
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

  // The mirror, and the reason the rule is "survives" rather than "is dropped": where the **frozen**
  // depth wins the fallback's own MAX it is still the depth that id was recorded against, so the id
  // travels with it — even one the catalogue no longer holds, which is the id a later catalogue would
  // restore meaning to.
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
