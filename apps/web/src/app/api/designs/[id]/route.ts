import {
  describeDesignValidationIssues,
  describeSchemaIssues,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  CurrentDesignSchema,
  MAX_DESIGN_BYTES,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";
import {
  isDesignRevision,
  type DesignRevision,
  type RequestVisitor,
  type SaveCredential,
  type SaveOutcome,
} from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import {
  designErrorResponse,
  designNotFoundResponse,
  invalidBodyResponse,
  payloadTooLargeResponse,
  PER_CREDENTIAL_HEADERS,
  revisionRequiredResponse,
  writeForbiddenResponse,
} from "@/lib/server/design-errors";
import {
  readUtf8BodyWithLimit,
  type BoundedBodyFailure,
} from "@/lib/server/read-body-with-limit";
import {
  editingAccountIdOf,
  readRequestDesignAccess,
} from "@/lib/server/account/design-reader";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { refusalOfReadLimit } from "@/lib/server/rate-limit/judge-read-request";
import { refusalOfSaveLimit } from "@/lib/server/rate-limit/judge-save-request";
import { getRepository } from "@/lib/server/repository";
import {
  refreshVisitorCookie,
  resolveRequestVisitor,
} from "@/lib/server/visitor";
import {
  hasWriteCredentialFor,
  readWriteTokenHash,
  refreshWriteTokenCookie,
} from "@/lib/server/write-token";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Either the design the body carried or the response that refuses it, tagged so a caller cannot
 *  forget which it holds. */
type ReadDesignOutcome =
  | { readonly ok: true; readonly design: Design }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * Where a save states the revision it edits. A header, not a body field: the body is the `Design`
 * document and `CurrentDesignSchema` is strict. Not `If-Match`: its failure is a `412` where this
 * route answers `409`, which the client's reload-or-overwrite choice is written against, and a proxy
 * or CDN may act on `If-Match`. A custom header is inert to every intermediary.
 */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/**
 * Gated to the owning browser or the owning account's session (ADR 0114 decision 5, ADR 0169 D9). A request
 * with neither a well-formed visitor cookie nor a client session, a foreign cookie, another account's session
 * and an unknown id are one outcome, `designNotFoundResponse`, so no branch here can tell a caller which it
 * hit; the first never reaches the repository.
 *
 * `canWrite` exists because the write-token cookie is `HttpOnly`: without it a panel could only learn
 * whether it may edit by attempting an edit (§9 rules out warn-after-click). It is true for a browser that
 * holds the design's write token, and for the session of the account that owns the design (never for a
 * session on a design the account does not own). Each is a credential `PUT`/`PATCH` accept (`saveCredentialOf`), and
 * the session's half is derived from the same `mayEdit` the save reads (`editingAccountIdOf`). It is a boolean; no token, hash or fragment leaves this
 * handler.
 *
 * It is advisory, never the authorisation decision. Nothing may be written on the strength of a
 * `canWrite` this route returned: `PUT`/`PATCH` make the hash part of `saveAuthorized`'s own `update`
 * predicate, and a check-then-write window is what ADR 0019 closes.
 *
 * Counted as a read first of all, before the cookie and before any lookup: a refusal is the same for an owner and a
 * stranger and says nothing of whether the design exists.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const limited = await refusalOfReadLimit(request.headers);
  if (limited) return limited;
  const { accessor, accountMayEdit } = await readRequestDesignAccess(
    request.cookies,
  );
  if (accessor === undefined) return designNotFoundResponse(id);

  try {
    const outcome = await getRepository().loadOwned({ id, accessor });
    if (outcome.kind === "none") return designNotFoundResponse(id);
    const canWriteAsAccount =
      accountMayEdit && outcome.isOwnedByAccount === true;
    return NextResponse.json(
      {
        id,
        design: outcome.design,
        revision: outcome.revision,
        canWrite:
          hasWriteCredentialFor(request.cookies, id) || canWriteAsAccount,
      },
      { headers: PER_CREDENTIAL_HEADERS },
    );
  } catch (error) {
    return designErrorResponse("load", error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  return saveDesign(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  return saveDesign(request, await params);
}

/**
 * Shared by `PUT` and `PATCH`: a save is a full replacement either way, and the body is the `Design`
 * document itself. A request with neither a write-token cookie for this design nor a session of an account that may
 * edit is refused before its body is read. One carrying either is still not trusted here: the credential goes to
 * `saveAuthorized`, part of the `update` predicate. There must be no verification step in this file; a check here
 * followed by a write there is the time-of-check/time-of-use window ADR 0019 rejects.
 */
async function saveDesign(
  request: NextRequest,
  { id }: { id: string },
): Promise<NextResponse> {
  const credential = await saveCredentialOf(request, id);
  if (credential === undefined) return writeForbiddenResponse();

  // After the credential check and before the body is read: an unauthorised caller must not be able
  // to tell this refusal from the 403.
  const expectedRevision = readExpectedRevision(request);
  if (expectedRevision === undefined) return revisionRequiredResponse();

  // Counted after the two refusals that are not, and before the body is read: a refusal reads no body, writes no row
  // and touches no cookie, and nothing of the limiter runs between the write and its answer.
  const limited = await refusalOfSaveLimit(request.headers, credential);
  if (limited) return limited;

  try {
    // Inside the try: `readDesign` is not expected to throw, but nothing above a `try` has a handler.
    const body = await readDesign(request);
    if (!body.ok) return body.response;

    const saved = await getRepository().saveAuthorized({
      id,
      design: body.design,
      credential,
      expectedRevision,
      requestVisitor: requestVisitorOf(request, credential),
    });

    const response = NextResponse.json({
      id: saved.id,
      revision: saved.revision,
    });
    if (credential.kind === "write-token") {
      refreshCookiesAfterTokenSave({ request, response }, id, saved);
    }
    return response;
  } catch (error) {
    return designErrorResponse("save", error);
  }
}

/**
 * The credential a save presents, or `undefined`. The write token, when the request carries one, exactly as before: the
 * session is not read, and nothing about this arm depends on whether there is one. Otherwise the session of an account
 * that may edit (ADR 0169 D9), and only for a request from this site, asked first: a cross-site request is answered as
 * one with no credential, so a sibling origin learns nothing from it and the session is not even read. Every cause of
 * "no credential" is the same `undefined`; whether the design is that account's is the repository's predicate to say.
 */
async function saveCredentialOf(
  request: NextRequest,
  id: string,
): Promise<SaveCredential | undefined> {
  const writeTokenHash = readWriteTokenHash(request, id);
  if (writeTokenHash !== undefined) {
    return { kind: "write-token", hash: writeTokenHash };
  }
  if (isCrossSiteRequest(request)) return undefined;
  const accountId = await editingAccountIdOf(request.cookies);
  return accountId === undefined ? undefined : { kind: "account", accountId };
}

const ABSENT_VISITOR: RequestVisitor = { kind: "absent" };

/** The visitor the token arm checks `ownsVisitor` against. The account arm names none: it refreshes no visitor cookie,
 *  so there is nothing to own. */
function requestVisitorOf(
  request: NextRequest,
  credential: SaveCredential,
): RequestVisitor {
  return credential.kind === "write-token"
    ? resolveRequestVisitor(request.cookies)
    : ABSENT_VISITOR;
}

/**
 * A token save keeps edit access and the visitor identity alive on the same clock. `refreshVisitorCookie`
 * re-emits only the request's own well-formed value and never mints one (no save changes ownership), and only when
 * `saved.ownsVisitor`, so a value another tab has rotated away is not re-emitted (ADR 0114 Amendment H3). A session
 * save never calls this: it sets no cookie at all.
 */
function refreshCookiesAfterTokenSave(
  context: { request: NextRequest; response: NextResponse },
  id: string,
  saved: SaveOutcome,
): void {
  refreshWriteTokenCookie(context, id);
  if (saved.ownsVisitor) refreshVisitorCookie(context);
}

/** The revision the caller claims to be editing, or `undefined`. Absent and malformed are one case on
 *  purpose: telling them apart would describe this route's parser to a caller. */
function readExpectedRevision(
  request: NextRequest,
): DesignRevision | undefined {
  const header = request.headers.get(EXPECTED_REVISION_HEADER);
  if (header === null || !isDesignRevision(header)) return undefined;
  return header;
}

/**
 * The `Design` the request body carries, or the response that refuses it. Three gates, in the order
 * their cost demands: the size gate reads the stream itself, so an oversized body is cut off rather
 * than parsed; then the parse, which throws on a truncated or empty body; then the executable
 * contract, since a document can pass `CurrentDesignSchema` and still name a body no catalogue entry
 * covers, which every reader of the shared link would then crash on.
 *
 * The client is told only that the payload was rejected, with a stable code, never why. Reasons are
 * logged as bounded shapes, not the body, which is attacker-supplied and unbounded.
 */
async function readDesign(request: NextRequest): Promise<ReadDesignOutcome> {
  const raw = await readUtf8BodyWithLimit(request.body, MAX_DESIGN_BYTES);
  if (!raw.ok) return { ok: false, response: refuseUnreadBody(raw.failure) };

  const parsed = parseJson(raw.value);
  if (!parsed.ok) {
    return {
      ok: false,
      response: invalidBodyResponse("request body was not parseable JSON"),
    };
  }

  const result = CurrentDesignSchema.safeParse(parsed.value);
  if (!result.success) {
    return {
      ok: false,
      response: invalidBodyResponse(describeSchemaIssues(result.error.issues)),
    };
  }
  return (
    refuseUnexecutableDesign(result.data) ?? {
      ok: true,
      design: result.data,
    }
  );
}

/** A body that never arrived, as a handled response: an oversized payload answers 413; a stream that
 *  broke mid-flight produced no document and answers 400, like truncated JSON. */
function refuseUnreadBody(failure: BoundedBodyFailure): NextResponse {
  return failure === "too-large"
    ? payloadTooLargeResponse()
    : invalidBodyResponse("request body stream failed before it completed");
}

/** The load path's validator, at the write seam: reject here, not on every later read. */
function refuseUnexecutableDesign(
  design: Design,
): { readonly ok: false; readonly response: NextResponse } | undefined {
  const issues = fatalDesignValidationIssues(
    validateDesignForCatalog(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    ),
  );
  if (issues.length === 0) return undefined;
  return {
    ok: false,
    response: invalidBodyResponse(describeDesignValidationIssues(issues)),
  };
}

/** `JSON.parse` as a value rather than a throw, so `readDesign` reads as three gates in a row. */
function parseJson(
  text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
