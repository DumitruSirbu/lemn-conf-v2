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
    "every contact field but the e-mail must be text the database can hold, and the locality may be empty",
  email:
    "the e-mail must be text the database can hold, and present exactly when the channel is e-mail",
  locale: "the locale must be text the database can hold",
  target: "the target must name a design or an intent, and exactly one of them",
  designId: "the design id must be text the database can hold, and not empty",
  revision:
    "the design revision must be a whole number from 1 to 9223372036854775807",
  snapshot: "a design is stored with its snapshot and a callback without one",
  snapshotShape:
    "the snapshot's document and its priced design must each be a JSON object of finite numbers and text the database can hold",
} as const;

type RefusedPart = keyof typeof REFUSED_PARTS;

const CLIENT_REQUEST_ID_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** The table's check on a reference, wider than what the generator makes, so a look can change without a migration. */
const REFERENCE_SHAPE = /^[0-9A-Z-]{6,32}$/;

/** Half of a surrogate pair: a high half with no low half after it, or a low half with no high half before it. Tested
 *  without the `u` flag so a half is seen as a code unit. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const NUL = "\u0000";

/** The widest value of the table's `bigint` revision column. */
const LARGEST_REVISION = 9_223_372_036_854_775_807n;

/** The two snapshot columns as the statement carries them: JSON text made from the value that was judged. */
export interface SnapshotJson {
  readonly document: string;
  readonly priced: string;
}

/** What a request that passed the check goes on to send. */
export interface JudgedSubmission {
  readonly snapshotJson: SnapshotJson | undefined;
}

/**
 * One check for every operation of both stores. It refuses, before a statement is sent and with no value in the
 * refusal, what each constraint of the table refuses but the reference's uniqueness, a value that is not a string,
 * text Postgres cannot hold, and a snapshot that is not a JSON object of finite numbers. What a server refuses for size,
 * depth or a limit of its own is left to it: the refusal is the caller's defect, and nothing of a person's details
 * should reach a server in a statement that is certain to fail.
 */
export function requireValidSubmission(
  submission: ContactSubmissionToRecord,
): void {
  judgeSubmission(submission);
}

/** {@link requireValidSubmission}, answering the JSON to send: a store sends that and never the text or the object it
 *  was handed, so what was judged is what is stored. */
export function judgeSubmission(
  submission: ContactSubmissionToRecord,
): JudgedSubmission {
  requireValidLookup(submission);
  requireValidContact(submission.contact);
  requireStorableText(submission.locale, "locale");
  return {
    snapshotJson: judgeTarget(submission.target, submission.snapshot),
  };
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
  const requiredTexts = [
    contact.name,
    contact.phone,
    contact.phoneNormalForm,
    contact.locality,
    contact.channel,
    contact.consentTextVersion,
  ];
  for (const text of requiredTexts) requireStorableText(text, "contact");
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

function judgeSnapshot(snapshot: SubmissionSnapshot | undefined): SnapshotJson {
  if (snapshot === undefined) throw refusalOf("snapshot");
  const document = judgedObjectText(() => parsedDocument(snapshot.document));
  const priced = judgedObjectText(() => encodedAndParsed(snapshot.priced));
  return { document, priced };
}

/** The text of an object that holds nothing the database cannot, made from the parsed value and not from what was
 *  handed in. */
function judgedObjectText(parse: () => unknown): string {
  let parsed: unknown;
  try {
    parsed = parse();
  } catch {
    throw refusalOf("snapshotShape");
  }
  if (!isJsonObject(parsed) || !holdsOnlyStorableJson(parsed)) {
    throw refusalOf("snapshotShape");
  }
  return JSON.stringify(parsed);
}

function parsedDocument(document: unknown): unknown {
  if (typeof document !== "string") throw new TypeError("not text");
  return JSON.parse(document);
}

/** The priced design as the driver would encode it, then read back: a `Date` becomes text, a `bigint` or a cycle throws,
 *  and so a value `JSON.stringify` cannot make into an object is not one. */
function encodedAndParsed(priced: unknown): unknown {
  const encoded: unknown = JSON.stringify(priced);
  if (typeof encoded !== "string") throw new TypeError("not encodable");
  return JSON.parse(encoded);
}

function isJsonObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every key and every text at any depth is storable and every number is finite. Walked with a list and not by
 *  recursion, so a deep document cannot end the walk in a stack overflow. */
function holdsOnlyStorableJson(root: unknown): boolean {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    if (!isStorableAndQueuesItsMembers(pending.pop(), pending)) return false;
  }
  return true;
}

function isStorableAndQueuesItsMembers(
  value: unknown,
  pending: unknown[],
): boolean {
  if (typeof value === "string") return !isUnstorableText(value);
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    for (const member of value as unknown[]) pending.push(member);
    return true;
  }
  return isJsonObject(value) ? queuesStorableEntriesOf(value, pending) : true;
}

function queuesStorableEntriesOf(object: object, pending: unknown[]): boolean {
  for (const [key, member] of Object.entries(object)) {
    if (isUnstorableText(key)) return false;
    pending.push(member);
  }
  return true;
}

/** What Postgres cannot hold in text: a NUL, and half of a surrogate pair. */
function isUnstorableText(text: string): boolean {
  return text.includes(NUL) || LONE_SURROGATE.test(text);
}

function requireStorableText(value: unknown, part: RefusedPart): void {
  if (typeof value !== "string" || isUnstorableText(value)) {
    throw refusalOf(part);
  }
}

function refusalOf(part: RefusedPart): Error {
  return new Error(
    `Refusing to use the contact submission store: ${REFUSED_PARTS[part]}.`,
  );
}
