import {
  NOTE_TEXT_MAX_LENGTH,
  NOTES_SHOWN_AT_MOST,
} from "@lemnaria/configurator-domain";

import type {
  StaffKitchenNoteWire,
  StaffKitchenWire,
} from "./staff-kitchens-wire-contract";

// What the notes of a staff kitchen are made of on the screen, apart from how they are drawn.

/** Characters invisible to the eye that the server removes before it counts: direction marks, zero-width, soft hyphen. */
const FORMAT_CHARACTER = /\p{Cf}/gu;

/** The server refuses, before it composes, a text longer than this many times the limit in UTF-16 units; composing a long
 *  run of combining marks costs its length squared. */
const UNCOMPOSED_LENGTH_FACTOR = 8;

/**
 * The length of a note as the server counts it, so the counter and the refusal agree: code points, after format characters
 * are gone and the text is composed to NFC and trimmed. A text too long to be composed is counted as typed, which is more than
 * the limit whatever it would compose to. A counter in UTF-16 units would call a note of astral characters twice as long
 * as it is, and one of decomposed letters shorter than it is.
 */
export function noteLengthOf(typed: string): number {
  const visible = typed.replace(FORMAT_CHARACTER, "");
  if (visible.length > NOTE_TEXT_MAX_LENGTH * UNCOMPOSED_LENGTH_FACTOR) {
    return Array.from(visible).length;
  }
  return Array.from(visible.normalize("NFC").trim()).length;
}

/** A note named twice is drawn once, where it first stands (the newest-first order is the server's). */
export function withoutRepeatedNotes(
  notes: readonly StaffKitchenNoteWire[],
): readonly StaffKitchenNoteWire[] {
  const seen = new Set<string>();
  return notes.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** The kitchen with a note the server has stored in front, the newest first, and no longer than the read carries. A note
 *  that does not fit is one more that the kitchen holds and this page does not show. */
export function withNoteAdded(
  kitchen: StaffKitchenWire,
  note: StaffKitchenNoteWire,
): StaffKitchenWire {
  const notes = withoutRepeatedNotes([note, ...kitchen.notes]);
  return {
    ...kitchen,
    notes: notes.slice(0, NOTES_SHOWN_AT_MOST),
    notesTruncated:
      kitchen.notesTruncated || notes.length > NOTES_SHOWN_AT_MOST,
  };
}
