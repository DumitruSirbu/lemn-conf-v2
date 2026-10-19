import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import { completeEmailChange } from "@/lib/server/account/confirm-email-change";
import { judgeAccountBlock } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge.
export const runtime = "nodejs";

/**
 * Using an e-mail-change link (M8B Lot 2, E9). Steps 1 to 4 of the common order only: the cross-site check, the media
 * type, the bounded body, then the network's limit, which is asked before the token is read. There is no challenge and
 * no session (the token is the subject), so none is read and none is started: a success ends every session.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const blocked = answerOfJudgement(
    await judgeAccountBlock({
      purpose: "email-change-confirm",
      headers: request.headers,
    }),
  );
  if (blocked !== undefined) return blocked;
  return answerUnavailableOnFailure("email-change-confirm", () =>
    completeEmailChange({ bodyText: body.text }),
  );
}
