// What ADR 0182 changed in the catalogue, put back, and the specimen the old rule is still held to.
//
// Until ADR 0182 every corner body declared `canHandle: false`, so a corner resolved no handle and drew the builder's
// steel bar whatever the kitchen said. Two kinds of test lean on that:
//  - a diff against HEAD's behaviour (`catalogWithCornersTakingNoHandle`): the kitchen as it priced and drew before,
//    so a test can state that the change moved exactly the corner leaves and nothing else;
//  - the rule ADR 0092 decision 3 still enforces for a body that takes no handle yet has a front that opens
//    (`catalogWithAHandlelessDoorRow`). No shipped body is in that case any more, so the tests that held the rule
//    against a corner hold it against this row, which is the shipped corner definition with the one flag off.
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

export const BASE_CORNER_X_BUILD_ID = "base-corner-x-900";
export const BASE_CORNER_RETURN_BUILD_ID = "base-corner-return-320";
export const WALL_CORNER_RETURN_BUILD_ID = "wall-corner-return-570";
export const WALL_CORNER_RETURN_TOP_BUILD_ID = "wall-corner-return-570-top";

/** A corner is a body the catalogue declares structural for that reason, the one predicate every helper here uses. */
function isCorner(definition: BodyDefinition): boolean {
  return definition.structuralReason === "corner";
}

export const ALL_CORNER_BUILD_IDS: readonly string[] = [
  ...KITCHEN_L_BODY_CATALOG,
]
  .filter(([, definition]) => isCorner(definition))
  .map(([buildId]) => buildId);

/** The five corner bodies that carry a bar and a door leaf, and so take a handle (ADR 0182 decision 1). */
export const HANDLE_CARRYING_CORNER_BUILD_IDS: readonly string[] =
  ALL_CORNER_BUILD_IDS.filter(
    (buildId) => buildId !== BASE_CORNER_RETURN_BUILD_ID,
  );

/** A wall body with one door leaf that takes no handle; the "-top" twin stands where the module line is crossed. */
export const HANDLELESS_DOOR_BUILD_ID = "handleless-door";
export const HANDLELESS_DOOR_TOP_BUILD_ID = "handleless-door-top";

function definitionIn(catalog: BodyCatalog, buildId: string): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) throw new Error(`the catalogue holds no "${buildId}"`);
  return definition;
}

/** `catalog` with every corner (`structuralReason: "corner"`) declaring `canHandle: false`, as it was at `c48992e8`. */
export function catalogWithCornersTakingNoHandle(
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): BodyCatalog {
  return new Map(
    [...catalog].map(([buildId, definition]) => [
      buildId,
      isCorner(definition) ? { ...definition, canHandle: false } : definition,
    ]),
  );
}

/** `catalog` plus the two handle-less door rows, copied from the wall corner return and its top-row twin. */
export function catalogWithAHandlelessDoorRow(
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): BodyCatalog {
  return new Map([
    ...catalog,
    [
      HANDLELESS_DOOR_BUILD_ID,
      {
        ...definitionIn(catalog, WALL_CORNER_RETURN_BUILD_ID),
        canHandle: false,
      },
    ],
    [
      HANDLELESS_DOOR_TOP_BUILD_ID,
      {
        ...definitionIn(catalog, WALL_CORNER_RETURN_TOP_BUILD_ID),
        canHandle: false,
      },
    ],
  ]);
}
