import {
  readTypedText,
  type TextRefusalCode,
} from "../contact/input-checks.js";
import { MAX_BOOK_NAME_LENGTH } from "../pricing/parse-price-book.js";

// The two texts a staff member writes when publishing a price version: its label and its note. They are typed text like
// every other field, so the reading is `readTypedText`'s: NFC, format characters (zero-width, bidi marks and overrides)
// removed, trimmed, and no control, line-separator or lone-surrogate character. The label is how the history names the
// version, so it is required; the note is a single line the frame draws no field for, so it may be empty.

/** Characters, as code points, in the stored NFC form. A version's name has the book's bound for a name (ADR 0178). */
export const VERSION_LABEL_MAX_LENGTH = MAX_BOOK_NAME_LENGTH;

/** Characters, as code points, in the stored NFC form: one line, as long as a created row's description. */
export const VERSION_NOTE_MAX_LENGTH = 240;

export type VersionTextRefusalCode = TextRefusalCode | "REQUIRED";

export type VersionTextJudgement =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: VersionTextRefusalCode };

/** On acceptance, `text` is the form that is stored and shown. An absent or blank label is `REQUIRED`. */
export function judgeVersionLabel(raw: unknown): VersionTextJudgement {
  const reading = readTypedText(raw, VERSION_LABEL_MAX_LENGTH);
  if (!reading.ok) return reading;
  if (reading.value === "") return { ok: false, code: "REQUIRED" };
  return { ok: true, text: reading.value };
}

/** On acceptance, `text` is the form that is stored and shown; an absent or blank note is the empty string. */
export function judgeVersionNote(raw: unknown): VersionTextJudgement {
  const reading = readTypedText(raw, VERSION_NOTE_MAX_LENGTH);
  return reading.ok ? { ok: true, text: reading.value } : reading;
}
