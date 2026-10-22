import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextResponse, type NextRequest } from "next/server";

import { accountIdToOwnNewDesign } from "@/lib/server/account/design-owner";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  reportDesignFailure,
  reportDesignRefusal,
  reportMintLimit,
  type DesignRefusal,
} from "@/lib/server/design-failure-log";
import { judgeMintRequest } from "@/lib/server/rate-limit/judge-mint-request";
import { refusalOfWriteLimit } from "@/lib/server/rate-limit/refusal-of-write-limit";
import {
  mintLimitReachedResponse,
  mintUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";
import { getRepository } from "@/lib/server/repository";
import { resolveVisitorForMint, setVisitorCookie } from "@/lib/server/visitor";
import { mintWriteToken, setWriteTokenCookie } from "@/lib/server/write-token";

/** The one refusal this route can answer: a log-only code, like `writeForbiddenResponse` in
 *  `design-errors.ts`. The response says nothing more than 403, since naming the reason to a caller just refused
 *  would hand back the signal being withheld. */
const CROSS_SITE_MINT_REFUSED: DesignRefusal = {
  code: "CROSS_SITE_MINT_REFUSED",
  status: 403,
};

/**
 * Mints a design row, announcing any failure before the platform swallows its name: without the `try`/`catch` a
 * driver failure on mint reached Next as an unlabelled 500 with only a digest (ADR 0096, Consequences). The error is
 * rethrown untouched and the response is unchanged; only a log line naming the operation, the error and a bounded
 * reason is new. `request` is read for its headers and cookies only, never its body.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteMintRefusedResponse();
  try {
    const refusal = await refusalOfTheLimiter(request);
    if (refusal !== undefined) return refusal;
    return await mintDesignRow(request);
  } catch (error) {
    reportDesignFailure("mint", error);
    throw error;
  }
}

/**
 * Asked after the cross-site guard and before the visitor is read or anything is minted, so a refused mint resolves
 * no visitor, sets no cookie and writes no row. The limiter is outside the mint's work, not inside it. Nothing thrown
 * here is kept: it answers as unavailable.
 */
function refusalOfTheLimiter(
  request: NextRequest,
): Promise<NextResponse | undefined> {
  return refusalOfWriteLimit(() => judgeMintRequest(request.headers), {
    refused: mintLimitReachedResponse,
    unavailable: mintUnavailableResponse,
    reportRefused: (policy) => {
      reportMintLimit({ kind: "refused", policy });
    },
    reportUnavailable: (cause) => {
      reportMintLimit({ kind: "unavailable", cause });
    },
  });
}

function crossSiteMintRefusedResponse(): NextResponse {
  reportDesignRefusal("mint", CROSS_SITE_MINT_REFUSED);
  return NextResponse.json(
    { error: "Design mint not authorized." },
    { status: CROSS_SITE_MINT_REFUSED.status },
  );
}

/** Mints the first design row and the credential that authorises writing to it (ADR 0019 decision 1): the creating
 *  browser is the only party that ever holds the token. The design's own link opens only in the browser that owns
 *  the visitor cookie (ADR 0114 Amendment H2); a read-only view is a separate share link (Amendment C). The seeded
 *  L-kitchen fixture is the only creation trigger for now.
 *
 *  Every mint issues a fresh visitor value (ADR 0114 Amendment H1, *"Rotate on mint"*): a well-formed one the request
 *  carried is rotated away from, never re-emitted, and the repository moves that browser's rows to the fresh value in
 *  the insert's transaction, so a mint leaves the browser with exactly one identity. A mint made while a verified
 *  account is signed in also stores that account (ADR 0172 D8); every other mint is exactly as it was. */
async function mintDesignRow(request: NextRequest): Promise<NextResponse> {
  const writeToken = mintWriteToken();
  const visitor = resolveVisitorForMint(request);
  const accountId = await accountIdToOwnNewDesign(request.cookies);
  const { id, revision } = await getRepository().mint({
    design: KITCHEN_L_DESIGN,
    writeTokenHash: writeToken.hash,
    visitor: visitor.mintVisitor,
    ...(accountId === undefined ? {} : { accountId }),
  });

  // The token and the visitor value travel in `Set-Cookie` headers only, absent from the JSON body where script
  // could read them and a proxy or log retain them. The revision belongs in the body: without it the first save
  // has no expectation to state.
  const response = NextResponse.json({ id, revision }, { status: 201 });
  setWriteTokenCookie(response, { designId: id, token: writeToken.token });
  setVisitorCookie(response, visitor.value);
  return response;
}
