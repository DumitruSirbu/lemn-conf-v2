import type { ShareCredential } from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import { editingAccountIdOf } from "@/lib/server/account/design-reader";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import {
  reportDesignFailure,
  reportDesignRefusal,
  type DesignOperation,
  type DesignRefusal,
} from "@/lib/server/design-failure-log";
import { refusalOfReadLimit } from "@/lib/server/rate-limit/judge-read-request";
import { refusalOfShareWriteLimit } from "@/lib/server/rate-limit/judge-share-write";
import { getShareLinkRepository } from "@/lib/server/repository";
import { createShareToken } from "@/lib/server/share-token";
import { readVisitorHash } from "@/lib/server/visitor";
import { readWriteTokenHash } from "@/lib/server/write-token";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Every successful response (201, 204, 200) carries these and none carries `Set-Cookie`. `private, no-store` and
 * `Vary: Cookie` as `[id]/route.ts`'s `PER_CREDENTIAL_HEADERS` has: the answer is decided by the request's own
 * credential cookies, so nothing between handler and browser may cache one caller's answer for another. The refusal
 * carries neither: `designNotFoundResponse` must be byte-identical to `GET /api/designs/{unknown}`'s 404, and a
 * response distinguishable by headers alone would tell a caller what the body's sameness withholds.
 */
const SHARE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

/** The log-only code for a cross-site share request, distinct from `CROSS_SITE_MINT_REFUSED`: the response is
 *  `designNotFoundResponse`, like every other refusal here, so nothing in it tells "wrong origin" from "wrong
 *  credential" or "no such design". */
const SHARE_CROSS_SITE_REFUSED: DesignRefusal = {
  code: "SHARE_CROSS_SITE_REFUSED",
  status: 404,
};

/** Issues a fresh, active share link, revoking whatever was active first. The token is handed back exactly once;
 *  only its hash is stored. */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const refused = refusedShareRequest(request, id, "share-issue");
  if (refused) return refused;
  const credential = await shareCredentialFor(request, id);
  if (!credential) return designNotFoundResponse(id);
  const limited = await refusalOfShareWriteLimit(
    request.headers,
    "share-issue",
  );
  if (limited) return limited;

  try {
    const { token, hash } = createShareToken();
    const outcome = await getShareLinkRepository().issue({
      designId: id,
      credential,
      tokenHash: hash,
    });
    if (outcome === "refused") return designNotFoundResponse(id);
    return NextResponse.json(
      { path: `/s/${token}` },
      { status: 201, headers: SHARE_RESPONSE_HEADERS },
    );
  } catch (error) {
    reportDesignFailure("share-issue", error);
    throw error;
  }
}

/** Revokes the design's active link, if any. Idempotent: a design with nothing active answers 204 as one that had
 *  something does. */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const refused = refusedShareRequest(request, id, "share-revoke");
  if (refused) return refused;
  const credential = await shareCredentialFor(request, id);
  if (!credential) return designNotFoundResponse(id);
  const limited = await refusalOfShareWriteLimit(
    request.headers,
    "share-revoke",
  );
  if (limited) return limited;

  try {
    const outcome = await getShareLinkRepository().revoke({
      designId: id,
      credential,
    });
    if (outcome === "refused") return designNotFoundResponse(id);
    return new NextResponse(null, {
      status: 204,
      headers: SHARE_RESPONSE_HEADERS,
    });
  } catch (error) {
    reportDesignFailure("share-revoke", error);
    throw error;
  }
}

/** Whether the design has an active link right now — never which one, and never its token. Counted as a read, and
 *  asked before the credentials are looked at, so a refusal is the same for an owner and a stranger. */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const refused = refusedShareRequest(request, id, "share-status");
  if (refused) return refused;
  const limited = await refusalOfReadLimit(request.headers);
  if (limited) return limited;
  const credential = await shareCredentialFor(request, id);
  if (!credential) return designNotFoundResponse(id);

  try {
    const outcome = await getShareLinkRepository().status({
      designId: id,
      credential,
    });
    if (outcome === "refused") return designNotFoundResponse(id);
    return NextResponse.json(outcome, {
      status: 200,
      headers: SHARE_RESPONSE_HEADERS,
    });
  } catch (error) {
    reportDesignFailure("share-status", error);
    throw error;
  }
}

/**
 * The cross-site check, first for every method: `SameSite=Lax` withholds both cookies from a cross-site request but
 * not from a same-site sibling origin, and a plain `POST`/`DELETE`/`GET` needs no preflight, so a sibling could
 * otherwise re-issue or revoke the owner's link. It answers with the route's own refusal shape, never a distinct
 * status.
 */
function refusedShareRequest(
  request: NextRequest,
  id: string,
  operation: DesignOperation,
): NextResponse | undefined {
  if (!isCrossSiteRequest(request)) return undefined;
  reportDesignRefusal(operation, SHARE_CROSS_SITE_REFUSED);
  return designNotFoundResponse(id);
}

/**
 * The credential a share request presents, or `undefined`. A write-token cookie for this design and a well-formed
 * visitor cookie, both present (ADR 0114 Amendment G4), exactly as before and without reading the session. Otherwise
 * the session of an account that may edit (ADR 0169 D9): sharing is managed by an editor, for all three methods. The
 * cross-site check has already run for every method. Absent both, the repository is never asked, so the refusal costs
 * no query and does not reveal whether the other would have mattered. Whether the design is that account's is the
 * repository's predicate to say, and its refusal is the one for a design that is unclaimed, another's, or unknown.
 */
async function shareCredentialFor(
  request: NextRequest,
  id: string,
): Promise<ShareCredential | undefined> {
  const writeTokenHash = readWriteTokenHash(request, id);
  const visitorHash = readVisitorHash(request.cookies);
  if (writeTokenHash !== undefined && visitorHash !== undefined) {
    return { kind: "write-token", writeTokenHash, visitorHash };
  }
  const accountId = await editingAccountIdOf(request.cookies);
  return accountId === undefined ? undefined : { kind: "account", accountId };
}
