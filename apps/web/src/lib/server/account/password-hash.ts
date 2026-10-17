import "server-only";

import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

// Passwords are hashed with argon2id from `node:crypto` (Node 24.7 and later), stored as a PHC string so that the
// parameters travel with each hash and can be raised without a migration (ADR 0169 decision 2). A hash made with
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

/** A fresh hash of `password`, at the current cost, with a new 16-byte salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(CURRENT_SHAPE.saltBytes);
  const tag = await deriveTag({ password, salt, shape: CURRENT_SHAPE });
  return formatHash({ shape: CURRENT_SHAPE, salt, tag });
}

/**
 * Whether `password` is the one `phc` was made from, computed with the parameters `phc` names. A string that is not a
 * well-formed hash, or one the platform refuses to compute, is false and never throws.
 */
export async function verifyPassword({
  password,
  phc,
}: {
  password: string;
  phc: string;
}): Promise<boolean> {
  const parsed = parseHash(phc);
  if (parsed === undefined) return false;
  try {
    const tag = await deriveTag({ password, salt: parsed.salt, shape: parsed });
    return tag.length === parsed.tag.length && timingSafeEqual(tag, parsed.tag);
  } catch {
    return false;
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
    argon2(
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
