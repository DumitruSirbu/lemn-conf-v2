import "server-only";

import { NextResponse } from "next/server";

import type { StaffKitchenQueryIssue } from "@lemnaria/configurator-domain";
import type {
  StaffAuditAccountRef,
  StaffKitchenClient,
  StaffKitchenDetail,
  StaffKitchenNote,
  StaffKitchenPage,
  StaffKitchenRequest,
  StaffKitchenStatus,
  StaffListedKitchen,
} from "@lemnaria/persistence";

import { ACCOUNT_RESPONSE_HEADERS } from "@/lib/server/account/account-responses";
import type {
  StaffClientWire,
  StaffKitchenListWire,
  StaffKitchenNoteWire,
  StaffKitchenRequestWire,
  StaffKitchenStatusWire,
  StaffKitchenWire,
  StaffListedKitchenWire,
  StaffPersonWire,
  StaffThumbnailDesign,
} from "@/staff/staff-kitchens-wire-contract";

// The answers of the staff kitchen read routes that the account routes do not already give. The refusals (401, 403,
// 404, 429, 503) are `account-responses.ts`'s and `design-errors.ts`'s own, so a staff route words them as every other
// does. Every body here is shaped member by member from what the reader returned: a reader object is never spread, so
// a column the reader later gains reaches no response until it is named here, and no account id leaves the server.

/** `400`: the query's members that the person can correct, as the member and a code. Never the value that was refused:
 *  the search text is a client's name or address. */
export function staffInvalidQueryResponse(
  issues: readonly StaffKitchenQueryIssue[],
): NextResponse {
  return NextResponse.json(
    {
      status: "invalid-input",
      issues: issues.map(({ field, code }) => ({ field, code })),
    },
    { status: 400, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

/** `200`: one page of the staff kitchens list. Built before the audit row is written and sent only after it commits. */
export function staffKitchenListResponse(page: StaffKitchenPage): NextResponse {
  return jsonResponse(staffKitchenListWireOf(page));
}

/** `200`: one kitchen with its client, request, status and notes. Built before the audit row is written and sent only
 *  after it commits. */
export function staffKitchenResponse(
  kitchen: StaffKitchenDetail,
): NextResponse {
  return jsonResponse(staffKitchenWireOf(kitchen));
}

function jsonResponse(body: object): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
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
  return {
    value: status.value,
    changedBy: status.change === null ? null : personWireOf(status.change.by),
    changedAt: status.change === null ? null : status.change.at.toISOString(),
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
