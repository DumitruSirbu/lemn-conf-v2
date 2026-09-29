// M3 work item 8's engine: bring a mounted scene graph in line with the store's derived state.
//
// React-free and headless on purpose — `kitchen-stage.tsx` only calls these from an effect. The
// whole point of the item is the *difference*: a body that did not change keeps its identical
// object instance (rebuilding everything would discard applied finish and handle state and re-run
// the wall seating for bodies already seated), and a body or void that vanished is removed **and
// disposed** — §4's own pseudocode opens with "dispose all void meshes", and a leak here is
// invisible until a phone runs out of memory mid-session.
import { buildAnyBody } from "./build-any-body.js";
import {
  isPushToOpen,
  toMetres,
  toMillimetres,
  type DesignRoom,
  type Finish,
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

/** Everything about a record that changes the built body. A mounted body whose signature still
 *  matches its record is left exactly as it is — same instance, same materials, same seat. */
const BODY_SIGNATURE_KEY = "bodySignature";

export interface SolidSyncInput {
  readonly kit: Kit;
  /** The `solids` group. Children without a `placementId` — the reference room shell — are never
   *  touched, so decomposition stays this function's caller's business. */
  readonly solidsRoot: THREE.Object3D;
  readonly records: readonly PlacementRecord[];
  /** The room the records stand in, handed to the run-end panel's sync for the domain's wall-end
   *  veto (ADR 0045 Amendment A). Required: without it that veto could not fire. */
  readonly room: DesignRoom;
  /** The colour the whole kitchen is wearing, resolved by the domain (`resolvedDefaultFinishOf`)
   *  and passed through to the run-end panel, which is shell and so carries no record of its own
   *  (owner's ruling, 2026-09-17).
   *
   *  **Optional, because a caller that owns no design cannot answer it.** Every headless suite that
   *  exercises `syncSolidBodies` alone mounts bodies into a bare group with no shell in it, so
   *  there is no panel for the answer to reach; and a document whose material id names nothing
   *  declared has no colour to give (ADR 0078 decision 3), which is the same `undefined` arriving
   *  from the other side. Both leave the panel on the oak its builder gave it. */
  readonly kitchenFinish?: Finish | undefined;
}

export interface VoidSyncInput {
  readonly voidsRoot: THREE.Object3D;
  readonly voids: readonly VoidRecord[];
  /** The room the voids stand in. Optional so every caller that predates the cutaway still
   *  type-checks: given a room that is not a U, the recorded cut set is discarded rather than applied
   *  (`applyRecordedCutaway`). The body sync always has the room and does the same, so a caller that
   *  omits it is safe as long as it also syncs bodies when the room changes. */
  readonly room?: DesignRoom | undefined;
}

/** Mounts the bodies that appeared, removes and disposes the ones that vanished or changed, and
 *  leaves the rest untouched. */
export function syncSolidBodies(input: SolidSyncInput): void {
  const missing = new Map(input.records.map((record) => [record.id, record]));
  // ADR 0132 decision 2: the right corner's pieces are drawn mirrored, each in its own wrapper. A
  // piece's side is part of what it is drawn as, so it is part of its signature below.
  const isMirrored = mirroredPieceTest(input);

  for (const child of [...input.solidsRoot.children]) {
    const placementId = child.userData[PLACEMENT_ID_KEY] as string | undefined;
    if (placementId === undefined) continue;
    const record = missing.get(placementId);
    if (
      record &&
      child.userData[BODY_SIGNATURE_KEY] ===
        signBody(record, isMirrored(record))
    ) {
      missing.delete(placementId);
      continue;
    }
    input.solidsRoot.remove(child);
    disposeSolidBody(input.kit, child);
  }

  for (const record of missing.values()) {
    input.solidsRoot.add(mountBody(input.kit, record, isMirrored(record)));
  }

  // ADR 0045: the shell's run-end panel closes whatever base run is on screen, so it is re-derived
  // here — the one place that already sees both the mounted scene and the current records — rather
  // than at build, where its seat was baked and stayed put through every resize and delete.
  syncRunEndPanel({
    solidsRoot: input.solidsRoot,
    records: input.records,
    room: input.room,
  });
  // Its colour is a function of the kitchen's finish where its seat is a function of the records,
  // so the two are derived by two calls rather than one (owner's ruling, 2026-09-17).
  paintRunEndPanel({
    kit: input.kit,
    solidsRoot: input.solidsRoot,
    kitchenFinish: input.kitchenFinish,
  });
  // ADR 0132 A8.2: a body mounted while a wall is cut away is mounted cut.
  applyRecordedCutaway(input.solidsRoot, input.room);
}

function mirroredPieceTest(
  input: SolidSyncInput,
): (record: PlacementRecord) => boolean {
  const rightCornerIds = rightCornerRecordIds(input);
  return (record) => rightCornerIds.has(record.id);
}

/** Replaces the whole void set whenever anything about it changed, and does nothing when nothing
 *  did. The comparison is a signature over every field `buildVoidMesh` reads, **not** the id list:
 *  a void id carries its column, its index and its `y0` — never its height — so the same id can
 *  describe two openings of different size, and an id-only check would keep showing the old box.
 *  Replacement is wholesale rather than per-void because ids are regenerated on every
 *  `recomputeVoids`, so a surviving id is not evidence that its geometry survived. */
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

/** What this body alone owns. Its materials come from `kit.M` and its cached geometries are shared
 *  with every other body of the same size, so neither may go with it — see
 *  `disposeUnsharedGeometries`, which the probe's teardown uses for the same reason. */
export function disposeSolidBody(kit: Kit, body: THREE.Object3D): void {
  disposeUnsharedGeometries(body, kit.ownsGeometry);
}

/** Geometries **and** materials: unlike a body, a void mesh owns its own `MeshBasicMaterial` and
 *  `LineDashedMaterial` (`void-mesh.ts`), created per void and shared with nothing. */
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

/** Everything `buildVoidMesh` reads to place and size one box — the void's identity plus its whole
 *  frame. The same job `signBody` does for a solid, for the same reason. */
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

/** What is returned is what `solidsRoot` holds and what picking and the highlight find by
 *  `placementId`: the body itself, or — for a right-corner piece — the wrapper that mirrors it. The
 *  frame and both tags belong to that outer object, so a mirrored piece is seated, found, outlined
 *  and marked exactly as an unmirrored one is. */
function mountBody(
  kit: Kit,
  record: PlacementRecord,
  isMirrored: boolean,
): THREE.Group {
  const body = buildBody(kit, record);
  const mounted = isMirrored ? wrapInRightCornerMirror(body) : body;
  mounted.position.set(record.frame.x, record.frame.y0, record.frame.z);
  mounted.rotation.y = record.frame.ry;
  mounted.userData[PLACEMENT_ID_KEY] = record.id;
  tagWall(mounted, record.wall);
  mounted.userData[BODY_SIGNATURE_KEY] = signBody(record, isMirrored);
  // Set both ways, never only hidden: `buildDecomposedBody` ships the seeded `*-top` bodies with
  // their handles already hidden — the decomposition-parity gate holds them to the reference
  // room's own hide — so a recorded non-push mode has to *un*-hide them or a choice the domain
  // accepted would never reach the screen, which is the failure §6.5 exists to prevent.
  setHandlesVisible(body, !hidesHandles(record));
  applyRecordedAppearance(kit, body, record);
  return mounted;
}

/** §5.5: finish and handle are recorded **per placement**, so they are applied to this body alone
 *  and to no other. Both are read at mount because `signBody` includes them: a chip tap re-signs
 *  the record, the sync tears the old instance down, and this rebuilds it wearing the choice —
 *  which is also how §11 row 12 (resize preserves finish + handle) holds, since a resize re-signs
 *  through the same path.
 *
 *  **The finish read here is `drawnFinish`, never `finishKey`** (ADR 0099 decision 1 and
 *  Amendment A section 3). `finishKey` is what the cabinet chose for itself, and a cabinet that
 *  chose nothing carries none — so reading it left every *following* cabinet on the kit's own white
 *  however the whole-kitchen colour was set. `drawnFinish` is the resolver's answer, so the
 *  precedence rule stays in the domain and this package still does not learn it.
 *
 *  A record with no drawn finish at all is left exactly as its builder made it. Since ADR 0099 that
 *  is only a design whose material id names nothing declared (ADR 0078 decision 3) — a state that
 *  loads rather than being refused, and that declares no colour to paint.
 *
 *  The `canHandle` guard is `hidesHandles`'s own WHY arriving from the data side — `insertBody`'s
 *  `carriedAppearance` refuses to carry a choice onto a body that cannot take it, but a hand-edited
 *  or migrated design can still carry one.
 *
 *  **There is no `canFinish` guard beside it any more, and there must not be one.** It stood here
 *  until the owner's ruling of 2026-09-09 split that flag's class in two: a structural corner and an
 *  open shelf are `canFinish: false` and *must* be painted with the kitchen, while a hood and a
 *  fridge are `canFinish: false` and must never be. The refusal moved to `drawnFinishOf`, beside the
 *  `finishRule` declaration that answers which is which, so this package still learns no rule (§12)
 *  and a record carrying no drawn finish is simply not painted. */
function applyRecordedAppearance(
  kit: Kit,
  body: THREE.Group,
  record: PlacementRecord,
): void {
  // Wave 6R made the adapter's table total over the domain's declared palette, so every finish a
  // record can carry has a material: the "no material for this finish" branch that used to sit here
  // is gone rather than defaulted, because a missing decor is now a compile failure in
  // `finishes.ts` instead of a front silently left in the kit's own colour.
  if (record.drawnFinish) {
    applyBodyFinish(body, kit.M, record.drawnFinish);
  }
  if (record.handleMode === "black" && record.canHandle) {
    applyBlackHandleMaterial(body, kit.M);
  }
}

/** An inserted placement is built from §7's parameterised catalogue; a seeded one keeps M2's
 *  hardcoded decomposition arm, so M1's fidelity is reproduced exactly as before.
 *
 *  `frame.d` is **not** the depth the builder was given, and must not be read as one: it is `2 ×`
 *  the body's rear overhang from its own origin, which is what `insertBody` persists as
 *  `seatDepthMm`. Measured, the two differ for most bodies — a base cabinet asked for 600 records
 *  580, a hood 500, a column 560, `fridge-free` 680 — because those builders ignore the depth they
 *  are handed and build their own.
 *
 *  For the only two builders that *consume* a depth it is nevertheless what the rebuild depth is
 *  derived from: `wallCabinet` and `openShelf` centre their shell on z = 0, so the overhang is
 *  exactly half that shell. Since ADR 0036 a fronted wall shell is the declared depth *less* the
 *  front assembly, so `rebuildDepthM` adds that back rather than the raw `frame.d` being handed
 *  over — see its own comment for why reading it raw would shrink a wall cabinet on every reload. That depth arrives already
 *  capped where §7's head-clearance cap applies — the domain decides that, in `insert-fit.ts`, from
 *  what stands under the opening; the adapter caps nothing and must not, or it would re-impose the
 *  cap over a full-height column where backlog entry 5 says it does not apply. For every other
 *  entry the value is passed through and ignored. The probe suite asserts both halves of that,
 *  entry by entry. */
function buildBody(kit: Kit, record: PlacementRecord): THREE.Group {
  // The family split lives in `build-any-body.ts` and is asked once, here and in the probe, so the
  // scene and the thing that measures for it cannot disagree about which builder owns an id.
  return buildAnyBody(kit, record.buildId, {
    widthM: toMetres(record.widthMm),
    heightM: toMetres(record.heightMm),
    depthM: rebuildDepthM(kit, record.buildId, record.frame.d),
  });
}

/** §6.5: the handles are **built and hidden**, never omitted, so `canHandle` stays true and the
 *  customer can turn them back on. The default is decided by the slot (ADR 0011 Gap C), not by the
 *  body's catalogue band; an explicitly recorded `push` hides them anywhere (§5.5).
 *
 *  A recorded mode counts only when the body's own definition says `canHandle`. `insertBody`'s
 *  `carriedAppearance` already refuses to carry one onto a body that cannot take it, so the command
 *  path cannot produce the case — but a hand-edited or migrated design can, and a `push` on
 *  `fridge-free` (whose doors do build `handle_bar` meshes) would hide bars that no panel section
 *  exists to turn back on. That is §6.5's own WHY, arriving from the data side.
 *
 *  **The rule itself is the domain's** (`isPushToOpen`, ADR 0092 decision 3 Amendment C) and this
 *  is a call rather than a second copy: the same question decides whether a bar is drawn and
 *  whether a latch is billed, and while the adapter held its own answer the two disagreed in both
 *  directions on the shipped demo. The conversion is all that is left here — the predicate reads
 *  the document's millimetres and the scene keeps a metre frame. */
function hidesHandles(record: PlacementRecord): boolean {
  return isPushToOpen({
    y0Mm: toMillimetres(record.frame.y0),
    recordedHandle: record.handleMode,
    canHandle: record.canHandle,
  });
}

function signBody(record: PlacementRecord, isMirrored: boolean): string {
  const signature = [
    record.buildId,
    record.widthMm,
    record.heightMm,
    record.frame.x,
    record.frame.y0,
    record.frame.z,
    record.frame.ry,
    record.frame.d,
    record.handleMode ?? "",
    // **The drawn colour, not the chosen one, and the pair must not be split.** This signature is
    // the only reason a mounted body is ever torn down and re-mounted, and `applyRecordedAppearance`
    // above paints `drawnFinish`. Signing `finishKey` while painting `drawnFinish` would mean a
    // whole-kitchen colour change — which alters no cabinet's own choice and therefore no
    // `finishKey` — leaves every signature identical, the sync concludes nothing moved, and the
    // scene keeps the old colour: exactly the case ADR 0099 exists for, silently unpainted.
    finishSignature(record.drawnFinish),
  ];
  // Appended only when true, so every unmirrored body keeps the signature it always had.
  if (isMirrored) signature.push(MIRRORED_SIGNATURE_PART);
  return signature.join("|");
}

const MIRRORED_SIGNATURE_PART = "right-corner-mirror";
