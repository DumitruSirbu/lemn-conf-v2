// Wave 6K-j: an empty space follows the setting, and the fallback that answers for a lost one is not
// a ratchet ([ADR 0080](../../../../docs/decisions/0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md)).
//
// The owner ruled it directly: *"everything — cabinets, empty spaces, everything — should change to
// six hundred depth… you don't keep all their depth in mind because there was earlier a cabinet
// deeper, and now this is missing."* That **confirms** wave 6K-c rather than widening it — every
// current-schema column's depth is already a pure function of (recorded source, setting) in both
// directions. What it reaches is one half of ADR 0073 decision 3's `Math.max`, which does two jobs:
//
//   - the **ratchet** — a depth the fallback *itself* published one setting ago, held on the way back
//     down. A member-less wall column with no source is deepened 330 -> 400 at 700 and stays 400 at
//     600, standing 70 mm proud of every wall body around it. This wave ends it.
//   - the **surplus** — an unsourced depth deeper than the fallback could ever produce. Kept:
//     `columnBuildDepthM` is a build *ceiling* and cannot express a base run, so answering from it is
//     290 mm wrong at the very setting the extent was frozen at.
//
// **Everything here is legacy-only, and that is the trap.** A document written by any build from wave
// 6K-c onward carries a source on every column, so nothing in this file is reachable from one — which
// is exactly why the last test asserts that closure rather than assuming it.
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

/** `A|0.30`: a wall run with nothing under it but the corner base. Cleared, it is a member-less
 *  **wall** column — the shape the ratchet bites, and the only published depth this wave moves. */
const WALL_KEY = "A|0.30";
const WALL_MEMBERS = ["p8", "p15"];

/** `A|2.00`: the dishwasher niche. Cleared, it is a member-less **base** column frozen at 620 — a
 *  depth `columnBuildDepthM` cannot express at either setting, so it is the surplus. */
const BASE_KEY = "A|2.00";
const BASE_MEMBERS = ["p1", "p12", "p18"];

/** `B|2.45`: the freestanding fridge's slot, frozen at its 742 mm machine depth. */
const FRIDGE_KEY = "B|2.45";
const FRIDGE_MEMBERS = ["p7", "p24"];

/** `B|1.80`: a pantry under one of ADR 0058's pinned deep tops, frozen at 600. Cleared, it loses its
 *  full-height member — which is what makes it the case that pins `hasFullHeightUnder`'s asymmetry. */
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

/** **The one space this scenario cleared, wherever the setting has left it.** Two things move a
 *  member-less column between settings and neither is this file's subject: ADR 0090's chain slides
 *  every wall-B column with its run, and ADR 0069's wall-end clip then narrows one that reaches past
 *  wall B's 2830 mm end. Each scenario here clears exactly one whole column, so "the member-less
 *  column on this wall" identifies the same space at every setting without naming a coordinate — and
 *  the uniqueness is asserted rather than assumed, so a fixture that grew a second space fails here
 *  instead of silently measuring the wrong one. */
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

/** The held design as a **pre-6K-c** document: through the wire with every `depthFromBuildId`
 *  stripped, which is the one shape ADR 0080 decision 5 leaves reaching the fallback arm. */
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

/** The build ceiling this rule answers with, at one setting — a *declared size*, and the whole reason
 *  the surplus arm exists: 330/400 with nothing full-height under the opening, 600/700 with one. */
function ceilingM(cabinetDepthMm: number, hasFullHeightUnder: boolean): number {
  return columnBuildDepthM({ cabinetDepthMm, hasFullHeightUnder });
}

describe("a depth the fallback itself produced follows the setting back down", () => {
  // **The ratchet, ended.** Nothing produced the 400 except this rule, one setting ago; holding it in
  // a 600 mm kitchen is ADR 0028's defect in mirror image, arriving through a rule instead of a
  // constant. Both ends are asserted against `columnBuildDepthM` rather than against 330 and 400, so
  // the test follows the map rather than restating it.
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
    // The line wave 6K-c left at 400.
    expect(depthMOf(store, WALL_KEY)).toBeCloseTo(
      ceilingM(DEFAULT_CABINET_DEPTH_MM, hasFullHeightUnder),
      9,
    );
    expect(deepenedM).toBeGreaterThan(depthMOf(store, WALL_KEY));
  });

  // A depth `columnBuildDepthM` produced is no body's declaration, so nothing may be claimed for it —
  // ADR 0079 decision 1's absence-is-a-first-class-answer, on the arm this wave rewrites.
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
  // **The surplus, and the arithmetic that makes it one.** `columnBuildDepthM` is a ceiling: at both
  // declared settings, with or without a full-height member, it cannot reach a base run's 620. So an
  // unsourced 620 was never this rule's answer, and answering from the map instead would be 290 mm
  // wrong at the setting the extent was frozen at.
  it.each([
    ["a cleared base slot", BASE_KEY, BASE_MEMBERS],
    ["a cleared appliance niche", FRIDGE_KEY, FRIDGE_MEMBERS],
  ])("holds %s at both declared settings", (_name, key, members) => {
    const store = asLegacyDocument(removeAll(createStore(), members));
    const wall = key.startsWith("B") ? "B" : "A";
    const { hasFullHeightUnder } = columnOf(store, key);
    const frozenM = depthMOf(store, key);

    setDepth(store, DEEPER_MM);
    // **The space is found on its wall, not at the coordinate it had.** Since ADR 0090 a wall-B
    // column slides with its run at a depth change, and near the wall's own end ADR 0069's clip then
    // narrows what is left — so `B|2.45` names no column at 700. The claim is unchanged: the depth
    // this space was frozen at is the depth it has at every declared setting.
    const deepenedM = theOneClearedColumnOn(store, wall).d;
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    // The reason it is a surplus, asserted rather than asserted-about: no setting makes the ceiling
    // reach it, so the fallback cannot be its author.
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      expect(
        frozenM,
        `${key} against the ceiling at ${String(cabinetDepthMm)}`,
      ).toBeGreaterThan(ceilingM(cabinetDepthMm, hasFullHeightUnder));
    }
    expect(deepenedM).toBeCloseTo(frozenM, 9);
    expect(theOneClearedColumnOn(store, wall).d).toBeCloseTo(frozenM, 9);
  });

  // The surplus keeps its column's own source, including one the catalogue cannot resolve — ADR 0079
  // decision 2's "a source survives exactly when the depth it explains survives", unchanged here.
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
  // **Re-authored after ADR 0080 amendment A and C.** With the corrected **equality** decision 4's sentence —
  // *"it can only ever make this rule keep more"* — is a theorem rather than a claim: a reading that flipped
  // between the freeze and now makes the comparison *fail*, and a failed comparison routes to the surplus arm,
  // which returns `max(column.d, newM)`. The falling direction is driven end to end below. The rising one
  // (a member-less column whose predicate turns true) has an empty population since M7C wave C7 corrected the
  // overlap, so it is a declared witness in the domain package (`frozen-map-declared-witnesses.test.ts`, ADR
  // 0123), and `qa-6k-j-fallback-rule.adversarial.test.ts` pins that no product path reaches it.

  // **The falling direction, end to end through the store.** Clearing `B|1.80` deletes its full-height
  // pantry, the freeze-time ceiling drops 600 → 330, the frozen 600 is no longer this rule's own
  // answer, and the surplus arm keeps it.
  it("keeps a 600 mm extent whose full-height member was deleted", () => {
    const store = asLegacyDocument(removeAll(createStore(), PANTRY_MEMBERS));
    const { hasFullHeightUnder } = columnOf(store, PANTRY_KEY);
    const frozenM = depthMOf(store, PANTRY_KEY);

    setDepth(store, DEEPER_MM);

    expect(hasFullHeightUnder).toBe(false);
    expect(ceilingM(DEFAULT_CABINET_DEPTH_MM, true)).toBeCloseTo(frozenM, 9);
    expect(ceilingM(DEFAULT_CABINET_DEPTH_MM, false)).toBeLessThan(frozenM);
    // ADR 0090 decision 2: the depth does not move and the wall-B coordinate does. Only the anchor
    // is setting-dependent; the claim is the one this test always made.
    expect(depthMOf(store, columnKeyAt(PANTRY_KEY, DEEPER_MM))).toBeCloseTo(
      frozenM,
      9,
    );
  });
});

// =================================================================================================
// What the wave does not fix, stated as a criterion rather than left to be re-found.
// =================================================================================================

describe("a ratchet the old rule already wrote into a document survives the load", () => {
  // **Declared behaviour, and the wave owes the sentence** (ADR 0080 amendment F). This rule runs on a
  // depth *change*; it does not re-answer an extent on load, and a rule that did would be ADR 0055
  // decision 1's "depth is never re-derived on load" and ADR 0011 Gap D at once.
  //
  // So a kitchen saved under the old rule with a 400 mm opening in a 600 mm run still shows that
  // opening on the next load, and follows the setting only after the depth is changed. That is what
  // the wave delivers and what it does not — written here so the owner is told once rather than
  // having it re-found as a defect.
  it("still publishes the stale 400 in a 600 mm kitchen until the depth moves", () => {
    // Wave 6K-a's own output, which no build of this wave produces and which the legacy population
    // holds: a member-less wall column at 400 in a document that declares 600, because the
    // deeper-only MAX held it there when the kitchen came back down. Written directly rather than
    // reproduced through the store, since the whole point is that the current rule cannot write it.
    const carried = asLegacyDocument(
      removeAll(createStore(), WALL_MEMBERS),
      (entry) =>
        entry.wall === "A" && entry.alongMm === 300
          ? { ...entry, depthMm: 400 }
          : entry,
    );

    // Reloaded, it is still the old rule's answer — no load re-derives it.
    expect(depthMOf(carried, WALL_KEY) * 1000).toBeCloseTo(400, 6);
    expect(carried.getState().design.settings?.cabinetDepthMm).toBe(
      DEFAULT_CABINET_DEPTH_MM,
    );

    // And it takes a change of the setting, not merely a load, to correct it.
    setDepth(carried, DEEPER_MM);
    setDepth(carried, DEFAULT_CABINET_DEPTH_MM);
    expect(depthMOf(carried, WALL_KEY)).toBeCloseTo(
      ceilingM(DEFAULT_CABINET_DEPTH_MM, false),
      9,
    );
  });
});

describe("one document answers one way, whatever route reached it", () => {
  // ADR 0011's 2026-08-26 correction, in its own terms. The predicate reads `column.d` and the
  // document's own `settings.cabinetDepthMm` — two fields of the design being mutated — and never the
  // session's command history, so three routes to the same document publish one map.
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

    // Two command histories, one map, bit for bit — this is the claim about history.
    expect(publishedDepths(long)).toStrictEqual(publishedDepths(short));
    // The third route goes through the wire, where `toEmptyColumn` writes whole millimetres and
    // `toColumnExtent` reads them back — so a restored `0.33` is exact where an in-session one
    // accumulated to `0.32999999999999996`. That is the persistence round trip, not this rule, so the
    // comparison is at the millimetre the document actually carries.
    expect(inMillimetres(reloaded)).toStrictEqual(inMillimetres(short));
    // Non-vacuous: the routes really are different lengths and the state really did move.
    expect(depthMOf(short, WALL_KEY)).toBeLessThan(
      ceilingM(DEEPER_MM, columnOf(short, WALL_KEY).hasFullHeightUnder),
    );
  });
});

// =================================================================================================
// The two closure criteria: what this wave changed, and what can still reach the arm it changed.
// =================================================================================================

/** Whether `columnBuildDepthM` could have expressed this column's sourced answer **at both declared
 *  settings** — the qualified licence ADR 0080 amendment J states.
 *
 *  Asked of the two settings the sweep visits rather than of one, because an entry that coincides
 *  with the ceiling at one setting only is exactly the hazard the foot of this file traps: the follow
 *  arm would carry such a depth from the setting where it agrees to the setting where it does not. */
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

/** The wall columns — the band whose sourced answer `columnBuildDepthM` states exactly, so a missing
 *  source can never cost anything there. Named rather than derived because the assertion is about the
 *  band and a derived set would restate the predicate it is checking. */
const WALL_KEYS = new Set(["A|0.30", "A|0.75", "B|0.61"]);

/** Every placement the shipped fixture lets a customer delete — the population that bounds no
 *  scenario list, in place of six chosen ones. */
function deletablePlacementIds(): readonly string[] {
  return createStore()
    .getState()
    .records.filter((record) => record.canDelete)
    .map((record) => record.id);
}

/** The scenarios ADR 0080 measured, as store factories. */
const SCENARIOS: readonly (readonly [string, () => Store])[] = [
  ["the untouched fixture", () => createStore()],
  ["one base member deleted", () => removeAll(createStore(), ["p1"])],
  ["a cleared base column", () => removeAll(createStore(), BASE_MEMBERS)],
  ["a cleared wall column", () => removeAll(createStore(), WALL_MEMBERS)],
  ["a deleted appliance", () => removeAll(createStore(), ["p7"])],
  ["a cleared appliance niche", () => removeAll(createStore(), FRIDGE_MEMBERS)],
];

/** The published map at the resolution the **document** carries, for comparing a session against a
 *  reload: `toEmptyColumn` persists whole millimetres, so a float compare across that boundary would
 *  be measuring the round trip rather than the rule. */
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

/** Each scenario at both declared settings and after a reload — the state set ADR 0080's measurement
 *  walked, as `label -> published depths`. */
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
  // ADR 0080 decision 5's premise, asserted rather than believed: the arm this wave rewrites governs
  // documents written before wave 6K-c and nothing else. It holds only while every producer of a
  // column carries a source, so it is pinned here rather than argued in a comment.
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
    // Non-vacuity, first way: it inspected something.
    expect(inspected).toBeGreaterThan(0);
  });

  // Non-vacuity, second way. "A `buildId` the catalogue no longer holds" is one of ADR 0073
  // decision 3's three inputs, and it is **unreachable across a depth change**: the two declared
  // catalogues hold identical id sets, so a source resolvable at one setting is resolvable at the
  // other. Measured here rather than trusted, because the whole closure rests on it.
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

  // Non-vacuity, third way, and the one that matters most: a check that cannot fail is worthless, so
  // a deliberately source-stripped document **does** reach the arm.
  it("is reached by a document written before wave 6K-c", () => {
    const legacy = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));

    const reached = [...legacy.getState().columns].filter(
      ([, column]) => column.depthFromBuildId === undefined,
    );

    expect(reached.length).toBeGreaterThan(0);
  });
});

describe("a legacy document differs from its sourced twin only where the source was the point", () => {
  // **The headline criterion, re-authored** (ADR 0080 amendment H). It used to read *"exactly one
  // published depth changes, and every other column on every scenario is byte-identical"*, measured
  // over six chosen scenarios. That is scenario-bound and it is not true: broadened to every
  // deletable placement the legacy-versus-sourced difference set is ten entries across six columns.
  // A count is what hid a slice once already in this family of waves.
  //
  // **Replaced by a shape, which no scenario set bounds.** A legacy document never differs from its
  // sourced twin where `columnBuildDepthM` could have expressed the sourced answer **at both declared
  // settings**. Everywhere else it may differ, and the difference set is written out whole rather
  // than counted — naming the chains instead (620/720 and 630/730) was a scenario set wearing a
  // different word, and the catalogue holds at least five such chains.
  //
  // **"At both settings" is load-bearing, not decoration** (ADR 0080 amendment J and K). Without it
  // the criterion is false for an entry that sits on the ceiling at one setting and off it at the
  // other, because the follow arm takes such a depth from the setting where it agrees to the setting
  // where it does not. There are exactly two such entries — ADR 0058's pins — and the describe block
  // at the foot of this file is the tripwire for a third.
  //
  // Swept over every deletable placement rather than six chosen shapes.
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
          // It differs. The only licence for that is a sourced answer the ceiling cannot express at
          // **both** settings — see the qualifier above.
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
    // **Non-vacuity, and it is the licensing condition that has to be live, not merely the sweep.** A
    // reading can only fail this where the ceiling could have expressed the sourced answer at both
    // settings — otherwise the difference is licensed and the loop moves on. So the count of such
    // readings is what makes the criterion mean something, and it is asserted rather than assumed.
    expect(deletablePlacementIds().length).toBeGreaterThan(10);
    expect(inspected).toBeGreaterThan(100);
    expect(expressibleAtBoth).toBeGreaterThan(0);
  });

  // The other half of the shape, so the test above cannot pass by there being no differences at all:
  // the legacy population **does** diverge, and only on chains the ceiling cannot express.
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
    // And never a wall column: a wall opening's sourced answer is the map row the fallback states, so
    // a missing source costs nothing there. `A|0.30`, `A|0.75` and `B|0.61` are the wall keys.
    expect([...diverging].filter((key) => WALL_KEYS.has(key))).toStrictEqual(
      [],
    );
  });
});

// =================================================================================================
// The catalogue-level hazard the equality carries, and the tripwire for it.
// =================================================================================================

describe("an entry that sits on a build ceiling at one declared setting only", () => {
  /** **The hazard, and it is a property of an entry rather than of a band** (ADR 0080 amendment K).
   *
   *  The follow arm reads a depth sitting exactly on `columnBuildDepthM` as this rule's own previous
   *  answer and moves it to the ceiling at the new setting. That is right for a depth the rule
   *  produced. It is wrong for an entry that *coincides* with the ceiling at one setting and declares
   *  something else at the other: such a depth is taken from the setting where it agrees to the
   *  setting where it does not, and a pinned 600 follows to 700 — 100 mm proud of a pinned depth.
   *
   *  **Asserted as the hazard predicate itself, not as "the wall family declares the map".** That
   *  form would be a second statement of the wall map, which ADR 0028 decision 4 forbids, and it names
   *  the wrong population: the hazard is not about the wall family but about *any* entry sitting on a
   *  ceiling at one setting only. A new entry anywhere in the catalogue with that shape turns this
   *  red. */
  /** **Empty since ADR 0101, and the empty list is the claim rather than a gap.**
   *
   *  It held ADR 0058's two pins, which declared 600 at both settings and so coincided with the
   *  lifted ceiling at 600 and not at 700. Both rows follow the setting now — their depth *is* the
   *  lifted ceiling at every setting — so no shipped entry has the shape.
   *
   *  A list that empties is exactly where a sweep stops meaning anything, so the arm that produced
   *  it is kept falsifiable by the declared witness in the test below rather than by a comment
   *  (ADR 0093 decision 1). */
  const KNOWN_HAZARD_ENTRIES: readonly string[] = [];

  /** Whether this entry's declared occupied depth *is* the build ceiling, at one setting and one
   *  reading of the live predicate. */
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

  /** Every entry of one catalogue with the hazard's shape, and how many (entry, predicate) pairs sit
   *  on a ceiling at **both** settings — the non-vacuity count, read beside the answer so the two
   *  cannot be measured over different catalogues. */
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
    // Non-vacuity: coinciding with a ceiling is common — 15 (entry, predicate) pairs do it at *both*
    // settings — so the discriminating half of the predicate is "at one setting only", and it has a
    // large population to be wrong about.
    expect(onTheCeilingAtBoth).toBeGreaterThan(0);
    expect(declaredCabinetDepthsMm().length).toBeGreaterThan(1);
  });

  // **The arm's witness, declared here** (ADR 0093 decision 2, as ADR 0101 decision 3 applies it).
  // The list above is empty and an empty list proves nothing about a predicate, so the same sweep is
  // run over a catalogue holding one body with the shape: a top pinned at 600 at every setting,
  // which coincides with the lifted ceiling at 600 and not at 700. Break `sitsOnTheCeiling` or the
  // "at one setting only" test and this goes red where the shipped catalogue cannot.
  it("is found by the same sweep on a catalogue that holds one", () => {
    const { hazards } = hazardsIn(catalogWithAPinnedTop);

    expect(hazards).toStrictEqual([PINNED_TOP_WITNESS_BUILD_ID]);
  });

  // **Fixture-bounded safety, recorded as such rather than as a structural guarantee.** Neither pin is
  // reachable today, and the reason is the fixture rather than the rule: `B|1.80` is the only column
  // whose recorded source is a pin, and it holds a full-height `tall-pantry-600`, so it is never
  // member-less while that pin is its depth; `wall-2door-700-over-fridge` never wins its column's MAX
  // at all, because `B|2.45` is the fridge's 742.
  //
  // It becomes reachable the moment a member-less column's recorded depth is one of those 600s while
  // the column reads `hasFullHeightUnder: true` — a pinned deep top left alone in a column a
  // full-height body overlaps, or a new entry declaring the same depth at both settings.
  //
  // **And it is not a 6K-j regression**, which follows from the rule rather than from a run: with an
  // unsourced 600 and a `true` reading, ADR 0073 decision 3's MAX gives `max(600, 700) = 700` at the
  // deeper setting under wave 6K-c as well, and then holds 700 at the shallower one. This wave reaches
  // the same 700 and does not ratchet it — the pin is 100 mm proud under both rules, and only this
  // wave lets it come back.
  // **Measured on the witness fixture rather than on the shipped one**, because the shipped one has
  // held no hazard entry since ADR 0101 and "unreachable because nothing has the shape" is a
  // different and much weaker claim than the one this test makes.
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

    // One column records the pin, and it is never member-less while it does: a full-height member
    // stands in it.
    expect(pinnedColumns).toStrictEqual([PANTRY_KEY]);
    expect(
      store
        .getState()
        .records.filter((record) => record.col === PANTRY_KEY)
        .map((record) => record.band),
    ).toContain("column");
  });
});
