import { DesignSchema, isRequestStatus } from "@lemnaria/configurator-domain";

import type {
  StaffClientWire,
  StaffKitchenListWire,
  StaffListedKitchenWire,
  StaffRequestStatusWire,
  StaffThumbnailDesign,
} from "./staff-kitchens-wire-contract";

// What `GET /api/staff/kitchens` answers, as the list screen reads it. The body arrives as untyped data, and every member is
// checked here: an id goes into an address and a selector, a text is drawn, and a page that does not have the shape of the
// contract is told as a failed request, never drawn half-understood. Client-safe: no server module is imported.

const FIRST_PAGE = 1;
const UNRECOGNISED_STATUS = "unrecognised";

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
function clientFrom(
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
function requestStatusFrom(
  raw: unknown,
): { readonly value: StaffRequestStatusWire } | undefined {
  if (raw === null) return { value: null };
  if (typeof raw !== "string") return undefined;
  return { value: isRequestStatus(raw) ? raw : UNRECOGNISED_STATUS };
}

function isListedKitchen(
  kitchen: StaffListedKitchenWire | undefined,
): kitchen is StaffListedKitchenWire {
  return kitchen !== undefined;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveCount(value: unknown): value is number {
  return isCount(value) && value >= FIRST_PAGE;
}

/** Only what the body's own object holds; anything that is not an object holds nothing. */
function ownValueOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.hasOwn(value, name)
    ? (value as Readonly<Record<string, unknown>>)[name]
    : undefined;
}
