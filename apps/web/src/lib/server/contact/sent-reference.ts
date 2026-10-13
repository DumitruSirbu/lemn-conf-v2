import "server-only";

import type { SentReferenceAnswer } from "@/done/result-to-show";

import { getContactSubmissionStore } from "./contact-submission-store-instance";

/**
 * The reference of this design's latest notified request at this revision, or `none`. Any failed read is `unknown`:
 * no error text, kind or log line leaves, and only the reference string reaches the client. Call it only after
 * `loadOwnedDesign` has found the design for this browser.
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
