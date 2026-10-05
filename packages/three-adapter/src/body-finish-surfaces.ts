// Which meshes a body wears its colour on, declared by the builder that makes them (ADR 0099, "FRONT_MESH_NAME was
// deliberately not widened"). `isFrontMesh` is the one definition of a front: `cabinet-handle-meshes.ts` and the
// whole-room repaint in `kitchen-stage.tsx` depend on it, and `side_left`, `side_right` and `back_panel` are also built
// by the dishwasher, the sink and the oven tower, so a wider name pattern would paint their carcasses. The open shelf
// wraps its six boards and leaves its tiled `back_panel` bare. The corner bodies paint their solid carcass volumes
// (plus the return's `fixed_front` and the wall unit's `corner_closure` and `corner_stile`) and never what stands
// behind a door (`susan_pole`, `susan_tray`, `carcass_back`, `front_liner`), nor plinths, countertops or handles. The
// base legs are wrapped in their own builders; the wall returns cannot be (`wallCabinet` builds other bodies), so
// `wearsTheBodysFinishOnItsCarcassShell` is applied where the build id is known.
import * as THREE from "three";

import { isMesh } from "./three-guards.js";

/** The `userData` key saying the customer's colour belongs on this surface, prefixed like every key this package
 *  writes so a stray `true` in a builder cannot be mistaken for it. */
const WEARS_THE_BODYS_FINISH_KEY = "lemnaria:wearsTheBodysFinish";

/**
 * Declares that this mesh is one the body wears its colour on, and returns it so a builder can wrap a `box(...)` in
 * place. For bodies a name cannot describe (the open shelf's six boards, the base corner legs' carcass volumes);
 * `isFrontMesh` answers for the rest from the name.
 */
export function wearsTheBodysFinish(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData[WEARS_THE_BODYS_FINISH_KEY] = true;
  return mesh;
}

/** The one mesh `carcass` (`kitchen-parts.ts`) builds as the cabinet's solid volume (sides, top and underside), as
 *  opposed to the `carcass_back` board and the `front_liner` shadow gap. */
const CARCASS_SHELL_MESH_NAME = "carcass_shell";

/** The corner wall unit's (`wallCornerX`) meshes beyond its carcass that belong to the body's surface: the closure
 *  filling the depth behind the side wall's corner cabinet, and the stile carrying the door plane across the blind
 *  part. */
export const CORNER_WALL_CLOSURE_MESH_NAME = "corner_closure";
export const CORNER_WALL_STILE_MESH_NAME = "corner_stile";

const CORNER_WALL_UNIT_FINISH_SURFACES: readonly string[] = [
  CARCASS_SHELL_MESH_NAME,
  CORNER_WALL_CLOSURE_MESH_NAME,
  CORNER_WALL_STILE_MESH_NAME,
];

/** A body declared paintable on a mesh it does not build. Thrown, so a rename in `carcass` fails the build instead of
 *  silently un-painting a corner. */
export class NoSuchFinishSurfaceError extends Error {
  constructor(meshName: string) {
    super(`This body builds no mesh named "${meshName}" to wear its finish.`);
    this.name = "NoSuchFinishSurfaceError";
  }
}

/**
 * Declares that this body wears its colour on its carcass shell, for a body a builder cannot declare for: `wallCabinet`
 * also makes ordinary wall bodies, so a wrapper in the builder would paint bodies nobody ruled on. Only
 * `buildDecomposedBody` holds the build id that says a `wallCabinet` is a corner, so the declaration is made there.
 */
export function wearsTheBodysFinishOnItsCarcassShell(
  body: THREE.Group,
): THREE.Group {
  const shells: THREE.Mesh[] = [];
  body.traverse((node) => {
    if (isMesh(node) && node.name === CARCASS_SHELL_MESH_NAME) {
      shells.push(node);
    }
  });
  if (shells.length === 0) {
    throw new NoSuchFinishSurfaceError(CARCASS_SHELL_MESH_NAME);
  }
  for (const shell of shells) wearsTheBodysFinish(shell);
  return body;
}

/**
 * Declares that the corner wall unit wears its colour on its carcass shell, closure and stile: every surface that is
 * not a leaf (a front, which `isFrontMesh` already covers) nor the board or liner inside. Throws when one is missing,
 * so a rename in the builder fails the build, as `wearsTheBodysFinishOnItsCarcassShell` does.
 */
export function wearsTheBodysFinishOnTheCornerWallUnit(
  body: THREE.Group,
): THREE.Group {
  for (const meshName of CORNER_WALL_UNIT_FINISH_SURFACES) {
    const surfaces: THREE.Mesh[] = [];
    body.traverse((node) => {
      if (isMesh(node) && node.name === meshName) surfaces.push(node);
    });
    if (surfaces.length === 0) throw new NoSuchFinishSurfaceError(meshName);
    for (const surface of surfaces) wearsTheBodysFinish(surface);
  }
  return body;
}

/** Whether a builder declared this mesh a surface the body's colour belongs on. Absent means no, which is right for
 *  every other mesh: unlike a catalogue declaration, reading absence as "no" is safe, because the mesh keeps its
 *  builder's material. */
export function declaresItWearsTheBodysFinish(node: THREE.Object3D): boolean {
  return node.userData[WEARS_THE_BODYS_FINISH_KEY] === true;
}

/** The predicate `collectPaintedSurfaces` is built from, kept beside the writer so the key is spelled once. */
export function isDeclaredFinishSurface(
  node: THREE.Object3D,
): node is THREE.Mesh {
  return isMesh(node) && declaresItWearsTheBodysFinish(node);
}
