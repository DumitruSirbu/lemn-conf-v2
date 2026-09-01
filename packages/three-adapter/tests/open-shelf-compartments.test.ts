// Wave 5B7 / ADR 0047: an open shelf's compartment count follows the vertical clearance it was
// built into, not the row it landed in.
//
// Everything here is asserted on the **measured y** of the boards in the built group rather than on
// the argument handed to the builder, because the number the customer counts is compartments and
// the builder's parameter counts interior boards. A test that read the parameter back could pass
// with the boards in the wrong places, and an off-by-one reading of the report ("3 shelves") is the
// exact mistake the record was written to make unpassable.
import { MIN_SPAN_M, toMetres } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM,
} from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M1's parity epsilon, reused wherever a criterion asks for an exact number. */
const FLOAT_EPSILON_METRES = 1e-6;

const MIDDLE_ROW_HEIGHT_M = 0.7;
const TOP_ROW_HEIGHT_M = 0.4;
const SHELF_WIDTH_M = 0.6;
const SHELF_DEPTH_M = 0.33;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function buildOpenShelf(heightM: number): THREE.Object3D {
  const body = buildCatalogBody(kit, "open-shelf", {
    widthM: SHELF_WIDTH_M,
    heightM,
    depthM: SHELF_DEPTH_M,
  });
  body.updateMatrixWorld(true);
  return body;
}

function boardCentreY(body: THREE.Object3D, name: string): number {
  const board = body.getObjectByName(name);
  if (!board) throw new Error(`open shelf has no board named "${name}"`);
  return board.getWorldPosition(new THREE.Vector3()).y;
}

/** The interior boards only — `shelf_top` and `shelf_bottom` close the carcass and are not
 *  compartment dividers. Ordered bottom-up by what was measured, not by the order they were added. */
function interiorCentresY(body: THREE.Object3D): number[] {
  const centres: number[] = [];
  body.traverse((child) => {
    if (/^shelf_\d+$/.test(child.name)) {
      centres.push(child.getWorldPosition(new THREE.Vector3()).y);
    }
  });
  return centres.sort((a, b) => a - b);
}

function compartmentCount(heightM: number): number {
  return interiorCentresY(buildOpenShelf(heightM)).length + 1;
}

describe("an open shelf's compartments follow its clearance", () => {
  it("gives the middle row's 700 mm three compartments and the top row's 400 mm two", () => {
    expect(compartmentCount(MIDDLE_ROW_HEIGHT_M)).toBe(3);
    expect(compartmentCount(TOP_ROW_HEIGHT_M)).toBe(2);
  });

  it("flips at the threshold, to the millimetre", () => {
    const thresholdM = toMetres(OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM);
    const oneMillimetreM = toMetres(1);

    expect(compartmentCount(thresholdM)).toBe(2);
    expect(compartmentCount(thresholdM + oneMillimetreM)).toBe(3);
  });

  it("never leaves fewer than two compartments or more than three across 300–700 mm", () => {
    for (let heightMm = 300; heightMm <= 700; heightMm += 1) {
      const count = compartmentCount(toMetres(heightMm));
      expect({ heightMm, count }).toEqual({
        heightMm,
        count: heightMm > OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM ? 3 : 2,
      });
    }
  });

  it("still builds a whole carcass at §4's smallest span", () => {
    const body = buildOpenShelf(MIN_SPAN_M);

    for (const name of ["side_left", "side_right", "shelf_top", "shelf_bottom"])
      expect(body.getObjectByName(name)).toBeDefined();
    expect(interiorCentresY(body)).toHaveLength(1);

    const box = new THREE.Box3().setFromObject(body);
    expect(box.max.y - box.min.y).toBeCloseTo(MIN_SPAN_M, 6);
  });

  it.each([
    { where: "middle row", heightM: MIDDLE_ROW_HEIGHT_M, interior: 2 },
    { where: "top row", heightM: TOP_ROW_HEIGHT_M, interior: 1 },
  ])(
    "spaces the $where's $interior interior board(s) evenly inside the carcass",
    ({ heightM, interior }) => {
      const body = buildOpenShelf(heightM);
      const centres = interiorCentresY(body);
      const bottomY = boardCentreY(body, "shelf_bottom");
      const topY = boardCentreY(body, "shelf_top");

      expect(centres).toHaveLength(interior);
      for (const centre of centres) {
        expect(centre).toBeGreaterThan(bottomY);
        expect(centre).toBeLessThan(topY);
      }

      // The dividers cut the full height into equal compartments, so every step between
      // consecutive boundaries — floor, each divider, ceiling — is the same. A wrong divisor puts
      // the last board on the ceiling and the first step out of step with the rest.
      const steps: number[] = [];
      let previousBoundary = 0;
      for (const boundary of [...centres, heightM]) {
        steps.push(boundary - previousBoundary);
        previousBoundary = boundary;
      }
      for (const step of steps) {
        expect(step).toBeCloseTo(heightM / (interior + 1), 6);
      }
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(
        FLOAT_EPSILON_METRES,
      );
    },
  );

  it("leaves the seeded open shelf's three compartments alone", () => {
    const seeded = kit.builders["open-shelf"]();
    seeded.updateMatrixWorld(true);

    expect(interiorCentresY(seeded)).toHaveLength(2);
  });
});
