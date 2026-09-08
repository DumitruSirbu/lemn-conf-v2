// **Wave 6Z at the seam the owner reported it from** — ADR 0103 decision 2, driven through the
// ordinary store on `KITCHEN_L_DESIGN`, because every state below is reached by taps a customer can
// make and the domain fixture cannot show that.
//
// The rule: on a successful insert, every body already standing in a column the insert touched is
// re-planned at the column as it stands afterwards. Put a full-height cabinet under a top and the
// top takes the lifted depth; put an ordinary one under it and the top takes the capped depth.
//
// **A remove re-plans nothing**, and there is deliberately no test asserting that it does. The owner
// ruled the asymmetry (ADR 0103 decision 2): a delete is usually the first half of a replacement, so
// re-planning there would do the work twice and make the scene jump. The interim state — a deep top
// with nothing under it — is accepted as transient, and S1's middle step below records it as a fact
// rather than as an omission.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  paletteFinish,
  KITCHEN_L_DESIGN,
  type Column,
  type Design,
  type DesignPlacement,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  unexplainedColumns,
  unexplainedStoredEntries,
} from "../support/frozen-source-invariant";

const OCCURRED_AT = "2026-09-08T12:00:00.000Z";

/** The two declared depths, read from the declaration rather than written twice (ADR 0058
 *  decision 2). Named so the assertions below read as "at the shallow kitchen" and "at the deep
 *  one" instead of as two magic numbers. */
const SHALLOW_MM = Math.min(...declaredCabinetDepthsMm());
const DEEP_MM = Math.max(...declaredCabinetDepthsMm());

/** The deep top on wall B and the full-height cabinet under it — the pair the owner reported. */
const DEEP_TOP = "p23";
const FULL_HEIGHT_UNDER_IT = "p6";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type Store = ReturnType<typeof createStore>;

function remove(store: Store, placementId: string): Store {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
  expect(store.getState().lastRejection, `remove ${placementId}`).toBeNull();
  return store;
}

/** **A no-op where the design is already at that depth**, deliberately: `setCabinetDepth` at the
 *  current setting is the round-trip *oracle* below, and running it as a fixture step would build
 *  the state this wave is measured against out of the very command it must not be implemented by. */
function setDepth(store: Store, cabinetDepthMm: number): Store {
  if (cabinetDepthMmOf(store.getState().design) === cabinetDepthMm)
    return store;
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `setCabinetDepth ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

/** Inserts through the **offer list's own opening** — the void the store publishes at that column
 *  and level — so every state here is a route a customer has, and `lastRejection === null` is
 *  asserted rather than hoped for. */
function insertAt(
  store: Store,
  wallBAlongM: number,
  y0M: number,
  buildId: string,
): Store {
  const opening = store
    .getState()
    .voids.filter((record) => record.wall === "B")
    .filter((record) => Math.abs(record.y0 - y0M) < 0.02)
    .find((record) => Math.abs(record.z + record.w / 2 - wallBAlongM) < 0.6);
  if (!opening) throw new Error(`no opening at B ${String(wallBAlongM)}`);
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert(buildId);
  expect(store.getState().lastRejection, `insert ${buildId}`).toBeNull();
  return store;
}

function placement(store: Store, placementId: string): DesignPlacement {
  const found = store
    .getState()
    .design.placements.find((candidate) => candidate.id === placementId);
  if (!found) throw new Error(`no placement ${placementId}`);
  return found;
}

/** The body's persisted seat, its `buildId` and the band it derives — the three facts ADR 0103's
 *  criteria name together, asserted together so a right seat under a migrated identity cannot pass. */
function seatedAs(store: Store, placementId: string) {
  const record = store
    .getState()
    .records.find((candidate) => candidate.id === placementId);
  return {
    seatDepthMm: placement(store, placementId).body.seatDepthMm,
    buildId: placement(store, placementId).body.buildId,
    band: record?.band,
  };
}

/** Where wall B's deep-top column stands, which moves with the setting: ADR 0089's corner slide puts
 *  the run 100 mm further along at the deeper kitchen. Read off the record rather than written as
 *  two literals, so the fixture and this file cannot disagree about it. */
function alongWallMOf(store: Store, placementId: string): number {
  return placement(store, placementId).alongMm / 1000;
}

/** Every extent the store publishes, and every source the document records — the whole of ADR 0103
 *  decision 9's "no published extent moves" criterion in one comparable value: every `Column.d`,
 *  every `Column.w`, every column key and every `depthFromBuildId`.
 *
 *  **`hasFullHeightUnder` is deliberately not in it.** It is not an extent: ADR 0011 Gap D makes it
 *  a fact about *now*, re-answered by every derivation, and inserting a full-height body under a
 *  standing top is precisely what flips it. Folding it in here would assert that S2 cannot happen. */
function publishedExtents(store: Store) {
  return {
    columns: [...store.getState().columns.entries()]
      .map(([key, column]: [string, Column]) =>
        [key, Math.round(column.d * 1000), Math.round(column.w * 1000)].join(
          " ",
        ),
      )
      .sort(),
    stored: [
      ...(store.getState().design.columnExtents ?? []),
      ...(store.getState().design.emptyColumns ?? []),
    ]
      .map((entry) =>
        [
          entry.wall,
          entry.alongMm,
          entry.y0Mm,
          entry.depthMm,
          entry.depthFromBuildId ?? "-",
        ].join(" "),
      )
      .sort(),
  };
}

/** S1 — the case the owner reported first. Delete the full-height cabinet under the deep top, then
 *  put an **ordinary** one back. */
function s1(cabinetDepthMm: number): Store {
  const store = setDepth(createStore(), cabinetDepthMm);
  remove(store, FULL_HEIGHT_UNDER_IT);
  return insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");
}

/** S2 — a shallow top with a **full-height** cabinet put under it. */
function s2(): Store {
  const store = createStore();
  remove(store, FULL_HEIGHT_UNDER_IT);
  setDepth(store, DEEP_MM);
  return insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "tall-pantry");
}

/** S4 — the column emptied, then filled from the top down. Returns the store after the top alone. */
function s4EmptiedThenTopped(): Store {
  const store = setDepth(createStore(), DEEP_MM);
  const alongM = alongWallMOf(store, DEEP_TOP);
  remove(store, FULL_HEIGHT_UNDER_IT);
  remove(store, DEEP_TOP);
  return insertAt(store, alongM, 2.2, "wall-cabinet");
}

describe("a standing body follows what is put under it", () => {
  // The owner's own case, and the one a `hasFullHeightUnder` flip cannot see: the flag is `false`
  // before this insert and `false` after it. A test asserting only S2 would pass against the
  // flip-triggered design ADR 0103 decision 3 rejects on the measurement.
  it("shallows the deep top out when a regular cabinet goes under it, at the shallow kitchen", () => {
    const store = s1(SHALLOW_MM);
    expect(seatedAs(store, DEEP_TOP)).toEqual({
      seatDepthMm: 291,
      buildId: "wall-cabinet",
      band: "wall",
    });
  });

  it("shallows the deep top out when a regular cabinet goes under it, at the deep kitchen", () => {
    const store = s1(DEEP_MM);
    expect(seatedAs(store, DEEP_TOP)).toEqual({
      seatDepthMm: 361,
      buildId: "wall-cabinet",
      band: "wall",
    });
  });

  it("leaves the standing top alone on the delete, and moves it on the insert", () => {
    // ADR 0103 decision 2's asymmetry, asserted as the two halves of one sequence rather than
    // described in a comment. The middle state is the transient the owner accepted.
    const store = setDepth(createStore(), DEEP_MM);
    expect(seatedAs(store, DEEP_TOP).seatDepthMm).toBe(661);

    remove(store, FULL_HEIGHT_UNDER_IT);
    expect(seatedAs(store, DEEP_TOP).seatDepthMm).toBe(661);

    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");
    expect(seatedAs(store, DEEP_TOP).seatDepthMm).toBe(361);
  });

  it("deepens a shallow top when a full-height cabinet goes under it", () => {
    expect(seatedAs(s2(), DEEP_TOP)).toEqual({
      seatDepthMm: 661,
      buildId: "wall-cabinet",
      band: "wall",
    });
  });

  it("deepens a top inserted into an emptied column once a full-height cabinet joins it", () => {
    const store = s4EmptiedThenTopped();
    const top = store.getState().design.placements.at(-1)?.id ?? "";
    expect(seatedAs(store, top).seatDepthMm).toBe(361);

    insertAt(store, alongWallMOf(store, top), 0, "tall-pantry");
    expect(seatedAs(store, top).seatDepthMm).toBe(661);
  });
});

describe("the three states that are already right, and must not move", () => {
  it("keeps a top inserted over a standing full-height cabinet at the lifted depth", () => {
    const store = setDepth(createStore(), DEEP_MM);
    const alongM = alongWallMOf(store, DEEP_TOP);
    remove(store, DEEP_TOP);
    insertAt(store, alongM, 2.2, "wall-cabinet");

    const inserted = store.getState().design.placements.at(-1)?.id ?? "";
    expect(seatedAs(store, inserted).seatDepthMm).toBe(661);
  });

  it("keeps the capped default when nothing stands below the top yet", () => {
    const store = s4EmptiedThenTopped();
    const top = store.getState().design.placements.at(-1)?.id ?? "";
    expect(seatedAs(store, top).seatDepthMm).toBe(361);
  });

  // The no-op, and it is asserted by **reference equality**: a re-plan that rewrites a body it did
  // not move would pass a value comparison and is exactly what ADR 0103's criterion names.
  it("passes an unchanged top through by identity when a regular cabinet joins it", () => {
    const store = s4EmptiedThenTopped();
    const topId = store.getState().design.placements.at(-1)?.id ?? "";
    const before = placement(store, topId);

    insertAt(store, alongWallMOf(store, topId), 0, "base-cabinet");

    expect(seatedAs(store, topId).seatDepthMm).toBe(361);
    expect(placement(store, topId)).toBe(before);
  });
});

describe("the re-plan reproduces what a no-op depth round trip already produces", () => {
  // **The oracle, and never the mechanism** (ADR 0103's alternatives). Calling `setCabinetDepth` at
  // the current setting produces the right answer for these members and does a great deal else —
  // it slides wall B's run, re-takes §3.2's MAX and republishes the frozen map — which is why the
  // wave reuses `rebuild` instead. Asserted as an equality between two states this test builds,
  // rather than as two literals that happen to agree.
  const roundTripped = (store: Store, otherDepthMm: number): Store =>
    setDepth(setDepth(store, otherDepthMm), DEEP_MM);

  it("writes S1's seat where the round trip writes it", () => {
    const replanned = s1(DEEP_MM);
    const oracle = roundTripped(s1(DEEP_MM), SHALLOW_MM);

    expect(seatedAs(replanned, DEEP_TOP).seatDepthMm).toBe(
      seatedAs(oracle, DEEP_TOP).seatDepthMm,
    );
  });

  it("writes S2's seat where the round trip writes it", () => {
    const replanned = s2();
    const oracle = roundTripped(s2(), SHALLOW_MM);

    expect(seatedAs(replanned, DEEP_TOP).seatDepthMm).toBe(
      seatedAs(oracle, DEEP_TOP).seatDepthMm,
    );
  });
});

describe("no published extent moves", () => {
  // ADR 0103 decision 9, in its falsifiable form: the wave moves member seats and build ids, and it
  // moves no extent. The comparison is the map **before** the insert against the map after it — the
  // insert publishes `splitColumn`'s own map, and nothing in the re-plan may touch it.
  it.each([
    { label: `S1 @${String(SHALLOW_MM)}`, depthMm: SHALLOW_MM },
    { label: `S1 @${String(DEEP_MM)}`, depthMm: DEEP_MM },
  ])(
    "$label publishes the extents it published before the insert",
    ({ depthMm }) => {
      const store = setDepth(createStore(), depthMm);
      remove(store, FULL_HEIGHT_UNDER_IT);
      const before = publishedExtents(store);

      insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");

      expect(publishedExtents(store)).toEqual(before);
    },
  );

  it("S2 publishes the extents it published before the insert", () => {
    const store = createStore();
    remove(store, FULL_HEIGHT_UNDER_IT);
    setDepth(store, DEEP_MM);
    const before = publishedExtents(store);

    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "tall-pantry");

    expect(publishedExtents(store)).toEqual(before);
  });
});

describe("the frozen-source readings, enumerated across the wave's states", () => {
  // ADR 0103 decision 10. Wave 6Y owns these helpers and this wave edits neither them nor the
  // witness that drives them; what it owes is the enumeration, so a reading that *starts* being
  // reported is caught as a defect in this wave.
  //
  // **One state stops being reported, and it is expected**: after a full-height cabinet joins a
  // capped top, that top's seat becomes exactly the lifted arm's answer, so ADR 0102 decision 3a's
  // narrowed exemption begins to apply where it did not. Recorded here rather than edited away.
  const readingsOf = (store: Store) => [
    ...unexplainedColumns(store.getState()),
    ...unexplainedStoredEntries(store.getState().design),
  ];

  it.each([
    { label: "S1 shallow", build: () => s1(SHALLOW_MM), expected: 0 },
    { label: "S1 deep", build: () => s1(DEEP_MM), expected: 2 },
    { label: "S2", build: () => s2(), expected: 0 },
    { label: "S4 top only", build: s4EmptiedThenTopped, expected: 2 },
  ])("$label reports $expected", ({ build, expected }) => {
    expect(readingsOf(build())).toHaveLength(expected);
  });

  it("stops reporting S4's column once a full-height cabinet stands under the top", () => {
    const store = s4EmptiedThenTopped();
    const top = store.getState().design.placements.at(-1)?.id ?? "";
    expect(readingsOf(store)).toHaveLength(2);

    insertAt(store, alongWallMOf(store, top), 0, "tall-pantry");

    expect(readingsOf(store)).toEqual([]);
  });
});

describe("a re-plan writes no colour", () => {
  // ADR 0103 decision 6 and ADR 0099 decision 2. **Key presence, never a rendered colour**: an
  // assertion on the resolved value passes while the key is being stamped, which is the failure
  // ADR 0099 Amendment A records from a sibling defect. Run with a global finish that differs from
  // the material's default, so a stamp would be visible.
  const GLOBAL_COLOUR = paletteFinish("pal.antracit");
  const CHOSEN_COLOUR = paletteFinish("pal.stejar-bardolino");

  const withGlobalFinish = (): Design => ({
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, finish: GLOBAL_COLOUR },
  });

  it("leaves a top that carried no finish carrying no finish key at all", () => {
    const store = setDepth(createStore(withGlobalFinish()), DEEP_MM);
    expect("finish" in placement(store, DEEP_TOP).body).toBe(false);

    remove(store, FULL_HEIGHT_UNDER_IT);
    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");

    expect(seatedAs(store, DEEP_TOP).seatDepthMm).toBe(361);
    expect("finish" in placement(store, DEEP_TOP).body).toBe(false);
  });

  it("carries a chosen finish across the re-plan with the identical value", () => {
    const store = setDepth(createStore(withGlobalFinish()), DEEP_MM);
    store.getState().select({ kind: "placement", id: DEEP_TOP });
    store.getState().setFinish(CHOSEN_COLOUR);
    expect(store.getState().lastRejection).toBeNull();
    const chosen = placement(store, DEEP_TOP).body.finish;
    expect(chosen).toBeDefined();

    remove(store, FULL_HEIGHT_UNDER_IT);
    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");

    expect(seatedAs(store, DEEP_TOP).seatDepthMm).toBe(361);
    expect(placement(store, DEEP_TOP).body.finish).toEqual(chosen);
  });
});
