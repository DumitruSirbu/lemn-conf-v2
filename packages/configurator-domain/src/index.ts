/** Public marker for the policy-neutral configurator domain package scaffold. */
export const CONFIGURATOR_DOMAIN_PACKAGE =
  "@lemnaria/configurator-domain" as const;

export * from "./schemas.js";
export * from "./room-transforms.js";
export * from "./design.js";
// The finish shape, the three materials and their palettes (ADR 0071). Exported beside `design.js`
// because `CabinetBody.finish` is one of its values, and read by every surface that offers a colour.
export * from "./materials.js";
// Which material a design is on, resolved by the two rules every reader of `materialTierId` owes:
// PAL when unset, and an answer rather than a throw when the id names nothing declared.
export * from "./design-material.js";
// The colour a cabinet is actually wearing, over the three levels ADR 0099 decision 1 orders. The
// one authority: `@lemnaria/three-adapter` reads its answer and never the precedence rule.
export * from "./resolved-finish.js";
// The count the material change's confirmation is conditional on (ADR 0081 decision 1), and — since
// ADR 0099 decision 7 — its second arm. Beside `materials.js` because it is the second query the
// same declaration answers.
export * from "./chosen-finishes.js";
export * from "./design-bounds.js";
export * from "./validate-design.js";
export * from "./failure-text.js";
export * from "./void-engine.js";
export * from "./millimetres.js";
export * from "./bands.js";
export * from "./catalog.js";
// Deliberately not `export *`: the lookup and `declaredWorktopDepthsMm` stay module-internal, so no
// second caller can derive a wall depth from a worktop that is not `WORKTOP_DEPTH_MM` — which is a
// fresh way for two numbers to disagree, the defect this module closes.
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
// The one answer to *"does this front carry a handle bar"* (ADR 0092 decision 3, Amendment C).
// Exported because the three-adapter is a consumer: `scene-sync.ts` hides the bars by this and no
// longer restates the rule, so the scene and the price cannot answer it differently.
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
// `buildToTheClearanceM` and `shallowerBuildDepthM` stay module-internal: they are how
// `resolveDepthM` applies the declaration, and a second caller outside this package would be a
// second way to mint a build depth that no declaration produced — the defect ADR 0060 closes.
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
// ADR 0083 decision 5: the run-end panel's seat is a domain fact, so wall A's occupied width and
// the panel on screen come from one rule. Deliberately not `export *`: `blocksSeat`, the overlap
// test and the touching tolerance stay module-internal, so no second caller can mint a seat the
// veto never saw — which is the two-derivations defect this module closes.
export {
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M,
  runEndPanelSeatM,
} from "./run-end-panel.js";
// ADR 0090 decision 5: the whole frozen-map answer at a new cabinet depth, in the package that holds
// the three inputs it needs. Exported beside the command that publishes it — the store no longer
// computes any part of this map and reads it off `CabinetDepthSetEffect.columns`.
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
// Where a kitchen's two sink extras go (ADR 0070 decision 4, ADR 0092 decision 10). Deliberately not
// `export *`: the overlap arithmetic, the host predicate and the tie-break stay module-internal, so
// no second caller can derive a rack's position by a rule the query never saw — the two-derivations
// defect this module exists to close.
export {
  findSinkAccessories,
  type SinkAccessoryPositions,
} from "./queries/sink-accessories.js";
export * from "./queries/width-options.js";
export * from "./queries/width-steps.js";
export * from "./queries/vacated-void.js";
export * from "./pricing/price-book.js";
export * from "./pricing/price-lines.js";
// The book's ingress (ADR 0062 seam 1): a composition root parses once, and every consumer of a book
// downstream of it is reading a shape something has established rather than a type somebody
// declared.
export * from "./pricing/parse-price-book.js";
export * from "./pricing/price-design.js";
// The barrel is the **one** module that names the sample book (ADR 0062 seam 1): the query takes a
// book as a parameter and imports none, so a composition root picks this up from the package's
// public entry point and a book from another source is later a substitution rather than a refactor.
// `pricing-seams.test.ts` holds the import graph to that.
export * from "./pricing/sample-price-book.js";
export * from "./fixtures/kitchen-l-design.js";
export * from "./serialize-design.js";
export * from "./repository.js";
export * from "./migrate-design.js";
