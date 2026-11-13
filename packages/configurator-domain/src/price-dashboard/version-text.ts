import {
  readTypedText,
  type TextRefusalCode,
  type TypedTextReading,
} from "../contact/input-checks.js";
import { MAX_BOOK_NAME_LENGTH } from "../pricing/book-reading.js";
import {
  holdsNothingVisible,
  holdsUnsendableCharacter,
} from "../visible-text.js";

// The version's label and note are typed text (`readTypedText`: NFC, format characters removed, trimmed), except that
// a direction control is refused as typed, never stripped, because it reorders the text printed around it (see ADR 0178
// F5). The label names the version in the history, so it is required; the note may be empty.

/** The braille blank renders as nothing and is a symbol (`So`), which the shared blank class does not hold. */
const BRAILLE_BLANK = "\u2800";

/** Characters, as code points, in the stored NFC form. A version's name has the book's bound for a name (ADR 0178). */
export const VERSION_LABEL_MAX_LENGTH = MAX_BOOK_NAME_LENGTH;

/** Characters, as code points, in the stored NFC form: one line, as long as a created row's description. */
export const VERSION_NOTE_MAX_LENGTH = 240;

export type VersionTextRefusalCode = TextRefusalCode | "REQUIRED";

export type VersionTextJudgement =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: VersionTextRefusalCode };

/** On acceptance, `text` is the form stored and shown. An absent label, or one that shows nothing, is `REQUIRED`. */
export function judgeVersionLabel(raw: unknown): VersionTextJudgement {
  const reading = readVersionText(raw, VERSION_LABEL_MAX_LENGTH);
  if (!reading.ok) return reading;
  if (holdsNothingToRead(reading.value)) return { ok: false, code: "REQUIRED" };
  return { ok: true, text: reading.value };
}

/** On acceptance, `text` is the form stored and shown; an absent note, or one that shows nothing, is empty. */
export function judgeVersionNote(raw: unknown): VersionTextJudgement {
  const reading = readVersionText(raw, VERSION_NOTE_MAX_LENGTH);
  if (!reading.ok) return reading;
  return {
    ok: true,
    text: holdsNothingToRead(reading.value) ? "" : reading.value,
  };
}

function holdsNothingToRead(text: string): boolean {
  return holdsNothingVisible(text.replaceAll(BRAILLE_BLANK, ""));
}

function readVersionText(raw: unknown, maxLength: number): TypedTextReading {
  if (typeof raw === "string" && holdsUnsendableCharacter(raw)) {
    return { ok: false, code: "FORBIDDEN_CHARACTER" };
  }
  return readTypedText(raw, maxLength);
}
