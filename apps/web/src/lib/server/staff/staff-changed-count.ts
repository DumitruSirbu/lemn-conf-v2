import "server-only";

import type { NextResponse } from "next/server";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import { answerOfReadJudgement } from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { readSharedChangedCount } from "@/lib/server/staff/changed-count-cache";
import { admitStaffWithoutKeepAlive } from "@/lib/server/staff/staff-admission";
import { getStaffKitchenReader } from "@/lib/server/staff/staff-kitchen-reader-instance";
import { staffChangedCountResponse } from "@/lib/server/staff/staff-responses";

// The number behind the menu badge. It is the one staff read that writes no audit row, a stated exception: it answers a
// single count and no kitchen, client or search, and it is asked on a timer, so a row per poll would bury the log. Every
// list and every kitchen read keeps its row. It runs inside the route's `answerUnavailableOnFailure`, so anything thrown
// is a `503` with no cause.

/** The log event of the poll: the route names its failure wrapper by it too. */
export const STAFF_CHANGED_COUNT_EVENT =
  "staff-changed-count" as const satisfies AccountEvent;

export interface StaffChangedCountRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
}

/**
 * The network's read limit first (it fails open), then the session and `contact.read`: the capability that holds a
 * kitchen's request, which the counter is a summary of. The session is not kept alive by a poll, because no person made
 * it. The count is shared across polls for one poll interval (`changed-count-cache.ts`).
 */
export async function readChangedCountForStaff({
  cookies,
  headers,
}: StaffChangedCountRequest): Promise<NextResponse> {
  const limited = answerOfReadJudgement(await judgeReadRequest(headers));
  if (limited !== undefined) return limited;
  const admission = await admitStaffWithoutKeepAlive({
    cookies,
    event: STAFF_CHANGED_COUNT_EVENT,
    capability: "contact.read",
  });
  if (admission.kind === "refused") return admission.response;
  const count = await readSharedChangedCount(
    getStaffKitchenReader(),
    Date.now(),
  );
  reportAccountEvent({
    event: STAFF_CHANGED_COUNT_EVENT,
    outcome: "succeeded",
  });
  return staffChangedCountResponse(count);
}
