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
} from "@/lib/server/account/account-responses";
import type { SignedInSession } from "@/lib/server/account/current-session";
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
import {
  admitStaff,
  type StaffAdmission,
} from "@/lib/server/staff/staff-admission";
import { getStaffAuditStore } from "@/lib/server/staff/staff-audit-store-instance";
import { getStaffKitchenReader } from "@/lib/server/staff/staff-kitchen-reader-instance";
import {
  staffInvalidQueryResponse,
  staffKitchenListResponse,
  staffKitchenResponse,
} from "@/lib/server/staff/staff-responses";

// What a staff member reads of the clients' kitchens (ADR 0173). No `200` leaves without a committed audit row, and no
// row is committed for any other answer: the body is shaped first, the row is written and awaited next, and only then
// is the body returned. Everything here runs inside the route's `answerUnavailableOnFailure`, so anything thrown is a
// `503` with no cause and no kitchen data.

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

/**
 * One page of the list. The network's read limit comes first (it fails open), then the session, `design.read.any` and
 * the query, then the account's page bucket, which **fails closed**; only then is the reader asked. The audit row
 * names the query's codes and counts, never the search text.
 */
export async function listKitchensForStaff(
  request: StaffListRequest,
): Promise<NextResponse> {
  const admission = await admitReader(request, LIST_EVENT);
  if (admission.kind === "refused") return admission.response;
  const reading = readStaffKitchenQuery(queryMembersOf(request.searchParams));
  if (!reading.ok) return refusedQuery(reading.issues);
  const limited = await refusalOfBucket(
    "staff-kitchens-list",
    admission.session,
    request.headers,
  );
  if (limited !== undefined) return limited;
  return servePage(request.cookies, reading.query);
}

/**
 * One kitchen. An id that is not a design id's shape, an unknown id, a kitchen its client deleted and a visitor's
 * unsent draft get one answer, `designNotFoundResponse`, and write no row. A kitchen its client hid is read. The
 * account's opening bucket, which also **fails closed**, is counted after the id's shape and before the reader, so a
 * malformed id costs nothing. The row names the kitchen and, when it has one, the client's account.
 */
export async function openKitchenForStaff(
  request: StaffOpenRequest,
): Promise<NextResponse> {
  const admission = await admitReader(request, ONE_EVENT);
  if (admission.kind === "refused") return admission.response;
  if (!isDesignId(request.designId)) return notFound(request.designId);
  const limited = await refusalOfBucket(
    "staff-kitchen-open",
    admission.session,
    request.headers,
  );
  if (limited !== undefined) return limited;
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

/** The network's read limit (fails open), then the shared staff admission for `design.read.any`. */
async function admitReader(
  { cookies, headers }: StaffReadRequest,
  event: AccountEvent,
): Promise<StaffAdmission> {
  const limited = answerOfReadJudgement(await judgeReadRequest(headers));
  if (limited !== undefined) return { kind: "refused", response: limited };
  return admitStaff({ cookies, event, capability: "design.read.any" });
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

/** One request counted in the account's own bucket, once, before the reader is asked. A bucket that cannot be counted is
 *  `503` and serves nothing: these two reads fail closed, where every other read fails open. */
async function refusalOfBucket(
  purpose: "staff-kitchens-list" | "staff-kitchen-open",
  session: SignedInSession,
  headers: HeaderReader,
): Promise<NextResponse | undefined> {
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose,
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
