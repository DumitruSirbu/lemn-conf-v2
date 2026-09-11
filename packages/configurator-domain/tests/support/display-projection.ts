// The helpers wave 6A's two projection suites share, so the seeded catalogue is read one way and a
// heading is spelled one way whichever file is failing.
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { LabelledBody } from "../../src/catalog.js";
import type { DisplayGroup } from "../../src/queries/design-projection.js";
import type { BodyDefinition } from "../../src/void-engine.js";

/** The seeded catalogue every projection test resolves its build ids against. */
export const PROJECTION_CATALOG = KITCHEN_L_BODY_CATALOG;

/** The seeded design with its placements replaced, so a test writes only the document it is about
 *  while the room, the timestamps and the column map stay the ones the product ships. */
export function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

/** A group's heading as the customer reads it, so an order assertion fails on *Perete A · base*
 *  rather than on a nested object diff. */
export function headingsOf(groups: readonly DisplayGroup[]): readonly string[] {
  return groups.map((group) => `${group.wall}·${group.band}`);
}

export function definitionOf(buildId: string): BodyDefinition {
  const definition = PROJECTION_CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return definition;
}

/** The pair `describeBodyLabelAt` names a body from: the id it is filed under and its row. */
export function bodyOf(buildId: string): LabelledBody {
  return { buildId, definition: definitionOf(buildId) };
}
