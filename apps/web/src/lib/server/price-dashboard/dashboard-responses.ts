import "server-only";

import { NextResponse } from "next/server";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { ACCOUNT_RESPONSE_HEADERS } from "@/lib/server/account/account-responses";
import type {
  BulkChangedWire,
  DashboardConflict,
  DashboardConflictWire,
  DashboardDraftUnreadableWire,
  DashboardDraftWire,
  DashboardInvalidInputWire,
  DashboardIssue,
  DashboardStateWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// The answers of the dashboard's read and draft routes. The refusals that are not the dashboard's own (401, 403, 429, 503,
// and the guards' 400, 403, 413, 415) are `account-responses.ts`'s. Every body is shaped member by member from what the
// service holds, never spread.

type DashboardBody =
  | DashboardStateWire
  | DashboardDraftWire
  | BulkChangedWire
  | DashboardConflictWire
  | DashboardDraftUnreadableWire
  | DashboardInvalidInputWire<string>;

function jsonResponse(body: DashboardBody, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: ACCOUNT_RESPONSE_HEADERS });
}

/** `200`: the active version, and the draft beside it. */
export function dashboardStateResponse(
  state: DashboardStateWire,
): NextResponse {
  return jsonResponse(state, 200);
}

/** `200`: the draft as it is now. */
export function draftChangedResponse(draft: DashboardDraftWire): NextResponse {
  return jsonResponse(draft, 200);
}

/** `200`: the draft after a bulk action, and how many cabinets and prices the action touched. */
export function bulkChangedResponse(wire: BulkChangedWire): NextResponse {
  return jsonResponse(wire, 200);
}

/** `409`: a state of the data, never a failure to answer. Nothing was written. */
export function dashboardConflictResponse(
  word: Exclude<DashboardConflict, "draft-unreadable">,
): NextResponse {
  return jsonResponse({ status: word }, 409);
}

/** `409`: the stored draft cannot be read. It names the revision a discard-all is made against, and nothing it holds. */
export function draftUnreadableResponse(draftRevision: string): NextResponse {
  return jsonResponse({ status: "draft-unreadable", draftRevision }, 409);
}

/** `400`: the members the person can correct, as the member and a closed code. Never the value that was refused. */
export function dashboardInvalidInputResponse<Code extends string>(
  issues: readonly DashboardIssue<Code>[],
): NextResponse {
  const body: DashboardInvalidInputWire<Code> = {
    status: "invalid-input",
    issues: issues.map(({ field, code }) => ({ field, code })),
  };
  return jsonResponse(body, 400);
}

export function draftWireOf(
  draftRevision: string,
  changes: readonly DraftChange[],
): DashboardDraftWire {
  return { draftRevision, changes };
}
