/** Public marker for the policy-neutral configurator domain package scaffold. */
export const CONFIGURATOR_DOMAIN_PACKAGE =
  "@lemnaria/configurator-domain" as const;

export * from "./schemas.js";
export * from "./room-transforms.js";
export * from "./placement-layout.js";
export * from "./configuration-commands.js";
export * from "./pricing-engine.js";
