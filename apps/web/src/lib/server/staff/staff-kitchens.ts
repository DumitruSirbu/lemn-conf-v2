import "server-only";

import type { NextResponse } from "next/server";

import {
  isDesignId,
  isKitchenViewed3dVersion,
  readStaffKitchenQuery,
  type KitchenViewed3dVersion,
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
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import {
  admitStaff,
  type StaffAdmission,
} from "@/lib/server/staff/staff-admission";
import { commitAuditRow } from "@/lib/server/staff/staff-audit-commit";
import { estimatesOfKitchen } from "@/lib/server/staff/staff-kitchen-estimates";
import { getStaffKitchenReader } from "@/lib/server/staff/staff-kitchen-reader-instance";
import {
  staffInvalidQueryResponse,
  staffInvalidVersionResponse,
  staffKitchen3dResponse,
  staffKitchenListResponse,
  staffKitchenResponse,
  staffKitchenUnreadableResponse,
} from "@/lib/server/staff/staff-responses";
import { shownDesignOf, type ShownDesign } from "@/staff/shown-design";

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

export interface StaffOpen3dRequest extends StaffOpenRequest {
  readonly searchParams: URLSearchParams;
}

/** The copy the 3D view opens on when the request names none: the one the shop was sent, as the detail page opens. */
const DEFAULT_VIEW_VERSION: KitchenViewed3dVersion = "sent";

const VERSION_OF_SOURCE = {
  "as-sent": "sent",
  current: "current",
} as const satisfies Record<ShownDesign["source"], KitchenViewed3dVersion>;

const LIST_EVENT = "staff-kitchens" as const satisfies AccountEvent;
const ONE_EVENT = "staff-kitchen" as const satisfies AccountEvent;

/**
 * One page of the list. The network's read limit comes first (it fails open), then the session, `design.read.any` and
 * the query, then the account's page bucket, which **fails closed**; only then is the reader asked. The audit row
 * names the query's codes, counts and whether it asked for the changed kitchens alone, never the search text.
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
 * malformed id costs nothing. The answer carries both estimates, priced before the row is written. The row names the
 * kitchen and, when it has one, the client's account.
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

/**
 * One kitchen's design for the 3D view, and nothing else of the kitchen. It has `openKitchenForStaff`'s admission and
 * refusals and its opening bucket, and judges `version` after admission and before the id, so a caller who may not read
 * kitchens learns nothing of the parameter. A kitchen with no copy this build reads is answered `422` after its bucket,
 * with no row. The row, `kitchen-viewed-3d`, names the copy served and is committed before the design is sent.
 */
export async function openKitchenIn3dForStaff(
  request: StaffOpen3dRequest,
): Promise<NextResponse> {
  const admission = await admitReader(request, ONE_EVENT);
  if (admission.kind === "refused") return admission.response;
  const requested = readRequestedVersion(request.searchParams);
  if (!requested.ok) return refusedVersion();
  if (!isDesignId(request.designId)) return notFound(request.designId);
  const limited = await refusalOfBucket(
    "staff-kitchen-open",
    admission.session,
    request.headers,
  );
  if (limited !== undefined) return limited;
  const reading = await getStaffKitchenReader().readOne(request.designId);
  if (reading.kind === "none") return notFound(request.designId);
  const shown = shownDesignOf(reading.kitchen, requested.version);
  if (shown === undefined) return unreadable();
  return serveKitchenIn3d(request.cookies, reading.kitchen, shown);
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
  const response = staffKitchenResponse(
    kitchen,
    await estimatesOfKitchen(kitchen),
  );
  await commitAuditRow(cookies, {
    entry: { action: "kitchen-opened", detail: null },
    designId: kitchen.id,
    subjectAccountId: kitchen.client?.id ?? null,
  });
  reportAccountEvent({ event: ONE_EVENT, outcome: "succeeded" });
  return response;
}

async function serveKitchenIn3d(
  cookies: SessionCookieReader,
  kitchen: StaffKitchenDetail,
  shown: ShownDesign,
): Promise<NextResponse> {
  const response = staffKitchen3dResponse(shown);
  await commitAuditRow(cookies, {
    entry: {
      action: "kitchen-viewed-3d",
      detail: { version: VERSION_OF_SOURCE[shown.source] },
    },
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

type RequestedVersion =
  | { readonly ok: true; readonly version: KitchenViewed3dVersion }
  | { readonly ok: false };

/** Absent is the default; exactly one value that names a copy is that copy. An empty value, a repeated parameter and any
 *  other word are refused: `get` would read the first of a repeated parameter, so every value is read. */
function readRequestedVersion(searchParams: URLSearchParams): RequestedVersion {
  const values = searchParams.getAll("version");
  if (values.length === 0) {
    return { ok: true, version: DEFAULT_VIEW_VERSION };
  }
  const [only] = values;
  return values.length === 1 && isKitchenViewed3dVersion(only)
    ? { ok: true, version: only }
    : { ok: false };
}

function queryMembersOf(
  searchParams: URLSearchParams,
): Readonly<Record<string, string | undefined>> {
  return {
    segment: searchParams.get("segment") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    onlyChanged: searchParams.get("onlyChanged") ?? undefined,
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
      onlyChanged: query.onlyChanged === true,
    },
  };
}

function refusedQuery(issues: readonly StaffKitchenQueryIssue[]): NextResponse {
  reportAccountEvent({ event: LIST_EVENT, outcome: "refused" });
  return staffInvalidQueryResponse(issues);
}

function refusedVersion(): NextResponse {
  reportAccountEvent({ event: ONE_EVENT, outcome: "refused" });
  return staffInvalidVersionResponse();
}

function unreadable(): NextResponse {
  reportAccountEvent({ event: ONE_EVENT, outcome: "refused" });
  return staffKitchenUnreadableResponse();
}

function notFound(designId: string): NextResponse {
  reportAccountEvent({ event: ONE_EVENT, outcome: "refused" });
  return designNotFoundResponse(designId);
}
