import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import { requestPasswordReset } from "@/lib/server/account/reset-password";
import { judgeAccountBlock } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver, `node:crypto` and nodemailer's socket cannot run on Edge.
export const runtime = "nodejs";

/**
 * Asking for a reset link (M8B plan, flow 6). The route holds steps 1 to 4 of the common order and nothing else: the
 * cross-site check, the media type and the bounded body come first and count nothing; then the network's limit, before
 * any challenge is asked or any byte is parsed. The rest, from the challenge to the mail, is `requestPasswordReset`'s.
 * `202` is the one success, for an unknown, an unconfirmed and a confirmed address alike.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const blocked = answerOfJudgement(
    await judgeAccountBlock({
      purpose: "password-reset-request",
      headers: request.headers,
    }),
  );
  if (blocked !== undefined) return blocked;
  return answerUnavailableOnFailure("password-reset-request", () =>
    requestPasswordReset({ bodyText: body.text, headers: request.headers }),
  );
}
