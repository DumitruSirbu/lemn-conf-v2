import { customAlphabet } from "nanoid";

const REFERENCE_PREFIX = "LM-";
/** Crockford's base 32 without its check symbols: no `I`, `L`, `O` or `U`, so a reference reads aloud. */
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const REFERENCE_BODY_LENGTH = 8;

const drawReferenceBody = customAlphabet(
  REFERENCE_ALPHABET,
  REFERENCE_BODY_LENGTH,
);

const SUBMISSION_REFERENCE_SHAPE = new RegExp(
  `^${REFERENCE_PREFIX}[${REFERENCE_ALPHABET}]{${String(REFERENCE_BODY_LENGTH)}}$`,
);

/**
 * A label for a stored contact request, drawn from a cryptographic generator and from nothing else: no clock, counter,
 * id or digest. Forty random bits. It is a label shown to the customer and opens nothing, so nothing may treat it as a
 * credential.
 */
export function generateSubmissionReference(): string {
  return `${REFERENCE_PREFIX}${drawReferenceBody()}`;
}

/** Exactly what {@link generateSubmissionReference} can make. Narrower than the table's check, which admits six to
 *  thirty-two characters of `0-9`, `A-Z` and `-`. */
export function isSubmissionReference(value: string): boolean {
  return SUBMISSION_REFERENCE_SHAPE.test(value);
}
