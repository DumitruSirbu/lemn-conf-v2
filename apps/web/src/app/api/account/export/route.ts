import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { exportOwnAccount } from "@/lib/server/account/export-account";
import { sessionThatMayManageOwnAccount } from "@/lib/server/account/own-account-session";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookies'.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in account downloads its own data (M8B Lot 2, E10). A `POST`, not a `GET`: a cross-site top-level `GET`
 * carries a `Lax` cookie and would spend the bucket, and the JSON media type this route requires cannot be sent by a
 * cross-site form. The client sends `{}`; the body is read for its bound and is otherwise ignored. Steps 1 to 4 of the
 * common order are the route's; `exportOwnAccount` counts the account's daily bucket and then reads.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure("export", async () => {
    const own = await sessionThatMayManageOwnAccount({
      cookies: request.cookies,
      event: "export",
    });
    if (own.kind === "refused") return own.response;
    return exportOwnAccount({
      session: own.session,
      headers: request.headers,
    });
  });
}
