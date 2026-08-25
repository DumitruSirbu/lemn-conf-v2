import "server-only";

import type { ConfigurationRepository } from "@lemnaria/configurator-domain";
import { NeonConfigurationRepository } from "@lemnaria/persistence";

// Lazily created, not module-load-eager: `neon(process.env.DATABASE_URL!)` at import time would
// crash `next build` in any environment where the env var isn't set (e.g. CI without secrets).
let repository: ConfigurationRepository | undefined;

/** The single `ConfigurationRepository` instance route handlers and server components share.
 *  Plain lazy getter, not a `Proxy` wrapper — a `Proxy` around the repository breaks any code that
 *  introspects the underlying object (e.g. `instanceof`, class-shape checks in test doubles). */
export function getRepository(): ConfigurationRepository {
  repository ??= new NeonConfigurationRepository();
  return repository;
}
