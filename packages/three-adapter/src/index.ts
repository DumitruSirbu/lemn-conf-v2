export {
  makeKit,
  PARTS,
  type BaseCabinetOptions,
  type BuilderKey,
  type Builders,
  type Factories,
  type Kit,
  type KitMaterials,
  type KitOptions,
  type PartGroup,
  type PartItem,
} from "./kitchen-parts.js";

export {
  applyFinish,
  collectFronts,
  FINISH_COLORS,
  type FinishKey,
  type SolidFinishKey,
} from "./finishes.js";

export {
  buildDecomposedBody,
  hidePushOpenHandles,
  setHandlesVisible,
} from "./decomposed-bodies.js";

export {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  HOOD_CANOPY_HEIGHT_M,
  isCatalogBuildId,
  type CatalogBodySize,
} from "./catalog-bodies.js";

export {
  CARCASS_MESH_NAME_PATTERN,
  createBodyProbe,
  measureBuiltBody,
  readWallPlaneM,
  WALL_A_MESH_NAME,
  WALL_B_MESH_NAME,
  type MeasureBuiltBodyInput,
} from "./measure-built-body.js";

export { disposeUnsharedGeometries, isLine, isMesh } from "./three-guards.js";

export {
  disposeSolidBody,
  disposeVoidMesh,
  syncSolidBodies,
  syncVoidMeshes,
  type SolidSyncInput,
  type VoidSyncInput,
} from "./scene-sync.js";

export {
  buildVoidMesh,
  NOOP_RAYCAST,
  VOID_INSET_M,
  type VoidMesh,
} from "./void-mesh.js";

export {
  climbToSelectable,
  createPickingRaycaster,
  DRAG_THRESHOLD_PX,
  isDragGesture,
  LINE_RAYCAST_THRESHOLD_M,
  pick,
  resolveHostPlacementId,
  resolveSelection,
  type PointerPixel,
  type Selection,
  type SelectionKind,
} from "./picking.js";

export {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_PRESETS,
  configureRenderer,
  createContactBlob,
  createLightRig,
  createShadowGround,
  createStudioEnvironment,
  findCameraPreset,
  MAX_DEVICE_PIXEL_RATIO,
  RENDERER_PARAMETERS,
  seatObjectOnStage,
  STAGE_BACKGROUND,
  TONE_MAPPING_EXPOSURE,
  type CameraPreset,
  type CameraPresetId,
  type CanvasFactory,
  type LightRig,
  type StageSeatingInput,
  type Vector3Tuple,
} from "./stage.js";
