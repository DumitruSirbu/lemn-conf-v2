/** Public marker for the policy-neutral configurator domain package scaffold. */
export const CONFIGURATOR_DOMAIN_PACKAGE =
  "@lemnaria/configurator-domain" as const;

export * from "./schemas.js";
export * from "./room-transforms.js";
export * from "./design.js";
export * from "./void-engine.js";
export * from "./fixtures/kitchen-l-design.js";
export * from "./serialize-design.js";
export * from "./repository.js";
export * from "./migrate-design.js";
