// `DEVELOPMENT-SPEC.md` §10's signature flow, driven through real mutations rather than fixtures,
// plus §11 rows 1, 17 and 18 re-proven along the way.
//
// The flow is the phase's own gate: delete the fridge, delete the unit above it, watch the two
// openings merge into one 700 × 2600 opening with three level slots, fill base then middle then
// top, clear all three, insert the freestanding fridge, and get exactly one 750 mm slot above it.
import { describe, expect, it } from "vitest";

import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { ColumnExtent } from "../../src/void-engine.js";
import { extentOf } from "../support/column-extents.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import {
  advance,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const FRIDGE_COLUMN = "B|2.45";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function slotsOf(world: KitchenWorld, col: string) {
  return world.voids
    .filter((record) => record.col === col)
    .map((record) => ({
      y0: Number(record.y0.toFixed(3)),
      h: Number(record.h.toFixed(3)),
    }));
}

function fill(world: KitchenWorld, y0: number, buildId: string): KitchenWorld {
  const target = {
    kind: "void",
    id: voidAt(world, FRIDGE_COLUMN, y0).id,
  } as const;
  const result = insertInto(world, target, buildId);
  if (!result.ok) {
    throw new Error(
      `insert ${buildId} at ${String(y0)}: ${result.reason.code}`,
    );
  }
  return advance(world, result.design);
}

describe("the signature flow (§10)", () => {
  it("runs end to end and ends with exactly one 750 mm slot above the fridge", () => {
    // 1–2. Delete the fridge, then the unit above it: the two openings merge.
    const cleared = clearBodies(seeded(), ["p7", "p24"]);
    expect(slotsOf(cleared, FRIDGE_COLUMN)).toEqual([
      { y0: 0, h: 0.86 },
      { y0: 1.5, h: 0.7 },
      { y0: 2.2, h: 0.4 },
    ]);
    expect(voidAt(cleared, FRIDGE_COLUMN, 0).spanH).toBeCloseTo(2.6, 6);
    expect(voidAt(cleared, FRIDGE_COLUMN, 0).w).toBeCloseTo(0.7, 6);

    // 3–5. Fill base, then middle, then top.
    // `open-shelf` and `base-3drawer` rather than the hinged cabinets: §10's flow is about the slots
    // merging and re-splitting, so the body that fills them must not refuse on width. Both are
    // cabinetry bounded 300–800 with no hole in the middle (ADR 0035), where a hinged cabinet has
    // ADR 0026's declared 200 rather than §2's default. The fridge column's 700 mm is inside all of
    // them, and since the owner retired ADR 0030's one-door cap no cabinetry bound has a hole in it.
    let world = fill(cleared, 0, "base-3drawer");
    world = fill(world, 1.5, "open-shelf");
    world = fill(world, 2.2, "open-shelf");
    expect(slotsOf(world, FRIDGE_COLUMN)).toEqual([]);
    const filled = world.records.filter(
      (record) => record.col === FRIDGE_COLUMN,
    );
    expect(filled.map((record) => record.frame.y0).sort()).toEqual([
      0, 1.5, 2.2,
    ]);

    // 6. Clear all three, then insert the freestanding fridge.
    world = clearBodies(
      world,
      filled.map((record) => record.id),
    );
    expect(slotsOf(world, FRIDGE_COLUMN)).toEqual([
      { y0: 0, h: 0.86 },
      { y0: 1.5, h: 0.7 },
      { y0: 2.2, h: 0.4 },
    ]);
    world = fill(world, 0, "fridge-free");

    // §11 row 1: one 750 mm slot, never two stubs.
    expect(slotsOf(world, FRIDGE_COLUMN)).toEqual([{ y0: 1.85, h: 0.75 }]);
  });

  // §11 row 17: the 860–1500 backsplash zone is never an opening, however the column is edited.
  it("never offers the backsplash zone as an opening", () => {
    const world = clearBodies(seeded(), ["p1", "p12", "p18"]);
    expect(world.voids.length).toBeGreaterThan(0);
    for (const slot of world.voids) {
      const overlapsBacksplash =
        slot.y0 < 1.5 - 1e-9 && slot.y0 + slot.h > 0.86 + 1e-9;
      expect(overlapsBacksplash, slot.id).toBe(false);
    }
  });

  // §11 row 18: a wall-only column invents no floor space under itself.
  it("invents no floor space under a wall-only column", () => {
    const world = clearBodies(seeded(), ["p10"]);
    for (const slot of world.voids.filter(
      (record) => record.col === "A|0.75",
    )) {
      expect(slot.y0).toBeGreaterThanOrEqual(1.5);
    }
  });
});

/** The half of a column ADR 0011 Gap D freezes, or a failure naming the column that went missing. */
function frozenExtentAt(world: KitchenWorld, key: string): ColumnExtent {
  const column = world.columns.get(key);
  if (!column) throw new Error(`No column ${key}`);
  return extentOf(column);
}

describe("column stability (§3.2, ADR 0011 Gap D)", () => {
  it("leaves a column's top where it was when its top unit is deleted", () => {
    const world = seeded();
    const before = frozenExtentAt(world, "A|2.00");
    const after = clearBodies(world, ["p18"]);
    // By value and no longer by identity: every derivation now rebuilds the map to re-answer
    // `hasFullHeightUnder`. That field is not part of the frozen extent, so it is projected out rather than
    // compared — deleting a base cabinet is *supposed* to flip it, and a flow that did would
    // otherwise fail under this heading. The defect this row exists to catch is still caught: a
    // recomputed column would drop `top` from 2.6 to 2.2, which the extent carries.
    expect(frozenExtentAt(after, "A|2.00")).toEqual(before);
    expect(
      after.voids.some((slot) => slot.col === "A|2.00" && slot.y0 === 2.2),
    ).toBe(true);
  });

  it("keeps a column in the map after its last member is deleted, so the run stays selectable", () => {
    const world = seeded();
    const cleared = clearBodies(world, ["p10"]);
    expect(cleared.columns.has("A|0.75")).toBe(true);
    expect(cleared.voids.filter((slot) => slot.col === "A|0.75")).toHaveLength(
      1,
    );
  });

  it("keeps every placement's derived column a key in the frozen map after any command", () => {
    const cleared = clearBodies(seeded(), ["p7", "p24"]);
    const inserted = insertInto(
      cleared,
      { kind: "void", id: voidAt(cleared, FRIDGE_COLUMN, 0).id },
      "base-3drawer",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const after = advance(cleared, inserted.design);
    for (const record of after.records) {
      expect(after.columns.has(record.col), record.id).toBe(true);
    }
    const placed = after.records.find(
      (record) => record.id === inserted.effect.placementId,
    );
    expect(placed?.col).toBe(FRIDGE_COLUMN);
  });
});

describe("the rejection sweep", () => {
  const originals = seeded();
  // ADR 0027 folded the hob into `p2`'s body and ADR 0038 retired the pre-migration document these
  // two cases used to run on, so both now refuse on the seeded corner leg `p25` instead: §13.1
  // makes it non-deletable and non-replaceable, and it is a real placement in the shipped design.
  // A case pointed at an id that resolves to nothing would refuse with `TARGET_NOT_FOUND` and still
  // pass, because the sweep asserts the no-op contract rather than the code — which is why each
  // case carries the world it runs in and why the target has to exist.

  it.each([
    [
      "remove a void",
      originals,
      () =>
        removePlacement({
          design: originals.design,
          catalog: originals.catalog,
          target: { kind: "void", id: "nope" },
          occurredAt: OCCURRED_AT,
        }),
    ],
    [
      "remove the corner leg",
      originals,
      () =>
        removePlacement({
          design: originals.design,
          catalog: originals.catalog,
          target: { kind: "placement", id: "p25" },
          occurredAt: OCCURRED_AT,
        }),
    ],
    [
      "insert a seeded id",
      originals,
      () =>
        insertInto(originals, { kind: "placement", id: "p0" }, "base-sink-800"),
    ],
    [
      "insert an unknown id",
      originals,
      () =>
        insertInto(originals, { kind: "placement", id: "p0" }, "teleporter"),
    ],
    [
      "insert into the corner leg",
      originals,
      () =>
        insertInto(originals, { kind: "placement", id: "p25" }, "base-3drawer"),
    ],
    [
      "insert into a stale void",
      originals,
      () => insertInto(originals, { kind: "void", id: "nope" }, "base-3drawer"),
    ],
  ])("%s returns the identical design and no effect", (_case, world, run) => {
    const snapshot = JSON.stringify(world.design);
    const result = run();
    expect(result.ok).toBe(false);
    expect(result.design).toBe(world.design);
    expect(result.design.updatedAt).toBe(world.design.updatedAt);
    expect(JSON.stringify(world.design)).toBe(snapshot);
    expect(result).not.toHaveProperty("effect");
    if (result.ok) return;
    expect(result.reason.code.length).toBeGreaterThan(0);
    expect(result.reason.message.length).toBeGreaterThan(0);
  });
});
