// Tearing a mounted stage down, ownership first.
//
// React Three Fiber never disposes a `<primitive>`: its reconciler skips disposal when
// `instance.type === 'primitive'`, deliberately, because a primitive's lifetime is owned outside
// React. `kitchen-stage.tsx` supplies its kit, room, lights, ground and contact blob as primitives,
// so **this** module is their teardown, and without it every client-side remount strands a full
// room's worth of GPU buffers, materials and canvas textures until the context goes.
//
// The order of the two rules below is the whole difficulty. A kit's geometries and materials are
// shared between the shell, every mounted body and the reference room, and disposing one that a
// live object still renders from produces a black or invisible object rather than an error. So:
// a **whole-stage** teardown may dispose kit-owned resources, because nothing survives it; a
// **partial** teardown (the reference room's discarded bodies) may dispose only what no surviving
// object references.
import type * as THREE from "three";

import {
  addGpuResources,
  collectObjectResources,
  createGpuResources,
  disposeGpuResources,
  withoutSharedResources,
} from "./gpu-resources.js";
import {
  assertKitIsLive,
  kitOwnedResources,
  releaseKitOwnedResources,
} from "./kit-ownership.js";
import type { Kit } from "./kitchen-parts.js";
import type { LightRig } from "./stage.js";

/** Everything one mount of the stage allocated: the kit behind it, the object trees, and the rig. */
export interface KitStage {
  readonly kit: Kit;
  readonly room: THREE.Object3D;
  readonly ground: THREE.Object3D;
  readonly blob: THREE.Object3D;
  readonly lights: LightRig;
}

/**
 * Disposes every GPU resource this stage owns, each exactly once.
 *
 * Disposing the *shared* kit resources is safe here, and only here, on one condition: the kit and
 * the room it built must share a lifetime with this call, which is what `kitchen-stage.tsx` gets by
 * creating both in one mount-lifetime `useMemo` and calling this from that memo's own cleanup. It
 * is not a property of the kit — hand this a kit some other mount still builds from and the shared
 * buffers go out from under it.
 *
 * React's StrictMode makes the one exception real in development: it replays mount → unmount →
 * mount **without** re-running `useMemo`, so this cleanup runs over objects that are then handed
 * back to the re-run effects. Hence the released check — the replayed teardown is a no-op rather
 * than a second dispose. (Three.js survives the first one: geometries keep their CPU attributes and
 * a `CanvasTexture` keeps its canvas, so the cost is a re-upload, not a black scene.)
 */
export function disposeKitAndStage(stage: KitStage): void {
  if (kitOwnedResources(stage.kit.M).isReleased) return;

  const resources = createGpuResources();
  for (const root of [stage.room, stage.ground, stage.blob]) {
    collectObjectResources(root, resources);
  }
  addGpuResources(kitOwnedResources(stage.kit.M), resources);

  disposeGpuResources(resources);
  releaseKitOwnedResources(stage.kit.M);
  disposeLightRig(stage.lights);
}

/** The bodies a partial build dropped, and the ones it kept. */
export interface DiscardedBodyDisposal {
  readonly kit: Kit;
  readonly discarded: readonly THREE.Object3D[];
  readonly retained: readonly THREE.Object3D[];
}

/**
 * Disposes what the discarded bodies alone allocated.
 *
 * `buildKitchenShell` builds the whole 32-child reference room and keeps five children; the other
 * 27 carry geometry that is theirs alone — plain boxes, planes, lathes, cylinders — and nothing
 * released it. Its shared resources are excluded twice over: kit-owned ones by the kit's own
 * record, and anything a retained child still references by the survivor set, which also covers a
 * geometry or material two builders happen to hand to both a kept and a dropped body.
 */
export function disposeDiscardedBodies(input: DiscardedBodyDisposal): void {
  // A released kit reports owning nothing, which here would read as "none of this is shared" and
  // free every cached buffer the memo will still hand to the next body built from it. Reaching this
  // with a dead kit is a lifetime bug in the caller, so it says so rather than disposing.
  assertKitIsLive(input.kit.M);

  const dropped = createGpuResources();
  for (const body of input.discarded) collectObjectResources(body, dropped);

  const survivors = createGpuResources();
  for (const body of input.retained) collectObjectResources(body, survivors);
  addGpuResources(kitOwnedResources(input.kit.M), survivors);

  disposeGpuResources(withoutSharedResources(dropped, survivors));
}

/** A directional light's shadow map is a render target of its own, and only `dispose` frees it. */
function disposeLightRig(lights: LightRig): void {
  lights.hemisphere.dispose();
  lights.key.dispose();
  lights.fill.dispose();
}

/**
 * Disposes a kit and the one room it built, and nothing else — the **narrower** of this module's two
 * entry points, added by M6 wave 6K-e.
 *
 * `disposeKitAndStage` keeps its precondition unchanged and stays the one a mounted stage uses. This
 * exists for a kit that was never mounted: the transient one a `BodyProbeFactory` builds to measure
 * a depth change at the depth it is moving to, which lives for one command and is released when it
 * ends. Such a kit has a room, because `makeKit`'s builders make one, but it has **no** shadow
 * ground, no contact blob and no light rig — those belong to a stage, and this owns none of them.
 *
 * **What it owns, stated because SCENE-002's ownership story is what this extends.** It frees the
 * kit's own shared geometries, materials and canvas textures, plus whatever the room it is handed
 * holds, and it marks the kit released through the same `kitOwnedResources` record
 * `disposeKitAndStage` uses — never a second bookkeeping of what a kit allocated. It owns no light
 * rig and disposes none.
 *
 * **The same precondition as its sibling, for the same reason**: the kit and the room must share a
 * lifetime with this call. Hand it a kit some mounted stage still renders from and the shared
 * buffers go out from under that stage — a black or invisible object rather than an error, which is
 * why ADR 0074 refused the narrow kit-swap shape. A factory that returns the *standing* stage's own
 * probe must therefore return a lease whose `release` does nothing; only a kit this call created may
 * be passed here.
 *
 * **The room is optional because a kit can outlive the failure to build one** (M7 wave 7F4a). A
 * `BodyProbeFactory` allocates the kit first and builds its room second, so a builder that throws —
 * a device out of memory once the textures have baked — leaves a fully allocated kit and no room at
 * all. Without this arm there was no call that could free it, and the allocating site could not keep
 * ADR 0076 decision 3's promise. Nothing is lost by the omission: a room that threw mid-build was
 * never returned, so its part-built objects are unreachable from here either way, and the kit's own
 * shared geometries, materials and canvas textures — which is what `makeKit` allocated — are freed
 * exactly as they are on the ordinary path.
 */
export function disposeKit(kit: Kit, room?: THREE.Object3D): void {
  if (kitOwnedResources(kit.M).isReleased) return;

  const resources = createGpuResources();
  if (room !== undefined) collectObjectResources(room, resources);
  addGpuResources(kitOwnedResources(kit.M), resources);

  disposeGpuResources(resources);
  releaseKitOwnedResources(kit.M);
}
