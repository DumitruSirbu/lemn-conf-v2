// Reads the accessories the dashboard created (ADR 0177 A-19) from a book that arrives as untrusted data. The list is
// required, as every other section is: an absent one is refused, never read as empty, so a stored book from before the
// field existed cannot price. Every read goes through `readDeclared` and `boundedListOf`.
//
// The words are authored Romanian and nothing else (A-21): a `name`, an optional `description`, and no key into the
// message files and no Russian field. The last two are refused by `parse-row-members.ts`, which closes the row's keys.
// What the words may say (characters, an amount, "inclus") is the dashboard's judgement, not the parser's.
import {
  boundedListOf,
  describeDeclared,
  invalidBook,
  isRecord,
  MAX_BOOK_DESCRIPTION_LENGTH,
  MAX_BOOK_NAME_LENGTH,
  readDeclared,
  refuseNegativeAmount,
  refuseOversizedAmount,
  refuseUnusableIdentifier,
  refuseUnusableText,
} from "./book-reading.js";
import type { PricingFailure } from "./price-lines.js";

/** The most linked accessories a book may state. Each is a row on the accessories screen, and the earning sweep reads
 *  the list once per kitchen. */
export const MAX_LINKED_ACCESSORIES = 50;

export function refuseUnreadableLinkedAccessories(
  declared: unknown,
): PricingFailure | undefined {
  const rows = boundedListOf(declared, MAX_LINKED_ACCESSORIES);
  if (rows === undefined)
    return invalidBook(
      `"linkedAccessories" is a list of at most ${String(MAX_LINKED_ACCESSORIES)} accessories. ` +
        `Found: ${describeDeclared(declared)}`,
    );
  for (const row of rows) {
    const unreadable = refuseUnreadableLinkedAccessory(row);
    if (unreadable) return unreadable;
  }
  return undefined;
}

function refuseUnreadableLinkedAccessory(
  declared: unknown,
): PricingFailure | undefined {
  if (!isRecord(declared))
    return invalidBook(
      `A linked accessory is an object. Found: ${describeDeclared(declared)}`,
    );
  const accessoryId = readDeclared(declared, "accessoryId");
  const named = `linked accessory "${textOf(accessoryId)}"`;
  return (
    refuseUnusableIdentifier(accessoryId, "linkedAccessories.accessoryId") ??
    refuseUnusableIdentifier(
      readDeclared(declared, "ruleId"),
      "linkedAccessories.ruleId",
    ) ??
    refuseUnusableIdentifier(
      readDeclared(declared, "linkedBuildId"),
      "linkedAccessories.linkedBuildId",
    ) ??
    refuseOversizedAmount(declared, named) ??
    refuseNegativeAmount(declared, "perUnitMinor", named) ??
    refuseUnreadableAuthoredWords(declared, named)
  );
}

/** The Romanian name every created row carries, and the optional description beneath it. Both are held to what a line of
 *  the shop's lead notice can carry: a control or line-breaking character would make every kitchen earning the
 *  accessory unsendable, and a bidi override would let the text reorder what is printed around it. A name with nothing
 *  visible in it is refused: it would print a price line with nothing to say what it is for. Lengths are measured on
 *  the NFC form, the one the text is stored in. */
function refuseUnreadableAuthoredWords(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const name = readDeclared(declared, "name");
  const refusedName = refuseUnusableAuthoredText(name, {
    named: `${named} name`,
    maxLength: MAX_BOOK_NAME_LENGTH,
  });
  if (refusedName) return refusedName;
  if (typeof name === "string" && isInvisible(name))
    return invalidBook(`The ${named} declares a blank "name"`);

  const description = readDeclared(declared, "description");
  if (description === undefined) return undefined;
  return refuseUnusableAuthoredText(description, {
    named: `${named} description`,
    maxLength: MAX_BOOK_DESCRIPTION_LENGTH,
  });
}

/** Control characters (C0, C1, DEL), the Unicode line and paragraph separators, and the bidi embeddings, overrides and
 *  isolates. `\p{Cc}` covers NUL, CR, LF and U+0085. */
const UNSENDABLE_CHARACTER = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;

/** Whitespace and the zero-width characters (U+200B to U+200D, U+FEFF) leave nothing to read. */
const NOTHING_VISIBLE = /^[\s\u200B-\u200D\uFEFF]*$/u;

function isInvisible(text: string): boolean {
  return NOTHING_VISIBLE.test(text);
}

function refuseUnusableAuthoredText(
  declared: unknown,
  bound: { readonly named: string; readonly maxLength: number },
): PricingFailure | undefined {
  if (typeof declared !== "string") return refuseUnusableText(declared, bound);
  const stored = declared.normalize("NFC");
  if (UNSENDABLE_CHARACTER.test(stored))
    return invalidBook(
      `Book declares a ${bound.named} holding a control, line-breaking or bidi-override character`,
    );
  return refuseUnusableText(stored, bound);
}

function textOf(declared: unknown): string {
  return typeof declared === "string" ? declared : "?";
}
