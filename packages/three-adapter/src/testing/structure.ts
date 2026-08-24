// Test-only. Reduces a built `THREE.Object3D` tree to the facts the M1 fidelity gate asserts on:
// the mesh-name set, the parent/child hierarchy, each node's transform and visibility, its
// material name, and each mesh's outer dimensions.
import * as THREE from "three";

import { isMesh } from "../three-guards.js";

export interface StructureNode {
  name: string;
  kind: string;
  geometry: string | null;
  material: string | null;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  /** Outer size of the mesh geometry (metres), chamfer included. `null` for non-meshes. */
  size: [number, number, number] | null;
  children: StructureNode[];
}

function geometrySize(mesh: THREE.Mesh): [number, number, number] {
  const geometry = mesh.geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) throw new Error(`Mesh ${mesh.name} has no computable bounding box`);
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}

function materialName(mesh: THREE.Mesh): string {
  const material = mesh.material;
  return Array.isArray(material)
    ? material.map((m) => m.name).join("+")
    : material.name;
}

export function describeStructure(object: THREE.Object3D): StructureNode {
  const mesh = isMesh(object) ? object : null;
  return {
    name: object.name,
    kind: object.type,
    geometry: mesh ? mesh.geometry.type : null,
    material: mesh ? materialName(mesh) : null,
    visible: object.visible,
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
    size: mesh ? geometrySize(mesh) : null,
    children: object.children.map(describeStructure),
  };
}

/** Every mesh name in the tree, in traversal order. Duplicates are kept: the gate cares that the
 *  same names appear the same number of times, not merely that the sets intersect. */
export function meshNames(object: THREE.Object3D): string[] {
  const names: string[] = [];
  object.traverse((o) => {
    if (isMesh(o)) names.push(o.name);
  });
  return names;
}

export function findMesh(object: THREE.Object3D, name: string): THREE.Mesh {
  const found = findMeshes(object, name)[0];
  if (!found) throw new Error(`No mesh named ${name} in ${object.name}`);
  return found;
}

export function findMeshes(object: THREE.Object3D, name: string): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  object.traverse((o) => {
    if (isMesh(o) && o.name === name) meshes.push(o);
  });
  return meshes;
}

/** World-space axis-aligned bounds of a named mesh, after the tree's transforms are applied. */
export function worldBox(
  root: THREE.Object3D,
  mesh: THREE.Object3D,
): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(mesh);
}

/** The chamfer, measured off the geometry rather than assumed.
 *
 *  A chamfered box extrudes a shape inset by `r` and bevels it back out to nominal size, so the
 *  extrusion's end face is the un-beveled contour: `nominalWidth/2 − maxX(endFace)` is exactly the
 *  chamfer that was applied. */
export function chamferInset(mesh: THREE.Mesh, nominalWidth: number): number {
  const position = mesh.geometry.getAttribute("position");
  mesh.geometry.computeBoundingBox();
  const maxZ = mesh.geometry.boundingBox?.max.z ?? 0;
  let widest = 0;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getZ(i) - maxZ) < 1e-9) {
      widest = Math.max(widest, Math.abs(position.getX(i)));
    }
  }
  return nominalWidth / 2 - widest;
}
