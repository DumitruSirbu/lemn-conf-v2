// Thin wrappers that keep the §11 row tests readable: build → operate → check, with the world
// plumbing out of the way.
import type { BodyProbe } from "../../src/body-probe.js";
import type { CommandTarget } from "../../src/commands/command-result.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
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
  probe: BodyProbe = createFakeProbe(),
) {
  return insertBody({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target,
    buildId,
    probe,
    occurredAt: OCCURRED_AT,
  });
}
