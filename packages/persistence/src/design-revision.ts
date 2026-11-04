import { isDesignRevisionShape } from "@lemnaria/configurator-domain";

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
 * Whether a caller-supplied string could be a design's revision at all: the domain's one revision
 * shape (a digit run no wider than a `bigint`, no leading zero), and never 0, which only a head
 * nothing has written starts at. A boundary check, not the concurrency check: matching this says
 * nothing about whether it is the row's *current* one.
 *
 * Stated as what a revision **is**, the same way `requireSha256Digest` states what a write-token
 * hash is: a blocklist of `""`, `"1e3"`, `" 1"` and `"01"` grows one discovered value at a time and
 * the contract does not. `design-revision.test.ts` pins that `"1\n"` is refused.
 */
export function isDesignRevision(value: string): boolean {
  return isDesignRevisionShape(value);
}
