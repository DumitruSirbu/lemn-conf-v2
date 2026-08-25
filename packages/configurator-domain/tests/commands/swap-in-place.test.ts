// `DEVELOPMENT-SPEC.md` §5.3 and §11 rows 8, 23, 24's engine half.
//
// The recorded defect these guard against is silent: a void rewrite dropped the swap branch and
// every "Înlocuiește" row did nothing at all. That is why the offer list is *enumerated and
// executed* below rather than sampled.
import { describe, expect, it } from "vitest";

import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import { openingFromPlacement } from "../../src/commands/insert-fit.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function openingHeightOf(world: KitchenWorld, placementId: string): number {
  const record = world.records.find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return openingFromPlacement(record, world.records, world.columns).h;
}

describe("swap in place", () => {
  it("runs the insert path with the occupied body as its target and replaces it in place", () => {
    const world = seeded();
    const result = insertInto(
      world,
      { kind: "placement", id: "p0" },
      "base-3drawer",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.replacedPlacementId).toBe("p0");
    const ids = result.design.placements.map((placement) => placement.id);
    expect(ids).not.toContain("p0");
    expect(ids.indexOf(result.effect.placementId)).toBe(
      KITCHEN_L_DESIGN.placements.findIndex((p) => p.id === "p0"),
    );
    expect(result.design.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length,
    );
  });

  // §5.3: an opening's size does not change because its contents did.
  it("leaves the opening's height exactly unchanged", () => {
    const world = seeded();
    const before = openingHeightOf(world, "p0");
    const result = insertInto(
      world,
      { kind: "placement", id: "p0" },
      "base-3drawer",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(world, result.design);
    expect(openingHeightOf(after, result.effect.placementId)).toBe(before);
  });

  // §11 row 8: no phantom void from the freed faucet height — the whole void set is equal, not
  // merely missing an obviously wrong entry.
  it("row 8: swapping a sink base for drawers changes the void set not at all", () => {
    const world = clearBodies(seeded(), ["p18"]);
    expect(world.voids.length).toBeGreaterThan(0);
    const before = world.voids.map((record) => record.id).sort();

    const result = insertInto(
      world,
      { kind: "placement", id: "p0" },
      "base-3drawer",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(world, result.design);
    expect(after.voids.map((record) => record.id).sort()).toEqual(before);
  });

  // The failure was silent, so sampling one row cannot detect it.
  it("performs a real swap for every row its own offer list contains", () => {
    const world = seeded();
    for (const placementId of ["p0", "p8", "p15"]) {
      const offers = offersFor({
        ...world,
        target: { kind: "placement", id: placementId },
      });
      expect(offers.length, placementId).toBeGreaterThan(0);
      for (const offer of offers) {
        const result = insertInto(
          world,
          { kind: "placement", id: placementId },
          offer.buildId,
        );
        expect(result.ok, `${placementId} -> ${offer.buildId}`).toBe(true);
        if (!result.ok) continue;
        expect(result.design.placements.at(-1)).toBeDefined();
        expect(result.effect.replacedPlacementId).toBe(placementId);
      }
    }
  });

  // §11 row 23: identity comes from the chosen catalogue id, never re-inferred from the mesh tree,
  // which once produced a fridge housing labelled and priced as a pantry.
  it("row 23: an integrated fridge niche stays that product", () => {
    const cleared = clearBodies(seeded(), ["p5"]);
    const target = cleared.voids.find((record) => record.col === "B|1.20");
    expect(target).toBeDefined();
    const result = insertInto(
      cleared,
      { kind: "void", id: target?.id ?? "" },
      "tall-fridge-housing",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(cleared, result.design);
    const meta = describeSelection({
      ...after,
      target: { kind: "placement", id: result.effect.placementId },
    });
    expect(meta?.label).toBe("Nișă frigider integrat");
    expect(meta?.kind).toBe("fridge_housing");
  });

  // "Choice beats default; default beats nothing" (§5.4).
  it("carries a recorded finish and handle across a swap that supports them", () => {
    const world = seeded();
    const finished = setFinish({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p8" },
      finish: "sage",
      occurredAt: OCCURRED_AT,
    });
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;
    const handled = setHandle({
      design: finished.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p8" },
      handle: "black",
      occurredAt: OCCURRED_AT,
    });
    expect(handled.ok).toBe(true);
    if (!handled.ok) return;

    const chosen = advance(world, handled.design);
    const kept = insertInto(
      chosen,
      { kind: "placement", id: "p8" },
      "wall-1door",
    );
    expect(kept.ok).toBe(true);
    if (kept.ok) {
      expect(kept.design.placements.at(0)).toBeDefined();
      const swapped = kept.design.placements.find(
        (placement) => placement.id === kept.effect.placementId,
      );
      expect(swapped?.body.finish).toBe("sage");
      expect(swapped?.body.handle).toBe("black");
    }

    // An open shelf has no doors and no handle meshes, so both choices are dropped rather than
    // carried onto a body that cannot express them.
    const dropped = insertInto(
      chosen,
      { kind: "placement", id: "p8" },
      "open-shelf",
    );
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    const shelf = dropped.design.placements.find(
      (placement) => placement.id === dropped.effect.placementId,
    );
    expect(shelf?.body.finish).toBeUndefined();
    expect(shelf?.body.handle).toBeUndefined();
  });

  it("refuses a swap whose column is not in the frozen map", () => {
    const world = seeded();
    const columns = new Map(world.columns);
    columns.delete("A|1.30");
    const result = insertInto(
      { ...world, columns },
      { kind: "placement", id: "p0" },
      "base-3drawer",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("COLUMN_MISMATCH");
    expect(result.design).toBe(world.design);
  });
});
