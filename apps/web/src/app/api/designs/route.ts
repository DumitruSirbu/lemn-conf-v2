import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextResponse, type NextRequest } from "next/server";

import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  reportDesignFailure,
  reportDesignRefusal,
  type DesignRefusal,
} from "@/lib/server/design-failure-log";
import { getRepository } from "@/lib/server/repository";
import { resolveVisitorForMint, setVisitorCookie } from "@/lib/server/visitor";
import { mintWriteToken, setWriteTokenCookie } from "@/lib/server/write-token";

/** The one D6 refusal this route can answer. A log-only code, exactly like `writeForbiddenResponse`
 *  in `design-errors.ts`: the *response* says nothing more than 403, because naming the reason to a
 *  caller this route just refused to trust would hand back exactly the signal it is withholding. */
const CROSS_SITE_MINT_REFUSED: DesignRefusal = {
  code: "CROSS_SITE_MINT_REFUSED",
  status: 403,
};

/**
 * Mints a design row, announcing any failure before the platform swallows its name.
 *
 * **This handler had no `try`/`catch` at all**, so a driver failure on *mint* — the very operation
 * the 2026-09-07 outage was failing on — reached Next as an unlabelled 500 carrying only a digest.
 * That is the state ADR 0096's Consequences describe: the question "why is production not minting?"
 * cost a query against the production database instead of a log search.
 *
 * **The throw is unchanged and so is the response** (ADR 0014 finding S2). Nothing is caught in
 * order to answer differently; the error is rethrown untouched, the platform still renders its own
 * 500 with the same digest, and the only thing that is new is a line naming the operation, the error
 * and a bounded reason. Mapping this to a JSON error instead would be a contract change no one
 * asked for — `POST` answers 201 or nothing (or, since M7 wave 7E3a, D6's 403).
 *
 * **`request` is read for its headers and its cookies only — never its body** (M7 wave 7E3a
 * criterion 3). There is nothing in a mint's body to read: the seeded fixture is the only design
 * this route ever creates, and a caller's body is ignored whether or not one was sent.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteMintRefusedResponse();
  try {
    return await mintDesignRow(request);
  } catch (error) {
    reportDesignFailure("mint", error);
    throw error;
  }
}

function crossSiteMintRefusedResponse(): NextResponse {
  reportDesignRefusal("mint", CROSS_SITE_MINT_REFUSED);
  return NextResponse.json(
    { error: "Design mint not authorized." },
    { status: CROSS_SITE_MINT_REFUSED.status },
  );
}

/** Mints the first design row **and** the credential that authorises writing to it (ADR 0019
 *  decision 1): the creating browser is the only party that ever holds the token, so a link shared
 *  afterwards carries read access alone. M2 has no Step 1 yet, so the seeded L-kitchen fixture is
 *  the only creation trigger; M7 replaces it with preset application without changing this route's
 *  contract — the repository itself has no opinion on how a `Design` came to exist
 *  (`docs/milestones/M2-void-engine.md`, "Something has to create the first design").
 *
 *  Since M7 wave 7E3a it also resolves — and always sets — the visitor cookie. Since M7 wave 7E3b
 *  (Amendment H1, *"Rotate on mint"*) every mint issues a **fresh** value; a well-formed one the
 *  request already carried is never re-emitted, only rotated away from — the repository moves that
 *  browser's existing rows to the fresh value in the same transaction as the insert. Every mint
 *  therefore leaves the browser with exactly one identity, never two and never none. */
async function mintDesignRow(request: NextRequest): Promise<NextResponse> {
  const writeToken = mintWriteToken();
  const visitor = resolveVisitorForMint(request);
  const { id, revision } = await getRepository().mint({
    design: KITCHEN_L_DESIGN,
    writeTokenHash: writeToken.hash,
    visitor: visitor.mintVisitor,
  });

  // The token and the visitor value both travel in `Set-Cookie` headers only, deliberately absent
  // from the JSON body, where script could read them and a proxy or log could retain them. The
  // revision is the opposite kind of value and does belong here: without it the very first save
  // would have no expectation to state, and the client would have to read the design back to learn
  // one.
  const response = NextResponse.json({ id, revision }, { status: 201 });
  setWriteTokenCookie(response, { designId: id, token: writeToken.token });
  setVisitorCookie(response, visitor.value);
  return response;
}
