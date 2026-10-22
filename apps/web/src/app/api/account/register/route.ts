import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import { registerAccount } from "@/lib/server/account/register-account";
import { judgeAccountBlock } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver, `node:crypto` and nodemailer's socket cannot run on Edge.
export const runtime = "nodejs";

/**
 * Registering an address (M8B plan, flow 1). The route holds steps 1 to 4 of the common order and nothing else: the
 * cross-site check, the media type and the bounded body come first and count nothing; then the network's limit, before
 * any challenge is asked or any byte is parsed. The rest, from the challenge to the mail, is `registerAccount`'s.
 * `202` is the one success, for a new, a pending and a confirmed address alike.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const blocked = answerOfJudgement(
    await judgeAccountBlock({ purpose: "register", headers: request.headers }),
  );
  if (blocked !== undefined) return blocked;
  return answerUnavailableOnFailure("register", () =>
    registerAccount({ bodyText: body.text, headers: request.headers }),
  );
}
