import { isClientRequestId } from "@lemnaria/configurator-domain";

/**
 * Every id handed to a test-only function that reaches `contact_submissions` is a client request id of the domain's
 * shape (sixteen to sixty-four of `A-Za-z0-9_-`), checked before any connection is opened. Nothing but such an id can
 * reach a statement, so no pattern, wildcard, empty text or list that names more than its own rows can be sent. The
 * refusal names the operation and holds none of the text.
 */
export function requireClientRequestIds(
  ids: readonly string[],
  operation: string,
): void {
  const isEveryIdOfTheShape = ids.every(
    (id) => typeof id === "string" && isClientRequestId(id),
  );
  if (isEveryIdOfTheShape) return;
  throw new Error(
    `Refusing to ${operation}: every id must be a client request id, sixteen to sixty-four of letters, digits, ` +
      `underscores and hyphens. Any other text could name more rows than the ones it was handed.`,
  );
}
