import "server-only";

import type { AccountStore } from "@lemnaria/persistence";
import { NeonAccountStore } from "@lemnaria/persistence";

let accountStore: AccountStore | undefined;

/**
 * The account store's one instance, made on first use and never at import or build, so no connection is opened where no
 * account is read. A module of its own, beside the session store's, for the same reason: what a test fakes is the
 * database, and the files that mock `repository.ts` whole must not take this store with it.
 */
export function getAccountStore(): AccountStore {
  accountStore ??= new NeonAccountStore();
  return accountStore;
}
