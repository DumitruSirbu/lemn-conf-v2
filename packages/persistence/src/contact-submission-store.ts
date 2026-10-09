import { CONTACT_INTENTS } from "@lemnaria/configurator-domain";
import type {
  ContactFields,
  DesignReference,
  SubmissionSnapshot,
  SubmissionTarget,
} from "@lemnaria/configurator-domain";

import {
  ownRefusals,
  refusalOf,
  registeredAsOurs,
  requireObject,
} from "./contact-submission-refusal.js";
import type { RefusedPart } from "./contact-submission-refusal.js";
import { isDesignRevision } from "./design-revision.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { isUnstorableText, judgeSnapshot } from "./snapshot-judgement.js";
import type { SnapshotJson } from "./snapshot-judgement.js";

export type { SnapshotJson } from "./snapshot-judgement.js";

/** What a collision costs at most: three proposals, then the store error. Three collisions in forty bits is a broken
 *  generator, which should be seen and not looped on. */
export const MAX_REFERENCE_PROPOSALS = 3;

export type ContactSubmissionOperation =
  | "look up a request"
  | "record a request"
  | "mark a request notified";

/** A request's identity and what it said, as a keyed digest of its fields made by the caller under a secret this
 *  package never holds. */
export interface SubmissionLookupRequest {
  readonly clientRequestId: string;
  readonly payloadDigest: string;
}

/** The validated request as it is stored. The honeypot's answer and the elapsed time are not stored. */
export interface ContactSubmissionToRecord extends SubmissionLookupRequest {
  readonly contact: ContactFields;
  readonly locale: string;
  readonly target: SubmissionTarget;
  /** Present exactly when the target is a design. */
  readonly snapshot: SubmissionSnapshot | undefined;
}

/** `isNotified` is whether a notice is recorded as sent; the instant does not leave the store. */
export interface StoredSubmission {
  readonly kind: "stored";
  readonly reference: string;
  readonly isNotified: boolean;
}

/** `isNew` is true when the stored reference is the one this call proposed: the call that stored the row, and a
 *  statement repeated after a lost reply, which proposes the same reference again. It is false for a later call, unless
 *  a proposer repeats itself. */
export interface RecordedSubmission extends StoredSubmission {
  readonly isNew: boolean;
}

/** The id was stored with another digest. It holds no reference and nothing of whether a notice was sent. */
export interface SubmissionConflict {
  readonly kind: "conflict";
}

export interface SubmissionAbsent {
  readonly kind: "absent";
}

export type SubmissionLookup =
  | SubmissionAbsent
  | StoredSubmission
  | SubmissionConflict;

export type SubmissionRecording = RecordedSubmission | SubmissionConflict;

/**
 * Stores a contact request once, apart from designs, and answers nothing that is personal: no field of the contact, no
 * snapshot, no list and no count, and nothing deletes. A conflict is an outcome and not an exception.
 */
export interface ContactSubmissionStore {
  /** Sends no write. For an id that is stored it answers what `record` of the same id and digest would. */
  lookUp(request: SubmissionLookupRequest): Promise<SubmissionLookup>;
  /**
   * Stores the request unless its id is stored, and answers the stored reference either way. Whether to send a notice
   * is decided on `isNotified`, never on `isNew`. Rejects with `ContactSubmissionStoreError` when the database gives
   * no trustworthy answer.
   */
  record(submission: ContactSubmissionToRecord): Promise<SubmissionRecording>;
  /** Records that a notice was sent. A second mark keeps the first instant. An id that is not stored is the store
   *  error. */
  markNotified(clientRequestId: string): Promise<void>;
}

/** The database did not give a trustworthy answer: it refused the statement, did not answer, or answered with something
 *  that is not what the statement names. Its `cause`, when present, is a `ReducedCause`, never the driver's own error,
 *  and nothing of the request is in it. */
export class ContactSubmissionStoreError extends Error {
  readonly operation: ContactSubmissionOperation;

  constructor(operation: ContactSubmissionOperation, options?: ErrorOptions) {
    super(
      `The contact submission store could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "ContactSubmissionStoreError";
    this.operation = operation;
  }
}

const CLIENT_REQUEST_ID_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** The table's check on a reference, wider than what the generator makes, so a look can change without a migration. */
const REFERENCE_SHAPE = /^[0-9A-Z-]{6,32}$/;

/** The widest value of the table's `bigint` revision column. */
const LARGEST_REVISION = 9_223_372_036_854_775_807n;

/** What a request that passed the check goes on to send. */
export interface JudgedSubmission {
  readonly snapshotJson: SnapshotJson | undefined;
}

/**
 * One check for every operation of both stores. Before a statement is sent, and with no value in the refusal, it
 * refuses what the table would refuse but the reference's uniqueness, and a few things only this code refuses. For any
 * value handed in it throws only its own refusal: anything else thrown, such as a member whose read throws, is the
 * refusal of the request and keeps nothing of what was thrown. A price whose parts are shared is a recorded limit: its
 * encoder does not return. What a server refuses for size, a time limit or anything of its own is the store error. The
 * rules are in the wave's decision record.
 */
export function requireValidSubmission(
  submission: ContactSubmissionToRecord,
): void {
  judgeSubmission(submission);
}

/** {@link requireValidSubmission}, answering the JSON to send: the document is the text handed in and the priced design
 *  is its walked value encoded once, so what was judged is what is stored. */
export function judgeSubmission(
  submission: ContactSubmissionToRecord,
): JudgedSubmission {
  return refusingAnythingElseAsTheRequest(() => {
    requireValidLookup(submission);
    requireValidContact(submission.contact);
    requireStorableText(submission.locale, "locale");
    return {
      snapshotJson: judgeTarget(submission.target, submission.snapshot),
    };
  });
}

export function requireValidLookup(request: SubmissionLookupRequest): void {
  refusingAnythingElseAsTheRequest(() => {
    requireValidClientRequestId(request.clientRequestId);
    const digest = request.payloadDigest;
    try {
      requireSha256Digest(
        digest,
        "contact request digest",
        "use the contact submission store",
      );
    } catch (refusal) {
      throw registeredAsOurs(refusal);
    }
  });
}

/**
 * The one catch of each entry that takes an object. A refusal this check already made leaves as it is. Anything else
 * thrown (a getter, a proxy, a request that is not an object at all) becomes the refusal of the request, and nothing of
 * what was thrown is kept, not its message, its type or as a cause: it may hold a value.
 */
function refusingAnythingElseAsTheRequest<Result>(judge: () => Result): Result {
  try {
    return judge();
  } catch (thrown) {
    if (thrown instanceof Error && ownRefusals.has(thrown)) throw thrown;
    throw refusalOf("request");
  }
}

export function requireValidClientRequestId(clientRequestId: string): void {
  if (
    typeof clientRequestId !== "string" ||
    !CLIENT_REQUEST_ID_SHAPE.test(clientRequestId)
  ) {
    throw refusalOf("clientRequestId");
  }
}

export function requireValidReference(reference: string): void {
  if (typeof reference !== "string" || !REFERENCE_SHAPE.test(reference)) {
    throw refusalOf("reference");
  }
}

function requireValidContact(contact: ContactFields): void {
  requireObject(contact, "contact");
  requireStorableText(contact.name, "contactName");
  requireStorableText(contact.phone, "contactPhone");
  requireStorableText(contact.phoneNormalForm, "contactPhoneNormalForm");
  requireStorableText(contact.locality, "contactLocality");
  requireStorableText(contact.channel, "contactChannel");
  requireStorableText(contact.consentTextVersion, "contactConsentTextVersion");
  const isEmailChannel = contact.channel === "email";
  if (isEmailChannel !== (contact.email !== undefined)) {
    throw refusalOf("email");
  }
  if (contact.email !== undefined) requireStorableText(contact.email, "email");
}

function judgeTarget(
  target: SubmissionTarget,
  snapshot: SubmissionSnapshot | undefined,
): SnapshotJson | undefined {
  requireObject(target, "target");
  const fields: Readonly<Record<string, unknown>> = target;
  const holdsDesign = "design" in fields;
  if (holdsDesign === "intent" in fields) throw refusalOf("target");
  if (holdsDesign !== (target.kind === "design")) throw refusalOf("target");
  if (target.kind === "design") {
    requireValidDesignReference(target.design);
    return judgeSnapshot(snapshot);
  }
  requireAKnownIntent(target.intent);
  if (snapshot !== undefined) throw refusalOf("snapshot");
  return undefined;
}

function requireAKnownIntent(intent: string): void {
  if (!CONTACT_INTENTS.some((known) => known === intent)) {
    throw refusalOf("target");
  }
}

function requireValidDesignReference(design: DesignReference): void {
  requireObject(design, "designReference");
  requireStorableText(design.id, "designId");
  if (design.id === "") throw refusalOf("designId");
  if (!isDesignRevisionThatFitsTheColumn(design.revision)) {
    throw refusalOf("revision");
  }
}

function isDesignRevisionThatFitsTheColumn(revision: string): boolean {
  return (
    typeof revision === "string" &&
    isDesignRevision(revision) &&
    BigInt(revision) <= LARGEST_REVISION
  );
}

function requireStorableText(value: unknown, part: RefusedPart): void {
  if (typeof value !== "string" || isUnstorableText(value)) {
    throw refusalOf(part);
  }
}
