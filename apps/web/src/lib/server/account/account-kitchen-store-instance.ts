import "server-only";

import type { AccountKitchenStore } from "@lemnaria/persistence";
import { NeonAccountKitchenStore } from "@lemnaria/persistence";

let accountKitchenStore: AccountKitchenStore | undefined;

/**
 * The kitchen store's one instance, made on first use and never at import or build, so no connection is opened where no
 * kitchen is read. A module of its own, beside the account store's, so a test that fakes `repository.ts` whole does not
 * take it along.
 */
export function getAccountKitchenStore(): AccountKitchenStore {
  accountKitchenStore ??= new NeonAccountKitchenStore();
  return accountKitchenStore;
}
