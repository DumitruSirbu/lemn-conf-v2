// Tearing a mounted stage down, ownership first. React Three Fiber never disposes a `<primitive>` (its lifetime is
// owned outside React), and `kitchen-stage.tsx` supplies its kit, room, lights, ground and blob as primitives, so this
// module is their teardown: without it every remount strands a room's worth of GPU buffers. Order matters: a kit's
// resources are shared by the shell, every mounted body and the reference room, and disposing one a live object renders
// from gives a black or invisible object, not an error. A whole-stage teardown may dispose kit-owned resources; a
// partial one only what no surviving object references.
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
 * Disposes every GPU resource this stage owns, each exactly once. Disposing the shared kit resources is safe only
 * because the kit and the room it built share a lifetime with this call (`kitchen-stage.tsx` creates both in one
 * `useMemo` and calls this from its cleanup); it is not a property of the kit. StrictMode replays mount, unmount, mount
 * without re-running `useMemo`, so the released check makes the replayed teardown a no-op (three.js survives the first:
 * CPU attributes and canvases stay, so the cost is a re-upload).
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
 *
 * Disposes what the discarded bodies alone allocated: `buildKitchenShell` builds the whole reference room and keeps
 * five children, and the rest carry geometry that is theirs alone. Shared resources are excluded twice: kit-owned ones
 * by the kit's record, and anything a retained child references by the survivor set (which also covers a geometry or
 * material handed to both a kept and a dropped body).
 *
 */
export function disposeDiscardedBodies(input: DiscardedBodyDisposal): void {
  // A released kit reports owning nothing, which would read as "none of this is shared" and free buffers the memo still
  // hands out; reaching here with a dead kit is a caller lifetime bug, so this throws.
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
 *
 * Disposes a kit and the one room it built, and nothing else: the narrower entry point, for a kit that was never
 * mounted (the transient one a `BodyProbeFactory` builds to measure a depth change). Such a kit has a room but no
 * shadow ground, contact blob or light rig. It frees the kit's shared geometries, materials and canvas textures plus
 * what the room holds, and marks the kit released through the same `kitOwnedResources` record as `disposeKitAndStage`.
 *
 * Same precondition: the kit and room must share a lifetime with this call, or the shared buffers go out from under a
 * mounted stage (ADR 0074 refused the narrow kit-swap shape). A factory that returns the standing stage's own probe
 * must return a lease whose `release` does nothing.
 *
 * `room` is optional because a kit can outlive a failed room build: the factory allocates the kit first, so a throwing
 * builder leaves an allocated kit and no room, and nothing else could free it (ADR 0076 decision 3).
 *
 */
export function disposeKit(kit: Kit, room?: THREE.Object3D): void {
  if (kitOwnedResources(kit.M).isReleased) return;

  const resources = createGpuResources();
  if (room !== undefined) collectObjectResources(room, resources);
  addGpuResources(kitOwnedResources(kit.M), resources);

  disposeGpuResources(resources);
  releaseKitOwnedResources(kit.M);
}
