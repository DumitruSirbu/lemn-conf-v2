import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import { signIn } from "@/lib/server/account/sign-in";
import { judgeAccountBlock } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver and `node:crypto` cannot run on Edge.
export const runtime = "nodejs";

/**
 * Signing in (M8B plan, flow 3). The route holds steps 1 to 4 of the common order: the cross-site check, the media type
 * and the bounded body come first and count nothing; then the network's limit, before the challenge is asked, any byte
 * is parsed or any password is hashed. The rest, from the challenge to the session, is `signIn`'s. A success sets the
 * session cookie on its own response; every failure to sign in is the one `401`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const blocked = answerOfJudgement(
    await judgeAccountBlock({ purpose: "login", headers: request.headers }),
  );
  if (blocked !== undefined) return blocked;
  return answerUnavailableOnFailure("login", () =>
    signIn({
      bodyText: body.text,
      headers: request.headers,
      presentedCookies: request.cookies,
    }),
  );
}
