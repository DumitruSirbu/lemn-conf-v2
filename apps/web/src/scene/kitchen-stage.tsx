"use client";

import {
  applyFinish,
  collectFronts,
  configureRenderer,
  createContactBlob,
  createLightRig,
  createShadowGround,
  createStudioEnvironment,
  makeKit,
  seatObjectOnStage,
  type FinishKey,
} from "@lemnaria/three-adapter";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { resolveSceneView, sceneViewKey, type SceneView } from "./scene-view";

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
  finish?: FinishKey;
  onSettled?: () => void;
}

/**
 * The ported stage, mounted imperatively.
 *
 * The whole reference scene is built once by `builders['kitchen-l']()` and mounted through R3F's
 * `primitive` bridge — the geometry is never re-authored as JSX, which is the failure mode
 * `ARCHITECTURE_PROPOSAL.md` §6.1 exists to prevent.
 */
export function KitchenStage({ view, finish, onSettled }: KitchenStageProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitTarget | null;
  const invalidate = useThree((state) => state.invalidate);

  const stage = useMemo(() => {
    const kit = makeKit();
    const room = kit.builders["kitchen-l"]();
    return {
      kit,
      room,
      fronts: collectFronts(room),
      lights: createLightRig(),
      ground: createShadowGround(),
      blob: createContactBlob(),
    };
  }, []);

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

  useEffect(() => {
    if (!finish) return;
    applyFinish(stage.fronts, stage.kit.M, finish);
    invalidate();
  }, [finish, stage, invalidate]);

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
