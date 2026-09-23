import "server-only";

import type {
  AuthorizedConfigurationRepository,
  ShareLinkRepository,
  VisitorResumeRepository,
} from "@lemnaria/persistence";
import {
  NeonConfigurationRepository,
  NeonShareLinkRepository,
} from "@lemnaria/persistence";

/** The one instance's full shape: the write/read port every route already depended on, plus the
 *  resume lookup M7 wave 7E3a S3 adds. One class implements both (`NeonConfigurationRepository`),
 *  so this is a fact about the singleton below, not a new port to construct. */
type SharedRepository = AuthorizedConfigurationRepository &
  VisitorResumeRepository;

// Lazily created, not module-load-eager: `neon(process.env.DATABASE_URL!)` at import time would
// crash `next build` in any environment where the env var isn't set (e.g. CI without secrets).
let repository: SharedRepository | undefined;
let shareLinkRepository: ShareLinkRepository | undefined;

/** The single repository instance route handlers and server components share — the server-side
 *  port, whose update path takes a write credential (ADR 0019 decision 1), plus the visitor-resume
 *  lookup (D3). Plain lazy getter, not a `Proxy` wrapper — a `Proxy` around the repository breaks
 *  any code that introspects the underlying object (e.g. `instanceof`, class-shape checks in test
 *  doubles). */
export function getRepository(): SharedRepository {
  repository ??= new NeonConfigurationRepository();
  return repository;
}

/** The share-link port's own singleton (M7 wave 7E3c D3) — a separate instance from
 *  `getRepository()`'s, because `ShareLinkRepository` is a separate port, for the same reason
 *  `VisitorResumeRepository` is not folded into `AuthorizedConfigurationRepository`: about 16
 *  existing test doubles for the design port would otherwise have to fake share-link behaviour
 *  their own tests never exercise. */
export function getShareLinkRepository(): ShareLinkRepository {
  shareLinkRepository ??= new NeonShareLinkRepository();
  return shareLinkRepository;
}
