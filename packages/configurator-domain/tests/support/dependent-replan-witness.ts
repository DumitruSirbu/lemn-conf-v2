// **The wave 6Z refusal the shipped kitchen cannot reach, declared rather than staged** (ADR 0093
// decision 2, ADR 0103 decision 7).
//
// `DEPENDENT_MEMBER_NOT_REBUILDABLE` fires when a body already standing over a column an insert
// touched cannot be rebuilt at the depth the column now decides. Every re-plannable row in the
// shipped catalogue resolves to `wall-cabinet`, which is built anywhere between 200 and 800 mm — so
// no reachable insert refuses, which is what wave 6Z's first work item measured. A rule the tree
// cannot distinguish from its own absence is unshipped, so the witness brings its own two entries
// rather than moving a fixture.
//
// The shape is a catalogue mistake a person could actually make: a top row whose declared equivalent
// is built at one width only, standing 600 mm wide.
import { cabinetDepthMmOf } from "../../src/design.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
} from "../../src/fixtures/kitchen-l-design.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import { clearBodies } from "./commands.js";
import { createWorld, type KitchenWorld } from "./kitchen-world.js";
import { syntheticDesign } from "./synthetic-world.js";

/** The standing body's `buildId` — the top the insert re-plans and cannot rebuild. */
export const WITNESS_STANDING_BUILD_ID = "replan-witness-top";
const WITNESS_EQUIVALENT_ID = "replan-witness-narrow-wall";

export const WITNESS_STANDING_ID = "w0";
export const WITNESS_COLUMN_ALONG_MM = 300;
export const WITNESS_COLUMN_KEY = "A|0.30";
/** The width the standing body holds, and the one width its equivalent is *not* built at. */
export const WITNESS_STANDING_WIDTH_MM = 600;
const WITNESS_EQUIVALENT_WIDTH_MM = 300;

function shippedEntry(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) {
    throw new Error(`the witness needs ${buildId} in the shipped catalogue`);
  }
  return definition;
}

/** **Both entries are the shipped `wall-cabinet` with one field moved**, so the witness inherits
 *  every declaration wave 6Z reads — band `wall`, `cabinet-depth`, `recorded-shell` — from the row
 *  the rule was written against, rather than restating them and risking a witness that is excluded
 *  for the wrong reason. */
export function witnessCatalogAt(cabinetDepthMm: number): BodyCatalog {
  const wallCabinet = shippedEntry("wall-cabinet");
  return new Map<string, BodyDefinition>([
    ...buildKitchenLBodyCatalog(cabinetDepthMm),
    [
      WITNESS_EQUIVALENT_ID,
      {
        ...wallCabinet,
        sizesMm: [WITNESS_EQUIVALENT_WIDTH_MM],
        widthRangesMm: [
          {
            minMm: WITNESS_EQUIVALENT_WIDTH_MM,
            maxMm: WITNESS_EQUIVALENT_WIDTH_MM,
          },
        ],
      },
    ],
    [
      WITNESS_STANDING_BUILD_ID,
      {
        ...wallCabinet,
        insertable: false,
        catalogEquivalentId: WITNESS_EQUIVALENT_ID,
      },
    ],
  ]);
}

/** One column: the witness top at the top row, and a base cabinet under it that the world below
 *  clears. The base body is what gives the column a floor to freeze — ADR 0011 Gap D, and the same
 *  shape `qa-waves-ac.adversarial.test.ts` uses to open a slot — so `syntheticDesign` alone would
 *  yield a column that starts at 2.2 m and no opening at all. */
export const WITNESS_DESIGN: Design = syntheticDesign([
  {
    id: "wb",
    wall: "A",
    alongMm: WITNESS_COLUMN_ALONG_MM,
    y0Mm: 0,
    body: {
      buildId: "base-drawer2-600",
      widthMm: WITNESS_STANDING_WIDTH_MM,
      heightMm: 820,
    },
  },
  {
    id: WITNESS_STANDING_ID,
    wall: "A",
    alongMm: WITNESS_COLUMN_ALONG_MM,
    y0Mm: 2200,
    body: {
      buildId: WITNESS_STANDING_BUILD_ID,
      widthMm: WITNESS_STANDING_WIDTH_MM,
      heightMm: 400,
    },
  },
]);

/** The witness column with everything under the top cleared, so the whole height below it is one
 *  opening a full-height body can be inserted into. */
export function witnessWorld(): KitchenWorld {
  return clearBodies(
    createWorld(
      WITNESS_DESIGN,
      witnessCatalogAt(cabinetDepthMmOf(WITNESS_DESIGN)),
    ),
    ["wb"],
  );
}
