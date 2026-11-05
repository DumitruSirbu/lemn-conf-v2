import "server-only";

import type { NextResponse } from "next/server";

import {
  countPendingPrices,
  createdItemsOf,
  type CatalogueAvailability,
  type PriceCatalogueSection,
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
  planAccessoryCreation,
  planHardwareClassCreation,
} from "@/lib/server/price-dashboard/creation-plans";
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
  itemInUseResponse,
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
import { refusalOfDeletions } from "@/lib/server/price-dashboard/deletion-refusal";
import {
  planBulk,
  planChange,
  planRevert,
  type DraftPlan,
} from "@/lib/server/price-dashboard/draft-plans";
import {
  isDiscardRequest,
  readBulkRequest,
  readCreateAccessoryRequest,
  readCreateHardwareClassRequest,
  readDraftChangeRequest,
  readRevertRequest,
  type BulkRequest,
  type CreateAccessoryRequest,
  type CreateHardwareClassRequest,
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
import { isVersionId } from "@/lib/server/price-dashboard/identifier-shape";
import { readStoredDraft } from "@/lib/server/price-dashboard/stored-draft";
import {
  versionListWireOf,
  versionWireOf,
} from "@/lib/server/price-dashboard/version-wire";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import {
  judgeAccountSubject,
  type AccountKeyedPurpose,
} from "@/lib/server/rate-limit/judge-account-request";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { actingSessionOf } from "@/lib/server/staff/staff-acting-session";
import { admitStaff } from "@/lib/server/staff/staff-admission";
import { commitAuditRow } from "@/lib/server/staff/staff-audit-commit";
import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";

// What an administrator reads and writes of the price dashboard's draft (see ADR 0173, ADR 0178). Every route
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
  const reading = await readStateWire();
  if (reading.kind !== "ready") {
    return refusalOfUnreadyState(PRICE_READ_EVENT, reading);
  }
  return serveAudited(cookies, {
    response: dashboardStateResponse(reading.wire),
    section: "catalogue",
  });
}

/**
 * The state for a page whose own staff gate has admitted the reader. It touches no session, spends no limiter bucket
 * and writes no audit row, because a Server Component render must not write. `undefined` when there is no active
 * version or the draft cannot be read; a store that fails throws.
 */
export async function readDashboardStateForAdmittedPage(): Promise<
  DashboardStateWire | undefined
> {
  const reading = await readStateWire();
  return reading.kind === "ready" ? reading.wire : undefined;
}

/**
 * The same read, keeping what `readDashboardStateForAdmittedPage` drops: the revision of a draft that cannot be read.
 */
export function readDashboardReadingForAdmittedPage(): Promise<StateWireReading> {
  return readStateWire();
}

export type StateWireReading =
  | { readonly kind: "ready"; readonly wire: DashboardStateWire }
  | Exclude<DashboardStateReading, { readonly kind: "ready" }>;

async function readStateWire(): Promise<StateWireReading> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind !== "ready") return reading;
  const availability = await readDashboardAvailability(stores);
  return {
    kind: "ready",
    wire: stateWireOf(reading.state, availability),
  };
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
  if (!isVersionId(request.versionId)) {
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

/** What a staff request is made of: its body judged into an input, and what is done with an input once admitted. */
export interface StaffWrite<Input> {
  readonly judge: (bodyText: string) => RequestReading<Input, string>;
  readonly perform: (
    input: Input,
    cookies: SessionCookieReader,
    accountId: string,
  ) => Promise<NextResponse>;
}

type DraftWrite<Input extends { readonly expectedDraftRevision: string }> =
  StaffWrite<Input>;

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

const CREATE_HARDWARE_CLASS_WRITE: DraftWrite<CreateHardwareClassRequest> = {
  judge: readCreateHardwareClassRequest,
  perform: (input, cookies) =>
    performPlanned(input, cookies, planHardwareClassCreation),
};

const CREATE_ACCESSORY_WRITE: DraftWrite<CreateAccessoryRequest> = {
  judge: readCreateAccessoryRequest,
  perform: (input, cookies) =>
    performPlanned(input, cookies, planAccessoryCreation),
};

const PUBLISH_WRITE: DraftWrite<PublishRequest> = {
  judge: readPublishRequest,
  perform: performPublish,
};

/** Replaces the draft's change of one address, or adds it. */
export function changeDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(CHANGE_WRITE, request);
}

/**
 * Removes one change from the draft (↺), by its address, or every change of one bulk action, by its group; or, told by
 * `scope: "all"`, resets the whole draft to empty without reading it.
 */
export function revertDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(REVERT_WRITE, request);
}

/** Scales cabinet prices by a whole percentage over a scope, as one group of changes. */
export function bulkChangeDraftAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(BULK_WRITE, request);
}

/**
 * Puts a new hardware class in the draft with a rate for each mechanism, as one write. The server mints its id. A request
 * is made once: it names the draft revision it read, so a repeat of one that was answered finds the draft moved.
 */
export function createHardwareClassAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(CREATE_HARDWARE_CLASS_WRITE, request);
}

/** Puts a new linked accessory in the draft. The server mints its id, and the request is made once. */
export function createAccessoryAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(CREATE_ACCESSORY_WRITE, request);
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
  return runStaffWrite(PUBLISH_WRITE, request);
}

/** Puts an archived version's prices in the draft, replacing the pending ones of the same fields. It publishes nothing. */
export function restoreAsStaff({
  versionId,
  ...request
}: RestoreWriteRequest): Promise<NextResponse> {
  return runStaffWrite(
    {
      judge: (bodyText) => readRestoreRequest(versionId, bodyText),
      perform: performRestore,
    },
    request,
  );
}

/** What a staff request is counted and logged under: the bucket's purpose, and the event its refusals are written as. */
export interface StaffLane {
  readonly event: AccountEvent;
  readonly purpose: Extract<
    AccountKeyedPurpose,
    "staff-price-draft" | "staff-price-usage"
  >;
}

const DRAFT_LANE: StaffLane = {
  event: PRICE_DRAFT_EVENT,
  purpose: "staff-price-draft",
};

/** Every draft write's pipeline: `runStaffRequest` in the draft's own lane. */
export function runStaffWrite<Input>(
  write: StaffWrite<Input>,
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffRequest(write, request, DRAFT_LANE);
}

/**
 * Every staff request's pipeline, in the order the header gives: the session and `price.edit`, the body's members, the
 * account's bucket (which fails closed), and only then the work itself. A store that finds no live session behind the
 * request is `401`; any other failure is thrown on to the route's wrapper.
 */
export async function runStaffRequest<Input>(
  write: StaffWrite<Input>,
  request: DashboardWriteRequest,
  { event, purpose }: StaffLane,
): Promise<NextResponse> {
  const { cookies, headers, bodyText } = request;
  const admission = await admitStaff({
    cookies,
    event,
    capability: "price.edit",
  });
  if (admission.kind === "refused") return admission.response;
  const reading = write.judge(bodyText);
  if (!reading.ok) return refused(event, answerOfRefusal(reading.refusal));
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose,
      headers,
      accountId: admission.session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  try {
    return await write.perform(
      reading.value,
      cookies,
      admission.session.accountId,
    );
  } catch (failure) {
    return answerOfStoreFailure(failure, event);
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
  const ready = await readStateForWrite();
  if (ready.kind === "refused") return ready.response;
  const { stores, state } = ready;
  const stale = refusalOfStaleRevision(state, input.expectedDraftRevision);
  if (stale !== undefined) return stale;
  return writePlanned(stores, {
    plan: planOf(input, state),
    expectedDraftRevision: input.expectedDraftRevision,
    cookies,
  });
}

type StateForWrite =
  | {
      readonly kind: "ready";
      readonly stores: PriceStores;
      readonly state: ActiveDashboardState;
    }
  | { readonly kind: "refused"; readonly response: NextResponse };

/** The stores and the active state a draft write is judged against, or the refusal of a state that cannot be judged. */
async function readStateForWrite(): Promise<StateForWrite> {
  const stores = await getPriceStores();
  const reading = await readDashboardState(stores);
  if (reading.kind !== "ready") {
    return {
      kind: "refused",
      response: refusalOfUnreadyState(PRICE_DRAFT_EVENT, reading),
    };
  }
  return { kind: "ready", stores, state: reading.state };
}

/** `changed-meanwhile` when the draft moved since the page read `expectedDraftRevision`; otherwise `undefined`. */
function refusalOfStaleRevision(
  { draft }: ActiveDashboardState,
  expectedDraftRevision: string,
): NextResponse | undefined {
  return draft.draftRevision === expectedDraftRevision
    ? undefined
    : changedMeanwhile();
}

export function changedMeanwhile(): NextResponse {
  return refused(
    PRICE_DRAFT_EVENT,
    dashboardConflictResponse("changed-meanwhile"),
  );
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

/** A restore also reads its version: one no store holds is `404`, judged before a stale revision. */
async function performRestore(
  input: RestoreRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const ready = await readStateForWrite();
  if (ready.kind === "refused") return ready.response;
  const { stores, state } = ready;
  const found = await stores.priceBook.readVersion(input.versionId);
  if (found.kind !== "found") {
    return refused(PRICE_DRAFT_EVENT, versionNotFoundResponse());
  }
  const stale = refusalOfStaleRevision(state, input.expectedDraftRevision);
  if (stale !== undefined) return stale;
  return writePlanned(stores, {
    plan: planRestore(found.version, state),
    expectedDraftRevision: input.expectedDraftRevision,
    cookies,
  });
}

/**
 * A publish stores a book the domain has judged whole, and judges the draft's deletions against the usage and defaults
 * read in this request. The store takes the head's and the sequence's compare-and-set in the same transaction as the
 * insert, the draft's reset and the audit row, and refuses a deleted item a design saved since the count names, so a
 * refusal of any kind wrote nothing.
 */
async function performPublish(
  input: PublishRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const ready = await readStateForWrite();
  if (ready.kind === "refused") return ready.response;
  const { stores, state } = ready;
  const plan = planPublish(input, state);
  if (plan.kind === "refused") return refused(PRICE_DRAFT_EVENT, plan.response);
  const refusal = await refusalOfDeletions(plan, { stores, book: state.book });
  if (refusal !== undefined) return refused(PRICE_DRAFT_EVENT, refusal);
  const result = await stores.priceBook.publish({
    expectedDraftRevision: input.expectedDraftRevision,
    expectedActiveSequence: input.expectedActiveSequence,
    expectedAvailabilityRevision: input.expectedAvailabilityRevision,
    createdItems: createdItemsOf(plan.changes),
    deletedItems: plan.deletedItems,
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
  if (result.kind === "item-in-use") {
    return refused(PRICE_DRAFT_EVENT, itemInUseResponse(result.items));
  }
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
 * Resets the draft to empty without parsing what it holds, so it works on a draft that cannot be read. The audit row
 * counts the entries the draft held, or 0 when they could not be read.
 */
async function performDiscard(
  input: DiscardRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const stored = await readRawDraft(stores);
  if (stored.draftRevision !== input.expectedDraftRevision) {
    return changedMeanwhile();
  }
  const held = readStoredDraft(stored.changes);
  const revertedCount = held.ok ? countPendingPrices(held.changes) : 0;
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
  if (result.kind === "changed-meanwhile") return changedMeanwhile();
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
function answerOfStoreFailure(
  failure: unknown,
  event: AccountEvent,
): NextResponse {
  if (
    failure instanceof DashboardStoreError &&
    failure.failure === "not-recorded"
  ) {
    return refused(event, unauthenticatedResponse());
  }
  throw failure;
}

export function refused(
  event: AccountEvent,
  response: NextResponse,
): NextResponse {
  reportAccountEvent({ event, outcome: "refused" });
  return response;
}

export function succeeded(
  event: AccountEvent,
  response: NextResponse,
): NextResponse {
  reportAccountEvent({ event, outcome: "succeeded" });
  return response;
}
