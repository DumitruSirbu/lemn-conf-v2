// A design plus everything derived from it, with the columns held **frozen** across mutations.
//
// ADR 0011 Gap D: columns are load-time state. Re-deriving them after a command is the single most
// likely defect of this phase, and it reads as "delete does nothing" rather than as a column bug —
// so the test world models the contract the store must implement, and a test that passes here
// cannot be passing because the columns quietly moved.
import type { Design } from "../../src/design.js";
import {
  withCurrentFullHeightMembers,
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";

export interface KitchenWorld {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly columns: ReadonlyMap<string, Column>;
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
}

export function createWorld(
  design: Design,
  catalog: BodyCatalog,
): KitchenWorld {
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(records, {}, design.room);
  return {
    design,
    catalog,
    columns,
    records,
    voids: recomputeVoids(records, columns),
  };
}

/** A world whose columns are frozen from the whole design, then advanced to a design missing some
 *  placements — the only way to open the span a structural corner return occupies, since §13.1
 *  makes it non-deletable and `clearBodies` therefore refuses it. That refusal is the product rule,
 *  not a fixture problem; dropping the placement before `createWorld` instead would shrink the
 *  column to what is left and yield no void at all (ADR 0011 Gap D). */
export function advancePast(
  world: KitchenWorld,
  placementIds: readonly string[],
): KitchenWorld {
  return advance(world, {
    ...world.design,
    placements: world.design.placements.filter(
      (placement) => !placementIds.includes(placement.id),
    ),
  });
}

/** Applies a command's design to the world exactly as the store must: records and voids are
 *  re-derived, the columns' **extent** is not, and `withCurrentFullHeightMembers` does the one thing
 *  the store's `resolveColumns` does — `hasFullHeightUnder` re-answered from the new records.
 *
 *  `voids` are recomputed against the map this returns rather than `world.columns`, so the fixture
 *  derives openings from the same map the store does. With ADR 0037's merge withdrawn the two differ
 *  only in `hasFullHeightUnder`, so this is about ordering being honest rather than about a
 *  behaviour difference. */
export function advance(world: KitchenWorld, design: Design): KitchenWorld {
  const records = derivePlacementRecords(design, world.catalog);
  const columns = withCurrentFullHeightMembers(world.columns, records);
  return {
    ...world,
    design,
    records,
    columns,
    voids: recomputeVoids(records, columns),
  };
}

/** The void covering a given height in a given column, by geometry — the only way a test may name
 *  a void, since ids are regenerated on every recompute. */
export function voidAt(
  world: KitchenWorld,
  col: string,
  y0: number,
): VoidRecord {
  const found = world.voids.find(
    (record) => record.col === col && Math.abs(record.y0 - y0) < 0.01,
  );
  if (!found) {
    throw new Error(
      `No void at ${col} y0=${String(y0)}; have ${world.voids
        .map((record) => `${record.col}@${record.y0.toFixed(2)}`)
        .join(", ")}`,
    );
  }
  return found;
}

/** Applies an ADR 0031 resize exactly as the store must: the design **and** the column map the
 *  command published, because the resize is the one operation that legitimately moves bodies between
 *  columns (ADR 0011 Gap D) — and the only one that moves an **empty** column, which has no member
 *  for a re-derivation to find. Every other command goes through `advance`, which keeps the extents.
 */
export function advanceWithColumns(
  world: KitchenWorld,
  design: Design,
  columns: ReadonlyMap<string, Column>,
): KitchenWorld {
  const records = derivePlacementRecords(design, world.catalog);
  return {
    ...world,
    design,
    records,
    columns,
    voids: recomputeVoids(records, columns),
  };
}
