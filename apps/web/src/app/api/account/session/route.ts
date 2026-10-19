import { type NextRequest, type NextResponse } from "next/server";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  anonymousSessionResponse,
  signedInSessionResponse,
  unavailableResponse,
} from "@/lib/server/account/account-responses";
import {
  readCurrentSessionOrThrow,
  touchCurrentSession,
  type CurrentSession,
} from "@/lib/server/account/current-session";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is asking (M8B plan, flow 5): the address and the capabilities of the session the cookie names, or anonymous.
 * Nothing else leaves the server: no id, role or verification flag. A store that fails is answered `503`, not
 * anonymous: the editor tells a person their session expired only on an anonymous answer, and a store that is down
 * must not read as one. A caller that gets no answer shows the visitor's header, which is less access. This is a route handler, so it is allowed to mark the session seen; a render never does. A cross-site
 * request is still answered but does not mark the session seen: a page of another site could otherwise keep a
 * session's idle clock running without the person using the site.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readSessionOrNothing(request);
  if (session === undefined) return unavailableResponse();
  if (session.kind === "anonymous") return anonymousSessionResponse();
  if (!isCrossSiteRequest(request)) await touchCurrentSession(request.cookies);
  return signedInSessionResponse({
    email: session.email,
    capabilities: session.capabilities,
  });
}

/** The session the cookie names, or nothing when the store could not say. */
async function readSessionOrNothing(
  request: NextRequest,
): Promise<CurrentSession | undefined> {
  try {
    return await readCurrentSessionOrThrow(request.cookies);
  } catch {
    reportAccountEvent({ event: "session-read", outcome: "unavailable" });
    return undefined;
  }
}
