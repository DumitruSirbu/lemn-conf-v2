// Backlog 52, closing ADR 0090 Amendment B's **addendum** — a resize or an insert must not carry
// the room-derived wall-end cap into the recorded map.
//
// Amendment B rules that a pass deriving its answer from the room may bound what the map publishes
// and may not rewrite what the document records. `setCabinetDepth` obeyed it from the start.
// `setWidth` and `insertBody` did not: `CommandContext.columns` handed them the *published* map and
// their `effect.columns` replaces the map whole, so the cap rode into the recorded face. Measured on
// this fixture at `cf53e8e` plus the D1 fix, and reproduced by the first test below before the fix:
//
//     at 600                     recorded B|2620 w600   published w600
//     after setCabinetDepth(700) recorded B|2720 w600   published w500
//     after a delete on wall B   recorded B|2720 w600   published w500
//     after resizing p0, wall A  recorded B|2670 w500   published w500   <- the loss
//
// A resize of an unrelated cabinet **on the other wall** cost the recorded space 100 mm,
// permanently and silently: the document stayed schema-valid and `validateDesignForCatalog`
// reported nothing.
//
// The direction the addendum ruled, and what these tests pin: the cap **preserves the column's
// key**, so one column has one identity across the two faces, and the two commands are handed the
// **recorded** map. The published face is still bounded by the wall — that half is ADR 0069's owner
// ruling and is asserted here too, because a fix that removed the cap would pass the first test.
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  fatalDesignValidationIssues,
  KITCHEN_L_DESIGN,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-06T12:00:00.000Z";
const DEEPER_MM = 700;

/** A recorded space standing flush to wall B's own end at the default depth: 2320 to 2920 in the
 *  fixture's 2920 mm room, on the ground the fridge and the unit over it used to hold. It is the one
 *  population the cap can reach, because a space anywhere else on the wall never crosses the end. */
const FAR_END: EmptyColumn = {
  wall: "B",
  alongMm: 2620,
  widthMm: 600,
  y0Mm: 0,
  topMm: 2600,
  depthMm: 742,
  depthFromBuildId: "fridge-free-700",
};

/** Wall B, away from the far end: the deep top over the pantry. Deleting it is step 3 — a command
 *  with no map of its own, so the store's fall-through arm runs and the record must survive it. */
const A_DELETE_ON_WALL_B = "p23";

/** Wall A, and the point of the measurement: nothing about this cabinet touches wall B. */
const A_RESIZE_ON_WALL_A = "p0";
const RESIZED_TO_MM = 700;

/** Wall A's dishwasher slot, cleared so there is a base opening for the insert arm to fill. */
const AN_OPENING_ON_WALL_A = "p1";
const AN_INSERTABLE_BODY = "base-bottle-cargo";

function createStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** The seeded kitchen with the fridge column cleared and recorded as one space at the far end of
 *  wall B — the state a customer reaches by deleting the fridge and the unit above it. */
function withASpaceAtTheFarEnd(): Store {
  return createStore({
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => !["p7", "p24"].includes(placement.id),
    ),
    emptyColumns: [FAR_END],
  });
}

function remove(store: Store, id: string): Store {
  store.getState().select({ kind: "placement", id });
  store.getState().remove();
  expect(store.getState().lastRejection, `remove ${id}`).toBeNull();
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

/** The document's own entry for the space nearest the end of wall B — **selected by coordinate, not
 *  by key**, on purpose: the key is what this wave changes, so a criterion that found the space by
 *  key could not fail on the loss it is written for. The delete in step 3 leaves a second recorded
 *  space further down the same wall; the far-end one is the one with the greatest `alongMm`. */
function recorded(store: Store): string {
  const spaces = [...(store.getState().design.emptyColumns ?? [])]
    .filter((entry) => entry.wall === "B")
    .sort((left, right) => right.alongMm - left.alongMm);
  const [farEnd] = spaces;
  if (!farEnd) throw new Error("no recorded space on wall B");
  return `B|${String(farEnd.alongMm)} w${String(farEnd.widthMm)}`;
}

/** The width the same space is published at, found the same way for the same reason. */
function publishedWidthMm(store: Store): number {
  const { columns, records } = store.getState();
  const held = new Set(records.map((record) => record.col));
  const spaces = [...columns.values()]
    .filter((column) => column.wall === "B" && !held.has(column.key))
    .sort((left, right) => right.z - left.z);
  const [farEnd] = spaces;
  if (!farEnd) throw new Error("no member-less column published on wall B");
  return Math.round(farEnd.w * 1000);
}

describe("the wall-end cap bounds what is published and never what is recorded", () => {
  // **The reproduction, as the four steps the addendum measured.** It failed at step 4 before the
  // fix — `recorded B|2670 w500`, 100 mm gone from a space on the wall nothing in this sequence
  // touched — and the intermediate steps are asserted so a regression names the step it broke at.
  it("keeps wall B's recorded opening through a resize on wall A", () => {
    const store = withASpaceAtTheFarEnd();
    expect(recorded(store), "at 600").toBe("B|2620 w600");
    expect(publishedWidthMm(store), "at 600").toBe(600);

    setDepth(store, DEEPER_MM);
    expect(recorded(store), "after setCabinetDepth(700)").toBe("B|2720 w600");
    expect(publishedWidthMm(store), "after setCabinetDepth(700)").toBe(500);

    remove(store, A_DELETE_ON_WALL_B);
    expect(recorded(store), "after a delete on wall B").toBe("B|2720 w600");
    expect(publishedWidthMm(store), "after a delete on wall B").toBe(500);

    store.getState().select({ kind: "placement", id: A_RESIZE_ON_WALL_A });
    store.getState().setWidth(RESIZED_TO_MM);
    expect(store.getState().lastRejection, "the resize itself").toBeNull();

    expect(recorded(store), "after resizing p0, wall A").toBe("B|2720 w600");
    expect(publishedWidthMm(store), "after resizing p0, wall A").toBe(500);
  });

  // The addendum names both commands, for the same reason: `insertBody` also replaces the map whole.
  it("keeps it through an insert on wall A", () => {
    const store = withASpaceAtTheFarEnd();
    setDepth(store, DEEPER_MM);
    remove(store, A_DELETE_ON_WALL_B);
    remove(store, AN_OPENING_ON_WALL_A);

    const opening = store
      .getState()
      .voids.find((record) => record.wall === "A" && record.y0 === 0);
    if (!opening) throw new Error("no base opening on wall A to insert into");
    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert(AN_INSERTABLE_BODY);
    expect(store.getState().lastRejection, "the insert itself").toBeNull();

    expect(recorded(store), "after an insert on wall A").toBe("B|2720 w600");
    expect(publishedWidthMm(store), "after an insert on wall A").toBe(500);
  });

  // **One column, one identity, two faces** — the addendum's own rule, and what makes handing the
  // two commands the recorded map safe. The record stands at 2720 mm, so the document restores it
  // under `B|2.72` (`toColumnExtent`), and that is the key the capped column must publish under
  // even though its own centre has moved to 2670.
  it("names the space by one key on both faces", () => {
    const store = withASpaceAtTheFarEnd();

    setDepth(store, DEEPER_MM);

    expect(recorded(store)).toBe("B|2720 w600");
    expect(store.getState().columns.has("B|2.72")).toBe(true);
    expect(store.getState().columns.has("B|2.67")).toBe(false);
  });

  // The half ADR 0069's owner ruling keeps, asserted after the resize rather than before it: a fix
  // that stopped capping the published face would satisfy the two tests above and break this one.
  it("still publishes nothing past the end of either wall after the resize", () => {
    const store = withASpaceAtTheFarEnd();
    setDepth(store, DEEPER_MM);
    store.getState().select({ kind: "placement", id: A_RESIZE_ON_WALL_A });
    store.getState().setWidth(RESIZED_TO_MM);
    expect(store.getState().lastRejection).toBeNull();

    const { room } = store.getState().design;
    for (const column of store.getState().columns.values()) {
      const farEdgeMm = Math.round(
        ((column.wall === "A" ? column.x : column.z) + column.w / 2) * 1000,
      );
      expect(farEdgeMm, column.key).toBeLessThanOrEqual(
        wallLengthMm(column.wall, room),
      );
    }
    // And the opening the customer is offered there is the capped one, not the recorded 600.
    const offered = store
      .getState()
      .voids.filter((record) => record.col === "B|2.72");
    expect(offered.length).toBeGreaterThan(0);
    for (const record of offered) {
      expect(Math.round(record.w * 1000)).toBe(500);
    }
  });

  // The recorded 100 mm the wall no longer covers is **marked, not shortened** — ADR 0090
  // Amendment B, and the same treatment ADR 0065 gives a placement the same slide pushes past the
  // same wall. Asserted after the resize, because that is the command that used to shorten it.
  it("marks the recorded overhang rather than refusing the document", () => {
    const store = withASpaceAtTheFarEnd();
    setDepth(store, DEEPER_MM);
    store.getState().select({ kind: "placement", id: A_RESIZE_ON_WALL_A });
    store.getState().setWidth(RESIZED_TO_MM);

    const issues = validateDesignForCatalog(
      store.getState().design,
      buildKitchenLBodyCatalog(DEEPER_MM),
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "EMPTY_COLUMN_PAST_WALL_END",
    );
    expect(fatalDesignValidationIssues(issues)).toEqual([]);
  });

  // The cost the addendum said option 1 would carry, measured to be absent: the `COLUMN_MISMATCH`
  // that made handing the commands the recorded map look expensive was **created by the key
  // divergence**, so preserving the key dissolves it. An insert into the capped opening itself is
  // where it would fire, because that is the one void whose column the two faces used to key
  // differently.
  it("resolves an insert into the capped opening itself, with no COLUMN_MISMATCH", () => {
    const store = withASpaceAtTheFarEnd();
    setDepth(store, DEEPER_MM);

    const opening = store
      .getState()
      .voids.find((record) => record.col === "B|2.72" && record.y0 === 0);
    if (!opening) throw new Error("the capped opening publishes no void");
    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert(AN_INSERTABLE_BODY);

    expect(store.getState().lastRejection).toBeNull();
    // And it landed on the wall: the body is seated flush against the column's left edge, which is
    // the edge the cap never moves.
    const inserted = store
      .getState()
      .records.find((record) => record.buildId === AN_INSERTABLE_BODY);
    if (!inserted) throw new Error("the insert produced no record");
    const farEdgeMm = Math.round(
      (inserted.frame.z + inserted.frame.w / 2) * 1000,
    );
    expect(farEdgeMm).toBeLessThanOrEqual(
      wallLengthMm("B", store.getState().design.room),
    );
  });

  // `setCabinetDepth`'s own Amendment B behaviour, unchanged by this wave: the round trip returns
  // the width the customer left, and the two faces agree again at the default depth.
  it("returns the recorded width when the depth goes back to the default", () => {
    const store = withASpaceAtTheFarEnd();

    setDepth(store, DEEPER_MM);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(recorded(store)).toBe("B|2620 w600");
    expect(publishedWidthMm(store)).toBe(600);
  });
});
