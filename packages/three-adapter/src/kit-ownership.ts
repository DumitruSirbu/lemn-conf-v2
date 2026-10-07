// Which GPU resources belong to a kit rather than to one body. A kit's `chamferBox` buffers and `kit.M`'s materials and
// canvas maps, and the finish and black-handle materials derived from them, are shared by every body, so disposing one
// from a body being torn down deletes a survivor's resource: three.js then re-uploads or renders black instead of
// throwing. Ownership is therefore recorded as the kit builds, never inferred at teardown from what a live tree
// references.
import type * as THREE from "three";

import type { KitMaterials } from "./kitchen-parts.js";

/** Every shared GPU resource one kit created. The sets are live: `makeKit`'s geometry cache keeps filling
 *  `geometries`. */
export interface KitOwnedResources {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
  readonly textures: Set<THREE.Texture>;
  /** True once `disposeKitAndStage` has freed them: a released kit is dead, its memoised geometries and materials all
   *  disposed. */
  isReleased: boolean;
}

/** Keyed on the kit's `KitMaterials`, the kit's identity wherever derived materials are reached (`applyFinish` and
 *  `applyBlackHandleMaterial` take `M`, not a `Kit`); weak, so an abandoned kit's registration dies with it. */
const resourcesByKit = new WeakMap<KitMaterials, KitOwnedResources>();

const derivedMaterialsByKit = new WeakMap<
  KitMaterials,
  Map<string, THREE.Material>
>();

/** The bounded memo, kept apart so an open key space can never crowd out a closed one: the black handle and the
 *  declared decors are built once and must stay built. */
const boundedMaterialsByKit = new WeakMap<
  KitMaterials,
  Map<string, THREE.Material>
>();

/** This kit's ownership record, created on first use. */
export function kitOwnedResources(M: KitMaterials): KitOwnedResources {
  const existing = resourcesByKit.get(M);
  if (existing) return existing;

  const created: KitOwnedResources = {
    geometries: new Set<THREE.BufferGeometry>(),
    materials: new Set<THREE.Material>(),
    textures: new Set<THREE.Texture>(),
    isReleased: false,
  };
  resourcesByKit.set(M, created);
  return created;
}

/**
 * A material derived from this kit's own, built once per kit per `key` and owned by the kit from then on. One memo
 * serves both callers, so the cache and the ownership record agree: otherwise `releaseKitOwnedResources` could dispose
 * a material a later `applyFinish` still hands out.
 */
export function deriveKitMaterial(
  M: KitMaterials,
  key: string,
  build: () => THREE.Material,
): THREE.Material {
  const derived = derivedMaterialsFor(M);
  const cached = derived.get(key);
  if (cached) return cached;

  const material = build();
  derived.set(key, material);
  kitOwnedResources(M).materials.add(material);
  return material;
}

/** A key in a memo that has a ceiling, and what that ceiling is. */
export interface BoundedMaterialRequest {
  readonly key: string;
  /** The most materials this key space may retain per kit; callers derive it from what the product can wear at once
   *  (see `finishes.ts`). */
  readonly capacity: number;
}

/**
 * A derived material for a key space the customer can enlarge without limit: built once per kit per `key` as
 * `deriveKitMaterial` does, but retained only while it is one of the `capacity` most recently asked for. A colour
 * picker fires `onChange` continuously while dragged (Chrome, Safari), so one drag asks for hundreds of keys.
 *
 * The evicted material is disposed here: leaving the memo also removes it from the ownership record, so no teardown
 * would free it. That is safe for a free colour, which clones `M.door` (no map), so only its own shader program is
 * released. A front that has not re-signed may still hold an evicted material; three.js re-initialises a disposed
 * material it is asked to render, so the cost is one program re-acquisition, not a black front.
 */
export function deriveBoundedKitMaterial(
  M: KitMaterials,
  request: BoundedMaterialRequest,
  build: () => THREE.Material,
): THREE.Material {
  const derived = boundedMaterialsFor(M);
  const cached = derived.get(request.key);
  if (cached) {
    // Re-inserted so insertion order stays least-recently-asked-for first, which `evictBeyondCapacity` walks.
    derived.delete(request.key);
    derived.set(request.key, cached);
    return cached;
  }

  const material = build();
  derived.set(request.key, material);
  kitOwnedResources(M).materials.add(material);
  evictBeyondCapacity(M, request.capacity);
  return material;
}

/**
 * Marks a kit dead once its resources have been disposed. Called only by `disposeKitAndStage`.
 *
 * The sets are emptied in place and the record kept: `makeKit`'s closure captured this exact object and its
 * `ownsGeometry` answers from it, so deleting the entry would let the next reader build a second, empty record. The
 * kit's cache would then claim a geometry every other caller is told is unowned, ending with a shared buffer disposed
 * under a live object. The derived-material memos are cleared too, so no `applyFinish` is handed a disposed material.
 */
export function releaseKitOwnedResources(M: KitMaterials): void {
  const owned = kitOwnedResources(M);
  owned.geometries.clear();
  owned.materials.clear();
  owned.textures.clear();
  owned.isReleased = true;
  derivedMaterialsByKit.delete(M);
  boundedMaterialsByKit.delete(M);
}

/** Refuses a question that only makes sense about a live kit: after a release, "this kit owns nothing" reads as
 *  "everything you found is yours to dispose", so callers ask here first and fail loudly. */
export function assertKitIsLive(M: KitMaterials): void {
  if (!kitOwnedResources(M).isReleased) return;
  throw new Error(
    "This kit's shared geometries and materials were disposed by disposeKitAndStage; build a new kit rather than reusing a released one",
  );
}

function derivedMaterialsFor(M: KitMaterials): Map<string, THREE.Material> {
  const existing = derivedMaterialsByKit.get(M);
  if (existing) return existing;

  const created = new Map<string, THREE.Material>();
  derivedMaterialsByKit.set(M, created);
  return created;
}

function boundedMaterialsFor(M: KitMaterials): Map<string, THREE.Material> {
  const existing = boundedMaterialsByKit.get(M);
  if (existing) return existing;

  const created = new Map<string, THREE.Material>();
  boundedMaterialsByKit.set(M, created);
  return created;
}

/** Drops the oldest entries until the memo is inside its ceiling, disposing each and dropping it from the ownership
 *  record: the two must move together, or a teardown disposes a material the memo could still hand out, or leaves one
 *  nothing frees. */
function evictBeyondCapacity(M: KitMaterials, capacity: number): void {
  const derived = boundedMaterialsFor(M);
  const owned = kitOwnedResources(M);

  for (const [key, material] of derived) {
    if (derived.size <= capacity) return;
    derived.delete(key);
    owned.materials.delete(material);
    material.dispose();
  }
}
