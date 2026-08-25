"use client";

import {
  applyFinish,
  collectFronts,
  configureRenderer,
  createBodyProbe,
  createContactBlob,
  createLightRig,
  createPickingRaycaster,
  createShadowGround,
  createStudioEnvironment,
  isDragGesture,
  makeKit,
  pick,
  seatObjectOnStage,
  syncSolidBodies,
  syncVoidMeshes,
  type FinishKey,
} from "@lemnaria/three-adapter";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useConfiguratorStore } from "../store/configurator-store";
import { resolveSceneView, sceneViewKey, type SceneView } from "./scene-view";

/** Seconds for a preset switch to settle. Long enough to read as a move, short enough that the
 *  customer is not waiting on the camera. */
const CAMERA_EASE_SECONDS = 0.7;
const SETTLED_METRES = 1e-4;
const HIGHLIGHT_COLOR = 0xffce45;
/** `Box3.setFromObject` on a body already placed at (0, 0, 0) local origin has no meaningful
 *  "same position" collision with an individually-mounted placement — the epsilon below matches
 *  M1's own parity float tolerance, not an arbitrary guess. */
const SAME_POSITION_EPSILON_M = 1e-6;

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
  finish?: FinishKey;
  onSettled?: () => void;
}

/**
 * The ported stage, mounted imperatively.
 *
 * Placements are mounted individually (`docs/milestones/M2-void-engine.md` work item 2) rather
 * than as one whole-scene `builders['kitchen-l']()` call: the shell (floor, walls, backsplash,
 * end panel) and the two corner legs still come from that call — decomposing them is out of this
 * milestone's scope, per the decomposition-parity test in `@lemnaria/three-adapter` — but every
 * other body is removed from it and remounted by `syncSolidBodies` at its derived
 * `PlacementRecord` transform, tagged with `userData.placementId` for picking to climb to.
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
  const voids = useConfiguratorStore((state) => state.voids);
  const selection = useConfiguratorStore((state) => state.selection);
  const select = useConfiguratorStore((state) => state.select);
  const deselect = useConfiguratorStore((state) => state.deselect);
  const attachBodyProbe = useConfiguratorStore(
    (state) => state.attachBodyProbe,
  );
  const detachBodyProbe = useConfiguratorStore(
    (state) => state.detachBodyProbe,
  );

  const stage = useMemo(() => {
    const kit = makeKit();
    const referenceRoom = kit.builders["kitchen-l"]();

    const placementPositions = records.map(
      (record) =>
        new THREE.Vector3(record.frame.x, record.frame.y0, record.frame.z),
    );
    const decomposedBodies = referenceRoom.children.filter((child) =>
      placementPositions.some(
        (position) =>
          position.distanceTo(child.position) <= SAME_POSITION_EPSILON_M,
      ),
    );
    for (const body of decomposedBodies) referenceRoom.remove(body);

    const solidsRoot = new THREE.Group();
    solidsRoot.name = "solids";
    solidsRoot.add(referenceRoom);

    const voidsRoot = new THREE.Group();
    voidsRoot.name = "voids";

    const room = new THREE.Group();
    room.name = "kitchen_l_shape";
    room.add(solidsRoot, voidsRoot);

    return {
      kit,
      room,
      solidsRoot,
      voidsRoot,
      lights: createLightRig(),
      ground: createShadowGround(),
      blob: createContactBlob(),
    };
    // The shell only — floor, walls, backsplash, end panel and the two corner legs, with the
    // bodies `buildKitchen()` placed removed so the sync below owns every placement. Built once
    // per mount: which bodies the reference room contributes is a property of the *port*, not of
    // the current design, and the initial records are what identify them.
  }, []);

  // Work item 8: the scene follows store state. Bodies that appeared are mounted, bodies and void
  // meshes that vanished are removed and disposed, and an unchanged body keeps its exact instance
  // — rebuilding it would discard its applied finish and re-run its wall seating. The finish is
  // re-applied over the fronts *after* the sync, since a body mounted this pass has none yet.
  useEffect(() => {
    syncSolidBodies({ kit: stage.kit, solidsRoot: stage.solidsRoot, records });
    syncVoidMeshes({ voidsRoot: stage.voidsRoot, voids });
    if (finish) applyFinish(collectFronts(stage.room), stage.kit.M, finish);
    invalidate();
  }, [stage, records, voids, finish, invalidate]);

  // ADR 0011 Gap B: `insert` measures the body it is about to place, and the probe needs a `Kit`
  // and the mounted room — neither of which exists until this component runs. The store therefore
  // holds the port and this is the only place the Three.js implementation is handed to it.
  useEffect(() => {
    attachBodyProbe(createBodyProbe(stage.kit, stage.room));
    // The probe measures inside *this* room. When the stage goes, so must it — the store is
    // module-scoped and would otherwise keep offering a probe over an unmounted scene.
    return detachBodyProbe;
  }, [stage, attachBodyProbe, detachBodyProbe]);

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

  useEffect(() => {
    seatObjectOnStage({
      object: stage.room,
      camera: camera as THREE.PerspectiveCamera,
      ground: stage.ground,
      blob: stage.blob,
      key: stage.lights.key,
    });
    invalidate();
  }, [stage, camera, invalidate]);

  // Row 2 / row 22 / accessory / drag-threshold picking (`DEVELOPMENT-SPEC.md` §6.1). Native DOM
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
      const target = pick(
        raycaster,
        stage.solidsRoot,
        stage.voidsRoot,
        records,
      );
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
  }, [gl, camera, stage, records, select, deselect, invalidate]);

  // Mobile gate: "a selected body and a selected slot are visually distinguishable without
  // opening any panel." A `Box3Helper`-style outline, not a shared-material mutation — cabinets
  // in this kit share `KitMaterials` instances, so recoloring a selected body's material would
  // recolor every body using that material.
  const highlightRef = useRef<THREE.BoxHelper | null>(null);
  useEffect(() => {
    if (highlightRef.current) {
      scene.remove(highlightRef.current);
      highlightRef.current.dispose();
      highlightRef.current = null;
    }
    if (!selection) {
      invalidate();
      return;
    }
    const root =
      selection.kind === "placement" ? stage.solidsRoot : stage.voidsRoot;
    const key = selection.kind === "placement" ? "placementId" : "voidId";
    const target = root.children.find(
      (child) => child.userData[key] === selection.id,
    );
    if (!target) {
      invalidate();
      return;
    }
    const helper = new THREE.BoxHelper(target, HIGHLIGHT_COLOR);
    scene.add(helper);
    highlightRef.current = helper;
    invalidate();
  }, [selection, scene, stage, invalidate]);

  const goal = useRef<CameraGoal | null>(null);
  const viewKey = sceneViewKey(view);
  const resolved = resolveSceneView(view);
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
