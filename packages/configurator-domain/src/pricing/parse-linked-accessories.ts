// Reads the accessories the dashboard created (ADR 0177 A-19) from a book that arrives as untrusted data. The list is
// required, as every other section is: an absent one is refused, never read as empty, so a stored book from before the
// field existed cannot price. Every read goes through `readDeclared` and `boundedListOf`.
//
// The words are authored Romanian and nothing else (A-21): a `name`, an optional `description`, and no key into the
// message files and no Russian field. The last two are refused by `parse-row-members.ts`, which closes the row's keys.
// The text is held to what one line of the shop's lead notice can carry (`visible-text.ts`); what it may say (an
// amount, "inclus") is the dashboard's judgement, not the parser's.
import {
  holdsNothingVisible,
  holdsUnsendableCharacter,
  isComposed,
} from "../visible-text.js";

import {
  boundedListOf,
  describeDeclared,
  firstDuplicate,
  idAsText,
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
import { listAccessoryIds, type PriceBook } from "./price-book.js";
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
  const named = `linked accessory "${idAsText(accessoryId)}"`;
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

/** The Romanian name every created row carries, and the optional description beneath it. The stored book is canonical,
 *  so text not already in NFC is refused rather than rewritten, and lengths are UTF-16 units as in every other book
 *  row.
 *  A control, line-breaking, lone-surrogate or direction-control character is refused: one line break would make every
 *  kitchen earning the accessory unsendable. A name with nothing visible is refused: it would print a price line with
 *  nothing to say what it is for. */
function refuseUnreadableAuthoredWords(
  declared: Record<string, unknown>,
  named: string,
): PricingFailure | undefined {
  const name = readDeclared(declared, "name");
  const refusedName = refuseUnreadableAuthoredText(name, {
    named: `${named} name`,
    maxLength: MAX_BOOK_NAME_LENGTH,
  });
  if (refusedName) return refusedName;
  if (typeof name === "string" && holdsNothingVisible(name))
    return invalidBook(`The ${named} declares a blank "name"`);

  const description = readDeclared(declared, "description");
  if (description === undefined) return undefined;
  return refuseUnreadableAuthoredText(description, {
    named: `${named} description`,
    maxLength: MAX_BOOK_DESCRIPTION_LENGTH,
  });
}

function refuseUnreadableAuthoredText(
  declared: unknown,
  bound: { readonly named: string; readonly maxLength: number },
): PricingFailure | undefined {
  const unusable = refuseUnusableText(declared, bound);
  if (unusable || typeof declared !== "string") return unusable;
  if (holdsUnsendableCharacter(declared))
    return invalidBook(
      `Book declares a ${bound.named} holding a control, line-breaking, unpaired-surrogate ` +
        `or direction-control character`,
    );
  if (!isComposed(declared))
    return invalidBook(
      `Book declares a ${bound.named} that is not in its composed (NFC) form`,
    );
  return undefined;
}

/**
 * What a linked accessory's row says against the rest of the book, once all are readable. A repeated accessory id
 * gives two lines one id and one availability switch, and it is checked across the two built-ins' field names too, so a
 * created accessory cannot take `accessory:sinkProtectiveCover`. A link is to a row the book prices under its own build
 * id: a placement is counted through the row it is priced as, so a link to a row the book does not price (a seeded
 * variant's id among them) would earn nothing for ever; and a link to a row the customer supplies would bill for what
 * nobody sells. Whether the catalogue holds the row is the dashboard's judgement at publish, since pricing binds to no
 * catalogue.
 */
export function refuseLinkedAccessoryConflicts(
  book: PriceBook,
): PricingFailure | undefined {
  return (
    refuseRepeatedAccessoryId(book) ??
    refuseLinkToUnpricedRow(book) ??
    refuseLinkToCustomerSuppliedRow(book)
  );
}

function refuseRepeatedAccessoryId(
  book: PriceBook,
): PricingFailure | undefined {
  const repeated = firstDuplicate(listAccessoryIds(book));
  if (repeated === undefined) return undefined;
  return invalidBook(`Accessory id "${repeated}" is declared more than once`, {
    id: repeated,
  });
}

function refuseLinkToUnpricedRow(book: PriceBook): PricingFailure | undefined {
  const pricedRows = new Set(book.cabinetRules.map((rule) => rule.buildId));
  const linked = book.linkedAccessories.find(
    (accessory) => !pricedRows.has(accessory.linkedBuildId),
  );
  if (linked === undefined) return undefined;
  return refuseLink(linked, "a row the book has no cabinet rule for");
}

function refuseLinkToCustomerSuppliedRow(
  book: PriceBook,
): PricingFailure | undefined {
  const customerRows = new Set(
    book.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId),
  );
  const linked = book.linkedAccessories.find((accessory) =>
    customerRows.has(accessory.linkedBuildId),
  );
  if (linked === undefined) return undefined;
  return refuseLink(linked, "a row the customer supplies");
}

function refuseLink(
  linked: PriceBook["linkedAccessories"][number],
  because: string,
): PricingFailure {
  return invalidBook(
    `Linked accessory "${linked.accessoryId}" is linked to "${linked.linkedBuildId}", ${because}`,
    { id: linked.accessoryId },
  );
}
