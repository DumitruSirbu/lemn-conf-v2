// **Which meshes a body wears its colour on, declared by the builder that makes them.**
//
// Most bodies wear their colour on their fronts, and `isFrontMesh` (`finishes.ts`) has always been
// able to say so from the mesh name alone. The open shelf cannot be described that way. The owner
// ruled on 2026-09-09 (backlog entry 60) that it takes the kitchen's colour on its six boards —
// `side_left`, `side_right`, `shelf_top`, `shelf_bottom`, `shelf_1`, `shelf_2` — and **not** on its
// tiled `back_panel`, because the picture is a coloured shelf mounted on a wall rather than a
// coloured niche.
//
// **Why this is not a wider `FRONT_MESH_NAME`, measured rather than argued.** A census of every mesh
// in the seeded kitchen says those names are not the shelf's alone:
//
// | Mesh name | Bodies that build it |
// | --- | --- |
// | `side_left`, `side_right` | `base-dishwasher-600`, `base-sink-800`, `open-shelf-600`, `tall-oven-tower-600` |
// | `back_panel` | `base-dishwasher-600`, `base-sink-800`, `open-shelf-600`, `tall-oven-tower-600` |
// | `shelf_mid` | `tall-oven-tower-600` |
//
// A `side_|shelf_` pattern would therefore paint the carcass sides of a dishwasher, a sink base and
// an oven tower, and the oven tower's interior shelf — four bodies nobody ruled on, in a place a
// customer sees only when a door is open. And it would do worse than that: `isFrontMesh` is the one
// definition of *front* this package has, `cabinet-handle-meshes.ts` asks it from the other side to
// decide whether a handle belongs to a cabinet, and `apps/web/src/scene/kitchen-stage.tsx` repaints
// a whole room through `collectFronts(stage.room)`. Widening the pattern would silently move both.
//
// So the question a name cannot answer is asked of the builder, which is the only place that knows
// what it just made. `openShelf` wraps the six boards and leaves the back panel bare, and that line
// of the builder **is** the ruling — greppable from the geometry it describes, and impossible to get
// wrong for a body nobody meant to change, because no other builder wraps anything.
import * as THREE from "three";

import { isMesh } from "./three-guards.js";

/** `userData` is the only channel a mesh carries to its readers, and this is the one key that says
 *  *the customer's colour belongs on this surface*. Prefixed like every other key this package
 *  writes, so a stray `true` in a builder cannot be mistaken for it. */
const WEARS_THE_BODYS_FINISH_KEY = "lemnaria:wearsTheBodysFinish";

/**
 * **Declares that this mesh is one the body wears its colour on**, and returns it so a builder can
 * wrap a `box(...)` in place rather than naming a local and mutating it on the next line.
 *
 * A body whose finished surface is its fronts needs none of this: `isFrontMesh` already answers for
 * it from the name. This is for the bodies a name cannot describe, which today is the open shelf and
 * nothing else.
 */
export function wearsTheBodysFinish(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData[WEARS_THE_BODYS_FINISH_KEY] = true;
  return mesh;
}

/** Whether a builder declared this mesh a surface the body's colour belongs on. Absent means no,
 *  which is the right answer for every mesh in the kit but the open shelf's six boards — and it is
 *  safe to read absence as *no* here, unlike a catalogue declaration, because the alternative is a
 *  mesh that simply keeps the material its builder gave it. */
export function declaresItWearsTheBodysFinish(node: THREE.Object3D): boolean {
  return node.userData[WEARS_THE_BODYS_FINISH_KEY] === true;
}

/** The predicate `collectPaintedSurfaces` is built from, kept beside the writer so the key is
 *  spelled once. */
export function isDeclaredFinishSurface(
  node: THREE.Object3D,
): node is THREE.Mesh {
  return isMesh(node) && declaresItWearsTheBodysFinish(node);
}
