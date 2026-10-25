import {
  isClientRequestId,
  isCountedFormOfAddress,
} from "@lemnaria/configurator-domain";

import {
  isTextOfBlockKind,
  type NetworkBlock,
  type NetworkBlockKind,
} from "@/lib/server/rate-limit/client-network";

/** The kind of a write credential's subject, apart from every network block's: a hash and a block can never share a
 *  key, whatever their text. */
export const WRITE_CREDENTIAL_KIND = "write-credential";

/** The kinds of the contact form's three other subjects, each apart from every other's: a hash, an address and a
 *  request id can never share a key, whatever their text. */
export const VISITOR_KIND = "visitor";
export const ADDRESS_KIND = "address";
export const STORED_REQUEST_KIND = "contact-request";

/** The kind of an account's subject. A design's id has the same shape as an account's, so the text alone cannot tell
 *  them apart; this kind, digested with the text, does: equal text under another kind is another key. */
export const ACCOUNT_KIND = "account";

export type BucketSubjectKind =
  | NetworkBlockKind
  | typeof WRITE_CREDENTIAL_KIND
  | typeof VISITOR_KIND
  | typeof ADDRESS_KIND
  | typeof STORED_REQUEST_KIND
  | typeof ACCOUNT_KIND;

declare const MADE_BY_A_CONSTRUCTOR: unique symbol;

/**
 * What a bucket counts, by a kind and a text. Only the constructors below make one, and each accepts text from one
 * source alone: a network address's parsed bits, a write credential's hash, a visitor's stored hash, an e-mail address
 * in its counted form, a stored request's id or an account's id. A visitor's raw value, a share's token and any other
 * text a caller chooses is refused, so no caller can write a row for a subject it invents (a design's id is not
 * refused as an account's, being of its shape: the kind keeps the two keys apart). The constructors remember
 * what they made, so a cast or a copy is no subject: the type alone binds the compiler.
 */
export interface BucketSubject {
  readonly kind: BucketSubjectKind;
  readonly subject: string;
  readonly [MADE_BY_A_CONSTRUCTOR]: true;
}

/** The text offered was not the source's: it names the kind and holds none of the text. */
export class BucketSubjectError extends Error {
  readonly kind: BucketSubjectKind;

  constructor(kind: BucketSubjectKind) {
    super(`The text is not a ${kind} subject`);
    this.name = "BucketSubjectError";
    this.kind = kind;
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The shape of an account's id: what `accounts_id_shape` (migration `0012`) checks and `generateAccountId` makes, 21
 *  characters of `A-Za-z0-9_-`. A second statement of it, tied to the first by this comment. */
const ACCOUNT_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

/** The block the address parser made: three decimal octets, four groups of four hexadecimal digits, or nothing. */
export function subjectOfNetworkBlock(block: NetworkBlock): BucketSubject {
  if (!isTextOfBlockKind(block)) throw new BucketSubjectError(block.kind);
  return subjectOf(block.kind, block.subject);
}

/** The hash of the write credential a request carries, never the credential. */
export function subjectOfWriteCredentialHash(hash: string): BucketSubject {
  if (typeof hash !== "string" || !SHA256_HEX.test(hash)) {
    throw new BucketSubjectError(WRITE_CREDENTIAL_KIND);
  }
  return subjectOf(WRITE_CREDENTIAL_KIND, hash);
}

/** The hash of the visitor's value the browser's cookie carries, never the value: sixty-four hexadecimal characters
 *  and nothing else. A request with no such cookie has no such subject, and no step asks for one. */
export function subjectOfVisitorHash(hash: string): BucketSubject {
  if (typeof hash !== "string" || !SHA256_HEX.test(hash)) {
    throw new BucketSubjectError(VISITOR_KIND);
  }
  return subjectOf(VISITOR_KIND, hash);
}

/** An address as a limit counts it: lower case with nothing stripped, which the domain made and says it recognises. */
export function subjectOfAddress(countedForm: string): BucketSubject {
  if (typeof countedForm !== "string" || !isCountedFormOfAddress(countedForm)) {
    throw new BucketSubjectError(ADDRESS_KIND);
  }
  return subjectOf(ADDRESS_KIND, countedForm);
}

/** The id of a request that is stored, which a lookup has just shown to exist: the shape a request's id has. */
export function subjectOfStoredRequest(clientRequestId: string): BucketSubject {
  if (
    typeof clientRequestId !== "string" ||
    !isClientRequestId(clientRequestId)
  ) {
    throw new BucketSubjectError(STORED_REQUEST_KIND);
  }
  return subjectOf(STORED_REQUEST_KIND, clientRequestId);
}

/** The id of an account a session has just shown to exist: the shape an account's id has, and no other text. */
export function subjectOfAccountId(accountId: string): BucketSubject {
  if (typeof accountId !== "string" || !ACCOUNT_ID_SHAPE.test(accountId)) {
    throw new BucketSubjectError(ACCOUNT_KIND);
  }
  return subjectOf(ACCOUNT_KIND, accountId);
}

/** Whether a constructor of this module made `candidate`, by identity: a look-alike object or a copy is not. */
export function isMadeSubject(candidate: unknown): candidate is BucketSubject {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    MADE_SUBJECTS.has(candidate)
  );
}

const MADE_SUBJECTS = new WeakSet();

function subjectOf(kind: BucketSubjectKind, subject: string): BucketSubject {
  const made = Object.freeze({ kind, subject }) as BucketSubject;
  MADE_SUBJECTS.add(made);
  return made;
}
