"use client";

import {
  applyCornerDirection,
  applyCornerDirectionToLightRig,
  applyCutaway,
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
  cutawayWallsFor,
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
  type Vector3Tuple,
} from "@lemnaria/three-adapter";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  cornerDirectionOf,
  DEFAULT_CABINET_DEPTH_MM,
  wallCarcassDepthMm,
  createBodyProbeLease,
  resolvedDefaultFinishOf,
  type BodyProbeFactory,
  type CornerDirection,
  type DesignWall,
  type Finish,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";

import type { Selection } from "../store/apply-command-result";
import {
  useConfiguratorStore,
  type ConfiguratorState,
} from "../store/configurator-store";
import { publishSceneMeasurement } from "./scene-measurement-store";
import { resolveSceneView, sceneViewKey, type SceneView } from "./scene-view";
import { useOverflowingPlacementIds } from "./use-overflowing-placements";

/**
 * The store's `BodyProbeFactory`, and the one place the two kits are told apart.
 *
 * At the stage's own depth it returns the stage's probe with a no-op `release`: freeing the mounted
 * kit would leave the room with black or invisible objects (`kit-disposal.ts`). At any other depth
 * it builds a transient kit, measured in its own room, and releases it when the command ends
 * (ADR 0074 decision 3; kits are not cached by depth).
 *
 * It exists because the adapter's base, full-height, appliance and hood builders ignore the depth
 * they are handed and use the kit's own, so a probe over the standing kit measures the depth being
 * left (ADR 0074).
 */
function probeFactoryFor(
  stage: { kit: Kit; room: THREE.Object3D },
  standingDepthMm: number,
): BodyProbeFactory {
  return (cabinetDepthMm: number) => {
    if (cabinetDepthMm === standingDepthMm) {
      // Frees nothing: `disposeKitAndStage` releases the stage's kit.
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
    // The site that allocates is the site that frees (ADR 0076 decision 3).
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

/** Seconds for a preset switch to settle. */
const CAMERA_EASE_SECONDS = 0.7;
const SETTLED_METRES = 1e-4;

interface OrbitTarget {
  target: THREE.Vector3;
  update: () => void;
  /** `OrbitControls` dispatches `change` on every camera move except a direct write to its position. */
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
}

interface CameraGoal {
  position: THREE.Vector3;
  target: THREE.Vector3;
  isImmediate: boolean;
}

/**
 * What a mount lets the customer do to the design through the scene: select a body (and have the
 * selection drawn), and offer the store the probe that measures a depth change. A mount handed none
 * wires no pointer listener, draws no outline, and never touches the store's selection or probe.
 */
export type StageEditing = Pick<
  ConfiguratorState,
  "selection" | "select" | "deselect" | "attachBodyProbe" | "detachBodyProbe"
>;

export interface KitchenStageProps {
  view: SceneView;
  finish?: Finish;
  onSettled?: () => void;
  /** Answers what this mount may edit. Defaults to the editor's: the store's own selection and probe. */
  useEditing?: () => StageEditing | undefined;
}

/** The editor's wiring: the configurator store's selection, its select commands and its probe seam. */
function useEditingThroughTheStore(): StageEditing {
  return {
    selection: useConfiguratorStore((state) => state.selection),
    select: useConfiguratorStore((state) => state.select),
    deselect: useConfiguratorStore((state) => state.deselect),
    attachBodyProbe: useConfiguratorStore((state) => state.attachBodyProbe),
    detachBodyProbe: useConfiguratorStore((state) => state.detachBodyProbe),
  };
}

/** The review's wiring: nothing. A scene that is looked at and not edited. */
export function useNoEditing(): undefined {
  return undefined;
}

interface ReseatInput {
  readonly object: THREE.Object3D;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitTarget | null;
  readonly ground: THREE.Mesh;
  readonly blob: THREE.Mesh;
  readonly key: THREE.DirectionalLight;
  readonly direction: CornerDirection;
}

/**
 * Calls `seatObjectOnStage` while holding the camera's position and orbit target through it.
 * `restoreCamera` is false only for a session's first seat, which has no camera to hold and keeps
 * `seatObjectOnStage`'s own framing.
 */
function reseatHoldingCamera(input: ReseatInput, restoreCamera: boolean): void {
  const { object, camera, controls, ground, blob, key, direction } = input;
  const heldPosition = camera.position.clone();
  const heldTarget = controls?.target.clone();

  seatObjectOnStage({ object, camera, ground, blob, key, direction });

  if (restoreCamera) {
    camera.position.copy(heldPosition);
    if (controls && heldTarget) {
      controls.target.copy(heldTarget);
      controls.update();
    }
  }
}

/**
 * The stage, mounted imperatively. Only the shell comes from the kit's room builder; every body is
 * mounted by `syncSolidBodies` at its `PlacementRecord` transform, tagged `userData.placementId` for
 * picking. The sync engine lives in `@lemnaria/three-adapter` (`scene-sync.ts`); this only calls it.
 */
export function KitchenStage({
  view,
  finish,
  onSettled,
  useEditing = useEditingThroughTheStore,
}: KitchenStageProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitTarget | null;
  const invalidate = useThree((state) => state.invalidate);

  const records = useConfiguratorStore((state) => state.records);
  // No command rewrites the room object, so this re-renders only when the room changes.
  const designRoom = useConfiguratorStore((state) => state.design.room);
  const voids = useConfiguratorStore((state) => state.voids);
  const editing = useEditing();
  const selection = editing?.selection ?? null;
  const select = editing?.select;
  const deselect = editing?.deselect;
  const attachBodyProbe = editing?.attachBodyProbe;
  const detachBodyProbe = editing?.detachBodyProbe;
  const overflowingIds = useOverflowingPlacementIds();
  // A number, not the design: selecting `state.design` would re-render on every command.
  const cabinetDepthMm = useConfiguratorStore(
    (state) =>
      state.design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
  );
  // The domain's resolved kitchen colour, never re-derived here (ADR 0099 decision 1). The run-end
  // panel is shell with no record, so this is the only colour that reaches it. The selector's
  // result is a stable object, so only a repaint-worthy command re-renders.
  const kitchenFinish = useConfiguratorStore((state) =>
    resolvedDefaultFinishOf(state.design),
  );

  const stage = useMemo(() => {
    // Both depths come from the domain, never the adapter's defaults: a defaulted `wallDepthMm` is
    // 70 mm wrong at 700, where ADR 0028's map declares 400.
    const kit = makeKit({
      cabinetDepthMm,
      wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
    });
    // The room is deliberately not a dependency of this memo (ADR 0074 decision 1): it is drawn here
    // at the room held when the stage is built, and the effect below redraws it in place.
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
    // Keyed on the depth alone (ADR 0074 decision 1): the whole stage is rebuilt, so the kit and the
    // room it built share a lifetime, as `disposeKitAndStage` requires. The shell takes no records
    // and keeps only `KITCHEN_L_SHELL_CHILD_NAMES`, so any number of builds yields no customer body;
    // `syncSolidBodies` alone owns those. That fixed manifest is the guarantee, never the number of builds or
    // the dependency array (ADR 0074 decision 5).
  }, [cabinetDepthMm]);

  // Undefined on a stage's first render, so the direction re-seat below never fires on mount, where
  // the seating effect already runs.
  const lastSeatedDirection = useRef<CornerDirection | undefined>(undefined);

  // The drawn room follows the design's room in place (ADR 0074 decision 1). It must run on mount
  // too: the memo above reads `designRoom` through a stale closure, and this redraw corrects it
  // before a frame is drawn (`react-hooks/exhaustive-deps` is not configured here). Camera work
  // stays out of it, so an orbited view survives a wall-length edit (ADR 0074 decision 7).
  useEffect(() => {
    resizeShellToRoom({
      kit: stage.kit,
      shell: stage.shell,
      room: designRoom,
    });
    // A direction change touches only the root's scale and the two directional lights (ADR 0129
    // D4/D6), so it is mirrored in place, with no mesh, geometry or material rebuilt.
    const direction = cornerDirectionOf(designRoom);
    applyCornerDirection(stage.room, direction);
    applyCornerDirectionToLightRig(stage.lights, direction);

    // A flip moves the bounding box across x = 0, but the contact blob and shadow ground stay where
    // the seating effect (keyed on `stage`) last put them; re-seat them, holding the camera.
    if (
      lastSeatedDirection.current !== undefined &&
      lastSeatedDirection.current !== direction
    ) {
      reseatHoldingCamera(
        {
          object: stage.room,
          camera: camera as THREE.PerspectiveCamera,
          controls,
          ground: stage.ground,
          blob: stage.blob,
          key: stage.lights.key,
          direction,
        },
        true,
      );
    }
    lastSeatedDirection.current = direction;
    invalidate();
  }, [stage, designRoom, invalidate]);

  // An unchanged body keeps its exact instance; rebuilding it would discard its finish and wall
  // seating. The finish is re-applied after the sync, since a body mounted this pass has none yet.
  useEffect(() => {
    syncSolidBodies({
      kit: stage.kit,
      solidsRoot: stage.solidsRoot,
      records,
      room: designRoom,
      // The capture route's whole-room `finish` prop overrides every front, so the run-end panel
      // follows it too; in the editor `finish` is absent and the kitchen's colour applies.
      kitchenFinish: finish ?? kitchenFinish,
    });
    syncVoidMeshes({ voidsRoot: stage.voidsRoot, voids, room: designRoom });
    if (finish) applyFinish(collectFronts(stage.room), stage.kit.M, finish);
    invalidate();
  }, [stage, records, designRoom, voids, finish, kitchenFinish, invalidate]);

  // The only place the Three.js probe factory is handed to the store.
  useEffect(() => {
    if (attachBodyProbe === undefined || detachBodyProbe === undefined) return;
    attachBodyProbe(probeFactoryFor(stage, cabinetDepthMm));
    // The store is module-scoped and would otherwise offer a probe over an unmounted scene.
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

  /** Whether a stage has been seated in this mount: only the first frames the room. */
  const hasSeatedAStage = useRef(false);

  useEffect(() => {
    // Seating runs for every generation (it places the new blob and ground), but the camera moves
    // only for the first (ADR 0074 decision 7). `near`/`far` are re-derived each time, since the
    // bounding sphere moves with the depth; only the customer's position and target are restored.
    reseatHoldingCamera(
      {
        object: stage.room,
        camera: camera as THREE.PerspectiveCamera,
        controls,
        ground: stage.ground,
        blob: stage.blob,
        key: stage.lights.key,
        direction: cornerDirectionOf(designRoom),
      },
      hasSeatedAStage.current,
    );
    hasSeatedAStage.current = true;
    invalidate();
  }, [stage, camera, controls, invalidate]);

  // Declared ahead of the picking effect that reads them; the effect applying them is further down.
  const cutWallsKey = useRef("");
  const applyCutSet = (walls: readonly DesignWall[]): void => {
    applyCutaway(stage.solidsRoot, stage.voidsRoot, walls);
    cutWallsKey.current = walls.join(",");
    // A8.3: a hidden cabinet is not an editable one, so a selection on a cut wall is cleared.
    const selectedWall = wallOfSelection(selection, records, voids);
    if (selectedWall !== undefined && walls.includes(selectedWall))
      deselect?.();
    invalidate();
  };
  const cutWallsNow = (): readonly DesignWall[] =>
    cutawayWallsFor(eyeOf(camera), designRoom, cabinetDepthMm);
  const followCameraRef = useRef<() => void>(() => undefined);
  followCameraRef.current = () => {
    const walls = cutWallsNow();
    if (walls.join(",") !== cutWallsKey.current) applyCutSet(walls);
  };

  // Picking (`DEVELOPMENT-SPEC.md` §6.1). Native DOM listeners, not R3F's pointer props: the
  // drag-vs-click test needs the raw pixel delta between down and up.
  useEffect(() => {
    if (select === undefined || deselect === undefined) return;
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

      // Bring the cut set up to the camera before casting: no cut wall may be picked (A2).
      followCameraRef.current();
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

  // The selection is an outline object, never a material change: bodies share `KitMaterials`
  // instances. It is mounted on `stage.room`, outside the subtrees §6.1 picking raycasts, so it
  // cannot become the target of its own click. `records` and `voids` are dependencies because a
  // swap, resize or finish change replaces the mounted instance; the sync effect above runs first.
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
    // Detaches before disposing, so the stage teardown below, a walk over `stage.room`, never meets it.
    return () => {
      const mounted = highlightRef.current;
      if (!mounted) return;
      mounted.removeFromParent();
      disposeSelectionOutline(mounted);
      highlightRef.current = null;
    };
  }, [selection, stage, records, voids, invalidate]);

  // ADR 0065 decision 1: an overflowing body is marked and otherwise untouched. Like the outline, the
  // mark is a separate object on `stage.room`, outside the subtree §6.1 raycasts, so it cannot
  // intercept the tap that selects the fronts it covers. `records` and `voids` are dependencies
  // because a replaced instance would leave a mark at the previous instance's transform.
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
    // Unconditional: a mark left behind is a red cabinet the customer cannot clear. Detaches before
    // disposing, so the stage teardown below never walks a mark.
    return () => {
      for (const mark of overflowMarksRef.current) {
        mark.removeFromParent();
        disposeOverflowMark(mark);
      }
      overflowMarksRef.current = [];
    };
  }, [overflowingIds, stage, records, voids, invalidate]);

  // The cutaway (ADR 0132 Amendment A2, A8.2, A8.3): in a U, a wall whose body zone the camera's eye
  // stands in or behind is neither drawn nor picked. It is recomputed from the camera position
  // alone, so presets, free orbit and zoom agree. Declared after both overlay effects: effects run
  // in declaration order, and an overlay mounted onto a cut wall stays drawn until this has run
  // (the adapter's syncs apply the recorded cut to bodies and voids themselves).
  //
  // Keyed on everything the answer or its target depends on: the room and depth (`cutawayWallsFor`
  // reads both), the stage, and the records, voids, selection and marks. The camera moves between
  // renders, so it is followed by the controls' `change`, the frame loop's ease, and each pick.
  useEffect(() => {
    applyCutSet(cutWallsNow());
    const follow = () => {
      followCameraRef.current();
    };
    controls?.addEventListener("change", follow);
    return () => {
      controls?.removeEventListener("change", follow);
    };
  }, [
    stage,
    designRoom,
    cabinetDepthMm,
    camera,
    controls,
    selection,
    records,
    voids,
    overflowingIds,
  ]);

  // R3F never disposes a `<primitive>`, so a remount would strand the room's buffers, materials and
  // canvas textures. Declared after the outline effect on purpose: cleanups run in declaration
  // order, so the outline has left `stage.room` when this walks it.
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

  // Where a mount with no orbit controls looks. `OrbitControls.update()` is what turns the camera towards its
  // target in the editor; without it nothing does, so the frame loop does it from this target instead.
  const heldLookTarget = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const pending = goal.current;
    if (!pending) return;
    const step = pending.isImmediate
      ? 1
      : 1 - Math.pow(0.001, delta / CAMERA_EASE_SECONDS);
    camera.position.lerp(pending.position, step);
    (controls?.target ?? heldLookTarget.current).lerp(pending.target, step);
    faceTarget(camera, controls, heldLookTarget.current);
    followCameraRef.current();
    const cameraSettled =
      camera.position.distanceTo(pending.position) < SETTLED_METRES;
    const targetSettled =
      !controls || controls.target.distanceTo(pending.target) < SETTLED_METRES;
    if (cameraSettled && targetSettled) {
      camera.position.copy(pending.position);
      (controls?.target ?? heldLookTarget.current).copy(pending.target);
      faceTarget(camera, controls, heldLookTarget.current);
      goal.current = null;
      // Off unless the build opted in (`scene-measurement-store.ts`).
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

/** Turns the camera to its target: the orbit controls' own update where there are controls, else a plain look-at. */
function faceTarget(
  camera: THREE.Camera,
  controls: OrbitTarget | null,
  heldTarget: THREE.Vector3,
): void {
  if (controls) controls.update();
  else camera.lookAt(heldTarget);
}

interface SelectableRoots {
  readonly solidsRoot: THREE.Object3D;
  readonly voidsRoot: THREE.Object3D;
}

/** The mounted object a selection names (by `userData.placementId` or `voidId`, §6.1), or `null`
 *  while the scene has not caught up with it. */
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

function eyeOf(camera: THREE.Camera): Vector3Tuple {
  return [camera.position.x, camera.position.y, camera.position.z];
}

/** The wall the selected body or void stands on, or `undefined` for no selection or one the store no
 *  longer holds. Read from the records the scene was synced from. */
function wallOfSelection(
  selection: Selection,
  records: readonly PlacementRecord[],
  voids: readonly VoidRecord[],
): DesignWall | undefined {
  if (!selection) return undefined;
  const held: readonly { readonly id: string; readonly wall: DesignWall }[] =
    selection.kind === "placement" ? records : voids;
  return held.find((record) => record.id === selection.id)?.wall;
}
