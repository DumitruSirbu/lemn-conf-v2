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
// wrong for a body nobody meant to change.
//
// **The corner ruling of 2026-09-09 added four bodies and one exception to that shape.** The owner:
// *"support setting custom color for all corner cabinet parts."* A second census, of the four corner
// bodies against the same kit, says which parts those are:
//
// | Body | Mesh | Material | Painted? |
// | --- | --- | --- | --- |
// | `base-corner-x-900` | `carcass` | `M.carcass` | **yes** — 900 mm of box behind a 280 mm door |
// | | `door_front` | `M.door` | yes, already, through `isFrontMesh` |
// | | `susan_pole`, `susan_tray` ×2 | `M.steel`, `M.interior` | no — the fittings inside it |
// | | `plinth`, `countertop`, handles | `M.dark`, `M.stone`, `M.steel` | no — not the body's finish |
// | `base-corner-return-320` | `carcass` | `M.carcass` | **yes** — a doorless solid box, all outward |
// | | `plinth`, `countertop` | `M.dark`, `M.stone` | no |
// | `wall-corner-return-570` (and `-top`) | `carcass_shell` | `M.carcass` | **yes** — sides and underside |
// | | `carcass_back` | `M.interior` | no — the board inside the box |
// | | `front_liner` | `M.shadowGap` | no — the gap reads as a shadow or not at all |
// | | `door_front` | `M.door` | yes, already |
// | | handles | `M.steel` | no |
//
// **All four carcasses are solid volumes**, which is what makes "paint the box" safe to say: none of
// them has a cavity, so a declaration on one cannot reach an interior surface. What a door would
// stand in front of is a separate mesh every time — `susan_pole` and `susan_tray` inside the X-leg,
// `carcass_back` and `front_liner` inside the wall returns — and each is left on the material its
// builder gave it.
//
// `base-corner-x-900` was first left bare on the opposite assumption: that its box is open behind its
// 280 mm door and painting it would recolour an interior a customer sees when that door opens.
// Every clause of that is false, and measurably. The box is a solid
// `box(0.9, 0.72, 0.6)`; the pole and both trays sit at z = −0.010, buried inside a volume spanning
// z ∈ [−0.30, +0.30], visible from no camera; and **this kit has no open-door state at all** —
// nothing in `scene-sync.ts` or the stage animates or hides a `door_front`. So the door never opens,
// and if it did it would show the same solid face that already stands bare for 620 mm beside it.
// `base-corner-x-900` and `base-corner-return-320` differ in how much of the box is uncovered — 620
// of 900 against all of it — and not in kind.
//
// The two base legs are wrapped in their own builders, as the shelf is. The two wall returns cannot
// be: `wallCabinet` builds five other seeded bodies, so a wrapper inside it would paint the wall run
// nobody ruled on. `wearsTheBodysFinishOnItsCarcassShell` below is that one exception, applied where
// the build id is known.
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
 * it from the name. This is for the bodies a name cannot describe: the open shelf's six boards, and
 * — since the owner's corner ruling of 2026-09-09 — the two base corner legs' carcass volumes.
 */
export function wearsTheBodysFinish(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData[WEARS_THE_BODYS_FINISH_KEY] = true;
  return mesh;
}

/** The one mesh `carcass` (`kitchen-parts.ts`) builds as the cabinet's own **solid volume** — the box
 *  whose sides, top and underside a customer sees, as opposed to the `carcass_back` board inside it
 *  and the `front_liner` that darkens the shadow gap. */
const CARCASS_SHELL_MESH_NAME = "carcass_shell";

/** A body that was declared paintable on a mesh it does not build. Thrown rather than returned so a
 *  rename in `carcass` fails the build that depends on it, instead of silently un-painting a corner
 *  the way `collectFronts` once silently un-painted the open shelf. */
export class NoSuchFinishSurfaceError extends Error {
  constructor(meshName: string) {
    super(`This body builds no mesh named "${meshName}" to wear its finish.`);
    this.name = "NoSuchFinishSurfaceError";
  }
}

/**
 * **Declares that this body wears its colour on its carcass shell**, for a body a *builder* cannot
 * declare it for.
 *
 * `wallCabinet` makes seven different seeded bodies and only two of them are corners, so the
 * wrapper-in-the-builder shape `openShelf` uses would paint five bodies nobody ruled on — the
 * failure mode `body-finish-surfaces.ts`'s own census exists to prevent. The corner-ness of a
 * `wallCabinet(0.57, 1)` is known one level up, in `buildDecomposedBody`, which is the only place
 * that holds the build id; so that is where the declaration is made, and this function is what makes
 * it a statement about a named surface rather than a `userData` write at a call site.
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

/** Whether a builder declared this mesh a surface the body's colour belongs on. Absent means no,
 *  which is the right answer for every mesh in the kit but the open shelf's six boards and the four
 *  corner bodies' carcasses — and it is safe to read absence as *no* here, unlike a catalogue
 *  declaration, because the alternative is a mesh that simply keeps the material its builder gave
 *  it. */
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
