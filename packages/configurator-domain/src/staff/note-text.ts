import {
  countCharacters,
  holdsForbiddenCharacter,
  type TextRefusalCode,
} from "../contact/input-checks.js";

// A staff note is typed text like every other field, except that it spans lines and refuses, rather than drops,
// the characters that reorder text on screen (plan P-L3-5, K-8). `readTypedText` cannot read it: it refuses the
// line feed and strips the reordering characters.

/** Characters, as code points, in the stored NFC form. The `design_notes.body` length check repeats it. */
export const NOTE_TEXT_MAX_LENGTH = 2000;

/** The same ceiling `readTypedText` applies before composing: past it, the value is refused without being composed. */
const UNCOMPOSED_LENGTH_FACTOR = 8;

const LINE_FEED = "\n";

/** Embeddings, overrides and isolates: U+202A to U+202E and U+2066 to U+2069. */
const BIDI_REORDERING_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

const FORMAT_CHARACTER = /\p{Cf}/gu;

export type NoteTextRefusalCode = TextRefusalCode | "REQUIRED";

export type NoteTextJudgement =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: NoteTextRefusalCode };

/** On acceptance, `text` is the form that is stored and shown. */
export function judgeNoteText(raw: unknown): NoteTextJudgement {
  if (raw === undefined) return refused("REQUIRED");
  if (typeof raw !== "string") return refused("NOT_TEXT");
  if (holdsRefusedCharacter(raw)) return refused("FORBIDDEN_CHARACTER");
  const visible = raw.replace(FORMAT_CHARACTER, "");
  if (visible.length > NOTE_TEXT_MAX_LENGTH * UNCOMPOSED_LENGTH_FACTOR) {
    return refused("TOO_LONG");
  }
  const text = visible.normalize("NFC").trim();
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
