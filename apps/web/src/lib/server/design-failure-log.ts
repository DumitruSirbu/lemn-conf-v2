/**
 * The one seam every designs-route failure and refusal is announced through.
 *
 * It exists because of what the 2026-09-07 incident cost to diagnose. `designErrorResponse`
 * rethrows any non-domain error, so a driver failure reached the platform as an unlabelled 500 with
 * a Next digest and nothing else — and answering "why is production not saving?" took a read of the
 * production database rather than a read of a log line. A `NeonDbError` naming a missing column
 * would have said it on the first failed save (ADR 0096, Consequences).
 *
 * **The refusals are logged too, and that is not optional.** Several of the candidate causes ranked
 * during that diagnosis produce ordinary responses — a 403, a 409, a 400 — and throw nothing at
 * all, so an error tracker alone is blind to every one of them. What told the candidates apart in
 * the end was which notice the customer saw; a counted refusal would have answered it from the
 * server.
 *
 * **ADR 0014 finding S2 is untouched: the log gains detail, the client does not.** Nothing here
 * writes to a response. Every function is a command that returns nothing, so a call site cannot
 * accidentally put what it logged into a body.
 *
 * **What may never appear in a line here**, and why it is bounded rather than trusted
 * (`docs/best-practices/environments-and-resources.md`): the design document, a write token or
 * cookie value, and a connection string. The document and the token are excluded structurally —
 * this module is never handed either. The connection string is excluded by redaction, because the
 * one field that comes from outside, an error's own message, is written by a driver whose connect
 * failures carry endpoint detail.
 *
 * **The error-tracker seam.** `emitDesignLogLine` is the only place a transport is chosen. Wiring
 * Sentry or an equivalent later is a change to that one function; no call site, no field and no
 * bound moves. Nothing is installed today — an SDK needs a DSN and an account decision that are the
 * owner's. **And it is the one function most likely to throw once it is not `console`**, which is
 * why the write is guarded as well as the reads (`writeOrNothing`).
 */

import { boundedFailureReason } from "@lemnaria/configurator-domain";

/** Which handler the line came from. It is not the HTTP method — `PUT` and `PATCH` are one
 *  operation here, and `POST /api/designs` is `mint` rather than a second `save`.
 *
 *  **`mint` is the operation the 2026-09-07 outage was failing on**, and until wave W4 it was the one
 *  handler with no `try`/`catch` at all: a driver failure there reached the platform as a digest and
 *  nothing else, which is the exact blindness this module exists to remove (ADR 0096, Consequences).
 *
 *  **`resume`, since M7 wave 7E3a S3**, is the visitor-hash lookup `/[locale]` and
 *  `/[locale]/configurator/configure` run before either answers. D3 requires exactly one line here,
 *  on a driver failure only, carrying no value, hash or id — `reportDesignFailure`'s own fields
 *  already exclude all three structurally, the same guarantee `mint`'s failures rely on.
 *
 *  **`share-issue`, `share-revoke` and `share-status`, since M7 wave 7E3c S3b**, are
 *  `api/designs/[id]/share/route.ts`'s three methods — named for what they authorise, not for the
 *  HTTP verb, the same choice `mint`/`save` already make. **`share-read`**, added here for S4's own
 *  use, is the share view's read of an already-issued link; criterion 15 requires its line to carry
 *  no id, unlike every other operation's driver-failure line, which is why it is named apart from
 *  `load` despite reading the same table. */
export type DesignOperation =
  | "load"
  | "mint"
  | "resume"
  | "save"
  | "share-issue"
  | "share-revoke"
  | "share-status"
  | "share-read";

/** A refusal, as the server sees it. `code` is a log-only label for the 403, whose *response*
 *  deliberately carries no code at all: one answer for every write refusal is what stops the route
 *  being an existence oracle for design ids, and that property is a response property, not a
 *  logging one. */
export interface DesignRefusal {
  readonly code: string;
  readonly status: number;
}

/** Substituted for the field when the thrown value carries nothing usable there. A named absence
 *  rather than an omitted key, so a log search for `errorCode` matches every line. */
const UNAVAILABLE = "unavailable";

/** A URL in a failure message is, on this project, overwhelmingly likely to be a connection string:
 *  Postgres's own error messages carry none, and the driver's connect failures carry the endpoint.
 *  ADR 0008's incident is a credential already printed into a transcript once, so this is redacted
 *  before the bound rather than hoped to fall outside it. */
const URL_SHAPED = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;

const REDACTED_URL = "<redacted url>";

/**
 * An error that reached the route with no domain meaning — a driver failure, a bug, a broken
 * assumption. Called at the rethrow: the throw still happens, so the platform's own 500 and its
 * digest are unchanged, and this line is what makes the digest resolvable.
 */
export function reportDesignFailure(
  operation: DesignOperation,
  error: unknown,
): void {
  emitDesignLogLine("error", {
    event: "design-operation-failed",
    operation,
    errorName: errorNameOf(error),
    errorCode: errorCodeOf(error),
    reason: safeReasonOf(error),
  });
}

/**
 * A refusal the server produced deliberately. A warning rather than an error: nothing is broken,
 * and a refusal rate that changes is the signal.
 *
 * The line is a constant size and carries nothing the caller chose, so the amplification this
 * module's neighbours are careful about does not apply: the cost of one refusal is one fixed line,
 * not a line proportional to a body someone else wrote.
 */
export function reportDesignRefusal(
  operation: DesignOperation,
  refusal: DesignRefusal,
): void {
  emitDesignLogLine("warn", {
    event: "design-operation-refused",
    operation,
    refusalCode: refusal.code,
    status: refusal.status,
  });
}

/**
 * A **stored** row that would not validate on the way out — the server's problem, not the caller's,
 * which is why the response it accompanies says only that the design could not be loaded.
 *
 * The operation is a parameter rather than a constant: `designErrorResponse` maps this failure on
 * both of its paths, and a line that claimed `load` for a row a save could not read back would
 * mislabel the one field a log search filters on.
 */
export function reportUnreadableDesign(
  operation: DesignOperation,
  reason: string,
): void {
  emitDesignLogLine("error", {
    event: "design-row-unreadable",
    operation,
    reason: safeText(reason),
  });
}

/**
 * An incoming save payload refused by the schema. A warning rather than an error, for the reason
 * `reportDesignRefusal` gives: nothing is broken, and it is the rate that is the signal.
 *
 * **This is the one line a caller can drive with a body it wrote**, so `safeText`'s bound is what
 * stops one cheap request buying a large log write on a free tier with hard caps — the rule
 * `invalidBodyResponse` is written against, carried through unchanged.
 */
export function reportRejectedBody(reason: string): void {
  emitDesignLogLine("warn", {
    event: "design-payload-rejected",
    // Only the write path validates an incoming body; the load path parses nothing a caller sent.
    operation: "save",
    reason: safeText(reason),
  });
}

/**
 * The only transport choice in this module.
 *
 * `console` and a structured second argument, because that is what the current platform captures
 * and what a log drain can parse. An error tracker replaces the body of this function; the shape of
 * what it is handed is already the shape a tracker wants.
 */
function emitDesignLogLine(
  severity: "warn" | "error",
  line: Readonly<Record<string, string | number>>,
): void {
  const write = severity === "error" ? console.error : console.warn;
  writeOrNothing(write, line);
}

/** What the transport is, structurally: a label and a line, and no answer. Declared so the guard
 *  below takes a value rather than reaching back into `console`. */
type DesignLogTransport = (
  label: string,
  line: Readonly<Record<string, string | number>>,
) => void;

/**
 * **The write may not throw, for the reason every read in this module may not** (see
 * `readPropertyOrNothing`): a diagnostic that can fail replaces the error it exists to explain.
 *
 * The reads were guarded and the write was not, and the write is the half that will stop being
 * `console`. Measured before this guard: with a transport that throws, `designErrorResponse("save",
 * neonError)` threw *the logger's* error and lost the `NeonDbError` and its `42703`, and
 * `writeForbiddenResponse()` and `invalidBodyResponse()` threw where they owe a 403 and a 400 — a
 * customer losing a save because a log drain is down.
 *
 * **Silent, and it must be**: the only thing left to report a failed report with is the transport
 * that just failed, so a second write is the same defect with one more frame on it.
 */
function writeOrNothing(
  write: DesignLogTransport,
  line: Readonly<Record<string, string | number>>,
): void {
  try {
    write(DESIGN_LOG_LABEL, line);
  } catch {
    // See above: nothing to fall back to, and nothing may escape.
  }
}

/** Grepped for in a platform log view, so it is one literal and not assembled. */
const DESIGN_LOG_LABEL = "[designs]";

/**
 * Every read of a thrown value goes through here, and none of them may throw.
 *
 * **A diagnostic that can fail replaces the error it exists to explain.** No line is written, and
 * the platform records a failure inside the logger instead of the driver failure that caused it —
 * which is worse than the unlabelled 500 this module was built to fix, because it also hides the
 * original. `name`, `code` and `message` are ordinary properties: a thrown value may define any of
 * them as a throwing getter or as a non-string, and the value arriving here is by definition one
 * this application did not construct.
 */
function readPropertyOrNothing(error: unknown, property: string): unknown {
  try {
    return (error as Record<string, unknown> | null | undefined)?.[property];
  } catch {
    return undefined;
  }
}

/** The name every `Error` is guaranteed to answer to when its own `name` is unreadable or is not a
 *  string — a named absence would read as a error type that does not exist. */
const UNNAMED_ERROR = "Error";

function errorNameOf(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const name = readPropertyOrNothing(error, "name");
  return typeof name === "string" ? name : UNNAMED_ERROR;
}

/** `NeonDbError` carries the SQLSTATE here — `42703` for the undefined column that caused the
 *  2026-09-07 outage — which is the single most diagnostic field on the line. */
function errorCodeOf(error: unknown): string {
  const code = readPropertyOrNothing(error, "code");
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : UNAVAILABLE;
}

/**
 * Redacted first and bounded second: bounding truncates, and truncating a connection string leaves
 * the half that carries the credential.
 *
 * Only a real `Error` is quoted. A plain object that merely carries a `message` is not something
 * any part of this application threw, so the string it offers has no provenance at all — quoting it
 * would let anything that reaches a `throw` choose what this application writes to its own log.
 * Its name and code are still reported; only the free-text field is withheld.
 */
function safeReasonOf(error: unknown): string {
  if (!(error instanceof Error)) return UNAVAILABLE;
  const message = readPropertyOrNothing(error, "message");
  if (typeof message !== "string") return UNAVAILABLE;
  return safeText(message);
}

/** Redacted first and bounded second, for every free-text field this module writes. One function
 *  rather than one per reporter, so the ordering argument above is made once and cannot be got
 *  wrong by the next line that needs it. */
function safeText(message: string): string {
  return boundedFailureReason(message.replace(URL_SHAPED, REDACTED_URL));
}
