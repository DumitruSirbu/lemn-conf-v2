// Thin wrappers that keep the §11 row tests readable: build → operate → check, with the world
// plumbing out of the way.
import type { BodyProbe } from "../../src/body-probe.js";
import type { CommandTarget } from "../../src/commands/command-result.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setWidth } from "../../src/commands/set-width.js";
import { recomputeVoids } from "../../src/void-engine.js";
import { createFakeProbe } from "./fake-probe.js";
import { advance, type KitchenWorld } from "./kitchen-world.js";

export const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** Removes each body in turn, failing loudly rather than silently continuing on a refusal. */
export function clearBodies(
  world: KitchenWorld,
  placementIds: readonly string[],
): KitchenWorld {
  return placementIds.reduce((current, id) => {
    const result = removePlacement({
      design: current.design,
      catalog: current.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Fixture could not remove ${id}: ${result.reason.code}`);
    }
    return advance(current, result.design);
  }, world);
}

export function insertInto(
  world: KitchenWorld,
  target: CommandTarget,
  buildId: string,
  probe: BodyProbe = createFakeProbe({ catalog: world.catalog }),
) {
  return insertBody({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    // Derived from the map handed in rather than read off `world.voids`, because a caller that
    // overrides one of the two must not be left holding openings the other no longer contains.
    // The world models a kitchen whose two faces coincide — `createWorld` builds `columns` through
    // `deriveColumns`, wall-end cap included — so this *is* the published list, and a test that
    // empties the map empties the openings with it exactly as it did before the split.
    voids: recomputeVoids(world.records, world.columns),
    target,
    buildId,
    probe,
    occurredAt: OCCURRED_AT,
  });
}

/** ADR 0031's resize, pointed at a placement — which resizes the whole **column** that placement
 *  stands in. Returns the raw `CommandResult` so a test can assert a refusal's code as readily as a
 *  success. */
export function resizeTo(
  world: KitchenWorld,
  placementId: string,
  widthMm: number,
  probe: BodyProbe = createFakeProbe({ catalog: world.catalog }),
) {
  return setWidth({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "placement", id: placementId },
    widthMm,
    probe,
    occurredAt: OCCURRED_AT,
  });
}
