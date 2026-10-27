import "server-only";

import type { NextResponse } from "next/server";

import type { CatalogueAvailability } from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  answerOfJudgement,
  answerOfReadJudgement,
  invalidRequestResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { getBulkPlanner } from "@/lib/server/price-dashboard/bulk-planner";
import { catalogueViewedEntry } from "@/lib/server/price-dashboard/dashboard-audit-entries";
import {
  dashboardConflictResponse,
  dashboardInvalidInputResponse,
  dashboardStateResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import {
  readDashboardAvailability,
  readDashboardState,
  type ActiveDashboardState,
} from "@/lib/server/price-dashboard/dashboard-state";
import {
  planBulk,
  planChange,
  planRevert,
  type DraftPlan,
} from "@/lib/server/price-dashboard/draft-plans";
import {
  readBulkRequest,
  readDraftChangeRequest,
  readRevertRequest,
  type BulkRequest,
  type DraftChangeRequest,
  type RequestReading,
  type RequestRefusal,
  type RevertRequest,
} from "@/lib/server/price-dashboard/draft-requests";
import { getPriceStores } from "@/lib/server/price-stores";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { actingSessionOf } from "@/lib/server/staff/staff-acting-session";
import { admitStaff } from "@/lib/server/staff/staff-admission";
import { commitAuditRow } from "@/lib/server/staff/staff-audit-commit";
import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";

// What an administrator reads and writes of the price dashboard's draft (ADR 0173, ADR 0178; M10 plan R2). Every route
// has checked the origin, and the writes the media type and the body's size. From there the order is the staff routes' own:
// the session and `price.edit` (a client's, an operator's or an unconfirmed session reaches no store), the body's members,
// the account's own bucket, which **fails closed**, and only then the stores. A draft write is committed with its audit row
// in one transaction or not at all; the read is served after its `price-catalogue-viewed` row commits. Everything here runs
// inside the route's `answerUnavailableOnFailure`, so anything thrown that this file does not map is a `503` that carries no
// cause, no price and no stored value.

export const PRICE_READ_EVENT = "staff-prices" as const satisfies AccountEvent;
export const PRICE_DRAFT_EVENT =
  "staff-price-draft" as const satisfies AccountEvent;

export interface DashboardReadRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
}

export interface DashboardWriteRequest extends DashboardReadRequest {
  /** The body's text, already read to its bound by the route. */
  readonly bodyText: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// The read

/** The active version and the draft. A dashboard with no published version has no book to edit: `409 no-active-version`. */
export async function readDashboardForStaff({
  cookies,
  headers,
}: DashboardReadRequest): Promise<NextResponse> {
  const limited = answerOfReadJudgement(await judgeReadRequest(headers));
  if (limited !== undefined) return limited;
  const admission = await admitStaff({
    cookies,
    event: PRICE_READ_EVENT,
    capability: "price.edit",
  });
  if (admission.kind === "refused") return admission.response;
  const refusal = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-prices-read",
      headers,
      accountId: admission.session.accountId,
    }),
  );
  if (refusal !== undefined) return refusal;
  return serveState(cookies);
}

async function serveState(cookies: SessionCookieReader): Promise<NextResponse> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind === "no-active-version") {
    return refused(
      PRICE_READ_EVENT,
      dashboardConflictResponse("no-active-version"),
    );
  }
  const availability = await readDashboardAvailability(stores);
  const response = dashboardStateResponse(
    stateWireOf(reading.state, availability),
  );
  await commitAuditRow(cookies, {
    entry: catalogueViewedEntry(),
    designId: null,
    subjectAccountId: null,
  });
  return succeeded(PRICE_READ_EVENT, response);
}

function stateWireOf(
  { version, book, draft }: ActiveDashboardState,
  availability: CatalogueAvailability,
): DashboardStateWire {
  return {
    active: {
      versionId: version.versionId,
      book,
      availability,
      sequenceNumber: version.sequenceNumber,
      label: version.label,
      publishedAt: version.publishedAt.toISOString(),
    },
    draft: { draftRevision: draft.draftRevision, changes: draft.changes },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The writes

interface DraftWrite<Input extends { readonly expectedDraftRevision: string }> {
  readonly judge: (bodyText: string) => RequestReading<Input, string>;
  readonly plan: (input: Input, state: ActiveDashboardState) => DraftPlan;
}

const CHANGE_WRITE: DraftWrite<DraftChangeRequest> = {
  judge: readDraftChangeRequest,
  plan: planChange,
};

const REVERT_WRITE: DraftWrite<RevertRequest> = {
  judge: readRevertRequest,
  plan: planRevert,
};

const BULK_WRITE: DraftWrite<BulkRequest> = {
  judge: readBulkRequest,
  plan: (input, state) => planBulk(input, state, getBulkPlanner()),
};

/** Replaces the draft's change of one address, or adds it. */
export function changeDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runDraftWrite(CHANGE_WRITE, request);
}

/** Removes one change from the draft (↺), by its address, or every change of one bulk action, by its group. */
export function revertDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runDraftWrite(REVERT_WRITE, request);
}

/** Scales cabinet prices by a whole percentage over a scope, as one group of changes. */
export function bulkChangeDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runDraftWrite(BULK_WRITE, request);
}

async function runDraftWrite<
  Input extends { readonly expectedDraftRevision: string },
>(
  write: DraftWrite<Input>,
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  const { cookies, headers, bodyText } = request;
  const admission = await admitStaff({
    cookies,
    event: PRICE_DRAFT_EVENT,
    capability: "price.edit",
  });
  if (admission.kind === "refused") return admission.response;
  const reading = write.judge(bodyText);
  if (!reading.ok)
    return refused(PRICE_DRAFT_EVENT, answerOfRefusal(reading.refusal));
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-price-draft",
      headers,
      accountId: admission.session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  try {
    return await performDraftWrite(write, reading.value, cookies);
  } catch (failure) {
    return answerOfStoreFailure(failure);
  }
}

async function performDraftWrite<
  Input extends { readonly expectedDraftRevision: string },
>(
  write: DraftWrite<Input>,
  input: Input,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind === "no-active-version") {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("no-active-version"),
    );
  }
  if (reading.state.draft.draftRevision !== input.expectedDraftRevision) {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("changed-meanwhile"),
    );
  }
  const plan = write.plan(input, reading.state);
  if (plan.kind === "refused") return refused(PRICE_DRAFT_EVENT, plan.response);
  const result = await stores.priceBook.writeDraft({
    expectedDraftRevision: input.expectedDraftRevision,
    changes: plan.changes,
    audit: { session: actingSessionOf(cookies), entry: plan.entry },
  });
  if (result.kind === "changed-meanwhile") {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("changed-meanwhile"),
    );
  }
  return succeeded(PRICE_DRAFT_EVENT, plan.answer(result.draftRevision));
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

function answerOfRefusal(refusal: RequestRefusal<string>): NextResponse {
  return refusal.kind === "malformed"
    ? invalidRequestResponse()
    : dashboardInvalidInputResponse(refusal.issues);
}

/**
 * What a thrown store error becomes: no live session behind the write is `401`, as for the other staff writes. Every other
 * failure, a store that is down included, is thrown on to the route's wrapper, which answers `503` with no detail.
 */
function answerOfStoreFailure(failure: unknown): NextResponse {
  if (
    failure instanceof DashboardStoreError &&
    failure.failure === "not-recorded"
  ) {
    return refused(PRICE_DRAFT_EVENT, unauthenticatedResponse());
  }
  throw failure;
}

function refused(event: AccountEvent, response: NextResponse): NextResponse {
  reportAccountEvent({ event, outcome: "refused" });
  return response;
}

function succeeded(event: AccountEvent, response: NextResponse): NextResponse {
  reportAccountEvent({ event, outcome: "succeeded" });
  return response;
}
