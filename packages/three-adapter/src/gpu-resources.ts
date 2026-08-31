// Gathering the disposable GPU resources of a scene subtree, as sets.
//
// Sets, not lists, because "dispose exactly once" is the whole point: one `chamferBox` geometry is
// referenced by dozens of meshes and one `kit.M` material by hundreds, so a list would dispose the
// same buffer over and over, and any accounting built on it would be meaningless.
//
// Nothing here decides *whether* a resource may be disposed — that is ownership, and it is decided
// in `kit-ownership.ts` and applied in `kit-disposal.ts`.
import type * as THREE from "three";

import { isLine, isMesh, isTexture } from "./three-guards.js";

export interface GpuResources {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
  readonly textures: Set<THREE.Texture>;
}

export function createGpuResources(): GpuResources {
  return {
    geometries: new Set<THREE.BufferGeometry>(),
    materials: new Set<THREE.Material>(),
    textures: new Set<THREE.Texture>(),
  };
}

/** Adds every geometry, material and texture reachable from `root` — itself included.
 *
 *  Meshes and lines are the whole of it *by assumption*: this adapter's builders produce nothing
 *  else — no `InstancedMesh`, `Points`, `Sprite` or `SkinnedMesh`, no morph attributes, and no
 *  texture parked in `userData`. Adding one of those means adding it here too. */
export function collectObjectResources(
  root: THREE.Object3D,
  into: GpuResources,
): void {
  root.traverse((node) => {
    if (!isMesh(node) && !isLine(node)) return;
    into.geometries.add(node.geometry);
    for (const material of toMaterials(node.material)) {
      collectMaterialResources(material, into);
    }
  });
}

/** A material and the textures it samples. Materials do not dispose their own maps — a
 *  `CanvasTexture` outlives the material that referenced it — so the maps are collected by
 *  inspecting the material's own slots rather than by naming the ones this kit happens to use. */
export function collectMaterialResources(
  material: THREE.Material,
  into: GpuResources,
): void {
  if (into.materials.has(material)) return;
  into.materials.add(material);

  for (const slot of Object.values(material)) {
    if (isTexture(slot)) into.textures.add(slot);
  }
}

export function addGpuResources(from: GpuResources, into: GpuResources): void {
  for (const geometry of from.geometries) into.geometries.add(geometry);
  for (const material of from.materials)
    collectMaterialResources(material, into);
  for (const texture of from.textures) into.textures.add(texture);
}

/** The resources in `all` that `keep` does not also reference — the ones no surviving object is
 *  rendering from, and therefore the only ones a partial teardown may dispose. */
export function withoutSharedResources(
  all: GpuResources,
  keep: GpuResources,
): GpuResources {
  const unshared = createGpuResources();
  for (const geometry of all.geometries) {
    if (!keep.geometries.has(geometry)) unshared.geometries.add(geometry);
  }
  for (const material of all.materials) {
    if (!keep.materials.has(material)) unshared.materials.add(material);
  }
  for (const texture of all.textures) {
    if (!keep.textures.has(texture)) unshared.textures.add(texture);
  }
  return unshared;
}

/** Disposes each collected resource exactly once. Textures last: a material's map is still read by
 *  three.js's own `dispose` bookkeeping for the material that referenced it. */
export function disposeGpuResources(resources: GpuResources): void {
  for (const geometry of resources.geometries) geometry.dispose();
  for (const material of resources.materials) material.dispose();
  for (const texture of resources.textures) texture.dispose();
}

function toMaterials(
  material: THREE.Material | THREE.Material[],
): readonly THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
