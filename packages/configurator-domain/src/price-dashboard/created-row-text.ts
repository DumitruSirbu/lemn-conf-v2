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
const PERCENT_SIGN = /[%％٪﹪‰‱]/u;

/** A percentage said in words. */
const PERCENT_WORD = /(?<!\p{L})procent(?:e|ul|elor)?(?!\p{L})/iu;

/** The inclusion words, in the family ADR 0106 Amendment A names and the catalogue sweep widens to: `inclus`, `inclusa`
 *  (with or without its breve), `incluse`, `inclusiv`, `incluzand` (with or without its circumflex). `include` is not
 *  one: it says nothing about what a price holds. */
const INCLUSION_WORD =
  /(?<!\p{L})(?:inclus(?:[a\u0103e]|iv)?|incluz[a\u00e2]nd)(?!\p{L})/iu;

const MONEY_SYMBOL = "[\\u20AC$\\u00A3\\u20BD]";
const MONEY_WORD =
  "(?<!\\p{L})(?:lei|leu|mdl|ron|bani|eur|euro|usd|dolari)(?!\\p{L})";
const MONEY_UNIT = `(?:${MONEY_WORD}|${MONEY_SYMBOL})`;
const NUMBER = "\\p{Nd}+(?:[.,\\s\\u00A0\\u202F]\\p{Nd}+)*";

/** A number beside a money unit, either side of it: "500 lei", "MDL 500", "€5". A bare number is not an amount: a model
 *  or a size ("Blum 2000", "60 cm") is how a row is named. */
const AMOUNT = new RegExp(
  `${NUMBER}\\s*${MONEY_UNIT}|${MONEY_UNIT}\\s*${NUMBER}`,
  "iu",
);

/**
 * The text a created row carries, or the one reason it is refused. A name is required; a description may be empty.
 * On acceptance, `text` is the form to store: trimmed, and otherwise as typed. Refused, in this order: a value that is
 * not text, a control, line-breaking, unpaired-surrogate or direction-control character or text not in NFC, text with
 * nothing visible (a name only), text past the book's bound, and text that states an amount, a percentage or an
 * inclusion. An amount is a number beside a money unit.
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
  return [PERCENT_SIGN, PERCENT_WORD, INCLUSION_WORD, AMOUNT].some((pattern) =>
    pattern.test(text),
  );
}

function refused(code: CreatedRowTextRefusalCode): CreatedRowTextJudgement {
  return { ok: false, code };
}
