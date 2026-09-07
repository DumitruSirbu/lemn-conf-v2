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
 * owner's.
 */

import { boundedFailureReason } from "@lemnaria/configurator-domain";

/** Which handler the line came from. Two, because the route has two: an open read and an authorised
 *  write. It is not the HTTP method — `PUT` and `PATCH` are one operation here. */
export type DesignOperation = "load" | "save";

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
  write(DESIGN_LOG_LABEL, line);
}

/** Grepped for in a platform log view, so it is one literal and not assembled. */
const DESIGN_LOG_LABEL = "[designs]";

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** `NeonDbError` carries the SQLSTATE here — `42703` for the undefined column that caused the
 *  2026-09-07 outage — which is the single most diagnostic field on the line. */
function errorCodeOf(error: unknown): string {
  const code: unknown = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : UNAVAILABLE;
}

/** Redacted first and bounded second: bounding truncates, and truncating a connection string leaves
 *  the half that carries the credential. */
function safeReasonOf(error: unknown): string {
  if (!(error instanceof Error)) return UNAVAILABLE;
  return boundedFailureReason(error.message.replace(URL_SHAPED, REDACTED_URL));
}
