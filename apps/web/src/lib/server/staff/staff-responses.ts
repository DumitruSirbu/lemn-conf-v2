import "server-only";

import { NextResponse } from "next/server";

import type { StaffKitchenQueryIssue } from "@lemnaria/configurator-domain";
import type {
  SavedRequestStatus,
  StaffAuditAccountRef,
  StaffAuditDesignRef,
  StaffAuditPage,
  StaffAuditPageRow,
  StaffAuditReading,
  StaffKitchenClient,
  StaffKitchenDetail,
  StaffKitchenNote,
  StaffKitchenPage,
  StaffKitchenRequest,
  StaffKitchenStatus,
  StaffListedKitchen,
} from "@lemnaria/persistence";

import { ACCOUNT_RESPONSE_HEADERS } from "@/lib/server/account/account-responses";
import type { StaffAuditQueryIssue } from "@/lib/server/staff/staff-audit-query";
import type {
  StaffAuditActorWire,
  StaffAuditClientWire,
  StaffAuditEntryWire,
  StaffAuditEventWire,
  StaffAuditInvalidQueryWire,
  StaffAuditKitchenWire,
  StaffAuditPageWire,
  StaffClientWire,
  StaffConflictWire,
  StaffInvalidInputWire,
  StaffInvalidQueryWire,
  StaffKitchenListWire,
  StaffKitchenNoteWire,
  StaffKitchenRequestWire,
  StaffKitchenStatusWire,
  StaffKitchenWire,
  StaffListedKitchenWire,
  StaffNoteAddedWire,
  StaffPersonWire,
  StaffStatusSavedWire,
  StaffThumbnailDesign,
  StaffWriteConflict,
  StaffWriteIssue,
} from "@/staff/staff-kitchens-wire-contract";

export type { StaffWriteConflict, StaffWriteIssue };

// The answers of the staff kitchen read and write routes that the account routes do not already give. The refusals
// (401, 403, 404, 429, 503) are `account-responses.ts`'s and `design-errors.ts`'s own, so a staff route words them as
// every other does. Every body here is shaped member by member from what the reader or the store returned: such an
// object is never spread, so a column it later gains reaches no response until it is named here. The audit actor's id is
// the only account id that leaves the server (ADR 0173, the audit page's residuals).

/** `400`: the query's members that the person can correct, as the member and a code. Never the value that was refused:
 *  the search text is a client's name or address. */
export function staffInvalidQueryResponse(
  issues: readonly StaffKitchenQueryIssue[],
): NextResponse {
  const body: StaffInvalidQueryWire = {
    status: "invalid-input",
    issues: issues.map(({ field, code }) => ({ field, code })),
  };
  return jsonResponse(body, 400);
}

/** `400` of the audit page: the query's members that the person can correct, as the member and a code. */
export function staffAuditInvalidQueryResponse(
  issues: readonly StaffAuditQueryIssue[],
): NextResponse {
  const body: StaffAuditInvalidQueryWire = {
    status: "invalid-input",
    issues: issues.map(({ field, code }) => ({ field, code })),
  };
  return jsonResponse(body, 400);
}

/** `405`: the answer to `HEAD` on a staff read. The framework would otherwise run `GET` for it, with its audit row and
 *  its bucket, and send no body; this runs nothing. */
export function staffHeadRefusedResponse(): NextResponse {
  return new NextResponse(null, {
    status: 405,
    headers: { ...ACCOUNT_RESPONSE_HEADERS, Allow: "GET" },
  });
}

/** `400`: the member the person can correct, as the member and a code. Never the value that was refused: a note is a
 *  client's personal data. */
export function staffInvalidInputResponse(
  issues: readonly StaffWriteIssue[],
): NextResponse {
  const body: StaffInvalidInputWire = {
    status: "invalid-input",
    issues: issues.map((issue) => ({ ...issue })),
  };
  return jsonResponse(body, 400);
}

/** `201`: the note as it was stored, the one place its text is answered. Its author is named by address and name, never
 *  by account id. */
export function staffNoteAddedResponse(note: StaffKitchenNote): NextResponse {
  const body: StaffNoteAddedWire = { note: noteWireOf(note) };
  return jsonResponse(body, 201);
}

/** `200`: the status the kitchen shows after the save, with who set it and when. `null` is a kitchen that shows `new`
 *  because no status was ever saved: it has no last change. */
export function staffStatusResponse(
  saved: SavedRequestStatus | null,
): NextResponse {
  return jsonResponse(statusSavedWireOf(saved), 200);
}

/** `409`: the write is not one the kitchen's state allows. Nothing was written. */
export function staffConflictResponse(word: StaffWriteConflict): NextResponse {
  const body: StaffConflictWire = { status: word };
  return jsonResponse(body, 409);
}

/** `204`: the kitchen is no longer hidden from its client. */
export function staffUnhiddenResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

/** `200`: one page of the staff kitchens list. Built before the audit row is written and sent only after it commits. */
export function staffKitchenListResponse(page: StaffKitchenPage): NextResponse {
  return jsonResponse(staffKitchenListWireOf(page), 200);
}

/** `200`: one kitchen with its client, request, status and notes. Built before the audit row is written and sent only
 *  after it commits. */
export function staffKitchenResponse(
  kitchen: StaffKitchenDetail,
): NextResponse {
  return jsonResponse(staffKitchenWireOf(kitchen), 200);
}

/** `200`: one page of the audit log. Built before the audit row is written and sent only after it commits. */
export function staffAuditPageResponse(page: StaffAuditPage): NextResponse {
  return jsonResponse(staffAuditPageWireOf(page), 200);
}

type StaffWireBody =
  | StaffInvalidQueryWire
  | StaffAuditInvalidQueryWire
  | StaffAuditPageWire
  | StaffInvalidInputWire
  | StaffNoteAddedWire
  | StaffStatusSavedWire
  | StaffConflictWire
  | StaffKitchenListWire
  | StaffKitchenWire;

function jsonResponse(body: StaffWireBody, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

function statusSavedWireOf(
  saved: SavedRequestStatus | null,
): StaffStatusSavedWire {
  if (saved === null) {
    return { status: "new", changedBy: null, changedAt: null };
  }
  return {
    status: saved.value,
    changedBy: personWireOf(saved.by),
    changedAt: saved.at.toISOString(),
  };
}

function staffKitchenListWireOf(page: StaffKitchenPage): StaffKitchenListWire {
  return {
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    kitchens: page.kitchens.map(listedKitchenWireOf),
  };
}

function listedKitchenWireOf(
  kitchen: StaffListedKitchen,
): StaffListedKitchenWire {
  return {
    id: kitchen.id,
    name: kitchen.name,
    design: kitchen.design === null ? null : thumbnailDesignOf(kitchen.design),
    client: clientWireOf(kitchen.client),
    isSent: kitchen.isSent,
    isHidden: kitchen.isHidden,
    sentAt: isoOrNull(kitchen.sentAt),
    updatedAt: kitchen.updatedAt.toISOString(),
    requestStatus: kitchen.requestStatus,
  };
}

function thumbnailDesignOf(
  design: NonNullable<StaffListedKitchen["design"]>,
): StaffThumbnailDesign {
  const { room, placements, emptyColumns, columnExtents, settings } = design;
  return {
    room,
    placements,
    ...(emptyColumns === undefined ? {} : { emptyColumns }),
    ...(columnExtents === undefined ? {} : { columnExtents }),
    ...(settings === undefined ? {} : { settings }),
  };
}

function staffKitchenWireOf(kitchen: StaffKitchenDetail): StaffKitchenWire {
  return {
    kitchen: {
      id: kitchen.id,
      name: kitchen.name,
      design: kitchen.design,
      asSent: kitchen.asSent,
      isSent: kitchen.isSent,
      isHidden: kitchen.isHidden,
      sentAt: isoOrNull(kitchen.sentAt),
      updatedAt: kitchen.updatedAt.toISOString(),
    },
    client: clientWireOf(kitchen.client),
    request: requestWireOf(kitchen.request),
    status: statusWireOf(kitchen.status),
    notes: kitchen.notes.map(noteWireOf),
    notesTruncated: kitchen.notesTruncated,
  };
}

function staffAuditPageWireOf(page: StaffAuditPage): StaffAuditPageWire {
  return {
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    events: page.events.map(auditEventWireOf),
  };
}

// An audit row is shaped member by member, and the actor's account id is the only account id that leaves with it (the
// page offers actors from the rows it shows; see `StaffAuditActorWire`). One client address leaves with a row, the
// subject's. A row the build's domain refuses carries its action code and nothing of its stored detail.
function auditEventWireOf(row: StaffAuditPageRow): StaffAuditEventWire {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    entry: auditEntryWireOf(row.reading),
    actor: auditActorWireOf(row.actor),
    subject: row.subject === null ? null : auditClientWireOf(row.subject),
    kitchen: row.design === null ? null : auditKitchenWireOf(row.design),
  };
}

function auditEntryWireOf(reading: StaffAuditReading): StaffAuditEntryWire {
  if (reading.kind === "unrecognised") {
    return { kind: "unrecognised", action: reading.action };
  }
  const { entry } = reading;
  switch (entry.action) {
    case "status-changed":
      return {
        kind: "recognised",
        action: entry.action,
        detail: { from: entry.detail.from, to: entry.detail.to },
      };
    case "kitchens-listed":
      return {
        kind: "recognised",
        action: entry.action,
        detail: {
          segment: entry.detail.segment,
          status: entry.detail.status,
          page: entry.detail.page,
          rowCount: entry.detail.rowCount,
          hasSearch: entry.detail.hasSearch,
        },
      };
    case "audit-viewed":
      return {
        kind: "recognised",
        action: entry.action,
        detail: {
          page: entry.detail.page,
          rowCount: entry.detail.rowCount,
          hasActorFilter: entry.detail.hasActorFilter,
          hasActionFilter: entry.detail.hasActionFilter,
          hasDateFilter: entry.detail.hasDateFilter,
        },
      };
    case "kitchen-opened":
    case "note-added":
    case "kitchen-unhidden":
      return { kind: "recognised", action: entry.action, detail: null };
    default:
      return degradedEntryOf(entry);
  }
}

// `entry` is `never` here while the switch names every action the domain lists, so a new domain action is a compile
// error until its arm is written. At run time a reading under a code the switch does not name (a build whose domain
// and store disagree) still degrades: the row is kept as unrecognised, with its action and no detail, never dropped
// and never a reason to fail the page.
function degradedEntryOf(entry: never): StaffAuditEntryWire {
  const { action } = entry as { readonly action: unknown };
  return { kind: "unrecognised", action: String(action) };
}

function auditKitchenWireOf(
  design: StaffAuditDesignRef,
): StaffAuditKitchenWire {
  return {
    id: design.id,
    name: design.name,
  };
}

function auditActorWireOf(account: StaffAuditAccountRef): StaffAuditActorWire {
  return { id: account.id, email: account.email };
}

function auditClientWireOf(
  account: StaffAuditAccountRef,
): StaffAuditClientWire {
  return { email: account.email };
}

function clientWireOf(
  client: StaffKitchenClient | null,
): StaffClientWire | null {
  if (client === null) return null;
  return { email: client.email, name: client.name, phone: client.phone };
}

function requestWireOf(
  request: StaffKitchenRequest | null,
): StaffKitchenRequestWire | null {
  if (request === null) return null;
  return {
    reference: request.reference,
    sentAt: request.sentAt.toISOString(),
  };
}

function statusWireOf(
  status: StaffKitchenStatus | null,
): StaffKitchenStatusWire | null {
  if (status === null) return null;
  const { change } = status;
  return {
    value: status.value,
    changedBy: change === null ? null : personWireOf(change.by),
    changedAt: change === null ? null : change.at.toISOString(),
  };
}

function noteWireOf(note: StaffKitchenNote): StaffKitchenNoteWire {
  return {
    id: note.id,
    text: note.text,
    createdAt: note.createdAt.toISOString(),
    author: personWireOf(note.author),
  };
}

function personWireOf(person: StaffAuditAccountRef): StaffPersonWire {
  return { email: person.email, name: person.name };
}

function isoOrNull(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}
