// Wave H1b: a body with no front that opens draws no handle bar on any row, so a top-row one has no bar for the scene to
// hide and no latch for the price to bill; the review names no handle for it either (`worn-handle.test.ts` in the
// domain holds the naming half). The corner return, which has a door and takes no handle, still builds its bar.
import {
  countHardwareMechanisms,
  derivePlacementRecords,
  frontPopulationQueryFor,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  openingFrontCount,
  projectDesignForDisplay,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { forEachCabinetHandleMesh } from "../src/cabinet-handle-meshes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §6.5's module line, written out rather than imported: a gate reading its threshold from the code it checks proves
 *  only that the code equals itself. */
const MODULE_LINE_MM = 2200;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function onlyBodyAt(buildId: string, y0Mm: number): Design {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (definition === undefined) throw new Error(`no row ${buildId}`);
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        id: "probe",
        wall: "A",
        alongMm: 300,
        y0Mm,
        body: {
          buildId,
          widthMm: definition.sizesMm?.[0] ?? 600,
          heightMm: definition.nominalHeightMm ?? 700,
        },
      },
    ],
  };
}

function barsBuiltOnTheOnlyBody(design: Design): number {
  const solidsRoot = new THREE.Group();
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  const [body] = solidsRoot.children;
  if (body === undefined) throw new Error("nothing was mounted");
  let built = 0;
  forEachCabinetHandleMesh(body, () => {
    built += 1;
  });
  return built;
}

function latchesBilledOnTheOnlyBody(design: Design): number {
  const entries = projectDesignForDisplay(
    design,
    KITCHEN_L_BODY_CATALOG,
  ).flatMap((group) => group.entries);
  return countHardwareMechanisms(entries, KITCHEN_L_BODY_CATALOG).pushToOpen;
}

const FRONTLESS_ROWS = [...KITCHEN_L_BODY_CATALOG.keys()].filter((buildId) => {
  const design = onlyBodyAt(buildId, 0);
  const [entry] = projectDesignForDisplay(
    design,
    KITCHEN_L_BODY_CATALOG,
  ).flatMap((group) => group.entries);
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  return (
    entry !== undefined &&
    definition !== undefined &&
    openingFrontCount(frontPopulationQueryFor({ body: entry, definition })) ===
      0
  );
});

describe("a body with no front that opens, on the top row", () => {
  it("is found in the catalogue, so the sweep below is not empty", () => {
    expect(FRONTLESS_ROWS).toContain("open-shelf-600");
    expect(FRONTLESS_ROWS).toContain("hood-600");
  });

  it.each(FRONTLESS_ROWS)(
    "%s builds no handle bar and is billed no latch",
    (buildId) => {
      const design = onlyBodyAt(buildId, MODULE_LINE_MM);

      expect(barsBuiltOnTheOnlyBody(design)).toBe(0);
      expect(latchesBilledOnTheOnlyBody(design)).toBe(0);
    },
  );
});

describe("the top-row corner return, which has a door and takes no handle", () => {
  it("builds its bar and is billed a latch for it", () => {
    const design = onlyBodyAt("wall-corner-return-570-top", MODULE_LINE_MM);

    expect(barsBuiltOnTheOnlyBody(design)).toBeGreaterThan(0);
    expect(latchesBilledOnTheOnlyBody(design)).toBeGreaterThan(0);
  });
});
