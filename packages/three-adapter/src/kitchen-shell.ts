import {
  runEndPanelSeatM,
  toMetres,
  wallLengthMm,
  type DesignRoom,
  type Finish,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import type { Group, Mesh, Object3D } from "three";

import { applyFinish } from "./finishes.js";
import { disposeDiscardedBodies } from "./kit-disposal.js";
import { kitOwnedResources } from "./kit-ownership.js";
import {
  RUN_END_PANEL_NAME,
  RUN_END_PANEL_SEEDED_X_M,
  type Kit,
} from "./kitchen-parts.js";
import { floorDepthMm } from "./room-extent.js";
import { isMesh, isTexture, toMaterials } from "./three-guards.js";

/** The floor and the two wall planes run this far past the corner into the other wall's direction.
 *
 *  It is what stops the two planes ending in a visible seam where they meet, so it is a
 *  construction detail of the planes rather than a room dimension, and it is fixed: a
 *  **proportional** overhang would stop being a construction detail and become a lie about the
 *  room, and **butting** the two planes creates the seam the reference deliberately avoids. At a
 *  900 mm wall the drawn plane is 1200 mm and a third of it sits behind the corner — the accepted
 *  appearance of a minimum room, not a defect. */
const CORNER_OVERHANG_M = 0.3;

const FLOOR_NAME = "floor";
/** Wall A's plane: z = 0, fronts +Z, `rotation.y = 0`. */
const WALL_A_PLANE_NAME = "wall_back";
/** Wall B's plane: x = 0, fronts +X, `rotation.y = π/2`. */
const WALL_B_PLANE_NAME = "wall_left";
/** Wall C's plane: x = W, fronts −X, `rotation.y = −π/2`. The reference builder has no such wall, so
 *  the shell adds it the first time a U is drawn — never in an L or straight shell that has not been
 *  a U, which therefore keep exactly the reference's five children — and from then on hides it, never
 *  removes it, whenever the room is not a U. */
const WALL_C_PLANE_NAME = "wall_right";
const BACKSPLASH_NAME = "backsplash_wall_a";

/** The immutable room children in `docs/design/SPEC.md`'s L-shape scene. Customer bodies are
 * deliberately absent: `syncSolidBodies` is their sole owner and tags every one with a
 * `placementId` for §6.1 picking. */
const KITCHEN_L_SHELL_CHILD_NAMES = new Set([
  FLOOR_NAME,
  WALL_A_PLANE_NAME,
  WALL_B_PLANE_NAME,
  RUN_END_PANEL_NAME,
  BACKSPLASH_NAME,
]);

/** Builds the room shell the customer entered, without consulting the currently loaded design's
 * placements.
 *
 * The full reference builder remains the geometry source so the shell stays inside M1's 1e-6 m
 * fidelity gate. Its customer bodies are removed from a fixed shell manifest, never inferred from
 * current placement records: a placement deleted before this first build must not survive as an
 * untagged, unselectable reference ghost.
 *
 * **The drawn wall is the entered wall.** The builder's own room is one specific L-shape, and a
 * customer's room matches it in roughly one case in a hundred; the five children it hands back are
 * therefore resized to `room` before anyone sees them. A U's wall C is not among them — the builder
 * has none — and joins the shell only when a U is first drawn (`resizeShellToRoom`). Nothing here
 * reads a placement, a record, the catalogue or a cabinet depth — ADR 0083 decision 2: the room is
 * never a function of the depth. */
export function buildKitchenShell(kit: Kit, room: DesignRoom): Group {
  const shell = kit.builders["kitchen-l"]();
  const discarded = shell.children.filter(isCustomerBody);
  for (const child of discarded) shell.remove(child);
  // The reference builder is the geometry source, so this call allocates a whole 32-child room and
  // keeps five of it. Whatever the other 27 alone allocated is released here rather than left for
  // the garbage collector, which never frees a GPU buffer.
  disposeDiscardedBodies({ kit, discarded, retained: shell.children });
  resizeShellToRoom({ kit, shell, room });
  return shell;
}

function isCustomerBody(child: Object3D): boolean {
  return !KITCHEN_L_SHELL_CHILD_NAMES.has(child.name);
}

export interface ShellResizeInput {
  /** The kit that built `shell`. Its ownership record is what the replaced resources are returned
   *  to and the new ones are recorded in. */
  readonly kit: Kit;
  readonly shell: Object3D;
  readonly room: DesignRoom;
}

/**
 * Redraws the shell at `room`, and touches nothing else in the scene.
 *
 * **The anchor is wave 7F1's criterion 12, adopted rather than re-derived**: wall A's plane is
 * z = 0 fronting +Z, wall B's is x = 0 fronting +X, and both walk "along" from the corner they
 * share at (0, 0, 0). The convention is declared in the **domain**, at
 * `packages/configurator-domain/src/room-transforms.ts:29-49`, whose source is
 * `docs/design/DEVELOPMENT-SPEC.md` §2. It is cited here and not restated because a 2D plan that
 * disagrees with the room it produces is a defect no unit test on either side can catch — each
 * stays self-consistent, and only a customer holding the two views side by side would see it.
 *
 * **Every child but one moves.** The floor follows both floor axes (its depth is the farther of walls
 * B and C, M7B D12), wall A's plane follows `widthMm`, wall B's follows `depthMm`, wall C's (drawn
 * only for a U) stands at `x = widthMm` and follows `wallCMm`, every plane's height follows
 * `heightMm`, and the wall-A backsplash follows `widthMm` with its start pinned at the corner. The
 * run-end panel is not touched at all: ADR 0045 makes its seat a function of the **records**,
 * written by `syncRunEndPanel`, and widening the room for a fixed record set must leave it exactly
 * where it was. A U has no such panel to seat: `runEndPanelSeatM` answers none for it (M7B D11), so
 * the same sync hides it.
 *
 * **No body moves.** Customer bodies are `syncSolidBodies`' and are not children of the shell.
 */
export function resizeShellToRoom(input: ShellResizeInput): void {
  const { kit, shell, room } = input;
  if (isAlreadyDrawnAt(shell, room)) return;

  resizeFloor(kit, shellChild(shell, FLOOR_NAME), room);
  resizeWallAPlane(shellChild(shell, WALL_A_PLANE_NAME), room);
  resizeWallBPlane(shellChild(shell, WALL_B_PLANE_NAME), room);
  resizeWallCPlane(shell, room);
  resizeBacksplash(kit, shellChild(shell, BACKSPLASH_NAME), room);
  shell.userData[DRAWN_ROOM_KEY] = drawnRoomSignature(room);
}

/** ADR 0130 D8: a straight room has no wall B, so its plane stands in the shell **hidden, not
 *  removed** — 7H's in-place resize and the kit's ownership of the geometry are both untouched, and
 *  the probe and picking are unaffected (G11): the probe reads only `wall_back`, and `wall_left`
 *  carries no `placementId` at all — `pick`'s `firstSelectableHit`/`climbToSelectable` never climbs
 *  to it regardless of visibility (QA finding Q5: three's raycaster does not filter by visibility,
 *  `Raycaster.js:236-246` in the vendored 0.184). */
function wallBPlaneVisibleFor(room: DesignRoom): boolean {
  return room.shape !== "linear";
}

/** M7B D12: wall C exists only in a U. Like wall B's plane it is hidden, never removed, in every
 *  other room, for the same reasons. */
function wallCPlaneVisibleFor(room: DesignRoom): boolean {
  return room.shape === "U";
}

/**
 * Whether this shell already stands at these three dimensions.
 *
 * **A record of what was drawn, not a second authority on what the room is.** The design's room
 * remains the only answer to *what room is this*; this answers *what did I last draw*, which is the
 * same category as `kitchen-stage.tsx`'s `hasSeatedAStage` — a fact about work already done, kept
 * beside the thing it was done to.
 *
 * **By value, because identity is a property of the caller this module does not control.** Every
 * command path today spreads `{...design}` and leaves `room` the same object, so an identity check
 * would work — and would keep working right up until a save round-trip, a re-hydrate or a
 * `structuredClone` reconstructed it. At that point every design mutation would silently become
 * four geometry rebuilds and two clone-and-dispose cycles, on a handset, with nothing failing. A
 * value comparison costs three number reads and does not care how the room got here.
 *
 * It also makes the mounting effect's deliberate first redraw free: `kitchen-stage.tsx` calls this
 * on mount over a shell the memo has just drawn at this same room, and that call now returns here.
 */
function isAlreadyDrawnAt(shell: Object3D, room: DesignRoom): boolean {
  return shell.userData[DRAWN_ROOM_KEY] === drawnRoomSignature(room);
}

/** ADR 0130 D8: gains the shape, so an L and a straight room standing at the same three dimensions
 *  are not read as the same drawn picture — wall B's visibility is a function of the shape and
 *  nothing else in these three numbers says so. M7B D12 adds wall C's length, which a U alone has:
 *  it moves the floor's depth and wall C's plane, and nothing else in the signature says so. The
 *  shapes that have no wall C sign it as 0, so their signature differs from a U's at any C. */
function drawnRoomSignature(room: DesignRoom): string {
  const dimensions = `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
  return `${room.shape}:${dimensions}:c${String(wallLengthMm("C", room))}`;
}

/** Where the signature above is kept. On the shell rather than in a module-scope map, so it shares
 *  the shell's lifetime exactly: a shell that is dropped takes its record with it, and a second
 *  shell built from the same kit starts with none. */
const DRAWN_ROOM_KEY = "drawnRoom";

function resizeFloor(kit: Kit, floor: Mesh, room: DesignRoom): void {
  const drawnWidthM = drawnWallLengthM(room.widthMm);
  const drawnDepthM = drawnWallLengthM(floorDepthMm(room));
  const slab = boxSizeOf(floor);

  // The top face tiles across the slab's width and depth, so both are the map's world axes. The
  // slab's thickness is not a room dimension and is read back from the geometry the builder made
  // rather than re-declared here.
  replaceBox(kit, floor, {
    width: drawnWidthM,
    height: slab.height,
    depth: drawnDepthM,
    tiling: { u: drawnWidthM / slab.width, v: drawnDepthM / slab.depth },
  });
  floor.position.x = alongWallCentreM(drawnWidthM);
  floor.position.z = alongWallCentreM(drawnDepthM);
}

function resizeWallAPlane(plane: Mesh, room: DesignRoom): void {
  const drawnLengthM = drawnWallLengthM(room.widthMm);
  const heightM = toMetres(room.heightMm);

  replacePlane(plane, drawnLengthM, heightM);
  plane.position.set(alongWallCentreM(drawnLengthM), heightM / 2, 0);
}

function resizeWallBPlane(plane: Mesh, room: DesignRoom): void {
  const drawnLengthM = drawnWallLengthM(room.depthMm);
  const heightM = toMetres(room.heightMm);

  // `rotation.y` is left as the builder set it: the plane turns to face +X, and its geometry's
  // width axis is therefore the world's z.
  replacePlane(plane, drawnLengthM, heightM);
  plane.position.set(0, heightM / 2, alongWallCentreM(drawnLengthM));
  // ADR 0130 D8: hidden for a straight room, drawn (as an L always was) otherwise — written on
  // every resize rather than only when it changes, the same "both branches write" rule
  // `syncRunEndPanel` follows, so a design switching shape is a pure function of the room and not
  // of whichever shape happened to draw the shell first.
  plane.visible = wallBPlaneVisibleFor(room);
}

/** Wall C runs along world z from the A∩C corner, at x = W, so `rotation.y` (−π/2, set at
 *  creation) is left alone exactly as wall B's is: the plane's width axis is the world's z.
 *
 *  A shell that has never been a U has no wall C to redraw, and a room that is not a U asks for none. */
function resizeWallCPlane(shell: Object3D, room: DesignRoom): void {
  const plane = wallCPlaneOf(shell) ?? wallCPlaneAddedFor(shell, room);
  if (!plane) return;

  const drawnLengthM = drawnWallLengthM(wallLengthMm("C", room));
  const heightM = toMetres(room.heightMm);

  replacePlane(plane, drawnLengthM, heightM);
  plane.position.set(
    toMetres(room.widthMm),
    heightM / 2,
    alongWallCentreM(drawnLengthM),
  );
  plane.visible = wallCPlaneVisibleFor(room);
}

function wallCPlaneOf(shell: Object3D): Mesh | undefined {
  const plane = shell.children.find(
    (child) => child.name === WALL_C_PLANE_NAME,
  );
  return plane && isMesh(plane) ? plane : undefined;
}

/** Wall C paints as wall B does — the same front-face-only material, so no `DoubleSide` (M7B
 *  criterion 7) — and turns the other way, to face −X. Its geometry is a placeholder the resize in
 *  progress replaces at once; like the other planes' it is private to this mesh. */
function wallCPlaneAddedFor(
  shell: Object3D,
  room: DesignRoom,
): Mesh | undefined {
  if (!wallCPlaneVisibleFor(room)) return undefined;

  const wallBPlane = shellChild(shell, WALL_B_PLANE_NAME);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    wallBPlane.material,
  );
  plane.name = WALL_C_PLANE_NAME;
  plane.rotation.y = -Math.PI / 2;
  shell.add(plane);
  return plane;
}

/** The backsplash means *"behind the worktop"*, and it follows the **room's** wall A rather than
 *  the run's extent, with its start pinned at the corner.
 *
 *  Four numbers live within 60 mm of each other at wall A's right-hand end and nothing reconciles
 *  them: the seeded base run ends at 3500 mm, the run-end panel seats at 3510, this backsplash
 *  spanned 0 → 3500, and the seeded room is 3560. **Two readings were refused.** Following the
 *  *records*, as ADR 0045's panel does, would need records plumbed into a build that has none.
 *  Leaving it a literal only made sense while the drawn wall was longer than the entered one;
 *  since the drawn wall *is* the entered wall, a fixed 3.5 m would sit 60 mm short of the corner
 *  it belongs to in the seeded room and arbitrarily wrong in every other. */
function resizeBacksplash(kit: Kit, backsplash: Mesh, room: DesignRoom): void {
  const widthM = toMetres(room.widthMm);
  const slab = boxSizeOf(backsplash);

  // The front face tiles across the slab's width and height; only the width follows the room.
  replaceBox(kit, backsplash, {
    width: widthM,
    height: slab.height,
    depth: slab.depth,
    tiling: { u: widthM / slab.width, v: 1 },
  });
  backsplash.position.x = widthM / 2;
}

/** A drawn wall runs from behind the corner to the end of the entered wall. */
function drawnWallLengthM(wallLengthMm: number): number {
  return toMetres(wallLengthMm) + CORNER_OVERHANG_M;
}

/** Its span is therefore [−overhang, wallLength], so its centre sits one overhang back from half
 *  its drawn length. */
function alongWallCentreM(drawnLengthM: number): number {
  return drawnLengthM / 2 - CORNER_OVERHANG_M;
}

interface BoxResize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** How far each of the map's two axes is stretched by this resize, as a ratio of the extent it
   *  currently covers. A ratio rather than a repeat count, because what must stay constant is the
   *  **world size of one plank or one tile** — a repeat count that happens to be right for one room
   *  is the defect restated. */
  readonly tiling: TileStretch;
}

interface TileStretch {
  readonly u: number;
  readonly v: number;
}

function replaceBox(kit: Kit, mesh: Mesh, resize: BoxResize): void {
  replaceGeometry(
    mesh,
    new THREE.BoxGeometry(resize.width, resize.height, resize.depth),
  );
  retileToConstantWorldDensity(kit, mesh, resize.tiling);
}

function replacePlane(plane: Mesh, widthM: number, heightM: number): void {
  replaceGeometry(plane, new THREE.PlaneGeometry(widthM, heightM));
}

/**
 * Attaches `next` and frees what it replaced, in that order.
 *
 * **Rebuilt, never scaled.** A per-axis `scale` on the mesh would preserve the floor's 40 mm slab
 * and the backsplash's 14 mm for free, but it stretches the map's UVs exactly as a resize does, so
 * it fixes nothing there, and it leaves every world-space measurement of the scene reading through
 * a non-unit transform.
 *
 * **Safe here and nowhere else.** `plainBox` and the two wall planes call their geometry
 * constructors directly: the result goes through neither `chamferBox`'s memo nor the kit's owned
 * set, so it is private to this one mesh and nothing else in the scene renders from it. The run-end
 * panel is the one shell child built by `chamferBox` — its buffer **is** shared and kit-owned — and
 * it is the one child this module never resizes.
 *
 * **Attached before the old one is freed**, so a throw can strand nothing: the new geometry is
 * reachable from the shell the moment it exists, and a teardown walking the mounted room finds it.
 */
function replaceGeometry(mesh: Mesh, next: THREE.BufferGeometry): void {
  const previous = mesh.geometry;
  mesh.geometry = next;
  previous.dispose();
}

/**
 * Gives the mesh its own material and its own map, tiled so that one plank and one tile keep the
 * world size they have in the reference room.
 *
 * **The kit's texture is never re-tiled in place.** `M.tile` also dresses the counter `backsplash`
 * and the open shelf's `back_panel`, so correcting the shell's repeat on the shared texture would
 * silently re-tile two customer bodies — a defect introduced into the customer's kitchen while
 * fixing the room around it, and nothing in the fidelity gate looks at a texture repeat. It would
 * also make the shell's build order load-bearing on every body built after it.
 *
 * **The density is measured, not declared.** The repeat is scaled by how far this resize stretches
 * the face, so a plank keeps whatever world size the reference builder gives it and no number from
 * that builder is copied here. At the reference extent the ratio is exactly 1 and the repeat does
 * not move.
 *
 * Both clones are recorded as the kit's the moment they exist, before either is attached to
 * anything, so a throw later in the resize cannot strand a resource no teardown would find.
 */
function retileToConstantWorldDensity(
  kit: Kit,
  mesh: Mesh,
  stretch: TileStretch,
): void {
  const material = soleMaterialOf(mesh);
  if (!hasMapSlot(material)) return;
  const map = material.map;
  if (!isTexture(map)) return;

  const owned = kitOwnedResources(kit.M);
  const ownMaterial = material.clone();
  const ownMap = map.clone();
  owned.materials.add(ownMaterial);
  owned.textures.add(ownMap);
  SHELL_OWN_MATERIALS.add(ownMaterial);
  SHELL_OWN_MAPS.add(ownMap);

  ownMap.repeat.set(map.repeat.x * stretch.u, map.repeat.y * stretch.v);
  ownMap.needsUpdate = true;
  ownMaterial.map = ownMap;
  mesh.material = ownMaterial;

  releaseReplacedShellMaterial(material, map, kit);
}

/**
 * **Provenance, recorded where the clone is made.** Not "is this in the kit's declared list", which
 * is a *correlate* of authorship rather than authorship — `kitMaterialList(M)` is the 14 materials
 * `makeKit` declares, while `owned.materials` is those plus every `deriveKitMaterial` finish clone
 * plus the clones below. A release that tested *"not declared"* would be testing the union of the
 * last two and would be right only because the middle set cannot reach a shell child today.
 *
 * **What it would cost to be wrong, and why that is no longer hypothetical.** Since the owner's
 * ruling of 2026-09-17 — *"end pannel should inherit the kitchen global color"* — `paintRunEndPanel`
 * below puts a finish clone on `end_panel_right`, which **is** a shell child. So a finish clone now
 * reaches this module's neighbourhood for real, where until then `FRONT_MESH_NAME`
 * (`/door_front|drawer_front/`) matched no shell name and the case was only theoretical.
 * `buildFinishMaterial` is `(isOak ? M.oak : M.door).clone()` and three's `Material.copy` assigns
 * `map` **by reference**, so a **wood** decor's clone carries `oakTex` *itself* — the kit's own,
 * shared by every oak surface in the scene. Freeing it would black out every one of them and drop it
 * from the ownership record so the teardown could not free it either, with nothing thrown. Five of
 * the eight palette entries are woods.
 *
 * Two things keep that harmless, and both are needed. The panel is the one shell child
 * `resizeShellToRoom` never touches, so the release below is not reached for it at all; and the
 * `WeakSet` means that if it ever were, a material this module did not clone is left alone.
 *
 * A `WeakSet` keyed on the object cannot be wrong about that, and weak for `resourcesByKit`'s own
 * reason: an abandoned kit's entries die with it.
 */
const SHELL_OWN_MATERIALS = new WeakSet<THREE.Material>();
const SHELL_OWN_MAPS = new WeakSet<THREE.Texture>();

/** Frees a material and map **this module made** on an earlier resize, and leaves everything else
 *  alone — the kit's own declared materials, and any finish clone that might one day reach here.
 *
 *  The two are asked separately rather than as a pair: they are created together, so the answers
 *  agree today, and a future path that assigns one without the other cannot make this free the
 *  wrong half. */
function releaseReplacedShellMaterial(
  material: THREE.Material,
  map: THREE.Texture,
  kit: Kit,
): void {
  const owned = kitOwnedResources(kit.M);
  if (SHELL_OWN_MATERIALS.has(material)) {
    owned.materials.delete(material);
    material.dispose();
  }
  if (SHELL_OWN_MAPS.has(map)) {
    owned.textures.delete(map);
    map.dispose();
  }
}

interface BoxSize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** The size the reference builder gave this box, read back from its own geometry so the axes this
 *  resize does not touch are carried forward rather than re-declared as literals here. */
function boxSizeOf(mesh: Mesh): BoxSize {
  const parameters: unknown = (mesh.geometry as { parameters?: unknown })
    .parameters;
  if (!isBoxParameters(parameters)) {
    throw new Error(`Shell child ${mesh.name} is not a box`);
  }
  return parameters;
}

function isBoxParameters(value: unknown): value is BoxSize {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["width"] === "number" &&
    typeof candidate["height"] === "number" &&
    typeof candidate["depth"] === "number"
  );
}

function shellChild(shell: Object3D, name: string): Mesh {
  const child = shell.children.find((candidate) => candidate.name === name);
  if (!child || !isMesh(child)) {
    throw new Error(`The kitchen shell has no mesh named ${name}`);
  }
  return child;
}

function soleMaterialOf(mesh: Mesh): THREE.Material {
  const materials = toMaterials(mesh.material);
  const material = materials[0];
  if (materials.length !== 1 || !material) {
    throw new Error(
      `Shell child ${mesh.name} has ${String(materials.length)} materials`,
    );
  }
  return material;
}

/** A material that samples a colour map. `THREE.Material` declares no `map` — the slot belongs to
 *  the concrete materials that have one — so the shell's own must be narrowed to it before its map
 *  can be read or written. The wall planes' paint has no slot at all, which is not an error. */
interface MaterialWithMapSlot extends THREE.Material {
  map: THREE.Texture | null;
}

/** Narrowed rather than asserted, for `three-guards.ts`'s reason: a material without the slot must
 *  not be given one by an assignment that types as valid. */
function hasMapSlot(material: THREE.Material): material is MaterialWithMapSlot {
  return "map" in material;
}

/** `syncSolidBodies`'s tag on every body it mounts (`scene-sync.ts`), and what `picking.ts` climbs
 * to. Declared here rather than imported because `scene-sync.ts` depends on this module. */
const PLACEMENT_ID_KEY = "placementId";

export interface RunEndPanelInput {
  /** The `solids` group: the shell plus every mounted customer body. */
  readonly solidsRoot: Object3D;
  readonly records: readonly PlacementRecord[];
  /** The room the records stand in: the domain's wall-end veto reads wall A's length from it (ADR 0045
   *  Amendment A). Passed through, never read here. */
  readonly room: DesignRoom;
}

/** ADR 0045: the run-end panel closes the **last base cabinet on screen**, not the run's nominal
 *  extent, so its along-wall seat and its visibility are re-derived from the current records on
 *  every sync — a shrink, a delete and an insert all move the end of the run.
 *
 *  **The seat itself is not derived here.** `runEndPanelSeatM` is the domain's, because the panel
 *  is also part of wall A's occupied width and a coverage query needs the same number (ADR 0083
 *  decision 5). This function is the projection of that one fact onto a mesh: it finds the panel,
 *  seats it, and shows or hides it. Re-deriving the seat, the veto or either slab constant here
 *  would restore the two-derivation defect the move closed.
 *
 *  This re-crosses the seam an earlier fix closed (a shell that read records could put a deleted body
 *  back as shell), and stays on the narrow side of it deliberately:
 *  membership is still the literal manifest above, so no record can create the panel and none can
 *  remove it. Only `position.x` and `visible` are derived, and `visible` is a projection of the
 *  record set onto a boolean — a hidden panel that was always shell cannot be a body outliving its
 *  own deletion, which is the failure that commit fixed. The panel carries no `placementId` and
 *  never enters §6.1 picking, before or after.
 *
 *  Both branches write both properties, so the whole derivation is a pure function of the records:
 *  a scene that reached "no base run" by deletion and one loaded that way are one picture, which is
 *  ADR 0045's anti-invariant. */
export function syncRunEndPanel(input: RunEndPanelInput): void {
  // A caller may mount bodies into a bare group with no shell at all: every headless suite that
  // exercises `syncSolidBodies` alone does. There is then no panel to seat, which is not an error.
  const panel = findRunEndPanel(input.solidsRoot);
  if (!panel) return;

  const seatM = runEndPanelSeatM(input.records, input.room);
  panel.visible = seatM !== undefined;
  panel.position.x = seatM ?? RUN_END_PANEL_SEEDED_X_M;
}

export interface RunEndPanelFinishInput {
  /** The kit that built the panel. The recoloured material is derived from its `M` and recorded as
   *  the kit's, so the panel's paint is freed by the same teardown as every other finish clone. */
  readonly kit: Kit;
  /** The `solids` group, as `syncRunEndPanel` takes it. */
  readonly solidsRoot: Object3D;
  /** The colour the kitchen is wearing, **already resolved by the domain**
   *  (`resolvedDefaultFinishOf`). `undefined` is an answer rather than a hole: a design whose
   *  material id names nothing declared has no colour to follow (ADR 0078 decision 3). */
  readonly kitchenFinish: Finish | undefined;
}

/**
 * **The run-end panel wears the kitchen's colour** — the owner's ruling of 2026-09-17: *"end pannel
 * should inherit the kitchen global color"*. Until then it was built with `M.oak` and stood as a
 * wood plank against a white kitchen.
 *
 * **The kitchen's colour, not a cabinet's.** The panel is shell, so no `PlacementRecord` carries a
 * finish for it and there is nothing for ADR 0099's per-cabinet override to resolve; the caller
 * hands over the kitchen's own resolved default and this package still learns no precedence rule
 * (§12). Reading the colour off the last base cabinet instead would have made the panel follow a
 * cabinet's *private* choice, which is a different ruling from the one that was made.
 *
 * **Not a declaration in `body-finish-surfaces.ts`.** That mechanism answers *which meshes of a
 * body* a body's finish lands on, and is read by `applyBodyFinish` over one mounted placement. The
 * panel belongs to no body, so a declaration on it would be read by nothing; the surface is found
 * the way everything else about the panel is found — structurally, through `findRunEndPanel`.
 *
 * **`M.oak` is never mutated.** It is shared by every oak surface in the scene, so recolouring it
 * would repaint the open shelf's six boards along with the panel. `applyFinish` assigns a material
 * cloned and cached per kit per finish, exactly as a cabinet front gets one.
 *
 * **Both branches write**, as `syncRunEndPanel`'s do and for the same reason: the panel's colour is
 * then a pure function of the kitchen's, so a kitchen that has no colour to give puts the panel back
 * on the oak its builder gave it rather than leaving the last paint stranded on it.
 */
export function paintRunEndPanel(input: RunEndPanelFinishInput): void {
  // As in `syncRunEndPanel`: a caller may mount bodies into a bare group with no shell at all.
  const panel = findRunEndPanel(input.solidsRoot);
  if (!panel || !isMesh(panel)) return;

  if (input.kitchenFinish) {
    applyFinish([panel], input.kit.M, input.kitchenFinish);
    return;
  }
  panel.material = input.kit.M.oak;
}

/** The shell is the one `solidsRoot` child `syncSolidBodies` did not mount, which is the manifest's
 *  meaning stated structurally. Identifying it by name would be a naming convention doing a
 *  safety job: a customer body is a `solidsRoot` child too, so a name search here could reach into
 *  one and move a mesh a placement owns. That is `syncRunEndPanel`'s own failure (a shell that read
 *  records could put a deleted body back as shell) arriving from the other side: there the shell
 *  took over a body, here the panel's lookup would take over a body's mesh. */
function findRunEndPanel(solidsRoot: Object3D): Object3D | undefined {
  const shell = solidsRoot.children.find(
    (child) => child.userData[PLACEMENT_ID_KEY] === undefined,
  );
  return shell?.children.find((node) => node.name === RUN_END_PANEL_NAME);
}
