import "server-only";

import * as nodeCrypto from "node:crypto";
import { randomBytes, timingSafeEqual } from "node:crypto";

// Passwords are hashed with argon2id from `node:crypto` (Node 24.7 and later), stored as a PHC string so that the
// parameters travel with each hash and can be raised without a migration (ADR 0172 decision 2). A hash made with
// older parameters still verifies and is replaced by `needsRehash`'s caller at the next successful login.
//
// These functions take the NFKC form of the password and use it as given: the domain's `judgePassword` normalises,
// and what it accepted is what is hashed. Nothing here trims, folds or truncates, and nothing here logs, returns or
// throws a password, its tag or its salt.

interface Argon2Cost {
  /** Memory in KiB. */
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

interface HashShape extends Argon2Cost {
  readonly saltBytes: number;
  readonly tagBytes: number;
}

/** OWASP's first argon2id row: 19 MiB, two passes, one lane. The remedy for a slow deployment is a recorded lower
 *  cost or scrypt, not another row of the table (M8B plan, L3 criterion 6). */
const CURRENT_SHAPE: HashShape = {
  memory: 19_456,
  passes: 2,
  parallelism: 1,
  saltBytes: 16,
  tagBytes: 32,
};

const ARGON2_ALGORITHM = "argon2id";
const ARGON2_VERSION = 19;

const ARGON2_REQUIRES_NODE_MESSAGE =
  "argon2id password hashing needs node:crypto.argon2, which exists from Node 24.7; run the server on Node >=24.7.";
const ARGON2_MISSING_LOG_LINE = `[account] ${ARGON2_REQUIRES_NODE_MESSAGE}`;

// What a stored string may name and still be computed. Every hash is ours, so these bound a damaged row rather than
// an attacker: a string outside them is not a hash, and is never fed to the function.
const MIN_SALT_BYTES = 8;
const MAX_SALT_BYTES = 64;
const MIN_TAG_BYTES = 4;
const MAX_TAG_BYTES = 64;
const MAX_MEMORY_KIB = 262_144;
const MAX_PASSES = 10;
const MAX_PARALLELISM = 8;
const MIN_MEMORY_PER_LANE = 8;

/** `$argon2id$v=19$m=…,t=…,p=…$salt$tag`, the salt and the tag in standard base64 without padding (the PHC format). */
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d{1,7}),t=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]{1,128})\$([A-Za-z0-9+/]{1,128})$/;

interface ParsedHash extends HashShape {
  readonly salt: Buffer;
  readonly tag: Buffer;
}

/** `node:crypto` has no `argon2` on a Node older than 24.7. Callers answer 503 on any throw, so this is loud, not a
 *  "wrong password". */
export class Argon2UnavailableError extends Error {
  constructor() {
    super(ARGON2_REQUIRES_NODE_MESSAGE);
    this.name = "Argon2UnavailableError";
  }
}

let hasReportedMissingArgon2 = false;

/** A fresh hash of `password`, at the current cost, with a new 16-byte salt. */
export async function hashPassword(password: string): Promise<string> {
  assertArgon2Available();
  const salt = randomBytes(CURRENT_SHAPE.saltBytes);
  const tag = await deriveTag({ password, salt, shape: CURRENT_SHAPE });
  return formatHash({ shape: CURRENT_SHAPE, salt, tag });
}

/** What comparing a password with a stored hash came to. `failed` is the platform's (the `node:crypto` call threw, or
 *  memory ran out): it says nothing of whether the password was right. */
export type PasswordCheck = "match" | "mismatch" | "failed";

/**
 * Whether `password` is the one `phc` was made from, computed with the parameters `phc` names. A platform failure is
 * told apart from a mismatch, so a caller never reads "could not compute" as "wrong password". A string that is not a
 * well-formed hash is a mismatch and never throws.
 */
export async function checkPassword({
  password,
  phc,
}: {
  password: string;
  phc: string;
}): Promise<PasswordCheck> {
  assertArgon2Available();
  const parsed = parseHash(phc);
  if (parsed === undefined) return "mismatch";
  try {
    const tag = await deriveTag({ password, salt: parsed.salt, shape: parsed });
    return tag.length === parsed.tag.length && timingSafeEqual(tag, parsed.tag)
      ? "match"
      : "mismatch";
  } catch {
    return "failed";
  }
}

/** True when `phc` was made with anything but the current parameters, or is not a hash at all. */
export function needsRehash(phc: string): boolean {
  const parsed = parseHash(phc);
  return (
    parsed === undefined ||
    parsed.memory !== CURRENT_SHAPE.memory ||
    parsed.passes !== CURRENT_SHAPE.passes ||
    parsed.parallelism !== CURRENT_SHAPE.parallelism ||
    parsed.salt.length !== CURRENT_SHAPE.saltBytes ||
    parsed.tag.length !== CURRENT_SHAPE.tagBytes
  );
}

/** Hashed and compared in place of a password the domain's policy refused: it never matches, and no input of the
 *  client's is hashed, so a long body is not turned into argon2id work. */
export const REFUSED_PASSWORD_STAND_IN = "refused";

/**
 * A fixed hash at the current cost, for the unknown-address path: verifying against it takes as long as verifying a
 * wrong password against a real account, so the time does not say whether an address has one. Its salt and tag are
 * zeros, so no password verifies against it.
 */
export const DUMMY_PHC: string = formatHash({
  shape: CURRENT_SHAPE,
  salt: Buffer.alloc(CURRENT_SHAPE.saltBytes),
  tag: Buffer.alloc(CURRENT_SHAPE.tagBytes),
});

function assertArgon2Available(): void {
  // The type says it is always there; an older runtime says otherwise.
  if (typeof (nodeCrypto as Partial<typeof nodeCrypto>).argon2 === "function")
    return;
  if (!hasReportedMissingArgon2) {
    hasReportedMissingArgon2 = true;
    console.error(ARGON2_MISSING_LOG_LINE);
  }
  throw new Argon2UnavailableError();
}

function deriveTag({
  password,
  salt,
  shape,
}: {
  password: string;
  salt: Buffer;
  shape: HashShape;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeCrypto.argon2(
      ARGON2_ALGORITHM,
      {
        message: password,
        nonce: salt,
        memory: shape.memory,
        passes: shape.passes,
        parallelism: shape.parallelism,
        tagLength: shape.tagBytes,
      },
      (error, tag) => {
        if (error === null) resolve(tag);
        else reject(error);
      },
    );
  });
}

function formatHash({
  shape,
  salt,
  tag,
}: {
  shape: Argon2Cost;
  salt: Buffer;
  tag: Buffer;
}): string {
  const cost = `m=${String(shape.memory)},t=${String(shape.passes)},p=${String(shape.parallelism)}`;
  return `$${ARGON2_ALGORITHM}$v=${String(ARGON2_VERSION)}$${cost}$${unpadded(salt)}$${unpadded(tag)}`;
}

function unpadded(bytes: Buffer): string {
  return bytes.toString("base64").replace(/=+$/, "");
}

function parseHash(phc: string): ParsedHash | undefined {
  const match = PHC_PATTERN.exec(phc);
  if (match === null) return undefined;
  const [, memory, passes, parallelism, encodedSalt, encodedTag] = match;
  const salt = Buffer.from(encodedSalt ?? "", "base64");
  const tag = Buffer.from(encodedTag ?? "", "base64");
  const parsed: ParsedHash = {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    saltBytes: salt.length,
    tagBytes: tag.length,
    salt,
    tag,
  };
  return isComputable(parsed) ? parsed : undefined;
}

function isComputable(parsed: ParsedHash): boolean {
  return (
    parsed.parallelism >= 1 &&
    parsed.parallelism <= MAX_PARALLELISM &&
    parsed.memory >= MIN_MEMORY_PER_LANE * parsed.parallelism &&
    parsed.memory <= MAX_MEMORY_KIB &&
    parsed.passes >= 1 &&
    parsed.passes <= MAX_PASSES &&
    parsed.saltBytes >= MIN_SALT_BYTES &&
    parsed.saltBytes <= MAX_SALT_BYTES &&
    parsed.tagBytes >= MIN_TAG_BYTES &&
    parsed.tagBytes <= MAX_TAG_BYTES
  );
}
