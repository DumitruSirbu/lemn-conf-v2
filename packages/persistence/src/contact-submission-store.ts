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

/** The parts of a request the table constrains, each with the one sentence that says what it must be. A refusal names
 *  a part and never a value. */
const REFUSED_PARTS = {
  clientRequestId:
    "the client request id must be 16 to 64 letters, digits, underscores or hyphens",
  payloadDigest:
    "the payload digest must be a 64-character lowercase hex SHA-256 digest",
  reference: "the reference must be 6 to 32 capital letters, digits or hyphens",
  contact: "the contact must be an object",
  contactName: "the contact's name must be text the database can hold",
  contactPhone: "the contact's phone must be text the database can hold",
  contactPhoneNormalForm:
    "the contact's phone normal form must be text the database can hold",
  contactLocality:
    "the contact's locality must be text the database can hold, and may be empty",
  contactChannel: "the contact's channel must be text the database can hold",
  contactConsentTextVersion:
    "the contact's consent text version must be text the database can hold",
  email:
    "the e-mail must be text the database can hold, and present exactly when the channel is e-mail",
  locale: "the locale must be text the database can hold",
  target: "the target must name a design or an intent, and exactly one of them",
  designReference:
    "the target's design must be an object holding a design id and a revision",
  designId: "the design id must be text the database can hold, and not empty",
  revision:
    "the design revision must be a whole number from 1 to 9223372036854775807",
  snapshot:
    "a design is stored with its snapshot, an object, and a callback without one",
  snapshotDocument:
    "the snapshot's document must be a JSON object of finite numbers and text the database can hold, written exactly as JSON.stringify writes it, with nothing in it written twice",
  snapshotPriced:
    "the snapshot's priced design must be a JSON object of plain objects, lists, text the database can hold, finite numbers, booleans and null",
  snapshotDepth:
    "the snapshot's document and its priced design must each be no deeper than 64 levels of lists and objects",
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

/** How many levels of lists and objects a snapshot may nest, the root object counting as the first. A design's and a
 *  price's depths are fixed by their types and are a handful; the bound is far from all of them and does not move with a
 *  runtime's stack, which is where `JSON.parse` and `JSON.stringify` give out. */
const MAX_SNAPSHOT_DEPTH = 64;

/** The widest value of the table's `bigint` revision column. */
const LARGEST_REVISION = 9_223_372_036_854_775_807n;

/** The two snapshot columns as the statement carries them: the document is the text handed in, and the priced design is
 *  the text its walked value encodes to. */
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
 * refusal:
 * - what each constraint of the table refuses, but the reference's uniqueness;
 * - a value that is not a string, text Postgres cannot hold, and a part that is not an object (the contact, the
 *   target, a design's reference, the snapshot);
 * - a snapshot nested deeper than 64 levels, a document that is not exactly what `JSON.stringify` makes of its own
 *   parsed value, and a priced design that is not plain objects, lists, text, finite numbers, booleans and null;
 * - rule 5, code's own and no constraint's, each of which refuses more than the table does: a target whose kind
 *   disagrees with what it holds, an intent outside the domain's list, an empty design id, and an e-mail present when
 *   the channel is not e-mail or absent when it is.
 *
 * For a request that is an object, whatever its members, it throws only its own refusal and nothing it throws holds a
 * value. It returns for every document and for every price that is a tree. A price whose parts are shared (each level
 * holding the next twice) is walked once for each path and its encoder does not return: a recorded limit, which holds
 * for a caller that hands over `snapshotSubmission`'s result untouched. What a server refuses for size, a time limit or
 * anything of its own is left to it, and is the store error.
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

function judgeSnapshot(snapshot: SubmissionSnapshot | undefined): SnapshotJson {
  if (snapshot === undefined) throw refusalOf("snapshot");
  requireObject(snapshot, "snapshot");
  return {
    document: judgedDocument(snapshot.document),
    priced: judgedPriced(snapshot.priced),
  };
}

/** The document's own text, refused unless it is exactly what `JSON.stringify` makes of its parsed value, so that the
 *  text handed in, the text judged and the text sent are one text. A number a double cannot hold, a key written twice,
 *  a needless escape and a space are each refused and never rewritten. Depth is judged on the text, before anything
 *  parses or encodes it. */
function judgedDocument(document: unknown): string {
  if (typeof document !== "string") throw refusalOf("snapshotDocument");
  if (isNestedDeeperThanTheBound(document)) throw refusalOf("snapshotDepth");
  const parsed = parsedObjectOf(document);
  requireStorableJson(parsed, "snapshotDocument");
  if (JSON.stringify(parsed) !== document) throw refusalOf("snapshotDocument");
  return document;
}

/** The priced design is judged as a value, before anything encodes it, and then encoded once. */
function judgedPriced(priced: unknown): string {
  requireStorableJson(priced, "snapshotPriced");
  try {
    const encoded: unknown = JSON.stringify(priced);
    if (typeof encoded === "string") return encoded;
  } catch {
    // Refused below, as any other price the encoder cannot make into text.
  }
  throw refusalOf("snapshotPriced");
}

function parsedObjectOf(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw refusalOf("snapshotDocument");
  }
  if (!isJsonObject(parsed)) throw refusalOf("snapshotDocument");
  return parsed;
}

function isJsonObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Counts the lists and objects the text opens, outside its strings, one pass and no recursion. A text that is not
 *  JSON may count anything; `JSON.parse` refuses it afterwards. */
function isNestedDeeperThanTheBound(text: string): boolean {
  let depth = 0;
  let isInsideAString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (isInsideAString) {
      if (character === "\\") index += 1;
      else if (character === '"') isInsideAString = false;
    } else if (character === '"') isInsideAString = true;
    else if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") depth -= 1;
    if (depth > MAX_SNAPSHOT_DEPTH) return true;
  }
  return false;
}

type Verdict = "storable" | "unstorable" | "too deep";

interface PendingContainer {
  readonly container: object;
  readonly depth: number;
}

function requireStorableJson(
  root: unknown,
  part: "snapshotDocument" | "snapshotPriced",
): void {
  const verdict = verdictOnJson(root);
  if (verdict === "too deep") throw refusalOf("snapshotDepth");
  if (verdict === "unstorable") throw refusalOf(part);
}

/**
 * Whether a value is a plain object holding only plain objects and lists, text the database can hold, finite numbers,
 * booleans and null, no deeper than the bound. An object's member that is `undefined` is left out, as an encoder leaves
 * it; a list's is refused, which an encoder would write as `null`. Walked with a list of containers and not by
 * recursion, and a container met again at no greater depth is not walked again, so a cycle ends at the bound.
 */
function verdictOnJson(root: unknown): Verdict {
  try {
    return walkJson(root);
  } catch {
    // A getter, a proxy or a revoked object may throw anything, and what it throws may hold a value: the walk keeps
    // none of it, and a value that cannot be read is a value that cannot be stored.
    return "unstorable";
  }
}

function walkJson(root: unknown): Verdict {
  if (!isPlainObject(root)) return "unstorable";
  const pending: PendingContainer[] = [{ container: root, depth: 1 }];
  const deepestWalked = new Map<object, number>();
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.depth > MAX_SNAPSHOT_DEPTH) return "too deep";
    if ((deepestWalked.get(next.container) ?? 0) >= next.depth) continue;
    deepestWalked.set(next.container, next.depth);
    const verdict = walkMembers(next, pending);
    if (verdict !== "storable") return verdict;
  }
  return "storable";
}

function walkMembers(
  { container, depth }: PendingContainer,
  pending: PendingContainer[],
): Verdict {
  if (Array.isArray(container)) {
    for (const member of container as unknown[]) {
      const verdict = judgedMember(member, depth + 1, pending);
      if (verdict !== "storable") return verdict;
    }
    return "storable";
  }
  for (const [key, member] of Object.entries(container)) {
    if (isUnstorableText(key)) return "unstorable";
    if (member === undefined) continue;
    const verdict = judgedMember(member, depth + 1, pending);
    if (verdict !== "storable") return verdict;
  }
  return "storable";
}

/** A leaf is judged here; a container is queued with its depth. */
function judgedMember(
  member: unknown,
  depth: number,
  pending: PendingContainer[],
): Verdict {
  if (typeof member === "string") {
    return isUnstorableText(member) ? "unstorable" : "storable";
  }
  if (typeof member === "number") {
    return Number.isFinite(member) ? "storable" : "unstorable";
  }
  if (typeof member === "boolean" || member === null) return "storable";
  if (!Array.isArray(member) && !isPlainObject(member)) return "unstorable";
  pending.push({ container: member, depth });
  return "storable";
}

function isPlainObject(value: unknown): value is object {
  if (!isJsonObject(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** What Postgres cannot hold in text: a NUL, and half of a surrogate pair. */
function isUnstorableText(text: string): boolean {
  return text.includes(NUL) || LONE_SURROGATE.test(text);
}

function requireObject(value: unknown, part: RefusedPart): void {
  if (typeof value !== "object" || value === null) throw refusalOf(part);
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
