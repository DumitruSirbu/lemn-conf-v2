import {
  INITIAL_REQUEST_STATUS,
  isRequestStatus,
  judgeNoteText,
  judgeRequestStatus,
} from "@lemnaria/configurator-domain";
import type { RequestStatus } from "@lemnaria/configurator-domain";

import { STORED_ID_SHAPE } from "./staff-audit-store.js";
import type {
  StaffAuditAccountRef,
  StaffAuditRecord,
  StaffAuditRecordRefusal,
  StaffAuditStoreError,
} from "./staff-audit-store.js";
import type { StaffKitchenNote } from "./staff-kitchen-reader.js";

export type StaffKitchenActionOperation =
  | "add a staff note"
  | "set a request status"
  | "unhide a kitchen";

/**
 * Why a call failed, in the few kinds a route acts on:
 * - `unavailable`: a table is missing (42P01) or the application role lacks a grant (42501). The route answers 503.
 * - `not-recorded`: no live session stood behind the call, so nothing was written (the audit store's word for it).
 * - `invalid-request`: code refused the request before any statement (see `StaffKitchenActionRefusal`).
 * - `unexpected-answer`: the database answered with something that is not the row this port reads.
 * - `database`: any other refusal or failure.
 *
 * A route that must not answer without a committed audit row treats every kind as a failure to answer. A kitchen that is
 * unknown, not sent or not hidden is **not** a failure: it is an outcome (see the three result types).
 */
export type StaffKitchenActionFailure =
  | "unavailable"
  | "not-recorded"
  | "invalid-request"
  | "unexpected-answer"
  | "database";

/** What an `invalid-request` was refused for. A code, never the value. */
export type StaffKitchenActionRefusal =
  | StaffAuditRecordRefusal
  | "NOTE_TEXT_NOT_JUDGED"
  | "STATUS_NOT_IN_LIST"
  | "SEEN_STATUS_NOT_IN_LIST";

const FAILURE_REASON: Readonly<Record<StaffKitchenActionFailure, string>> = {
  unavailable: "a table it writes, or the grant to write it, is not in place",
  "not-recorded": "no live session stood behind the call, so it wrote nothing",
  "invalid-request": "the request is not one this store writes",
  "unexpected-answer":
    "the database answered with something this port does not read",
  database: "the database gave no trustworthy answer",
};

/**
 * Its message is built from fixed text and holds no value: no id, address, note text or driver text. A cause, when there
 * is one, is built (ADR 0146 B3, ADR 0153 d3, the runbook's conditions on the store): the driver error's type name, its
 * SQLSTATE and its constraint's name, and nothing the driver wrote. A `23514` error's `DETAIL` quotes the failing row,
 * note text included, so no driver field other than those two leaves the store. The store logs nothing.
 */
export class StaffKitchenActionError extends Error {
  readonly operation: StaffKitchenActionOperation;
  readonly failure: StaffKitchenActionFailure;
  /** Set for `invalid-request` only. */
  readonly refusal: StaffKitchenActionRefusal | undefined;

  constructor(
    operation: StaffKitchenActionOperation,
    failure: StaffKitchenActionFailure,
    options?: ErrorOptions & { readonly refusal?: StaffKitchenActionRefusal },
  ) {
    super(
      `The staff kitchen actions store could not ${operation}: ${FAILURE_REASON[failure]}${
        options?.refusal === undefined ? "" : ` (${options.refusal})`
      }.`,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "StaffKitchenActionError";
    this.operation = operation;
    this.failure = failure;
    this.refusal = options?.refusal;
  }
}

/**
 * The staff member the call acts for, as the session that stands behind it. There is no account member and no actor:
 * the author of a note, the account that changed a status and the actor of the audit row are the account of the live
 * session the hash names, taken by the statement that writes, so no caller can name another account.
 */
export type StaffActingSession = Pick<
  StaffAuditRecord,
  "sessionTokenHash" | "idleLifetimeSeconds"
>;

export interface AddStaffNoteRequest {
  readonly session: StaffActingSession;
  readonly designId: string;
  /** As the domain's `judgeNoteText` returned it; the store judges it again and refuses any text that would change. */
  readonly text: string;
}

export interface SetRequestStatusRequest {
  readonly session: StaffActingSession;
  readonly designId: string;
  readonly status: RequestStatus;
  /**
   * The status the person last saw on the kitchen (`new` while none was saved). A save is made against it: when the
   * kitchen's current status is another, someone else changed it since, and nothing is written. Not the audit row's
   * `from`, which is always the status the write really replaced.
   */
  readonly seenStatus: RequestStatus;
}

export interface UnhideKitchenRequest {
  readonly session: StaffActingSession;
  readonly designId: string;
}

/**
 * `kitchen-not-found` answers an unknown id, a malformed id, a kitchen its client deleted, and a visitor's unsent draft
 * alike: the one kitchen refusal.
 *
 * The answer a route gives: `added` is `201` with the note; `kitchen-not-found` is the byte-identical kitchen refusal
 * every staff route gives.
 */
export type AddStaffNoteResult =
  | { readonly kind: "added"; readonly note: StaffKitchenNote }
  | { readonly kind: "kitchen-not-found" };

/** A status as it is saved: the code, who set it and when. */
export interface SavedRequestStatus {
  readonly value: RequestStatus;
  readonly by: StaffAuditAccountRef;
  readonly at: Date;
}

/**
 * - `saved`: the status was written and its audit row committed with it.
 * - `unchanged`: the kitchen already shows this status. Nothing was written and **no audit row either**: a save that
 *   changes nothing is not a change to account for. `current` is the saved row, or `null` when none was ever saved and
 *   the request was for `new`, the status a sent kitchen shows without one.
 * - `kitchen-not-found`: the one kitchen refusal.
 * - `not-sent`: the kitchen is not sent, so it has no request to give a status.
 * - `status-not-recognised`: the stored status is outside this build's list, so the change cannot be audited (its `from`
 *   must be a listed code) and the stored text is **not** read as `new`. Nothing was written.
 * - `changed-meanwhile`: the status is not the one the person saw (`seenStatus`), or was saved by someone else between the
 *   store's read and its write. Nothing was written and no audit row either; the audit row's `from` is always the status
 *   the write replaced, so the call does not guess. It wins over `unchanged`: a save of the status now stored is still
 *   refused when the person saw another, so the page reads the kitchen again instead of reporting a save it did not make.
 *
 * The answer a route gives:
 * - `saved`: `200 {status, changedBy, changedAt}`.
 * - `unchanged`: `200` with the same body; with `current` null it is `{status: "new", changedBy: null, changedAt: null}`,
 *   and the page shows a null last change as nothing.
 * - `changed-meanwhile`: `409 {status: "changed-meanwhile"}`. The route does not retry; the page keeps the selection and
 *   reads the kitchen again. A stale page, which sends the status it last saw, gets this and not a silent overwrite.
 * - `status-not-recognised`: `409 {status: "status-not-recognised"}`. A data condition and not an outage: the person is
 *   told to contact an administrator.
 * - `not-sent`: `409 {status: "not-sent"}`.
 * - `kitchen-not-found`: the byte-identical kitchen refusal.
 */
export type SetRequestStatusResult =
  | { readonly kind: "saved"; readonly saved: SavedRequestStatus }
  | {
      readonly kind: "unchanged";
      readonly current: SavedRequestStatus | null;
    }
  | { readonly kind: "kitchen-not-found" }
  | { readonly kind: "not-sent" }
  | { readonly kind: "status-not-recognised" }
  | { readonly kind: "changed-meanwhile" };

/**
 * `not-hidden`: the kitchen is visible to staff but its client has not hidden it (or a first call already unhid it);
 * nothing was written and no audit row either.
 *
 * The answer a route gives: `unhidden` is `204`; `not-hidden` is `409 {status: "not-hidden"}`; `kitchen-not-found` is the
 * byte-identical kitchen refusal.
 *
 * What an unhide does not do: it clears `hidden_by_client_at` and nothing else. A share link the client's hide revoked
 * stays revoked, and the shop's copy of the kitchen as sent (`contact_submission_views`) is never touched.
 */
export type UnhideKitchenResult =
  | { readonly kind: "unhidden" }
  | { readonly kind: "kitchen-not-found" }
  | { readonly kind: "not-hidden" };

/**
 * The staff arm for writing on kitchens, apart from the client arm so no predicate of theirs is shared or loosened. Every method writes its audit row **in the same transaction** as the change, so neither exists
 * without the other, and takes the actor from the session in the same statement. A kitchen is visible to staff on the
 * reader's two tests, and the writes use the same two: a client-deleted kitchen and a visitor's unsent draft are
 * `kitchen-not-found`, so a note can never be written on a kitchen that can never be read.
 *
 * None of the writes is retried: the audit event's id is minted once, and a repeat after a lost acknowledgement would
 * insert a second row or hit the primary key.
 *
 * **A live session is not an authorised one.** The store proves the session is live and takes the actor from it; it does
 * not ask what the account may do. A route must call `requireCapability` (`note.write`, `contact.update-status`,
 * `design.unhide`) before it calls any method here.
 *
 * What a thrown `StaffKitchenActionError` becomes at a route, by `failure`: `not-recorded` is `401`; `invalid-request` is
 * `400` naming the field (`text` or `status`); `unavailable`, `unexpected-answer` and `database` are `503` with no
 * detail.
 */
export interface StaffKitchenActionsStore {
  /** Throws `StaffKitchenActionError`. Allowed on drafts and hidden kitchens. */
  addNote(request: AddStaffNoteRequest): Promise<AddStaffNoteResult>;
  /** Throws `StaffKitchenActionError`. Any status may follow any. */
  setStatus(request: SetRequestStatusRequest): Promise<SetRequestStatusResult>;
  /** Throws `StaffKitchenActionError`. Writes `hidden_by_client_at` alone, so the kitchen keeps its place in a list. */
  unhide(request: UnhideKitchenRequest): Promise<UnhideKitchenResult>;
}

/** `designs.id` as `design_notes`, `design_request_states` and `staff_audit_events` (`0020`-`0022`) hold it. A kitchen
 *  with an older id, which `designs` allows, cannot be written on, so it reads as not found. */
export function isActionableDesignId(value: unknown): value is string {
  return typeof value === "string" && STORED_ID_SHAPE.test(value);
}

/** Refuses a note the domain would not have stored as given; throws an `invalid-request` error. */
export function requireJudgedNoteText(text: unknown): asserts text is string {
  const judgement = judgeNoteText(text);
  if (judgement.ok && judgement.text === text) return;
  throw refusedRequest("add a staff note", "NOTE_TEXT_NOT_JUDGED");
}

/**
 * Refuses a status the domain's `judgeRequestStatus` does not accept, so the route and the store cannot disagree about
 * what a status is; throws an `invalid-request` error. The store is only reached with a judged status, so every refusal
 * (missing, not text, not listed) is a defect in the caller and carries the one published code, `STATUS_NOT_IN_LIST`.
 */
export function requireListedRequestStatus(
  status: unknown,
): asserts status is RequestStatus {
  if (judgeRequestStatus(status).ok) return;
  throw refusedRequest("set a request status", "STATUS_NOT_IN_LIST");
}

/** The same test for the status the person saw, under a code of its own so a route answers it against its own member. */
export function requireListedSeenStatus(
  seenStatus: unknown,
): asserts seenStatus is RequestStatus {
  if (judgeRequestStatus(seenStatus).ok) return;
  throw refusedRequest("set a request status", "SEEN_STATUS_NOT_IN_LIST");
}

/** What `setStatus` finds before it writes: `null` for a kitchen staff cannot see, else whether it is sent and the
 *  stored status text, whatever it is (`null` while none was saved). */
export interface StatusSaveFacts {
  readonly kitchen: {
    readonly isSent: boolean;
    readonly storedStatus: string | null;
  } | null;
  readonly requested: RequestStatus;
  /** The status the person saw when they chose. */
  readonly seen: RequestStatus;
}

/**
 * `write` names the status the write replaces (`from`, which is `new` while none was saved) and the stored text the write
 * must still find when it runs (`expectedStored`, `null` while no row exists), so the audit row's `from` is the status
 * that was really replaced and not a stale one.
 */
export type StatusSaveDecision =
  | { readonly kind: "kitchen-not-found" }
  | { readonly kind: "not-sent" }
  | { readonly kind: "status-not-recognised" }
  | { readonly kind: "changed-meanwhile" }
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "write";
      readonly from: RequestStatus;
      readonly expectedStored: RequestStatus | null;
    };

/**
 * The rules of a status save, apart from where the facts are kept. A stored text outside the list is never read as
 * `new`, and so is judged before the seen status is compared with it. A kitchen whose current status is not the one the
 * person saw is `changed-meanwhile`, whatever was asked for. Only then is a save for the status the kitchen already shows
 * `unchanged`, and that includes `new` on a kitchen with no saved status: no row is created for it.
 */
export function decideStatusSave(facts: StatusSaveFacts): StatusSaveDecision {
  const { kitchen, requested, seen } = facts;
  if (kitchen === null) return { kind: "kitchen-not-found" };
  if (!kitchen.isSent) return { kind: "not-sent" };
  const { storedStatus } = kitchen;
  if (storedStatus !== null && !isRequestStatus(storedStatus)) {
    return { kind: "status-not-recognised" };
  }
  const from = storedStatus ?? INITIAL_REQUEST_STATUS;
  if (from !== seen) return { kind: "changed-meanwhile" };
  if (from === requested) return { kind: "unchanged" };
  return { kind: "write", from, expectedStored: storedStatus };
}

/**
 * An audit store's failure, as this store's. The audit store builds the cause (type name, SQLSTATE, constraint name), so
 * it is passed on as built.
 */
export function actionErrorFromAudit(
  operation: StaffKitchenActionOperation,
  audit: StaffAuditStoreError,
): StaffKitchenActionError {
  const options = { cause: audit.cause };
  if (audit.failure === "invalid-record") {
    return new StaffKitchenActionError(operation, "invalid-request", {
      ...options,
      ...(audit.refusal === undefined ? {} : { refusal: audit.refusal }),
    });
  }
  return new StaffKitchenActionError(operation, audit.failure, options);
}

function refusedRequest(
  operation: StaffKitchenActionOperation,
  refusal: StaffKitchenActionRefusal,
): StaffKitchenActionError {
  return new StaffKitchenActionError(operation, "invalid-request", {
    refusal,
  });
}
