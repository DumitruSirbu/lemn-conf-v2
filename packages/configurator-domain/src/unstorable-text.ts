/** Half of a surrogate pair: a high half with no low half after it, or a low half with no high half before it. Tested
 *  without the `u` flag so a half is seen as a code unit. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const NUL = "\u0000";

/** What Postgres cannot hold in text: a NUL, and half of a surrogate pair. */
export function isUnstorableText(text: string): boolean {
  return text.includes(NUL) || LONE_SURROGATE.test(text);
}
