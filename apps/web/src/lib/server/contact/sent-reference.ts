import "server-only";

import { ContactSubmissionStoreError } from "@lemnaria/persistence";

import type { SentReferenceAnswer } from "@/done/result-to-show";

import { getContactSubmissionStore } from "./contact-submission-store-instance";
import {
  reportSentReferenceUnread,
  type SentReferenceCause,
} from "./sent-reference-log";

/** How long the contact page waits for the read before it draws the form: a late answer is `unknown`. Wide enough that
 *  a loaded runner does not show a customer who already sent a fresh form (ADR 0160 d5, owner's 2026-10-14 decision). */
export const CONTACT_PAGE_READ_DEADLINE_MS = 2000;

export interface SentReferenceReadOptions {
  /** Where the read gives up and answers `unknown`. Absent, the read waits as long as the store does. */
  readonly deadlineMs?: number;
}

/**
 * The reference of this design's latest notified request at this revision, or `none`. Any failed or late read is
 * `unknown`: only the reference string reaches the client, and the one line a failure writes holds a cause from a
 * closed list and nothing the failure said. Call it only after `loadOwnedDesign` has found the design for this browser.
 * A deadline stops the wait, not the statement.
 */
export async function readSentReference(
  request: { readonly designId: string; readonly revision: string },
  options: SentReferenceReadOptions = {},
): Promise<SentReferenceAnswer> {
  try {
    const lookup = getContactSubmissionStore().findSentReference(request);
    const answer =
      options.deadlineMs === undefined
        ? await lookup
        : await beforeDeadline(lookup, options.deadlineMs);
    return answer.kind === "sent"
      ? { kind: "sent", reference: answer.reference }
      : { kind: "none" };
  } catch (failure) {
    reportSentReferenceUnread(causeOf(failure));
    return { kind: "unknown" };
  }
}

class ReadDeadlineExceeded extends Error {}

/** The lookup's own outcome if it comes in time, else a rejection; the timer is cleared whichever side wins. */
async function beforeDeadline<Answer>(
  lookup: Promise<Answer>,
  deadlineMs: number,
): Promise<Answer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ReadDeadlineExceeded());
    }, deadlineMs);
  });
  try {
    return await Promise.race([lookup, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function causeOf(failure: unknown): SentReferenceCause {
  if (failure instanceof ReadDeadlineExceeded) return "deadline";
  if (failure instanceof ContactSubmissionStoreError) return "store-error";
  return "unexpected";
}
