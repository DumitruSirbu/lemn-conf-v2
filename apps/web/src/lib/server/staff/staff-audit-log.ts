import "server-only";

import type { NextResponse } from "next/server";

import type { StaffAuditEntry } from "@lemnaria/configurator-domain";
import type {
  StaffAuditPage,
  StaffAuditPageRequest,
} from "@lemnaria/persistence";

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
import { commitAuditRow } from "@/lib/server/staff/staff-audit-commit";
import { readStaffAuditQuery } from "@/lib/server/staff/staff-audit-query";
import { getStaffAuditStore } from "@/lib/server/staff/staff-audit-store-instance";
import {
  staffAuditInvalidQueryResponse,
  staffAuditPageResponse,
} from "@/lib/server/staff/staff-responses";

// What an administrator reads of the staff audit log (ADR 0173). Reading it is itself audited, like every staff read
// of clients' data: the page is read and its body shaped, then an `audit-viewed` row is written and awaited, and only
// then is the body returned. It fails closed: a row that cannot be committed is a `503` with no page, and a request
// that is refused or fails before the page is read writes none. The row holds the page number, the rows returned and
// which filters were set, never the actor id, the action or the dates. An administrator reading the log therefore adds
// rows to it, at most as many as the account's page bucket allows; the action filter can leave them out.
//
// The actor filter takes an account id, because looking an address up would read `accounts` for a filter. The page
// learns the ids from the actors of the rows it shows.
//
// Everything here runs inside the route's `answerUnavailableOnFailure`, so anything thrown is a `503` with no cause.

export interface StaffAuditReadRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
  readonly searchParams: URLSearchParams;
}

const AUDIT_EVENT = "staff-audit" as const;

/**
 * One page of the log, newest first. The network's read limit comes first (it fails open), then the session and
 * `audit.read`, which only an administrator with a confirmed address holds, then the query, then the account's own page
 * bucket, which **fails closed**; only then is the store asked, and the page is served after its audit row commits.
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
  return servePage(cookies, reading.request);
}

async function servePage(
  cookies: SessionCookieReader,
  request: StaffAuditPageRequest,
): Promise<NextResponse> {
  const page = await getStaffAuditStore().page(request);
  const response = staffAuditPageResponse(page);
  await commitAuditRow(cookies, {
    entry: auditViewedEntryOf(request, page),
    designId: null,
    subjectAccountId: null,
  });
  reportAccountEvent({ event: AUDIT_EVENT, outcome: "succeeded" });
  return response;
}

function auditViewedEntryOf(
  request: StaffAuditPageRequest,
  page: StaffAuditPage,
): StaffAuditEntry {
  return {
    action: "audit-viewed" as const,
    detail: {
      page: request.page,
      rowCount: page.events.length,
      hasActorFilter: request.actorAccountId !== null,
      hasActionFilter: request.action !== null,
      hasDateFilter:
        request.occurredFrom !== null || request.occurredBefore !== null,
    },
  };
}

function refusedQuery(
  issues: Parameters<typeof staffAuditInvalidQueryResponse>[0],
): NextResponse {
  reportAccountEvent({ event: AUDIT_EVENT, outcome: "refused" });
  return staffAuditInvalidQueryResponse(issues);
}
