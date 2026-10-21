import { ROLES, readStaffAuditEntry } from "@lemnaria/configurator-domain";
import type {
  StaffAuditAction,
  StaffAuditEntry,
} from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import { requireValidSessionLookupRequest } from "./session-store.js";
import type { IdleLifetimeSecondsByRole } from "./session-store.js";

/** The audit page's size: the page footer counts 25 to a page ("1-25 din 1 204"). */
export const STAFF_AUDIT_PAGE_SIZE = 25;

/** The last page a request may name, so an offset stays far inside what the server counts in. A bound on a request, not
 *  on the log. */
export const MAX_STAFF_AUDIT_PAGE = 100_000;

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * The longest idle lifetime a caller may state for any role: the client's 30 days, the largest figure
 * `IDLE_LIFETIME_SECONDS_BY_ROLE` holds (`apps/web/src/lib/server/account/session-lifetimes.ts`). The figures are the
 * caller's, so without a bound a caller could keep an idle-expired session live (1e9) or send one no interval can
 * hold (1e16, SQLSTATE 22008). A test in the web app fails if that table outgrows this figure.
 */
export const MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS = 30 * SECONDS_PER_DAY;

/**
 * `timestamptz` text the server accepts from `Date.prototype.toISOString`: years 1 to 9999. Year 0 does not exist
 * for the server, and a year of five or more digits is written with a sign it refuses (SQLSTATE 22007, 22008).
 */
const EARLIEST_BOUND_MS = Date.parse("0001-01-01T00:00:00.000Z");
const LATEST_BOUND_MS = Date.parse("9999-12-31T23:59:59.999Z");

/** The shape `staff_audit_events_*_shape` (`0020`) checks for an event id and for each id it holds. */
export const STORED_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;
/** `staff_audit_events_action_shape` (`0020`): the table checks the shape of an action and code owns the list. */
export const STORED_ACTION_SHAPE = /^[a-z0-9-]{1,32}$/;
const SESSION_TOKEN_HASH_SHAPE = /^[0-9a-f]{64}$/;

/**
 * The actions that name the kitchen they concern. `0020` leaves `design_id` nullable because a later action (a preset,
 * an invitation) concerns none, so the table cannot say this; the store does, and refuses the entry that omits it.
 */
const ACTIONS_NAMING_A_DESIGN = [
  "kitchen-opened",
  "note-added",
  "status-changed",
  "kitchen-unhidden",
] as const satisfies readonly StaffAuditAction[];

export type StaffAuditStoreOperation =
  | "record a staff audit event"
  | "read the staff audit log";

/**
 * Why a call failed, in the few kinds a route acts on:
 * - `unavailable`: the table is missing (42P01) or the application role lacks the grant (42501). The route answers 503.
 * - `not-recorded`: the statement ran and found no live session to take the actor from, so it wrote no row and raised.
 * - `invalid-record`: code refused the request before any statement (see `StaffAuditRecordRefusal`).
 * - `unexpected-answer`: the database answered with something that is not the row this port reads.
 * - `database`: any other refusal or failure, a primary-key collision included.
 *
 * A route that must not answer without a committed row treats every kind as a failure to answer.
 */
export type StaffAuditStoreFailure =
  | "unavailable"
  | "not-recorded"
  | "invalid-record"
  | "unexpected-answer"
  | "database";

/** What an `invalid-record` was refused for. A code, never the value. */
export type StaffAuditRecordRefusal =
  | "SESSION_NOT_WELL_FORMED"
  | "ENTRY_NOT_RECOGNISED"
  | "DESIGN_ID_MISSING"
  | "DESIGN_ID_NOT_WELL_FORMED"
  | "SUBJECT_ACCOUNT_ID_NOT_WELL_FORMED"
  | "RECORD_NOT_PREPARED";

const FAILURE_REASON: Readonly<Record<StaffAuditStoreFailure, string>> = {
  unavailable: "the audit table or the grant to write it is not in place",
  "not-recorded":
    "the statement found no live session to act for and wrote no row",
  "invalid-record": "the request is not one this store writes",
  "unexpected-answer":
    "the database answered with something this port does not read",
  database: "the database gave no trustworthy answer",
};

/**
 * Its message is built from fixed text and holds no value: no hash, id, address or driver text. A cause, when there is
 * one, is built (ADR 0146 B3, ADR 0153 d3): the driver error's type name, its SQLSTATE and its constraint's name, and
 * nothing the driver wrote. The store logs nothing.
 */
export class StaffAuditStoreError extends Error {
  readonly operation: StaffAuditStoreOperation;
  readonly failure: StaffAuditStoreFailure;
  /** Set for `invalid-record` only. */
  readonly refusal: StaffAuditRecordRefusal | undefined;

  constructor(
    operation: StaffAuditStoreOperation,
    failure: StaffAuditStoreFailure,
    options?: ErrorOptions & { readonly refusal?: StaffAuditRecordRefusal },
  ) {
    super(
      `The staff audit store could not ${operation}: ${FAILURE_REASON[failure]}${
        options?.refusal === undefined ? "" : ` (${options.refusal})`
      }.`,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "StaffAuditStoreError";
    this.operation = operation;
    this.failure = failure;
    this.refusal = options?.refusal;
  }
}

/**
 * What a staff member did, as the store is asked to write it. There is no actor member: the actor is the account of the
 * live session the hash names, taken by the statement that writes the row, so no caller can name another account.
 */
export interface StaffAuditRecord {
  /** SHA-256 of the session cookie's value, as the session store holds it. */
  readonly sessionTokenHash: string;
  /** The figures `SessionStore.findLive` is given; the actor's session must be live by the same test. */
  readonly idleLifetimeSeconds: IdleLifetimeSecondsByRole;
  /** Its detail is read again by the domain; the store writes what that reading returns, never this object. */
  readonly entry: StaffAuditEntry;
  /** Required by every action the domain lists today. */
  readonly designId: string | null;
  readonly subjectAccountId: string | null;
}

/**
 * The port for the staff audit log (ADR 0173). The log is append-only: no method updates or deletes, and the
 * application role holds neither grant.
 *
 * `record` is the standalone write, for an action that has no write of its own (`kitchen-opened`). A staff write
 * commits its row in the same transaction as the change, so its store cannot call this method: it puts the Neon
 * module's `staffAuditInsertStatement(sql, record)` in its own `sql.transaction([...])` batch (the fake:
 * `FakeStaffAuditStore.stage`). Four things a store that does so must know, because the statement cannot do them:
 * - **The audit insert is unconditional on the caller's write.** A write that changes nothing (an unhide of a kitchen
 *   that is not hidden, a status on an unsent one) still commits an audit row in a `[write, audit]` batch, and a
 *   batch cannot branch on a row count. So the caller's own write must raise, with a SQLSTATE other than 22012, when
 *   it changes nothing, and the store maps that raise to its 409.
 * - **22012 means `not-recorded` for any batch.** `staffAuditStoreErrorFrom` reads that SQLSTATE as the audit
 *   statement's own refusal, so the caller classifies its own raise before it calls that function.
 * - **No retry.** The event id is minted once, and a repeat after a lost acknowledgement would insert a second row or
 *   hit the primary key (there is no `on conflict`). Do not wrap the batch in `retryOnTransientFailure`.
 * - **`requireOneAuditRowInserted` takes the audit statement's own element of the batch reply**, not the reply.
 */
export interface StaffAuditStore {
  /** Writes exactly one row or throws a `StaffAuditStoreError`. */
  record(record: StaffAuditRecord): Promise<void>;
  /** Newest first, by `(occurred_at desc, id desc)`. */
  page(request: StaffAuditPageRequest): Promise<StaffAuditPage>;
}

/**
 * Every filter is optional (`null`). This package keeps no time zone: the route validates `actorAccountId`, `action`
 * and the dates the person typed, and turns them into the half-open UTC window `[occurredFrom, occurredBefore)` with
 * `chisinauDayOf` (`apps/web/src/lib/server/rate-limit/chisinau-day.ts`). `occurredBefore` is the **start of the next
 * Chisinau day**, never `occurredFrom` plus 24 hours: 29 March and 25 October 2026 are days of 23 and 25 hours. A
 * window that is empty or inverted is not an error; it answers an empty page with a total of 0.
 */
export interface StaffAuditPageRequest {
  readonly actorAccountId: string | null;
  /** A code of the shape the table allows, not only one the domain lists: the page also shows rows it does not know. */
  readonly action: string | null;
  /** Inclusive. */
  readonly occurredFrom: Date | null;
  /** Exclusive. */
  readonly occurredBefore: Date | null;
  /** From 1, up to `MAX_STAFF_AUDIT_PAGE`. */
  readonly page: number;
}

/**
 * An account a row names, as it reads now. `email` and `name` are `null` when the account no longer resolves, and also
 * when it has no name; the page shows a dash for either. The postal address and the phone are never read.
 */
export interface StaffAuditAccountRef {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
}

/** The kitchen a row names, with the account that owns it. `name` and `client` are `null` when the kitchen is gone,
 *  deleted by its client, unnamed or owned by no account. */
export interface StaffAuditDesignRef {
  readonly id: string;
  readonly name: string | null;
  readonly client: StaffAuditAccountRef | null;
}

/** An `unrecognised` row is one whose action or detail this build's domain refuses: an action a later build writes, or
 *  a row written around the store. It carries the action code and nothing else, never the stored detail. */
export type StaffAuditReading =
  | { readonly kind: "recognised"; readonly entry: StaffAuditEntry }
  | { readonly kind: "unrecognised"; readonly action: string };

export interface StaffAuditPageRow {
  readonly id: string;
  /** Millisecond precision, for display. A stamp of `infinity` or `-infinity`, which no write of this package makes
   *  and a script around it could, reads as the latest or earliest instant a `Date` holds. */
  readonly occurredAt: Date;
  readonly actor: StaffAuditAccountRef;
  readonly subject: StaffAuditAccountRef | null;
  readonly design: StaffAuditDesignRef | null;
  readonly reading: StaffAuditReading;
}

export interface StaffAuditPage {
  /** Every row the filters match, counted in the snapshot of the page, unrecognised rows included. */
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly events: readonly StaffAuditPageRow[];
}

/**
 * Marks a record `prepareStaffAuditRecord` produced, so a statement can refuse a literal. It is not exported from the
 * package: only code inside it can reach it, and a spread of a prepared record keeps it (a test builds hostile
 * records that way).
 */
export const PREPARED_RECORD: unique symbol = Symbol(
  "prepared staff audit record",
);

/** A record the code has checked, ready for a statement. Built only by `prepareStaffAuditRecord`. */
export interface PreparedStaffAuditRecord {
  readonly [PREPARED_RECORD]: true;
  readonly id: string;
  readonly sessionTokenHash: string;
  readonly idleLifetimeSeconds: IdleLifetimeSecondsByRole;
  /** Rebuilt by the domain from the request's entry, so it holds the action and a detail of the closed shape only. */
  readonly entry: StaffAuditEntry;
  readonly designId: string | null;
  readonly subjectAccountId: string | null;
}

/**
 * Checks a record and mints its row's id, or throws an `invalid-record` error. Each member of the request is read
 * once, and what is checked is what is held: the prepared record owns frozen copies, so a getter or a later write by
 * the caller cannot change a value after its check. The entry is read again by `readStaffAuditEntry` and the reading's
 * entry, not the request's, is what the prepared record holds. Read the port's notes (`StaffAuditStore`) before putting
 * a statement built from it into a batch.
 */
export function prepareStaffAuditRecord(
  record: StaffAuditRecord,
): PreparedStaffAuditRecord {
  const {
    sessionTokenHash,
    entry: requestedEntry,
    designId,
    subjectAccountId,
  } = record;
  const idleLifetimeSeconds = snapshotOfIdleLifetimes(
    record.idleLifetimeSeconds,
  );
  requireWellFormedSession(sessionTokenHash, idleLifetimeSeconds);
  const entry = requireRecognisedEntry(requestedEntry);
  requireDesignIdWhereTheActionNamesOne(entry.action, designId);
  requireShapeOrNull(
    subjectAccountId,
    STORED_ID_SHAPE,
    "SUBJECT_ACCOUNT_ID_NOT_WELL_FORMED",
  );
  return Object.freeze({
    [PREPARED_RECORD]: true as const,
    id: nanoid(),
    sessionTokenHash,
    idleLifetimeSeconds: Object.freeze(idleLifetimeSeconds),
    entry,
    designId,
    subjectAccountId,
  });
}

/** Whether a value is a record `prepareStaffAuditRecord` produced, as opposed to one built by hand. */
export function isPreparedStaffAuditRecord(
  value: unknown,
): value is PreparedStaffAuditRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<PreparedStaffAuditRecord>)[PREPARED_RECORD] === true
  );
}

/** The `detail` column's value: SQL null (here `null`) for an entry without one, never the text `null` or `{}`. */
export function detailTextOf(entry: StaffAuditEntry): string | null {
  return entry.detail === null ? null : JSON.stringify(entry.detail);
}

/**
 * What a stored row reads as. A row whose action or detail the domain refuses is `unrecognised`; it is neither thrown
 * on nor left out. Its action is passed through only in the shape the table checks, so a reply holding any other text
 * is not this statement's reply.
 */
export function readingOfStoredEvent(
  action: unknown,
  detail: unknown,
): StaffAuditReading {
  const reading = readStaffAuditEntry(action, detail);
  if (reading.ok) return { kind: "recognised", entry: reading.entry };
  if (typeof action === "string" && STORED_ACTION_SHAPE.test(action)) {
    return { kind: "unrecognised", action };
  }
  throw new StaffAuditStoreError(
    "read the staff audit log",
    "unexpected-answer",
  );
}

/** Refuses a page request the table would answer wrongly or not at all; throws an `invalid-record` error. */
export function requireValidPageRequest(request: StaffAuditPageRequest): void {
  if (isValidPageRequest(request)) return;
  throw new StaffAuditStoreError("read the staff audit log", "invalid-record");
}

function isValidPageRequest(request: StaffAuditPageRequest): boolean {
  const { actorAccountId, action, occurredFrom, occurredBefore, page } =
    request;
  return (
    isShapeOrNull(actorAccountId, STORED_ID_SHAPE) &&
    isShapeOrNull(action, STORED_ACTION_SHAPE) &&
    isInstantOrNull(occurredFrom) &&
    isInstantOrNull(occurredBefore) &&
    Number.isSafeInteger(page) &&
    page >= 1 &&
    page <= MAX_STAFF_AUDIT_PAGE
  );
}

export function offsetOfStaffAuditPage(page: number): number {
  return (page - 1) * STAFF_AUDIT_PAGE_SIZE;
}

function requireWellFormedSession(
  sessionTokenHash: string,
  idleLifetimeSeconds: IdleLifetimeSecondsByRole,
): void {
  const isWellFormed =
    typeof sessionTokenHash === "string" &&
    SESSION_TOKEN_HASH_SHAPE.test(sessionTokenHash) &&
    hasIdleLifetimes(sessionTokenHash, idleLifetimeSeconds);
  if (!isWellFormed) throw refusedRecord("SESSION_NOT_WELL_FORMED");
}

/** One figure per role, each read once from the caller's object; anything unreadable leaves the role without one. */
function snapshotOfIdleLifetimes(source: unknown): IdleLifetimeSecondsByRole {
  const snapshot: Record<string, unknown> = {};
  try {
    for (const role of Object.keys(ROLES)) {
      snapshot[role] = (source as Record<string, unknown>)[role];
    }
  } catch {
    return {} as IdleLifetimeSecondsByRole;
  }
  return snapshot as unknown as IdleLifetimeSecondsByRole;
}

function hasIdleLifetimes(
  tokenHash: string,
  idleLifetimeSeconds: IdleLifetimeSecondsByRole,
): boolean {
  try {
    requireValidSessionLookupRequest(
      { tokenHash, idleLifetimeSeconds },
      "look up a session",
    );
  } catch {
    return false;
  }
  return Object.values(idleLifetimeSeconds).every(
    (seconds) => seconds <= MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS,
  );
}

function requireRecognisedEntry(entry: StaffAuditEntry): StaffAuditEntry {
  const reading = readStaffAuditEntry(entry.action, entry.detail);
  if (!reading.ok) throw refusedRecord("ENTRY_NOT_RECOGNISED");
  return reading.entry;
}

function requireDesignIdWhereTheActionNamesOne(
  action: StaffAuditAction,
  designId: string | null,
): void {
  const isNamed = ACTIONS_NAMING_A_DESIGN.some((named) => named === action);
  if (isNamed && designId === null) throw refusedRecord("DESIGN_ID_MISSING");
  requireShapeOrNull(designId, STORED_ID_SHAPE, "DESIGN_ID_NOT_WELL_FORMED");
}

function requireShapeOrNull(
  value: unknown,
  shape: RegExp,
  refusal: StaffAuditRecordRefusal,
): void {
  if (!isShapeOrNull(value, shape)) throw refusedRecord(refusal);
}

function isShapeOrNull(value: unknown, shape: RegExp): boolean {
  return value === null || (typeof value === "string" && shape.test(value));
}

/** A date the server can read back from `toISOString`: a valid instant within years 1 to 9999. */
function isInstantOrNull(value: unknown): boolean {
  if (value === null) return true;
  if (!(value instanceof Date)) return false;
  const milliseconds = value.getTime();
  return milliseconds >= EARLIEST_BOUND_MS && milliseconds <= LATEST_BOUND_MS;
}

function refusedRecord(refusal: StaffAuditRecordRefusal): StaffAuditStoreError {
  return new StaffAuditStoreError(
    "record a staff audit event",
    "invalid-record",
    { refusal },
  );
}
