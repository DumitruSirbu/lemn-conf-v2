import {
  boundedFailureReason,
  DesignNotFoundError,
  InvalidDesignError,
} from "@lemnaria/configurator-domain";
import { DesignWriteForbiddenError } from "@lemnaria/persistence";
import { NextResponse } from "next/server";

/** The two public codes a rejected save answers with. Stable, enumerable, and free of any detail
 *  from the rejected document — a client branches on these, and ADR 0014 S2 keeps the *reason* out
 *  of the response entirely. */
const DESIGN_INVALID_CODE = "DESIGN_INVALID";
const PAYLOAD_TOO_LARGE_CODE = "PAYLOAD_TOO_LARGE";

/** A *stored* row could not be read. Distinct from `DESIGN_INVALID`, which is the caller's own
 *  payload being refused: this one is the server's problem and the caller can do nothing about it,
 *  which is exactly why the response must say no more than that. */
const DESIGN_UNREADABLE_CODE = "DESIGN_UNREADABLE";

/** Maps a repository failure to a clean JSON error response. `InvalidDesignError` here means a
 *  *stored* document failed migration/validation on load — the client didn't cause it, so this is
 *  a 500, unlike `invalidBodyResponse` below, which is for a bad incoming payload on save. Any
 *  other error is a genuine bug, not a domain failure, so it is rethrown rather than masked. */
export function designErrorResponse(error: unknown): NextResponse {
  if (error instanceof DesignWriteForbiddenError) {
    return writeForbiddenResponse();
  }
  if (error instanceof DesignNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidDesignError) {
    return designUnreadableResponse(error);
  }
  throw error;
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
 */
function designUnreadableResponse(error: InvalidDesignError): NextResponse {
  console.error(
    "[designs] a stored design failed validation on load:",
    boundedFailureReason(error.message),
  );
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
 */
export function writeForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { error: "Design write not authorized." },
    { status: 403 },
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
 * cheap request, on a free tier with hard caps.
 */
export function invalidBodyResponse(reason: string): NextResponse {
  console.warn(
    "[designs] rejected an invalid payload:",
    boundedFailureReason(reason),
  );
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
