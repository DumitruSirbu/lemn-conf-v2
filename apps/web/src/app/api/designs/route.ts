import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextResponse } from "next/server";

import { reportDesignFailure } from "@/lib/server/design-failure-log";
import { getRepository } from "@/lib/server/repository";
import { mintWriteToken, setWriteTokenCookie } from "@/lib/server/write-token";

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
 * asked for — `POST` answers 201 or nothing.
 */
export async function POST(): Promise<NextResponse> {
  try {
    return await mintDesignRow();
  } catch (error) {
    reportDesignFailure("mint", error);
    throw error;
  }
}

/** Mints the first design row **and** the credential that authorises writing to it (ADR 0019
 *  decision 1): the creating browser is the only party that ever holds the token, so a link shared
 *  afterwards carries read access alone. M2 has no Step 1 yet, so the seeded L-kitchen fixture is
 *  the only creation trigger; M7 replaces it with preset application without changing this route's
 *  contract — the repository itself has no opinion on how a `Design` came to exist
 *  (`docs/milestones/M2-void-engine.md`, "Something has to create the first design"). */
async function mintDesignRow(): Promise<NextResponse> {
  const writeToken = mintWriteToken();
  const { id, revision } = await getRepository().mint(
    KITCHEN_L_DESIGN,
    writeToken.hash,
  );

  // The token travels in the `Set-Cookie` header only. It is deliberately absent from the JSON
  // body, where script could read it and a proxy or log could retain it. The revision is the
  // opposite kind of value and does belong here: without it the very first save would have no
  // expectation to state, and the client would have to read the design back to learn one.
  const response = NextResponse.json({ id, revision }, { status: 201 });
  setWriteTokenCookie(response, { designId: id, token: writeToken.token });
  return response;
}
