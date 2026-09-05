// Adversarial QA on wave 6K-c (ADR 0073), store half: what a depth change does with the record.
//
// The record itself — how it is minted, whether the converters are inverses, what the byte cap
// allows — is measured one package over in
// `packages/configurator-domain/tests/qa-6k-c-frozen-source.adversarial.test.ts`.
//
// The wave's central claim is that the surplus arm changed from `Math.max(column.d, measured.d)` to
// `Math.max(frozenDepthAtThisSettingM, measured.d)` **without** giving up what ADR 0011 Gap D
// protects. That is a claim about a floor, so every test here is about a floor: what a delete freed,
// measured before and after, over sequences rather than over single transitions.
//
// No expected depth is written out where the catalogue can be asked.
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
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  assertSourcesExplainTheirDepths,
  assertStoredSourcesExplainTheirDepths,
  DECLARED_DEPTH_EPSILON_M,
} from "../support/frozen-source-invariant";
import { columnKeyAt } from "../support/wall-b-column-keys";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `A|2.00`: a dishwasher niche under an open shelf and a top box. Deleting the niche leaves an
 *  occupied column whose reach no surviving member explains — ADR 0073's own worked example, and
 *  the shape ADR 0011 Gap D exists for. */
const SURPLUS_KEY = "A|2.00";
const SURPLUS_ALONG_MM = 2000;
const SURPLUS_BASE_ID = "base-dishwasher-600";
const SURPLUS_BASE_PLACEMENT = "p1";
const SURPLUS_MEMBERS = ["p1", "p12", "p18"];

/** `B|1.80`: a tall pantry under one of ADR 0058's two pinned deep tops. The **top** wins §3.2's MAX
 *  (600 against the pantry's 599), so this column's recorded source is a body no setting moves while
 *  its surviving member is one that every setting moves. */
const PINNED_SOURCE_KEY = "B|1.80";
const PINNED_SOURCE_ALONG_MM = 1800;
const PINNED_TOP_PLACEMENT = "p23";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** What one catalogue row declares it fills, at one setting — read the way the store reads it. */
function declaredDepthM(buildId: string, cabinetDepthMm: number): number {
  const definition = buildKitchenLBodyCatalog(cabinetDepthMm).get(buildId);
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

/** The member-less column whose depth this body's declaration supplied, wherever it now stands —
 *  ADR 0073 decision 1's recorded source used as the anchor a moving coordinate can no longer be.
 *  Member-less by construction in these tests, and asserted so rather than assumed: an occupied
 *  column carrying the same source would be a different claim. */
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

/** The along-wall coordinate a published column stands at, in whole millimetres — the number a
 *  placement in that column carries as its own `alongMm`. Read off the map rather than restated,
 *  because since ADR 0090 decision 2 it is a function of the setting on wall B. */
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

/** The design as the wire delivers it back, with every recorded source rewritten. `undefined`
 *  produces exactly the document a session **before** this wave would have written — the migration
 *  path every stored design takes. */
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

/** The shipped fixture as a document written **before** wave 6K-c: driven far enough to carry a
 *  frozen map, then saved with every `depthFromBuildId` stripped and reloaded through the wire. It is
 *  the only population ADR 0080 decision 5 leaves reaching the fallback arm. */
function openLegacyStore(): Store {
  const cleared = createStore();
  for (const member of cleared
    .getState()
    .records.filter((record) => record.col === "A|0.30")) {
    remove(cleared, member.id);
  }
  return reloadWithSource(cleared, undefined);
}

/** Every frozen entry the document carries, both arrays, keyed the way a reader compares two saves. */
function storedEntries(store: Store): ReadonlyMap<string, EmptyColumn> {
  const held = store.getState().design;
  return new Map(
    [...(held.emptyColumns ?? []), ...(held.columnExtents ?? [])].map(
      (entry) => [`${entry.wall}|${String(entry.alongMm)}`, entry],
    ),
  );
}

// =================================================================================================
// The flagged departure: 6K-a's `column.d` floor, replaced by a re-answer of the recorded body.
// =================================================================================================

describe("a delete-freed surplus, through a depth change", () => {
  /** A column whose base member has been deleted: the wall bodies above it stand, and the extent
   *  reaches 620 mm that nothing standing explains. Exactly ADR 0011 Gap D's freed opening. */
  function withFreedSurplus(): Store {
    const store = createStore();
    remove(store, SURPLUS_BASE_PLACEMENT);
    return store;
  }

  it("really is a surplus and not a measurement", () => {
    const store = withFreedSurplus();

    // The column still holds members, and it reaches deeper than any of them.
    expect(
      store.getState().records.filter((record) => record.col === SURPLUS_KEY),
    ).not.toHaveLength(0);
    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(
      declaredDepthM(SURPLUS_BASE_ID, DEFAULT_CABINET_DEPTH_MM),
      9,
    );
  });

  // Lead question 1. The extent is the deleted body's declaration, re-asked at the new setting.
  it("becomes the deleted body's declaration at the new setting", () => {
    const store = withFreedSurplus();

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(
      declaredDepthM(SURPLUS_BASE_ID, DEEPER_MM),
      9,
    );
  });

  // Lead question 2, and the one that matters most: **the migration path every stored design takes.**
  // A document written before this wave carries no source at all, so decision 3's fallback is the
  // only thing between it and a collapsed opening. `column.d` must survive as the floor.
  it("keeps the freed depth on a document written before this wave", () => {
    const store = reloadWithSource(withFreedSurplus(), undefined);
    const frozenM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);

    // Nothing in the document says which body froze it, so nothing may make it shallower.
    expect(depthMOf(store, SURPLUS_KEY)).toBeGreaterThanOrEqual(frozenM);
    // And the declared build depth cannot supply it either — the floor is doing the work.
    expect(
      columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: columnOf(store, SURPLUS_KEY).hasFullHeightUnder,
      }),
    ).toBeLessThan(frozenM);
  });

  // The same, for a source the catalogue no longer holds — decision 3's second input.
  it("keeps the freed depth when the recorded source has left the catalogue", () => {
    const store = reloadWithSource(withFreedSurplus(), "retired-cabinet-600");
    const frozenM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeGreaterThanOrEqual(frozenM);
  });

  // Lead question 3. A decrease on a column carrying a genuine delete-freed surplus **does** shrink
  // it, and this is decision 2's ruled behaviour rather than a defect: the extent is the same body's
  // declaration read at the shallower setting, which is what "an exact re-answer of the same body"
  // means. It is recorded here because the milestone's wording — *"still 620 mm after a command that
  // is not a depth change, and 720 mm after one"* — does not cover the decrease, and a reader should
  // not have to infer that the two directions are deliberately asymmetric.
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

  // Decision 3's own worked case, and the only one in ADR 0073's cost analysis that reaches a body
  // somebody builds: a member-less **wall** column with no recorded source must be deepened to the
  // column's declared build depth, or `resolveDepthM` floors an inserted wall cabinet 70 mm shallower
  // than the map declares. Asserted on a legacy document, which is the arm that has to do it.
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

      // Non-vacuous: the frozen depth really is shallower than the declared build depth, so the
      // fallback has work to do.
      expect(frozenM).toBeLessThan(declaredM);
      expect(depthMOf(store, "A|0.30")).toBeCloseTo(declaredM, 9);
    },
  );

  // ADR 0052 at the store: neither shape is refused, and the store goes on to publish a map.
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

  // And the round trip the decrease makes possible: back where it started, which the recorded-source
  // arm buys and decision 3's fallback explicitly does not.
  it("returns a recorded surplus to where it started across a round trip", () => {
    const store = withFreedSurplus();
    const startedM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeCloseTo(startedM, 9);
  });
});

// =================================================================================================
// The anti-invariant, and the sequence that breaks it.
// =================================================================================================

describe("a frozen extent never becomes shallower than the body standing in it left it", () => {
  // **FINDING, and NARROWED after adjudication — ADR 0079 amendment A and B.**
  //
  // As first written these two asserted `>= freedM`: the extent may never end shallower than the
  // depth the delete froze, whatever the setting then did. That over-states the criterion, and the
  // proof is in this same file one `describe` down — the four-step sweep does not assert it either.
  // `isAllowedShrink` names the two shrinks the records do allow, and the second of them is
  // `reAnswersOneBody`: the recorded source is unchanged **and** the depth is that source's own
  // declaration at both the setting left and the setting taken. That is ADR 0073 decision 2's exact
  // re-answer, which ADR 0079 decision 4 refused to trade away. So the assertion below is not a new
  // one invented to fit an implementation — it is this file's own predicate, applied to this file's
  // own examples.
  //
  // **It still catches the defect, and that was run rather than argued.** Against the F1-defective
  // code — `atDepthM` publishing a depth and carrying the previous `depthFromBuildId` across
  // untouched, which is the single parted writer ADR 0079 decision 1 names — both go red:
  //
  //     x keeps the depth a delete freed when the recorded source is shallower than it
  //     x does not save an opening shallower than the one the delete froze
  //
  // and both pass against the fix. `B|1.80` went 699 -> 600 there, carrying
  // `wall-2door-600-deep-top`, which declares 600 at every setting — so the source never declared
  // 699, `isItsSourcesDeclaration` is false at the start of the shrink, and `reAnswersOneBody` fails.
  // With the fix the source is `tall-pantry`, both ends are its declaration, and the shrink is
  // allowed. Same column, same two numbers, opposite verdicts.
  //
  // **The baseline that discriminates is that intermediate code, not `52e3c70`** — and the reason is
  // worth stating, because the pre-wave number looks like a passing test and is not one. Measured at
  // the commit before this wave the trail is `699 -> 699 -> 699`: with no `depthFromBuildId` in the
  // tree the member-less arm has nothing to re-ask, so it `continue`s and carries the frozen depth
  // forward. Any shrink predicate passes vacuously there.
  //
  // **That 699 in a 600 mm kitchen is the residue this wave exists to remove, not a depth worth
  // keeping.** ADR 0073 states it in those words — *"a frozen extent with no member left to measure
  // keeps the old setting's depth, and `projectFrozenMap` saves it"* — and the 699 was frozen at 700.
  // The owner ruled the same thing directly on 2026-09-05: *"when you decide to change the depth,
  // let's say, from seven hundred to six hundred, everything — cabinets, empty spaces, everything —
  // should change to six hundred depth. So you don't keep their depth in mind because there was
  // earlier a cabinet deeper, and now this is missing."* `tall-pantry` declares 599 at 600, so 599 is
  // the extent following the body that froze it.
  //
  // The measurement is kept because it says something true about **blast radius**: no design a
  // customer holds today sees a shrink from this change, because today nothing shrinks at all.
  //
  // The state is reached in four ordinary commands on the shipped fixture, and it survives a save
  // and a reload, so it is also reachable in one command from a stored document.

  /** `isAllowedShrink`'s `reAnswersOneBody` arm, as the two example tests below need it: was this
   *  shrink one recorded body's declaration read at two settings?
   *
   *  **Named apart from the sweep's `reAnswersOneBody` on purpose.** The sweep's takes two
   *  `Reading`s and carries the `measuredM` arm beside it; this one takes a store and the depth the
   *  column is shrinking *from*, because these two columns are member-less by construction and there
   *  is nothing to measure. Two different signatures answering the same question should not wear one
   *  name in one file — the divergence belongs at the name rather than only in a comment. */
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
    const store = createStore();
    // 1. Delete the pinned deep top. The column keeps its 600 mm extent and records that top as the
    //    body the depth came from; the pantry below it measures 599.
    remove(store, PINNED_TOP_PLACEMENT);
    // 2. Deepen. The pantry follows the setting to 699 and the extent follows it — deeper-only —
    //    while the recorded source still names the pinned top, which declares 600 at every setting.
    //    **The column is also 100 mm further along wall B now** (ADR 0090 decision 2): a deeper
    //    corner on wall A takes more of wall B, so the key this column is filed under is a function
    //    of the setting. The anchor moves with it; every assertion below is the one this test always
    //    made.
    setDepth(store, DEEPER_MM);
    const deepKey = columnKeyAt(PINNED_SOURCE_KEY, DEEPER_MM);
    const deepAlongMm = alongMmOf(store, deepKey);
    expect(depthMOf(store, deepKey)).toBeGreaterThan(
      declaredDepthM("wall-2door-600-deep-top", DEEPER_MM),
    );
    // 3. Delete the pantry. Now nothing stands here, and the space the delete freed is 699 mm deep.
    const survivor = store
      .getState()
      .design.placements.find(
        (placement) =>
          placement.wall === "B" && placement.alongMm === deepAlongMm,
      );
    if (!survivor) throw new Error("no member left to delete");
    remove(store, survivor.id);
    const freedM = depthMOf(store, deepKey);

    // 4. Any depth change. Nothing stands here to measure, so the whole answer comes from the
    //    recorded source — which must therefore be a body that really did have this depth.
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    // Either it did not get shallower at all, or the shrink is one body's declaration at two
    // settings. Pre-fix it was neither: 699 collapsed to 600 under a source that declares 600
    // everywhere, so the 699 belonged to no body the record named.
    expect(
      depthMOf(store, PINNED_SOURCE_KEY) >= freedM ||
        reAnswersItsShallowerDeclaration(store, PINNED_SOURCE_KEY, freedM),
    ).toBe(true);
  });

  // The same defect from the other side: it is durable. `projectFrozenMap` writes the collapsed
  // extent into the document, so the space is not merely mis-drawn for the session — it is saved.
  it("does not save an opening shallower than the one the delete froze", () => {
    const store = createStore();
    remove(store, PINNED_TOP_PLACEMENT);
    setDepth(store, DEEPER_MM);
    // The same anchor, for the same reason as the test above: at 700 this column stands 100 mm
    // further along wall B (ADR 0090 decision 2).
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

    // The saved half of the same claim: the document may carry a shallower opening only when the
    // entry it saves names the body that opening is the declaration of, at this setting.
    const savedMm =
      storedEntries(store).get(`B|${String(PINNED_SOURCE_ALONG_MM)}`)
        ?.depthMm ?? 0;
    expect(
      savedMm >= (frozenMm ?? 0) ||
        reAnswersItsShallowerDeclaration(store, PINNED_SOURCE_KEY, frozenM),
    ).toBe(true);
    // And the saved entry agrees with the published column, so this is not passing on a stale map.
    expect(savedMm).toBe(Math.round(depthMOf(store, PINNED_SOURCE_KEY) * 1000));
  });
});

// =================================================================================================
// The invariant underneath F1: a recorded source that does not explain its own recorded depth.
// =================================================================================================

describe("the recorded source explains the recorded depth", () => {
  // **The predicate is `tests/support/frozen-source-invariant.ts`, not a copy of it.** ADR 0079
  // decision 10 part 2 puts it in a shared module precisely so a test that drives the store gets the
  // check without its author having read the record, and this file is the one the record names. It
  // asserts the same thing the local copy did — every published column either records no source, or
  // one the catalogue does not hold, or one whose declaration at the design's own setting *is* the
  // depth carried — and adds the non-vacuity ADR 0079 decision 10 part 3 requires, which the local
  // copy did not have: a map with no known sources satisfied it silently.

  // Non-vacuous, and the assertion that makes the rest of this block mean something: the shipped
  // kitchen as loaded satisfies the invariant, so a failure below is something a command did.
  it("holds on the shipped kitchen as it loads", () => {
    assertSourcesExplainTheirDepths(createStore().getState(), "load");
  });

  // **FINDING, and the diagnosis F1's own assertions cannot distinguish.** One depth change on the
  // untouched fixture is enough: `B|1.80`'s frozen depth was the pinned deep top's 600, the surviving
  // pantry measures 699 at the deeper setting, the *fully explained* arm publishes 699 — and
  // `atDepthM` carries the old source across untouched, so the extent now records a body that
  // declares 600 at every setting as the source of a 699 mm depth.
  //
  // Nothing has gone wrong yet at this step: 699 is the right depth while the pantry is standing.
  // What has gone wrong is the **record**, and it is the record that answers once the pantry is
  // deleted. Putting a `Math.max(column.d, …)` floor on the recorded arm does not repair this: it
  // makes the wrong number survive instead of making the record right.
  it("still holds after a single depth change", () => {
    const store = createStore();

    setDepth(store, DEEPER_MM);

    assertSourcesExplainTheirDepths(store.getState(), "after setCabinetDepth");
  });

  // And the document half: `projectFrozenMap` writes the disagreeing pair, so it is saved and
  // reloaded rather than being a session-local slip.
  it("still holds in the document a depth change hands on to be saved", () => {
    const store = createStore();

    setDepth(store, DEEPER_MM);

    // The document half, and its own function in the shared module rather than the same one twice:
    // a stored entry carries the whole millimetre `toEmptyColumn` persisted, so that comparison is an
    // integer one and no float band belongs in it.
    assertStoredSourcesExplainTheirDepths(
      store.getState().design,
      "the document a depth change hands on",
    );
  });
});

// =================================================================================================
// The sweep: state, not transitions. 6K's defects have twice been state-triggered.
// =================================================================================================

describe("over sequences of commands rather than single transitions", () => {
  /** One step of a sequence, named so a failure says which one it was. */
  type Step = readonly [name: string, run: (store: Store) => void];

  const DEPTHS = declaredCabinetDepthsMm();
  const SWEPT_KEYS = [SURPLUS_KEY, PINNED_SOURCE_KEY, "A|0.30"] as const;

  function depthSteps(): readonly Step[] {
    // Lenient: a refusal is collected and reported rather than thrown, so one refused command in the
    // middle of a sweep does not hide every shrink the rest of the sweep would have found.
    return DEPTHS.map(
      (depthMm): Step => [
        `depth ${String(depthMm)}`,
        (store) => {
          store.getState().setCabinetDepth(depthMm);
        },
      ],
    );
  }

  /** Deleting the member the extent **records** — the one move that leaves a frozen depth with no
   *  standing body to explain it, which is the state ADR 0011 Gap D is about. */
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

  /** …and deleting one that is **not** recorded, which leaves the depth explained and is the arm
   *  that must keep following the setting in both directions. */
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

  /** Every sequence of `length` steps drawn from `STEPS`, with repeats — `600 → 600 → 700` is a
   *  sequence this has to contain, because that is the shape 6K's last two defects took. */
  function* sequences(length: number): Generator<readonly Step[]> {
    if (length === 0) {
      yield [];
      return;
    }
    for (const head of STEPS) {
      for (const tail of sequences(length - 1)) yield [head, ...tail];
    }
  }

  /** One column as the invariant reads it: how deep it is, which body it says supplied that, whether
   *  the two agree at the setting the design currently declares, and what the members standing in it
   *  measure right now. */
  interface Reading {
    readonly depthM: number;
    readonly source: string | undefined;
    readonly isItsSourcesDeclaration: boolean;
    readonly measuredM: number | undefined;
    /** The live predicate `columnBuildDepthM` needs, read off the column rather than re-derived, so
     *  `followsTheFallbackDown` asks the same question the store asked (ADR 0080 decision 4). */
    readonly hasFullHeightUnder: boolean;
  }

  const TOLERANCE_M = 1e-9;

  function readingsOf(store: Store): ReadonlyMap<string, Reading> {
    const held = store.getState().design;
    const cabinetDepthMm =
      held.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM;
    // No stored half, so this is what the **members** imply and nothing else — the same question
    // `atCurrentCabinetDepth` asks of `deriveColumns(records, {}, room)`.
    const measured = deriveColumns(store.getState().records, {}, held.room);
    return new Map(
      [...store.getState().columns].map(([key, column]) => {
        const source = column.depthFromBuildId;
        const declaredM =
          source === undefined
            ? undefined
            : declaredDepthM(source, cabinetDepthMm);
        return [
          key,
          {
            depthM: column.d,
            source,
            isItsSourcesDeclaration:
              declaredM !== undefined &&
              Math.abs(column.d - declaredM) < TOLERANCE_M,
            measuredM: measured.get(key)?.d,
            hasFullHeightUnder: column.hasFullHeightUnder,
          },
        ];
      }),
    );
  }

  /** **The anti-invariant, stated with the two shrinks the record does allow.** A frozen extent may
   *  never become shallower than it has already been — unless
   *
   *  - the members standing in it measure exactly the depth it took, which is 6K-a's *fully
   *    explained* arm and is authoritative in both directions, or
   *  - the depth it left and the depth it took are the **same recorded body's** declaration at their
   *    two settings, which is ADR 0073 decision 2's "exact re-answer of the same body".
   *
   *  Everything else is depth a delete freed and something later took away, which is what ADR 0011
   *  Gap D forbids and what this wave's criterion promises. */
  function isAllowedShrink(was: Reading, now: Reading): boolean {
    const membersExplainIt =
      now.measuredM !== undefined &&
      Math.abs(now.measuredM - now.depthM) < TOLERANCE_M;
    const reAnswersOneBody =
      was.isItsSourcesDeclaration &&
      now.isItsSourcesDeclaration &&
      was.source === now.source;
    return membersExplainIt || reAnswersOneBody || followsTheFallbackDown(was);
  }

  /** **The third allowed shrink, added by wave 6K-j** (ADR 0080 decision 4) — added to the two above,
   *  never carved out of them.
   *
   *  An extent with **no recorded source** whose depth is what the fallback itself would have
   *  published at the setting being left is not information: it is this rule's own previous answer,
   *  and holding it on the way back down is the ratchet the owner's instruction names. A member-less
   *  wall column deepened 330 → 400 at 700 and kept at 400 in a 600 mm kitchen stands 70 mm proud of
   *  every wall body around it.
   *
   *  **Narrow on purpose, and it is the narrowness that matters.** It fires only where there is no
   *  source at all — so it cannot touch the sourced arms above — and only where the depth being left
   *  is one `columnBuildDepthM` could have produced at the setting being left. A legacy cleared base
   *  slot at 620 is deeper than that ceiling at either setting, so this arm never reaches it and the
   *  surplus stays a surplus. A predicate that let the 620 shrink would be a weakened one. */
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
            // A ruled shrink resets the mark: what follows is measured against the depth the
            // kitchen legitimately holds now, not against one it has left behind. Without this the
            // invariant would re-report a single allowed decrease at every later step.
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

  /** The four-step sweep, run once and read by both assertions below — 4 096 sequences of ordinary
   *  commands against a fresh store each, which is the whole cost of this file. */
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

  // **The legacy half, added by wave 6K-j.** The sweep above starts from the shipped fixture, where
  // every column carries a source — so it never reaches the fallback arm and never exercised the
  // shrink `followsTheFallbackDown` allows. This one starts from the same fixture saved with every
  // `depthFromBuildId` stripped, which is the one population ADR 0080 decision 5 says that arm
  // governs: documents written before wave 6K-c.
  //
  // Depth changes only, and three steps rather than four: the arm is reached by a setting change and
  // by nothing else, so the delete steps would only re-source the columns and take the sweep back to
  // the case above.
  //
  // **Without `followsTheFallbackDown` this goes red**, which is the proof the arm was added rather
  // than carved out of the two beside it: `A|0.30` shrinks 400 → 330 with no source at all, so
  // `membersExplainIt` is false (nothing stands there) and `reAnswersOneBody` is false (no source to
  // re-answer), and the shrink is reported as a violation.
  it("holds over every sequence of three depth changes on a legacy document", () => {
    const violations: string[] = [];
    for (const sequence of sequences(3)) {
      if (sequence.some((step) => !step[0].startsWith("depth"))) continue;
      violations.push(...sweep(sequence, openLegacyStore).violations);
    }

    // Non-vacuous: the legacy store really does publish sourceless columns, which is the only state
    // in which the new arm can fire.
    expect(
      [...openLegacyStore().getState().columns].filter(
        ([, column]) => column.depthFromBuildId === undefined,
      ).length,
    ).toBeGreaterThan(0);
    expect(violations).toStrictEqual([]);
  });

  // Depth changes alone, interleaved with each other — the cheapest half of the sweep, and the one
  // that must be clean before anything else means much.
  it("holds over every sequence of five depth changes", () => {
    const violations: string[] = [];
    for (const sequence of sequences(5)) {
      if (sequence.some((step) => !step[0].startsWith("depth"))) continue;
      violations.push(...sweep(sequence).violations);
    }

    expect(violations).toStrictEqual([]);
  });

  // The full alphabet: deletes interleaved with depth changes, over four steps — the length at which
  // a surplus can be created, carried across a setting, orphaned and then re-asked, which is one
  // step longer than any sequence 6K has been swept over before.
  it("holds over every sequence of four commands, deletes included", () => {
    expect(FOUR_STEP_SWEEP.violations.slice(0, 4)).toStrictEqual([]);
  });

  // **A separate finding, and NOT this wave's.** A depth change is a whole-kitchen command and
  // ADR 0055 decision 1 says every body adapts; two ordinary deletes leave the shipped kitchen unable
  // to change its own depth at all. Measured to be independent of everything 6K-c added: it
  // reproduces with `depthFromBuildId` stripped from the document, with both frozen-map arrays empty,
  // and on a hand-built design that never went through the store — so the refusal is
  // `set-cabinet-depth.ts`'s rebuild and not this record's field. Collected leniently above so that
  // it cannot mask the shrink sweep, and asserted here on its own.
  //
  // Minimal reproduction: delete `p12` (`open-shelf-600`) and `p18` (`wall-2door-600-top`) from
  // `A|2.00`, then any `setCabinetDepth`. The rebuild plans the dishwasher niche at 860 mm against
  // the base level's 820 and refuses `HEIGHT_EXCEEDS_LEVEL`.
  //
  // **CARRIED DEBT, BOUNDED — ADR 0079 amendment E.** Wave 6K-c closes with this open: it is older
  // than the wave, it reproduces without the wave's field, and holding a closed defect behind an
  // unadjudicated one helps nobody. It is **not** an `it.fails`, which would record *"this is
  // broken"* rather than *"this is broken exactly this much"* — the quantity here is a set, and an
  // `it.fails` on a set keeps passing when three trails become thirty.
  //
  // So the measured set is the assertion. Every refusal the four-step sweep collects carries
  // `HEIGHT_EXCEEDS_LEVEL`, and the trails are exactly these three. **A fourth trail, or a refusal of
  // any other code, turns this red the day it appears** — which is the difference between a debt with
  // a tripwire and a defect nobody owns. Whichever wave adjudicates ADR 0079's finding deletes this
  // block; until then it is the boundary on what is known to be broken.
  /** **Every trail the sweep refuses, measured 2026-09-05.** Thirty-four, not the three ADR 0079
   *  amendment E names — the record quotes the number this file used to report, and it reported three
   *  because the assertion it replaces read `refusals.slice(0, 3)`. The set was always this size.
   *
   *  Every one of them contains the finding's own minimal reproduction: two deletes of a non-source
   *  member of `A|2.00` — `open-shelf-600` and `wall-2door-600-top` — before a `setCabinetDepth`.
   *  That is asserted below as well as the set itself, so a reader can see *why* these thirty-four and
   *  not some other thirty-four. */
  const CARRIED_REFUSAL_TRAILS: readonly (readonly string[])[] = [
    [
      "delete a non-source member of A|0.30",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|0.30",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|0.30",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|0.30",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|0.30",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|0.30",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete a non-source member of B|1.80",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete a non-source member of B|1.80",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete the recorded source of A|0.30",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete the recorded source of A|0.30",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete the recorded source of B|1.80",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "delete the recorded source of B|1.80",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
      "delete a non-source member of A|2.00",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
      "delete a non-source member of A|2.00",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of B|1.80",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete a non-source member of B|1.80",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete the recorded source of A|0.30",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete the recorded source of A|0.30",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete the recorded source of B|1.80",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of A|2.00",
      "delete the recorded source of B|1.80",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete a non-source member of B|1.80",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete a non-source member of B|1.80",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete the recorded source of A|0.30",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete the recorded source of A|0.30",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
    [
      "delete the recorded source of B|1.80",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 600",
    ],
    [
      "delete the recorded source of B|1.80",
      "delete a non-source member of A|2.00",
      "delete a non-source member of A|2.00",
      "depth 700",
    ],
  ];

  /** The step that clears a member of `A|2.00` the extent does not record — the finding's own two
   *  deletes, and the only step any refused trail needs twice. */
  const THE_FINDINGS_DELETE = "delete a non-source member of A|2.00";

  it("refuses a depth change only where ADR 0079's open finding already does", () => {
    // One code, so a *different* defect arriving under this exemption is not silently absorbed by it.
    const codes = new Set(
      FOUR_STEP_SWEEP.refusals.map((refusal) => refusal.split(" => ")[1] ?? ""),
    );
    expect([...codes]).toStrictEqual(["HEIGHT_EXCEEDS_LEVEL"]);

    // The shape, so the set below is legible rather than a wall of strings nobody can check: every
    // refused trail is the finding's two deletes, and a depth change after them.
    const trails = FOUR_STEP_SWEEP.refusals.map((refusal) =>
      (refusal.split(" => ")[0] ?? "").split(" | "),
    );
    for (const trail of trails) {
      const deletes = trail.filter((step) => step === THE_FINDINGS_DELETE);
      const depthChangeAt = trail.findIndex((step) => step.startsWith("depth"));
      expect(deletes.length, trail.join(" | ")).toBeGreaterThanOrEqual(2);
      expect(depthChangeAt, trail.join(" | ")).toBeGreaterThan(0);
    }

    // And the exact set, so the debt cannot grow, shrink or move without saying so.
    expect(trails).toStrictEqual(CARRIED_REFUSAL_TRAILS);
  });
});

// =================================================================================================
// The declaration-driven exceptions, asserted without naming an id.
// =================================================================================================

describe("an extent whose depth came from a body no setting moves", () => {
  /** The rows the setting does not move, read off the catalogue's own declarations. Named nowhere:
   *  if the store started naming ids, this list would still be derived from the map and the
   *  assertions below would still be about what the map says. */
  const PINNED_BUILD_IDS = [
    ...buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM).keys(),
  ].filter(
    (buildId) =>
      declaredDepthM(buildId, DEFAULT_CABINET_DEPTH_MM) ===
      declaredDepthM(buildId, DEEPER_MM),
  );

  /** Every column of the shipped kitchen whose recorded source is one of those rows, cleared of all
   *  its members — so the assertion runs over whatever the fixture happens to hold rather than over
   *  two hand-picked keys. */
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
        // **The space is found by the body that froze it, not by the coordinate it stood at**
        // (ADR 0090 decision 2). A wall-B column slides with its run when the corner on wall A gets
        // deeper, and near the wall's own end ADR 0069's clip then narrows what is left — so the key
        // is a function of the setting twice over. What this test asserts is unchanged: a pinned
        // source's extent is the same depth at every declared setting.
        expect(
          depthMOf(store, spaceLeftBy(store, source)),
          `at ${String(depthMm)}`,
        ).toBeCloseTo(frozenM, 9);
      }
    },
  );

  // The complement, so the test above cannot pass by the depth change doing nothing at all: a column
  // whose recorded source **does** follow the setting moves with it.
  it("moves a column whose recorded source follows the setting", () => {
    const store = createStore();
    for (const member of SURPLUS_MEMBERS) remove(store, member);
    const frozenM = depthMOf(store, SURPLUS_KEY);

    setDepth(store, DEEPER_MM);

    expect(depthMOf(store, SURPLUS_KEY)).toBeGreaterThan(frozenM);
  });
});

// =================================================================================================
// The no-bump claim, as a round trip.
// =================================================================================================

describe("a document written before this wave", () => {
  /** The shipped kitchen with a cleared column, saved, then stripped of every recorded source — the
   *  document a session before ADR 0073 would have written, byte for byte. */
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

    // The same document with the field restored loads to the same geometry: the field changes what a
    // depth change publishes, never what a load reads.
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

  // A document the product itself wrote, reloaded and saved again untouched, is the same bytes — the
  // property that makes "no version bump" a claim about behaviour rather than about a constant.
  it("is a fixed point of load-and-save for a document that does carry the field", () => {
    const store = createStore();
    for (const member of SURPLUS_MEMBERS) remove(store, member);
    const saved = store.getState().design;

    const reloaded = reload(store).getState().design;

    // Compared through the wire on both sides, so an explicit `undefined` cannot pass for an
    // omission — and by value rather than by byte, because JSON key order is the one thing a
    // document's route through the store is free to change and the wire does not preserve.
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

// =================================================================================================
// The commands that move an extent, at the seam where they actually publish a map.
// =================================================================================================

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

  // A merged run really does descend from two sources here: the fixture's own cleared base columns
  // sit within `AGREEMENT_TOLERANCE_MM` of each other, and the merged entry must carry the source of
  // the member whose depth the envelope took.
  it("leaves a merged entry's depth and source describing one body", () => {
    const store = createStore();
    // Everything the product lets a customer delete. The two corner bodies refuse
    // (`NOT_DELETABLE`), which is a different rule with its own tests, so they are left standing
    // rather than asserted about here.
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
