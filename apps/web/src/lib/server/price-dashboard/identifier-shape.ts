import { MAX_IDENTIFIER_LENGTH } from "@lemnaria/configurator-domain";

// The two shapes every reader of a request body or a stored draft asks of a member before it keeps it.

/** An id as a draft or a request names one: text, not empty, no longer than the domain's bound on an identifier. */
export function isIdentifier(declared: unknown): declared is string {
  return (
    typeof declared === "string" &&
    declared !== "" &&
    declared.length <= MAX_IDENTIFIER_LENGTH
  );
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
