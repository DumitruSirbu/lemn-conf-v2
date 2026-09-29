// M7B wave U4 adversarial QA — the right corner's anchors, swept (ADR 0132 d2; criterion 1).
//
// Over Us at both extremes of every wall, B ≠ C both ways and odd widths: row 19's seat mirrored, the
// right corner's pieces as the mirror image of the left corner's twins, no two bodies sharing a
// volume, and the base return's stone butting the X-leg's.
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";

import { isMesh } from "../src/three-guards.js";
import { installHeadlessDocument } from "./support/headless-canvas.js";
import {
  labelOf,
  mountedBodies,
  mountedById,
  mountU,
  namedMeshBox,
  SWEPT_US,
  worldBox,
} from "./support/u-scene.js";

/** ADR 0025, row 19's named exception: the corner X-leg seats 20 mm into wall A. */
const X_LEG_SEAT_M = -0.02;
const EXACT_M = 1e-6;
/** A shared face between two touching boxes computes to a sliver of this order, never a volume. */
const NO_VOLUME_M3 = 1e-9;
const LEFT_TO_RIGHT_TWIN = [
  ["p25", "right-p25"],
  ["p26", "right-p26"],
  ["p9", "right-p9"],
  ["p21", "right-p21"],
] as const;

beforeAll(() => {
  installHeadlessDocument();
});

function volumeOf(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE.Vector3());
  return size.x * size.y * size.z;
}

describe.each(
  SWEPT_US.map((dimensions) => [labelOf(dimensions), dimensions] as const),
)("%s: the right corner's anchors (criterion 1)", (_label, dimensions) => {
  const scene = mountU(dimensions);
  const widthM = dimensions.widthMm / 1000;

  it("seats the right X-leg at −0.020 and its far edge on wall C's plane, like its left twin at 0", () => {
    const left = worldBox(mountedById(scene, "p25"));
    const right = worldBox(mountedById(scene, "right-p25"));

    expect(right.min.z).toBeCloseTo(X_LEG_SEAT_M, 6);
    expect(widthM - right.max.x).toBeCloseTo(left.min.x, 6);
  });

  // ADR 0132 d2: the right corner is sized as the left corner of the L room (W, C), so its twin is
  // the left corner of a U whose wall B is as long as this U's wall C — not this U's own left corner
  // when B ≠ C.
  const twinScene = mountU({ ...dimensions, depthMm: dimensions.wallCMm });

  it.each(LEFT_TO_RIGHT_TWIN)(
    "draws %s's twin %s as its mirror image in x = W / 2",
    (leftId, rightId) => {
      const placed = scene.design.placements.some((p) => p.id === rightId);
      expect(twinScene.design.placements.some((p) => p.id === leftId)).toBe(
        placed,
      );
      if (!placed) return;
      const left = worldBox(mountedById(twinScene, leftId));
      const right = worldBox(mountedById(scene, rightId));

      expect(right.min.x).toBeCloseTo(widthM - left.max.x, 6);
      expect(right.max.x).toBeCloseTo(widthM - left.min.x, 6);
      expect(right.min.y).toBeCloseTo(left.min.y, 6);
      expect(right.max.y).toBeCloseTo(left.max.y, 6);
      expect(right.min.z).toBeCloseTo(left.min.z, 6);
      expect(right.max.z).toBeCloseTo(left.max.z, 6);
    },
  );

  it("lets no two bodies' meshes share a volume", () => {
    const meshes: {
      readonly id: string;
      readonly name: string;
      readonly box: THREE.Box3;
    }[] = [];
    for (const body of mountedBodies(scene.stage)) {
      const id = String(body.userData["placementId"]);
      body.traverse((node) => {
        if (isMesh(node) && node.visible)
          meshes.push({ id, name: node.name, box: worldBox(node) });
      });
    }

    const shared: string[] = [];
    meshes.forEach((a, index) => {
      for (const b of meshes.slice(index + 1)) {
        if (a.id === b.id) continue;
        if (volumeOf(a.box.clone().intersect(b.box)) > NO_VOLUME_M3) {
          shared.push(`${a.id}.${a.name} × ${b.id}.${b.name}`);
        }
      }
    });

    expect(shared).toEqual([]);
  });

  it("butts the base return's worktop against the X-leg's at the A∩C corner, as the left corner does", () => {
    const gapOf = (xLegId: string, returnId: string) => {
      const xLeg = namedMeshBox(mountedById(scene, xLegId), "countertop");
      const ret = namedMeshBox(mountedById(scene, returnId), "countertop");
      return {
        overlap: volumeOf(xLeg.clone().intersect(ret)),
        zGap: ret.min.z - xLeg.max.z,
        sameTop: ret.max.y - xLeg.max.y,
      };
    };

    const left = gapOf("p25", "p26");
    const right = gapOf("right-p25", "right-p26");
    expect(left.overlap).toBeLessThanOrEqual(NO_VOLUME_M3);

    expect(right.overlap).toBeLessThanOrEqual(NO_VOLUME_M3);
    expect(right.zGap).toBeCloseTo(left.zGap, 6);
    expect(right.zGap).toBeGreaterThanOrEqual(-EXACT_M);
    expect(right.sameTop).toBeCloseTo(left.sameTop, 6);
  });
});
