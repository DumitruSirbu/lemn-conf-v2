import { DesignSchema } from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";
import { NextResponse, type NextRequest } from "next/server";

import {
  describeSchemaFailure,
  designErrorResponse,
  invalidBodyResponse,
  writeForbiddenResponse,
} from "@/lib/server/design-errors";
import { getRepository } from "@/lib/server/repository";
import {
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

/** Open to anyone holding the link, and deliberately so: ADR 0019 decision 1 splits read from write
 *  precisely so that sharing keeps costing nothing. No credential is read here. */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const design = await getRepository().load(id);
    return NextResponse.json({ id, design });
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

  const body = await readDesign(request);
  if (!body.ok) return body.response;

  try {
    const savedId = await getRepository().saveAuthorized({
      id,
      design: body.design,
      writeTokenHash,
    });

    // A save is the proof the design is still in use, so it is also what keeps edit access alive.
    const response = NextResponse.json({ id: savedId });
    refreshWriteTokenCookie({ request, response }, id);
    return response;
  } catch (error) {
    return designErrorResponse(error);
  }
}

/**
 * The `Design` the request body carries, or the 400 that refuses it.
 *
 * Parsing and validation are two distinct failures — a truncated or empty body throws where a
 * well-formed but wrong-shaped one merely fails the schema — and the parse is the one that used to
 * escape the handler entirely, turning a client's malformed payload into a 500 with a stack trace
 * in the log. Both are handled here, and both tell the client the same thing: the payload was
 * rejected, never why (ADR 0014 S2). The unparseable reason is a fixed string rather than the body,
 * which is attacker-supplied and unbounded.
 */
async function readDesign(request: NextRequest): Promise<ReadDesignOutcome> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: invalidBodyResponse("request body was not parseable JSON"),
    };
  }

  const result = DesignSchema.safeParse(body);
  return result.success
    ? { ok: true, design: result.data }
    : {
        ok: false,
        response: invalidBodyResponse(
          describeSchemaFailure(result.error.issues),
        ),
      };
}
