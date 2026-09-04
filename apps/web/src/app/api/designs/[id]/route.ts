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
import { isDesignRevision, type DesignRevision } from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import {
  designErrorResponse,
  invalidBodyResponse,
  payloadTooLargeResponse,
  revisionRequiredResponse,
  writeForbiddenResponse,
} from "@/lib/server/design-errors";
import {
  readUtf8BodyWithLimit,
  type BoundedBodyFailure,
} from "@/lib/server/read-body-with-limit";
import { getRepository } from "@/lib/server/repository";
import {
  hasWriteCredentialFor,
  readWriteTokenHash,
  refreshWriteTokenCookie,
} from "@/lib/server/write-token";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Either the design the body carried, or the response that refuses it — tagged rather than left
 *  to an `instanceof` on the value type, so a caller cannot forget which it is holding. */
type ReadDesignOutcome =
  | { readonly ok: true; readonly design: Design }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * This response is **per-credential and must never be shared between visitors.** The design half is
 * public, but `canWrite` is computed from the request's own write-token cookie, so one cached copy
 * served to a second visitor would hand them another browser's `canWrite: true` and a panel
 * offering edits their saves will be refused for. Reading `request.cookies` already opts this route
 * out of static rendering and no CDN caches it without an explicit public directive — these headers
 * are what keeps that true the day someone adds `s-maxage` to a route whose payload looks public.
 */
/**
 * Where a save states the revision it edits (WEB-003).
 *
 * A header rather than a field in the body: the body of a save **is** the `Design` document and
 * `CurrentDesignSchema` is strict, so a revision smuggled into it would be rejected by the
 * schema — and putting transport metadata inside the customer's document is how the two come to be
 * confused later.
 *
 * Not `If-Match`, deliberately, even though the semantics are a conditional write. That header's
 * failure is a `412`, and this route answers `409`, which is the status the client's two-way choice
 * — reload, or overwrite — is written against; `If-Match` also invites a proxy or CDN to act on a
 * precondition it does not understand here. A custom header is inert to every intermediary.
 */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

const PER_CREDENTIAL_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

/**
 * Open to anyone holding the link, and deliberately so: ADR 0019 decision 1 splits read from write
 * precisely so that sharing keeps costing nothing. A caller presenting no credential still gets the
 * design and a 200 — never a 401, never a 403.
 *
 * `canWrite` rides along because the request already carried the cookie: the credential is
 * `HttpOnly`, so the browser cannot inspect it, and without this answer a panel could only discover
 * whether it may edit by attempting an edit — the warn-after-click pattern §9 rules out. It is a
 * boolean and nothing else; no token, no hash, and no fragment of either leaves this handler.
 *
 * **It is advisory, for the UI, and it is not the authorisation decision.** `PUT`/`PATCH` hand the
 * hash to `saveAuthorized`, which makes it part of the row's own `update` predicate. Nothing may
 * ever be written on the strength of a `canWrite` this route returned: that would be a
 * check-then-write window, which is the thing ADR 0019 was written to close. The next reader will be
 * tempted; this paragraph is why they should not be.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const { design, revision } = await getRepository().load(id);
    return NextResponse.json(
      {
        id,
        design,
        revision,
        canWrite: hasWriteCredentialFor(request.cookies, id),
      },
      { headers: PER_CREDENTIAL_HEADERS },
    );
  } catch (error) {
    return designErrorResponse(error);
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
 * Shared by `PUT` and `PATCH`: this route treats a save as a full replacement either way, so both
 * verbs validate and persist identically. The identifier travels only in the URL segment — the
 * request body is the `Design` document itself, nothing else.
 *
 * A request carrying no write-token cookie for this design is refused before its body is read, so
 * an unauthorised caller never reaches the parser. A request carrying one is still not trusted here:
 * the hash is handed to `saveAuthorized`, which makes it part of the `update` predicate. There is no
 * verification step in this file, and there must not be one — a check here followed by a write there
 * is the time-of-check/time-of-use window ADR 0019 rejects.
 */
async function saveDesign(
  request: NextRequest,
  { id }: { id: string },
): Promise<NextResponse> {
  const writeTokenHash = readWriteTokenHash(request, id);
  if (writeTokenHash === undefined) return writeForbiddenResponse();

  // After the credential check and before the body is read: an unauthorised caller must not be able
  // to tell this refusal from the 403, and a request that cannot be enforced is not worth parsing.
  const expectedRevision = readExpectedRevision(request);
  if (expectedRevision === undefined) return revisionRequiredResponse();

  try {
    // Inside the try, not above it: `readDesign` is not expected to throw — the reader returns its
    // transport failures — but nothing above a `try` has a handler, and this handler's whole reason
    // for existing is that a body read once escaped it.
    const body = await readDesign(request);
    if (!body.ok) return body.response;

    const saved = await getRepository().saveAuthorized({
      id,
      design: body.design,
      writeTokenHash,
      expectedRevision,
    });

    // A save is the proof the design is still in use, so it is also what keeps edit access alive.
    const response = NextResponse.json({
      id: saved.id,
      revision: saved.revision,
    });
    refreshWriteTokenCookie({ request, response }, id);
    return response;
  } catch (error) {
    return designErrorResponse(error);
  }
}

/** The revision the caller claims to be editing, or `undefined` when it did not send a usable one.
 *  Absent and malformed are one case on purpose: neither can be enforced against the row, and
 *  distinguishing them in the response would describe this route's parser to a caller. */
function readExpectedRevision(
  request: NextRequest,
): DesignRevision | undefined {
  const header = request.headers.get(EXPECTED_REVISION_HEADER);
  if (header === null || !isDesignRevision(header)) return undefined;
  return header;
}

/**
 * The `Design` the request body carries, or the response that refuses it.
 *
 * Three distinct failures, in the order their cost demands. The **size** gate runs first and reads
 * the stream itself (SEC-002), so an oversized body is cut off rather than parsed. Then the parse —
 * a truncated or empty body throws where a well-formed but wrong-shaped one merely fails the schema
 * — which is the one that used to escape the handler entirely, turning a client's malformed payload
 * into a 500 with a stack trace in the log. Then the **executable** contract (DOM-001): a document
 * can pass `CurrentDesignSchema` and still name a body no catalogue entry covers, which the schema cannot
 * see and every reader of the shared link then crashes on.
 *
 * All of them tell the client the same thing: the payload was rejected, and a stable code, never
 * why (ADR 0014 S2). The reasons are logged as bounded shapes rather than as the body, which is
 * attacker-supplied and unbounded.
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

/** A body that never arrived, as a handled response. An oversized payload is the caller's document
 *  and answers 413; a stream that broke mid-flight produced no document at all and answers 400,
 *  the same way a truncated JSON body does — which is what it is, one layer down. */
function refuseUnreadBody(failure: BoundedBodyFailure): NextResponse {
  return failure === "too-large"
    ? payloadTooLargeResponse()
    : invalidBodyResponse("request body stream failed before it completed");
}

/** The same validator the load path runs, at the write seam: a document is rejected here rather
 *  than persisted and rejected on every later read. */
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
