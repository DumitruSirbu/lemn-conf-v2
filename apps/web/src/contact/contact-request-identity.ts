import {
  isClientRequestId,
  PAYLOAD_DIGEST_FIELDS,
  payloadDigestFields,
  type ContactSubmissionRequest,
  type PayloadDigestField,
} from "@lemnaria/configurator-domain";

import type { ContactOutcome } from "./contact-answer";
import {
  prepareSubmission,
  type ContactSubmissionBody,
  type SubmissionInput,
} from "./contact-form-model";

// Which `clientRequestId` a send carries. The server stores a request once under its id and refuses the id with
// another body, so a retry must keep the id and a changed request must not. "Changed" is what the domain's digest
// covers, asked of `payloadDigestFields`, so a field the domain adds to its coverage is compared with no change here.

/** The one covered field that is the id itself, which is what is being decided. */
const REQUEST_ID_FIELD = "clientRequestId" satisfies PayloadDigestField;

/** Every covered field but the id, as the digest writes it, in the digest's order. */
export type CoveredProjection = readonly (readonly [
  PayloadDigestField,
  string,
])[];

export type RequestIdGenerator = () => string;

export const generateRandomRequestId: RequestIdGenerator = () =>
  crypto.randomUUID();

/** The last send and whether its id is still one a send may carry. */
export type SendHistory =
  | { readonly kind: "no-send-yet" }
  | {
      readonly kind: "sent-before";
      readonly clientRequestId: string;
      readonly projection: CoveredProjection;
      readonly isIdSpent: boolean;
    };

export const NO_SEND_YET: SendHistory = { kind: "no-send-yet" };

/** `bookVersion` is the price book's version the browser prices under, and is absent exactly for a request with no
 *  design; the digest function refuses the other pairings. */
export function coveredProjectionOf(
  request: ContactSubmissionRequest,
  bookVersion: string | undefined,
): CoveredProjection {
  const digestFields = payloadDigestFields(request, bookVersion);
  return PAYLOAD_DIGEST_FIELDS.filter(
    (field) => field !== REQUEST_ID_FIELD,
  ).map((field) => [field, digestFields[field]] as const);
}

export function isSameProjection(
  first: CoveredProjection,
  second: CoveredProjection,
): boolean {
  return (
    first.length === second.length &&
    first.every(
      ([field, value], index) =>
        second[index]?.[0] === field && second[index][1] === value,
    )
  );
}

export interface SendPlan {
  readonly history: SendHistory;
  readonly submission: Omit<SubmissionInput, "clientRequestId">;
  readonly bookVersion: string | undefined;
  readonly generateId: RequestIdGenerator;
}

export type PreparedSend =
  | {
      readonly ok: true;
      readonly body: ContactSubmissionBody;
      readonly request: ContactSubmissionRequest;
      readonly projection: CoveredProjection;
    }
  | Extract<ReturnType<typeof prepareSubmission>, { readonly ok: false }>;

/**
 * The send's body, judged by the domain, with the last send's id when its id is unspent and the covered projection is
 * the same, and a new id otherwise. The generator is asked once when an id is needed and never when it is kept.
 */
export function prepareSend(plan: SendPlan): PreparedSend {
  const reusable = unspentSendOf(plan.history);
  const draftId = reusable?.clientRequestId ?? mintRequestId(plan.generateId);
  const draft = prepareSubmission({
    ...plan.submission,
    clientRequestId: draftId,
  });
  if (!draft.ok) return draft;
  const projection = coveredProjectionOf(draft.request, plan.bookVersion);
  const keepsId =
    reusable === undefined || isSameProjection(reusable.projection, projection);
  if (keepsId) return { ...draft, projection };
  const renewed = prepareSubmission({
    ...plan.submission,
    clientRequestId: mintRequestId(plan.generateId),
  });
  return renewed.ok ? { ...renewed, projection } : renewed;
}

export function historyAfterSend(
  prepared: Extract<PreparedSend, { readonly ok: true }>,
): SendHistory {
  return {
    kind: "sent-before",
    clientRequestId: prepared.body.clientRequestId,
    projection: prepared.projection,
    isIdSpent: false,
  };
}

/** A conflict says the server holds this id with another body, so the id is spent; no other answer spends it. */
export function historyAfterOutcome(
  history: SendHistory,
  outcome: ContactOutcome,
): SendHistory {
  return history.kind === "sent-before" && outcome.kind === "conflict"
    ? { ...history, isIdSpent: true }
    : history;
}

function unspentSendOf(
  history: SendHistory,
): Extract<SendHistory, { readonly kind: "sent-before" }> | undefined {
  return history.kind === "sent-before" && !history.isIdSpent
    ? history
    : undefined;
}

function mintRequestId(generateId: RequestIdGenerator): string {
  const id = generateId();
  if (!isClientRequestId(id)) {
    throw new RangeError(
      "The id generator made text that is not a client request id",
    );
  }
  return id;
}
