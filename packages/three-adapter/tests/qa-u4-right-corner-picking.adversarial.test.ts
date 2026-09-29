// M7B wave U4 adversarial QA — picking and the outline on the right X-leg and the base return, swept
// (ADR 0132 d2; criterion 3).
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { createPickingRaycaster, pick } from "../src/picking.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
import { installHeadlessDocument } from "./support/headless-canvas.js";
import {
  labelOf,
  mountedById,
  mountU,
  namedMeshBox,
  SWEPT_US,
  worldBox,
  type MountedU,
} from "./support/u-scene.js";

const EXACT_M = 1e-6;

beforeAll(() => {
  installHeadlessDocument();
});

function clickAlong(
  scene: MountedU,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): string | undefined {
  const raycaster = createPickingRaycaster();
  raycaster.set(origin, direction.clone().normalize());
  return pick(raycaster, scene.stage.solidsRoot, new THREE.Group())?.id;
}

function centreOf(box: THREE.Box3): THREE.Vector3 {
  return box.getCenter(new THREE.Vector3());
}

describe.each(
  SWEPT_US.map((dimensions) => [labelOf(dimensions), dimensions] as const),
)(
  "%s: picking and the outline on the right corner (criterion 3)",
  (_label, dimensions) => {
    const scene = mountU(dimensions);

    /** Above the worktop and below the wall row's 1.5 m, so the click is the base row's to answer. */
    const ABOVE_THE_WORKTOP_M = 1.2;

    it("selects the right X-leg from above its worktop, over the part the return does not cover", () => {
      const worktop = namedMeshBox(
        mountedById(scene, "right-p25"),
        "countertop",
      );
      const returnTop = namedMeshBox(
        mountedById(scene, "right-p26"),
        "countertop",
      );
      const aim = new THREE.Vector3(
        centreOf(worktop).x,
        ABOVE_THE_WORKTOP_M,
        (worktop.min.z + returnTop.min.z) / 2,
      );

      expect(clickAlong(scene, aim, new THREE.Vector3(0, -1, 0))).toBe(
        "right-p25",
      );
    });

    it("selects the right base return from above its worktop", () => {
      const aim = centreOf(
        namedMeshBox(mountedById(scene, "right-p26"), "countertop"),
      ).setY(ABOVE_THE_WORKTOP_M);

      expect(clickAlong(scene, aim, new THREE.Vector3(0, -1, 0))).toBe(
        "right-p26",
      );
    });

    it("selects the right base return from the room side, never its wall or its X-leg", () => {
      const box = worldBox(mountedById(scene, "right-p26"));
      const aim = new THREE.Vector3(box.min.x - 1, 0.4, centreOf(box).z);

      expect(clickAlong(scene, aim, new THREE.Vector3(1, 0, 0))).toBe(
        "right-p26",
      );
    });

    it.each(["right-p25", "right-p26"])(
      "outlines %s around its own extent, DoubleSide on the line only",
      (id) => {
        const stageRoot = new THREE.Group();
        stageRoot.add(scene.stage.solidsRoot);
        const target = mountedById(scene, id);

        const outline = buildSelectionOutline({
          target,
          parent: stageRoot,
          kind: "placement",
        });
        stageRoot.add(outline.group);
        stageRoot.updateMatrixWorld(true);
        const hull = worldBox(outline.visibleLine);
        const body = worldBox(target);

        expect(hull.containsBox(body.clone().expandByScalar(-EXACT_M))).toBe(
          true,
        );
        expect(hull.min.distanceTo(body.min)).toBeLessThan(0.01);
        expect(hull.max.distanceTo(body.max)).toBeLessThan(0.01);
        expect((outline.visibleLine.material as THREE.Material).side).toBe(
          THREE.DoubleSide,
        );
      },
    );
  },
);
