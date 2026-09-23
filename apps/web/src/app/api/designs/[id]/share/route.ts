import { NextResponse, type NextRequest } from "next/server";

import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import {
  reportDesignFailure,
  reportDesignRefusal,
  type DesignOperation,
  type DesignRefusal,
} from "@/lib/server/design-failure-log";
import { getShareLinkRepository } from "@/lib/server/repository";
import { createShareToken } from "@/lib/server/share-token";
import { readVisitorHash } from "@/lib/server/visitor";
import { readWriteTokenHash } from "@/lib/server/write-token";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * D4: every **successful** response carries these — the 201, the 204 and the 200 — and none of the
 * three ever carries `Set-Cookie`. `private, no-store` and `Vary: Cookie` for the same reason
 * `[id]/route.ts`'s own `PER_CREDENTIAL_HEADERS` does: the answer is decided by the request's own
 * credential cookies, so nothing between this handler and the browser may cache one caller's answer
 * for another's request.
 *
 * **The refusal carries neither** (review round 1, L1.7) — `designNotFoundResponse` is byte-identical
 * to `GET /api/designs/{unknown}`'s own 404 (D4), and that identity is the point: a response
 * distinguishable from an ordinary missing-design 404 by its headers alone would still tell a caller
 * something the body's own sameness is built to withhold.
 */
const SHARE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

/** D5's own refusal code for the share route — distinct from `CROSS_SITE_MINT_REFUSED`, because the
 *  *response* the two attach to is not the same shape: the mint answers its own 403, but a
 *  cross-site share request gets D4's `designNotFoundResponse`, exactly like every other refusal
 *  this route makes, so nothing distinguishes "wrong origin" from "wrong credential" or "no such
 *  design" in the response — only in this log-only code. */
const SHARE_CROSS_SITE_REFUSED: DesignRefusal = {
  code: "SHARE_CROSS_SITE_REFUSED",
  status: 404,
};

/** The pair D4's credential check requires, present together or not at all. */
interface ShareCredentials {
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/**
 * Issues a fresh, active share link for the design, revoking whatever was active first (D3). The
 * token is minted here and handed back exactly once — nothing in this handler or the repository
 * stores it, only its hash.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const refused = refusedShareRequest(request, id, "share-issue");
  if (refused) return refused;
  const credentials = shareCredentialsFor(request, id);
  if (!credentials) return designNotFoundResponse(id);

  try {
    const { token, hash } = createShareToken();
    const outcome = await getShareLinkRepository().issue({
      designId: id,
      ...credentials,
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

/** Revokes the design's active link, if it has one. Idempotent (D3): a design with nothing active
 *  answers 204 exactly as one that had something revoke does — the caller asked for "no active
 *  link" to be true, and it already was. */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const refused = refusedShareRequest(request, id, "share-revoke");
  if (refused) return refused;
  const credentials = shareCredentialsFor(request, id);
  if (!credentials) return designNotFoundResponse(id);

  try {
    const outcome = await getShareLinkRepository().revoke({
      designId: id,
      ...credentials,
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

/** Whether the design has an active link right now — never which one, and never its token. */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const refused = refusedShareRequest(request, id, "share-status");
  if (refused) return refused;
  const credentials = shareCredentialsFor(request, id);
  if (!credentials) return designNotFoundResponse(id);

  try {
    const outcome = await getShareLinkRepository().status({
      designId: id,
      ...credentials,
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
 * D5's check, first for every method: `SameSite=Lax` withholds both cookies from a cross-site
 * request but not from a same-site sibling origin, and a plain `POST`/`DELETE`/`GET` needs no
 * preflight — so a same-site sibling could otherwise re-issue or revoke the owner's link. Answers
 * with the route's own refusal shape (D4), never a distinct status: a cross-site caller learns
 * nothing that tells it apart from a wrong credential or an unknown id.
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

/** D4's second check: a write-token cookie for this design and a well-formed visitor cookie, both
 *  present. Absent either one, the repository is never asked — the refusal costs no query, and a
 *  caller missing one credential cannot use this route to learn whether the other would have
 *  mattered. */
function shareCredentialsFor(
  request: NextRequest,
  id: string,
): ShareCredentials | undefined {
  const writeTokenHash = readWriteTokenHash(request, id);
  const visitorHash = readVisitorHash(request.cookies);
  if (writeTokenHash === undefined || visitorHash === undefined) {
    return undefined;
  }
  return { writeTokenHash, visitorHash };
}
