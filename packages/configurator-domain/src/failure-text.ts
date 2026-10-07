// How a validation failure is described, in one place, shared with `apps/web/src/lib/server/design-errors.ts`
// so the caps and the bounding cannot drift between two copies.
//
// Everything a caller passes through here is attacker-influenced (an incoming payload, or a stored row
// an owner wrote), so a description's cost must be constant and nothing in it may forge a log line.

/** Characters of reason that survive. */
const MAX_FAILURE_REASON_LENGTH = 300;

/** Issues named individually before a description summarises the rest. */
const MAX_DESCRIBED_ISSUES = 10;

/** The part of a Zod issue this module reads, declared structurally so no package takes a direct
 *  dependency on zod for the sake of a log line. */
export interface SchemaIssueShape {
  readonly path: readonly PropertyKey[];
  readonly code: string;
}

/**
 * The last line of defence before a string becomes an exception message or a log line: no control
 * characters, so nothing can forge a line, and a hard cap, so nothing can flood one. Applied
 * unconditionally by the describers below rather than left to a call site.
 */
export function boundedFailureReason(reason: string): string {
  const singleLine = reason.replace(/[\p{Cc}\p{Cf}]/gu, " ");
  return singleLine.length <= MAX_FAILURE_REASON_LENGTH
    ? singleLine
    : `${singleLine.slice(0, MAX_FAILURE_REASON_LENGTH)}… (truncated)`;
}

/**
 * The shape of a schema failure (how many issues, and where), never the values that caused them.
 * `ZodError.message` renders the whole tree, so 300 malformed placements give a line of about 300,000
 * characters and an unrecognised key is echoed verbatim into this application's log. A path and a code
 * carry everything a genuine client bug needs.
 */
export function describeSchemaIssues(
  issues: readonly SchemaIssueShape[],
): string {
  return describeBoundedIssues(
    issues.map((issue) => `${describeIssuePath(issue)}:${issue.code}`),
  );
}

/** One description per issue, capped in number and then in length. */
export function describeBoundedIssues(descriptions: readonly string[]): string {
  const shown = descriptions.slice(0, MAX_DESCRIBED_ISSUES);
  const omitted = descriptions.length - shown.length;
  const summary = `${String(descriptions.length)} issue(s): ${shown.join(", ")}`;
  return boundedFailureReason(
    omitted > 0 ? `${summary} (+${String(omitted)} more)` : summary,
  );
}

function describeIssuePath(issue: SchemaIssueShape): string {
  const segments = issue.path.map((segment) => String(segment));
  return segments.length === 0 ? "(root)" : segments.join(".");
}
