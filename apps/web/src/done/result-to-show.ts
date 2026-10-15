import type { SubmissionChannelLine } from "@/i18n/content";

import type { SentRequest, SentRequestKey } from "./sent-request-memory";

/** What the server knows of this design at this revision: its latest notified request's reference, no such request, or
 *  that the read failed. */
export type SentReferenceAnswer =
  | { readonly kind: "sent"; readonly reference: string }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

export interface ResultToShowInput {
  /** The design and revision the page is for. */
  readonly page: SentRequestKey;
  /** What the sent request left in memory, whatever design and revision it names. */
  readonly handedOver: SentRequest | undefined;
  readonly server: SentReferenceAnswer;
}

/** `channelLine` is set only for a request this tab sent, and then names the one typed value; after a load it is
 *  `undefined` and the page names no value. */
export interface SentResult {
  readonly kind: "sent";
  readonly reference: string;
  readonly channelLine: SubmissionChannelLine | undefined;
}

/** What the confirmation says. */
export type ResultToShow =
  | SentResult
  | { readonly kind: "no-request" }
  | { readonly kind: "not-shown" };

/**
 * A request is claimed sent only from a hand-over for exactly this design and revision, or from the server's own
 * answer; the typed value only from the hand-over. A hand-over for another design or revision is ignored whatever the
 * page was given, and a read that failed claims nothing either way.
 */
export function resultToShow({
  page,
  handedOver,
  server,
}: ResultToShowInput): ResultToShow {
  if (handedOver !== undefined && isForPage(handedOver, page)) {
    return {
      kind: "sent",
      reference: handedOver.reference,
      channelLine: {
        channel: handedOver.channel,
        contact: handedOver.contactValue,
      },
    };
  }
  if (server.kind === "sent") {
    return {
      kind: "sent",
      reference: server.reference,
      channelLine: undefined,
    };
  }
  return server.kind === "none"
    ? { kind: "no-request" }
    : { kind: "not-shown" };
}

function isForPage(request: SentRequest, page: SentRequestKey): boolean {
  return (
    request.designId === page.designId && request.revision === page.revision
  );
}
