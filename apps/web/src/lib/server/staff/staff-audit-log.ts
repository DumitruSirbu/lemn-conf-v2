import "server-only";

import type { NextResponse } from "next/server";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  answerOfJudgement,
  answerOfReadJudgement,
} from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { admitStaff } from "@/lib/server/staff/staff-admission";
import { readStaffAuditQuery } from "@/lib/server/staff/staff-audit-query";
import { getStaffAuditStore } from "@/lib/server/staff/staff-audit-store-instance";
import {
  staffAuditInvalidQueryResponse,
  staffAuditPageResponse,
} from "@/lib/server/staff/staff-responses";

// What an administrator reads of the staff audit log (E-L3-6, ADR 0173). Reading the log is not itself logged: the plan
// names the list and the audit page as the two reads that write no row (P-L3-3), and a row for each page would make the
// log grow by being read. The page is bounded instead, by its own bucket, which **fails closed**. Everything here runs
// inside the route's `answerUnavailableOnFailure`, so anything thrown is a `503` with no cause and no row.
//
// The actor filter takes an account id, because looking an address up would read `accounts` for a filter. No id is
// on the wire (`staff-responses.ts`), so which id to send, and where the page learns it, is an open decision for the
// page's wave.

export interface StaffAuditReadRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
  readonly searchParams: URLSearchParams;
}

const AUDIT_EVENT = "staff-audit" as const;

/**
 * One page of the log, newest first. The network's read limit comes first (it fails open), then the session and
 * `audit.read`, which only an administrator with a confirmed address holds, then the query, then the account's own page
 * bucket, which **fails closed**; only then is the store asked.
 */
export async function readAuditLogForStaff({
  cookies,
  headers,
  searchParams,
}: StaffAuditReadRequest): Promise<NextResponse> {
  const limited = answerOfReadJudgement(await judgeReadRequest(headers));
  if (limited !== undefined) return limited;
  const admission = await admitStaff({
    cookies,
    event: AUDIT_EVENT,
    capability: "audit.read",
  });
  if (admission.kind === "refused") return admission.response;
  const reading = readStaffAuditQuery(searchParams);
  if (!reading.ok) return refusedQuery(reading.issues);
  const refusal = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-audit-page",
      headers,
      accountId: admission.session.accountId,
    }),
  );
  if (refusal !== undefined) return refusal;
  const response = staffAuditPageResponse(
    await getStaffAuditStore().page(reading.request),
  );
  reportAccountEvent({ event: AUDIT_EVENT, outcome: "succeeded" });
  return response;
}

function refusedQuery(
  issues: Parameters<typeof staffAuditInvalidQueryResponse>[0],
): NextResponse {
  reportAccountEvent({ event: AUDIT_EVENT, outcome: "refused" });
  return staffAuditInvalidQueryResponse(issues);
}
