"use client";

import {
  DEFAULT_CABINET_DEPTH_MM,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import {
  applyCutaway,
  CAMERA_FIELD_OF_VIEW_DEGREES,
  cutawayWallsFor,
  overviewFittedToFrame,
  STAGE_BACKGROUND,
  type Vector3Tuple,
} from "@lemnaria/three-adapter";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

import { useConfiguratorStore } from "@/store/configurator-store";

import {
  PRESET_IMAGE_HEIGHT_PX,
  PRESET_IMAGE_WIDTH_PX,
  registerSceneSnapshotter,
  SceneCaptureUnavailableError,
} from "./capture-scene-image";

/** The names the adapter gives the roots it mounts bodies and voids on, and the overlays it draws over them
 *  (`kitchen-stage.tsx`, `selection-outline.ts`, `overflow-mark.ts`). */
const SOLIDS_ROOT_NAME = "solids";
const VOIDS_ROOT_NAME = "voids";
const OVERLAY_NAMES: readonly string[] = ["selection_outline", "overflow_mark"];

interface SnapshotRig {
  readonly gl: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly room: DesignRoom;
  readonly cabinetDepthMm: number;
  readonly invalidate: () => void;
}

interface SceneRoots {
  readonly solids: THREE.Object3D;
  readonly voids: THREE.Object3D;
}

/**
 * Lets the preset dialog ask the mounted editor canvas for a thumbnail. It is mounted by the editor's canvas only, so a
 * view-only scene (the review, a shared link) offers no capture. Renders nothing.
 */
export function SceneCaptureRegistration(): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const room = useConfiguratorStore((state) => state.design.room);
  const cabinetDepthMm = useConfiguratorStore(
    (state) =>
      state.design.settings?.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
  );

  useEffect(
    () =>
      registerSceneSnapshotter(() =>
        snapshotOverview({
          gl,
          scene,
          camera,
          room,
          cabinetDepthMm,
          invalidate,
        }),
      ),
    [gl, scene, camera, room, cabinetDepthMm, invalidate],
  );
  return null;
}

/**
 * One frame at the overview camera and the capture size, copied onto a canvas of its own. It all happens in one task: the
 * live canvas is resized, drawn and read, then put back and drawn again before the browser can paint, so the customer
 * sees no change. The renderer keeps its drawing buffer (`RENDERER_PARAMETERS`), which is what makes the read possible
 * after the draw; the output goes through the same tone mapping and colour space as the editor's own frame, which a
 * render target would not.
 */
function snapshotOverview(rig: SnapshotRig): HTMLCanvasElement {
  const roots = rootsOf(rig.scene);
  const liveWalls = cutawayWallsFor(
    eyeOf(rig.camera),
    rig.room,
    rig.cabinetDepthMm,
  );
  const liveFrame = frameOf(rig.gl);
  try {
    return drawOverviewFrame(rig, roots);
  } finally {
    applyCutaway(roots.solids, roots.voids, liveWalls);
    rig.gl.setPixelRatio(liveFrame.pixelRatio);
    rig.gl.setSize(liveFrame.width, liveFrame.height, false);
    rig.gl.render(rig.scene, rig.camera);
    rig.invalidate();
  }
}

function drawOverviewFrame(
  rig: SnapshotRig,
  roots: SceneRoots,
): HTMLCanvasElement {
  const shotCamera = overviewCameraFor(rig);
  // A U's cut walls follow the eye, and the eye of this frame is not the customer's.
  applyCutaway(
    roots.solids,
    roots.voids,
    cutawayWallsFor(eyeOf(shotCamera), rig.room, rig.cabinetDepthMm),
  );
  const hidden = hideOutlines(rig.scene, roots.voids);
  try {
    rig.gl.setPixelRatio(1);
    rig.gl.setSize(PRESET_IMAGE_WIDTH_PX, PRESET_IMAGE_HEIGHT_PX, false);
    rig.gl.render(rig.scene, shotCamera);
    return copyOnBackground(rig.gl.domElement);
  } finally {
    for (const object of hidden) object.visible = true;
  }
}

function rootsOf(scene: THREE.Scene): SceneRoots {
  const solids = scene.getObjectByName(SOLIDS_ROOT_NAME);
  const voids = scene.getObjectByName(VOIDS_ROOT_NAME);
  if (!solids || !voids) throw new SceneCaptureUnavailableError("no stage");
  return { solids, voids };
}

/** A camera of the editor's own lens and clip planes, looking along the room's overview direction from far enough back
 *  that the whole room fits the capture frame. */
function overviewCameraFor(rig: SnapshotRig): THREE.PerspectiveCamera {
  const live = rig.camera as THREE.PerspectiveCamera;
  const aspect = PRESET_IMAGE_WIDTH_PX / PRESET_IMAGE_HEIGHT_PX;
  const preset = overviewFittedToFrame(rig.room, aspect);
  const shot = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    aspect,
    live.near,
    live.far,
  );
  shot.position.set(...preset.position);
  shot.lookAt(...preset.target);
  shot.updateMatrixWorld();
  return shot;
}

/** The void outlines (the whole root), the selection outline and the overflow marks: drawn for editing, not part of the
 *  kitchen. Returns what was hidden so only that is shown again. */
function hideOutlines(
  scene: THREE.Scene,
  voids: THREE.Object3D,
): readonly THREE.Object3D[] {
  const outlines: THREE.Object3D[] = [];
  scene.traverseVisible((object) => {
    if (object === voids || OVERLAY_NAMES.includes(object.name)) {
      outlines.push(object);
    }
  });
  for (const outline of outlines) outline.visible = false;
  return outlines;
}

function copyOnBackground(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = PRESET_IMAGE_WIDTH_PX;
  copy.height = PRESET_IMAGE_HEIGHT_PX;
  const context = copy.getContext("2d");
  if (context === null) throw new SceneCaptureUnavailableError("no 2d context");
  // The renderer is transparent over the page's colour, and a JPEG has no transparency.
  context.fillStyle = STAGE_BACKGROUND;
  context.fillRect(0, 0, PRESET_IMAGE_WIDTH_PX, PRESET_IMAGE_HEIGHT_PX);
  context.drawImage(source, 0, 0);
  return copy;
}

function frameOf(gl: THREE.WebGLRenderer): {
  readonly pixelRatio: number;
  readonly width: number;
  readonly height: number;
} {
  const size = gl.getSize(new THREE.Vector2());
  return { pixelRatio: gl.getPixelRatio(), width: size.x, height: size.y };
}

function eyeOf(camera: THREE.Camera): Vector3Tuple {
  return [camera.position.x, camera.position.y, camera.position.z];
}
