import { isUnstorableText } from "./snapshot-judgement.js";

/** `presets_typed_name_length`, in characters. */
export const MAX_PRESET_NAME_CHARACTERS = 80;

/** The characters that reorder or isolate the text around them: the Arabic letter mark, the left-to-right and
 *  right-to-left marks, the embeddings and overrides, the isolates. Named for readability; `CONTROL_OR_INVISIBLE_CHARACTER` below
 *  subsumes them. */
const BIDI_CHARACTER = "\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069";

/** A control character, a format character (zero-width and joining characters, the bidi controls, the soft hyphen), and
 *  the line and paragraph separators: none shows as text, and a name holding one cannot be told from one without. */
const CONTROL_OR_INVISIBLE_CHARACTER = new RegExp(
  `[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}${BIDI_CHARACTER}]`,
  "u",
);

/**
 * Whether a typed name may be stored and shown: text the database can hold, 1 to 80 characters (counted as
 * `char_length` counts them), already NFC and already trimmed (so never blank), and free of control, format and bidi-override
 * characters (plan section 3.3). Applied on write, where a failing name is refused, and on read, where it is not shown.
 */
export function isShowablePresetName(value: unknown): value is string {
  if (typeof value !== "string" || isUnstorableText(value)) return false;
  const characters = Array.from(value).length;
  return (
    characters >= 1 &&
    characters <= MAX_PRESET_NAME_CHARACTERS &&
    value === value.normalize("NFC") &&
    value === value.trim() &&
    !CONTROL_OR_INVISIBLE_CHARACTER.test(value)
  );
}

/** What a stored name is shown as: itself, or `undefined` (the generated name) when it fails the rule. A row written
 *  by hand, or by an older build, never makes a listing throw for its name. */
export function showablePresetName(stored: unknown): string | undefined {
  return isShowablePresetName(stored) ? stored : undefined;
}
