import "server-only";

import type { SentMarkStore } from "@lemnaria/persistence";
import { NeonSentMarkStore } from "@lemnaria/persistence";

let sentMarkStore: SentMarkStore | undefined;

/**
 * The sent mark's one instance, made on first use and never at import or build, so no connection is opened where no
 * request is stored. A module of its own beside the contact store's, for the same reason: what a test fakes is the
 * database, and the files that mock `repository.ts` whole must not take this store with it.
 */
export function getSentMarkStore(): SentMarkStore {
  sentMarkStore ??= new NeonSentMarkStore();
  return sentMarkStore;
}
