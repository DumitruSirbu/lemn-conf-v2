// How a validation failure is *described*, in one place.
//
// Review finding F3: this rule was implemented twice — once here in the domain and once in
// `apps/web/src/lib/server/design-errors.ts` — with the caps declared in both and the Zod-issue
// interface duplicated. The two halves had already drifted: the web copy's issue summary was not
// itself bounded, and stayed within the cap only because its one call site happened to bound it
// afterwards. One module, imported by both, and the bounding applied unconditionally.
//
// Everything a caller passes through here is attacker-influenced — an incoming payload, or a stored
// row an owner wrote — so a description's cost must be a constant and nothing in it may forge a log
// line.

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
 * characters, so nothing can forge a line, and a hard cap, so nothing can flood one.
 *
 * Applied unconditionally by the describers below rather than left to a call site to remember.
 */
export function boundedFailureReason(reason: string): string {
  const singleLine = reason.replace(/[\p{Cc}\p{Cf}]/gu, " ");
  return singleLine.length <= MAX_FAILURE_REASON_LENGTH
    ? singleLine
    : `${singleLine.slice(0, MAX_FAILURE_REASON_LENGTH)}… (truncated)`;
}

/**
 * The *shape* of a schema failure — how many issues, and where they are — never the values that
 * caused them.
 *
 * `ZodError.message` is the thing to avoid: it renders the whole tree, so 300 malformed placements
 * produce a single line of roughly 300,000 characters, and an unrecognised key is echoed verbatim
 * into it. That is both an amplification and a way to write forged lines into this application's
 * log. A path and a code carry everything a genuine client bug needs and nothing the caller chose.
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
