import { createHmac } from "node:crypto";

/** The fields of each purpose, in the order they are written. A purpose is added here, never inferred. */
const PURPOSE_FIELDS = {
  "rate-limit-bucket": ["policyName", "subjectKind", "subject"],
} as const;

type PurposeFields = typeof PURPOSE_FIELDS;

export type DigestPurpose = keyof PurposeFields;

/** What is digested: a purpose from the closed set and exactly that purpose's fields. */
export type DigestInput = {
  readonly [Purpose in DigestPurpose]: {
    readonly purpose: Purpose;
    readonly fields: Readonly<Record<PurposeFields[Purpose][number], string>>;
  };
}[DigestPurpose];

export const DIGEST_KEY_BYTES = 32;

/** A part that cannot be written: the name of the part, never its text. */
export class DigestPartError extends Error {
  readonly part: string;

  constructor(part: string) {
    super(`The digest part "${part}" is not well-formed text`);
    this.name = "DigestPartError";
    this.part = part;
  }
}

/** Fields that are not exactly the purpose's: a field dropped or added in silence would change what a key means. Names
 *  no field and holds no value. */
export class DigestFieldsError extends Error {
  constructor() {
    super("The digest fields are not exactly the purpose's fields");
    this.name = "DigestFieldsError";
  }
}

/** A key that is not thirty-two bytes. Holds no byte of it. */
export class DigestKeyError extends Error {
  constructor() {
    super(`The digest key is not ${String(DIGEST_KEY_BYTES)} bytes`);
    this.name = "DigestKeyError";
  }
}

/** Half of a surrogate pair stands for U+FFFD once it is bytes, so two different texts would become one key. */
const ILL_FORMED_TEXT = /\p{Cs}/u;

/**
 * Pure. HMAC-SHA-256 of the encoding, as sixty-four lowercase hexadecimal characters. Equal digests come only from
 * equal purposes and equal fields, because each part carries its own length in bytes.
 */
export function keyedDigest(key: Uint8Array, input: DigestInput): string {
  if (!(key instanceof Uint8Array) || key.length !== DIGEST_KEY_BYTES) {
    throw new DigestKeyError();
  }
  return createHmac("sha256", key)
    .update(encodeDigestInput(input), "utf8")
    .digest("hex");
}

interface Part {
  readonly name: string;
  readonly text: string;
}

/** Each part as its UTF-8 byte count in plain decimal, a colon, the part, a comma; the purpose first. */
export function encodeDigestInput(input: DigestInput): string {
  const { purpose } = input;
  if (!Object.hasOwn(PURPOSE_FIELDS, purpose)) {
    throw new DigestPartError("purpose");
  }
  const fieldNames: readonly string[] = PURPOSE_FIELDS[purpose];
  requireExactlyTheFields(input.fields, fieldNames);
  const parts: Part[] = [
    { name: "purpose", text: purpose },
    ...fieldNames.map((name) => ({
      name,
      text: fieldText(input.fields, name),
    })),
  ];
  return parts.map(encodePart).join("");
}

/** Every own key, symbols and hidden ones too, so nothing travels beside the fields that are written. */
function requireExactlyTheFields(
  fields: unknown,
  names: readonly string[],
): void {
  if (typeof fields !== "object" || fields === null) {
    throw new DigestFieldsError();
  }
  const keys = Reflect.ownKeys(fields);
  const isExact =
    keys.length === names.length && names.every((name) => keys.includes(name));
  if (!isExact) throw new DigestFieldsError();
}

function fieldText(
  fields: Readonly<Record<string, string>>,
  name: string,
): string {
  const text: unknown = Object.hasOwn(fields, name) ? fields[name] : undefined;
  if (typeof text !== "string") throw new DigestPartError(name);
  return text;
}

function encodePart({ name, text }: Part): string {
  if (ILL_FORMED_TEXT.test(text)) throw new DigestPartError(name);
  return `${String(Buffer.byteLength(text, "utf8"))}:${text},`;
}
