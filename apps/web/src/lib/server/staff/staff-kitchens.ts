import "server-only";

import type { NextResponse } from "next/server";

import {
  isDesignId,
  readStaffKitchenQuery,
  type StaffAuditEntry,
  type StaffKitchenQuery,
  type StaffKitchenQueryIssue,
} from "@lemnaria/configurator-domain";
import type {
  StaffKitchenDetail,
  StaffKitchenPage,
} from "@lemnaria/persistence";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  answerOfJudgement,
  answerOfReadJudgement,
  forbiddenResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import {
  readCurrentSessionOrThrow,
  type SignedInSession,
} from "@/lib/server/account/current-session";
import { requireCapability } from "@/lib/server/account/require-capability";
import {
  readSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { sha256Hex } from "@/lib/server/sha256-hex";
import { getStaffAuditStore } from "@/lib/server/staff/staff-audit-store-instance";
import { getStaffKitchenReader } from "@/lib/server/staff/staff-kitchen-reader-instance";
import {
  staffInvalidQueryResponse,
  staffKitchenListResponse,
  staffKitchenResponse,
} from "@/lib/server/staff/staff-responses";

// E-L3-1 and E-L3-2 of the Lot 3 plan: what a staff member reads of the clients' kitchens (ADR 0173). The invariant is
// that **no `200` leaves without a committed audit row, and no row is committed for a request that is not answered
// `200`**. So the body is shaped first, the row is written and awaited next, and only then is the shaped body returned:
// a failure to shape costs no row, and a failure to record costs the body. Everything here is called inside the route's
// `answerUnavailableOnFailure`, so anything thrown is a `503` that carries no cause and no kitchen data.

interface StaffReadRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
}

export interface StaffListRequest extends StaffReadRequest {
  readonly searchParams: URLSearchParams;
}

export interface StaffOpenRequest extends StaffReadRequest {
  /** The URL segment as it arrived: its shape is judged here. */
  readonly designId: string;
}

const LIST_EVENT = "staff-kitchens" as const satisfies AccountEvent;
const ONE_EVENT = "staff-kitchen" as const satisfies AccountEvent;

type StaffAdmission =
  | { readonly kind: "admitted"; readonly session: SignedInSession }
  | { readonly kind: "refused"; readonly response: NextResponse };

/**
 * E-L3-1. The network's read limit is counted first (it fails open, ADR 0156), then the session, `design.read.any`, the
 * query, and the account's own page bucket, which **fails closed**; only then is the reader asked. The audit row for the
 * view names the query's codes and counts, never the search text.
 */
export async function listKitchensForStaff(
  request: StaffListRequest,
): Promise<NextResponse> {
  const admission = await admitStaff(request, LIST_EVENT);
  if (admission.kind === "refused") return admission.response;
  const reading = readStaffKitchenQuery(queryMembersOf(request.searchParams));
  if (!reading.ok) return refusedQuery(reading.issues);
  const limited = await refusalOfListLimit(admission.session, request.headers);
  if (limited !== undefined) return limited;
  return servePage(request.cookies, reading.query);
}

/**
 * E-L3-2. An id that is not a design id's shape, an unknown id, a kitchen its client deleted and a visitor's unsent
 * draft get one answer, `designNotFoundResponse`, and write no row. A kitchen its client hid is read. The row names the
 * kitchen and, when it has one, the client's account.
 */
export async function openKitchenForStaff(
  request: StaffOpenRequest,
): Promise<NextResponse> {
  const admission = await admitStaff(request, ONE_EVENT);
  if (admission.kind === "refused") return admission.response;
  if (!isDesignId(request.designId)) return notFound(request.designId);
  const reading = await getStaffKitchenReader().readOne(request.designId);
  if (reading.kind === "none") return notFound(request.designId);
  return serveKitchen(request.cookies, reading.kitchen);
}

async function servePage(
  cookies: SessionCookieReader,
  query: StaffKitchenQuery,
): Promise<NextResponse> {
  const page = await getStaffKitchenReader().listPage(query);
  const response = staffKitchenListResponse(page);
  await commitAuditRow(cookies, {
    entry: kitchensListedEntryOf(query, page),
    designId: null,
    subjectAccountId: null,
  });
  reportAccountEvent({ event: LIST_EVENT, outcome: "succeeded" });
  return response;
}

async function serveKitchen(
  cookies: SessionCookieReader,
  kitchen: StaffKitchenDetail,
): Promise<NextResponse> {
  const response = staffKitchenResponse(kitchen);
  await commitAuditRow(cookies, {
    entry: { action: "kitchen-opened", detail: null },
    designId: kitchen.id,
    subjectAccountId: kitchen.client?.id ?? null,
  });
  reportAccountEvent({ event: ONE_EVENT, outcome: "succeeded" });
  return response;
}

/**
 * Steps 3 and 4 of the common order, after the read limit. The session is read by the variant that throws: a store that
 * is down is the caller's `503` and never an anonymous reading. `401` is no live session, `403` a live session without
 * `design.read.any` (a client, or a staff address not yet confirmed).
 */
async function admitStaff(
  { cookies, headers }: StaffReadRequest,
  event: AccountEvent,
): Promise<StaffAdmission> {
  const limited = answerOfReadJudgement(await judgeReadRequest(headers));
  if (limited !== undefined) return { kind: "refused", response: limited };
  const session = await readCurrentSessionOrThrow(cookies);
  const check = requireCapability(session, "design.read.any");
  if (check.kind === "allowed" && session.kind === "signed-in") {
    return { kind: "admitted", session };
  }
  reportAccountEvent({ event, outcome: "refused" });
  const isForbidden = check.kind === "refused" && check.refusal === "forbidden";
  return {
    kind: "refused",
    response: isForbidden ? forbiddenResponse() : unauthenticatedResponse(),
  };
}

function queryMembersOf(
  searchParams: URLSearchParams,
): Readonly<Record<string, string | undefined>> {
  return {
    segment: searchParams.get("segment") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  };
}

/** One page counted in the account's own bucket, once, before the reader is asked. A bucket that cannot be counted is
 *  `503` and serves no page: the list is the one read that fails closed. */
async function refusalOfListLimit(
  session: SignedInSession,
  headers: HeaderReader,
): Promise<NextResponse | undefined> {
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-kitchens-list",
      headers,
      accountId: session.accountId,
    }),
  );
}

function kitchensListedEntryOf(
  query: StaffKitchenQuery,
  page: StaffKitchenPage,
): StaffAuditEntry {
  return {
    action: "kitchens-listed",
    detail: {
      segment: query.segment,
      status: query.status,
      page: query.page,
      rowCount: page.kitchens.length,
      hasSearch: query.search !== null,
    },
  };
}

interface AuditedRead {
  readonly entry: StaffAuditEntry;
  readonly designId: string | null;
  readonly subjectAccountId: string | null;
}

/** Writes the row and waits for its commit. The store takes the actor from the live session the cookie names, so no
 *  caller can name another account; any failure is thrown, and the caller's wrapper answers `503`. */
async function commitAuditRow(
  cookies: SessionCookieReader,
  { entry, designId, subjectAccountId }: AuditedRead,
): Promise<void> {
  await getStaffAuditStore().record({
    sessionTokenHash: sessionTokenHashOf(cookies),
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
    entry,
    designId,
    subjectAccountId,
  });
}

function sessionTokenHashOf(cookies: SessionCookieReader): string {
  const sessionValue = readSessionCookie(cookies);
  if (sessionValue === undefined) {
    throw new Error("A staff read has no session cookie to name its actor.");
  }
  return sha256Hex(sessionValue);
}

function refusedQuery(issues: readonly StaffKitchenQueryIssue[]): NextResponse {
  reportAccountEvent({ event: LIST_EVENT, outcome: "refused" });
  return staffInvalidQueryResponse(issues);
}

function notFound(designId: string): NextResponse {
  reportAccountEvent({ event: ONE_EVENT, outcome: "refused" });
  return designNotFoundResponse(designId);
}
