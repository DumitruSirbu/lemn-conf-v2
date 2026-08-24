// Port of the renderer/lighting/camera harness in
// `design-source/Modern Kitchen Cabinets 3D (3)/three-d-stage.js`.
//
// The environment map, tone mapping, light rig and contact blob are not decoration: they are what
// makes the ported geometry read as product photography instead of a generic 3D scene, and
// `docs/milestones/M1-scene-port.md` treats them as part of the port. The web-component shell,
// the OBJ/GLB exporters and the toolbar are deliberately left behind — R3F owns the canvas now.
import * as THREE from "three";

import { context2d } from "./three-guards.js";

/** CSS colour behind the (alpha) canvas, and the background the reference preset shots were
 *  captured on. The scene itself never sets `scene.background`. */
export const STAGE_BACKGROUND = "#f2f0ea";

export const CAMERA_FIELD_OF_VIEW_DEGREES = 45;
export const TONE_MAPPING_EXPOSURE = 0.98;
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** `WebGLRenderer` construction parameters. `preserveDrawingBuffer` keeps the last frame readable
 *  after compositing, which is what lets a screenshot capture the scene instead of a blank canvas. */
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

/** Procedural studio environment — gives metals and gloss something real to reflect (soft sky
 *  gradient + two bright softbox panels), pre-filtered through `PMREMGenerator`. */
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

/** Neutral studio: soft sky/ground wash, a key light, and a dim fill from behind so silhouettes
 *  never go black. The key deliberately does not cast — see `createShadowGround`. */
export function createLightRig(): LightRig {
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 0.45);
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(4, 7, 5);
  key.castShadow = false;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.35);
  fill.position.set(-5, 3, -4);
  return { hemisphere, key, fill };
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

/** Soft contact blob under the object — anchors it without cast-shadow noise. Directional cast
 *  shadows stay off by design; enabling them reintroduces the banding that was rejected. */
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
}

/** The auto-frame half of the reference's `setObject()`: rest the object on the ground without
 *  moving its origin, size the contact blob to its footprint, and frame the camera to its bounds.
 *  Returns the framing target so the caller can hand it to orbit controls.
 *
 *  A camera preset applied afterwards overrides position and target but inherits the near/far
 *  planes derived here, exactly as the reference preset rig does. */
export function seatObjectOnStage(input: StageSeatingInput): THREE.Vector3 {
  const { object, camera, ground, blob, key } = input;
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
  const dist = (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
  const dir = new THREE.Vector3(1, 0.55, 1.25).normalize();
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

export type CameraPresetId = "overview" | "wallA" | "wallB";

/** `DEVELOPMENT-SPEC.md` §6.4. All three must frame floor to ceiling: with the target at 1.05 the
 *  2.2–2.6 m row projected to about 37 px in a 540 px viewport and became unclickable. */
export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: "overview", position: [4.3, 3.0, 5.3], target: [1.6, 1.35, 0.85] },
  { id: "wallA", position: [1.9, 2.1, 5.6], target: [1.7, 1.35, 0.45] },
  { id: "wallB", position: [5.4, 2.2, 2.3], target: [0.5, 1.35, 1.75] },
];

export function findCameraPreset(id: CameraPresetId): CameraPreset {
  const preset = CAMERA_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown camera preset: ${id}`);
  return preset;
}
