// M3 work item 8's engine: bring a mounted scene graph in line with the store's derived state.
//
// React-free and headless on purpose — `kitchen-stage.tsx` only calls these from an effect. The
// whole point of the item is the *difference*: a body that did not change keeps its identical
// object instance (rebuilding everything would discard applied finish and handle state and re-run
// the wall seating for bodies already seated), and a body or void that vanished is removed **and
// disposed** — §4's own pseudocode opens with "dispose all void meshes", and a leak here is
// invisible until a phone runs out of memory mid-session.
import {
  isPushOpenByDefault,
  toMetres,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import {
  buildCatalogBody,
  isCatalogBuildId,
  rebuildDepthM,
} from "./catalog-bodies.js";
import {
  applyBlackHandleMaterial,
  buildDecomposedBody,
  setHandlesVisible,
} from "./decomposed-bodies.js";
import { applyBodyFinish } from "./finishes.js";
import type { Kit } from "./kitchen-parts.js";
import { syncRunEndPanel } from "./kitchen-shell.js";
import { disposeUnsharedGeometries, isLine, isMesh } from "./three-guards.js";
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
}

export interface VoidSyncInput {
  readonly voidsRoot: THREE.Object3D;
  readonly voids: readonly VoidRecord[];
}

/** Mounts the bodies that appeared, removes and disposes the ones that vanished or changed, and
 *  leaves the rest untouched. */
export function syncSolidBodies(input: SolidSyncInput): void {
  const missing = new Map(input.records.map((record) => [record.id, record]));

  for (const child of [...input.solidsRoot.children]) {
    const placementId = child.userData[PLACEMENT_ID_KEY] as string | undefined;
    if (placementId === undefined) continue;
    const record = missing.get(placementId);
    if (record && child.userData[BODY_SIGNATURE_KEY] === signBody(record)) {
      missing.delete(placementId);
      continue;
    }
    input.solidsRoot.remove(child);
    disposeSolidBody(input.kit, child);
  }

  for (const record of missing.values()) {
    input.solidsRoot.add(mountBody(input.kit, record));
  }

  // ADR 0045: the shell's run-end panel closes whatever base run is on screen, so it is re-derived
  // here — the one place that already sees both the mounted scene and the current records — rather
  // than at build, where its seat was baked and stayed put through every resize and delete.
  syncRunEndPanel({ solidsRoot: input.solidsRoot, records: input.records });
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
  for (const one of Array.isArray(material) ? material : [material]) {
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

function mountBody(kit: Kit, record: PlacementRecord): THREE.Group {
  const body = buildBody(kit, record);
  body.position.set(record.frame.x, record.frame.y0, record.frame.z);
  body.rotation.y = record.frame.ry;
  body.userData[PLACEMENT_ID_KEY] = record.id;
  body.userData[BODY_SIGNATURE_KEY] = signBody(record);
  // Set both ways, never only hidden: `buildDecomposedBody` ships the seeded `*-top` bodies with
  // their handles already hidden — the decomposition-parity gate holds them to the reference
  // room's own hide — so a recorded non-push mode has to *un*-hide them or a choice the domain
  // accepted would never reach the screen, which is the failure §6.5 exists to prevent.
  setHandlesVisible(body, !hidesHandles(record));
  applyRecordedAppearance(kit, body, record);
  return body;
}

/** §5.5: finish and handle are recorded **per placement**, so they are applied to this body alone
 *  and to no other. Both are read at mount because `signBody` includes them: a chip tap re-signs
 *  the record, the sync tears the old instance down, and this rebuilds it wearing the choice —
 *  which is also how §11 row 12 (resize preserves finish + handle) holds, since a resize re-signs
 *  through the same path.
 *
 *  A record with no choice is left exactly as its builder made it: an unfinished kitchen renders
 *  today's scene, byte for byte, and the M1 fidelity parity suite still sees its own materials.
 *
 *  The `canFinish` / `canHandle` guards are `hidesHandles`'s own WHY arriving from the data side —
 *  `insertBody`'s `carriedAppearance` refuses to carry a choice onto a body that cannot take it,
 *  but a hand-edited or migrated design can still carry one. */
function applyRecordedAppearance(
  kit: Kit,
  body: THREE.Group,
  record: PlacementRecord,
): void {
  if (record.finishKey && record.canFinish) {
    applyBodyFinish(body, kit.M, record.finishKey);
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
  if (!isCatalogBuildId(record.buildId)) {
    return buildDecomposedBody(kit, record.buildId);
  }
  return buildCatalogBody(kit, record.buildId, {
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
 *  exists to turn back on. That is §6.5's own WHY, arriving from the data side. */
function hidesHandles(record: PlacementRecord): boolean {
  if (record.handleMode && record.canHandle) {
    return record.handleMode === "push";
  }
  return isPushOpenByDefault(record.frame.y0);
}

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
    record.handleMode ?? "",
    record.finishKey ?? "",
  ].join("|");
}
