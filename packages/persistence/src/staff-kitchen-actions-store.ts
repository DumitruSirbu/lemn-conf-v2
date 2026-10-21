import {
  INITIAL_REQUEST_STATUS,
  isRequestStatus,
  judgeNoteText,
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
  | "STATUS_NOT_IN_LIST";

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
}

export interface UnhideKitchenRequest {
  readonly session: StaffActingSession;
  readonly designId: string;
}

/** `kitchen-not-found` answers an unknown id, a malformed id, a kitchen its client deleted, and a visitor's unsent draft
 *  alike: the one kitchen refusal. */
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
 * - `changed-meanwhile`: the status was saved by someone else between the read and the write. Nothing was written; the
 *   audit row's `from` is always the status the write replaced, so the call does not guess.
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

/** `not-hidden`: the kitchen is visible to staff but its client has not hidden it (or a first call already unhid it);
 *  nothing was written and no audit row either. */
export type UnhideKitchenResult =
  | { readonly kind: "unhidden" }
  | { readonly kind: "kitchen-not-found" }
  | { readonly kind: "not-hidden" };

/**
 * The staff arm for writing on kitchens (plan CG-L3-10, P-L3-3), apart from the client arm so no predicate of theirs is
 * shared or loosened. Every method writes its audit row **in the same transaction** as the change, so neither exists
 * without the other, and takes the actor from the session in the same statement. A kitchen is visible to staff on the
 * reader's two tests, and the writes use the same two: a client-deleted kitchen and a visitor's unsent draft are
 * `kitchen-not-found`, so a note can never be written on a kitchen that can never be read.
 *
 * None of the writes is retried: the audit event's id is minted once, and a repeat after a lost acknowledgement would
 * insert a second row or hit the primary key.
 */
export interface StaffKitchenActionsStore {
  /** Throws `StaffKitchenActionError`. Allowed on drafts and hidden kitchens (P-L3-5). */
  addNote(request: AddStaffNoteRequest): Promise<AddStaffNoteResult>;
  /** Throws `StaffKitchenActionError`. Any status may follow any (P-L3-8). */
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

/** Refuses a status outside the domain's list; throws an `invalid-request` error. */
export function requireListedRequestStatus(
  status: unknown,
): asserts status is RequestStatus {
  if (isRequestStatus(status)) return;
  throw refusedRequest("set a request status", "STATUS_NOT_IN_LIST");
}

/** What `setStatus` finds before it writes: `null` for a kitchen staff cannot see, else whether it is sent and the
 *  stored status text, whatever it is (`null` while none was saved). */
export interface StatusSaveFacts {
  readonly kitchen: {
    readonly isSent: boolean;
    readonly storedStatus: string | null;
  } | null;
  readonly requested: RequestStatus;
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
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "write";
      readonly from: RequestStatus;
      readonly expectedStored: RequestStatus | null;
    };

/**
 * The rules of a status save, apart from where the facts are kept. A stored text outside the list is never read as
 * `new`. A save for the status the kitchen already shows is `unchanged`, and that includes `new` on a kitchen with no
 * saved status: no row is created for it.
 */
export function decideStatusSave(facts: StatusSaveFacts): StatusSaveDecision {
  const { kitchen, requested } = facts;
  if (kitchen === null) return { kind: "kitchen-not-found" };
  if (!kitchen.isSent) return { kind: "not-sent" };
  const { storedStatus } = kitchen;
  if (storedStatus !== null && !isRequestStatus(storedStatus)) {
    return { kind: "status-not-recognised" };
  }
  const from = storedStatus ?? INITIAL_REQUEST_STATUS;
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
