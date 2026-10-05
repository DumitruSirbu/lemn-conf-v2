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

/** The floor and the two wall planes run this far past the corner, so the planes meet without a visible seam.
 *  Fixed, not proportional: it is a construction detail, not a room dimension. */
const CORNER_OVERHANG_M = 0.3;

const FLOOR_NAME = "floor";
/** Wall A's plane: z = 0, fronts +Z, `rotation.y = 0`. */
const WALL_A_PLANE_NAME = "wall_back";
/** Wall B's plane: x = 0, fronts +X, `rotation.y = π/2`. */
const WALL_B_PLANE_NAME = "wall_left";
/** Wall C's plane: x = W, fronts −X, `rotation.y = −π/2`. The reference builder has none: the shell adds it the first
 *  time a U is drawn and from then on hides it, never removes it, when the room is not a U. */
const WALL_C_PLANE_NAME = "wall_right";
const BACKSPLASH_NAME = "backsplash_wall_a";

/** The immutable room children of the reference L-shape scene. Customer bodies are absent: `syncSolidBodies`
 * owns them. */
const KITCHEN_L_SHELL_CHILD_NAMES = new Set([
  FLOOR_NAME,
  WALL_A_PLANE_NAME,
  WALL_B_PLANE_NAME,
  RUN_END_PANEL_NAME,
  BACKSPLASH_NAME,
]);

/** Builds the room shell the customer entered, without consulting the loaded design's placements: the reference
 * builder's customer bodies are removed by a fixed manifest, so a deleted placement cannot survive as a ghost.
 * The five children kept are resized to `room`; wall C joins only when a U is first drawn. Nothing here reads a
 * placement, record, the catalogue or a cabinet depth: the room never depends on the depth (ADR 0083 decision 2). */
export function buildKitchenShell(kit: Kit, room: DesignRoom): Group {
  const shell = kit.builders["kitchen-l"]();
  const discarded = shell.children.filter(isCustomerBody);
  for (const child of discarded) shell.remove(child);
  // The reference builder allocates a whole room and the shell keeps five children; the rest is released here,
  // because garbage collection never frees a GPU buffer.
  disposeDiscardedBodies({ kit, discarded, retained: shell.children });
  resizeShellToRoom({ kit, shell, room });
  return shell;
}

function isCustomerBody(child: Object3D): boolean {
  return !KITCHEN_L_SHELL_CHILD_NAMES.has(child.name);
}

export interface ShellResizeInput {
  /** The kit that built `shell`; replaced resources return to its ownership record. */
  readonly kit: Kit;
  readonly shell: Object3D;
  readonly room: DesignRoom;
}

/**
 * Redraws the shell at `room`, and touches nothing else in the scene.
 *
 * Anchor: wall A's plane is z = 0 fronting +Z, wall B's is x = 0 fronting +X, and both walk "along" from the shared
 * corner at (0, 0, 0). The convention lives in the domain's `room-transforms.ts` (DEVELOPMENT-SPEC §2).
 * Every child but the run-end panel is resized and no body moves: the panel's seat is a function of the records
 * (`syncRunEndPanel`, ADR 0045), and a U has none.
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

/** A straight room has no wall B, so its plane is hidden, not removed (ADR 0130 decision 7). It has no `placementId`,
 *  so picking never selects it, and three's raycaster ignores `visible`. */
function wallBPlaneVisibleFor(room: DesignRoom): boolean {
  return room.shape !== "linear";
}

/** Wall C exists only in a U; elsewhere its plane is hidden, never removed, like wall B's. */
function wallCPlaneVisibleFor(room: DesignRoom): boolean {
  return room.shape === "U";
}

/**
 * Whether this shell already stands at this room: a record of what was last drawn, not a second authority on the room.
 * Compared by value, not identity: a save round-trip or `structuredClone` yields a new `room` object, and an identity
 * check would then rebuild the geometry on every design mutation.
 */
function isAlreadyDrawnAt(shell: Object3D, room: DesignRoom): boolean {
  return shell.userData[DRAWN_ROOM_KEY] === drawnRoomSignature(room);
}

/** Includes the shape (wall B's visibility depends on it) and wall C's length (0 for shapes without one), so rooms
 *  at the same three dimensions are not read as one drawn picture. */
function drawnRoomSignature(room: DesignRoom): string {
  const dimensions = `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
  return `${room.shape}:${dimensions}:c${String(wallLengthMm("C", room))}`;
}

/** The signature lives on the shell, not in a module-scope map, so it shares the shell's lifetime. */
const DRAWN_ROOM_KEY = "drawnRoom";

function resizeFloor(kit: Kit, floor: Mesh, room: DesignRoom): void {
  const drawnWidthM = drawnWallLengthM(room.widthMm);
  const drawnDepthM = drawnWallLengthM(floorDepthMm(room));
  const slab = boxSizeOf(floor);

  // The top face tiles across width and depth. The slab's thickness is read back from the builder's geometry.
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

  // `rotation.y` stays as the builder set it: the plane faces +X, so its width axis is the world's z.
  replacePlane(plane, drawnLengthM, heightM);
  plane.position.set(0, heightM / 2, alongWallCentreM(drawnLengthM));
  // Written on every resize, so the visibility is a pure function of the room (ADR 0130 decision 7).
  plane.visible = wallBPlaneVisibleFor(room);
}

/** Wall C runs along world z from the A∩C corner at x = W; `rotation.y` (−π/2) is left alone, as wall B's is.
 *  A shell that has never been a U has no wall C, and a room that is not a U asks for none. */
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

/** Wall C shares wall B's front-face-only material (no `DoubleSide`) and faces −X. Its placeholder geometry is
 *  replaced at once by the resize in progress. */
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

/** The backsplash follows the **room's** wall A, not the run's extent, with its start pinned at the corner: a build has
 *  no records to follow, and a fixed 3.5 m would fall short of the corner in every room but the seeded one. */
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

/** The span is [−overhang, wallLength], so the centre sits one overhang back from half the drawn length. */
function alongWallCentreM(drawnLengthM: number): number {
  return drawnLengthM / 2 - CORNER_OVERHANG_M;
}

interface BoxResize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** How far each of the map's axes is stretched, as a ratio of the extent it covers: the world size of one plank
   *  or tile must stay constant. */
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
 * Attaches `next` and frees what it replaced, in that order, so a throw strands nothing.
 * Rebuilt, never scaled: a non-unit scale would stretch the map's UVs anyway and skew every world-space measurement.
 * Safe only for geometry private to one mesh: the box and plane geometries here are, but the run-end panel's
 * `chamferBox` buffer is shared and kit-owned, which is why this module never resizes the panel.
 */
function replaceGeometry(mesh: Mesh, next: THREE.BufferGeometry): void {
  const previous = mesh.geometry;
  mesh.geometry = next;
  previous.dispose();
}

/**
 * Gives the mesh its own material and map, tiled so one plank and one tile keep their reference world size.
 * The kit's texture is never re-tiled in place: `M.tile` also dresses the counter `backsplash` and the shelf's
 * `back_panel`, which would be re-tiled silently. The repeat is scaled by the face's stretch ratio, so no number
 * is copied from the builder. Both clones are recorded as the kit's before either is attached, so a throw strands none.
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
 * Provenance is recorded where the clone is made, not inferred from "is this in the kit's declared list": a finish
 * clone (`paintRunEndPanel` puts one on `end_panel_right`) copies `map` by reference, so a wood decor's clone carries
 * the kit's shared `oakTex`, and freeing it would black out every oak surface without a throw. A `WeakSet` leaves any
 * material this module did not clone alone, and lets an abandoned kit's entries die with it.
 */
const SHELL_OWN_MATERIALS = new WeakSet<THREE.Material>();
const SHELL_OWN_MAPS = new WeakSet<THREE.Texture>();

/** Frees the material and map this module made on an earlier resize, leaving the kit's own and any finish clone
 *  alone. The two are asked separately, so a path that assigns one without the other cannot free the wrong half. */
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

/** A material that samples a colour map: `THREE.Material` declares no `map` slot. The wall planes' paint has none,
 *  which is not an error. */
interface MaterialWithMapSlot extends THREE.Material {
  map: THREE.Texture | null;
}

function hasMapSlot(material: THREE.Material): material is MaterialWithMapSlot {
  return "map" in material;
}

/** `syncSolidBodies`'s tag on every body it mounts (`scene-sync.ts`), which `picking.ts` climbs to. Declared here
 * because `scene-sync.ts` imports this module. */
const PLACEMENT_ID_KEY = "placementId";

export interface RunEndPanelInput {
  /** The `solids` group: the shell plus every mounted customer body. */
  readonly solidsRoot: Object3D;
  readonly records: readonly PlacementRecord[];
  /** The room the records stand in: the domain's wall-end veto reads wall A's length from it (ADR 0045 Amendment A). */
  readonly room: DesignRoom;
}

/** ADR 0045: the run-end panel closes the last base cabinet on screen, so its seat and visibility are re-derived from
 *  the records on every sync. The seat is the domain's (`runEndPanelSeatM`, ADR 0083 decision 5): never re-derive the
 *  seat, the veto or the slab constants here. Membership is still the literal shell manifest, so no record creates or
 *  removes the panel; only `position.x` and `visible` follow the records, and both branches write both. */
export function syncRunEndPanel(input: RunEndPanelInput): void {
  // A caller may mount bodies into a bare group with no shell (headless suites do): no panel to seat, not an error.
  const panel = findRunEndPanel(input.solidsRoot);
  if (!panel) return;

  const seatM = runEndPanelSeatM(input.records, input.room);
  panel.visible = seatM !== undefined;
  panel.position.x = seatM ?? RUN_END_PANEL_SEEDED_X_M;
}

export interface RunEndPanelFinishInput {
  /** The kit that built the panel; the recoloured material is recorded as its own, so one teardown frees it. */
  readonly kit: Kit;
  /** The `solids` group, as `syncRunEndPanel` takes it. */
  readonly solidsRoot: Object3D;
  /** The kitchen's colour, already resolved by the domain (`resolvedDefaultFinishOf`). `undefined` means the material
   *  id names nothing declared (ADR 0078 decision 3). */
  readonly kitchenFinish: Finish | undefined;
}

/**
 * The run-end panel wears the kitchen's colour, not a cabinet's: it is shell, so no record carries a finish for it and
 * this package learns no precedence rule (ADR 0099). `M.oak` is never mutated, because the open shelf's boards share
 * it; `applyFinish` assigns a per-kit cached clone. Both branches write: with no colour the panel returns to oak.
 * Not a `body-finish-surfaces.ts` declaration, which is read per mounted placement and the panel belongs to none.
 */
export function paintRunEndPanel(input: RunEndPanelFinishInput): void {
  // As in `syncRunEndPanel`: a bare group has no shell.
  const panel = findRunEndPanel(input.solidsRoot);
  if (!panel || !isMesh(panel)) return;

  if (input.kitchenFinish) {
    applyFinish([panel], input.kit.M, input.kitchenFinish);
    return;
  }
  panel.material = input.kit.M.oak;
}

/** The shell is the one `solidsRoot` child without a `placementId`. Finding the panel by name alone could reach into
 *  a customer body and move a mesh a placement owns. */
function findRunEndPanel(solidsRoot: Object3D): Object3D | undefined {
  const shell = solidsRoot.children.find(
    (child) => child.userData[PLACEMENT_ID_KEY] === undefined,
  );
  return shell?.children.find((node) => node.name === RUN_END_PANEL_NAME);
}
