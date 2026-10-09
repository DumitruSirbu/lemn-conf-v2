/**
 * The one seam every designs-route failure and refusal is announced through (ADR 0096, Consequences): a driver
 * failure otherwise reaches the platform as an unlabelled 500 with only a Next digest. Refusals are logged too: a
 * 403, a 409 or a 400 throws nothing, so an error tracker alone is blind to them.
 *
 * It writes to no response, and every function is a command returning nothing, so a call site cannot put what it
 * logged into a body (ADR 0014 finding S2). Never in a line: the design document, a write token or cookie value,
 * a connection string (`docs/best-practices/environments-and-resources.md`). The document and token are excluded
 * structurally, as this module is never handed either; the connection string by redaction, since an error's own
 * message can carry endpoint detail.
 *
 * `emitDesignLogLine` is the only place a transport is chosen, and the one most likely to throw once it is not
 * `console`, so the write is guarded as well as the reads (`writeOrNothing`).
 */

import { boundedFailureReason } from "@lemnaria/configurator-domain";

import type { UnavailableCause } from "@/lib/server/rate-limit/enforce-rate-limit";
import { E2E_RATE_LIMIT_POLICY_FLAG } from "@/lib/server/rate-limit/limit-policy";
import {
  MINT_UNAVAILABLE_CODE,
  MINT_UNAVAILABLE_STATUS,
} from "@/lib/server/rate-limit/rate-limited-response";
import {
  MINT_LIMIT_REACHED_CODE,
  MINT_LIMIT_REACHED_STATUS,
} from "@/persistence/design-request-errors";

/** Which handler the line came from, not the HTTP method: `PUT` and `PATCH` are one operation, and
 *  `POST /api/designs` is `mint` rather than a second `save`. `resume` is the visitor-hash lookup the locale pages
 *  run before answering; its one line, on a driver failure only, carries no value, hash or id. The `share-*`
 *  operations are named for what they authorise, not the verb. `share-read` is the share view's read of an issued
 *  link, named apart from `load` because its line must carry no id. */
export type DesignOperation =
  | "load"
  | "mint"
  | "resume"
  | "save"
  | "share-issue"
  | "share-revoke"
  | "share-status"
  | "share-read";

/** A refusal as the server sees it. `code` is a log-only label for the 403, whose response carries no code: one
 *  answer for every write refusal keeps the route from being an existence oracle for design ids. */
export interface DesignRefusal {
  readonly code: string;
  readonly status: number;
}

/** Substituted for the field when the thrown value carries nothing usable there. A named absence
 *  rather than an omitted key, so a log search for `errorCode` matches every line. */
const UNAVAILABLE = "unavailable";

/** A URL in a failure message is overwhelmingly likely to be a connection string (a driver's connect failures carry
 *  the endpoint), so it is redacted before the bound rather than hoped to fall outside it (ADR 0008). Where one
 *  begins, the rest of the text goes with it: a credential can hold whitespace, and a pattern that ends at the
 *  first space leaves the tail of the password in the line. */
const URL_START = /\b[a-z][a-z0-9+.-]*:\/\//i;

const REDACTED_URL = "<redacted url>";

/**
 * An error that reached the route with no domain meaning. Called at the rethrow: the throw still happens, so the
 * platform's own 500 and digest are unchanged, and this line makes the digest resolvable.
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
 * A refusal the server produced deliberately: a warning, since a changed refusal rate is the signal. The line is a
 * fixed size and carries nothing the caller chose, so it cannot amplify a log write.
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

/** What the mint limiter's two answers log: the policy that refused, or the cause that made a judgement impossible.
 *  Nothing else: no address, block, subject, key, count or header value ever reaches the line. */
export type MintLimitLine =
  | { readonly kind: "refused"; readonly policy: string }
  | { readonly kind: "unavailable"; readonly cause: UnavailableCause };

export function reportMintLimit(line: MintLimitLine): void {
  if (line.kind === "refused") {
    emitDesignLogLine("warn", {
      event: "design-operation-refused",
      operation: "mint",
      refusalCode: MINT_LIMIT_REACHED_CODE,
      status: MINT_LIMIT_REACHED_STATUS,
      policy: line.policy,
    });
    return;
  }
  emitDesignLogLine("error", {
    event: "design-operation-unavailable",
    operation: "mint",
    refusalCode: MINT_UNAVAILABLE_CODE,
    status: MINT_UNAVAILABLE_STATUS,
    cause: line.cause,
  });
}

/** The one line the e2e policy writes, made from the flag's own name: its figure is not the production one. */
export const E2E_MINT_POLICY_NOTICE =
  `rate limit: the e2e policy is in use (${E2E_RATE_LIMIT_POLICY_FLAG}); ` +
  "the day's figure is not the production one";

let hasAnnouncedE2eMintPolicy = false;

/** Written once in a process, when the e2e policy first decides a request. */
export function reportE2eMintPolicyInUse(): void {
  if (hasAnnouncedE2eMintPolicy) return;
  hasAnnouncedE2eMintPolicy = true;
  emitDesignLogLine("warn", {
    event: "rate-limit-policy-notice",
    message: E2E_MINT_POLICY_NOTICE,
  });
}

/**
 * A stored row that would not validate on the way out: the server's problem, so the response says only that the
 * design could not be loaded. The operation is a parameter because `designErrorResponse` maps this failure on both
 * paths, and a fixed `load` would mislabel the field a log search filters on.
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
 * An incoming save payload refused by the schema, a warning as in `reportDesignRefusal`. The one line a caller can
 * drive with a body it wrote, so `safeText`'s bound is what stops one cheap request buying a large log write.
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
 * The only transport choice in this module: `console` with a structured second argument, which is what the
 * platform captures and a log drain parses. An error tracker replaces this function's body.
 */
function emitDesignLogLine(
  severity: "warn" | "error",
  line: Readonly<Record<string, string | number>>,
): void {
  const write = severity === "error" ? console.error : console.warn;
  writeOrNothing(write, line);
}

/** What the transport is, structurally: a label and a line, and no answer. */
type DesignLogTransport = (
  label: string,
  line: Readonly<Record<string, string | number>>,
) => void;

/**
 * The write may not throw, as no read in this module may (see `readPropertyOrNothing`): a diagnostic that can fail
 * replaces the error it exists to explain. Without the guard a throwing transport would make `designErrorResponse`
 * lose the `NeonDbError`, and the 403 and 400 helpers throw where they owe a response. Silent by necessity: the
 * only thing left to report a failed report with is the transport that just failed.
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
 * Every read of a thrown value goes through here, and none may throw: a diagnostic that can fail replaces the error
 * it exists to explain. `name`, `code` and `message` are ordinary properties, but a thrown value this application
 * did not construct may define any of them as a throwing getter or a non-string.
 */
function readPropertyOrNothing(error: unknown, property: string): unknown {
  try {
    return (error as Record<string, unknown> | null | undefined)?.[property];
  } catch {
    return undefined;
  }
}

/** The name every `Error` answers to when its own `name` is unreadable or not a string; a named absence would read
 *  as an error type that does not exist. */
const UNNAMED_ERROR = "Error";

function errorNameOf(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const name = readPropertyOrNothing(error, "name");
  return typeof name === "string" ? name : UNNAMED_ERROR;
}

/** `NeonDbError` carries the SQLSTATE here, such as `42703` for an undefined column: the most diagnostic field. */
function errorCodeOf(error: unknown): string {
  const code = readPropertyOrNothing(error, "code");
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : UNAVAILABLE;
}

/**
 * Redacted first and bounded second: bounding truncates, and truncating a connection string leaves the half that
 * carries the credential. Only a real `Error` is quoted: a plain object with a `message` has no provenance, and
 * quoting it would let anything that reaches a `throw` choose what this application logs. Name and code are still
 * reported.
 */
function safeReasonOf(error: unknown): string {
  if (!(error instanceof Error)) return UNAVAILABLE;
  const message = readPropertyOrNothing(error, "message");
  if (typeof message !== "string") return UNAVAILABLE;
  return safeText(message);
}

/** Redacted first and bounded second, for every free-text field this module writes: one function, so the ordering
 *  is stated once. */
function safeText(message: string): string {
  return boundedFailureReason(redactFromFirstUrl(message));
}

function redactFromFirstUrl(text: string): string {
  const urlStart = URL_START.exec(text);
  return urlStart === null
    ? text
    : `${text.slice(0, urlStart.index)}${REDACTED_URL}`;
}
