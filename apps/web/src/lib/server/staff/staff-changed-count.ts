import "server-only";

import type { NextResponse } from "next/server";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import { answerOfReadJudgement } from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { judgeChangedCountRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { readSharedChangedCount } from "@/lib/server/staff/changed-count-cache";
import { admitStaffWithoutKeepAlive } from "@/lib/server/staff/staff-admission";
import { getStaffKitchenReader } from "@/lib/server/staff/staff-kitchen-reader-instance";
import { staffChangedCountResponse } from "@/lib/server/staff/staff-responses";

// The one staff read that writes no audit row: a timer asks it and it answers a single count, so a row per poll would
// bury the log (ADR 0178 A-12, the no-audit exemption).

/** The log event of the poll: the route names its failure wrapper by it too. */
export const STAFF_CHANGED_COUNT_EVENT =
  "staff-changed-count" as const satisfies AccountEvent;

export interface StaffChangedCountRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
}

/** The poll's own network bucket first (it fails open), then the session and `contact.read`. A poll is no person's
 *  action, so it does not keep the session alive. */
export async function readChangedCountForStaff({
  cookies,
  headers,
}: StaffChangedCountRequest): Promise<NextResponse> {
  const limited = answerOfReadJudgement(
    await judgeChangedCountRequest(headers),
  );
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
