// What the corner wall unit's suites share (M7C wave C2): the unit's width and the door figures it is
// measured against, a kit built as the product builds it, and the box arithmetic both files use.
// Test infrastructure only; nothing here is production code.
import { wallCarcassDepthMm } from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { makeKit, type Kit } from "../../src/kitchen-parts.js";
import { isMesh } from "../../src/three-guards.js";
import { createHeadlessCanvas } from "./headless-canvas.js";
import { findMesh, worldBox } from "./structure.js";

export const UNIT_WIDTH_M = 0.9;
export const DOOR_THICKNESS_M = 0.018;
export const GAP_M = 0.004;

export const AXES = ["x", "y", "z"] as const;

/** A kit as `kitchen-stage.tsx` builds it: the cabinet depth and the wall depth the map gives for it. */
export function productKitAt(cabinetDepthMm: number): Kit {
  return makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
}

export function overlapM(
  one: THREE.Box3,
  other: THREE.Box3,
  axis: "x" | "y" | "z",
): number {
  return (
    Math.min(one.max[axis], other.max[axis]) -
    Math.max(one.min[axis], other.min[axis])
  );
}

export function boxOf(root: THREE.Object3D, name: string): THREE.Box3 {
  return worldBox(root, findMesh(root, name));
}

export function centreOf(box: THREE.Box3): THREE.Vector3 {
  return box.getCenter(new THREE.Vector3());
}

export function sizeOf(box: THREE.Box3): THREE.Vector3 {
  return box.getSize(new THREE.Vector3());
}

export function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node)) meshes.push(node);
  });
  return meshes;
}
