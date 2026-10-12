import "server-only";

import type { SentReferenceAnswer } from "@/done/result-to-show";

import { getContactSubmissionStore } from "./contact-submission-store-instance";

/**
 * What the contact store knows of this design at this revision, for the confirmation page: the reference of its latest
 * notified request, or that there is none. A read that fails in any way is `unknown`, which the page draws as its own
 * line: no error's text, no kind of it and no log line leaves here, since the page has nothing to do with them. Only
 * the reference string or a kind is returned, so nothing else the store answered can reach the client. Call it only
 * after `loadOwnedDesign` has found the design for this browser.
 */
export async function readSentReference(request: {
  readonly designId: string;
  readonly revision: string;
}): Promise<SentReferenceAnswer> {
  try {
    const answer = await getContactSubmissionStore().findSentReference(request);
    return answer.kind === "sent"
      ? { kind: "sent", reference: answer.reference }
      : { kind: "none" };
  } catch {
    return { kind: "unknown" };
  }
}
