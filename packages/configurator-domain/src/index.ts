/** Public marker for the policy-neutral configurator domain package scaffold. */
export const CONFIGURATOR_DOMAIN_PACKAGE =
  "@lemnaria/configurator-domain" as const;

export * from "./schemas.js";
export * from "./room-transforms.js";
export * from "./design.js";
// The finish shape, the three materials and their palettes (ADR 0071), beside `design.js` because
// `CabinetBody.finish` is one of its values.
export * from "./materials.js";
// Which material a design is on: PAL when unset, and an answer rather than a throw when the id names
// nothing declared.
export * from "./design-material.js";
// The colour a cabinet wears, over the three levels of ADR 0099 decision 1. The one authority:
// `@lemnaria/three-adapter` reads its answer and never the precedence rule.
export * from "./resolved-finish.js";
// The count the material change's confirmation is conditional on (ADR 0081 decision 1) and its second
// arm (ADR 0099 decision 7).
export * from "./chosen-finishes.js";
export * from "./design-bounds.js";
export * from "./validate-design.js";
export * from "./failure-text.js";
export * from "./void-engine.js";
export * from "./millimetres.js";
export * from "./bands.js";
export * from "./catalog.js";
// Not `export *`: the lookup and `declaredWorktopDepthsMm` stay module-internal, so no second caller
// can derive a wall depth from a worktop that is not `WORKTOP_DEPTH_MM`.
export {
  finishesAtMm,
  NO_FRONT_ASSEMBLY_MM,
  occupiedDepthM,
  occupiedDepthOfEntryM,
  recordedClearanceM,
  shellPlusFrontMm,
  UndeclaredOccupiedDepthError,
  type CatalogEntryDepthQuery,
  type ClearanceM,
  type OccupiedDepthRule,
} from "./occupied-depth.js";
export {
  cabinetHandleCount,
  carriesHandles,
  handlesOnDoorLeaves,
  NO_CABINET_HANDLES,
  UndeclaredCabinetHandleCountError,
  widthDerivedDoorLeafCount,
  type CabinetHandleCountField,
  type CabinetHandleQuery,
  type CabinetHandleRule,
  type DoorLeafHandles,
} from "./cabinet-handles.js";
export {
  BASE_DOOR_BAND_HEIGHT_MM,
  carriesDrawers,
  carriesFronts,
  ContradictoryFrontDeclarationError,
  doorBandHeightsMm,
  doorBandsMm,
  doorLeafCount,
  doorLeafHeightsMm,
  doorLeavesFollowWidth,
  drawerCount,
  frontPopulationQueryFor,
  FRIDGE_HOUSING_DOOR_BAND_HEIGHTS_MM,
  NO_DOOR_BANDS,
  NO_DRAWERS,
  NO_OPENING_FRONTS,
  oneBandInsetFromFrameMm,
  refuseContradictoryFrontDeclarations,
  OVEN_TOWER_DOOR_BAND_HEIGHTS_MM,
  PANTRY_DOOR_BAND_HEIGHTS_MM,
  UnbuildableDoorBandError,
  UndeclaredFrontPopulationError,
  WALL_DOOR_BAND_INSET_MM,
  wallDoorBandHeightMm,
  type DeclaredFronts,
  type DeclaresFronts,
  type DoorBandsRule,
  type FrontPopulationField,
  type FrontPopulationQuery,
  type FrontPopulationRule,
  type PlacedBody,
} from "./front-population.js";
// The one answer to whether a front carries a handle bar (ADR 0092 decision 3, Amendment C). The
// three-adapter's `scene-sync.ts` hides bars by this, so the scene and the price cannot differ.
export {
  isPushToOpen,
  TOP_ROW_Y0_MM,
  type PushToOpenQuery,
} from "./push-to-open.js";
export {
  countHardwareMechanisms,
  HINGES_PER_DOOR_LEAF,
  HINGES_PER_TALL_DOOR_LEAF,
  NO_HARDWARE_MECHANISMS,
  TALL_DOOR_LEAF_THRESHOLD_MM,
  type HardwareMechanismCounts,
} from "./hardware-mechanisms.js";
// `buildToTheClearanceM` and `shallowerBuildDepthM` stay module-internal: a second caller outside this
// package would be a second way to mint a build depth no declaration produced (ADR 0060).
export {
  cabinetDepthRuleOf,
  columnBuildDepthM,
  columnBuildDepthMm,
  declaresALiftedColumnDepth,
  depthFollowsSetting,
  FOLLOWS_CABINET_DEPTH,
  FOLLOWS_CABINET_DEPTH_ON_WALL_MAP,
  IS_A_MANUFACTURED_SIZE,
  pinnedAtFinishedDepthMm,
  UndeclaredCabinetDepthRuleError,
  type BuildDepthM,
  type AlongWallDepthChain,
  type CabinetDepthRule,
  type CabinetDepthRuleQuery,
  type ColumnBuildDepthQuery,
} from "./cabinet-depth-rule.js";
export {
  bodyFinishRuleOf,
  choosesItsOwnColour,
  CHOOSES_ITS_OWN_COLOUR,
  ContradictoryBodyFinishRuleError,
  FOLLOWS_THE_KITCHENS_COLOUR,
  IS_NEVER_PAINTED,
  UndeclaredBodyFinishRuleError,
  type BodyFinishRule,
  type BodyFinishRuleQuery,
} from "./body-finish-rule.js";
export {
  isMeasurableSeat,
  JointSeatIsNotMeasurableError,
  measurableSeatOf,
  seatRuleOf,
  seatedByAJoint,
  seatedOnCabinetFrontLine,
  seatedOnWallPlane,
  UndeclaredSeatRuleError,
  type MeasurableSeatedOn,
  type SeatRule,
  type SeatedOn,
} from "./seat-rule.js";
export {
  CabinetDepthBelowMinimumError,
  declaredCabinetDepthsMm,
  DEFAULT_CABINET_DEPTH_MM,
  MIN_CABINET_DEPTH_MM,
  requireDeclaredCabinetDepthMm,
  UnknownWorktopDepthError,
  WALL_FRONT_ASSEMBLY_MM,
  WORKTOP_DEPTH_MM,
} from "./worktop-depth.js";
export * from "./body-probe.js";
// ADR 0083 decision 5: the run-end panel's seat is a domain fact, so wall A's occupied width and the
// panel on screen come from one rule. Not `export *`: `blocksSeat`, the overlap test and the touching
// tolerance stay module-internal, so no second caller can mint a seat the veto never saw.
export {
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
} from "./run-end-panel.js";
// ADR 0090 decision 5: the whole frozen-map answer at a new cabinet depth, published beside the
// command that uses it; the store reads it off `CabinetDepthSetEffect.columns`.
export {
  frozenMapAtCabinetDepth,
  type FrozenMapAtCabinetDepthInput,
} from "./frozen-map-at-cabinet-depth.js";
export * from "./commands/rejection.js";
export * from "./commands/command-result.js";
export * from "./commands/insert-fit.js";
export * from "./commands/remove-placement.js";
export * from "./commands/insert-body.js";
export * from "./commands/set-appearance.js";
export * from "./commands/set-whole-kitchen-settings.js";
export * from "./commands/set-cabinet-depth.js";
export * from "./commands/set-width.js";
export * from "./queries/describe-selection.js";
export {
  compareDisplayOrder,
  projectDesignForDisplay,
  type DisplayEntry,
  type DisplayGroup,
} from "./queries/design-projection.js";
export * from "./queries/offers.js";
export {
  findOverflowingPlacementIds,
  wallLengthMm,
} from "./queries/overflowing-placements.js";
// Where a kitchen's two sink extras go (ADR 0070 decision 4, ADR 0092 decision 10). Not `export *`:
// the overlap arithmetic, host predicate and tie-break stay module-internal, so no second caller can
// derive a rack's position by a rule the query never saw.
export {
  findSinkAccessories,
  type SinkAccessoryPositions,
} from "./queries/sink-accessories.js";
export * from "./queries/width-options.js";
export * from "./queries/width-steps.js";
export * from "./queries/vacated-void.js";
// Whether a stored kitchen may be kept as a preset, the room it is saved in, and the facts its generated name is made
// of (ADR 0112 decision 4, Amendment A).
export * from "./preset/preset-candidate.js";
export * from "./preset/preset-name-facts.js";
export * from "./pricing/price-book.js";
export * from "./pricing/price-lines.js";
// The book's ingress (ADR 0062 seam 1): a composition root parses once, so every consumer downstream
// reads a shape something has established rather than a type somebody declared.
export * from "./pricing/parse-price-book.js";
export * from "./pricing/price-design.js";
// The one module that names the sample book (ADR 0062 seam 1): the query imports no book, so a
// composition root picks it up here and a book from another source is a substitution.
// `pricing-seams.test.ts` holds the import graph to that.
export * from "./pricing/sample-price-book.js";
export * from "./fixtures/kitchen-l-design.js";
export * from "./serialize-design.js";
export * from "./repository.js";
export * from "./migrate-design.js";
// The room a customer types, judged against policy data (ADR 0108). The policy is a parameter of the
// validator, and the owner-approved one is exported for `apps/web`'s composition root to hand in. The
// engine's own limits stay unexported (Amendment B): they are what the approved policy is guarded
// against, never a policy a surface may run on.
export { APPROVED_ROOM_POLICY } from "./room/approved-room-policy.js";
// The one question a surface asks about a shape it offers, so a card reads the policy instead of
// spelling a shape's letter.
export { isShapeBuildable } from "./room/room-policy.js";
export type {
  BuildableShapes,
  LinearWallBounds,
  LMinimumKitchen,
  LWallBounds,
  MillimetreBounds,
  RoomPolicy,
  RoomPolicyApproval,
  UMinimumKitchen,
  UWallBounds,
} from "./room/room-policy.js";
export {
  validateRoomInput,
  type CornerDirection,
  type EnteredMillimetres,
  type LinearRoomInput,
  type LRoomInput,
  type RoomField,
  type RoomInput,
  type RoomIssue,
  type RoomIssueCode,
  type RoomShape,
  type RoomValidation,
  type URoomInput,
} from "./room/validate-room.js";
// The one production reader of `DesignRoom.cornerDirection` (ADR 0129 D2).
export {
  carriesCornerDirection,
  cornerDirectionOf,
} from "./room/corner-direction.js";
// Which walls a shape has (ADR 0132 decision 5).
export { wallsOf } from "./room/walls-of-shape.js";
// How wide the corner assembly is built (ADR 0120 Amendment A): `narrowestCornerReachMm` answers the
// bound and takes no room, the other two answer one (depth, room), and their return types differ so
// the questions cannot be confused. `cornerAlongWallCentreMm` stays in the package: nothing outside
// the domain places a corner.
export {
  CORNER_ASSEMBLY_PIECES,
  cornerAssemblyWidthsMm,
  cornerFarEdgeMm,
  narrowestCornerReachMm,
  type CornerAssemblyPiece,
  type CornerAssemblyQuery,
  type CornerAssemblyWidthsMm,
  type CornerBand,
  type CornerFarEdge,
  type CornerFarEdgeQuery,
  type NarrowestCornerReach,
  type SizedCornerPiece,
} from "./corner-assembly-size.js";
// Which of a U's two corners a structural piece belongs to (ADR 0132 decision 2): the one
// fact the adapter reads to choose a right corner's mirrored wrapper. The right corner's sizing and
// placement stay unexported, as `cornerAlongWallCentreMm` is.
export { cornerOf, type Corner } from "./corner-assembly-size.js";
// The design composition starts from (ADR 0110 decision 1, Amendment B): the entered room, the corner
// that fits under its ceiling, and every free run recorded as empty space.
export {
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  linearShellFloorRuns,
  LinearShellInputError,
  lShellFloorRuns,
  LShellInputError,
  uShellFloorRuns,
  UShellInputError,
  type LinearShellCompositionPlan,
  type LinearShellDesignInput,
  type LinearShellInputRefusal,
  type LShellCompositionPlan,
  type LShellDesignInput,
  type LShellInputRefusal,
  type UShellCompositionPlan,
  type UShellDesignInput,
  type UShellInputRefusal,
} from "./generation/shell-design.js";
// Named, not `export *`: the absorb rule beside `planLeftover` is internal to generation.
export {
  MAX_GENERATED_LEFTOVER_MM,
  planLeftover,
  STORAGE_BODY_WIDTH_MM,
  type LeftoverPlan,
} from "./generation/leftover-rule.js";
export * from "./generation/body-choice.js";
export { DISHWASHER_PLANNED_WIDTH_MM } from "./generation/dishwasher-beside-the-sink.js";
export * from "./generation/generation-priorities.js";
// The U's own three-wall plan (ADR 0110 Amendment N). `UKitchenCompositionPlan` and
// `UPlannedGenerationBase` are re-exported directly because `generation-priorities.ts`, the only
// other re-exporter of `run-layout.ts`'s types, is not touched for the U.
export type {
  UKitchenCompositionPlan,
  UPlannedGenerationBase,
} from "./generation/run-layout.js";
export * from "./generation/u-composition.js";
export * from "./generation/generate-kitchen.js";
export * from "./commands/reconcile-command-result.js";
export * from "./contact/index.js";
