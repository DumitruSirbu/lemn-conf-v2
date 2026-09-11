// Adversarial QA on wave 7D1 — the composition shell (`buildLShellDesign`, ADR 0110 Amendment B)
// handed to the seam every later command runs through: the store's `applyCommandResult`, whose
// clip → split → merge funnel and frozen-map projection the domain tests of the shell never reach.
//
// The shell's own criteria are held in the domain. What only this seam can show is what happens
// **next**: a loaded shell's first commands re-project its frozen map through the funnel, an insert
// splits a tile, a depth change slides wall B — and wave 7D2 composes through exactly this path.
import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  canonicalSerializeDesign,
  CURRENT_SCHEMA_VERSION,
  declaredCabinetDepthsMm,
  deriveSlotBand,
  fatalDesignValidationIssues,
  KITCHEN_L_DESIGN,
  migrateDesign,
  offersFor,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignRoom,
  type DesignWall,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const BUILT_AT = "2026-09-11T12:00:00.000Z";
/** Later than the shell's own moment, so no command here can put the timestamps out of order. */
const COMMANDS_AT = "2026-09-11T13:00:00.000Z";

const SHELL_DEPTH_MM = 600;

const REFERENCE_ROOM: DesignRoom = { ...KITCHEN_L_DESIGN.room };
const SMALLEST_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 900,
  depthMm: 1000,
  heightMm: 2200,
};
/** Both walls one tile plus a 2 mm piece past their run's start, under a ceiling one millimetre
 *  short of the top row: the shell's narrowest tiles and its excluded corner piece at once. */
const ODD_EDGE_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 1702,
  depthMm: 1802,
  heightMm: 2599,
};
const LARGEST_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 6300,
  depthMm: 5100,
  heightMm: 3900,
};

const ROOMS = [REFERENCE_ROOM, SMALLEST_ROOM, ODD_EDGE_ROOM, LARGEST_ROOM];

/** **Not the shell's, and measured to be older than it.** A hood's 600 mm occupied depth reaches
 *  past wall B's corner return (330 mm in) when it hangs in the wall opening over wall A's corner,
 *  and the validator marks the corner extents it crosses (`RECORDED_SPAN_OVERLAPS_CORNER_BODY`, a
 *  mark by the owner's ruling of 2026-09-09). The seeded kitchen does the same: clear `p8` and
 *  `p15` and insert a hood in the opening they leave. Excused from the any-severity check below and
 *  still held to "no fatal finding"; composition never hangs a hood there (F2: over the hob). */
function isTheKnownCornerHood(opening: VoidRecord, buildId: string): boolean {
  return (
    buildId === "hood" &&
    opening.wall === "A" &&
    deriveSlotBand(opening) === "wall" &&
    openingEndMm(opening) <= cornerDepthOnWallAMm()
  );
}

function cornerDepthOnWallAMm(): number {
  const corner = KITCHEN_L_DESIGN.placements.find(
    (placement) => placement.body.buildId === "base-corner-x-900",
  );
  if (!corner) throw new Error("the seeded kitchen has no corner base");
  return corner.alongMm + corner.body.widthMm / 2;
}

function shellIn(room: DesignRoom): Design {
  return buildLShellDesign({ room, occurredAt: BUILT_AT });
}

/** The shell as the persistence adapter hands it back: through the wire and `migrateDesign`. */
function loadedShellIn(room: DesignRoom): Design {
  const stored: unknown = JSON.parse(JSON.stringify(shellIn(room)));
  return migrateDesign(CURRENT_SCHEMA_VERSION, stored);
}

function createStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => COMMANDS_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function findingsOf(store: Store): string[] {
  const { design, catalog } = store.getState();
  return validateDesignForCatalog(design, catalog).map(
    (issue) => `${issue.code}@${issue.path}`,
  );
}

function fatalFindingsOf(store: Store): string[] {
  const { design, catalog } = store.getState();
  return fatalDesignValidationIssues(
    validateDesignForCatalog(design, catalog),
  ).map((issue) => `${issue.code}@${issue.path}`);
}

function frozenMapOf(design: Design): string {
  return JSON.stringify({
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  });
}

function openingEndMm(opening: VoidRecord): number {
  const centreM = opening.wall === "A" ? opening.x : opening.z;
  return Math.round((centreM + opening.w / 2) * 1000);
}

function openingStartMm(opening: VoidRecord): number {
  const centreM = opening.wall === "A" ? opening.x : opening.z;
  return Math.round((centreM - opening.w / 2) * 1000);
}

function setDepth(store: Store, cabinetDepthMm: number): void {
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `depth ${String(cabinetDepthMm)}`,
  ).toBeNull();
}

function otherDepthsMm(): number[] {
  return declaredCabinetDepthsMm().filter(
    (depthMm) => depthMm !== SHELL_DEPTH_MM,
  );
}

/** Every opening the store publishes, each with the rows the panel would draw for it. */
function openingsWithOffers(store: Store) {
  const state = store.getState();
  return state.voids.map((opening) => ({
    opening,
    offered: offersFor({
      records: state.records,
      voids: state.voids,
      columns: state.recordedColumns,
      catalog: state.catalog,
      target: { kind: "void", id: opening.id },
      cabinetDepthMm: SHELL_DEPTH_MM,
    }).map((offer) => offer.buildId),
  }));
}

/** The opening of `store` at the same place `opening` stood in another store over the same design —
 *  found by geometry, since void ids are regenerated per derivation. */
function sameOpeningIn(store: Store, opening: VoidRecord): VoidRecord {
  const found = store
    .getState()
    .voids.find(
      (candidate) =>
        candidate.col === opening.col &&
        Math.abs(candidate.y0 - opening.y0) < 1e-6,
    );
  if (!found)
    throw new Error(`no opening at ${opening.col}@${String(opening.y0)}`);
  return found;
}

/** Greedy fill of one band of one wall: the nearest opening that accepts `buildId`, until none
 *  does. The shape of a run wave 7D2 composes, by the same command. */
function fillBand(
  store: Store,
  where: { readonly wall: DesignWall; readonly band: string },
  buildId: string,
): void {
  for (;;) {
    const candidates = store
      .getState()
      .voids.filter(
        (opening) =>
          opening.wall === where.wall && deriveSlotBand(opening) === where.band,
      )
      .sort((left, right) => openingStartMm(left) - openingStartMm(right));
    const placedOne = candidates.some((opening) => {
      const before = store.getState().design.placements.length;
      store.getState().select({ kind: "void", id: opening.id });
      store.getState().insert(buildId);
      return store.getState().design.placements.length > before;
    });
    if (!placedOne) return;
  }
}

function farEdgeOnWallMm(design: Design, wall: DesignWall): number {
  return Math.max(
    0,
    ...design.placements
      .filter((placement) => placement.wall === wall)
      .map((placement) => placement.alongMm + placement.body.widthMm / 2),
  );
}

describe("a loaded shell through the store's own seam", () => {
  it.each(ROOMS.map((room) => [JSON.stringify(room), room] as const))(
    "in %s, loads to the document it was built as and publishes nothing past a wall",
    (_name, room) => {
      const store = createStore(loadedShellIn(room));

      expect(canonicalSerializeDesign(store.getState().design)).toBe(
        canonicalSerializeDesign(shellIn(room)),
      );
      expect(findingsOf(store)).toStrictEqual([]);
      for (const opening of store.getState().voids) {
        expect(openingEndMm(opening)).toBeLessThanOrEqual(
          wallLengthMm(opening.wall, room),
        );
      }
    },
  );

  it.each(ROOMS.map((room) => [JSON.stringify(room), room] as const))(
    "in %s, keeps its frozen map through the store's funnel, a change to every declared depth and back",
    (_name, room) => {
      const store = createStore(loadedShellIn(room));
      const before = frozenMapOf(store.getState().design);
      expect(otherDepthsMm().length).toBeGreaterThan(0);

      for (const depthMm of otherDepthsMm()) {
        setDepth(store, depthMm);
        expect(findingsOf(store), `at ${String(depthMm)}`).toStrictEqual([]);
        setDepth(store, SHELL_DEPTH_MM);
        expect(findingsOf(store), "back").toStrictEqual([]);
      }

      expect(frozenMapOf(store.getState().design)).toBe(before);
    },
  );
});

describe("every body the panel offers in a shell opening, tapped through the store", () => {
  it.each(ROOMS.map((room) => [JSON.stringify(room), room] as const))(
    "in %s, is placed, marks nothing, and still marks nothing after every declared depth and back",
    (_name, room) => {
      const loaded = loadedShellIn(room);
      const listed = openingsWithOffers(createStore(loaded));
      const failures: string[] = [];
      let taps = 0;

      for (const { opening, offered } of listed) {
        for (const buildId of offered) {
          taps += 1;
          const store = createStore(loaded);
          store.getState().select({
            kind: "void",
            id: sameOpeningIn(store, opening).id,
          });
          store.getState().insert(buildId);
          const where = `${opening.col}@${String(opening.y0)} ${buildId}`;
          const rejection = store.getState().lastRejection;
          if (rejection) {
            failures.push(`${where}: refused ${rejection.code}`);
            continue;
          }
          const judge = isTheKnownCornerHood(opening, buildId)
            ? fatalFindingsOf
            : findingsOf;
          const found = [...judge(store)];
          for (const depthMm of otherDepthsMm()) {
            setDepth(store, depthMm);
            found.push(...judge(store).map((f) => `@${String(depthMm)} ${f}`));
            setDepth(store, SHELL_DEPTH_MM);
            found.push(...judge(store).map((f) => `back ${f}`));
          }
          if (found.length > 0) failures.push(`${where}: ${found.join(", ")}`);
        }
      }

      expect(taps).toBeGreaterThan(0);
      expect(failures).toStrictEqual([]);
    },
  );
});

describe("a run filled flush to the shell's planned end, then deepened", () => {
  it.each(ROOMS.map((room) => [JSON.stringify(room), room] as const))(
    "in %s, stays inside wall B at every declared depth with no mark (ADR 0110 B3, F7)",
    (_name, room) => {
      const store = createStore(loadedShellIn(room));
      fillBand(store, { wall: "B", band: "base" }, "base-cabinet");
      fillBand(store, { wall: "B", band: "wall" }, "wall-cabinet");
      fillBand(store, { wall: "A", band: "base" }, "base-cabinet");
      expect(findingsOf(store)).toStrictEqual([]);

      for (const depthMm of otherDepthsMm()) {
        setDepth(store, depthMm);
        const { design } = store.getState();
        expect(findingsOf(store), `at ${String(depthMm)}`).toStrictEqual([]);
        expect(farEdgeOnWallMm(design, "B")).toBeLessThanOrEqual(
          wallLengthMm("B", room),
        );
        setDepth(store, SHELL_DEPTH_MM);
      }
    },
  );

  it("fills wall B of the reference room to the reserve exactly, and the deeper corner takes it", () => {
    const store = createStore(loadedShellIn(REFERENCE_ROOM));
    fillBand(store, { wall: "B", band: "base" }, "base-cabinet");
    const at600 = farEdgeOnWallMm(store.getState().design, "B");

    setDepth(store, Math.max(...declaredCabinetDepthsMm()));

    expect(at600).toBeLessThan(wallLengthMm("B", REFERENCE_ROOM));
    expect(farEdgeOnWallMm(store.getState().design, "B")).toBe(
      wallLengthMm("B", REFERENCE_ROOM),
    );
  });
});

describe("criterion 4's 600 mm sink, which a fit-width body cannot take by insertion alone", () => {
  it.each(["A", "B"] as const)(
    "is reached on wall %s by inserting a sink base and resizing it to 600",
    (wall) => {
      const store = createStore(loadedShellIn(REFERENCE_ROOM));
      const first = store
        .getState()
        .voids.filter(
          (opening) =>
            opening.wall === wall && deriveSlotBand(opening) === "base",
        )
        .sort((left, right) => openingStartMm(left) - openingStartMm(right))[0];
      if (!first) throw new Error(`no base opening on wall ${wall}`);

      store.getState().select({ kind: "void", id: first.id });
      store.getState().insert("base-sink");
      expect(store.getState().lastRejection).toBeNull();
      store.getState().setWidth(600);

      expect(store.getState().lastRejection).toBeNull();
      expect(
        store
          .getState()
          .design.placements.filter(
            (placement) => placement.body.buildId === "base-sink",
          )
          .map((placement) => placement.body.widthMm),
      ).toStrictEqual([600]);
      expect(findingsOf(store)).toStrictEqual([]);
    },
  );
});

describe("the wall row over wall A's corner, tiled 800 + 100 where the reference hangs 600 + 300", () => {
  /** The wall-band openings over wall A's corner base, nearest the corner first. */
  function cornerWallOpenings(store: Store): VoidRecord[] {
    return store
      .getState()
      .voids.filter(
        (opening) =>
          opening.wall === "A" &&
          deriveSlotBand(opening) === "wall" &&
          opening.y0 < 1.6 &&
          openingEndMm(opening) <= cornerDepthOnWallAMm(),
      )
      .sort((left, right) => openingStartMm(left) - openingStartMm(right));
  }

  it("still reaches the reference's 600 + 300 by the customer's own commands, the 100 mm strip not stranded", () => {
    const store = createStore(loadedShellIn(REFERENCE_ROOM));
    const [nearest] = cornerWallOpenings(store);
    if (!nearest) throw new Error("no wall opening over the corner");

    store.getState().select({ kind: "void", id: nearest.id });
    store.getState().insert("wall-cabinet");
    store.getState().setWidth(600);
    expect(store.getState().lastRejection).toBeNull();
    const [rest] = cornerWallOpenings(store);
    if (!rest) throw new Error("nothing left over the corner after a 600");
    store.getState().select({ kind: "void", id: rest.id });
    store.getState().insert("wall-cabinet");

    expect(store.getState().lastRejection).toBeNull();
    expect(
      store
        .getState()
        .design.placements.filter(
          (placement) =>
            placement.wall === "A" && placement.body.buildId === "wall-cabinet",
        )
        .map((placement) => [
          placement.alongMm - placement.body.widthMm / 2,
          placement.body.widthMm,
        ]),
    ).toStrictEqual([
      [0, 600],
      [600, 300],
    ]);
    expect(findingsOf(store)).toStrictEqual([]);
  });
});

// Round 2 (Adjudication 7D1-Q1): *"Can a customer reach it today? Not in the shipped kitchen, by any
// command found reading the code"* — and QA was asked to confirm it by trying. The claim is tried in
// its strong form: no store command sequence on the seeded kitchen records floor space on wall A
// within the panel's footprint of the wall's end, because only such space lets a base cabinet stand
// where its panel passes the wall — and the panel itself is checked beside it.
describe("the seeded kitchen: no command a customer has reaches wall A's finished end", () => {
  const SEEDED_WALL_A_MM = wallLengthMm("A", KITCHEN_L_DESIGN.room);
  const FOOTPRINT_MM = Math.round(
    (RUN_END_PANEL_GAP_M + RUN_END_PANEL_THICKNESS_M) * 1000,
  );
  /** The base band's top: anything standing on the floor reaches below it. */
  const BASE_BAND_TOP_MM = 860;
  const CANDIDATE_WIDTHS_MM = Array.from(
    { length: 120 },
    (_, i) => (i + 1) * 10,
  );

  function seededStore(): Store {
    return createStore({
      ...KITCHEN_L_DESIGN,
      updatedAt: BUILT_AT,
      createdAt: BUILT_AT,
    });
  }

  /** How far along wall A anything standing on the floor reaches: bodies and recorded space. */
  function wallAFloorReachMm(design: Design): number {
    const bodies = design.placements
      .filter(
        (placement) =>
          placement.wall === "A" && placement.y0Mm < BASE_BAND_TOP_MM,
      )
      .map((placement) => placement.alongMm + placement.body.widthMm / 2);
    const recorded = [
      ...(design.emptyColumns ?? []),
      ...(design.columnExtents ?? []),
    ]
      .filter((entry) => entry.wall === "A" && entry.y0Mm < BASE_BAND_TOP_MM)
      .map((entry) => entry.alongMm + entry.widthMm / 2);
    return Math.max(0, ...bodies, ...recorded);
  }

  function panelOuterFaceMm(store: Store): number | undefined {
    const seatM = runEndPanelSeatM(store.getState().records);
    return seatM === undefined
      ? undefined
      : Math.round((seatM + RUN_END_PANEL_THICKNESS_M / 2) * 1000);
  }

  function expectFinishedEndClear(store: Store, where: string): void {
    expect(
      wallAFloorReachMm(store.getState().design),
      where,
    ).toBeLessThanOrEqual(SEEDED_WALL_A_MM - FOOTPRINT_MM);
    expect(panelOuterFaceMm(store) ?? 0, where).toBeLessThanOrEqual(
      SEEDED_WALL_A_MM,
    );
  }

  function wallABaseIds(store: Store): string[] {
    return store
      .getState()
      .records.filter(
        (record) =>
          record.wall === "A" && record.band === "base" && record.canDelete,
      )
      .map((record) => record.id);
  }

  function clearColumnOf(store: Store, placementId: string): void {
    const column = store
      .getState()
      .records.find((record) => record.id === placementId)?.col;
    const members = store
      .getState()
      .records.filter((record) => record.col === column)
      .map((record) => record.id);
    for (const id of members) {
      store.getState().select({ kind: "placement", id });
      store.getState().remove();
    }
  }

  it("keeps it clear when any wall-A base cabinet is resized to any width, alone or beside a cleared neighbour", () => {
    const baseIds = wallABaseIds(seededStore());
    expect(baseIds.length).toBeGreaterThan(2);
    const neighboursToClear: (string | undefined)[] = [undefined, ...baseIds];
    let resized = 0;

    for (const target of baseIds) {
      for (const cleared of neighboursToClear.filter((id) => id !== target)) {
        for (const widthMm of CANDIDATE_WIDTHS_MM) {
          const store = seededStore();
          if (cleared !== undefined) clearColumnOf(store, cleared);
          store.getState().select({ kind: "placement", id: target });
          store.getState().setWidth(widthMm);
          if (store.getState().lastRejection === null) resized += 1;
          expectFinishedEndClear(
            store,
            `${target} to ${String(widthMm)} beside ${String(cleared)}`,
          );
        }
      }
    }

    expect(resized).toBeGreaterThan(0);
  });

  it("keeps it clear when the last column is cleared and refilled with every body the panel offers, then resized", () => {
    const store = seededStore();
    const [last] = wallABaseIds(store).sort(
      (left, right) =>
        (store.getState().design.placements.find((p) => p.id === right)
          ?.alongMm ?? 0) -
        (store.getState().design.placements.find((p) => p.id === left)
          ?.alongMm ?? 0),
    );
    if (!last) throw new Error("the seeded kitchen has no wall-A base");
    clearColumnOf(store, last);
    const cleared = store.getState().design;
    const listed = openingsWithOffers(createStore(cleared)).filter(
      ({ opening }) =>
        opening.wall === "A" && deriveSlotBand(opening) === "base",
    );
    let taps = 0;

    for (const { opening, offered } of listed) {
      for (const buildId of offered) {
        for (const widthMm of [
          undefined,
          ...CANDIDATE_WIDTHS_MM.filter((w) => w % 50 === 0),
        ]) {
          const refill = createStore(cleared);
          refill
            .getState()
            .select({ kind: "void", id: sameOpeningIn(refill, opening).id });
          refill.getState().insert(buildId);
          taps += 1;
          if (widthMm !== undefined) refill.getState().setWidth(widthMm);
          expectFinishedEndClear(refill, `${buildId} at ${String(widthMm)}`);
        }
      }
    }

    expect(taps).toBeGreaterThan(0);
  });

  it("keeps it clear over random sequences of removes, inserts, resizes and depth changes", () => {
    const step = fc.record({
      kind: fc.constantFrom("remove", "insert", "resize", "depth"),
      pick: fc.nat(),
      widthMm: fc.constantFrom(...CANDIDATE_WIDTHS_MM),
    });
    let applied = 0;

    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 14 }), (steps) => {
        const store = seededStore();
        for (const { kind, pick, widthMm } of steps) {
          const state = store.getState();
          if (kind === "depth") {
            state.setCabinetDepth(
              declaredCabinetDepthsMm()[
                pick % declaredCabinetDepthsMm().length
              ] ?? SHELL_DEPTH_MM,
            );
          } else if (kind === "insert") {
            const listed = openingsWithOffers(store).filter(
              ({ offered }) => offered.length > 0,
            );
            const choice = listed[pick % Math.max(1, listed.length)];
            if (!choice) continue;
            state.select({ kind: "void", id: choice.opening.id });
            store
              .getState()
              .insert(choice.offered[pick % choice.offered.length] ?? "");
          } else {
            const ids = state.records
              .filter((record) => record.canDelete)
              .map((r) => r.id);
            const id = ids[pick % Math.max(1, ids.length)];
            if (id === undefined) continue;
            state.select({ kind: "placement", id });
            if (kind === "remove") store.getState().remove();
            else store.getState().setWidth(widthMm);
          }
          if (store.getState().lastRejection === null) applied += 1;
          expectFinishedEndClear(store, JSON.stringify(steps));
        }
      }),
      { numRuns: 150 },
    );

    expect(applied).toBeGreaterThan(300);
  });
});
