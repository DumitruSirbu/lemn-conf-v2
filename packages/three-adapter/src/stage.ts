// Port of the renderer/lighting/camera harness in
// `design-source/Modern Kitchen Cabinets 3D (3)/three-d-stage.js`.
//
// The environment map, tone mapping, light rig and contact blob are not decoration: they are what
// makes the ported geometry read as product photography instead of a generic 3D scene, and
// `docs/milestones/M1-scene-port.md` treats them as part of the port. The web-component shell,
// the OBJ/GLB exporters and the toolbar are deliberately left behind — R3F owns the canvas now.
import {
  cornerDirectionOf,
  LEVELS,
  toMetres,
  type CornerDirection,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { mirroredX } from "./corner-direction.js";
import { context2d } from "./three-guards.js";

/** CSS colour behind the (alpha) canvas, and the background the reference preset shots were
 *  captured on. The scene itself never sets `scene.background`. */
export const STAGE_BACKGROUND = "#f2f0ea";

export const CAMERA_FIELD_OF_VIEW_DEGREES = 45;
export const TONE_MAPPING_EXPOSURE = 0.98;
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** The reference's framing margin: having worked out how far back holds the subject, stand back
 *  this much further so it never touches the frame's edge. Used by the auto-frame in
 *  `seatObjectOnStage` and by the camera presets, which is why it is declared once. */
const FRAMING_HEADROOM = 1.35;

/** `fov` is **vertical**, so this is what a distance converts into a framed height; `aspect`
 *  widens the frustum horizontally from it. */
const VERTICAL_HALF_ANGLE_TANGENT = Math.tan(
  (CAMERA_FIELD_OF_VIEW_DEGREES * Math.PI) / 360,
);

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

/** The rig's canonical (left-hand) positions — declared once so `createLightRig` and
 *  `applyCornerDirectionToLightRig` (D6) read the same numbers instead of each carrying its own
 *  copy. */
const KEY_LIGHT_POSITION_M: Vector3Tuple = [4, 7, 5];
const FILL_LIGHT_POSITION_M: Vector3Tuple = [-5, 3, -4];

/** Neutral studio: soft sky/ground wash, a key light, and a dim fill from behind so silhouettes
 *  never go black. The key deliberately does not cast — see `createShadowGround`. */
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

/** ADR 0129 D6: the key and fill follow the room's mirror (x negated); the hemisphere is ambient
 *  and symmetric, so it is left untouched. Written from the canonical constants rather than by
 *  negating whatever the lights currently hold, so repeated calls are idempotent — the same
 *  in-place update `applyCornerDirection` gives a `Group`, applied here to two light positions
 *  instead (7H's pattern: a direction change updates the rig, never rebuilds it). */
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
  /** Review L1.4: the auto-frame's offset (below, `dir`) is a fixed world-space vector, so it does
   *  not follow `object`'s own mirror (D4) — a right-hand kitchen's bounding sphere moves to negative
   *  x, but the camera still approached it from world +x, front-on rather than from the customer's
   *  own front-right. `direction` is `mirroredX`'d into the offset the same way the camera presets
   *  and the light rig already are, so every caller must name the room's direction explicitly. */
  direction: CornerDirection;
}

/** The auto-frame half of the reference's `setObject()`: rest the object on the ground without
 *  moving its origin, size the contact blob to its footprint, and frame the camera to its bounds.
 *  Returns the framing target so the caller can hand it to orbit controls.
 *
 *  A camera preset applied afterwards overrides position and target but inherits the near/far
 *  planes derived here, exactly as the reference preset rig does. */
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

export type CameraPresetId = "overview" | "wallA" | "wallB";

/**
 * The reference library's three views, drawn on its one 4.2 x 3.4 m room — `DEVELOPMENT-SPEC.md`
 * §6.4. The recorded starting point, and **no longer what the app reads**: `cameraPresetsForRoom`
 * below frames the room the customer entered, and these three triples frame a room 99 customers in
 * 100 do not have.
 *
 * They are retained, exported and unmoved for two jobs. They are this file's declaration of the
 * **three viewing directions** — the reference's own aesthetic, which the room does not get to
 * change — and they are the regression witness a framing change is measured against.
 *
 * Its original note, kept because the failure it records is still the one to avoid: all three must
 * frame floor to ceiling, because with the target at 1.05 the 2.2–2.6 m row projected to about
 * 37 px in a 540 px viewport and became unclickable. Q7H-3 has since restated the *floor to
 * ceiling* half — the presets frame the **kitchen**, and the ceiling is permitted above the frame —
 * while leaving the 37 px failure exactly where it was.
 */
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

/** The top of the tallest body a kitchen carries.
 *
 *  **Read off the domain's `LEVELS`, never restated.** That grid — `module-grid.ts`,
 *  `DEVELOPMENT-SPEC.md` §2 — is where the level lines are declared, and its highest is the
 *  2.20–2.60 m row; nothing in the catalogue stands above it. A literal `2.6` here would be a
 *  second authority on the same fact, and the failure it enables is silent: a later wave raising
 *  the top level would leave the presets framing to a height no body reaches any more, with every
 *  test still green because they would all be reading the stale copy too. The **maximum** rather
 *  than the last entry, so the answer does not depend on the grid staying sorted.
 *
 *  **A kitchen dimension, not a room one**, and that is the whole of Q7H-3's ruling. At the
 *  owner-approved 3900 mm ceiling a camera pulled back far enough to hold floor-to-ceiling shrinks
 *  the 2.20–2.60 row by about a third, and §11 row 21 — that row stays tappable — is the one that
 *  must not break. So the presets frame the kitchen and the ceiling is permitted above the frame.
 *  The owner's own stated range is 2500–3000 mm (ADR 0110 E11); the 3900 bound is an arithmetic
 *  artefact of the old shell times 1.5, and no framing rule here is tuned for it. */
export const KITCHEN_TOP_M = Math.max(...LEVELS.map(([, top]) => top));

/**
 * How far every preset stands from what it looks at.
 *
 * **Derived from the kitchen's height and from nothing else**, which is what makes §11 row 21 safe
 * at every room in the policy: the 2.20–2.60 m band projects the same number of pixels in the
 * policy's smallest kitchen as in its largest, because the camera has not moved away from it.
 * A distance derived from the room's *length* would pull back as the wall grew and take the row
 * with it — measured, a camera far enough back to hold a 6300 mm wall leaves that band at about
 * 25 px of the 44 it owes.
 */
const PRESET_DISTANCE_M =
  (KITCHEN_TOP_M / 2 / VERTICAL_HALF_ANGLE_TANGENT) * FRAMING_HEADROOM;

/**
 * The three presets, framed on the room the customer entered.
 *
 * **This is what the app reads**; `CAMERA_PRESETS` above is the recorded starting point and the
 * source of the three viewing directions. The room decides **where** each preset looks — the middle
 * of the wall it is named for, or the middle of the floor — and the kitchen's own height decides
 * how far back it stands.
 *
 * **Not a lookup around a special case.** There is no room this answers from a table, the seeded
 * one included: two rooms a millimetre apart return presets a fraction of a millimetre apart,
 * because every term is linear in the room's dimensions.
 *
 * **A right-hand room's presets are the left-hand ones with x negated** (ADR 0129 D6): framed on
 * the canonical (left-hand) room first, then mirrored, so the distance and every other component
 * are exactly what they were — the camera does not pull back for a right-hand room (Q7H-7).
 *
 * **A straight room offers `overview` and `wallA` only** (ADR 0130 D9): `wallB` looks at the middle
 * of `room.depthMm`, which for a straight room is the drawn floor's depth in front of the run and
 * never a wall (D3) — there is nothing there for a preset to be *of*. Filtered here rather than
 * left for a caller to skip, so `cameraPresetsForRoom`'s own length answers "how many walls does
 * this room have" without a second reading of the shape.
 */
export function cameraPresetsForRoom(
  room: DesignRoom,
): readonly CameraPreset[] {
  const canonical = CAMERA_PRESETS.filter(
    (reference) => room.shape !== "linear" || reference.id !== "wallB",
  ).map((reference) => framedOnRoom(reference, room));
  const direction = cornerDirectionOf(room);
  return direction === "left"
    ? canonical
    : canonical.map((preset) => mirroredPreset(preset, direction));
}

function mirroredPreset(
  preset: CameraPreset,
  direction: CornerDirection,
): CameraPreset {
  return {
    id: preset.id,
    position: [
      mirroredX(direction, preset.position[0]),
      preset.position[1],
      preset.position[2],
    ],
    target: [
      mirroredX(direction, preset.target[0]),
      preset.target[1],
      preset.target[2],
    ],
  };
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

function framedOnRoom(reference: CameraPreset, room: DesignRoom): CameraPreset {
  const target = targetInRoom(reference.id, room);
  const direction = viewingDirectionOf(reference);
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

/** Where each preset looks. Wall A runs along +x from the corner and wall B along +z, so the middle
 *  of each is half its entered length; the eye is at half the kitchen's height. A `switch` over the
 *  union rather than a table, so a fourth preset cannot be added without deciding this. */
function targetInRoom(id: CameraPresetId, room: DesignRoom): Vector3Tuple {
  const widthM = toMetres(room.widthMm);
  const depthM = toMetres(room.depthMm);
  const eyeM = KITCHEN_TOP_M / 2;
  switch (id) {
    case "overview":
      return [widthM / 2, eyeM, depthM / 2];
    case "wallA":
      return [widthM / 2, eyeM, 0];
    case "wallB":
      return [0, eyeM, depthM / 2];
  }
}

/** The direction the reference stands in, as a unit vector. Read off `CAMERA_PRESETS` rather than
 *  restated, so the three angles have one declaration. */
function viewingDirectionOf(reference: CameraPreset): Vector3Tuple {
  const offset: Vector3Tuple = [
    reference.position[0] - reference.target[0],
    reference.position[1] - reference.target[1],
    reference.position[2] - reference.target[2],
  ];
  const length = Math.hypot(...offset);
  return [offset[0] / length, offset[1] / length, offset[2] / length];
}
