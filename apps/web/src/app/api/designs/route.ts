import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextResponse } from "next/server";

import { getRepository } from "@/lib/server/repository";
import { mintWriteToken, setWriteTokenCookie } from "@/lib/server/write-token";

/** Mints the first design row **and** the credential that authorises writing to it (ADR 0019
 *  decision 1): the creating browser is the only party that ever holds the token, so a link shared
 *  afterwards carries read access alone. M2 has no Step 1 yet, so the seeded L-kitchen fixture is
 *  the only creation trigger; M7 replaces it with preset application without changing this route's
 *  contract — the repository itself has no opinion on how a `Design` came to exist
 *  (`docs/milestones/M2-void-engine.md`, "Something has to create the first design"). */
export async function POST(): Promise<NextResponse> {
  const writeToken = mintWriteToken();
  const id = await getRepository().mint(KITCHEN_L_DESIGN, writeToken.hash);

  // The token travels in the `Set-Cookie` header only. It is deliberately absent from the JSON
  // body, where script could read it and a proxy or log could retain it.
  const response = NextResponse.json({ id }, { status: 201 });
  setWriteTokenCookie(response, { designId: id, token: writeToken.token });
  return response;
}
