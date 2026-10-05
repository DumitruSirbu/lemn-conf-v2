import {
  buildKitchenLBodyCatalog,
  columnBuildDepthM,
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
  deriveColumns,
  DesignSchema,
  KITCHEN_L_DESIGN,
  occupiedDepthOfEntryM,
  type Column,
  type Design,
  type EmptyColumn,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  assertSourcesExplainTheirDepths,
  assertStoredSourcesExplainTheirDepths,
  DECLARED_DEPTH_EPSILON_M,
  isExplainedOrIsTheKnownLiftedColumnDefect,
} from "../support/frozen-source-invariant";
import {
  catalogWithAPinnedTop,
  designWithAPinnedTop,
  PINNED_TOP_WITNESS_BUILD_ID,
  PINNED_TOP_WITNESS_PLACEMENT_ID,
} from "../support/pinned-top-witness";
import { columnKeyAt } from "../support/wall-b-column-keys";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `A|2.00`: a dishwasher niche under an open shelf and a top box; deleting the niche leaves a column
 *  whose reach no surviving member explains (ADR 0011 Gap D). */
const SURPLUS_KEY = "A|2.00";
const SURPLUS_ALONG_MM = 2000;
const SURPLUS_BASE_ID = "base-dishwasher-600";
const SURPLUS_BASE_PLACEMENT = "p1";
const SURPLUS_MEMBERS = ["p1", "p12", "p18"];

/** `B|1.80`: a tall pantry under a **pinned** top, so the recorded source is a body no setting moves.
 *  The top is declared in `tests/support/pinned-top-witness.ts`; do not move the shipped fixture (ADR 0093). */
const PINNED_SOURCE_KEY = "B|1.80";
const PINNED_SOURCE_ALONG_MM = 1800;
const PINNED_TOP_PLACEMENT = PINNED_TOP_WITNESS_PLACEMENT_ID;

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

/** The shipped kitchen with this suite's pinned top at `B|1.80`; only for tests about a source no setting moves. */
function createStoreWithAPinnedTop() {
  return createConfiguratorStore({
    design: designWithAPinnedTop(),
    catalogAt: catalogWithAPinnedTop,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** What one catalogue row declares at one setting. Asks the catalogue including this suite's witness,
 *  so a `depthFromBuildId` resolves whichever store produced it. */
function declaredDepthM(buildId: string, cabinetDepthMm: number): number {
  const definition = catalogWithAPinnedTop(cabinetDepthMm).get(buildId);
  if (!definition) throw new Error(`${buildId} is not in the catalogue`);
  return occupiedDepthOfEntryM({ buildId, definition });
}

function columnOf(store: Store, key: string): Column {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

function depthMOf(store: Store, key: string): number {
  return columnOf(store, key).d;
}

/** The member-less column whose depth this body's declaration supplied, wherever it now stands; asserted
 *  member-less because an occupied column carrying the same source would be a different claim. */
function spaceLeftBy(store: Store, buildId: string): string {
  const { columns, records } = store.getState();
  const found = [...columns].find(
    ([key, column]) =>
      column.depthFromBuildId === buildId &&
      !records.some((record) => record.col === key),
  );
  if (!found) throw new Error(`no member-less column records ${buildId}`);
  return found[0];
}

/** Along-wall coordinate of a published column in whole mm, read off the map: on wall B it depends on
 *  the setting (ADR 0090 decision 2). */
function alongMmOf(store: Store, key: string): number {
  const column = columnOf(store, key);
  return Math.round((column.wall === "A" ? column.x : column.z) * 1000);
}

function remove(store: Store, id: string): void {
  store.getState().select({ kind: "placement", id });
  store.getState().remove();
  expect(store.getState().lastRejection, `remove ${id}`).toBeNull();
}

function setDepth(store: Store, cabinetDepthMm: number): void {
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `setCabinetDepth ${String(cabinetDepthMm)}`,
  ).toBeNull();
}

/** The design as the wire returns it, every recorded source rewritten; `undefined` yields a document
 *  that predates recorded sources. */
function reloadWithSource(store: Store, source: string | undefined): Store {
  const rewrite = (entry: EmptyColumn): EmptyColumn => {
    const rewritten = { ...entry };
    delete rewritten.depthFromBuildId;
    return source === undefined
      ? rewritten
      : { ...rewritten, depthFromBuildId: source };
  };
  const held = store.getState().design;
  return createStore(
    throughTheWire({
      ...held,
      emptyColumns: (held.emptyColumns ?? []).map(rewrite),
      columnExtents: (held.columnExtents ?? []).map(rewrite),
    }),
  );
}

function throughTheWire(design: Design): Design {
  return DesignSchema.parse(JSON.parse(JSON.stringify(design)));
}

function reload(store: Store): Store {
  return createStore(throughTheWire(store.getState().design));
}

/** A document that predates recorded sources: every `depthFromBuildId` stripped and reloaded through the wire,
 *  the population that reaches the fallback arm (ADR 0080 decision 5). */
function openLegacyStore(): Store {
  const cleared = createStore();
  for (const member of cleared
    .getState()
    .records.filter((record) => record.col === "A|0.30")) {
    remove(cleared, member.id);
  }
  return reloadWithSource(cleared, undefined);
}

function storedEntries(store: Store): ReadonlyMap<string, EmptyColumn> {
  const held = store.getState().design;
  return new Map(
    [...(held.emptyColumns ?? []), ...(held.columnExtents ?? [])].map(
      (entry) => [`${entry.wall}|${String(entry.alongMm)}`, entry],
    ),
  );
}

describe("a delete-freed surplus, through a depth change", () => {
  /** A column whose base member was deleted: the wall bodies above stand and the extent keeps a depth
   *  nothing standing explains (ADR 0011 Gap D). */
  function withFreedSurplus(): Store {
    const store = createStore();
    remove(store, SURPLUS_BASE_PLACEMENT);
    return store;
  }

  it("really is a surplus and not a measurement", () => {
    const store = withFreedSurplus();

    expect(
      store.getState().records.filter((record) => record.col === SURPLUS_KEY),
    ).not.toHaveLength(0);
    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(
      declaredDepthM(SURPLUS_BASE_ID, DEFAULT_CABINET_DEPTH_MM),
      9,
    );
  });

  it("becomes the deleted body's declaration at the new setting", () => {
    const store = withFreedSurplus();

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(
      declaredDepthM(SURPLUS_BASE_ID, DEEPER_MM),
      9,
    );
  });

  // A pre-source document has no recorded body, so `column.d` must survive as the floor (ADR 0080 decision 4).
  it("keeps the freed depth on a document written before this wave", () => {
    const store = reloadWithSource(withFreedSurplus(), undefined);
    const frozenM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeGreaterThanOrEqual(frozenM);
    // Non-vacuous: the declared build depth alone cannot supply it, so the floor does the work.
    expect(
      columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: columnOf(store, SURPLUS_KEY).hasFullHeightUnder,
      }),
    ).toBeLessThan(frozenM);
  });

  it("keeps the freed depth when the recorded source has left the catalogue", () => {
    const store = reloadWithSource(withFreedSurplus(), "retired-cabinet-600");
    const frozenM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeGreaterThanOrEqual(frozenM);
  });

  // A decrease shrinks a genuine surplus: the extent is the same body's declaration at the shallower
  // setting (ADR 0073 decision 2), so the two directions are deliberately asymmetric.
  it("returns to the deleted body's shallower declaration on a decrease", () => {
    const store = withFreedSurplus();
    setDepth(store, DEEPER_MM);
    const deepM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(deepM).toBeCloseTo(declaredDepthM(SURPLUS_BASE_ID, DEEPER_MM), 9);
    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(
      declaredDepthM(SURPLUS_BASE_ID, DEFAULT_CABINET_DEPTH_MM),
      9,
    );
    expect(depthMOf(store, SURPLUS_KEY)).toBeLessThan(deepM);
  });

  // A member-less wall column with no source deepens to the declared build depth, or `resolveDepthM` floors an
  // inserted wall cabinet shallower than the map declares (ADR 0080 decision 4).
  it.each([
    ["written before this wave", undefined],
    ["naming a buildId the catalogue does not hold", "retired-cabinet-600"],
  ] as const)(
    "deepens a member-less wall column to the declared build depth (%s)",
    (_name, source) => {
      const cleared = createStore();
      for (const member of cleared
        .getState()
        .records.filter((record) => record.col === "A|0.30")) {
        remove(cleared, member.id);
      }
      const store = reloadWithSource(cleared, source);
      const frozenM = depthMOf(store, "A|0.30");
      const declaredM = columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: columnOf(store, "A|0.30").hasFullHeightUnder,
      });

      setDepth(store, DEEPER_MM);

      // Non-vacuous: the frozen depth is shallower than the declared build depth, so the fallback has work to do.
      expect(frozenM).toBeLessThan(declaredM);
      expect(depthMOf(store, "A|0.30")).toBeCloseTo(declaredM, 9);
    },
  );

  it.each([
    ["written before this wave", undefined],
    ["naming a buildId the catalogue does not hold", "retired-cabinet-600"],
  ] as const)("is loaded rather than refused (%s)", (_name, source) => {
    const cleared = createStore();
    for (const member of SURPLUS_MEMBERS) remove(cleared, member);

    const store = reloadWithSource(cleared, source);

    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().columns.size).toBeGreaterThan(0);
    setDepth(store, DEEPER_MM);
    expect(store.getState().columns.size).toBeGreaterThan(0);
  });

  it("returns a recorded surplus to where it started across a round trip", () => {
    const store = withFreedSurplus();
    const startedM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(startedM, 9);
  });
});

describe("a frozen extent never becomes shallower than the body standing in it left it", () => {
  // Allowed shrinks are `isAllowedShrink`'s: one recorded body's declaration at two settings (ADR 0073 decision 2).
  // Sabotage: red if `atDepthM` publishes a new depth but carries the previous `depthFromBuildId` across
  // (ADR 0079 decision 1).

  /** `isAllowedShrink`'s `reAnswersOneBody` arm for member-less columns: was the shrink one recorded body's
   *  declaration read at two settings? Takes a store, unlike the sweep's `Reading`-based arm of the same name. */
  function reAnswersItsShallowerDeclaration(
    store: Store,
    key: string,
    wasM: number,
  ): boolean {
    const cabinetDepthMm =
      store.getState().design.settings?.cabinetDepthMm ??
      DEFAULT_CABINET_DEPTH_MM;
    const source = columnOf(store, key).depthFromBuildId;
    if (source === undefined) return false;
    const wasDeclaredAt = declaredCabinetDepthsMm().some(
      (depthMm) =>
        Math.abs(declaredDepthM(source, depthMm) - wasM) <
        DECLARED_DEPTH_EPSILON_M,
    );
    return (
      wasDeclaredAt &&
      Math.abs(declaredDepthM(source, cabinetDepthMm) - depthMOf(store, key)) <
        DECLARED_DEPTH_EPSILON_M
    );
  }

  it("keeps the depth a delete freed when the recorded source is shallower than it", () => {
    const store = createStoreWithAPinnedTop();
    // 1. Delete the pinned deep top; the column keeps its extent and records the top as its source.
    remove(store, PINNED_TOP_PLACEMENT);
    // 2. Deepen: the pantry and the extent follow to 699 while the source still names the pinned top (600 at every
    //    setting). The column also moves 100 mm along wall B, so its key is setting-dependent (ADR 0090 decision 2).
    setDepth(store, DEEPER_MM);
    const deepKey = columnKeyAt(PINNED_SOURCE_KEY, DEEPER_MM);
    const deepAlongMm = alongMmOf(store, deepKey);
    expect(depthMOf(store, deepKey)).toBeGreaterThan(
      declaredDepthM(PINNED_TOP_WITNESS_BUILD_ID, DEEPER_MM),
    );
    // 3. Delete the pantry: nothing stands here and the freed space is 699 mm deep.
    const survivor = store
      .getState()
      .design.placements.find(
        (placement) =>
          placement.wall === "B" && placement.alongMm === deepAlongMm,
      );
    if (!survivor) throw new Error("no member left to delete");
    remove(store, survivor.id);
    const freedM = depthMOf(store, deepKey);

    // 4. Any depth change: the whole answer comes from the recorded source.
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    // No shrink, or one body's declaration at two settings: a source declaring 600 everywhere cannot explain 699.
    expect(
      depthMOf(store, PINNED_SOURCE_KEY) >= freedM ||
        reAnswersItsShallowerDeclaration(store, PINNED_SOURCE_KEY, freedM),
    ).toBe(true);
  });

  it("does not save an opening shallower than the one the delete froze", () => {
    const store = createStoreWithAPinnedTop();
    remove(store, PINNED_TOP_PLACEMENT);
    setDepth(store, DEEPER_MM);
    // Same anchor as above: at 700 this column stands 100 mm further along wall B (ADR 0090 decision 2).
    const deepAlongMm = alongMmOf(
      store,
      columnKeyAt(PINNED_SOURCE_KEY, DEEPER_MM),
    );
    const survivor = store
      .getState()
      .design.placements.find(
        (placement) =>
          placement.wall === "B" && placement.alongMm === deepAlongMm,
      );
    if (!survivor) throw new Error("no member left to delete");
    remove(store, survivor.id);
    const frozenMm = storedEntries(store).get(
      `B|${String(deepAlongMm)}`,
    )?.depthMm;
    const frozenM = (frozenMm ?? 0) / 1000;

    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    const savedMm =
      storedEntries(store).get(`B|${String(PINNED_SOURCE_ALONG_MM)}`)
        ?.depthMm ?? 0;
    expect(
      savedMm >= (frozenMm ?? 0) ||
        reAnswersItsShallowerDeclaration(store, PINNED_SOURCE_KEY, frozenM),
    ).toBe(true);
    // The saved entry agrees with the published column, so this is not passing on a stale map.
    expect(savedMm).toBe(Math.round(depthMOf(store, PINNED_SOURCE_KEY) * 1000));
  });
});

describe("the recorded source explains the recorded depth", () => {
  // The predicate is the shared `tests/support/frozen-source-invariant.ts`, not a local copy (ADR 0079 decision 10).

  // Non-vacuous: the shipped kitchen as loaded satisfies the invariant, so a failure below is something a command did.
  it("holds on the shipped kitchen as it loads", () => {
    assertSourcesExplainTheirDepths(createStore().getState(), "load");
  });

  // One depth change on the untouched fixture suffices: the record, not the depth, must stay right, because it
  // answers once the pantry is deleted.
  it("still holds after a single depth change", () => {
    const store = createStore();

    setDepth(store, DEEPER_MM);

    assertSourcesExplainTheirDepths(store.getState(), "after setCabinetDepth");
  });

  // Witness that keeps the two tests above able to fail: the shipped top follows the setting, so only this
  // suite's pinned body (600 at every setting) can part from the re-answered 699 (ADR 0093 decision 1).
  it("still holds on a kitchen whose source declares one depth at every setting", () => {
    const store = createStoreWithAPinnedTop();

    setDepth(store, DEEPER_MM);

    assertSourcesExplainTheirDepths(
      { ...store.getState(), catalogAt: catalogWithAPinnedTop },
      "after setCabinetDepth, on the declared pinned top",
    );
  });

  it("still holds in the document a depth change hands on to be saved", () => {
    const store = createStore();

    setDepth(store, DEEPER_MM);

    // Its own function in the shared module: a stored entry carries the whole millimetre, so the comparison
    // is an integer one with no float band.
    assertStoredSourcesExplainTheirDepths(
      store.getState().design,
      "the document a depth change hands on",
    );
  });
});

describe("over sequences of commands rather than single transitions", () => {
  /** One step of a sequence, named so a failure says which one it was. */
  type Step = readonly [name: string, run: (store: Store) => void];

  const DEPTHS = declaredCabinetDepthsMm();
  const SWEPT_KEYS = [SURPLUS_KEY, PINNED_SOURCE_KEY, "A|0.30"] as const;

  function depthSteps(): readonly Step[] {
    // Lenient: a refusal is collected rather than thrown, so one refusal does not hide later shrinks.
    return DEPTHS.map(
      (depthMm): Step => [
        `depth ${String(depthMm)}`,
        (store) => {
          store.getState().setCabinetDepth(depthMm);
        },
      ],
    );
  }

  /** Deleting the member the extent records: leaves a frozen depth with no standing body to explain it
   *  (ADR 0011 Gap D). */
  function deleteTheRecordedSourceOf(key: string): Step {
    return [
      `delete the recorded source of ${key}`,
      (store) => {
        const column = store.getState().columns.get(key);
        const member = store
          .getState()
          .records.find(
            (record) =>
              record.col === key && record.buildId === column?.depthFromBuildId,
          );
        if (!member) return;
        store.getState().select({ kind: "placement", id: member.id });
        store.getState().remove();
      },
    ];
  }

  /** Deleting a member that is not recorded: the depth stays explained and must keep following the setting. */
  function deleteAnotherMemberOf(key: string): Step {
    return [
      `delete a non-source member of ${key}`,
      (store) => {
        const column = store.getState().columns.get(key);
        const member = store
          .getState()
          .records.find(
            (record) =>
              record.col === key && record.buildId !== column?.depthFromBuildId,
          );
        if (!member) return;
        store.getState().select({ kind: "placement", id: member.id });
        store.getState().remove();
      },
    ];
  }

  const STEPS: readonly Step[] = [
    ...depthSteps(),
    ...SWEPT_KEYS.flatMap((key) => [
      deleteTheRecordedSourceOf(key),
      deleteAnotherMemberOf(key),
    ]),
  ];

  /** Every sequence of `length` steps, with repeats: `600 → 600 → 700` must be contained. */
  function* sequences(length: number): Generator<readonly Step[]> {
    if (length === 0) {
      yield [];
      return;
    }
    for (const head of STEPS) {
      for (const tail of sequences(length - 1)) yield [head, ...tail];
    }
  }

  /** One column as the invariant reads it: depth, recorded source, and what its members measure now. */
  interface Reading {
    readonly depthM: number;
    readonly source: string | undefined;
    /** The §7 row `resolveRebuildBody` swaps this source for (ADR 0022), or the source itself where already
     *  parameterised; read from `catalogEquivalentId`, never guessed from the ids' shapes. */
    readonly sourceEquivalentId: string | undefined;
    readonly isItsSourcesDeclaration: boolean;
    readonly measuredM: number | undefined;
    /** Read off the column so `followsTheFallbackDown` asks the store's own question (ADR 0080 decision 4). */
    readonly hasFullHeightUnder: boolean;
  }

  const TOLERANCE_M = 1e-9;

  function readingsOf(store: Store): ReadonlyMap<string, Reading> {
    const held = store.getState().design;
    const cabinetDepthMm =
      held.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM;
    // No stored half: only what the members imply.
    const measured = deriveColumns(store.getState().records, {}, held.room);
    // Gathered once: the lifted-column exemption in `isExplainedOrIsTheKnownLiftedColumnDefect` is keyed on a
    // standing member and is asked 4 096 times.
    const membersOf = new Map<string, PlacementRecord[]>();
    for (const record of store.getState().records) {
      const standing = membersOf.get(record.col);
      if (standing) standing.push(record);
      else membersOf.set(record.col, [record]);
    }
    return new Map(
      [...store.getState().columns].map(([key, column]) => {
        const source = column.depthFromBuildId;
        const definition =
          source === undefined
            ? undefined
            : catalogWithAPinnedTop(cabinetDepthMm).get(source);
        return [
          key,
          {
            depthM: column.d,
            source,
            // The shared predicate (ADR 0102 decision 3), keyed on the standing members, so a record naming a
            // body not standing in this column fails.
            isItsSourcesDeclaration:
              source !== undefined &&
              definition !== undefined &&
              isExplainedOrIsTheKnownLiftedColumnDefect({
                depthM: column.d,
                hasFullHeightUnder: column.hasFullHeightUnder,
                source: { buildId: source, definition },
                members: membersOf.get(key) ?? [],
                cabinetDepthMm,
              }),
            sourceEquivalentId: definition?.catalogEquivalentId ?? source,
            measuredM: measured.get(key)?.d,
            hasFullHeightUnder: column.hasFullHeightUnder,
          },
        ];
      }),
    );
  }

  /** A frozen extent never becomes shallower unless the members measure exactly the new depth, or both depths
   *  are the same recorded body's declaration (ADR 0073 decision 2; same body spans ADR 0022's permanent
   *  swap), or `followsTheFallbackDown`. Anything else is depth a delete freed and something later took. */
  function isAllowedShrink(was: Reading, now: Reading): boolean {
    const membersExplainIt =
      now.measuredM !== undefined &&
      Math.abs(now.measuredM - now.depthM) < TOLERANCE_M;
    const reAnswersOneBody =
      was.isItsSourcesDeclaration &&
      now.isItsSourcesDeclaration &&
      (was.source === now.source || was.sourceEquivalentId === now.source);
    return membersExplainIt || reAnswersOneBody || followsTheFallbackDown(was);
  }

  /** Third allowed shrink: a sourceless extent whose depth is the fallback's own answer (`columnBuildDepthM`) at
   *  the setting being left. Narrow on purpose: a legacy 620 base slot exceeds that ceiling at either setting,
   *  so a surplus stays a surplus (ADR 0080 decision 4). */
  function followsTheFallbackDown(was: Reading): boolean {
    if (was.source !== undefined) return false;
    return declaredCabinetDepthsMm().some(
      (cabinetDepthMm) =>
        Math.abs(
          columnBuildDepthM({
            cabinetDepthMm,
            hasFullHeightUnder: was.hasFullHeightUnder,
          }) - was.depthM,
        ) < TOLERANCE_M,
    );
  }

  interface SweepResult {
    readonly violations: readonly string[];
    readonly refusals: readonly string[];
  }

  function sweep(
    sequence: readonly Step[],
    openStore: () => Store = createStore,
  ): SweepResult {
    const store = openStore();
    const deepest = new Map<string, Reading>();
    const violations: string[] = [];
    const refusals: string[] = [];
    const trail: string[] = [];
    const check = (label: string) => {
      for (const [key, now] of readingsOf(store)) {
        const was = deepest.get(key);
        if (was && now.depthM < was.depthM - TOLERANCE_M) {
          if (isAllowedShrink(was, now)) {
            // A ruled shrink resets the mark, so it is not re-reported at every later step.
            deepest.set(key, now);
          } else {
            violations.push(
              `${trail.join(" | ")} => ${key} ${(was.depthM * 1000).toFixed(1)} -> ` +
                `${(now.depthM * 1000).toFixed(1)} mm, source ${now.source ?? "(none)"}` +
                ` (at ${label})`,
            );
          }
        }
        if (!was || now.depthM > was.depthM) deepest.set(key, now);
      }
    };
    check("start");
    for (const [name, run] of sequence) {
      trail.push(name);
      run(store);
      const rejection = store.getState().lastRejection;
      if (rejection) refusals.push(`${trail.join(" | ")} => ${rejection.code}`);
      check(name);
    }
    return { violations, refusals };
  }

  /** The four-step sweep (4 096 sequences), run once and read by both assertions below. */
  const FOUR_STEP_SWEEP: SweepResult = (() => {
    const violations = new Set<string>();
    const refusals = new Set<string>();
    for (const sequence of sequences(4)) {
      const result = sweep(sequence);
      for (const violation of result.violations) violations.add(violation);
      for (const refusal of result.refusals) refusals.add(refusal);
    }
    return {
      violations: [...violations].sort(),
      refusals: [...refusals].sort(),
    };
  })();

  it("has a sweep wide enough to contain the repeated-setting shape", () => {
    const names = [...sequences(3)].map((sequence) =>
      sequence.map((step) => step[0]).join(" | "),
    );

    expect(names).toContain("depth 600 | depth 600 | depth 700");
    expect(names.length).toBeGreaterThan(100);
  });

  // Starts from the fixture with every `depthFromBuildId` stripped, the population ADR 0080 decision 5 says the
  // fallback governs; depth changes only, since deletes would re-source the columns. Red without
  // `followsTheFallbackDown`: `A|0.30` shrinks 400 → 330 with no source and no member to explain it.
  it("holds over every sequence of three depth changes on a legacy document", () => {
    const violations: string[] = [];
    for (const sequence of sequences(3)) {
      if (sequence.some((step) => !step[0].startsWith("depth"))) continue;
      violations.push(...sweep(sequence, openLegacyStore).violations);
    }

    // Non-vacuous: the legacy store really publishes sourceless columns, the only state the fallback arm fires in.
    expect(
      [...openLegacyStore().getState().columns].filter(
        ([, column]) => column.depthFromBuildId === undefined,
      ).length,
    ).toBeGreaterThan(0);
    expect(violations).toStrictEqual([]);
  });

  it("holds over every sequence of five depth changes", () => {
    const violations: string[] = [];
    for (const sequence of sequences(5)) {
      if (sequence.some((step) => !step[0].startsWith("depth"))) continue;
      violations.push(...sweep(sequence).violations);
    }

    expect(violations).toStrictEqual([]);
  });

  it("holds over every sequence of four commands, deletes included", () => {
    expect(FOUR_STEP_SWEEP.violations.slice(0, 4)).toStrictEqual([]);
  });

  // Zero refusals, of any code: a whole-kitchen command every body adapts to has no ordinary trail that
  // refuses it (ADR 0055).
  it("refuses nothing, over every sequence of four commands", () => {
    expect(FOUR_STEP_SWEEP.refusals).toStrictEqual([]);
  });
});

describe("an extent whose depth came from a body no setting moves", () => {
  /** `B|2.45`: the freestanding fridge's column, the only one whose recorded source no setting moves (ADR 0101). */
  const FRIDGE_KEY = "B|2.45";

  /** The rows the setting does not move, read off the catalogue's own declarations rather than named. */
  const PINNED_BUILD_IDS = [
    ...buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM).keys(),
  ].filter(
    (buildId) =>
      declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM) ===
      declaredDepthM(buildId, DEEPER_MM),
  );

  function pinnedSourceKeys(): readonly string[] {
    const store = createStore();
    return [...store.getState().columns]
      .filter(([, column]) =>
        PINNED_BUILD_IDS.includes(column.depthFromBuildId ?? ""),
      )
      .map(([key]) => key);
  }

  it("finds such columns in the shipped kitchen at all", () => {
    expect(PINNED_BUILD_IDS.length).toBeGreaterThan(0);
    expect(pinnedSourceKeys().length).toBeGreaterThan(0);
    // Named, not only counted: the population shrank silently once (ADR 0101 unpinned `B|1.80`'s top), and a sweep
    // whose size is data is where that happens.
    expect(pinnedSourceKeys()).toStrictEqual([FRIDGE_KEY]);
  });

  it.each(pinnedSourceKeys().map((key) => [key] as const))(
    "leaves %s where it was frozen, at both declared settings",
    (key) => {
      const store = createStore();
      for (const member of store
        .getState()
        .records.filter((record) => record.col === key)) {
        remove(store, member.id);
      }
      const frozenM = depthMOf(store, key);
      const source = columnOf(store, key).depthFromBuildId ?? "";

      for (const depthMm of declaredCabinetDepthsMm()) {
        setDepth(store, depthMm);
        // Find the space by the body that froze it, not its coordinate: wall-B keys move with the setting
        // (ADR 0090 decision 2).
        expect(
          depthMOf(store, spaceLeftBy(store, source)),
          `at ${String(depthMm)}`,
        ).toBeCloseTo(frozenM, 9);
      }
    },
  );

  // Complement: a column whose recorded source follows the setting moves, so the test above cannot pass vacuously.
  it("moves a column whose recorded source follows the setting", () => {
    const store = createStore();
    for (const member of SURPLUS_MEMBERS) remove(store, member);
    const frozenM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeGreaterThan(frozenM);
  });
});

describe("a document written before this wave", () => {
  /** A cleared column saved, then stripped of every recorded source: the document a session before ADR 0073
   *  would have written. */
  function legacyDocument(): Design {
    const store = createStore();
    for (const member of SURPLUS_MEMBERS) remove(store, member);
    return reloadWithSource(store, undefined).getState().design;
  }

  it("is not rewritten by a load", () => {
    const stored = legacyDocument();

    const loaded = createStore(stored).getState().design;

    // Serialised on both sides, so an explicit `undefined` cannot pass for an omission.
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(stored));
  });

  it("loads to byte-identical geometry", () => {
    const stored = legacyDocument();
    const withSource = createStore(stored);

    const geometry = (store: Store) =>
      JSON.stringify(
        [...store.getState().columns].map(([key, column]) => {
          const withoutSource = { ...column };
          delete withoutSource.depthFromBuildId;
          return [key, withoutSource];
        }),
      );

    // The same document with the field restored loads to the same geometry: the field affects only a depth change.
    const restored = createStore(
      throughTheWire({
        ...stored,
        emptyColumns: (stored.emptyColumns ?? []).map((entry) => ({
          ...entry,
          depthFromBuildId: SURPLUS_BASE_ID,
        })),
      }),
    );
    expect(geometry(restored)).toBe(geometry(withSource));
  });

  it("is a fixed point of load-and-save for a document that does carry the field", () => {
    const store = createStore();
    for (const member of SURPLUS_MEMBERS) remove(store, member);
    const saved = store.getState().design;

    const reloaded = reload(store).getState().design;

    // Compared by value through the wire: JSON key order is free to change and the wire does not preserve it.
    expect(JSON.parse(JSON.stringify(reloaded))).toStrictEqual(
      JSON.parse(JSON.stringify(saved)),
    );
    for (const [key, entry] of storedEntries(createStore(reloaded))) {
      expect(Object.keys(entry).sort(), key).toStrictEqual(
        Object.keys(storedEntries(store).get(key) ?? {}).sort(),
      );
    }
  });
});

describe("the commands that move an extent, at the store", () => {
  it("carries the source across a resize that frees a narrower space", () => {
    const store = createStore();
    for (const member of SURPLUS_MEMBERS) remove(store, member);
    const frozen = storedEntries(store).get(`A|${String(SURPLUS_ALONG_MM)}`);
    const opening = store
      .getState()
      .voids.find((record) => record.col === SURPLUS_KEY && record.y0 < 0.01);
    if (!opening) throw new Error(`no base opening in ${SURPLUS_KEY}`);

    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert("base-cabinet");
    expect(store.getState().lastRejection).toBeNull();
    const inserted = store.getState().design.placements.at(-1)?.id ?? "";
    store.getState().select({ kind: "placement", id: inserted });
    store.getState().setWidth(400);
    expect(store.getState().lastRejection).toBeNull();

    const freed = store.getState().design.emptyColumns ?? [];
    expect(freed).toHaveLength(1);
    expect(freed[0]?.depthMm).toBe(frozen?.depthMm);
    expect(freed[0]?.depthFromBuildId).toBe(frozen?.depthFromBuildId);
  });

  // The fixture's cleared base columns sit within `AGREEMENT_TOLERANCE_MM` of each other; the merged entry
  // must carry the source of the member whose depth the envelope took.
  it("leaves a merged entry's depth and source describing one body", () => {
    const store = createStore();
    // Everything deletable; the two corner bodies refuse (`NOT_DELETABLE`) and stay standing.
    for (const placement of [...store.getState().design.placements]) {
      store.getState().select({ kind: "placement", id: placement.id });
      store.getState().remove();
    }
    expect((store.getState().design.emptyColumns ?? []).length).toBeGreaterThan(
      1,
    );

    for (const entry of store.getState().design.emptyColumns ?? []) {
      if (entry.depthFromBuildId === undefined) continue;
      expect(
        Math.round(
          declaredDepthM(entry.depthFromBuildId, DEFAULT_CABINET_DEPTH_MM) *
            1000,
        ),
        `${entry.wall}|${String(entry.alongMm)} records ${entry.depthFromBuildId}`,
      ).toBe(entry.depthMm);
    }
  });
});
