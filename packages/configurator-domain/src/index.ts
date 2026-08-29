/** Public marker for the policy-neutral configurator domain package scaffold. */
export const CONFIGURATOR_DOMAIN_PACKAGE =
  "@lemnaria/configurator-domain" as const;

export * from "./schemas.js";
export * from "./room-transforms.js";
export * from "./design.js";
export * from "./void-engine.js";
export * from "./millimetres.js";
export * from "./bands.js";
export * from "./catalog.js";
// Deliberately not `export *`: the lookup and `declaredWorktopDepthsMm` stay module-internal, so no
// second caller can derive a wall depth from a worktop that is not `WORKTOP_DEPTH_MM` — which is a
// fresh way for two numbers to disagree, the defect this module closes.
export { occupiedDepthM } from "./occupied-depth.js";
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
export * from "./commands/set-width.js";
export * from "./queries/describe-selection.js";
export * from "./queries/offers.js";
export * from "./queries/width-options.js";
export * from "./queries/vacated-void.js";
export * from "./fixtures/kitchen-l-design.js";
export * from "./serialize-design.js";
export * from "./repository.js";
export * from "./migrate-design.js";
