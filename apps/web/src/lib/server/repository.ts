import "server-only";

import type { AuthorizedConfigurationRepository } from "@lemnaria/persistence";
import { NeonConfigurationRepository } from "@lemnaria/persistence";

// Lazily created, not module-load-eager: `neon(process.env.DATABASE_URL!)` at import time would
// crash `next build` in any environment where the env var isn't set (e.g. CI without secrets).
let repository: AuthorizedConfigurationRepository | undefined;

/** The single `AuthorizedConfigurationRepository` instance route handlers and server components
 *  share — the server-side port, whose update path takes a write credential (ADR 0019 decision 1).
 *  Plain lazy getter, not a `Proxy` wrapper — a `Proxy` around the repository breaks any code that
 *  introspects the underlying object (e.g. `instanceof`, class-shape checks in test doubles). */
export function getRepository(): AuthorizedConfigurationRepository {
  repository ??= new NeonConfigurationRepository();
  return repository;
}
