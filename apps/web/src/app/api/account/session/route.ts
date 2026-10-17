import { type NextRequest, type NextResponse } from "next/server";

import {
  anonymousSessionResponse,
  signedInSessionResponse,
} from "@/lib/server/account/account-responses";
import {
  readCurrentSession,
  touchCurrentSession,
} from "@/lib/server/account/current-session";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is asking (M8B plan, flow 5): the address and the capabilities of the session the cookie names, or anonymous.
 * Nothing else leaves the server: no id, role or verification flag. A read that fails reads as anonymous, which is
 * less access. This is a route handler, so it is allowed to mark the session seen; a render never does.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readCurrentSession(request.cookies);
  if (session.kind === "anonymous") return anonymousSessionResponse();
  await touchCurrentSession(request.cookies);
  return signedInSessionResponse({
    email: session.email,
    capabilities: session.capabilities,
  });
}
