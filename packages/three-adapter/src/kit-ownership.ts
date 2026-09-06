// Which GPU resources belong to a **kit** rather than to one body.
//
// `disposeUnsharedGeometries` already answers that question for geometry, and states why it has to
// be answered at all: a kit's `chamferBox` buffers are shared by every mesh of that size in every
// body, so disposing one from a body being torn down deletes a survivor's buffers, and three.js
// keeps the CPU-side attributes — the survivor silently re-uploads or renders black instead of
// throwing. The same question has to be answerable for **materials and textures** before a whole
// stage can be torn down, because `kit.M`'s materials and their canvas maps are shared exactly the
// same way, as are the finish and black-handle materials derived from them.
//
// Ownership is therefore *recorded as the kit builds*, never inferred at teardown from what a tree
// happens to reference: an inferred answer is a guess about the objects that are still alive, and
// this is the one place where a wrong guess does not raise an error.
import type * as THREE from "three";

import type { KitMaterials } from "./kitchen-parts.js";

/** Every shared GPU resource one kit created. The sets are live: `makeKit`'s geometry cache keeps
 *  filling `geometries` as builders ask for new box sizes. */
export interface KitOwnedResources {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
  readonly textures: Set<THREE.Texture>;
  /** True once `disposeKitAndStage` has freed them. A released kit is dead: the geometries its
   *  `chamferBox` memo would still hand out, and the materials its builders would still assign,
   *  have all been disposed. */
  isReleased: boolean;
}

/** Keyed on the kit's `KitMaterials` because that object is the kit's identity everywhere the
 *  derived materials are reached from — `applyFinish` and `applyBlackHandleMaterial` are handed
 *  `M`, not a `Kit` — and weakly so an abandoned kit's registration dies with it. */
const resourcesByKit = new WeakMap<KitMaterials, KitOwnedResources>();

const derivedMaterialsByKit = new WeakMap<
  KitMaterials,
  Map<string, THREE.Material>
>();

/** The bounded memo, kept apart from the one above so that an open key space can never crowd out a
 *  closed one: the black handle and the declared decors are built once and must stay built. */
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
 * A material derived from this kit's own materials, built once per kit per `key` and owned by the
 * kit from that moment on.
 *
 * One memo for both callers (a recoloured finish, the black handle) rather than a `WeakMap` in each
 * module: the cache and the ownership record have to agree, or `releaseKitOwnedResources` would
 * dispose a material a later `applyFinish` could still hand out.
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
  /** The most materials this key space may retain per kit. Every caller derives it from what the
   *  product can wear at once rather than picking a number: see `finishes.ts`. */
  readonly capacity: number;
}

/**
 * A derived material for a key space the **customer** can enlarge without limit — built once per
 * kit per `key` as `deriveKitMaterial` does, but retained only while it is one of the `capacity`
 * most recently asked for.
 *
 * `deriveKitMaterial`'s memo may be unbounded because both its key spaces are closed and small: one
 * black handle, and one entry per declared decor, which `Record<PaletteEntryId, …>` checks at
 * compile time. A free colour has no such table. `<input type="color">` fires React's `onChange` on
 * the native `input` event, which Chrome and Safari raise continuously while the picker is dragged,
 * so one drag across the gradient asks for hundreds of distinct keys — and an unbounded memo turns
 * every one of them into a clone held until `disposeKitAndStage`.
 *
 * **The evicted material is disposed here** rather than left to the teardown, because leaving the
 * memo also removes it from the kit's ownership record and no other reader would then free it. That
 * is safe for the caller this exists for: a free colour clones `M.door`, which samples no map, so
 * the disposal releases that clone's own shader program and nothing shared. A front that has not
 * re-signed since may still be assigned an evicted material — three.js re-initialises a material it
 * is asked to render after a dispose, so the cost is one program re-acquisition rather than a black
 * front, and the next sync misses the memo and rebuilds it.
 */
export function deriveBoundedKitMaterial(
  M: KitMaterials,
  request: BoundedMaterialRequest,
  build: () => THREE.Material,
): THREE.Material {
  const derived = boundedMaterialsFor(M);
  const cached = derived.get(request.key);
  if (cached) {
    // Re-inserted so the map's insertion order stays least-recently-asked-for first, which is what
    // `evictBeyondCapacity` walks: a colour still on screen is asked for on every re-sign.
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
 * The sets are emptied **in place** and the record is kept, rather than the `WeakMap` entry being
 * deleted: `makeKit` captured this exact object in a closure, and its `ownsGeometry` answers from
 * it. Delete the entry and the next reader builds a second, empty record — the kit's own cache then
 * says "mine" about a geometry every other caller is told is unowned, which is the one disagreement
 * that ends with a shared buffer disposed out from under a live object. One record, one answer.
 *
 * The derived-material memo is cleared separately because that is what the release is *for*: no
 * `applyFinish` may be handed back a material this teardown has just disposed.
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

/** Refuses a question that only makes sense about a live kit. Its answer after a release would be
 *  "this kit owns nothing", which reads as "everything you found is yours to dispose" — so callers
 *  that would act on it ask here first and fail loudly instead. */
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

/** Drops the oldest entries until the memo is back inside its ceiling, disposing each and dropping
 *  it from the kit's ownership record — the two have to move together, or a teardown would dispose
 *  a material this memo could still hand out, or leave one nothing ever frees. */
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
