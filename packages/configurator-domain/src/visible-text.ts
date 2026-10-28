// What authored text must be to be printed on one line of the shop's lead notice and read by a person: the rules for
// the words of a row the dashboard created. They are predicates and not a cleaning, so text that fails is refused and
// never edited into something the author did not write.
//
// The contact fields share the class of characters a line cannot hold (`contact/input-checks.ts`) but remove format
// characters where this refuses direction controls, so the two stay separate and this module reaches into no contact code.

/** Control (C0, C1 and DEL, so CR, LF, NUL and U+0085), unpaired-surrogate, line and paragraph separator characters,
 *  and the direction controls (embeddings, overrides, isolates, the two marks and the Arabic letter mark) that reorder
 *  the text printed around them. Tested with the `u` flag, which sees a lone surrogate as `\p{Cs}`. */
const UNSENDABLE_CHARACTER = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}؜‎‏‪-‮⁦-⁩]/u;

/** What leaves nothing to read: whitespace, every format character (zero-width space and joiners, the byte-order mark,
 *  soft hyphen), the combining grapheme joiner and the Hangul fillers, which render as blank. */
const NOTHING_VISIBLE = /^[\s\p{Z}\p{Cf}͏ᅟᅠㅤ]*$/u;

export function holdsUnsendableCharacter(text: string): boolean {
  return UNSENDABLE_CHARACTER.test(text);
}

/** Whether a name with these characters would print as an empty one. */
export function holdsNothingVisible(text: string): boolean {
  return NOTHING_VISIBLE.test(text);
}

/** Whether the text is already in the NFC form, the one a stored book holds. */
export function isComposed(text: string): boolean {
  return text.normalize("NFC") === text;
}
