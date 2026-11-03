// The width a lift-up door's third hinge is judged by is the width of the door the adapter builds, not the body's:
// the domain declares the reveal (`LIFT_DOOR_WIDTH_REVEAL_MM`), and this file looks at the real builder for every
// body the catalogue declares lift-up, at every width it is built to.
//
// Only one row declares `liftUp` today, and it declares one leaf per band and builds one flap. No lift-up body can
// have two leaves: the domain refuses the declaration, and the second test below holds the catalogue to one.
import {
  KITCHEN_L_BODY_CATALOG,
  LIFT_DOOR_WIDTH_REVEAL_MM,
  liftDoorWidthsMm,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { worldBox } from "./support/structure.js";

/** Retyped rather than imported, as `front-population.parity.test.ts` does: a gate that reads its definition of a
 *  door out of the code it checks proves only that the code equals itself. */
const DOOR_FRONT_MESH_NAME = "door_front";

const MM_PER_M = 1000;

interface LiftRow {
  readonly buildId: string;
  readonly definition: BodyDefinition;
}

/** Derived from the declaration, never named: a row declaring `liftUp` tomorrow is gated the day it lands. */
const LIFT_ROWS: readonly LiftRow[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => declaresLiftUp(definition))
  .map(([buildId, definition]) => ({ buildId, definition }));

function declaresLiftUp(definition: BodyDefinition): boolean {
  const rule = definition.fronts;
  return rule?.countedFrom === "declared-leaves" && rule.liftUp === true;
}

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function builtDoorWidthsMm(row: LiftRow, widthMm: number): number[] {
  const built = buildCatalogBody(kit, row.buildId, {
    widthM: widthMm / MM_PER_M,
    heightM: (row.definition.nominalHeightMm ?? 0) / MM_PER_M,
    depthM: (row.definition.nominalDepthMm ?? 0) / MM_PER_M,
  });
  const widths: number[] = [];
  built.traverse((node) => {
    if (!isMesh(node) || node.name !== DOOR_FRONT_MESH_NAME) return;
    const box = worldBox(built, node);
    widths.push(Math.round((box.max.x - box.min.x) * MM_PER_M));
  });
  return widths.sort((left, right) => left - right);
}

function declaredDoorWidthsMm(row: LiftRow, widthMm: number): number[] {
  return [
    ...liftDoorWidthsMm({
      buildId: row.buildId,
      rule: row.definition.fronts,
      widthMm,
      frameHeightMm: row.definition.nominalHeightMm ?? 0,
    }),
  ].sort((left, right) => left - right);
}

const LIFT_ROW_AT_EVERY_WIDTH: readonly (readonly [string, LiftRow, number])[] =
  LIFT_ROWS.flatMap((row) =>
    (row.definition.sizesMm ?? []).map(
      (widthMm) => [`${row.buildId}@${String(widthMm)}`, row, widthMm] as const,
    ),
  );

describe("a lift-up door is as wide as the domain says it is", () => {
  it("sweeps at least one lift-up row, at more than one width", () => {
    expect(LIFT_ROWS.length).toBeGreaterThanOrEqual(1);
    expect(LIFT_ROW_AT_EVERY_WIDTH.length).toBeGreaterThan(LIFT_ROWS.length);
  });

  it.each(LIFT_ROW_AT_EVERY_WIDTH)(
    "%s: builds the doors the domain declares, each at the width it declares",
    (label, row, widthMm) => {
      const built = builtDoorWidthsMm(row, widthMm);

      expect([label, built]).toEqual([
        label,
        declaredDoorWidthsMm(row, widthMm),
      ]);
      expect(built.length).toBeGreaterThan(0);
    },
  );

  it.each(LIFT_ROW_AT_EVERY_WIDTH)(
    "%s: is narrower than its body by the declared reveal",
    (label, row, widthMm) => {
      expect([label, builtDoorWidthsMm(row, widthMm)]).toEqual([
        label,
        [widthMm - LIFT_DOOR_WIDTH_REVEAL_MM],
      ]);
    },
  );
});

describe("no lift-up body has more than one leaf", () => {
  it.each(LIFT_ROWS.map((row) => [row.buildId, row] as const))(
    "%s: declares one leaf per band and builds one flap at every width",
    (buildId, row) => {
      const rule = row.definition.fronts;
      if (rule?.countedFrom !== "declared-leaves") {
        throw new Error(`${buildId} declares no fixed leaves`);
      }

      expect(rule.leavesPerBand).toBe(1);
      for (const widthMm of row.definition.sizesMm ?? []) {
        expect([
          buildId,
          widthMm,
          builtDoorWidthsMm(row, widthMm).length,
        ]).toEqual([buildId, widthMm, 1]);
      }
    },
  );
});
