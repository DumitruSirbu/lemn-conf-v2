import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import { verifyEmail } from "@/lib/server/account/verify-email";
import { judgeAccountBlock } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver and `node:crypto` cannot run on Edge.
export const runtime = "nodejs";

/**
 * Confirming an address (M8B plan, flow 2). Steps 1 to 4 of the common order only: the cross-site check, the media
 * type, the bounded body, then the network's limit, which is asked before the token is read or any password is hashed.
 * There is no challenge (the token is the proof) and no address bucket (the token is the subject). A success sets the
 * session cookie on its own response.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const blocked = answerOfJudgement(
    await judgeAccountBlock({
      purpose: "confirm-email",
      headers: request.headers,
    }),
  );
  if (blocked !== undefined) return blocked;
  return answerUnavailableOnFailure("confirm-email", () =>
    verifyEmail({ bodyText: body.text, presentedCookies: request.cookies }),
  );
}
