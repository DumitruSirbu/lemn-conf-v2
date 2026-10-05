import {
  DesignNotFoundError,
  InvalidDesignError,
} from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import { NextResponse } from "next/server";

import {
  reportDesignFailure,
  reportDesignRefusal,
  reportRejectedBody,
  reportUnreadableDesign,
  type DesignOperation,
  type DesignRefusal,
} from "@/lib/server/design-failure-log";

/** The public codes a rejected save answers with: stable, enumerable and free of detail from the rejected
 *  document. A client branches on these; the reason stays out of the response. */
const DESIGN_INVALID_CODE = "DESIGN_INVALID";
const PAYLOAD_TOO_LARGE_CODE = "PAYLOAD_TOO_LARGE";

/** A *stored* row could not be read. Distinct from `DESIGN_INVALID` (the caller's own payload): this is the
 *  server's problem, and the response says no more than that. */
const DESIGN_UNREADABLE_CODE = "DESIGN_UNREADABLE";

/** The caller is authorised and out of date (WEB-003). A distinct code because the client's answer
 *  is distinct: not "retry", not "give up", but "reload or overwrite deliberately". */
const REVISION_CONFLICT_CODE = "DESIGN_REVISION_CONFLICT";

/** The caller did not say which revision it was editing. Refused rather than defaulted: a save with no
 *  expectation is last-write-wins, which WEB-003 removed. */
const REVISION_REQUIRED_CODE = "REVISION_REQUIRED";

/**
 * The three refusals, each one value that the response status and the log line are both built from. The
 * log-only code for the 403 lives beside the response that deliberately carries none (`writeForbiddenResponse`).
 * All three are `save` operations: the load path answers only the owning browser and shares
 * `designNotFoundResponse`'s refusal with every other caller (ADR 0114 decision 5).
 */
const WRITE_FORBIDDEN: DesignRefusal = {
  code: "DESIGN_WRITE_FORBIDDEN",
  status: 403,
};
const WRITE_CONFLICT: DesignRefusal = {
  code: REVISION_CONFLICT_CODE,
  status: 409,
};
const REVISION_REQUIRED: DesignRefusal = {
  code: REVISION_REQUIRED_CODE,
  status: 400,
};

/**
 * Every header a per-credential response carries: `GET`'s 200 and `designNotFoundResponse`'s 404 depend on which
 * browser asked, so a cached copy would hand another visitor a different browser's design or refusal. No CDN caches
 * without an explicit public directive; this keeps that true if someone adds `s-maxage`. One constant, so the gate's
 * refusal and success cannot drift onto different header sets.
 */
export const PER_CREDENTIAL_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

/**
 * Maps a repository failure to a clean JSON error response. `InvalidDesignError` is a *stored* document that failed
 * migration or validation on load, so a 500 (unlike `invalidBodyResponse`, a bad incoming payload). Any other error
 * is a genuine bug: it is logged (`reportDesignFailure`) and rethrown, because the platform alone would answer 500
 * with a digest and no name (ADR 0096, Consequences).
 */
export function designErrorResponse(
  operation: DesignOperation,
  error: unknown,
): NextResponse {
  if (error instanceof DesignWriteForbiddenError) {
    return writeForbiddenResponse();
  }
  if (error instanceof DesignWriteConflictError) {
    return writeConflictResponse();
  }
  if (error instanceof DesignNotFoundError) {
    return notFoundResponseForMessage(error.message);
  }
  if (error instanceof InvalidDesignError) {
    return designUnreadableResponse(operation, error);
  }
  reportDesignFailure(operation, error);
  throw error;
}

/**
 * The one refusal every missing-credential, foreign-cookie and unknown-id path answers with: `GET
 * /api/designs/{id}`'s own 404, extracted so the share route's refusal is byte-identical to it. It carries
 * `PER_CREDENTIAL_HEADERS`, because a foreign cookie's refusal must never be cached and served to the owner. No
 * `Set-Cookie` at any refusal reaching here: a request never trusted must not be handed a fresh identity.
 */
export function designNotFoundResponse(id: DesignId): NextResponse {
  return notFoundResponseForMessage(new DesignNotFoundError(id).message);
}

function notFoundResponseForMessage(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 404, headers: PER_CREDENTIAL_HEADERS },
  );
}

/**
 * A response refusing to read a stored design and refusing to say what is wrong with it: a stored row is still
 * caller-influenced content, so the exception message would reflect it and the schema's shape to every holder of
 * the share link (as `invalidBodyResponse` refuses on the write path). The detail goes to the log through the same
 * bound and through `design-failure-log`, the only place a transport is chosen, so an error tracker sees every
 * designs-route line or none.
 */
function designUnreadableResponse(
  operation: DesignOperation,
  error: InvalidDesignError,
): NextResponse {
  reportUnreadableDesign(operation, error.message);
  return NextResponse.json(
    { code: DESIGN_UNREADABLE_CODE, error: "Design could not be loaded." },
    { status: 500 },
  );
}

/**
 * A write refused for want of a valid write token (ADR 0019 decision 1). One response for every cause (no cookie, a
 * token for a different design, an id no row carries): telling them apart would make the endpoint an existence
 * oracle for design ids. The message names no id or reason; the log names the refusal, since this response throws
 * nothing and an error tracker would otherwise never see it.
 */
export function writeForbiddenResponse(): NextResponse {
  reportDesignRefusal("save", WRITE_FORBIDDEN);
  return NextResponse.json(
    { error: "Design write not authorized." },
    { status: WRITE_FORBIDDEN.status },
  );
}

/**
 * A write refused because the design has moved on since the caller read it (WEB-003). It is produced only for a
 * caller whose write token already matched the row (`saveAuthorized` raises the error behind it); anyone else
 * gets the 403, so the 403/409 pair is not an oracle. It names no id, revision or reason: an overwrite re-reads
 * the revision, and a value quoted here would be stale before anyone acted on it.
 */
export function writeConflictResponse(): NextResponse {
  reportDesignRefusal("save", WRITE_CONFLICT);
  return NextResponse.json(
    {
      code: REVISION_CONFLICT_CODE,
      error: "Design changed since it was loaded.",
    },
    { status: WRITE_CONFLICT.status },
  );
}

/**
 * A save that carried no usable expected revision: a 400, not a 409, because the request is wrong and the stored
 * design is not. Returned after the credential check, so it cannot probe which ids exist. It is logged: the
 * amplification rule forbids a log line whose size depends on an attacker-supplied body, and this is a
 * fixed-size record of an operation and a code, so a client stuck sending saves with no revision is visible.
 */
export function revisionRequiredResponse(): NextResponse {
  reportDesignRefusal("save", REVISION_REQUIRED);
  return NextResponse.json(
    {
      code: REVISION_REQUIRED_CODE,
      error: "Design save must state the revision it edits.",
    },
    { status: REVISION_REQUIRED.status },
  );
}

/**
 * The incoming save payload failed `DesignSchema` validation: the client's fault, hence 400. The reason is logged,
 * never returned: a Zod error tree hands a caller the document shape to craft a valid one. The log line is bounded
 * by `boundedFailureReason` (applied in `reportRejectedBody`) because this is the one path a caller can drive with
 * an arbitrary body, and its log line must not scale with that body's size.
 */
export function invalidBodyResponse(reason: string): NextResponse {
  reportRejectedBody(reason);
  return NextResponse.json(
    { code: DESIGN_INVALID_CODE, error: "Design payload failed validation." },
    { status: 400 },
  );
}

/**
 * The request body crossed `MAX_DESIGN_BYTES` (SEC-002). A 413, not a 400, because size is the complaint and
 * nothing was parsed: the stream was cut at the first chunk that crossed the line. Nothing is logged: a log
 * line per refusal is the amplification the byte limit exists to remove.
 */
export function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { code: PAYLOAD_TOO_LARGE_CODE, error: "Design payload too large." },
    { status: 413 },
  );
}
