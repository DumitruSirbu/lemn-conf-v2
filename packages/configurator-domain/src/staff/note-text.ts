import {
  composeVisibleText,
  countCharacters,
  holdsForbiddenCharacter,
  type TextRefusalCode,
} from "../contact/input-checks.js";

// `readTypedText` cannot read a note: it refuses the line feed, and strips the bidi controls where a note refuses them.

/** Characters, as code points, in the stored NFC form. The `design_notes.body` length check repeats it. */
export const NOTE_TEXT_MAX_LENGTH = 2000;

/** How many notes a read of one kitchen carries: the newest, and a flag that there are more. The reader of the persistence
 *  package states the same figure (`NOTES_READ_LIMIT`), and a web test pins the two equal. */
export const NOTES_SHOWN_AT_MOST = 100;

const LINE_FEED = "\n";

/** Embeddings, overrides and isolates: U+202A to U+202E and U+2066 to U+2069. */
const BIDI_REORDERING_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

export type NoteTextRefusalCode = TextRefusalCode | "REQUIRED";

export type NoteTextJudgement =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: NoteTextRefusalCode };

/** On acceptance, `text` is the form that is stored and shown. */
export function judgeNoteText(raw: unknown): NoteTextJudgement {
  if (raw === undefined) return refused("REQUIRED");
  if (typeof raw !== "string") return refused("NOT_TEXT");
  if (holdsRefusedCharacter(raw)) return refused("FORBIDDEN_CHARACTER");
  const reading = composeVisibleText(raw, NOTE_TEXT_MAX_LENGTH);
  if (!reading.ok) return refused(reading.code);
  const text = reading.composed.trim();
  if (text === "") return refused("REQUIRED");
  return countCharacters(text) > NOTE_TEXT_MAX_LENGTH
    ? refused("TOO_LONG")
    : { ok: true, text };
}

/** Read on the value as it arrived: removing a format character first could join two lone surrogate halves. */
function holdsRefusedCharacter(raw: string): boolean {
  return (
    BIDI_REORDERING_CONTROL.test(raw) ||
    raw.split(LINE_FEED).some(holdsForbiddenCharacter)
  );
}

function refused(code: NoteTextRefusalCode): NoteTextJudgement {
  return { ok: false, code };
}
