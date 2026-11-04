import {
  MAX_BOOK_DESCRIPTION_LENGTH,
  MAX_BOOK_NAME_LENGTH,
} from "../pricing/book-reading.js";
import {
  holdsNothingVisible,
  holdsUnsendableCharacter,
  isComposed,
} from "../visible-text.js";

import type { CreatedRowTextField } from "./book-field-address.js";

// The words of a row the dashboard creates (A-21): Romanian, one line, and not a second copy of a fact the row's
// amounts state (ADR 0106 Amendment A). Judged as a predicate: text that fails is refused and never edited into
// something the author did not write, except that it is trimmed. The book's parser holds a stored created row to the
// same characters, composition and bounds (`parse-linked-accessories.ts`), so nothing accepted here is refused there.

/** Why authored text was refused. The words are the wire's own (`AUTHORED_TEXT_REFUSAL_CODES`). */
export const AUTHORED_TEXT_REFUSAL_CODES = Object.freeze([
  "TEXT_EMPTY",
  "TEXT_TOO_LONG",
  "TEXT_FORBIDDEN_CHARACTER",
  "TEXT_STATES_AN_AMOUNT",
] as const);
export type AuthoredTextRefusalCode =
  (typeof AUTHORED_TEXT_REFUSAL_CODES)[number];

export type CreatedRowTextRefusalCode =
  | AuthoredTextRefusalCode
  | "MISSING_VALUE";

export type CreatedRowTextJudgement =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: CreatedRowTextRefusalCode };

/** UTF-16 units, as the parser measures them. */
const MAX_LENGTH_OF_FIELD: Readonly<Record<CreatedRowTextField, number>> = {
  name: MAX_BOOK_NAME_LENGTH,
  description: MAX_BOOK_DESCRIPTION_LENGTH,
};

/** The percent sign and its look-alikes, which NFC leaves as they are: fullwidth, Arabic, small, per mille and per ten
 *  thousand. */
const PERCENT_SIGN = /[%\uff05\u066a\ufe6a\u2030\u2031]/u;

/** `alternatives` as a whole word: not inside a longer one, whatever the script of the letters around it. */
function standaloneWord(alternatives: string): string {
  return String.raw`(?<!\p{L})(?:${alternatives})(?!\p{L})`;
}

/** A percentage said in words. */
const PERCENT_WORD = new RegExp(standaloneWord("procent(?:e|ul|elor)?"), "iu");

/** The inclusion words: inclus, inclusa, incluse, inclusiv, inclusi, incluzand, with and without their diacritics.
 *  `include` is not one: it says nothing about what a price holds. */
const INCLUSION_WORD = new RegExp(
  standaloneWord(
    String.raw`inclus(?:[a\u0103e]|iv)?|inclu[s\u0219\u015f]i|incluz[a\u00e2]nd`,
  ),
  "iu",
);

const MONEY_SYMBOL = String.raw`[\u20ac$\u00a3\u20bd]`;
const MONEY_WORDS = "lei|leu|mdl|ron|bani|eur|usd|dolari|dolar|gbp|chf";
const MONEY_UNIT_BEFORE_NUMBER = `(?:${standaloneWord(MONEY_WORDS)}|${MONEY_SYMBOL})`;
// "Euro 450" is a model's name, so "euro" is a unit only after its number ("450 euro").
const MONEY_UNIT_AFTER_NUMBER = `(?:${standaloneWord(`${MONEY_WORDS}|euro`)}|${MONEY_SYMBOL})`;
const NUMBER = String.raw`\p{Nd}+(?:[.,\s\u00a0\u202f]\p{Nd}+)*`;

/** What may stand between a unit and its number without hiding the amount: space, a dash, a slash, a colon, a
 *  bracket. */
const GAP = String.raw`[\s\p{Pd}/:()\[\]]*`;
/** The same after a number, which may also end a sentence or a price: "500.- lei", "500,-lei", "500. lei". */
const GAP_AFTER_NUMBER = String.raw`[\s\p{Pd}/:()\[\].,]*`;

const DE_THEN_GAP = `${standaloneWord("de")}${GAP_AFTER_NUMBER}`;
const MAGNITUDE_THEN_GAP = `${standaloneWord("mii|milioane")}${GAP_AFTER_NUMBER}`;
/** The Romanian "de" and the thousands and millions between a number and its unit: "500 de lei", "5 mii lei",
 *  "20 de mii de lei". */
const MAGNITUDE_AND_DE = `(?:(?:${DE_THEN_GAP})?${MAGNITUDE_THEN_GAP})?(?:${DE_THEN_GAP})?`;

/** A number beside a money unit, either side of it: "500 lei", "500 de lei", "500-lei", "MDL 500", "lei: 500",
 *  "€5". A bare number is not an amount: a model or a size ("Blum 2000", "60 cm") is how a row is named. */
const AMOUNT = new RegExp(
  `${NUMBER}${GAP_AFTER_NUMBER}${MAGNITUDE_AND_DE}${MONEY_UNIT_AFTER_NUMBER}` +
    `|${MONEY_UNIT_BEFORE_NUMBER}${GAP}${NUMBER}`,
  "iu",
);

/** A number said in words, in the forms a percentage follows: the units, "zece", the teens and tens (any word ending in
 *  "sprezece" or "zeci"), "suta", "mie" and "mii", with and without the diacritics. */
const NUMBER_WORD =
  String.raw`zero|unu|una|un|o|doi|dou[a\u0103]|trei|patru|cinci|[s\u0219\u015f]ase|[s\u0219\u015f]apte|opt|` +
  String.raw`nou[a\u0103]|zece|sut[a\u0103]|mie|mii|\p{L}*(?:sprezece|zeci)`;

/** "la suta" after a number or a number word: a percentage said in words. On its own it is an ordinary phrase. */
const PERCENT_PHRASE = new RegExp(
  String.raw`(?:${NUMBER}|${standaloneWord(NUMBER_WORD)})\s*${standaloneWord(String.raw`la\s+sut[a\u0103]`)}`,
  "iu",
);

/** Format characters print as nothing, so the text is judged without them: a zero-width space inside "lei" does not
 *  make it another word. */
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/**
 * The text a created row carries, or the one reason it is refused. A name is required; a description may be empty.
 * On acceptance, `text` is the form to store: trimmed, and otherwise as typed. Refused, in this order: a value that is
 * not text, a control, line-breaking, unpaired-surrogate or direction-control character or text not in NFC, text with
 * nothing visible (a name only), text past the book's bound, and text that states an amount, a percentage or an
 * inclusion. An amount is a number beside a money unit, judged without format characters.
 */
export function judgeCreatedRowText(
  raw: unknown,
  field: CreatedRowTextField,
): CreatedRowTextJudgement {
  if (typeof raw !== "string") return refused("MISSING_VALUE");
  if (holdsUnsendableCharacter(raw) || !isComposed(raw))
    return refused("TEXT_FORBIDDEN_CHARACTER");
  const text = holdsNothingVisible(raw) ? "" : raw.trim();
  if (text === "" && field === "name") return refused("TEXT_EMPTY");
  if (text.length > MAX_LENGTH_OF_FIELD[field]) return refused("TEXT_TOO_LONG");
  if (statesAnAmountOrInclusion(text)) return refused("TEXT_STATES_AN_AMOUNT");
  return { ok: true, text };
}

function statesAnAmountOrInclusion(text: string): boolean {
  const printed = text.replace(FORMAT_CHARACTERS, "");
  return [
    PERCENT_SIGN,
    PERCENT_WORD,
    PERCENT_PHRASE,
    INCLUSION_WORD,
    AMOUNT,
  ].some((pattern) => pattern.test(printed));
}

function refused(code: CreatedRowTextRefusalCode): CreatedRowTextJudgement {
  return { ok: false, code };
}
