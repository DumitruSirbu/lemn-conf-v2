import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import { completeEmailRevert } from "@/lib/server/account/revert-email-change";
import { judgeAccountBlock } from "@/lib/server/rate-limit/judge-account-request";

// Pinned, not defaulted: the Postgres driver and `node:crypto` cannot run on Edge.
export const runtime = "nodejs";

/**
 * Using the undo link of an address change (Lot 2 plan 14.3.3, ADR 0172 Amendment H). Steps 1 to 4 of the common order
 * only: the cross-site check, the media type, the bounded body, then the network's limit, which is asked before the
 * token is read or any password is hashed. There is no challenge and no session (the token is the subject), so none is
 * read and none is started: a success ends every session.
 *
 * Unlike the other two e-mail-change routes this one is **not** behind `EMAIL_CHANGE_ENABLED`: switching the feature
 * off later must not strand a link already mailed. Before any change has been confirmed no such link exists, and every
 * call answers `link-invalid`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const blocked = answerOfJudgement(
    await judgeAccountBlock({
      purpose: "email-change-revert",
      headers: request.headers,
    }),
  );
  if (blocked !== undefined) return blocked;
  return answerUnavailableOnFailure("email-change-revert", () =>
    completeEmailRevert({ bodyText: body.text }),
  );
}
