import "server-only";

import { ContactSubmissionStoreError } from "@lemnaria/persistence";

import type { ContactUnavailableCause } from "@/lib/server/contact/contact-log";

/**
 * A step of the request failed for a reason of ours that has a name on the closed list of causes. It carries that
 * cause and nothing else: no message that holds a value, no cause chain, nothing a thrown value said.
 */
export class ContactFailure extends Error {
  readonly unavailableCause: ContactUnavailableCause;

  constructor(cause: ContactUnavailableCause) {
    super(`A contact request step failed: ${cause}`);
    this.name = "ContactFailure";
    this.unavailableCause = cause;
  }
}

/** Which cause on the closed list a thrown value became; its message, name and cause are never read. */
export function causeOf(thrown: unknown): ContactUnavailableCause {
  if (thrown instanceof ContactFailure) return thrown.unavailableCause;
  if (thrown instanceof ContactSubmissionStoreError) {
    return "submission-store-failed";
  }
  return "unexpected";
}
