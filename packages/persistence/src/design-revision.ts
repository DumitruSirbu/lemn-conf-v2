/**
 * The concurrency token WEB-003 added to `designs`, as every layer above SQL sees it: **a string**.
 *
 * It is a `bigint` in the database, and it is deliberately never a number here. Two reasons, and
 * both are about it staying opaque. A `bigint` does not survive JSON or a JavaScript `number`
 * intact, so parsing it invites a value that compares equal to a different stored revision. And a
 * caller holding a number is one step from adding one to it, which is the whole property this token
 * exists to deny: only a successful `update` may decide what the next revision is.
 */
export type DesignRevision = string;

/**
 * A digit run with no leading zero, bounded so it cannot be an unbounded body dressed as a
 * revision. Nineteen digits is the widest a `bigint` reaches.
 *
 * Stated as what a revision **is**, the same way `requireSha256Digest` states what a write-token
 * hash is: a blocklist of `""`, `"1e3"`, `" 1"` and `"01"` grows one discovered value at a time and
 * the contract does not.
 *
 * `^`/`$` are the whole string here and need no `\A`/`\z` equivalent. JavaScript is not Perl: with
 * no `m` flag, `$` matches only at the end of input and **not** before a trailing newline, so
 * `"1\n"` is refused. Said explicitly because the opposite is true in most other regex dialects,
 * and a reader carrying that assumption would "fix" this into `[\s\S]`-anchored noise or add an
 * `m` flag that would genuinely open the hole. `design-revision.test.ts` pins it.
 */
const DESIGN_REVISION_SHAPE = /^[1-9][0-9]{0,18}$/;

/** Whether a caller-supplied string could be a revision at all. A boundary check, not the
 *  concurrency check: matching this says nothing about whether it is the row's *current* one. */
export function isDesignRevision(value: string): boolean {
  return DESIGN_REVISION_SHAPE.test(value);
}
