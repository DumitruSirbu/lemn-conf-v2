// Renderer, lighting and camera harness. The environment map, tone mapping, light rig and contact blob are part of
// the visual contract, not decoration: they make the geometry read as product photography.
import {
  cornerDirectionOf,
  LEVELS,
  toMetres,
  wallLengthMm,
  type CornerDirection,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { mirroredX } from "./corner-direction.js";
import { floorDepthMm } from "./room-extent.js";
import { context2d } from "./three-guards.js";

/** CSS colour behind the (alpha) canvas, and the background the reference preset shots were captured on.
 *  The scene never sets `scene.background`. */
export const STAGE_BACKGROUND = "#f2f0ea";

export const CAMERA_FIELD_OF_VIEW_DEGREES = 45;
export const TONE_MAPPING_EXPOSURE = 0.98;
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** The reference's framing margin: stand back this much further than the distance that just fits the subject.
 *  Shared by the auto-frame in `seatObjectOnStage` and the camera presets. */
const FRAMING_HEADROOM = 1.35;

/** `fov` is **vertical**: this converts a distance into a framed height, and `aspect` widens the frustum from it. */
const VERTICAL_HALF_ANGLE_TANGENT = Math.tan(
  (CAMERA_FIELD_OF_VIEW_DEGREES * Math.PI) / 360,
);

/** `preserveDrawingBuffer` keeps the last frame readable after compositing, so a screenshot captures the scene
 *  rather than a blank canvas. */
export const RENDERER_PARAMETERS = {
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
} as const;

export type CanvasFactory = () => HTMLCanvasElement;

const defaultCanvasFactory: CanvasFactory = () =>
  document.createElement("canvas");

export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
}

/** Procedural studio environment (sky gradient and two softbox panels) for metals and gloss to reflect,
 *  pre-filtered through `PMREMGenerator`. */
export function createStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  createCanvas: CanvasFactory = defaultCanvasFactory,
): THREE.Texture {
  const c = createCanvas();
  c.width = 1024;
  c.height = 512;
  const x = context2d(c);
  const sky = x.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, "#ffffff");
  sky.addColorStop(0.42, "#e9eaec");
  sky.addColorStop(0.52, "#b9b6ae");
  sky.addColorStop(1.0, "#6d6a64");
  x.fillStyle = sky;
  x.fillRect(0, 0, 1024, 512);
  const soft = (cx: number, cy: number, w: number, h: number, a: number) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2);
    g.addColorStop(0, `rgba(255,255,255,${String(a)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(cx - w / 2, cy - h / 2, w, h);
  };
  soft(300, 150, 460, 300, 1.0);
  soft(760, 190, 360, 260, 0.75);
  soft(60, 250, 260, 200, 0.4);
  const tex = new THREE.Texture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
  return environment;
}

export interface LightRig {
  hemisphere: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

/** The rig's canonical (left-hand) positions, shared by `createLightRig` and `applyCornerDirectionToLightRig`. */
const KEY_LIGHT_POSITION_M: Vector3Tuple = [4, 7, 5];
const FILL_LIGHT_POSITION_M: Vector3Tuple = [-5, 3, -4];

/** Neutral studio rig: sky/ground wash, a key light, and a dim fill from behind. The key deliberately does not cast. */
export function createLightRig(): LightRig {
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 0.45);
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(...KEY_LIGHT_POSITION_M);
  key.castShadow = false;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.35);
  fill.position.set(...FILL_LIGHT_POSITION_M);
  return { hemisphere, key, fill };
}

/** The key and fill follow the room's mirror (x negated); the symmetric hemisphere is untouched (ADR 0129 decision 6).
 *  Written from the canonical constants, not by negating the current positions, so repeated calls are idempotent. */
export function applyCornerDirectionToLightRig(
  rig: Pick<LightRig, "key" | "fill">,
  direction: CornerDirection,
): void {
  rig.key.position.set(
    mirroredX(direction, KEY_LIGHT_POSITION_M[0]),
    KEY_LIGHT_POSITION_M[1],
    KEY_LIGHT_POSITION_M[2],
  );
  rig.fill.position.set(
    mirroredX(direction, FILL_LIGHT_POSITION_M[0]),
    FILL_LIGHT_POSITION_M[1],
    FILL_LIGHT_POSITION_M[2],
  );
}

export function createShadowGround(): THREE.Mesh {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

/** Soft contact blob under the object. Directional cast shadows stay off: enabling them brings back the banding. */
export function createContactBlob(
  createCanvas: CanvasFactory = defaultCanvasFactory,
): THREE.Mesh {
  const c = createCanvas();
  c.width = c.height = 256;
  const x = context2d(c);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.45, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = -1;
  blob.visible = false;
  return blob;
}

export interface StageSeatingInput {
  object: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  ground: THREE.Mesh;
  blob: THREE.Mesh;
  key: THREE.DirectionalLight;
  /** The auto-frame's offset is a fixed world-space vector that does not follow `object`'s mirror, so `direction` is
   *  `mirroredX`'d into it as the camera presets and light rig are; every caller must name the room's direction. */
  direction: CornerDirection;
}

/** The auto-frame half of the reference's `setObject()`: rests the object on the ground without moving its origin,
 *  sizes the contact blob to its footprint and frames the camera to its bounds. Returns the framing target for orbit
 *  controls. A camera preset applied afterwards overrides position and target but inherits the near/far planes. */
export function seatObjectOnStage(input: StageSeatingInput): THREE.Vector3 {
  const { object, camera, ground, blob, key, direction } = input;
  object.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  const target = new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return target;

  ground.position.y = box.min.y;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const blobSpan = Math.max(size.x, size.z) * 1.7;
  blob.scale.set(blobSpan, blobSpan, 1);
  blob.position.set(centre.x, box.min.y + 0.002, centre.z);
  blob.visible = true;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist =
    (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * FRAMING_HEADROOM;
  const dir = new THREE.Vector3(
    mirroredX(direction, 1),
    0.55,
    1.25,
  ).normalize();
  camera.position.copy(sphere.center).add(dir.multiplyScalar(dist));
  camera.near = Math.max(dist / 100, 0.01);
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  const span = sphere.radius * 3;
  key.shadow.camera.left = -span;
  key.shadow.camera.right = span;
  key.shadow.camera.top = span;
  key.shadow.camera.bottom = -span;
  key.shadow.camera.updateProjectionMatrix();
  return target.copy(sphere.center);
}

export type Vector3Tuple = readonly [number, number, number];

export interface CameraPreset {
  readonly id: CameraPresetId;
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
}

/** `wallC` is a U's own: `CAMERA_PRESETS` does not hold it, and it is derived from wall B's (`wallCPresetsOf`). */
export type CameraPresetId = "overview" | "wallA" | "wallB" | "wallC";

/** The three views the reference library has. Framing reads only these, so a `wallC` arm is a compile error. */
type ReferencePresetId = Exclude<CameraPresetId, "wallC">;

interface ReferenceCameraPreset extends CameraPreset {
  readonly id: ReferencePresetId;
}

/**
 * The reference library's three views, drawn on its one 4.2 x 3.4 m room (DEVELOPMENT-SPEC §6.4). Not what the app
 * reads: `cameraPresetsForRoom` frames the entered room. Retained as the three viewing directions the room does not
 * get to change, and as the witness a framing change is measured against. Each must frame the kitchen's top row
 * large enough to click: a 2.2–2.6 m row at about 37 px in a 540 px viewport was unclickable.
 */
export const CAMERA_PRESETS: readonly ReferenceCameraPreset[] = [
  { id: "overview", position: [4.3, 3.0, 5.3], target: [1.6, 1.35, 0.85] },
  { id: "wallA", position: [1.9, 2.1, 5.6], target: [1.7, 1.35, 0.45] },
  { id: "wallB", position: [5.4, 2.2, 2.3], target: [0.5, 1.35, 1.75] },
];

export function findCameraPreset(id: ReferencePresetId): ReferenceCameraPreset;
export function findCameraPreset(id: CameraPresetId): CameraPreset;
export function findCameraPreset(id: CameraPresetId): CameraPreset {
  const preset = CAMERA_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown camera preset: ${id}`);
  return preset;
}

/** The top of the tallest body a kitchen carries, read off the domain's `LEVELS` and never restated: a literal would
 *  be a second authority that goes stale silently. The maximum, not the last entry, so it does not depend on the grid
 *  staying sorted. A kitchen dimension, not a room one: presets frame the kitchen and permit the ceiling above the
 *  frame, so the 2.20–2.60 m row stays tappable in tall rooms (DEVELOPMENT-SPEC §11 row 21). */
export const KITCHEN_TOP_M = Math.max(...LEVELS.map(([, top]) => top));

/**
 * How far every preset stands from what it looks at, derived from the kitchen's height alone so the 2.20–2.60 m band
 * projects the same pixels in every room (DEVELOPMENT-SPEC §11 row 21). A distance derived from the room's length
 * would pull back as the wall grew and shrink that band.
 */
const PRESET_DISTANCE_M =
  (KITCHEN_TOP_M / 2 / VERTICAL_HALF_ANGLE_TANGENT) * FRAMING_HEADROOM;

/**
 * The presets framed on the room the customer entered; this is what the app reads. The room decides where each looks
 * (the middle of its wall, or of the floor) and the kitchen's height decides how far back it stands; every term is
 * linear in the room's dimensions, so there is no table or special case.
 *
 * A right-hand room's presets are the left-hand ones with x negated (ADR 0129 decision 6), at the same distance.
 * A straight room offers `overview` and `wallA` only: `wallB` would look at the middle of the drawn floor depth, not
 * a wall (ADR 0130 decision 7). A U adds `wallC` last; it is never right-hand (ADR 0132 decision 8), so no mirror.
 */
export function cameraPresetsForRoom(
  room: DesignRoom,
): readonly CameraPreset[] {
  const canonical = [
    ...CAMERA_PRESETS.filter(
      (reference) => room.shape !== "linear" || reference.id !== "wallB",
    ).map((reference) => framedOnRoom(reference, room)),
    ...wallCPresetsOf(room),
  ];
  const direction = cornerDirectionOf(room);
  return direction === "left"
    ? canonical
    : canonical.map((preset) => mirroredPreset(preset, direction));
}

/** `wallC` is `wallB` reflected in x = W/2 with `C` in place of `B`: wall B's reference view framed on a stand-in
 *  room whose depth is wall C's length, reflected by `reflectAbout`, then shifted by the room's width. A camera
 *  position and target only, never a `Group`, so `applyCornerDirection` does not apply. */
function wallCPresetsOf(room: DesignRoom): readonly CameraPreset[] {
  if (room.shape !== "U") return [];
  const wallB = findCameraPreset("wallB");
  const framed = framedOnRoom(wallB, {
    ...room,
    depthMm: wallLengthMm("C", room),
  });
  const widthM = toMetres(room.widthMm);
  const reflected = (point: Vector3Tuple): Vector3Tuple => {
    const [x, y, z] = reflectAbout("right", point);
    return [widthM + x, y, z];
  };
  return [
    {
      id: "wallC",
      position: reflected(framed.position),
      target: reflected(framed.target),
    },
  ];
}

function mirroredPreset(
  preset: CameraPreset,
  direction: CornerDirection,
): CameraPreset {
  return {
    id: preset.id,
    position: reflectAbout(direction, preset.position),
    target: reflectAbout(direction, preset.target),
  };
}

/** The one reflection the presets perform: negates a point's x about x = 0 (wall B's plane). Wall C's presets are
 *  wall B's reflected once and then shifted by the room's width. */
function reflectAbout(
  direction: CornerDirection,
  point: Vector3Tuple,
): Vector3Tuple {
  return [mirroredX(direction, point[0]), point[1], point[2]];
}

export function findCameraPresetForRoom(
  id: CameraPresetId,
  room: DesignRoom,
): CameraPreset {
  const preset = cameraPresetsForRoom(room).find(
    (candidate) => candidate.id === id,
  );
  if (!preset) throw new Error(`Unknown camera preset: ${id}`);
  return preset;
}

function framedOnRoom(
  reference: ReferenceCameraPreset,
  room: DesignRoom,
): CameraPreset {
  const target = targetInRoom(reference.id, room);
  const direction = viewingDirectionIn(reference, room);
  return {
    id: reference.id,
    position: [
      target[0] + direction[0] * PRESET_DISTANCE_M,
      target[1] + direction[1] * PRESET_DISTANCE_M,
      target[2] + direction[2] * PRESET_DISTANCE_M,
    ],
    target,
  };
}

/** Where each **reference** preset looks. Wall A runs along +x from the corner and wall B along +z, so each target is
 *  the middle of its entered length at half the kitchen's height; the overview looks at the middle of the drawn floor,
 *  whose depth is the farther of the side walls. Takes reference ids only: `wallC` is framed through wall B's view. */
function targetInRoom(id: ReferencePresetId, room: DesignRoom): Vector3Tuple {
  const widthM = toMetres(room.widthMm);
  const eyeM = KITCHEN_TOP_M / 2;
  switch (id) {
    case "overview":
      return [widthM / 2, eyeM, toMetres(floorDepthMm(room)) / 2];
    case "wallA":
      return [widthM / 2, eyeM, 0];
    case "wallB":
      return [0, eyeM, toMetres(room.depthMm) / 2];
  }
}

/** A U's overview looks in from its open side (ADR 0132 Amendment A3): the eye stands at x = W/2 looking along −z, at
 *  the reference's distance and elevation, so only the horizontal bearing is turned. Every other preset keeps the
 *  reference's direction. */
function viewingDirectionIn(
  reference: ReferenceCameraPreset,
  room: DesignRoom,
): Vector3Tuple {
  const direction = viewingDirectionOf(reference);
  if (room.shape !== "U" || reference.id !== "overview") return direction;
  const [x, elevation, z] = direction;
  return [0, elevation, Math.hypot(x, z)];
}

/** The reference's direction as a unit vector, read off `CAMERA_PRESETS` so the angles have one declaration. */
function viewingDirectionOf(reference: ReferenceCameraPreset): Vector3Tuple {
  const offset: Vector3Tuple = [
    reference.position[0] - reference.target[0],
    reference.position[1] - reference.target[1],
    reference.position[2] - reference.target[2],
  ];
  const length = Math.hypot(...offset);
  return [offset[0] / length, offset[1] / length, offset[2] / length];
}
