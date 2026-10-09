import type {
  NetworkBlock,
  NetworkBlockKind,
} from "@/lib/server/rate-limit/client-network";

/** The kind of a write credential's subject, apart from every network block's: a hash and a block can never share a
 *  key, whatever their text. */
export const WRITE_CREDENTIAL_KIND = "write-credential";

export type BucketSubjectKind = NetworkBlockKind | typeof WRITE_CREDENTIAL_KIND;

declare const MADE_BY_A_CONSTRUCTOR: unique symbol;

/**
 * What a bucket counts, by a kind and a text. Only the two constructors below make one, and each accepts text from one
 * source alone: an address's parsed bits, or a write credential's hash. A design's id, a visitor's value, a share's
 * token and any other text a caller chooses is refused, so no caller can write a row for a subject it invents. The
 * constructors remember what they made, so a cast or a copy is no subject: the type alone binds the compiler.
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

const DECIMAL_OCTET = /^(?:0|[1-9][0-9]{0,2})$/;
const HIGHEST_OCTET = 255;
const IPV4_BLOCK_OCTETS = 3;
const IPV6_BLOCK_SUBJECT = /^[0-9a-f]{4}(?::[0-9a-f]{4}){3}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

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

const TEXT_RULE_OF_BLOCK_KIND: Readonly<
  Record<NetworkBlockKind, (subject: string) => boolean>
> = {
  "ipv4-block": isIpv4BlockText,
  "ipv6-block": (subject) => IPV6_BLOCK_SUBJECT.test(subject),
  shared: (subject) => subject === "",
};

function isTextOfBlockKind({ kind, subject }: NetworkBlock): boolean {
  return (
    typeof subject === "string" &&
    Object.hasOwn(TEXT_RULE_OF_BLOCK_KIND, kind) &&
    TEXT_RULE_OF_BLOCK_KIND[kind](subject)
  );
}

function isIpv4BlockText(subject: string): boolean {
  const octets = subject.split(".");
  return (
    octets.length === IPV4_BLOCK_OCTETS &&
    octets.every(
      (octet) => DECIMAL_OCTET.test(octet) && Number(octet) <= HIGHEST_OCTET,
    )
  );
}
