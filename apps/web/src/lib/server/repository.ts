import "server-only";

import type {
  AuthorizedConfigurationRepository,
  OwnedDesignRepository,
  SentKitchenViewRepository,
  ShareLinkRepository,
  VisitorResumeRepository,
} from "@lemnaria/persistence";
import {
  NeonConfigurationRepository,
  NeonSentKitchenViewRepository,
  NeonShareLinkRepository,
} from "@lemnaria/persistence";

/**
 * The one instance's shape every web module may reach: the write port every route already depended
 * on, minus the ungated `load` (M7 wave 7E3b D4, ADR 0114 decision 5) — `Omit` rather than a second,
 * separate interface, so the removal shows up here as a type error at every existing call site
 * instead of a silently-still-callable method — plus the gated `loadOwned` and the resume lookup.
 * One class implements all three (`NeonConfigurationRepository`), so this is a fact about the
 * singleton below, not a new port to construct; `load` stays on that class itself for the
 * persistence package's own live suites, which need the unfiltered read to assert against the raw
 * row.
 */
type SharedRepository = Omit<AuthorizedConfigurationRepository, "load"> &
  OwnedDesignRepository &
  VisitorResumeRepository;

// Lazily created, not module-load-eager: `neon(process.env.DATABASE_URL!)` at import time would
// crash `next build` in any environment where the env var isn't set (e.g. CI without secrets).
let repository: SharedRepository | undefined;
let shareLinkRepository: ShareLinkRepository | undefined;
let sentKitchenViewRepository: SentKitchenViewRepository | undefined;

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

/** The frozen copies of the kitchens the shop was sent: a port of its own beside the share link's, read by the share
 *  page when a token names no share link, and written by the shop's notice. */
export function getSentKitchenViewRepository(): SentKitchenViewRepository {
  sentKitchenViewRepository ??= new NeonSentKitchenViewRepository();
  return sentKitchenViewRepository;
}
