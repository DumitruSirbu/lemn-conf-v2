// Brings a mounted scene graph in line with the store's derived state, React-free and headless. A body that did not
// change keeps its identical object instance (rebuilding would discard finish and handle state and re-seat it); a body
// or void that vanished is removed and disposed, because a leak is invisible until a phone runs out of memory.
import { buildAnyBody } from "./build-any-body.js";
import {
  isPushToOpen,
  resolvedHandleAt,
  toMetres,
  toMillimetres,
  type DesignRoom,
  type Finish,
  type Handle,
  type KitchenHandleSettings,
  type PushToOpenQuery,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { rebuildDepthM } from "./catalog-bodies.js";
import { applyRecordedCutaway } from "./cutaway.js";
import {
  applyBlackHandleMaterial,
  setHandlesVisible,
} from "./decomposed-bodies.js";
import { applyBodyFinish, finishSignature } from "./finishes.js";
import type { Kit } from "./kitchen-parts.js";
import { paintRunEndPanel, syncRunEndPanel } from "./kitchen-shell.js";
import {
  rightCornerRecordIds,
  wrapInRightCornerMirror,
} from "./right-corner-wrapper.js";
import {
  disposeUnsharedGeometries,
  isLine,
  isMesh,
  toMaterials,
} from "./three-guards.js";
import { tagWall } from "./wall-tag.js";
import { buildVoidMesh } from "./void-mesh.js";

/** What picking climbs to (`picking.ts`) and what the selection highlight looks up. */
const PLACEMENT_ID_KEY = "placementId";
const VOID_SIGNATURE_KEY = "voidSignature";

/** Everything about a record that changes the built body: a mounted body with a matching signature is left as is. */
const BODY_SIGNATURE_KEY = "bodySignature";

export interface SolidSyncInput {
  readonly kit: Kit;
  /** The `solids` group. Children without a `placementId` (the reference room shell) are never touched. */
  readonly solidsRoot: THREE.Object3D;
  readonly records: readonly PlacementRecord[];
  /** The room the records stand in, for the run-end panel's wall-end veto (ADR 0045 Amendment A). Required: without
   *  it the veto could not fire. */
  readonly room: DesignRoom;
  /** The colour the whole kitchen is wearing, resolved by the domain (`resolvedDefaultFinishOf`) and passed to the
   *  run-end panel, which is shell and has no record. Optional: a caller that owns no design cannot answer it, and an
   *  undeclared material id has no colour (ADR 0078 decision 3); both leave the panel on its builder's oak. */
  readonly kitchenFinish?: Finish | undefined;
}

export interface VoidSyncInput {
  readonly voidsRoot: THREE.Object3D;
  readonly voids: readonly VoidRecord[];
  /** The room the voids stand in. Required: for a room that is not a U the recorded cut set is discarded
   *  (`applyRecordedCutaway`), so a caller that could not name it would apply a U's cut to an L. */
  readonly room: DesignRoom;
}

/** Mounts the bodies that appeared, removes and disposes those that vanished or changed, and leaves the rest alone. */
export function syncSolidBodies(input: SolidSyncInput): void {
  const missing = new Map(input.records.map((record) => [record.id, record]));
  // ADR 0132 decision 2: right-corner pieces are drawn mirrored in a wrapper, so a piece's side is in its signature.
  const rightCornerIds = rightCornerRecordIds(input);

  for (const child of [...input.solidsRoot.children]) {
    const placementId = child.userData[PLACEMENT_ID_KEY] as string | undefined;
    if (placementId === undefined) continue;
    const record = missing.get(placementId);
    if (
      record &&
      child.userData[BODY_SIGNATURE_KEY] ===
        signatureOnScreen(record, rightCornerIds)
    ) {
      missing.delete(placementId);
      continue;
    }
    input.solidsRoot.remove(child);
    disposeSolidBody(input.kit, child);
  }

  for (const record of missing.values()) {
    input.solidsRoot.add(
      mountOnScreen({ kit: input.kit, record, rightCornerIds }),
    );
  }

  // ADR 0045: the run-end panel closes whatever base run is on screen, so it is re-derived here, not at build, where
  // its seat was baked.
  syncRunEndPanel({
    solidsRoot: input.solidsRoot,
    records: input.records,
    room: input.room,
  });
  // Its colour follows the kitchen's finish and its seat follows the records, so two calls derive them.
  paintRunEndPanel({
    kit: input.kit,
    solidsRoot: input.solidsRoot,
    kitchenFinish: input.kitchenFinish,
  });
  // ADR 0132 A8.2: a body mounted while a wall is cut away is mounted cut.
  applyRecordedCutaway(input.solidsRoot, input.room);
}

/** Replaces the whole void set when anything changed. Compared by a signature over every field `buildVoidMesh` reads,
 *  not the id list: an id carries column, index and `y0` but not height, so one id can describe two sizes. Replaced
 *  wholesale because ids are regenerated on every `recomputeVoids`. */
export function syncVoidMeshes(input: VoidSyncInput): void {
  if (matchesMountedVoids(input)) return;

  for (const child of [...input.voidsRoot.children]) {
    input.voidsRoot.remove(child);
    disposeVoidMesh(child);
  }
  for (const voidRecord of input.voids) {
    const { group } = buildVoidMesh(voidRecord);
    group.userData[VOID_SIGNATURE_KEY] = signVoid(voidRecord);
    input.voidsRoot.add(group);
  }
  // ADR 0132 A8.2: the whole void set is replaced on any change, so the cut set is re-applied to it.
  applyRecordedCutaway(input.voidsRoot, input.room);
}

/** What this body alone owns: its materials come from `kit.M` and its cached geometries are shared with same-size
 *  bodies, so neither goes with it (see `disposeUnsharedGeometries`). */
export function disposeSolidBody(kit: Kit, body: THREE.Object3D): void {
  disposeUnsharedGeometries(body, kit.ownsGeometry);
}

/** Geometries and materials: a void mesh owns its own `MeshBasicMaterial` and `LineDashedMaterial` (`void-mesh.ts`). */
export function disposeVoidMesh(voidMesh: THREE.Object3D): void {
  voidMesh.traverse((node) => {
    if (isMesh(node)) disposeRenderable(node.geometry, node.material);
    else if (isLine(node)) disposeRenderable(node.geometry, node.material);
  });
}

function disposeRenderable(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
): void {
  geometry.dispose();
  for (const one of toMaterials(material)) {
    one.dispose();
  }
}

function matchesMountedVoids(input: VoidSyncInput): boolean {
  const mounted = input.voidsRoot.children;
  if (mounted.length !== input.voids.length) return false;
  return input.voids.every(
    (voidRecord, index) =>
      mounted[index]?.userData[VOID_SIGNATURE_KEY] === signVoid(voidRecord),
  );
}

/** Everything `buildVoidMesh` reads to place and size one box: the void's id plus its whole frame. */
function signVoid(voidRecord: VoidRecord): string {
  return [
    voidRecord.id,
    voidRecord.x,
    voidRecord.y0,
    voidRecord.z,
    voidRecord.ry,
    voidRecord.w,
    voidRecord.h,
    voidRecord.d,
  ].join("|");
}

/** What `solidsRoot` holds for `record`: the body, or for a right-corner piece the wrapper that mirrors it. */
function mountOnScreen(input: {
  readonly kit: Kit;
  readonly record: PlacementRecord;
  readonly rightCornerIds: ReadonlySet<string>;
}): THREE.Group {
  return input.rightCornerIds.has(input.record.id)
    ? mountMirroredBody(input.kit, input.record)
    : mountBody(input.kit, input.record);
}

function signatureOnScreen(
  record: PlacementRecord,
  rightCornerIds: ReadonlySet<string>,
): string {
  return rightCornerIds.has(record.id)
    ? signMirroredBody(record)
    : signBody(record);
}

function mountBody(kit: Kit, record: PlacementRecord): THREE.Group {
  const body = buildBody(kit, record);
  dressBody(kit, body, record);
  return seatMounted(body, record, signBody(record));
}

function mountMirroredBody(kit: Kit, record: PlacementRecord): THREE.Group {
  const body = buildBody(kit, record);
  dressBody(kit, body, record);
  return seatMounted(
    wrapInRightCornerMirror(body),
    record,
    signMirroredBody(record),
  );
}

/** Picking and the highlight find the outer object by `placementId` (the body or its mirror wrapper), so the frame
 *  and both tags belong to it. */
function seatMounted(
  mounted: THREE.Group,
  record: PlacementRecord,
  signature: string,
): THREE.Group {
  mounted.position.set(record.frame.x, record.frame.y0, record.frame.z);
  mounted.rotation.y = record.frame.ry;
  mounted.userData[PLACEMENT_ID_KEY] = record.id;
  tagWall(mounted, record.wall);
  mounted.userData[BODY_SIGNATURE_KEY] = signature;
  return mounted;
}

function dressBody(kit: Kit, body: THREE.Group, record: PlacementRecord): void {
  // Set both ways, never only hidden: seeded `*-top` bodies ship with handles hidden, so a recorded non-push mode must
  // un-hide them or the choice never reaches the screen (§6.5).
  setHandlesVisible(body, !hidesHandles(record));
  applyRecordedAppearance(kit, body, record);
}

/** §5.5: finish and handle are recorded per placement and applied to this body alone. `signBody` includes them, so a
 *  chip tap re-signs the record and the sync rebuilds the body wearing the choice (which is how §11 row 12 holds).
 *
 *  The finish read is `drawnFinish`, never `finishKey` (ADR 0099 decision 1): `finishKey` is absent when the cabinet
 *  chose nothing, so reading it left every following cabinet on the kit's white. A record with no drawn finish is left
 *  as its builder made it. There is no `canFinish` guard here, and there must not be: a corner and an open shelf are
 *  `canFinish: false` yet are painted with the kitchen, a hood and a fridge never are. The refusal lives in
 *  `drawnFinishOf`, beside `finishRule`, so this package learns no rule (§12). The `canHandle` guard covers a
 *  hand-edited or migrated design carrying a choice `insertBody` would have refused. */
function applyRecordedAppearance(
  kit: Kit,
  body: THREE.Group,
  record: PlacementRecord,
): void {
  // The finish table is total over the domain's palette, so every finish has a material: a missing decor is a compile
  // failure in `finishes.ts`, not a front silently left in the kit's colour.
  if (record.drawnFinish) {
    applyBodyFinish(body, kit.M, record.drawnFinish);
  }
  if (resolvedHandleOn(record) === "black") {
    applyBlackHandleMaterial(body, kit.M);
  }
}

/** An inserted placement is built from §7's parameterised catalogue; a seeded one keeps the hardcoded decomposition.
 *
 *  `frame.d` is not the depth the builder was given: it is `2 ×` the body's rear overhang (what `insertBody` persists
 *  as `seatDepthMm`), and most builders ignore the depth they are handed (a base cabinet asked for 600 records 580).
 *  Only `wallCabinet` and `openShelf` consume it, centring their shell on z = 0, so `rebuildDepthM` derives the depth
 *  from it and adds back the front assembly (ADR 0036). The domain applies §7's head-clearance cap (`insert-fit.ts`);
 *  the adapter caps nothing, or it would re-impose the cap over a full-height column. */
function buildBody(kit: Kit, record: PlacementRecord): THREE.Group {
  // The family split lives in `build-any-body.ts` and is asked once, here and in the probe, so the scene and the
  // probe cannot disagree about which builder owns an id.
  return buildAnyBody(kit, record.buildId, {
    widthM: toMetres(record.widthMm),
    heightM: toMetres(record.heightMm),
    depthM: rebuildDepthM(kit, record.buildId, record.frame.d),
  });
}

/** §6.5: handles are built and hidden, never omitted, so `canHandle` stays true and the customer can turn them back
 *  on. The rule is the domain's `isPushToOpen` (ADR 0092 Amendment C), called rather than copied: the same question
 *  decides whether a bar is drawn and whether a latch is billed. A recorded mode counts only when `canHandle`: a
 *  hand-edited or migrated design could record `push` on `fridge-free`, hiding bars no panel section can turn back on.
 *  The predicate reads millimetres and the scene keeps metres, so this converts. */
function hidesHandles(record: PlacementRecord): boolean {
  return isPushToOpen(handleQueryOn(record));
}

/** The handle this body wears, resolved by the domain from the cabinet's own handle, else the kitchen's (ADR 0099). The
 *  same call the price makes, so the bar's colour and the latch it replaces cannot name different handles. The
 *  `canHandle` guard is inside the resolver: it answers `undefined` for a body that takes none. */
function resolvedHandleOn(record: PlacementRecord): Handle | undefined {
  return resolvedHandleAt(handleQueryOn(record));
}

function handleQueryOn(record: PlacementRecord): PushToOpenQuery {
  return {
    y0Mm: toMillimetres(record.frame.y0),
    recordedHandle: record.handleMode,
    kitchenSettings: record.kitchenSettings ?? NO_KITCHEN_HANDLE,
    canHandle: record.canHandle,
  };
}

/** What a record built by hand, stating no kitchen settings, means: the kitchen has no handle of its own. */
const NO_KITCHEN_HANDLE: KitchenHandleSettings = {};

function signBody(record: PlacementRecord): string {
  return [
    record.buildId,
    record.widthMm,
    record.heightMm,
    record.frame.x,
    record.frame.y0,
    record.frame.z,
    record.frame.ry,
    record.frame.d,
    // The handle this body wears, not the one it chose: a kitchen-handle change then re-signs exactly the bodies that
    // follow it, and a cabinet with its own handle, a top-row body or one that takes none keeps its body.
    resolvedHandleOn(record) ?? "",
    // The drawn colour, not the chosen one, and the pair must not be split: `applyRecordedAppearance` paints
    // `drawnFinish`, so signing `finishKey` would leave every signature unchanged on a whole-kitchen colour change and
    // the scene would keep the old colour (ADR 0099).
    finishSignature(record.drawnFinish),
  ].join("|");
}

/** `signBody`'s signature with the mirror appended: unmirrored bodies keep theirs; a piece changing sides changes it.
 */
function signMirroredBody(record: PlacementRecord): string {
  return `${signBody(record)}|${MIRRORED_SIGNATURE_PART}`;
}

const MIRRORED_SIGNATURE_PART = "right-corner-mirror";
