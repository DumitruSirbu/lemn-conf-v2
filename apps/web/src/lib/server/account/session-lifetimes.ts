import "server-only";

import type { Role } from "@lemnaria/configurator-domain";
import type { IdleLifetimeSecondsByRole } from "@lemnaria/persistence";

// How long a session lives, by role (ADR 0172 decision 3; owner Q-L1). One table, so the cookie's `Max-Age`, the
// stored absolute expiry and the store's idle test cannot drift apart. A role that is added to the domain without a
// row here is a type error.

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Unseen this long, the session ends. Enforced by the server alone, through `last_seen_at`. */
export const IDLE_LIFETIME_SECONDS_BY_ROLE: IdleLifetimeSecondsByRole = {
  client: 30 * SECONDS_PER_DAY,
  operator: 12 * SECONDS_PER_HOUR,
  administrator: 12 * SECONDS_PER_HOUR,
};

/** From the start, whatever the activity. Also the session cookie's `Max-Age`, set once and never re-sent. */
export const ABSOLUTE_LIFETIME_SECONDS_BY_ROLE: Readonly<Record<Role, number>> =
  {
    client: 90 * SECONDS_PER_DAY,
    operator: 7 * SECONDS_PER_DAY,
    administrator: 7 * SECONDS_PER_DAY,
  };
