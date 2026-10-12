/**
 * Whether revision `candidate` is greater than `held`, compared as the whole numbers they are and never turned into
 * a JavaScript `number` (`design-revision.ts`: a `bigint` does not survive one). A revision is a digit run with no
 * leading zero, so the longer is the greater and equal lengths compare digit by digit. Anything that is not such a
 * run, or a store with no revision, is not called greater than a revision the store holds, so a copy is never
 * replaced on the strength of a value that could not be compared; with no revision held at all, the page's wins.
 */
export function isGreaterRevision(
  candidate: string,
  held: string | null,
): boolean {
  if (held === null) return true;
  if (!isDigitRun(candidate) || !isDigitRun(held)) return false;
  if (candidate.length !== held.length) return candidate.length > held.length;
  return candidate > held;
}

/** A revision as the server writes it: whole, positive, no leading zero. */
export function isDigitRun(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}
