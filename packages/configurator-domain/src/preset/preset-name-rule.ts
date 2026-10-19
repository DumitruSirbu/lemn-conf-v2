// The one rule a preset's typed name is held to, for the browser that shows it, the route that accepts it and the store
// that keeps it (`presets_typed_name_length`; ADR 0112 Amendment A). I/O-free: the browser bundle imports this module.

import { isUnstorableText } from "../unstorable-text.js";

/** The longest typed name, in characters. */
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
 * Whether a typed name may be stored and shown: text the database can hold, 1 to `MAX_PRESET_NAME_CHARACTERS`
 * characters (counted as `char_length` counts them), already NFC and already trimmed (so never blank), and free of
 * control, format and bidi-override characters. Applied on write, where a failing name is refused, and on read, where it
 * is not shown.
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
