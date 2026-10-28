import "server-only";

import type { NextResponse } from "next/server";

import type {
  CatalogueAvailability,
  PriceCatalogueSection,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  type PublishPriceBookResult,
  type WriteDraftRequest,
} from "@lemnaria/persistence";

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
import {
  catalogueViewedEntry,
  draftDiscardedEntry,
  publishedEntry,
} from "@/lib/server/price-dashboard/dashboard-audit-entries";
import {
  dashboardConflictResponse,
  dashboardInvalidInputResponse,
  dashboardStateResponse,
  draftChangedResponse,
  draftUnreadableResponse,
  draftWireOf,
  publishedResponse,
  versionListResponse,
  versionNotFoundResponse,
  versionResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import {
  readDashboardAvailability,
  readDashboardState,
  readRawDraft,
  type ActiveDashboardState,
  type DashboardStateReading,
} from "@/lib/server/price-dashboard/dashboard-state";
import {
  planBulk,
  planChange,
  planRevert,
  type DraftPlan,
} from "@/lib/server/price-dashboard/draft-plans";
import {
  isDiscardRequest,
  readBulkRequest,
  readDraftChangeRequest,
  readRevertRequest,
  type BulkRequest,
  type DiscardRequest,
  type DraftChangeRequest,
  type RequestReading,
  type RequestRefusal,
  type RevertOrDiscardRequest,
} from "@/lib/server/price-dashboard/draft-requests";
import { planPublish } from "@/lib/server/price-dashboard/publish-plan";
import {
  readPublishRequest,
  readRestoreRequest,
  readVersionPage,
  type PublishRequest,
  type RestoreRequest,
} from "@/lib/server/price-dashboard/publish-requests";
import { planRestore } from "@/lib/server/price-dashboard/restore-plan";
import { isIdentifier } from "@/lib/server/price-dashboard/identifier-shape";
import { readStoredDraft } from "@/lib/server/price-dashboard/stored-draft";
import {
  versionListWireOf,
  versionWireOf,
} from "@/lib/server/price-dashboard/version-wire";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
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
export async function readDashboardForStaff(
  request: DashboardReadRequest,
): Promise<NextResponse> {
  const admission = await admitReader(request);
  if (admission.kind === "refused") return admission.response;
  const refusal = await refusalOfReadBucket(request, admission.accountId);
  if (refusal !== undefined) return refusal;
  return serveState(request.cookies);
}

async function serveState(cookies: SessionCookieReader): Promise<NextResponse> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind !== "ready") {
    return refusalOfUnreadyState(PRICE_READ_EVENT, reading);
  }
  const availability = await readDashboardAvailability(stores);
  return serveAudited(cookies, {
    response: dashboardStateResponse(stateWireOf(reading.state, availability)),
    section: "catalogue",
  });
}

export interface VersionListRequest extends DashboardReadRequest {
  readonly searchParams: URLSearchParams;
}

export interface VersionReadRequest extends DashboardReadRequest {
  /** The path's segment as it arrived: its shape is judged here. */
  readonly versionId: string;
}

/** One page of the history, newest first. A page the query cannot name is `400` and costs nothing. */
export async function listVersionsForStaff(
  request: VersionListRequest,
): Promise<NextResponse> {
  const admission = await admitReader(request);
  if (admission.kind === "refused") return admission.response;
  const page = readVersionPage(request.searchParams);
  if (!page.ok) {
    return refused(
      PRICE_READ_EVENT,
      dashboardInvalidInputResponse([{ field: "page", code: page.code }]),
    );
  }
  const refusal = await refusalOfReadBucket(request, admission.accountId);
  if (refusal !== undefined) return refusal;
  const stores = await getPriceStores();
  const listed = await stores.priceBook.listVersions({ page: page.page });
  return serveAudited(request.cookies, {
    response: versionListResponse(versionListWireOf(listed)),
    section: "history",
  });
}

/**
 * One version, with its book and the changes it carried, for staff only (F10). An id no store could hold and an unknown
 * one get one answer, `404`, and write no row.
 */
export async function readVersionForStaff(
  request: VersionReadRequest,
): Promise<NextResponse> {
  const admission = await admitReader(request);
  if (admission.kind === "refused") return admission.response;
  if (!isIdentifier(request.versionId)) {
    return refused(PRICE_READ_EVENT, versionNotFoundResponse());
  }
  const refusal = await refusalOfReadBucket(request, admission.accountId);
  if (refusal !== undefined) return refusal;
  const stores = await getPriceStores();
  const found = await stores.priceBook.readVersion(request.versionId);
  if (found.kind !== "found") {
    return refused(PRICE_READ_EVENT, versionNotFoundResponse());
  }
  return serveAudited(request.cookies, {
    response: versionResponse(versionWireOf(found.version)),
    section: "version",
  });
}

type ReaderAdmission =
  | { readonly kind: "admitted"; readonly accountId: string }
  | { readonly kind: "refused"; readonly response: NextResponse };

/** The network's read limit (which fails open), then the session and `price.edit`. */
async function admitReader({
  cookies,
  headers,
}: DashboardReadRequest): Promise<ReaderAdmission> {
  const limited = answerOfReadJudgement(await judgeReadRequest(headers));
  if (limited !== undefined) return { kind: "refused", response: limited };
  const admission = await admitStaff({
    cookies,
    event: PRICE_READ_EVENT,
    capability: "price.edit",
  });
  return admission.kind === "refused"
    ? admission
    : { kind: "admitted", accountId: admission.session.accountId };
}

/** The account's own read bucket, which **fails closed**. */
async function refusalOfReadBucket(
  { headers }: DashboardReadRequest,
  accountId: string,
): Promise<NextResponse | undefined> {
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-prices-read",
      headers,
      accountId,
    }),
  );
}

/** The answer is served only once its `price-catalogue-viewed` row has committed. */
async function serveAudited(
  cookies: SessionCookieReader,
  {
    response,
    section,
  }: { response: NextResponse; section: PriceCatalogueSection },
): Promise<NextResponse> {
  await commitAuditRow(cookies, {
    entry: catalogueViewedEntry(section),
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
  readonly perform: (
    input: Input,
    cookies: SessionCookieReader,
  ) => Promise<NextResponse>;
}

type PlanOf<Input> = (input: Input, state: ActiveDashboardState) => DraftPlan;

const CHANGE_WRITE: DraftWrite<DraftChangeRequest> = {
  judge: readDraftChangeRequest,
  perform: (input, cookies) => performPlanned(input, cookies, planChange),
};

const REVERT_WRITE: DraftWrite<RevertOrDiscardRequest> = {
  judge: readRevertRequest,
  perform: (input, cookies) =>
    isDiscardRequest(input)
      ? performDiscard(input, cookies)
      : performPlanned(input, cookies, planRevert),
};

const BULK_WRITE: DraftWrite<BulkRequest> = {
  judge: readBulkRequest,
  perform: (input, cookies) =>
    performPlanned(input, cookies, (request, state) =>
      planBulk(request, state, getBulkPlanner()),
    ),
};

const PUBLISH_WRITE: DraftWrite<PublishRequest> = {
  judge: readPublishRequest,
  perform: performPublish,
};

/** Replaces the draft's change of one address, or adds it. */
export function changeDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runDraftWrite(CHANGE_WRITE, request);
}

/**
 * Removes one change from the draft (↺), by its address, or every change of one bulk action, by its group; or, told by
 * `scope: "all"`, resets the whole draft to empty without reading it.
 */
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

export interface RestoreWriteRequest extends DashboardWriteRequest {
  /** The path's segment as it arrived: its shape is judged with the body. */
  readonly versionId: string;
}

/**
 * Publishes the book the stored draft makes, as a new version: the request names the draft revision, the active
 * sequence and the availability head the page read, and the version's label and note. The book is computed and judged
 * here, never taken from the request (F10).
 */
export function publishAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runDraftWrite(PUBLISH_WRITE, request);
}

/** Puts an archived version's prices in the draft, replacing the pending ones of the same fields. It publishes nothing. */
export function restoreAsStaff({
  versionId,
  ...request
}: RestoreWriteRequest): Promise<NextResponse> {
  return runDraftWrite(
    {
      judge: (bodyText) => readRestoreRequest(versionId, bodyText),
      perform: performRestore,
    },
    request,
  );
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
    return await write.perform(reading.value, cookies);
  } catch (failure) {
    return answerOfStoreFailure(failure);
  }
}

/** A write decided by what the draft holds: the draft is read and parsed, judged against the book, then written. */
async function performPlanned<
  Input extends { readonly expectedDraftRevision: string },
>(
  input: Input,
  cookies: SessionCookieReader,
  planOf: PlanOf<Input>,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind !== "ready") {
    return refusalOfUnreadyState(PRICE_DRAFT_EVENT, reading);
  }
  if (reading.state.draft.draftRevision !== input.expectedDraftRevision) {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("changed-meanwhile"),
    );
  }
  return writePlanned(stores, {
    plan: planOf(input, reading.state),
    expectedDraftRevision: input.expectedDraftRevision,
    cookies,
  });
}

/** Writes what a plan decided, with its audit row, or answers the refusal it is. */
async function writePlanned(
  stores: PriceStores,
  {
    plan,
    expectedDraftRevision,
    cookies,
  }: {
    readonly plan: DraftPlan;
    readonly expectedDraftRevision: string;
    readonly cookies: SessionCookieReader;
  },
): Promise<NextResponse> {
  if (plan.kind === "refused") return refused(PRICE_DRAFT_EVENT, plan.response);
  return writeDraft(stores, {
    expectedDraftRevision,
    changes: plan.changes,
    audit: { session: actingSessionOf(cookies), entry: plan.entry },
    answer: plan.answer,
  });
}

/**
 * A restore reads the version it restores as well as the draft. A version no store holds is `404`; a stale draft revision
 * is `changed-meanwhile`. The plan is made against the candidate the draft makes (R3, ruling U5-Q6).
 */
async function performRestore(
  input: RestoreRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind !== "ready") {
    return refusalOfUnreadyState(PRICE_DRAFT_EVENT, reading);
  }
  const found = await stores.priceBook.readVersion(input.versionId);
  if (found.kind !== "found") {
    return refused(PRICE_DRAFT_EVENT, versionNotFoundResponse());
  }
  if (reading.state.draft.draftRevision !== input.expectedDraftRevision) {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("changed-meanwhile"),
    );
  }
  return writePlanned(stores, {
    plan: planRestore(found.version, reading.state),
    expectedDraftRevision: input.expectedDraftRevision,
    cookies,
  });
}

/**
 * A publish stores a book the domain has judged whole. The store takes the head's and the sequence's compare-and-set in
 * the same transaction as the insert, the draft's reset and the audit row, so a refusal of any kind wrote nothing.
 */
async function performPublish(
  input: PublishRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind !== "ready") {
    return refusalOfUnreadyState(PRICE_DRAFT_EVENT, reading);
  }
  const plan = planPublish(input, reading.state);
  if (plan.kind === "refused") return refused(PRICE_DRAFT_EVENT, plan.response);
  const result = await stores.priceBook.publish({
    expectedDraftRevision: input.expectedDraftRevision,
    expectedActiveSequence: input.expectedActiveSequence,
    expectedAvailabilityRevision: input.expectedAvailabilityRevision,
    createdItems: [],
    label: input.label,
    note: input.note,
    book: plan.book,
    changeSummary: plan.changes,
    audit: {
      session: actingSessionOf(cookies),
      entry: publishedEntry(plan.book.amountsProvisional),
    },
  });
  return answerOfPublish(result);
}

function answerOfPublish(result: PublishPriceBookResult): NextResponse {
  if (result.kind !== "ok") {
    return refused(PRICE_DRAFT_EVENT, dashboardConflictResponse(result.kind));
  }
  return succeeded(
    PRICE_DRAFT_EVENT,
    publishedResponse({
      versionId: result.versionId,
      sequenceNumber: result.sequenceNumber,
      availabilityRevision: result.availabilityRevision,
    }),
  );
}

/**
 * Resets the draft to empty without parsing what it holds, so it works on a draft that cannot be read (ruling R2-Q2). The
 * audit row counts the entries the draft held, or 0 when they could not be read.
 */
async function performDiscard(
  input: DiscardRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const stored = await readRawDraft(stores);
  if (stored.draftRevision !== input.expectedDraftRevision) {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("changed-meanwhile"),
    );
  }
  const revertedCount = readStoredDraft(stored.changes).ok
    ? stored.changes.length
    : 0;
  return writeDraft(stores, {
    expectedDraftRevision: input.expectedDraftRevision,
    changes: [],
    audit: {
      session: actingSessionOf(cookies),
      entry: draftDiscardedEntry(revertedCount),
    },
    answer: (draftRevision) =>
      draftChangedResponse(draftWireOf(draftRevision, [])),
  });
}

type DraftWriteToMake = WriteDraftRequest & {
  readonly answer: (draftRevision: string) => NextResponse;
};

async function writeDraft(
  stores: PriceStores,
  { answer, ...request }: DraftWriteToMake,
): Promise<NextResponse> {
  const result = await stores.priceBook.writeDraft(request);
  if (result.kind === "changed-meanwhile") {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("changed-meanwhile"),
    );
  }
  return succeeded(PRICE_DRAFT_EVENT, answer(result.draftRevision));
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

/** What a read or a write answers when there is no book to judge against, or the draft cannot be read: both are states of the data. */
function refusalOfUnreadyState(
  event: AccountEvent,
  reading: Exclude<DashboardStateReading, { readonly kind: "ready" }>,
): NextResponse {
  return refused(
    event,
    reading.kind === "no-active-version"
      ? dashboardConflictResponse("no-active-version")
      : draftUnreadableResponse(reading.draftRevision),
  );
}

function answerOfRefusal(refusal: RequestRefusal<string>): NextResponse {
  switch (refusal.kind) {
    case "malformed":
      return invalidRequestResponse();
    case "not-found":
      return versionNotFoundResponse();
    case "issues":
      return dashboardInvalidInputResponse(refusal.issues);
  }
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
