import type {
  ContactChannel,
  ContactSubmissionRequest,
} from "@lemnaria/configurator-domain";

// The sent request's one place of memory: what the confirmation screen needs to say where the shop will reach the
// customer, handed from the contact page, which unmounts when the design form is sent, to the page that replaces it.
// One entry, in this module's own variable: replaced by the next sent request, cleared when a design contact form
// mounts, and gone on any reload, a variable being all it is. It holds the design and revision the request named, the
// answer's reference, the channel, and the ONE typed value the shop will use. Not the name, not the locality, not the
// consent. Reading it clears nothing, so a language switch or a second read shows the same entry. Nothing here reaches
// a URL, a cookie, browser storage, the configurator store or a log (ADR 0159, criterion 6; D17).

export interface SentRequest {
  readonly designId: string;
  readonly revision: string;
  readonly reference: string;
  readonly channel: ContactChannel;
  /** The phone for the phone and WhatsApp channels and the address for e-mail, trimmed as the request carried it. */
  readonly contactValue: string;
}

/** What a page asking for its design's request is told: the entry, or that there is none. Never `null`. */
export type RecalledRequest =
  | { readonly kind: "remembered"; readonly request: SentRequest }
  | { readonly kind: "none" };

/** The design and revision a page shows; only an entry for exactly these is handed out. */
export interface SentRequestKey {
  readonly designId: string;
  readonly revision: string;
}

const NOTHING_REMEMBERED: RecalledRequest = { kind: "none" };

let entry: SentRequest | undefined;

/** The entry a sent design request leaves, or none for a request with no design or one with no value to name. */
export function sentRequestFrom(
  request: ContactSubmissionRequest,
  reference: string,
): SentRequest | undefined {
  if (request.target.kind !== "design") return undefined;
  const { contact } = request;
  const contactValue =
    contact.channel === "email" ? contact.email : contact.phone;
  if (contactValue === undefined) return undefined;
  return {
    designId: request.target.design.id,
    revision: request.target.design.revision,
    reference,
    channel: contact.channel,
    contactValue,
  };
}

/** Keeps these five fields and no other, whatever object carried them. Stores nothing on the server, where this
 *  module's variable is shared by every request. */
export function rememberSentRequest(sent: SentRequest): void {
  if (typeof window === "undefined") return;
  entry = Object.freeze({
    designId: sent.designId,
    revision: sent.revision,
    reference: sent.reference,
    channel: sent.channel,
    contactValue: sent.contactValue,
  });
}

export function recallSentRequest(key: SentRequestKey): RecalledRequest {
  if (entry === undefined) return NOTHING_REMEMBERED;
  const isThePagesRequest =
    entry.designId === key.designId && entry.revision === key.revision;
  return isThePagesRequest
    ? { kind: "remembered", request: entry }
    : NOTHING_REMEMBERED;
}

export function forgetSentRequest(): void {
  entry = undefined;
}
