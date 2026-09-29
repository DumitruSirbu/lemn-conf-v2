export { applyCornerDirection, mirroredX } from "./corner-direction.js";

export {
  RIGHT_CORNER_WRAPPER_NAME,
  rightCornerRecordIds,
} from "./right-corner-wrapper.js";

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
  collectPaintedSurfaces,
  finishSignature,
  swatchOf,
  type FinishSwatch,
} from "./finishes.js";

export {
  buildDecomposedBody,
  hidePushOpenHandles,
  setHandlesVisible,
} from "./decomposed-bodies.js";

export {
  buildKitchenShell,
  resizeShellToRoom,
  type ShellResizeInput,
} from "./kitchen-shell.js";

export {
  disposeDiscardedBodies,
  disposeKit,
  disposeKitAndStage,
  type DiscardedBodyDisposal,
  type KitStage,
} from "./kit-disposal.js";

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

export {
  disposeUnsharedGeometries,
  isLine,
  isMaterial,
  isMesh,
  isTexture,
} from "./three-guards.js";

export {
  disposeSolidBody,
  disposeVoidMesh,
  syncSolidBodies,
  syncVoidMeshes,
  type SolidSyncInput,
  type VoidSyncInput,
} from "./scene-sync.js";

export {
  buildOverflowMark,
  disposeOverflowMark,
  OVERFLOW_MARK_COLOR,
  OVERFLOW_MARK_OPACITY,
  type OverflowMark,
  type OverflowMarkInput,
} from "./overflow-mark.js";

export {
  buildSelectionOutline,
  disposeSelectionOutline,
  OCCLUDED_OUTLINE_OPACITY,
  OCCLUDED_OUTLINE_WIDTH_PX,
  SELECTION_HIGHLIGHT_COLOR,
  SELECTION_OUTLINE_CASING_COLOR,
  SELECTION_OUTLINE_CASING_WIDTH_PX,
  SELECTION_OUTLINE_WIDTH_PX,
  type SelectionOutline,
  type SelectionOutlineInput,
} from "./selection-outline.js";

export {
  buildVoidMesh,
  NOOP_RAYCAST,
  VOID_INSET_M,
  type VoidMesh,
} from "./void-mesh.js";

export { applyCutaway, cutawayWallsFor } from "./cutaway.js";

export {
  climbToSelectable,
  createPickingRaycaster,
  DRAG_THRESHOLD_PX,
  isDragGesture,
  LINE_RAYCAST_THRESHOLD_M,
  pick,
  type PointerPixel,
  type Selection,
  type SelectionKind,
} from "./picking.js";

export {
  applyCornerDirectionToLightRig,
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_PRESETS,
  cameraPresetsForRoom,
  configureRenderer,
  createContactBlob,
  createLightRig,
  createShadowGround,
  createStudioEnvironment,
  findCameraPreset,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
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
