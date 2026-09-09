// **Adversarial QA on wave 6Z at the store seam** — ADR 0103 decisions 2, 3, 6 and 9, attacked from
// the sides the wave's own suite does not enter: the §5.3 swap, the delete/insert round trip, the
// commands that must *not* re-plan, and the two declared settings with a setting change in between.
//
// Everything here is driven through the ordinary store on `KITCHEN_L_DESIGN`, through the offer
// list's own openings, so every state is a route a customer has.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  columnBuildDepthMm,
  declaredCabinetDepthsMm,
  paletteFinish,
  KITCHEN_L_BODY_CATALOG,
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

/** The deep top on wall B and the full-height cabinet under it — the pair the owner reported. */
const DEEP_TOP = "p23";
const FULL_HEIGHT_UNDER_IT = "p6";

/** The row every re-plannable body in this column resolves to (ADR 0022), and the front assembly its
 *  entry declares. Both seats below are `columnBuildDepthMm` less that assembly, so nothing in this
 *  file is a depth literal and a third declared depth sweeps for free (ADR 0058 decision 2). */
const REPLANNED_BUILD_ID = "wall-cabinet";
const FRONT_ASSEMBLY_MM = frontAssemblyOf(REPLANNED_BUILD_ID);

function frontAssemblyOf(buildId: string): number {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`the suite needs ${buildId}`);
  // A `wall-plane` row states a finished depth outright and has no front assembly to subtract — and
  // is excluded from the re-plan for exactly that reason (ADR 0103 decision 4 point 3), so reading
  // one here would mean this suite is measuring a body the wave never touches.
  const rule = definition.occupiedDepth;
  if (rule.measuredFrom !== "recorded-shell") {
    throw new Error(`${buildId} is not a recorded-shell entry`);
  }
  return rule.frontAssemblyMm;
}

/** The seat the column decides for a wall carcass, lifted or capped — `resolveDepthM`'s two arms
 *  expressed through the one declaration they both read. */
function seatTheColumnDecides(
  cabinetDepthMm: number,
  hasFullHeightUnder: boolean,
): number {
  return (
    columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder }) -
    FRONT_ASSEMBLY_MM
  );
}

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

function setDepth(store: Store, cabinetDepthMm: number): Store {
  if (cabinetDepthMmOf(store.getState().design) === cabinetDepthMm) {
    return store;
  }
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `setCabinetDepth ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

/** Inserts through the void the store publishes at that column and level, so `lastRejection` being
 *  null is asserted rather than hoped for. Returns the id the insert wrote. */
function insertAt(
  store: Store,
  wallBAlongM: number,
  y0M: number,
  buildId: string,
): string {
  const opening = store
    .getState()
    .voids.filter((record) => record.wall === "B")
    .filter((record) => Math.abs(record.y0 - y0M) < 0.02)
    .find((record) => Math.abs(record.z + record.w / 2 - wallBAlongM) < 0.6);
  if (!opening) throw new Error(`no opening at B ${String(wallBAlongM)}`);
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert(buildId);
  expect(store.getState().lastRejection, `insert ${buildId}`).toBeNull();
  return lastPlacementId(store);
}

/** §5.3's route: the customer taps a standing body and picks another one, and the command replaces
 *  it in place. It reaches `insertBody` exactly as an insert into an opening does, so it reaches the
 *  dependent re-plan — which is the half this file is here to check. */
function swapInPlace(
  store: Store,
  placementId: string,
  buildId: string,
): string {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().insert(buildId);
  expect(
    store.getState().lastRejection,
    `swap ${placementId} for ${buildId}`,
  ).toBeNull();
  return lastPlacementId(store);
}

function lastPlacementId(store: Store): string {
  const id = store.getState().design.placements.at(-1)?.id;
  if (id === undefined) throw new Error("the command wrote no placement");
  return id;
}

function placement(store: Store, placementId: string): DesignPlacement {
  const found = store
    .getState()
    .design.placements.find((candidate) => candidate.id === placementId);
  if (!found) throw new Error(`no placement ${placementId}`);
  return found;
}

/** **The seat the body actually stands at, read off the derived record rather than off the stored
 *  placement.** A freshly loaded fixture carries no `seatDepthMm` at all — the field is written by
 *  the first command that builds the body — so a test that compared the persisted field would find
 *  `undefined` at the shallow setting and could not state a before/after at all. `frame.d` is the
 *  same quantity `frozen-source-invariant.ts` compares a lifted seat against. */
function seatMmOf(store: Store, placementId: string): number {
  const record = store
    .getState()
    .records.find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record ${placementId}`);
  return Math.round(record.frame.d * 1000);
}

function alongWallMOf(store: Store, placementId: string): number {
  return placement(store, placementId).alongMm / 1000;
}

/** Every extent the store publishes and every source the document records, as one comparable value —
 *  ADR 0103 decision 9's "no published extent moves" criterion. `hasFullHeightUnder` is deliberately
 *  absent: it is a fact about now, not an extent, and the whole point of these commands is to flip
 *  it. */
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

/** The published column keys, **other than its own**, that a placed body's span reaches into along
 *  its own wall. The same geometry `overlapsAlongWall` reads, written out here off the published
 *  record and map so the assertion states a fact about the kitchen rather than re-using the
 *  function under test. */
function columnsTheBodyReachesInto(
  store: Store,
  placementId: string,
): readonly string[] {
  const record = store
    .getState()
    .records.find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record ${placementId}`);
  const start = record.wall === "A" ? record.frame.x : record.frame.z;
  const end = start + record.frame.w;
  return [...store.getState().columns.entries()]
    .filter(([key, column]) => {
      if (key === record.col || column.wall !== record.wall) return false;
      const columnStart = column.wall === "A" ? column.x : column.z;
      return (
        Math.min(end, columnStart + column.w) - Math.max(start, columnStart) > 0
      );
    })
    .map(([key]) => key);
}

/** The names of the columns the store publishes, sorted — the key space on its own, apart from the
 *  extents `publishedExtents` carries with it, because a slide is expected to rename every one of
 *  them and what must not change is how many there are. */
function publishedColumnKeys(store: Store): readonly string[] {
  return [...store.getState().columns.keys()].sort();
}

/** Every body whose derived column is a key the published map does not hold — the shape a key
 *  collision leaves behind once two columns have merged into one name. */
function recordsAddressingNoColumn(store: Store): readonly string[] {
  const published = new Set(store.getState().columns.keys());
  return store
    .getState()
    .records.filter((record) => !published.has(record.col))
    .map((record) => `${record.id}@${record.col}`);
}

/** Wave 6Y's two instruments, read as one list. ADR 0103 decision 10 owes the enumeration; this file
 *  asserts the **lines**, not the count, so a reading that is swapped for another of the same length
 *  is caught too. */
function frozenSourceReadings(store: Store): readonly string[] {
  return [
    ...unexplainedColumns(store.getState()),
    ...unexplainedStoredEntries(store.getState().design),
  ];
}

const DECLARED_DEPTHS = declaredCabinetDepthsMm();

describe("the §5.3 swap reaches the re-plan, at every declared setting", () => {
  // The wave's own store suite only ever inserts into an opening. A swap in place is the same code
  // path (`insertBody`, DEVELOPMENT-SPEC §5.3) and is the shortest tap sequence a customer has for
  // the owner's S1: select the full-height cabinet, pick an ordinary one. No delete in between.
  it.each(DECLARED_DEPTHS.map((cabinetDepthMm) => ({ cabinetDepthMm })))(
    "caps the standing top when the full-height cabinet is swapped for an ordinary one at $cabinetDepthMm",
    ({ cabinetDepthMm }) => {
      const store = setDepth(createStore(), cabinetDepthMm);
      expect(seatMmOf(store, DEEP_TOP)).toBe(
        seatTheColumnDecides(cabinetDepthMm, true),
      );

      swapInPlace(store, FULL_HEIGHT_UNDER_IT, "base-cabinet");

      expect(seatMmOf(store, DEEP_TOP)).toBe(
        seatTheColumnDecides(cabinetDepthMm, false),
      );
      expect(placement(store, DEEP_TOP).body.buildId).toBe(REPLANNED_BUILD_ID);
    },
  );

  it.each(DECLARED_DEPTHS.map((cabinetDepthMm) => ({ cabinetDepthMm })))(
    "publishes at $cabinetDepthMm the extents it published before the swap",
    ({ cabinetDepthMm }) => {
      // The snapshot is taken **after one unrelated command on the other wall**, because a freshly
      // loaded design carries no `columnExtents` at all — `projectFrozenMap` writes the whole map on
      // whatever command comes first, and comparing a map against its own absence would measure that
      // projection rather than the swap.
      const store = setDepth(createStore(), cabinetDepthMm);
      remove(store, "p1");
      const before = publishedExtents(store);
      expect(before.stored.length).toBeGreaterThan(0);

      swapInPlace(store, FULL_HEIGHT_UNDER_IT, "base-cabinet");

      expect(publishedExtents(store)).toEqual(before);
      // Non-vacuity: the swap did move the standing top, so the equality above is a statement about
      // a command that did something (ADR 0093 decision 1).
      expect(seatMmOf(store, DEEP_TOP)).toBe(
        seatTheColumnDecides(cabinetDepthMm, false),
      );
    },
  );

  it.each(DECLARED_DEPTHS.map((cabinetDepthMm) => ({ cabinetDepthMm })))(
    "reports at $cabinetDepthMm the frozen-source readings the delete route already reports",
    ({ cabinetDepthMm }) => {
      // ADR 0103 decision 10 owes an enumeration of what wave 6Y's instruments say in the states this
      // wave reaches. The wave's own suite enumerates the delete-then-insert route; the swap reaches
      // the **same end state** by a different tap, so the two must read alike. Asserted as the lines
      // rather than as their count, so a reading swapped for another of the same length is caught.
      const bySwap = setDepth(createStore(), cabinetDepthMm);
      swapInPlace(bySwap, FULL_HEIGHT_UNDER_IT, "base-cabinet");

      const byDelete = setDepth(createStore(), cabinetDepthMm);
      remove(byDelete, FULL_HEIGHT_UNDER_IT);
      insertAt(byDelete, alongWallMOf(byDelete, DEEP_TOP), 0, "base-cabinet");

      expect(frozenSourceReadings(bySwap)).toEqual(
        frozenSourceReadings(byDelete),
      );
      // Non-vacuity in both directions: the two routes really did reach the same re-planned state,
      // and they are being compared on a state the re-plan wrote.
      expect(seatMmOf(bySwap, DEEP_TOP)).toBe(seatMmOf(byDelete, DEEP_TOP));
      expect(seatMmOf(bySwap, DEEP_TOP)).toBe(
        seatTheColumnDecides(cabinetDepthMm, false),
      );
    },
  );
});

describe("the re-plan does not accumulate across a delete and a re-insert", () => {
  // ADR 0103 decision 2's asymmetry, driven far enough to catch a re-plan that adds rather than
  // decides: a delete re-plans nothing, so the top holds whatever the last insert gave it, and the
  // same insert repeated writes the same seat rather than a deeper one each time.
  it.each(DECLARED_DEPTHS.map((cabinetDepthMm) => ({ cabinetDepthMm })))(
    "returns the top to one seat however many times the body below is replaced at $cabinetDepthMm",
    ({ cabinetDepthMm }) => {
      const store = setDepth(createStore(), cabinetDepthMm);
      const alongM = alongWallMOf(store, DEEP_TOP);
      const capped = seatTheColumnDecides(cabinetDepthMm, false);
      const lifted = seatTheColumnDecides(cabinetDepthMm, true);

      remove(store, FULL_HEIGHT_UNDER_IT);
      const seats: number[] = [seatMmOf(store, DEEP_TOP)];
      for (let round = 0; round < 3; round += 1) {
        const ordinary = insertAt(store, alongM, 0, "base-cabinet");
        seats.push(seatMmOf(store, DEEP_TOP));
        remove(store, ordinary);
        seats.push(seatMmOf(store, DEEP_TOP));
        const full = insertAt(store, alongM, 0, "tall-pantry");
        seats.push(seatMmOf(store, DEEP_TOP));
        remove(store, full);
        seats.push(seatMmOf(store, DEEP_TOP));
      }

      // Read the sequence rather than only its last term: the delete holds, and each insert writes
      // the seat the column decides — never a drifting one.
      expect(seats).toEqual([
        lifted,
        capped,
        capped,
        lifted,
        lifted,
        capped,
        capped,
        lifted,
        lifted,
        capped,
        capped,
        lifted,
        lifted,
      ]);
    },
  );

  it("leaves the whole design byte-identical when the same taps are replayed", () => {
    const play = (): Design => {
      const store = setDepth(createStore(), Math.max(...DECLARED_DEPTHS));
      remove(store, FULL_HEIGHT_UNDER_IT);
      insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");
      return store.getState().design;
    };

    const first = play();
    expect(JSON.stringify(play())).toBe(JSON.stringify(first));
    // Non-vacuity: the replayed document is one the re-plan actually wrote to.
    expect(
      first.placements.find((candidate) => candidate.id === DEEP_TOP)?.body
        .seatDepthMm,
    ).toBe(seatTheColumnDecides(Math.max(...DECLARED_DEPTHS), false));
  });
});

describe("an insert into a column with nothing re-plannable over it writes nothing else", () => {
  // ADR 0103 decision 3's pass-through by identity, asserted over the **whole document** rather than
  // over one placement: an insert that re-plans nothing must leave every other placement the same
  // object, not merely an equal one.
  it.each(DECLARED_DEPTHS.map((cabinetDepthMm) => ({ cabinetDepthMm })))(
    "passes every standing placement through by reference at $cabinetDepthMm",
    ({ cabinetDepthMm }) => {
      const store = setDepth(createStore(), cabinetDepthMm);
      remove(store, "p1");
      const before = store.getState().design.placements;

      store.getState().select({
        kind: "void",
        id:
          store
            .getState()
            .voids.find(
              (record) =>
                record.wall === "A" && record.y0 < 0.01 && record.w > 0.55,
            )?.id ?? "",
      });
      store.getState().insert("base-cabinet");
      expect(store.getState().lastRejection).toBeNull();

      const after = store.getState().design.placements;
      const rewritten = after.filter(
        (candidate) =>
          !before.some((original) => Object.is(original, candidate)),
      );

      // Exactly one object in the document is new, and it is the body the customer asked for.
      expect(rewritten.map((candidate) => candidate.id)).toEqual([
        lastPlacementId(store),
      ]);
      expect(before.length).toBe(after.length - 1);
    },
  );

  // **The overlap clause is live on the shipped kitchen, and this records that it is** — because the
  // easy reading of its 786/24 offer sweep is that it never fires here, and that reading is wrong in
  // a way that would invite deleting the clause.
  //
  // Overhanging is not "being wider than your own column". Wall A's wall-band and base-band extents
  // overlap **each other**: `A|0.30` runs 300–900 and `A|0.45` runs 450–1350. So an ordinary
  // `wall-cabinet` that exactly fills `A|0.30` still reaches 450 mm into `A|0.45` and 150 mm into
  // `A|0.75`, and the clause adds both keys to the affected set on a tap any customer has.
  //
  // The sweep stays at 24 not because nothing is added but because nothing added needs to move: the
  // bodies standing in those columns are already at the depth their column decides, so `replanOne`
  // passes them through by identity. That is the fix's own claim — *"widening the set costs nothing
  // where nothing moved"* — and this is where it is measured rather than asserted in a comment.
  it("reaches across into neighbouring columns and still writes none of them", () => {
    const store = createStore();
    remove(store, "p8");
    const before = store.getState().design.placements;

    store.getState().select({
      kind: "void",
      id:
        store
          .getState()
          .voids.filter(
            (record) => record.wall === "A" && Math.abs(record.y0 - 1.5) < 0.02,
          )
          .sort((left, right) => left.x - right.x)[0]?.id ?? "",
    });
    store.getState().insert("wall-cabinet");
    expect(store.getState().lastRejection).toBeNull();

    // The geometry the clause reads, measured off the published record and map rather than taken
    // from the command — so this states a fact about the kitchen, not about the implementation.
    const placedId = lastPlacementId(store);
    const overhung = columnsTheBodyReachesInto(store, placedId);
    expect(overhung.length).toBeGreaterThan(0);

    // And every one of them comes through untouched, by reference.
    const after = store.getState().design.placements;
    const rewritten = after.filter(
      (candidate) => !before.some((original) => Object.is(original, candidate)),
    );
    expect(rewritten.map((candidate) => candidate.id)).toEqual([placedId]);
  });
});

describe("the commands that must not re-plan", () => {
  // ADR 0103 decision 2 names one trigger and one only: a successful insert. A width resize rebuilds
  // the members of the column it resizes (ADR 0031) and must not acquire the dependent re-plan while
  // it is in there — the wave's own file comment says there is to be no mirror of it.
  it("moves no depth when the full-height member under the top is resized", () => {
    const deepest = Math.max(...DECLARED_DEPTHS);
    const store = setDepth(createStore(), deepest);
    const lifted = seatTheColumnDecides(deepest, true);
    expect(seatMmOf(store, DEEP_TOP)).toBe(lifted);
    const widthBefore = placement(store, DEEP_TOP).body.widthMm;

    store.getState().select({ kind: "placement", id: FULL_HEIGHT_UNDER_IT });
    store.getState().setWidth(500);
    expect(store.getState().lastRejection).toBeNull();

    // Non-vacuity: the resize *did* reach the standing top — it rebuilt it at the new column width —
    // so "the depth did not move" is a statement about a body the command wrote, not about one it
    // never looked at.
    expect(placement(store, DEEP_TOP).body.widthMm).toBe(500);
    expect(widthBefore).not.toBe(500);
    expect(seatMmOf(store, DEEP_TOP)).toBe(lifted);
  });

  it("moves no depth when a body is removed from under the top", () => {
    const deepest = Math.max(...DECLARED_DEPTHS);
    const store = setDepth(createStore(), deepest);
    const before = placement(store, DEEP_TOP);

    remove(store, FULL_HEIGHT_UNDER_IT);

    // Reference identity, so a delete that re-plans to the same number is caught as readily as one
    // that re-plans to a different one. Non-vacuity: the delete did change the column's own answer.
    expect(placement(store, DEEP_TOP)).toBe(before);
    expect(
      store.getState().columns.get(`B|${(before.alongMm / 1000).toFixed(2)}`)
        ?.hasFullHeightUnder,
    ).toBe(false);
  });

  // **Pre-existing behaviour, pinned here because it stands next door to the wave and reads like
  // its work.** `rebuild`'s own comment says a resize changes a width and nothing else — *"the level
  // slot, the span it belongs to and the depth are the opening this body already stands in"* — and
  // that is not what happens: the rebuild goes through `evaluateInsertFit`, so `resolveDepthM`
  // re-answers the depth of **the body being resized** from the column, and the transient a delete
  // left behind self-heals on a tap that has nothing to do with it.
  //
  // Reachable with no insert at all, so it is not wave 6Z's and this file does not treat it as a
  // defect. It is recorded because the number it produces is the number the re-plan produces, and a
  // later reader comparing the two will otherwise credit it to the wrong command.
  it.each(DECLARED_DEPTHS.map((cabinetDepthMm) => ({ cabinetDepthMm })))(
    "re-decides at $cabinetDepthMm the depth of the very top it resizes, with no insert involved",
    ({ cabinetDepthMm }) => {
      const store = setDepth(createStore(), cabinetDepthMm);
      remove(store, FULL_HEIGHT_UNDER_IT);
      expect(seatMmOf(store, DEEP_TOP)).toBe(
        seatTheColumnDecides(cabinetDepthMm, true),
      );

      store.getState().select({ kind: "placement", id: DEEP_TOP });
      store.getState().setWidth(500);
      expect(store.getState().lastRejection).toBeNull();

      expect(seatMmOf(store, DEEP_TOP)).toBe(
        seatTheColumnDecides(cabinetDepthMm, false),
      );
    },
  );
});

describe("a setting change after a re-plan still lands on the declared line", () => {
  // ADR 0103 decision 11 accepts that the identity migration is one-way. What must still hold is
  // that the migrated body follows the setting like any other `cabinet-depth` row — so the depth
  // command and the re-plan cannot come to disagree about where this top belongs.
  it.each(
    DECLARED_DEPTHS.flatMap((from) =>
      DECLARED_DEPTHS.filter((to) => to !== from).map((to) => ({ from, to })),
    ),
  )("carries the re-planned top from $from to $to", ({ from, to }) => {
    const store = setDepth(createStore(), from);
    remove(store, FULL_HEIGHT_UNDER_IT);
    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");
    expect(seatMmOf(store, DEEP_TOP)).toBe(seatTheColumnDecides(from, false));

    setDepth(store, to);

    expect(seatMmOf(store, DEEP_TOP)).toBe(seatTheColumnDecides(to, false));

    setDepth(store, from);

    expect(seatMmOf(store, DEEP_TOP)).toBe(seatTheColumnDecides(from, false));
  });

  // **The key slide, which is where a re-plan could quietly cost a column.** A depth change moves
  // wall B's runs by *different* amounts — ADR 0089's corner slide is the corner body's own depth
  // change, so the wall corner return travels 80 mm while everything past it travels 100 — and
  // `setCabinetDepth` has no key-collision guard of the kind a width resize carries. A re-plan that
  // moved a body along the wall, or that left one addressing a key nothing publishes, would show up
  // here and nowhere else: the seats would still be right.
  //
  // Measured across the slide, and it holds: the shipped kitchen and the re-planned kitchen both
  // keep twelve keys, every record resolves to one of them, and the round trip restores the names.
  it.each(
    DECLARED_DEPTHS.flatMap((from) =>
      DECLARED_DEPTHS.filter((to) => to !== from).map((to) => ({ from, to })),
    ),
  )(
    "loses no column when the re-planned kitchen slides from $from to $to and back",
    ({ from, to }) => {
      const store = setDepth(createStore(), from);
      remove(store, FULL_HEIGHT_UNDER_IT);
      insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "base-cabinet");
      const namesBefore = publishedColumnKeys(store);
      expect(recordsAddressingNoColumn(store)).toEqual([]);

      setDepth(store, to);

      // Two keys collapsing into one is a **shorter** list, and every body that lost its column is
      // named. Both are asserted, because a collision shows as one or the other depending on which
      // of the two chains arrives second.
      expect(publishedColumnKeys(store).length).toBe(namesBefore.length);
      expect(recordsAddressingNoColumn(store)).toEqual([]);
      // Non-vacuity: the slide really did happen, so the two assertions above are about a map that
      // moved rather than one that sat still.
      expect(publishedColumnKeys(store)).not.toEqual(namesBefore);

      setDepth(store, from);

      expect(publishedColumnKeys(store)).toEqual(namesBefore);
      expect(recordsAddressingNoColumn(store)).toEqual([]);
    },
  );
});

describe("a deepening re-plan writes no colour either", () => {
  // ADR 0099 decision 2 and ADR 0103 decision 6. `a-replan-does-not-record-the-drawn-colour.test.ts`
  // covers the **capping** direction; a rebuild is a rebuild, and the deepening direction — S2, a
  // full-height cabinet put under a shallow top — goes through the same `carriedAppearance` call and
  // was never run under a kitchen colour.
  const GLOBAL_COLOUR = paletteFinish("pal.antracit");
  const CHOSEN_COLOUR = paletteFinish("pal.stejar-bardolino");

  const underAKitchenColour = (): Design => ({
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, finish: GLOBAL_COLOUR },
  });

  /** S2: the top capped by a delete and a setting change, then a full-height cabinet put back under
   *  it, which is the re-plan running in the deepening direction. */
  const deepenedUnderAKitchenColour = (): Store => {
    const store = createStore(underAKitchenColour());
    remove(store, FULL_HEIGHT_UNDER_IT);
    setDepth(store, Math.max(...DECLARED_DEPTHS));
    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "tall-pantry");
    return store;
  };

  it("leaves a top that chose nothing carrying no finish key at all", () => {
    const store = deepenedUnderAKitchenColour();

    // Key presence, never the rendered value: a value assertion passes while the key is being
    // stamped (ADR 0103 decision 6).
    expect("finish" in placement(store, DEEP_TOP).body).toBe(false);
    expect(seatMmOf(store, DEEP_TOP)).toBe(
      seatTheColumnDecides(Math.max(...DECLARED_DEPTHS), true),
    );
  });

  it("carries a chosen finish across the deepening with the identical value", () => {
    const store = createStore(underAKitchenColour());
    store.getState().select({ kind: "placement", id: DEEP_TOP });
    store.getState().setFinish(CHOSEN_COLOUR);
    expect(store.getState().lastRejection).toBeNull();
    const chosen = placement(store, DEEP_TOP).body.finish;
    expect(chosen).toBeDefined();

    remove(store, FULL_HEIGHT_UNDER_IT);
    setDepth(store, Math.max(...DECLARED_DEPTHS));
    insertAt(store, alongWallMOf(store, DEEP_TOP), 0, "tall-pantry");

    expect(seatMmOf(store, DEEP_TOP)).toBe(
      seatTheColumnDecides(Math.max(...DECLARED_DEPTHS), true),
    );
    expect(placement(store, DEEP_TOP).body.finish).toEqual(chosen);
  });
});
