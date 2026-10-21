// The checks the contact fields and the contact request share: reading only what the sender's own object
// holds, and reading typed text so that what is returned is one well-formed, bounded, stored form.

export type PlainObject = Readonly<Record<string, unknown>>;

/** Format characters (direction marks, zero-width, soft hyphen) arrive with pasted text and cannot be
 *  seen. They are removed, not refused, so a stored or mailed value never holds one. */
const FORMAT_CHARACTER = /\p{Cf}/gu;

/** Text that is not well-formed: a UTF-16 half with no partner. */
const ILL_FORMED_TEXT = /\p{Cs}/u;

/** Control, unpaired-surrogate, line and paragraph separator characters: none can be shown on one line
 *  of an e-mail or stored as well-formed UTF-8. */
const FORBIDDEN_CHARACTER = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u;

/** Composing a long run of combining marks costs the run's length squared, so what is composed is bounded
 *  first: a value this many times its field's bound, once format characters are gone, is not typed text.
 *  Counted in UTF-16 units because that count costs nothing. */
const UNCOMPOSED_LENGTH_FACTOR = 8;

export type TextRefusalCode = "NOT_TEXT" | "TOO_LONG" | "FORBIDDEN_CHARACTER";

export type TypedTextReading =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly code: TextRefusalCode };

/** Only what the sender's object holds itself: a property that `Object.prototype` (or any prototype)
 *  supplies is not the sender's, whoever polluted it. */
export function ownValueOf(record: PlainObject, name: string): unknown {
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

/** Plain data only: an array, a class instance or a `null` is not a request. A property inherited from
 *  `Object.prototype` itself is not caught here; `ownValueOf` is what keeps it from being read. */
export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function holdsUnknownKey(
  record: PlainObject,
  knownKeys: readonly string[],
): boolean {
  return Object.keys(record).some((key) => !knownKeys.includes(key));
}

/** Characters, as code points. */
export function countCharacters(text: string): number {
  return Array.from(text).length;
}

export function holdsForbiddenCharacter(text: string): boolean {
  return FORBIDDEN_CHARACTER.test(text);
}

export type ComposedTextReading =
  | { readonly ok: true; readonly composed: string }
  | { readonly ok: false; readonly code: "TOO_LONG" };

/**
 * The first half of reading typed text, for a value already known to be well-formed: format characters are
 * removed, a value far past the field's bound is refused before anything is composed, and the rest is composed
 * to NFC (not the compatibility form, which would change letters the customer chose).
 */
export function composeVisibleText(
  raw: string,
  maxLength: number,
): ComposedTextReading {
  const visible = raw.replace(FORMAT_CHARACTER, "");
  if (visible.length > maxLength * UNCOMPOSED_LENGTH_FACTOR) {
    return { ok: false, code: "TOO_LONG" };
  }
  return { ok: true, composed: visible.normalize("NFC") };
}

/**
 * Typed text as it is stored, or the one reason it is not. The order is the contract, and no step costs
 * more than the value's length before the bound is applied:
 * 1. ill-formed text is refused on the value as it arrived, because removing a format character between
 *    two halves would join them into a character that is then invisible;
 * 2. `composeVisibleText` removes format characters, refuses what is far past the bound, and composes;
 * 3. the composed form is checked for forbidden characters, trimmed (a trailing line feed is refused, not
 *    dropped) and measured.
 * Reading a stored value gives that value again.
 */
export function readTypedText(
  raw: unknown,
  maxLength: number,
): TypedTextReading {
  if (raw === undefined) return { ok: true, value: "" };
  if (typeof raw !== "string") return refused("NOT_TEXT");
  if (ILL_FORMED_TEXT.test(raw)) return refused("FORBIDDEN_CHARACTER");
  const reading = composeVisibleText(raw, maxLength);
  if (!reading.ok) return refused(reading.code);
  if (FORBIDDEN_CHARACTER.test(reading.composed)) {
    return refused("FORBIDDEN_CHARACTER");
  }
  const trimmed = reading.composed.trim();
  return countCharacters(trimmed) > maxLength
    ? refused("TOO_LONG")
    : { ok: true, value: trimmed };
}

function refused(code: TextRefusalCode): TypedTextReading {
  return { ok: false, code };
}
