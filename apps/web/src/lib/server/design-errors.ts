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

/** The two public codes a rejected save answers with. Stable, enumerable, and free of any detail
 *  from the rejected document — a client branches on these, and ADR 0014 S2 keeps the *reason* out
 *  of the response entirely. */
const DESIGN_INVALID_CODE = "DESIGN_INVALID";
const PAYLOAD_TOO_LARGE_CODE = "PAYLOAD_TOO_LARGE";

/** A *stored* row could not be read. Distinct from `DESIGN_INVALID`, which is the caller's own
 *  payload being refused: this one is the server's problem and the caller can do nothing about it,
 *  which is exactly why the response must say no more than that. */
const DESIGN_UNREADABLE_CODE = "DESIGN_UNREADABLE";

/** The caller is authorised and out of date (WEB-003). A distinct code because the client's answer
 *  is distinct: not "retry", not "give up", but "reload or overwrite deliberately". */
const REVISION_CONFLICT_CODE = "DESIGN_REVISION_CONFLICT";

/** The caller did not say which revision it was editing, so there is nothing to enforce the write
 *  against. Refused rather than defaulted: a save with no expectation is exactly the last-write-wins
 *  behaviour WEB-003 removed. */
const REVISION_REQUIRED_CODE = "REVISION_REQUIRED";

/**
 * The three refusals, each as one value the response's status and the log line are both built from.
 *
 * The status literal appears once per refusal rather than twice, and the log-only code for the 403
 * lives beside the response that deliberately carries none — so a reader can see at a glance that
 * the two disagree on purpose (`writeForbiddenResponse` explains why the response says nothing).
 *
 * All three are `save` operations by construction: the load path, since M7 wave 7E3b (ADR 0114
 * decision 5), answers only the owning browser and shares `designNotFoundResponse`'s refusal with
 * every other caller — never one of these three.
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
 * Every header a **per-credential** response carries (M7 wave 7E3b D4) — `GET`'s 200 body and
 * `designNotFoundResponse`'s 404 both depend on which browser asked, so a cached copy served to a
 * second visitor would hand them another browser's design, or another browser's refusal cached as
 * if it applied to everyone. Reading the request's cookies already opts a route out of static
 * rendering, and no CDN caches a response without an explicit public directive — this is what keeps
 * that true the day someone adds `s-maxage` to a route whose payload looks public. Exported as the
 * one constant rather than two copies, so the gate's refusal and its success can never drift onto
 * different header sets.
 */
export const PER_CREDENTIAL_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

/**
 * Maps a repository failure to a clean JSON error response. `InvalidDesignError` here means a
 * *stored* document failed migration/validation on load — the client didn't cause it, so this is
 * a 500, unlike `invalidBodyResponse` below, which is for a bad incoming payload on save. Any
 * other error is a genuine bug, not a domain failure, so it is rethrown rather than masked.
 *
 * **The rethrow is announced before it happens.** Rethrowing hands the error to the platform, which
 * answers 500 with a digest and no name — the state that made the 2026-09-07 outage take a database
 * query to diagnose rather than a log line (ADR 0096, Consequences). The throw is unchanged; only
 * the record of it is new, and it names the operation, the error and a bounded reason without
 * touching the response.
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
 * The one refusal every missing-credential, foreign-cookie and unknown-id path answers with (M7
 * wave 7E3c D4, wave 7E3b D4/H2): `GET /api/designs/{id}`'s own 404 for every refusal case,
 * extracted so the share route's refusal is provably byte-identical to it rather than merely
 * written to look the same. Constructs `DesignNotFoundError` for its message alone — the same class
 * `designErrorResponse`'s own branch above now goes through — so the two can never drift apart.
 *
 * **Carries `PER_CREDENTIAL_HEADERS` since wave 7E3b** (`Cache-Control: private, no-store`,
 * `Vary: Cookie`): the answer now depends on which browser asked — a foreign cookie's refusal must
 * never be cached and served back to the owner, or to a different stranger. No `Set-Cookie`, either
 * here or at any refusal case that reaches this function: a request this wave never trusted must
 * never be handed a fresh identity on the strength of asking for someone else's design.
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
 * A response refusing to read a stored design, and refusing to say what is wrong with it.
 *
 * The reason is never returned. A stored row is **still caller-influenced content** — its owner
 * wrote it through the save endpoint — so returning the exception message would reflect that
 * content, and the internal schema's shape, to every holder of the share link. That is the same
 * disclosure `invalidBodyResponse` refuses to make on the write path (ADR 0014 finding S2), and the
 * load path is held to the same rule.
 *
 * The detail goes to the log through the same bound the write side uses, so one unreadable row
 * cannot write a log line proportional to its own size.
 *
 * **It is announced through `design-failure-log` rather than through `console` directly.** That
 * module is the only place a transport is chosen, so an error tracker dropped behind
 * `emitDesignLogLine` sees every designs-route line or none — a straggler here would have been
 * invisible to it while looking, in the source, exactly as logged as its neighbours.
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
 * A write refused for want of a valid write token (ADR 0019 decision 1).
 *
 * One response for every refusal, whatever caused it: no cookie, a token belonging to a different
 * design, or an id no row carries. Distinguishing them would make the write endpoint an existence
 * oracle for design ids — 404 for unknown and 403 for known would let anyone enumerate which links
 * are real, which is exactly the disclosure `load`'s 404 is safe to make and a write's must not be.
 * The message names no id and no reason.
 *
 * The *log* names the refusal, because this response throws nothing and an error tracker would
 * therefore never see it. That asymmetry is deliberate and is ADR 0014 finding S2 working as
 * intended: the server may know why, the client may not.
 */
export function writeForbiddenResponse(): NextResponse {
  reportDesignRefusal("save", WRITE_FORBIDDEN);
  return NextResponse.json(
    { error: "Design write not authorized." },
    { status: WRITE_FORBIDDEN.status },
  );
}

/**
 * A write refused because the design has moved on since the caller read it (WEB-003).
 *
 * **This response is only ever produced for a caller whose write token already matched the row**,
 * because that is the only way `saveAuthorized` raises the error behind it. Anyone else — a wrong
 * token, a token for another design, an id no row carries — gets the same 403 as before, whatever
 * revision they claim. So the pair 403/409 is not an oracle: telling them apart requires having
 * already proved you may write the design, and reveals nothing to a party who has not.
 *
 * It names no id, no revision and no reason, for the reason `writeForbiddenResponse` names none.
 * The client does not need the current revision from here — an overwrite re-reads it, and a value
 * quoted in this response would already be stale by the time anyone acted on it.
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
 * A save that carried no usable expected revision.
 *
 * A 400 rather than a 409: nothing about the stored design is wrong, the request is.
 *
 * It is returned **after** the credential check, so it is unreachable without a cookie for this
 * design and cannot be used to probe which ids exist.
 *
 * **It is logged, where it once was not.** The earlier reasoning — that a caller controls how often
 * it can drive this path — was the amplification rule `invalidBodyResponse` is written against, and
 * it does not reach this line: what that rule forbids is a log line whose *size* is a function of
 * an attacker-supplied body, and this one is a fixed-size record of an operation and a code with
 * nothing of the caller's in it. A client stuck sending saves with no revision header is a real
 * client bug that answered 400 silently for as long as it lasted.
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
 * The incoming save payload failed `DesignSchema` validation — the client's fault, hence 400.
 *
 * The reason is logged, never returned. A Zod error tree names every expected type and failing
 * path, which hands a caller the exact document shape to craft a valid one — see ADR 0014 finding
 * S2. A client needs to know its payload was rejected, not how the schema is built.
 *
 * What reaches the log goes through `boundedFailureReason`, the domain's single bound (review
 * finding F3 — this module used to carry a second copy of it). A rejection is the one path a caller
 * can drive with an arbitrary body, so its log line must not be a function of that body's size or
 * contents: an unbounded one buys a large heap allocation, Active CPU and a large log write for one
 * cheap request, on a free tier with hard caps. The bound moved into `reportRejectedBody` with the
 * line itself; it is the same `boundedFailureReason` call, made one module over.
 */
export function invalidBodyResponse(reason: string): NextResponse {
  reportRejectedBody(reason);
  return NextResponse.json(
    { code: DESIGN_INVALID_CODE, error: "Design payload failed validation." },
    { status: 400 },
  );
}

/**
 * The request body crossed `MAX_DESIGN_BYTES` (SEC-002). A 413 rather than a 400 because the
 * payload's *size* is the complaint and nothing was parsed — the stream was cut at the first chunk
 * that crossed the line, so this handler never saw the rest of it.
 *
 * Nothing is logged. The caller controls how often it can drive this path and how large the body
 * is, and a log line per refusal is the amplification the byte limit exists to remove.
 */
export function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { code: PAYLOAD_TOO_LARGE_CODE, error: "Design payload too large." },
    { status: 413 },
  );
}
