// §11 row 16 — "Corner base | no swap list, no delete, refusal explains why" — reaches the product
// only now. Until ADR 0025 the two base legs of the L were whole-scene geometry with no placement
// behind them, so §6.1's picking (which targets mounted placements) had nothing to select and a
// tap on the corner base did nothing at all: the row was unreachable rather than satisfied.
//
// These tests pin the two halves of that: the legs behave exactly like the wall returns `p9`/`p21`
// that already carried `STRUCTURAL_CORNER`, and adding them changed no derived state anywhere else.
import { describe, expect, it } from "vitest";

import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type Column,
  type ColumnExtent,
} from "../../src/void-engine.js";
import { OCCURRED_AT } from "../support/commands.js";
import { createWorld } from "../support/kitchen-world.js";

const CORNER_BASE_IDS = ["p25", "p26"] as const;
const CORNER_RETURN_IDS = ["p9", "p21"] as const;

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function metaFor(id: string) {
  return describeSelection({ ...seeded(), target: { kind: "placement", id } });
}

describe("the base corner is a selectable placement (§11 row 16)", () => {
  it.each(CORNER_BASE_IDS)(
    "%s resolves to a record picking can select",
    (id) => {
      const record = seeded().records.find((candidate) => candidate.id === id);
      expect(record).toBeDefined();
      expect(record?.band).toBe("base");
    },
  );

  /** **`canFinish` is the one capability a corner has, and it is not one §13.1 names.** The ruling of
   *  2026-09-09 gave the corner a colour of its own and moved nothing else: §13.1's list is replace,
   *  delete and width donor, and all three are still refused here. */
  it.each(CORNER_BASE_IDS)("%s offers colour and nothing else", (id) => {
    const meta = metaFor(id);
    expect({
      canReplace: meta?.canReplace,
      canDelete: meta?.canDelete,
      canFinish: meta?.canFinish,
      canHandle: meta?.canHandle,
      canWidth: meta?.canWidth,
      fixedWidth: meta?.fixedWidth,
      structuralReason: meta?.structuralReason,
    }).toEqual({
      canReplace: false,
      canDelete: false,
      canFinish: true,
      canHandle: false,
      canWidth: false,
      fixedWidth: true,
      structuralReason: "corner",
    });
  });

  // The panel's explanation is keyed by `structuralReason`, so the two base legs answering exactly
  // what the two wall returns answer is what makes "behaves the same" a checked claim rather than
  // an eyeballed one.
  it("answers every capability the way the wall corner returns already do", () => {
    const capabilities = (id: string) => {
      const meta = metaFor(id);
      return [
        meta?.canReplace,
        meta?.canDelete,
        meta?.canFinish,
        meta?.canHandle,
        meta?.canWidth,
        meta?.structuralReason,
      ];
    };
    for (const id of CORNER_BASE_IDS) {
      expect([id, capabilities(id)]).toEqual([
        id,
        capabilities(CORNER_RETURN_IDS[0]),
      ]);
    }
  });

  it.each(CORNER_BASE_IDS)("%s has an empty swap list", (id) => {
    const world = seeded();
    expect(offersFor({ ...world, target: { kind: "placement", id } })).toEqual(
      [],
    );
  });

  it.each(CORNER_BASE_IDS)("%s refuses deletion, naming the body", (id) => {
    const world = seeded();
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error(`${id} was deletable`);
    // Narrowed rather than asserted, because the refusal's `params` is a discriminated union and
    // only the `label`-carrying arm is the one §11 row 16 asks to explain the corner by name.
    if (result.reason.code !== "NOT_DELETABLE") {
      throw new Error(`${id} refused with ${result.reason.code}`);
    }
    expect(result.reason.params.label).toMatch(/colț/);
  });

  it.each(CORNER_BASE_IDS)(
    "%s is named, not left as the generic body",
    (id) => {
      expect(metaFor(id)?.label).toMatch(/colț/);
    },
  );
});

/** A column without the one field that is not frozen (`hasFullHeightUnder`), so "unchanged" means
 *  what ADR 0011 Gap D actually freezes: the run's extent. Named field by field rather than dropped
 *  with a rest spread, so a field added to `Column` is a type error here and has to be
 *  classified. */
function extentOf(column: Column | undefined): ColumnExtent | undefined {
  if (!column) return undefined;
  const { key, wall, ry, x, z, w, d, top, regions } = column;
  return { key, wall, ry, x, z, w, d, top, regions };
}

describe("adding the base corner changed no other derived state", () => {
  // The "before" state, reproduced exactly: the same fixture with the two new placements dropped
  // is the design this file's subject was added to. Comparing against it beats a hardcoded
  // snapshot, which would only restate whatever the code currently does.
  const before = createWorld(
    {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !CORNER_BASE_IDS.includes(placement.id as "p25"),
      ),
    },
    KITCHEN_L_BODY_CATALOG,
  );

  it("adds exactly two columns and leaves every pre-existing extent identical", () => {
    const after = seeded();
    const added = [...after.columns.keys()].filter(
      (key) => !before.columns.has(key),
    );
    expect(added.sort()).toEqual(["A|0.45", "B|0.74"]);
    for (const [key, column] of before.columns) {
      expect([key, extentOf(after.columns.get(key))]).toEqual([
        key,
        extentOf(column),
      ]);
    }
  });

  // §7's cap is lifted only by a **full-height** member standing under the opening. `p25` is a base
  // corner, so adding it lifts nothing: the two wall-only columns that overhang it stay capped,
  // before and after. Pinned because the predicate is geometric — it asks about overlap, not column
  // membership — and a version that lifted on "any member underneath" would answer differently here
  // and build a 580 mm carcass over a counter.
  it("leaves the two wall columns that overhang it capped, a base corner lifting nothing", () => {
    const after = seeded();
    for (const key of ["A|0.30", "A|0.75"]) {
      expect([key, before.columns.get(key)?.hasFullHeightUnder]) //
        .toEqual([key, false]);
      expect([key, after.columns.get(key)?.hasFullHeightUnder]) //
        .toEqual([key, false]);
    }
  });

  it("produces no void, before or after", () => {
    expect(before.voids).toEqual([]);
    expect(seeded().voids).toEqual([]);
  });

  // §10's signature flow runs on `p7`/`p24` in column `B|2.45` and never touches a corner. Pinned
  // because a new column that merged into an existing key would move that run's `top`.
  it("leaves the signature flow's column untouched", () => {
    const after = seeded();
    expect(after.columns.get("B|2.45")).toEqual(before.columns.get("B|2.45"));
    expect(
      after.records
        .filter((record) => record.col === "B|2.45")
        .map((record) => record.id)
        .sort(),
    ).toEqual(["p24", "p7"]);
  });

  // Each leg stands alone in its own column, reaching the worktop line and no further, so the
  // column is full and nothing above it is free — which is why no void appears even though the
  // legs are the only members of two brand-new columns.
  it.each([
    ["A|0.45", "p25", 0.9],
    ["B|0.74", "p26", 0.32],
  ])("seats %s as a full single-member column", (key, id, widthM) => {
    const column = seeded().columns.get(key);
    expect(column?.regions).toEqual([[0, 0.82]]);
    expect(column?.top).toBe(0.82);
    expect(column?.w).toBeCloseTo(widthM, 6);
    expect(
      seeded()
        .records.filter((record) => record.col === key)
        .map((record) => record.id),
    ).toEqual([id]);
  });
});

describe("the corner legs' seat is the L-joint, not the wall (ADR 0025)", () => {
  const recordFor = (id: string) =>
    derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).find(
      (record) => record.id === id,
    );

  // The whole point of the ADR, expressed as numbers `buildKitchen()` also produces: the X-leg's
  // carcass is 600 deep but seats 280 mm off the wall, because it must meet the 580 mm return leg
  // on a shared face at z = 0.58. `frameDepthMm` is the seat, doubled — never a depth.
  it("seats the X-leg so its carcass front meets the return leg's own depth", () => {
    const xLeg = recordFor("p25");
    const returnLeg = recordFor("p26");
    expect(xLeg?.frame.z).toBeCloseTo(0.28, 9);
    expect(returnLeg?.frame.x).toBeCloseTo(0.29, 9);

    const X_LEG_CARCASS_DEPTH_M = 0.6;
    const RETURN_LEG_DEPTH_M = 0.58;
    const xLegCarcassFront = (xLeg?.frame.z ?? 0) + X_LEG_CARCASS_DEPTH_M / 2;
    expect(xLegCarcassFront).toBeCloseTo(RETURN_LEG_DEPTH_M, 9);
  });

  // Along the wall the two legs butt their neighbours exactly, which is what a gap or an overlap
  // in the corner would show up as first.
  it("butts the base row and the wall-B run with no gap", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const edge = (id: string, side: -1 | 1) => {
      const record = records.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`no record ${id}`);
      const along = record.rotated ? record.frame.z : record.frame.x;
      return along + (side * record.frame.w) / 2;
    };
    expect(edge("p25", 1)).toBeCloseTo(edge("p0", -1), 9); // X-leg -> sink base
    expect(edge("p26", 1)).toBeCloseTo(edge("p5", -1), 9); // return leg -> oven tower
    expect(edge("p25", -1)).toBeCloseTo(0, 9); // the X-leg starts at the corner itself
  });

  it("keeps recompute pure over the enlarged fixture", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
    expect(recomputeVoids(records, columns)).toEqual(
      recomputeVoids(records, columns),
    );
  });
});
