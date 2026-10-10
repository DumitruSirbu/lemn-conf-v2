import type { ContactFields } from "./contact-fields.js";
import type { ContactSubmissionRequest } from "./contact-submission.js";

// What a request's keyed digest covers. The digest itself is made where the secret is; this says which fields go into
// it and in what order, so that "one id, another body" is a conflict however the body differs (ADR 0150, ADR 0153).
// Every stored and mailed field of the validated request is covered, and for a design the price book's version the
// server would price it under, which a retry across a change of book must not survive. Only the time the form took and
// the honeypot's answer are left out: neither is stored, and neither is the sender's meaning.

/** The covered fields in the order they are written. A field is added here, never inferred. */
export const PAYLOAD_DIGEST_FIELDS = [
  "clientRequestId",
  "locale",
  "targetKind",
  "designId",
  "designRevision",
  "intent",
  "name",
  "phone",
  "phoneNormalForm",
  "locality",
  "channel",
  "email",
  "consentTextVersion",
  "bookVersion",
] as const;

export type PayloadDigestField = (typeof PAYLOAD_DIGEST_FIELDS)[number];

/** Every covered field as text. A field that does not apply to this request is the empty text, which no field that
 *  does apply can be: a design id, a revision, an intent and the book's version are never empty. */
export type PayloadDigestFields = Readonly<Record<PayloadDigestField, string>>;

/** What becomes of one field of the request or of its parts: written under these names, or left out for a reason. */
export type DigestTreatment =
  | { readonly covers: readonly PayloadDigestField[] }
  | { readonly leavesOut: string };

type TreatmentOf<Part> = { readonly [Key in keyof Part]-?: DigestTreatment };

/** The two ways a target can be, each with every key it holds. A new kind of target is a compile error here. */
export interface TargetTreatment {
  readonly design: TreatmentOf<{ kind: unknown; design: unknown }>;
  readonly intent: TreatmentOf<{ kind: unknown; intent: unknown }>;
}

/**
 * The treatment of every field of the validated request. A field the request's type gains is a key this record lacks,
 * which does not compile, and a field its validator starts to produce is one the coverage test finds missing here.
 */
export const REQUEST_TREATMENT: TreatmentOf<
  Omit<ContactSubmissionRequest, "contact" | "target">
> = {
  clientRequestId: { covers: ["clientRequestId"] },
  locale: { covers: ["locale"] },
  isHoneypotFilled: {
    leavesOut:
      "a yes or no from a field no customer sees; it is refused, not stored",
  },
  elapsedMs: {
    leavesOut:
      "how long the form was open; it is refused when short and never stored",
  },
};

export const CONTACT_TREATMENT: TreatmentOf<ContactFields> = {
  name: { covers: ["name"] },
  phone: { covers: ["phone"] },
  phoneNormalForm: { covers: ["phoneNormalForm"] },
  locality: { covers: ["locality"] },
  channel: { covers: ["channel"] },
  email: { covers: ["email"] },
  consentTextVersion: { covers: ["consentTextVersion"] },
};

export const TARGET_TREATMENT: TargetTreatment = {
  design: {
    kind: { covers: ["targetKind"] },
    design: { covers: ["designId", "designRevision"] },
  },
  intent: {
    kind: { covers: ["targetKind"] },
    intent: { covers: ["intent"] },
  },
};

/** The one covered field that is not the request's: the price book's version, handed in beside it. */
export const BOOK_TREATMENT: DigestTreatment = { covers: ["bookVersion"] };

/** The caller handed a book's version where a callback has none, or none where a design needs it. */
export class PayloadDigestBookError extends Error {
  constructor(hasDesign: boolean) {
    super(
      hasDesign
        ? "A request for a design is digested with the price book's version it is priced under"
        : "A callback has no price, so its digest holds no price book's version",
    );
    this.name = "PayloadDigestBookError";
  }
}

/**
 * The fields of a request's digest, for the caller to key. `bookVersion` is the version of the price book the server
 * would price the design under, handed in beside the request: present exactly when the request names a design.
 */
export function payloadDigestFields(
  request: ContactSubmissionRequest,
  bookVersion: string | undefined,
): PayloadDigestFields {
  const { contact, target } = request;
  const hasDesign = target.kind === "design";
  if (hasDesign !== (bookVersion !== undefined)) {
    throw new PayloadDigestBookError(hasDesign);
  }
  return {
    clientRequestId: request.clientRequestId,
    locale: request.locale,
    targetKind: target.kind,
    designId: target.kind === "design" ? target.design.id : "",
    designRevision: target.kind === "design" ? target.design.revision : "",
    intent: target.kind === "intent" ? target.intent : "",
    name: contact.name,
    phone: contact.phone,
    phoneNormalForm: contact.phoneNormalForm,
    locality: contact.locality,
    channel: contact.channel,
    email: contact.email ?? "",
    consentTextVersion: contact.consentTextVersion,
    bookVersion: bookVersion ?? "",
  };
}
