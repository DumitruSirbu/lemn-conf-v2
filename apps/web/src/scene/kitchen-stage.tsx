"use client";

import {
  applyFinish,
  buildKitchenShell,
  buildOverflowMark,
  buildSelectionOutline,
  collectFronts,
  configureRenderer,
  createBodyProbe,
  createContactBlob,
  createLightRig,
  createPickingRaycaster,
  createShadowGround,
  createStudioEnvironment,
  disposeKit,
  disposeKitAndStage,
  disposeOverflowMark,
  disposeSelectionOutline,
  isDragGesture,
  makeKit,
  type Kit,
  pick,
  resizeShellToRoom,
  seatObjectOnStage,
  syncSolidBodies,
  syncVoidMeshes,
} from "@lemnaria/three-adapter";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  DEFAULT_CABINET_DEPTH_MM,
  wallCarcassDepthMm,
  createBodyProbeLease,
  type BodyProbeFactory,
  type Finish,
} from "@lemnaria/configurator-domain";

import type { Selection } from "../store/apply-command-result";
import { useConfiguratorStore } from "../store/configurator-store";
import { publishSceneMeasurement } from "./scene-measurement-store";
import { resolveSceneView, sceneViewKey, type SceneView } from "./scene-view";
import { useOverflowingPlacementIds } from "./use-overflowing-placements";

/**
 * The store's `BodyProbeFactory`, and **the one place the two kits are told apart**.
 *
 * Asked for the depth this stage is already standing at — every command except `setCabinetDepth`,
 * and a depth change that is not a change — it hands back this stage's own probe and a `release`
 * that frees nothing. The stage owns that kit and `disposeKitAndStage` will release it; freeing it
 * here would take the shared geometries out from under the mounted room, which is a black or
 * invisible object rather than an error (`kit-disposal.ts`).
 *
 * Asked for any other depth, it builds a **transient** kit at that depth and releases it when the
 * command ends (ADR 0074 decision 3: kits are not cached by depth — a `BodyCatalog` owns no GPU
 * resource and a kit owns buffers, materials and canvas textures). It measures inside that kit's own
 * room rather than the mounted one, so nothing is added to or removed from the scene the customer is
 * looking at while the measurement runs.
 *
 * **Why it exists at all**: the adapter's base, full-height, appliance and hood builders ignore the
 * depth they are handed and build the kit's own, so a probe over the standing kit measures the depth
 * the session is *leaving* whatever it is asked for — 580 against 680 on the same change, measured
 * (ADR 0074's finding, wave 6K-e).
 */
function probeFactoryFor(
  stage: { kit: Kit; room: THREE.Object3D },
  standingDepthMm: number,
): BodyProbeFactory {
  return (cabinetDepthMm: number) => {
    if (cabinetDepthMm === standingDepthMm) {
      // Frees nothing: the stage owns this kit and `disposeKitAndStage` will release it. Disposing
      // here would take the shared geometries out from under the mounted room.
      return createBodyProbeLease(
        createBodyProbe(stage.kit, stage.room),
        () => undefined,
      );
    }
    const kit = makeKit({
      cabinetDepthMm,
      wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
    });
    const room = kit.builders["kitchen-l"]();
    // **This is the site that allocates, so this is the site that frees** (ADR 0076 decision 3).
    // The borrower cannot drop it: `use` runs this in a `finally` and never hands the probe out.
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

/** Seconds for a preset switch to settle. Long enough to read as a move, short enough that the
 *  customer is not waiting on the camera. */
const CAMERA_EASE_SECONDS = 0.7;
const SETTLED_METRES = 1e-4;

interface OrbitTarget {
  target: THREE.Vector3;
  update: () => void;
}

interface CameraGoal {
  position: THREE.Vector3;
  target: THREE.Vector3;
  isImmediate: boolean;
}

export interface KitchenStageProps {
  view: SceneView;
  finish?: Finish;
  onSettled?: () => void;
}

/**
 * The ported stage, mounted imperatively.
 *
 * Placements are mounted individually (`docs/milestones/M2-void-engine.md` work item 2) rather
 * than as one whole-scene `builders['kitchen-l']()` call: only the shell (floor, walls,
 * backsplash, end panel) still comes from that call. Every body is removed from it and remounted
 * by `syncSolidBodies` at its derived `PlacementRecord` transform, tagged with
 * `userData.placementId` for picking to climb to. Since ADR 0025 that includes the two corner
 * legs, which M2 left in the reference room because their seat was undefined — and which were
 * therefore unpickable, the defect ADR 0025 fixes.
 *
 * M3 work item 8 made that mount a *sync*: the engine lives in `@lemnaria/three-adapter`
 * (`scene-sync.ts`), headless and React-free, and this component only calls it from an effect.
 */
export function KitchenStage({ view, finish, onSettled }: KitchenStageProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitTarget | null;
  const invalidate = useThree((state) => state.invalidate);

  const records = useConfiguratorStore((state) => state.records);
  // The room object itself: no command rewrites it, so this re-renders only when the room changes.
  // The run-end panel's wall-end veto reads wall A's length from it (ADR 0045 Amendment A).
  const designRoom = useConfiguratorStore((state) => state.design.room);
  const voids = useConfiguratorStore((state) => state.voids);
  const selection = useConfiguratorStore((state) => state.selection);
  const select = useConfiguratorStore((state) => state.select);
  const deselect = useConfiguratorStore((state) => state.deselect);
  const overflowingIds = useOverflowingPlacementIds();
  const attachBodyProbe = useConfiguratorStore(
    (state) => state.attachBodyProbe,
  );
  const detachBodyProbe = useConfiguratorStore(
    (state) => state.detachBodyProbe,
  );
  // **A number, not the design.** Selecting `state.design` would re-render this component on every
  // command — a finish, a handle, a resize — for a memo that would not rebuild.
  const cabinetDepthMm = useConfiguratorStore(
    (state) =>
      state.design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
  );

  const stage = useMemo(() => {
    // **The kit is built at the depth the held design declares, never at a constant and never at the
    // adapter's own default** (M6 waves 6H and 6K-b). §12 keeps product rules in the domain and
    // builders in the adapter, so the two depths are read from the domain here and
    // `cabinet-depth-source.test.ts` holds the adapter's copies to the same map.
    //
    // **Both depths, always.** `wallDepthMm` left to fall through to `DEFAULT_WALL_DEPTH_MM` is
    // right at 600 by coincidence of the default and 70 mm wrong at 700, where ADR 0028's map
    // declares 400 — that ADR's own reported defect, arriving in the scene.
    const kit = makeKit({
      cabinetDepthMm,
      wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
    });
    // **The room decides the shell's extent, and it is deliberately not a dependency of this memo**
    // (ADR 0074 decision 1: keyed on the depth and on nothing else). A depth change owns GPU
    // resources and must rebuild the kit; a room change owns none and must not. The shell is drawn
    // here at the room the design holds when the stage is built, and re-drawn in place by the
    // effect below whenever that room changes.
    const shell = buildKitchenShell(kit, designRoom);

    const solidsRoot = new THREE.Group();
    solidsRoot.name = "solids";
    solidsRoot.add(shell);

    const voidsRoot = new THREE.Group();
    voidsRoot.name = "voids";

    const room = new THREE.Group();
    room.name = "kitchen_l_shape";
    room.add(solidsRoot, voidsRoot);

    return {
      kit,
      room,
      shell,
      solidsRoot,
      voidsRoot,
      lights: createLightRig(),
      ground: createShadowGround(),
      blob: createContactBlob(),
    };
    // **Keyed on the depth, and on nothing else** (ADR 0074 decision 1). The whole stage is rebuilt
    // and nothing crosses a generation, which is what makes `disposeKitAndStage`'s stated
    // precondition — the kit and the room it built share a lifetime — true by construction. The
    // narrow "swap the kit under the mounted bodies" shape is refused there on a proof: `signBody`
    // is a function of the record alone, so ADR 0058's pinned tops keep instances built by the old
    // kit, which can then be neither released nor kept.
    //
    // **The reference-ghost guarantee is the shell's fixed manifest, never the number of builds.**
    // `buildKitchenShell` takes a `Kit` and a `DesignRoom` and *no records*; it keeps
    // `KITCHEN_L_SHELL_CHILD_NAMES` and disposes the other 27 children, so building it N times
    // yields N shells of that room with no customer body in any of them. The room decides the
    // shell's extent and nothing else about it, and it is deliberately **not** in the dependency
    // array below — see the read above. This comment said "built once per mount" until 2026-09-04, which
    // read as if the empty dependency array were the safety property — it was not, and the invariant
    // would have died silently the moment this was keyed. `syncSolidBodies` remains the sole owner
    // of every customer body, and `syncRunEndPanel` re-seats the freshly built panel from the
    // current records on the new generation's first sync (ADR 0045).
  }, [cabinetDepthMm]);

  // **The drawn room follows the design's room, in place.**
  //
  // A room change owns no GPU resource the stage holds: it replaces four geometries and two maps
  // the shell allocated for itself, and leaves the kit's shared buffers, every mounted cabinet and
  // the run-end panel exactly as they are. So it is redrawn here rather than by keying the memo
  // above, which would tear down the kit and rebuild all 27 bodies to move a floor (ADR 0074
  // decision 1).
  //
  // **The camera is deliberately absent from this.** The seating effect further down is keyed on
  // the stage and not on the room, so a customer who has orbited their kitchen and then corrects a
  // wall length keeps the view they chose (ADR 0074 decision 7).
  //
  // **It runs unconditionally on mount, and that is load-bearing rather than tidy.** The memo above
  // reads `designRoom` while keyed on `[cabinetDepthMm]`, so it carries a **stale closure**: a
  // depth change that arrives after a room change rebuilds the shell at whichever room the memo
  // last captured. This effect redraws on every `stage` identity, so the stale draw is corrected
  // before a frame is asked for — and `react-hooks/exhaustive-deps` is not configured in this
  // repository, so nothing else will tell the next reader that closure is there.
  //
  // The redundant redraw it implies on an ordinary mount costs nothing: `resizeShellToRoom` keeps a
  // record of the three numbers it last drew and returns immediately when they have not moved. That
  // record is a fact about work already done — the same category as `hasSeatedAStage` below — and
  // not a second authority on what the room is, which the design still answers alone.
  useEffect(() => {
    resizeShellToRoom({
      kit: stage.kit,
      shell: stage.shell,
      room: designRoom,
    });
    invalidate();
  }, [stage, designRoom, invalidate]);

  // Work item 8: the scene follows store state. Bodies that appeared are mounted, bodies and void
  // meshes that vanished are removed and disposed, and an unchanged body keeps its exact instance
  // — rebuilding it would discard its applied finish and re-run its wall seating. The finish is
  // re-applied over the fronts *after* the sync, since a body mounted this pass has none yet.
  useEffect(() => {
    syncSolidBodies({
      kit: stage.kit,
      solidsRoot: stage.solidsRoot,
      records,
      room: designRoom,
    });
    syncVoidMeshes({ voidsRoot: stage.voidsRoot, voids });
    if (finish) applyFinish(collectFronts(stage.room), stage.kit.M, finish);
    invalidate();
  }, [stage, records, designRoom, voids, finish, invalidate]);

  // ADR 0011 Gap B: `insert` measures the body it is about to place, and the probe needs a `Kit`
  // and the mounted room — neither of which exists until this component runs. The store therefore
  // holds the port and this is the only place the Three.js implementation is handed to it.
  useEffect(() => {
    attachBodyProbe(probeFactoryFor(stage, cabinetDepthMm));
    // The probe measures inside *this* room. When the stage goes, so must it — the store is
    // module-scoped and would otherwise keep offering a probe over an unmounted scene.
    return detachBodyProbe;
  }, [stage, cabinetDepthMm, attachBodyProbe, detachBodyProbe]);

  useEffect(() => {
    configureRenderer(gl);
    const environment = createStudioEnvironment(gl);
    scene.environment = environment;
    invalidate();
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);

  /** Whether a stage has already been seated in this mount — so the *first* one frames the room and
   *  every later one does not. A ref rather than state: nothing renders from it. */
  const hasSeatedAStage = useRef(false);

  useEffect(() => {
    // **The seating must run for every generation and the camera must not move for any but the
    // first** (ADR 0074 decision 7). `seatObjectOnStage` is what positions and un-hides the new
    // contact blob and the new shadow ground, so a rebuilt stage that skipped it would draw a
    // room standing on nothing; it also writes `camera.position`, `near` and `far`, and re-running
    // that unaltered would throw away the customer's orbit on every depth toggle — expensive to
    // rebuild on a handset, and read as the scene jumping rather than the kitchen deepening.
    //
    // Restored around the call rather than split out of the adapter, because `near`/`far` *should*
    // be re-derived: the room's bounding sphere moves with the depth, and framing distance is what
    // they are computed from. Only the customer's own two vectors are put back.
    const orbit = controls;
    const heldPosition = camera.position.clone();
    const heldTarget = orbit?.target.clone();

    seatObjectOnStage({
      object: stage.room,
      camera: camera as THREE.PerspectiveCamera,
      ground: stage.ground,
      blob: stage.blob,
      key: stage.lights.key,
    });

    if (hasSeatedAStage.current) {
      camera.position.copy(heldPosition);
      if (orbit && heldTarget) {
        orbit.target.copy(heldTarget);
        orbit.update();
      }
    }
    hasSeatedAStage.current = true;
    invalidate();
  }, [stage, camera, controls, invalidate]);

  // Row 2 / row 22 / drag-threshold picking (`DEVELOPMENT-SPEC.md` §6.1). Native DOM
  // listeners, not R3F's declarative pointer props: the drag-vs-click distinction needs the raw
  // pixel delta between down and up, which R3F's synthetic events do not expose as a pair.
  useEffect(() => {
    const canvasElement = gl.domElement;
    const raycaster = createPickingRaycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPx = { x: 0, y: 0 };

    const toNdc = (event: PointerEvent) => {
      const rect = canvasElement.getBoundingClientRect();
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownPx = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const movedLikeAnOrbit = isDragGesture(pointerDownPx, {
        x: event.clientX,
        y: event.clientY,
      });
      if (movedLikeAnOrbit) return;

      toNdc(event);
      raycaster.setFromCamera(pointerNdc, camera);
      const target = pick(raycaster, stage.solidsRoot, stage.voidsRoot);
      if (target) select(target);
      else deselect();
      invalidate();
    };

    canvasElement.addEventListener("pointerdown", handlePointerDown);
    canvasElement.addEventListener("pointerup", handlePointerUp);
    return () => {
      canvasElement.removeEventListener("pointerdown", handlePointerDown);
      canvasElement.removeEventListener("pointerup", handlePointerUp);
    };
  }, [gl, camera, stage, select, deselect, invalidate]);

  // Mobile gate: "a selected body and a selected slot are visually distinguishable without
  // opening any panel." An outline object, not a shared-material mutation — cabinets in this kit
  // share `KitMaterials` instances, so recolouring a selected body's material would recolour every
  // body using that material.
  //
  // It is mounted on `stage.room` rather than on the body it traces: as a sibling of `solids` and
  // `voids` it inherits the room's seating transform, while staying outside both subtrees that
  // §6.1's picking raycasts — so the highlight can never become a target for the click that
  // produced it. (`buildSelectionOutline` also installs `NOOP_RAYCAST`, belt and braces.)
  //
  // `records` and `voids` are dependencies because the target itself is not stable: a swap, a
  // resize or a finish change re-signs the record and `syncSolidBodies` replaces the mounted
  // instance. The sync effect above is declared first, so it has already run when this rebuilds.
  const highlightRef = useRef<THREE.Object3D | null>(null);
  useEffect(() => {
    const target = selection ? findSelectedObject(stage, selection) : null;
    if (selection && target) {
      const { group } = buildSelectionOutline({
        target,
        parent: stage.room,
        kind: selection.kind,
      });
      stage.room.add(group);
      highlightRef.current = group;
    }
    invalidate();
    // The teardown of the *previous* outline and of the last one at unmount, in one place: React
    // runs this before every re-run as well as on unmount, so no outline can be left mounted. It
    // detaches before it disposes, so the stage teardown below — a walk over `stage.room` — never
    // meets an outline. An outline's geometry and material are its own, shared with nothing, so
    // meeting one would cost a harmless double dispose rather than a survivor's buffers.
    return () => {
      const mounted = highlightRef.current;
      if (!mounted) return;
      mounted.removeFromParent();
      disposeSelectionOutline(mounted);
      highlightRef.current = null;
    };
  }, [selection, stage, records, voids, invalidate]);

  // ADR 0065 decision 1: a body past the end of its wall is **marked**, and marking is the whole of
  // what happens to it — nothing below moves it, resizes it, hides it or touches the selection. The
  // mark is an object mounted beside the body, exactly as the outline above is and for the same
  // reason: this kit's bodies share `KitMaterials` instances, so tinting one body's material would
  // tint every body drawn with it.
  //
  // Mounted on `stage.room` rather than inside `solids`, so it inherits the room's seating transform
  // while staying outside the subtree §6.1 raycasts — a mark stands in front of the fronts it covers
  // and must never intercept the tap that selects them.
  //
  // The dependency list is the outline's plus the ids: `records` and `voids` are here because
  // `syncSolidBodies` replaces a mounted instance whenever a body is swapped, resized or refinished,
  // and a mark still holding the previous instance's transform would sit beside the body instead of
  // over it.
  const overflowMarksRef = useRef<THREE.Object3D[]>([]);
  useEffect(() => {
    const marks = overflowingIds.flatMap((id) => {
      const target = findMountedPlacement(stage.solidsRoot, id);
      if (!target) return [];
      const { group } = buildOverflowMark({ target, parent: stage.room });
      stage.room.add(group);
      return [group];
    });
    overflowMarksRef.current = marks;
    invalidate();
    // A mark left behind after its body stopped overflowing is a red cabinet the customer has no way
    // to clear, so the teardown is unconditional: React runs it before every re-run as well as on
    // unmount, and it detaches before it disposes so the stage teardown below never walks a mark.
    return () => {
      for (const mark of overflowMarksRef.current) {
        mark.removeFromParent();
        disposeOverflowMark(mark);
      }
      overflowMarksRef.current = [];
    };
  }, [overflowingIds, stage, records, voids, invalidate]);

  // R3F never disposes a `<primitive>`, by design: its reconciler skips disposal when
  // `instance.type === 'primitive'` because a primitive's lifetime is owned outside React. Every
  // object below is one, so without this a client-side remount strands a whole room's buffers,
  // materials and canvas textures until the WebGL context goes.
  //
  // Declared **after** the outline effect on purpose: React runs cleanups in declaration order, so
  // the outline has already left `stage.room` when this walks it. `kitchen-stage-disposal.test.ts`
  // replays the cleanups in that same order and asserts the outline is gone by the time this runs,
  // so swapping the two blocks fails there.
  useEffect(() => {
    return () => {
      disposeKitAndStage(stage);
    };
  }, [stage]);

  const goal = useRef<CameraGoal | null>(null);
  const viewKey = sceneViewKey(view, designRoom);
  const resolved = resolveSceneView(view, designRoom);
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

  useEffect(() => {
    const next = resolvedRef.current;
    goal.current = {
      position: new THREE.Vector3(...next.position),
      target: new THREE.Vector3(...next.target),
      isImmediate: next.isImmediate,
    };
    invalidate();
  }, [viewKey, invalidate]);

  useFrame((_, delta) => {
    const pending = goal.current;
    if (!pending) return;
    const step = pending.isImmediate
      ? 1
      : 1 - Math.pow(0.001, delta / CAMERA_EASE_SECONDS);
    camera.position.lerp(pending.position, step);
    controls?.target.lerp(pending.target, step);
    controls?.update();
    const cameraSettled =
      camera.position.distanceTo(pending.position) < SETTLED_METRES;
    const targetSettled =
      !controls || controls.target.distanceTo(pending.target) < SETTLED_METRES;
    if (cameraSettled && targetSettled) {
      camera.position.copy(pending.position);
      controls?.target.copy(pending.target);
      controls?.update();
      goal.current = null;
      // The one moment a projection is worth measuring: the camera is where the preset put it and
      // is no longer moving. Off unless the build opted in (`scene-measurement-store.ts`).
      publishSceneMeasurement({ camera, solidsRoot: stage.solidsRoot });
      onSettled?.();
    }
    invalidate();
  });

  return (
    <>
      <primitive object={stage.lights.hemisphere} />
      <primitive object={stage.lights.key} />
      <primitive object={stage.lights.fill} />
      <primitive object={stage.ground} />
      <primitive object={stage.blob} />
      <primitive object={stage.room} />
    </>
  );
}

interface SelectableRoots {
  readonly solidsRoot: THREE.Object3D;
  readonly voidsRoot: THREE.Object3D;
}

/**
 * The mounted object a selection names, or `null` while the scene has not caught up with it —
 * `syncSolidBodies` tags each body with `userData.placementId`, `buildVoidMesh` tags each void
 * group with `userData.voidId`, and picking climbs to exactly those two keys (§6.1).
 */
function findSelectedObject(
  roots: SelectableRoots,
  selection: NonNullable<Selection>,
): THREE.Object3D | null {
  if (selection.kind === "placement")
    return findMountedPlacement(roots.solidsRoot, selection.id);
  return (
    roots.voidsRoot.children.find(
      (child) => child.userData.voidId === selection.id,
    ) ?? null
  );
}

/** The mounted body a placement id names, or `null` while the scene has not caught up with it. */
function findMountedPlacement(
  solidsRoot: THREE.Object3D,
  placementId: string,
): THREE.Object3D | null {
  return (
    solidsRoot.children.find(
      (child) => child.userData.placementId === placementId,
    ) ?? null
  );
}
