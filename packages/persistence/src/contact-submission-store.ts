import { CONTACT_INTENTS } from "@lemnaria/configurator-domain";
import type {
  ContactFields,
  DesignReference,
  SubmissionSnapshot,
  SubmissionTarget,
} from "@lemnaria/configurator-domain";

import { isDesignRevision } from "./design-revision.js";
import { requireSha256Digest } from "./sha256-digest.js";

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

/** `isNew` is true for the call that stored the row and false for every call after it. */
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
  /** Reads and writes nothing. For an id that is stored it answers what `record` of the same id and digest would. */
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

/** The parts of a request the table constrains, each with the one sentence that says what it must be. A refusal names
 *  a part and never a value. */
const REFUSED_PARTS = {
  clientRequestId:
    "the client request id must be 16 to 64 letters, digits, underscores or hyphens",
  payloadDigest:
    "the payload digest must be a 64-character lowercase hex SHA-256 digest",
  reference: "the reference must be 6 to 32 capital letters, digits or hyphens",
  contact:
    "every contact field but the e-mail must be text, and the locality may be empty",
  email:
    "the e-mail must be text, and present exactly when the channel is e-mail",
  locale: "the locale must be text",
  target: "the target must name a design or an intent, and exactly one of them",
  designId: "the design id must be text and not empty",
  revision:
    "the design revision must be a whole number from 1 to 9223372036854775807",
  snapshot: "a design is stored with its snapshot and a callback without one",
  snapshotShape:
    "the snapshot's document and its priced design must each be a JSON object",
} as const;

type RefusedPart = keyof typeof REFUSED_PARTS;

const CLIENT_REQUEST_ID_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** The table's check on a reference, wider than what the generator makes, so a look can change without a migration. */
const REFERENCE_SHAPE = /^[0-9A-Z-]{6,32}$/;

/** The widest value of the table's `bigint` revision column. */
const LARGEST_REVISION = 9_223_372_036_854_775_807n;

/** One check for every operation of both stores. It refuses what the table would refuse, except the reference's
 *  uniqueness, before a statement is sent: the refusal is the caller's defect, and nothing of a person's details
 *  should reach a server in a statement that is certain to fail. */
export function requireValidSubmission(
  submission: ContactSubmissionToRecord,
): void {
  requireValidLookup(submission);
  requireValidContact(submission.contact);
  requireText(submission.locale, "locale");
  requireValidTarget(submission.target, submission.snapshot);
}

export function requireValidLookup(request: SubmissionLookupRequest): void {
  requireValidClientRequestId(request.clientRequestId);
  requireSha256Digest(
    request.payloadDigest,
    "contact request digest",
    "use the contact submission store",
  );
}

export function requireValidClientRequestId(clientRequestId: string): void {
  if (!CLIENT_REQUEST_ID_SHAPE.test(clientRequestId)) {
    throw refusalOf("clientRequestId");
  }
}

export function requireValidReference(reference: string): void {
  if (!REFERENCE_SHAPE.test(reference)) throw refusalOf("reference");
}

function requireValidContact(contact: ContactFields): void {
  const requiredTexts = [
    contact.name,
    contact.phone,
    contact.phoneNormalForm,
    contact.locality,
    contact.channel,
    contact.consentTextVersion,
  ];
  for (const text of requiredTexts) requireText(text, "contact");
  const isEmailChannel = contact.channel === "email";
  if (isEmailChannel !== (contact.email !== undefined)) {
    throw refusalOf("email");
  }
  if (contact.email !== undefined) requireText(contact.email, "email");
}

function requireValidTarget(
  target: SubmissionTarget,
  snapshot: SubmissionSnapshot | undefined,
): void {
  const fields: Readonly<Record<string, unknown>> = target;
  const holdsDesign = "design" in fields;
  if (holdsDesign === "intent" in fields) throw refusalOf("target");
  if (holdsDesign !== (target.kind === "design")) throw refusalOf("target");
  if (target.kind === "design") {
    requireValidDesignReference(target.design);
    requireValidSnapshot(snapshot);
  } else {
    requireAKnownIntent(target.intent);
    if (snapshot !== undefined) throw refusalOf("snapshot");
  }
}

function requireAKnownIntent(intent: string): void {
  if (!CONTACT_INTENTS.some((known) => known === intent)) {
    throw refusalOf("target");
  }
}

function requireValidDesignReference(design: DesignReference): void {
  if (typeof design.id !== "string" || design.id === "") {
    throw refusalOf("designId");
  }
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

function requireValidSnapshot(snapshot: SubmissionSnapshot | undefined): void {
  if (snapshot === undefined) throw refusalOf("snapshot");
  if (!isJsonObjectText(snapshot.document) || !isJsonObject(snapshot.priced)) {
    throw refusalOf("snapshotShape");
  }
}

/** The text is parsed and its content dropped: `jsonb` keeps a document's content and not its bytes. */
function isJsonObjectText(text: string): boolean {
  try {
    return typeof text === "string" && isJsonObject(JSON.parse(text));
  } catch {
    return false;
  }
}

function isJsonObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, part: RefusedPart): void {
  if (typeof value !== "string") throw refusalOf(part);
}

function refusalOf(part: RefusedPart): Error {
  return new Error(
    `Refusing to use the contact submission store: ${REFUSED_PARTS[part]}.`,
  );
}
