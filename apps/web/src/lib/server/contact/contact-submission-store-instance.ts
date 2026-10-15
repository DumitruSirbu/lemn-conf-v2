import "server-only";

import type {
  ContactSubmissionStore,
  SentReferenceReader,
} from "@lemnaria/persistence";
import { NeonContactSubmissionStore } from "@lemnaria/persistence";

/** What the one instance does: the route's writes and lookups, and the confirmation page's read, on their own two
 *  interfaces so each caller takes only what it uses. */
type ContactSubmissionDatabase = ContactSubmissionStore & SentReferenceReader;

let contactSubmissionStore: ContactSubmissionDatabase | undefined;

/**
 * The contact request store's one instance, made on first use and never at import or build, so no connection is opened
 * where no request is stored. A request that reaches it with no `DATABASE_URL` is refused by the store, which the
 * caller answers. It is a module of its own, as the limiter's counter store is: what a test fakes is the database, and
 * the files that mock `repository.ts` whole must not take this store with it.
 */
export function getContactSubmissionStore(): ContactSubmissionDatabase {
  contactSubmissionStore ??= new NeonContactSubmissionStore();
  return contactSubmissionStore;
}
