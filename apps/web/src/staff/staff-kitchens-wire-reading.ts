import {
  DesignSchema,
  isRequestStatus,
  type RequestStatus,
} from "@lemnaria/configurator-domain";

import type {
  StaffClientWire,
  StaffKitchenListWire,
  StaffKitchenNoteWire,
  StaffListedKitchenWire,
  StaffNoteAddedWire,
  StaffPersonWire,
  StaffRequestStatusWire,
  StaffStatusSavedWire,
  StaffThumbnailDesign,
} from "./staff-kitchens-wire-contract";

// What the staff routes answer, as the staff screens read it: the list, and the members the kitchen page and the staff
// writes share (a client, a person, a note, a saved status). The body arrives as untyped data, and every member is checked
// here: an id goes into an address and a selector, a text is drawn, and an answer that does not have the shape of the
// contract is told as a failed request, never drawn half-understood. Client-safe: no server module is imported.

const FIRST_PAGE = 1;
export const UNRECOGNISED_STATUS = "unrecognised";

/** The ids the list route may name: the server lists ids of one to 64 characters. Only a design id of the usual length can be
 *  opened (see `canOpenKitchen`); any other is a row to read and not a link to follow. */
const LISTED_ID = /^[A-Za-z0-9_-]{1,64}$/;

const THUMBNAIL_DESIGN_SCHEMA = DesignSchema.pick({
  room: true,
  placements: true,
  emptyColumns: true,
  columnExtents: true,
  settings: true,
});

/** The page the body holds, or nothing when any part of it is not what the contract says. */
export function staffKitchenListFrom(
  body: unknown,
): StaffKitchenListWire | undefined {
  const total = ownValueOf(body, "total");
  const page = ownValueOf(body, "page");
  const pageSize = ownValueOf(body, "pageSize");
  const rawKitchens = ownValueOf(body, "kitchens");
  if (!isCount(total) || !isPositiveCount(page)) return undefined;
  if (!isPositiveCount(pageSize) || !Array.isArray(rawKitchens)) {
    return undefined;
  }
  const kitchens = (rawKitchens as readonly unknown[]).map(kitchenFrom);
  if (!kitchens.every(isListedKitchen)) return undefined;
  return { total, page, pageSize, kitchens: withoutRepeats(kitchens) };
}

/** A kitchen named twice in one page is drawn once, where it first stands. */
function withoutRepeats(
  kitchens: readonly StaffListedKitchenWire[],
): readonly StaffListedKitchenWire[] {
  const seen = new Set<string>();
  return kitchens.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function kitchenFrom(raw: unknown): StaffListedKitchenWire | undefined {
  const id = ownValueOf(raw, "id");
  const name = ownValueOf(raw, "name");
  const isSent = ownValueOf(raw, "isSent");
  const isHidden = ownValueOf(raw, "isHidden");
  const sentAt = ownValueOf(raw, "sentAt");
  const updatedAt = ownValueOf(raw, "updatedAt");
  const client = clientFrom(ownValueOf(raw, "client"));
  const requestStatus = requestStatusFrom(ownValueOf(raw, "requestStatus"));
  if (typeof id !== "string" || !LISTED_ID.test(id)) return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  if (typeof isSent !== "boolean" || typeof isHidden !== "boolean") {
    return undefined;
  }
  if (sentAt !== null && !isInstant(sentAt)) return undefined;
  if (!isInstant(updatedAt)) return undefined;
  if (client === undefined || requestStatus === undefined) return undefined;
  return {
    id,
    name,
    design: designFrom(ownValueOf(raw, "design")),
    client: client.value,
    isSent,
    isHidden,
    sentAt,
    updatedAt,
    requestStatus: requestStatus.value,
  };
}

/** A kitchen whose document this build cannot read has no thumbnail and no generated name, and is listed all the same. */
function designFrom(raw: unknown): StaffThumbnailDesign | null {
  const parsed = THUMBNAIL_DESIGN_SCHEMA.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** `undefined` for a client the contract does not allow; `{ value: null }` for a sent kitchen no account owns. */
export function clientFrom(
  raw: unknown,
): { readonly value: StaffClientWire | null } | undefined {
  if (raw === null) return { value: null };
  const email = ownValueOf(raw, "email");
  const name = ownValueOf(raw, "name");
  const phone = ownValueOf(raw, "phone");
  if (typeof email !== "string") return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  if (phone !== null && typeof phone !== "string") return undefined;
  return { value: { email, name, phone } };
}

/** A status this build does not name is told as unrecognised, never as one it does: a new kitchen is a claim. */
export function recognisedStatusOf(
  word: string,
): RequestStatus | "unrecognised" {
  return isRequestStatus(word) ? word : UNRECOGNISED_STATUS;
}

function requestStatusFrom(
  raw: unknown,
): { readonly value: StaffRequestStatusWire } | undefined {
  if (raw === null) return { value: null };
  if (typeof raw !== "string") return undefined;
  return { value: recognisedStatusOf(raw) };
}

/** A person as it reads now: `null` members are an account that no longer resolves, not a failure. */
export function personFrom(
  raw: unknown,
): { readonly value: StaffPersonWire } | undefined {
  const email = ownValueOf(raw, "email");
  const name = ownValueOf(raw, "name");
  if (email !== null && typeof email !== "string") return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  return { value: { email, name } };
}

export function noteFrom(raw: unknown): StaffKitchenNoteWire | undefined {
  const id = ownValueOf(raw, "id");
  const text = ownValueOf(raw, "text");
  const createdAt = ownValueOf(raw, "createdAt");
  const author = personFrom(ownValueOf(raw, "author"));
  if (typeof id !== "string" || id === "" || typeof text !== "string") {
    return undefined;
  }
  if (!isInstant(createdAt) || author === undefined) return undefined;
  return { id, text, createdAt, author: author.value };
}

/** `201` of a note: the note as it was stored, or nothing when the body is not what the contract says. */
export function noteAddedFrom(body: unknown): StaffNoteAddedWire | undefined {
  const note = noteFrom(ownValueOf(body, "note"));
  return note === undefined ? undefined : { note };
}

/** `200` of a status save: a status this build names, who set it and when. A status it does not name is not one it can
 *  show as saved. */
export function statusSavedFrom(
  body: unknown,
): StaffStatusSavedWire | undefined {
  const status = ownValueOf(body, "status");
  const changedBy = ownValueOf(body, "changedBy");
  const changedAt = ownValueOf(body, "changedAt");
  const by = changedBy === null ? { value: null } : personFrom(changedBy);
  if (typeof status !== "string" || !isRequestStatus(status)) return undefined;
  if (by === undefined) return undefined;
  if (changedAt !== null && !isInstant(changedAt)) return undefined;
  return { status, changedBy: by.value, changedAt };
}

/** An instant in the one form the server writes, `toISOString()`'s: it must read back as itself, so a day that does not
 *  exist (`2026-02-30`), an offset, a missing millisecond and a bare number are all refused. The list and the kitchen read
 *  an instant by this one rule. */
export function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isListedKitchen(
  kitchen: StaffListedKitchenWire | undefined,
): kitchen is StaffListedKitchenWire {
  return kitchen !== undefined;
}

export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveCount(value: unknown): value is number {
  return isCount(value) && value >= FIRST_PAGE;
}

/** Only what the body's own object holds; anything that is not an object holds nothing. */
export function ownValueOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, name)
    ? (value as Readonly<Record<string, unknown>>)[name]
    : undefined;
}
