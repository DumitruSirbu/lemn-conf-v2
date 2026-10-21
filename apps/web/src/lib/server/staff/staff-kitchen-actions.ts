import "server-only";

import type { NextResponse } from "next/server";

import {
  isDesignId,
  isRequestStatus,
  judgeNoteText,
  type Capability,
  type RequestStatus,
} from "@lemnaria/configurator-domain";
import {
  StaffKitchenActionError,
  type AddStaffNoteResult,
  type SetRequestStatusResult,
  type StaffActingSession,
  type UnhideKitchenResult,
} from "@lemnaria/persistence";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import { parseJsonObject } from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  forbiddenResponse,
  invalidRequestResponse,
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
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { sha256Hex } from "@/lib/server/sha256-hex";
import { getStaffKitchenActionsStore } from "@/lib/server/staff/staff-kitchen-actions-store-instance";
import {
  staffConflictResponse,
  staffInvalidInputResponse,
  staffNoteAddedResponse,
  staffStatusResponse,
  staffUnhiddenResponse,
  type StaffWriteIssue,
} from "@/lib/server/staff/staff-responses";

// E-L3-3, E-L3-4 and E-L3-5 of the Lot 3 plan: what a staff member writes on a client's kitchen (ADR 0173). The route
// has checked the origin, the media type and the body's size. From there the common order is: the session, the
// capability the write names, the id's shape, the body's members, the account's own bucket (which **fails closed**),
// and only then the store, which commits the change and its audit row together or neither. A live session is not an
// authorised one, so `requireCapability` runs before any store method: a client's session reaches no store and leaves
// no row. Everything here is called inside the route's `answerUnavailableOnFailure`, so anything thrown that this file
// does not map is a `503` that carries no cause, no note text and no kitchen data.

interface StaffActionRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
  /** The URL segment as it arrived: its shape is judged here. */
  readonly designId: string;
}

export interface StaffBodyActionRequest extends StaffActionRequest {
  /** The body's text, already read to its bound by the route. */
  readonly bodyText: string;
}

type StaffWriteEvent = Extract<
  AccountEvent,
  "staff-note" | "staff-status" | "staff-unhide"
>;

type StaffAdmission =
  | { readonly kind: "admitted"; readonly session: SignedInSession }
  | { readonly kind: "refused"; readonly response: NextResponse };

type Judged<Value> =
  | { readonly kind: "judged"; readonly value: Value }
  | { readonly kind: "refused"; readonly response: NextResponse };

type StatusIssueCode = Extract<StaffWriteIssue, { field: "status" }>["code"];

/** E-L3-3. The text is judged by the domain (NFC, trimmed, 1 to 2000 characters, no control or bidi-override
 *  character) and the judged form is what the store writes and the `201` answers. */
export async function addNoteAsStaff(
  request: StaffBodyActionRequest,
): Promise<NextResponse> {
  const event = "staff-note";
  return withAdmittedStaff(request, event, "note.write", async (session) => {
    const judged = judgedNoteText(request.bodyText);
    if (judged.kind === "refused") return refusal(event, judged.response);
    const limited = await refusalOfWriteLimit(event, session, request.headers);
    if (limited !== undefined) return limited;
    const result = await getStaffKitchenActionsStore().addNote({
      session: actingSessionOf(request.cookies),
      designId: request.designId,
      text: judged.value,
    });
    return answerOfNote(result, request.designId);
  });
}

/** E-L3-4. Any listed status may follow any; the store decides sent, unchanged and moved-meanwhile. */
export async function setStatusAsStaff(
  request: StaffBodyActionRequest,
): Promise<NextResponse> {
  const event = "staff-status";
  const capability = "contact.update-status";
  return withAdmittedStaff(request, event, capability, async (session) => {
    const judged = judgedStatus(request.bodyText);
    if (judged.kind === "refused") return refusal(event, judged.response);
    const limited = await refusalOfWriteLimit(event, session, request.headers);
    if (limited !== undefined) return limited;
    const result = await getStaffKitchenActionsStore().setStatus({
      session: actingSessionOf(request.cookies),
      designId: request.designId,
      status: judged.value,
    });
    return answerOfStatus(result, request.designId);
  });
}

/** E-L3-5. It takes no body: the request's body is never read. */
export async function unhideKitchenAsStaff(
  request: StaffActionRequest,
): Promise<NextResponse> {
  const event = "staff-unhide";
  return withAdmittedStaff(request, event, "design.unhide", async (session) => {
    const limited = await refusalOfWriteLimit(event, session, request.headers);
    if (limited !== undefined) return limited;
    const result = await getStaffKitchenActionsStore().unhide({
      session: actingSessionOf(request.cookies),
      designId: request.designId,
    });
    return answerOfUnhide(result, request.designId);
  });
}

/**
 * Steps 3 to 5 of the common order, then the write's own work. The session is read by the variant that throws: a store
 * that is down is the caller's `503` and never an anonymous reading. `401` is no live session, `403` a live session
 * without the capability (a client, or a staff address not yet confirmed). An id that is not a design id's shape gets
 * the one kitchen refusal without a store being asked.
 */
async function withAdmittedStaff(
  request: StaffActionRequest,
  event: StaffWriteEvent,
  capability: Capability,
  work: (session: SignedInSession) => Promise<NextResponse>,
): Promise<NextResponse> {
  const admission = await admitStaff(request.cookies, event, capability);
  if (admission.kind === "refused") return admission.response;
  if (!isDesignId(request.designId)) return notFound(event, request.designId);
  try {
    return await work(admission.session);
  } catch (failure) {
    return answerOfStoreFailure(event, failure);
  }
}

async function admitStaff(
  cookies: SessionCookieReader,
  event: StaffWriteEvent,
  capability: Capability,
): Promise<StaffAdmission> {
  const session = await readCurrentSessionOrThrow(cookies);
  const check = requireCapability(session, capability);
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

// ---------------------------------------------------------------------------------------------------------------------
// The body

function judgedNoteText(bodyText: string): Judged<string> {
  const member = onlyMemberOf(bodyText, "text");
  if (member.kind === "refused") return member;
  const judgement = judgeNoteText(member.value);
  if (judgement.ok) return { kind: "judged", value: judgement.text };
  return refusedInput({ field: "text", code: judgement.code });
}

function judgedStatus(bodyText: string): Judged<RequestStatus> {
  const member = onlyMemberOf(bodyText, "status");
  if (member.kind === "refused") return member;
  if (isRequestStatus(member.value)) {
    return { kind: "judged", value: member.value };
  }
  return refusedInput({
    field: "status",
    code: statusIssueCodeOf(member.value),
  });
}

/** The body is an object whose only member, if it has one, is the one this route takes. Any other member, whatever its
 *  name, is a request this route does not read, and its name is not echoed. The member itself is judged by the caller:
 *  an absent member is `undefined`. */
function onlyMemberOf(bodyText: string, name: string): Judged<unknown> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return refusedRequest();
  if (Object.keys(body).some((member) => member !== name)) {
    return refusedRequest();
  }
  const value = Object.hasOwn(body, name) ? body[name] : undefined;
  return { kind: "judged", value };
}

function statusIssueCodeOf(value: unknown): StatusIssueCode {
  if (value === undefined) return "REQUIRED";
  return typeof value === "string" ? "STATUS_NOT_IN_LIST" : "NOT_TEXT";
}

function refusedRequest(): Judged<never> {
  return { kind: "refused", response: invalidRequestResponse() };
}

function refusedInput(issue: StaffWriteIssue): Judged<never> {
  return { kind: "refused", response: staffInvalidInputResponse([issue]) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The limiter and the store

/** One write counted in the account's own bucket, once, before the store is asked. The bucket is the account's, so the
 *  network and the session that asked do not matter, and a bucket that cannot be counted is `503` and writes nothing:
 *  a write fails closed (ADR 0156). */
async function refusalOfWriteLimit(
  purpose: StaffWriteEvent,
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

/** The store takes the actor from the live session the cookie names, so no caller can name another account. */
function actingSessionOf(cookies: SessionCookieReader): StaffActingSession {
  const sessionValue = readSessionCookie(cookies);
  if (sessionValue === undefined) {
    throw new Error("A staff write has no session cookie to name its actor.");
  }
  return {
    sessionTokenHash: sha256Hex(sessionValue),
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

function answerOfNote(
  result: AddStaffNoteResult,
  designId: string,
): NextResponse {
  const event = "staff-note";
  if (result.kind === "kitchen-not-found") return notFound(event, designId);
  return succeeded(event, staffNoteAddedResponse(result.note));
}

function answerOfStatus(
  result: SetRequestStatusResult,
  designId: string,
): NextResponse {
  const event = "staff-status";
  switch (result.kind) {
    case "saved":
      return succeeded(event, staffStatusResponse(result.saved));
    case "unchanged":
      return succeeded(event, staffStatusResponse(result.current));
    case "kitchen-not-found":
      return notFound(event, designId);
    case "not-sent":
    case "status-not-recognised":
    case "changed-meanwhile":
      return refusal(event, staffConflictResponse(result.kind));
  }
}

function answerOfUnhide(
  result: UnhideKitchenResult,
  designId: string,
): NextResponse {
  const event = "staff-unhide";
  switch (result.kind) {
    case "unhidden":
      return succeeded(event, staffUnhiddenResponse());
    case "not-hidden":
      return refusal(event, staffConflictResponse("not-hidden"));
    case "kitchen-not-found":
      return notFound(event, designId);
  }
}

/**
 * What a thrown store error becomes (the port's documented mapping): no live session behind the call is `401`, and a
 * refusal of the note's text or the status is `400` naming that field. Every other failure, and anything that is not a
 * store error, is thrown on to the route's wrapper, which answers `503` with no detail. A refusal of the audit record
 * (a malformed session hash, say) is a defect of ours and not a field a person can correct, so it is a `503` too.
 */
function answerOfStoreFailure(
  event: StaffWriteEvent,
  failure: unknown,
): NextResponse {
  if (!(failure instanceof StaffKitchenActionError)) throw failure;
  if (failure.failure === "not-recorded") {
    return refusal(event, unauthenticatedResponse());
  }
  if (failure.failure === "invalid-request") {
    if (failure.refusal === "NOTE_TEXT_NOT_JUDGED") {
      return refusal(
        event,
        staffInvalidInputResponse([
          { field: "text", code: "NOTE_TEXT_NOT_JUDGED" },
        ]),
      );
    }
    if (failure.refusal === "STATUS_NOT_IN_LIST") {
      return refusal(
        event,
        staffInvalidInputResponse([
          { field: "status", code: "STATUS_NOT_IN_LIST" },
        ]),
      );
    }
  }
  throw failure;
}

function notFound(event: StaffWriteEvent, designId: string): NextResponse {
  reportAccountEvent({ event, outcome: "refused" });
  return designNotFoundResponse(designId);
}

function refusal(event: StaffWriteEvent, response: NextResponse): NextResponse {
  reportAccountEvent({ event, outcome: "refused" });
  return response;
}

function succeeded(
  event: StaffWriteEvent,
  response: NextResponse,
): NextResponse {
  reportAccountEvent({ event, outcome: "succeeded" });
  return response;
}
