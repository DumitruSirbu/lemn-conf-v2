import {
  DesignNotFoundError,
  InvalidDesignError,
} from "@lemnaria/configurator-domain";
import { DesignWriteForbiddenError } from "@lemnaria/persistence";
import { NextResponse } from "next/server";

/** How much of a schema failure is worth logging. Both caps exist so the cost of a rejection is a
 *  constant, never a function of the request body a caller controls. */
const MAX_LOGGED_ISSUES = 10;
const MAX_LOGGED_REASON_LENGTH = 300;

/** The part of a Zod issue this module reads, declared structurally so `apps/web` takes no direct
 *  dependency on zod for the sake of a log line. */
interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly code: string;
}

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  throw error;
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
 * What reaches the log is bounded here as well as at the call site. A rejection is the one path a
 * caller can drive with an arbitrary body, so its log line must not be a function of that body's
 * size or contents: an unbounded one buys a large heap allocation, Active CPU and a large log write
 * for one cheap request, on a free tier with hard caps.
 */
export function invalidBodyResponse(reason: string): NextResponse {
  console.warn("[designs] rejected an invalid payload:", boundedForLog(reason));
  return NextResponse.json(
    { error: "Design payload failed validation." },
    { status: 400 },
  );
}

/**
 * The *shape* of a schema failure — how many issues, and where they are — never the values that
 * caused them.
 *
 * `error.message` is the thing to avoid: it renders the whole tree, so 300 malformed placements
 * produce a single log line of roughly 300,000 characters, and an unrecognised key is echoed
 * verbatim into it. That is both the amplification above and a way for a caller to write forged
 * lines into this application's log. A path and a code carry everything a genuine client bug needs
 * and nothing the caller chose.
 */
export function describeSchemaFailure(issues: readonly SchemaIssue[]): string {
  const shown = issues
    .slice(0, MAX_LOGGED_ISSUES)
    .map((issue) => `${pathOf(issue)}:${issue.code}`);
  const omitted = issues.length - shown.length;
  const summary = `${String(issues.length)} issue(s): ${shown.join(", ")}`;

  return omitted > 0 ? `${summary} (+${String(omitted)} more)` : summary;
}

function pathOf(issue: SchemaIssue): string {
  const segments = issue.path.map((segment) => String(segment));
  return segments.length === 0 ? "(root)" : segments.join(".");
}

/** The last line of defence before a string reaches the log: no control characters, so nothing can
 *  forge a log line, and a hard cap, so nothing can flood one. */
function boundedForLog(reason: string): string {
  const singleLine = reason.replace(/[\p{Cc}\p{Cf}]/gu, " ");
  return singleLine.length <= MAX_LOGGED_REASON_LENGTH
    ? singleLine
    : `${singleLine.slice(0, MAX_LOGGED_REASON_LENGTH)}… (truncated)`;
}
