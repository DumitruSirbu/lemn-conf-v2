// A revision is opaque (ADR 0178): compared for equality and never parsed into a number. Its shape is still checked as text
// at the boundary, because a store refuses a revision SQL could not cast, and that refusal would surface as a `503`.

/** A digit run with no leading zero, or the single digit 0: the initial revision of a draft nothing has written. */
const REVISION_SHAPE = /^(0|[1-9][0-9]{0,18})$/;

/** The widest a `bigint` reaches; a nineteen-digit revision is compared with it as text. */
const WIDEST_REVISION = "9223372036854775807";

export function isRevisionShape(declared: string): boolean {
  return (
    REVISION_SHAPE.test(declared) &&
    (declared.length < WIDEST_REVISION.length || declared <= WIDEST_REVISION)
  );
}
