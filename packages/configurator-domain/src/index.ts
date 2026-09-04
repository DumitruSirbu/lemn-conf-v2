/** Public marker for the policy-neutral configurator domain package scaffold. */
export const CONFIGURATOR_DOMAIN_PACKAGE =
  "@lemnaria/configurator-domain" as const;

export * from "./schemas.js";
export * from "./room-transforms.js";
export * from "./design.js";
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
  recordedClearanceM,
  shellPlusFrontMm,
  UndeclaredOccupiedDepthError,
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
// `buildToTheClearanceM` and `shallowerBuildDepthM` stay module-internal: they are how
// `resolveDepthM` applies the declaration, and a second caller outside this package would be a
// second way to mint a build depth that no declaration produced — the defect ADR 0060 closes.
export {
  cabinetDepthRuleOf,
  columnBuildDepthM,
  columnBuildDepthMm,
  depthFollowsSetting,
  FOLLOWS_CABINET_DEPTH,
  IS_A_MANUFACTURED_SIZE,
  pinnedAtFinishedDepthMm,
  UndeclaredCabinetDepthRuleError,
  type BuildDepthM,
  type CabinetDepthRule,
  type CabinetDepthRuleQuery,
  type ColumnBuildDepthQuery,
} from "./cabinet-depth-rule.js";
export {
  UnknownWorktopDepthError,
  WALL_FRONT_ASSEMBLY_MM,
  WORKTOP_DEPTH_MM,
} from "./worktop-depth.js";
export * from "./body-probe.js";
export * from "./commands/rejection.js";
export * from "./commands/command-result.js";
export * from "./commands/insert-fit.js";
export * from "./commands/remove-placement.js";
export * from "./commands/insert-body.js";
export * from "./commands/set-appearance.js";
export * from "./commands/set-whole-kitchen-settings.js";
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
export * from "./queries/width-options.js";
export * from "./queries/width-steps.js";
export * from "./queries/vacated-void.js";
export * from "./pricing/price-book.js";
export * from "./pricing/price-lines.js";
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
