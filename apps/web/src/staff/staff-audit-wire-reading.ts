import {
  isAccountId,
  readStaffAuditEntry,
} from "@lemnaria/configurator-domain";

import {
  isCount,
  isInstant,
  isPositiveCount,
  ownValueOf,
} from "./staff-kitchens-wire-reading";
import type {
  StaffAuditActorWire,
  StaffAuditEntryWire,
  StaffAuditEventWire,
  StaffAuditKitchenWire,
  StaffAuditPageWire,
} from "./staff-kitchens-wire-contract";

// What the audit route answers, as the audit page reads it. The body arrives as untyped data and every member is checked
// here: an answer that does not have the shape of the contract is told as a failed request, never drawn half-understood.
// Client-safe: no server module is imported.

/**
 * The page the body holds, or nothing when any part of it is not what the contract says. Strict about the shape of
 * every row and lenient about what a row's action means: a row whose action or detail this build's domain does not
 * accept is still a row, told as unrecognised with its code as text, never dropped and never a failure of the page.
 */
export function staffAuditPageFrom(
  body: unknown,
): StaffAuditPageWire | undefined {
  const total = ownValueOf(body, "total");
  const page = ownValueOf(body, "page");
  const pageSize = ownValueOf(body, "pageSize");
  const rawEvents = ownValueOf(body, "events");
  if (!isCount(total) || !isPositiveCount(page)) return undefined;
  if (!isPositiveCount(pageSize) || !Array.isArray(rawEvents)) return undefined;
  if (rawEvents.length > pageSize) return undefined;
  const events = (rawEvents as readonly unknown[]).map(eventFrom);
  if (!events.every(isEvent)) return undefined;
  return { total, page, pageSize, events: withoutRepeats(events) };
}

function eventFrom(raw: unknown): StaffAuditEventWire | undefined {
  const id = ownValueOf(raw, "id");
  const occurredAt = ownValueOf(raw, "occurredAt");
  const entry = entryFrom(ownValueOf(raw, "entry"));
  const actor = actorFrom(ownValueOf(raw, "actor"));
  const subject = subjectFrom(ownValueOf(raw, "subject"));
  const kitchen = kitchenFrom(ownValueOf(raw, "kitchen"));
  if (typeof id !== "string" || id === "" || !isInstant(occurredAt)) {
    return undefined;
  }
  if (entry === undefined || actor === undefined) return undefined;
  if (subject === undefined || kitchen === undefined) return undefined;
  return {
    id,
    occurredAt,
    entry,
    actor,
    subject: subject.value,
    kitchen: kitchen.value,
  };
}

/** A recognised row is believed only as far as the domain reads it: the domain is asked again, so a body that calls a
 *  row recognised with a code or a detail it refuses is told as unrecognised. */
function entryFrom(raw: unknown): StaffAuditEntryWire | undefined {
  const kind = ownValueOf(raw, "kind");
  const action = ownValueOf(raw, "action");
  if (typeof action !== "string") return undefined;
  if (kind === "unrecognised") return { kind, action };
  if (kind !== "recognised") return undefined;
  const reading = readStaffAuditEntry(action, ownValueOf(raw, "detail"));
  return reading.ok
    ? { kind: "recognised", ...reading.entry }
    : { kind: "unrecognised", action };
}

function actorFrom(raw: unknown): StaffAuditActorWire | undefined {
  const id = ownValueOf(raw, "id");
  const email = ownValueOf(raw, "email");
  if (typeof id !== "string" || !isAccountId(id)) return undefined;
  if (email !== null && typeof email !== "string") return undefined;
  return { id, email };
}

function subjectFrom(
  raw: unknown,
): { readonly value: StaffAuditEventWire["subject"] } | undefined {
  if (raw === null) return { value: null };
  const email = ownValueOf(raw, "email");
  if (email !== null && typeof email !== "string") return undefined;
  return { value: { email } };
}

function kitchenFrom(
  raw: unknown,
): { readonly value: StaffAuditKitchenWire | null } | undefined {
  if (raw === null) return { value: null };
  const id = ownValueOf(raw, "id");
  const name = ownValueOf(raw, "name");
  if (typeof id !== "string" || id === "") return undefined;
  if (name !== null && typeof name !== "string") return undefined;
  return { value: { id, name } };
}

/** A row named twice in one page is drawn once, where it first stands. */
function withoutRepeats(
  events: readonly StaffAuditEventWire[],
): readonly StaffAuditEventWire[] {
  const seen = new Set<string>();
  return events.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isEvent(
  event: StaffAuditEventWire | undefined,
): event is StaffAuditEventWire {
  return event !== undefined;
}
