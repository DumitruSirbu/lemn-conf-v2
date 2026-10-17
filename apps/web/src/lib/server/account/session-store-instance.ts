import "server-only";

import type { SessionStore } from "@lemnaria/persistence";
import { NeonSessionStore } from "@lemnaria/persistence";

let sessionStore: SessionStore | undefined;

/**
 * The session store's one instance, made on first use and never at import or build, so no connection is opened where no
 * session is read. A module of its own, as the contact store's is: what a test fakes is the database, and the files that
 * mock `repository.ts` whole must not take this store with it.
 */
export function getSessionStore(): SessionStore {
  sessionStore ??= new NeonSessionStore();
  return sessionStore;
}
