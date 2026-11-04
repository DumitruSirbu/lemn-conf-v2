import { MAX_IDENTIFIER_LENGTH } from "@lemnaria/configurator-domain";

// The shapes every reader of a request body, a path or a stored draft asks of a member before it keeps it.

/** An id as a draft or a request names one: text, not empty, no longer than the domain's bound on an identifier. */
export function isIdentifier(declared: unknown): declared is string {
  return (
    typeof declared === "string" &&
    declared !== "" &&
    declared.length <= MAX_IDENTIFIER_LENGTH
  );
}

/**
 * What a minted id is made of: `nanoid`'s alphabet, which the stores' ids use (`price_book_versions.id` is checked
 * against `^[A-Za-z0-9_-]{21}$` in migration 0023). The length is the domain's bound on an identifier, not the 21
 * a store mints, so that an id of any length the bound allows reaches the store and is not found there.
 */
const MINTED_ID_CHARACTERS = new RegExp(
  `^[A-Za-z0-9_-]{1,${String(MAX_IDENTIFIER_LENGTH)}}$`,
);

/** Unlike `isIdentifier`, a path segment must carry nothing a store could not hold: it is judged before any store. */
export function isVersionId(declared: unknown): declared is string {
  return typeof declared === "string" && MINTED_ID_CHARACTERS.test(declared);
}

/** An object with members to read: not `null`, not a list. */
export function isPlainRecord(
  declared: unknown,
): declared is Readonly<Record<string, unknown>> {
  return (
    typeof declared === "object" &&
    declared !== null &&
    !Array.isArray(declared)
  );
}
