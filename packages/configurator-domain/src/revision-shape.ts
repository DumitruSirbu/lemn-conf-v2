/** The widest a `bigint` column holds; a nineteen-digit revision is compared with it as text. */
const WIDEST_REVISION = "9223372036854775807";

/** JavaScript's `$`, with no `m` flag, matches only at the end of input and not before a trailing line feed, so
 *  `"1\n"` is refused; most other regex dialects differ. */
const REVISION_SHAPE = /^(0|[1-9][0-9]{0,18})$/;

/**
 * Whether a value is text a `bigint` revision column can be cast from: the single digit 0 (the initial revision of a
 * head nothing has written) or a digit run with no leading zero, and at nineteen digits no wider than a `bigint`.
 * The width is judged as text and a revision is never parsed into a number, so it stays opaque. This is the one
 * statement of the shape; a layer that refuses 0 states that itself, on top of this.
 */
export function isRevisionShape(value: unknown): value is string {
  return (
    typeof value === "string" &&
    REVISION_SHAPE.test(value) &&
    (value.length < WIDEST_REVISION.length || value <= WIDEST_REVISION)
  );
}
