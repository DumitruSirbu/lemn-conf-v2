import "server-only";

import type { NextResponse } from "next/server";

import {
  isDesignId,
  judgeNoteText,
  judgeRequestStatus,
  type Capability,
  type RequestStatus,
} from "@lemnaria/configurator-domain";
import {
  StaffKitchenActionError,
  type AddStaffNoteResult,
  type SetRequestStatusResult,
  type StaffActingSession,
  type StaffKitchenActionRefusal,
  type StaffKitchenActionsStore,
  type UnhideKitchenResult,
} from "@lemnaria/persistence";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import { parseJsonObject } from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  invalidRequestResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import type { SignedInSession } from "@/lib/server/account/current-session";
import {
  readSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { sha256Hex } from "@/lib/server/sha256-hex";
import { admitStaff } from "@/lib/server/staff/staff-admission";
import { getStaffKitchenActionsStore } from "@/lib/server/staff/staff-kitchen-actions-store-instance";
import {
  staffConflictResponse,
  staffInvalidInputResponse,
  staffNoteAddedResponse,
  staffStatusResponse,
  staffUnhiddenResponse,
  type StaffWriteIssue,
} from "@/lib/server/staff/staff-responses";

// What a staff member writes on a client's kitchen (ADR 0173). The route has checked the origin, the media type and the
// body's size. From there the order is the same for every write: the session, the capability the write names, the id's
// shape, the body's members, the account's own bucket (which **fails closed**), and only then the store, which commits
// the change and its audit row together or neither. A live session is not an authorised one, so the capability is
// checked before any store method: a client's session reaches no store and leaves no row. Everything here runs inside
// the route's `answerUnavailableOnFailure`, so anything thrown that this file does not map is a `503` that carries no
// cause, no note text and no kitchen data.

/** The log event of each write, defined once: the routes name their failure wrapper by it too. */
export const STAFF_WRITE_EVENTS = {
  note: "staff-note",
  status: "staff-status",
  unhide: "staff-unhide",
} as const satisfies Record<string, AccountEvent>;

type StaffWriteEvent =
  (typeof STAFF_WRITE_EVENTS)[keyof typeof STAFF_WRITE_EVENTS];

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

type Judged<Value> =
  | { readonly kind: "judged"; readonly value: Value }
  | { readonly kind: "refused"; readonly response: NextResponse };

interface StoreTarget {
  readonly session: StaffActingSession;
  readonly designId: string;
}

/** A refusal of its input a store may throw for this write, and the field it is answered under. Each means the
 *  domain and the store disagree about what was judged, which is a defect of ours; the store's documented mapping
 *  still answers them `400` naming the field. */
interface StoreRefusalAnswer {
  readonly refusal: StaffKitchenActionRefusal;
  readonly issue: StaffWriteIssue;
}

/** What a status save takes from the body: the status asked for, and the one the page last saw (`from` on the wire),
 *  which the store compares with the status now stored. */
interface StatusSaveInput {
  readonly status: RequestStatus;
  readonly seenStatus: RequestStatus;
}

interface StaffWrite<Input, Result> {
  readonly event: StaffWriteEvent;
  readonly capability: Capability;
  readonly judge: (bodyText: string) => Judged<Input>;
  readonly call: (
    store: StaffKitchenActionsStore,
    target: StoreTarget,
    input: Input,
  ) => Promise<Result>;
  readonly answer: (result: Result, designId: string) => NextResponse;
  /** The refusals of its input this write's store may throw, each answered under its own field. */
  readonly storeRefusals: readonly StoreRefusalAnswer[];
}

const NOTE_WRITE: StaffWrite<string, AddStaffNoteResult> = {
  event: STAFF_WRITE_EVENTS.note,
  capability: "note.write",
  judge: judgedNoteText,
  call: (store, target, text) => store.addNote({ ...target, text }),
  answer: answerOfNote,
  storeRefusals: [
    {
      refusal: "NOTE_TEXT_NOT_JUDGED",
      issue: { field: "text", code: "NOTE_TEXT_NOT_JUDGED" },
    },
  ],
};

const STATUS_WRITE: StaffWrite<StatusSaveInput, SetRequestStatusResult> = {
  event: STAFF_WRITE_EVENTS.status,
  capability: "contact.update-status",
  judge: judgedStatusSave,
  call: (store, target, input) => store.setStatus({ ...target, ...input }),
  answer: answerOfStatus,
  storeRefusals: [
    {
      refusal: "STATUS_NOT_IN_LIST",
      issue: { field: "status", code: "STATUS_NOT_IN_LIST" },
    },
    {
      refusal: "SEEN_STATUS_NOT_IN_LIST",
      issue: { field: "from", code: "STATUS_NOT_IN_LIST" },
    },
  ],
};

const UNHIDE_WRITE: StaffWrite<undefined, UnhideKitchenResult> = {
  event: STAFF_WRITE_EVENTS.unhide,
  capability: "design.unhide",
  judge: () => ({ kind: "judged", value: undefined }),
  call: (store, target) => store.unhide(target),
  answer: answerOfUnhide,
  storeRefusals: [],
};

/** The text is judged by the domain (NFC, trimmed, 1 to 2000 characters, no control or bidi-override character) and the
 *  judged form is what the store writes and the `201` answers. */
export function addNoteAsStaff(
  request: StaffBodyActionRequest,
): Promise<NextResponse> {
  return runStaffWrite(NOTE_WRITE, request, request.bodyText);
}

/** Any listed status may follow any, made against the status the page last saw (`from`); the store decides sent,
 *  unchanged, and moved since the page read the kitchen. */
export function setStatusAsStaff(
  request: StaffBodyActionRequest,
): Promise<NextResponse> {
  return runStaffWrite(STATUS_WRITE, request, request.bodyText);
}

/** It takes no body: the request's body is never read. */
export function unhideKitchenAsStaff(
  request: StaffActionRequest,
): Promise<NextResponse> {
  return runStaffWrite(UNHIDE_WRITE, request, "");
}

async function runStaffWrite<Input, Result>(
  write: StaffWrite<Input, Result>,
  request: StaffActionRequest,
  bodyText: string,
): Promise<NextResponse> {
  const { cookies, designId } = request;
  const { event, capability } = write;
  const admission = await admitStaff({ cookies, event, capability });
  if (admission.kind === "refused") return admission.response;
  if (!isDesignId(designId)) return notFound(event, designId);
  try {
    return await performWrite(write, request, admission.session, bodyText);
  } catch (failure) {
    return answerOfStoreFailure(write, failure);
  }
}

async function performWrite<Input, Result>(
  write: StaffWrite<Input, Result>,
  { cookies, headers, designId }: StaffActionRequest,
  session: SignedInSession,
  bodyText: string,
): Promise<NextResponse> {
  const judged = write.judge(bodyText);
  if (judged.kind === "refused") return refusal(write.event, judged.response);
  const limited = await refusalOfWriteLimit(write.event, session, headers);
  if (limited !== undefined) return limited;
  const target = { session: actingSessionOf(cookies), designId };
  const result = await write.call(
    getStaffKitchenActionsStore(),
    target,
    judged.value,
  );
  return write.answer(result, designId);
}

// ---------------------------------------------------------------------------------------------------------------------
// The body

function judgedNoteText(bodyText: string): Judged<string> {
  const members = onlyMembersOf(bodyText, ["text"]);
  if (members.kind === "refused") return members;
  const judgement = judgeNoteText(members.value.text);
  if (judgement.ok) return { kind: "judged", value: judgement.text };
  return refusedInput({ field: "text", code: judgement.code });
}

/** Both members are judged and every refusal is answered at once, so a person who sent two bad members is told both. */
function judgedStatusSave(bodyText: string): Judged<StatusSaveInput> {
  const members = onlyMembersOf(bodyText, ["status", "from"]);
  if (members.kind === "refused") return members;
  const status = judgeRequestStatus(members.value.status);
  const seen = judgeRequestStatus(members.value.from);
  if (status.ok && seen.ok) {
    return {
      kind: "judged",
      value: { status: status.status, seenStatus: seen.status },
    };
  }
  return refusedInputs([
    ...(status.ok ? [] : [{ field: "status", code: status.code } as const]),
    ...(seen.ok ? [] : [{ field: "from", code: seen.code } as const]),
  ]);
}

/** The body is an object whose members are among the ones this route takes. Any other member, whatever its name, is a
 *  request this route does not read, and its name is not echoed. Each member is judged by the caller: an absent member is
 *  `undefined`. */
function onlyMembersOf<Name extends string>(
  bodyText: string,
  names: readonly Name[],
): Judged<Readonly<Record<Name, unknown>>> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return refusedRequest();
  const allowed: readonly string[] = names;
  if (Object.keys(body).some((member) => !allowed.includes(member))) {
    return refusedRequest();
  }
  const value = Object.fromEntries(
    names.map((name) => [
      name,
      Object.hasOwn(body, name) ? body[name] : undefined,
    ]),
  ) as Record<Name, unknown>;
  return { kind: "judged", value };
}

function refusedRequest(): Judged<never> {
  return { kind: "refused", response: invalidRequestResponse() };
}

function refusedInput(issue: StaffWriteIssue): Judged<never> {
  return refusedInputs([issue]);
}

function refusedInputs(issues: readonly StaffWriteIssue[]): Judged<never> {
  return { kind: "refused", response: staffInvalidInputResponse(issues) };
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
  const event = STAFF_WRITE_EVENTS.note;
  if (result.kind === "kitchen-not-found") return notFound(event, designId);
  return succeeded(event, staffNoteAddedResponse(result.note));
}

function answerOfStatus(
  result: SetRequestStatusResult,
  designId: string,
): NextResponse {
  const event = STAFF_WRITE_EVENTS.status;
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
  const event = STAFF_WRITE_EVENTS.unhide;
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
 * refusal of its input that this write's store can make is `400` naming that field. Every other failure, a refusal
 * that belongs to another write included, and anything that is not a store error, is thrown on to the route's wrapper,
 * which answers `503` with no detail. A refusal of the audit record (a malformed session hash, say) is a defect of ours
 * and not a field a person can correct, so it is a `503` too.
 */
function answerOfStoreFailure(
  {
    event,
    storeRefusals,
  }: Pick<StaffWrite<unknown, unknown>, "event" | "storeRefusals">,
  failure: unknown,
): NextResponse {
  if (!(failure instanceof StaffKitchenActionError)) throw failure;
  if (failure.failure === "not-recorded") {
    return refusal(event, unauthenticatedResponse());
  }
  const own = storeRefusals.find(
    (candidate) =>
      failure.failure === "invalid-request" &&
      failure.refusal === candidate.refusal,
  );
  if (own === undefined) throw failure;
  return refusal(event, staffInvalidInputResponse([own.issue]));
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
