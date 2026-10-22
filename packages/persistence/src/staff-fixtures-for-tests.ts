import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  auditActionAcceptsDesignId,
  isRequestStatus,
  isStaffAuditAction,
} from "@lemnaria/configurator-domain";
import type {
  RequestStatus,
  StaffAuditAction,
} from "@lemnaria/configurator-domain";
import { customAlphabet, nanoid } from "nanoid";

import { requireAccountIdShape } from "./account-id-shape.js";
import { deleteRateLimitCountersForTests } from "./delete-rate-limit-counters-for-tests.js";
import { requirePasswordHashShape } from "./password-hash-shape.js";
import { requireTestRunner } from "./require-test-runner.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { openTestDatabase } from "./test-database-url.js";

/**
 * Seeds and removes the rows of a staff scenario on the test database, so an `apps/web` end-to-end spec can stand a
 * staff member, a client and their kitchens up without a Postgres driver of its own. Test support only: every function
 * asks `requireTestRunner` and then `openTestDatabase()`, which refuses anything but an allowlisted test database, so
 * neither the preview nor the production URL can be reached (ADR 0006). The connection is never accepted.
 *
 * **Everything is found by a marker.** A marker is eight letters or digits; every id this file mints starts with it and
 * is padded to the 21 characters the staff tables' shape checks demand. Removal and counting match with
 * `starts_with`, never `like`: an id may hold `_`, which `like` reads as a wildcard. Rows the application writes while a
 * spec runs carry random ids, so they are found through what they point at: the actor, author or subject account, or
 * the design, of a planted row.
 */

const MARKER_LENGTH = 8;
const STORED_ID_LENGTH = 21;
const MARKER_SHAPE = /^[A-Za-z0-9]{8}$/;
const STORED_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;
const SHA256_BYTES = 32;
const REFERENCE_SUFFIX_LENGTH = 12;
const SESSION_LIFETIME = "1 day";
const FIXTURE_LOCALE = "ro";
const FIXTURE_PRIVACY_NOTICE_VERSION = "1";
const FIXTURE_PHONE = "+37360000000";
const FIXTURE_LOCALITY = "Chisinau";
const FIXTURE_REQUEST_EMAIL = "fixture-request@example.invalid";
const EMPTY_JSON_OBJECT = "{}";
/** Not a password anyone holds: a spec signs in by the session it plants, or supplies a hash of its own. */
const FIXTURE_PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;

const newMarkerText = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  MARKER_LENGTH,
);
const newReferenceSuffix = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  REFERENCE_SUFFIX_LENGTH,
);

/** A fresh marker for one spec or one worker, so two specs never share rows. */
export function newStaffFixtureMarker(): string {
  return newMarkerText();
}

export type StaffFixtureRole = "client" | "operator" | "administrator";

export interface StaffFixtureAccountSpec {
  readonly role: StaffFixtureRole;
  /** SHA-256 of the cookie token the spec will present. When given, a live session is planted for the account. */
  readonly sessionTokenHash?: string;
  readonly name?: string | null;
  /** An argon2id PHC string; the default is a hash no password matches. */
  readonly passwordHash?: string;
}

export interface PlantedStaffFixtureAccount {
  readonly accountId: string;
  /** Verified, lower-case and unique to the marker. */
  readonly email: string;
}

/**
 * Plants an account whose e-mail is verified, by a direct insert as the test database's owner: the role is set here
 * and by no application path. With `sessionTokenHash` it also plants a session, live by `findLive`'s test, in the same
 * transaction.
 */
export async function plantStaffAccountForTests(
  marker: string,
  spec: StaffFixtureAccountSpec,
): Promise<PlantedStaffFixtureAccount> {
  requireTestRunner({
    functionName: "plantStaffAccountForTests",
    effect: "inserts an account with a role and a live session",
  });
  requireMarker(marker, "plant a staff account");
  requireAccountSpec(spec);

  const accountId = newMarkedId(marker);
  const email = `${accountId.toLowerCase()}@example.invalid`;
  const passwordHash = spec.passwordHash ?? FIXTURE_PASSWORD_HASH;
  const name = spec.name === undefined ? "Fixture Account" : spec.name;
  const sql = openTestDatabase();
  await sql.transaction((transaction) => [
    transaction`
      insert into accounts (id, email, email_normal_form, email_verified_at, password_hash, role, locale,
        privacy_notice_version, name)
      values (${accountId}, ${email}, ${email}, now(), ${passwordHash}, ${spec.role}, ${FIXTURE_LOCALE},
        ${FIXTURE_PRIVACY_NOTICE_VERSION}, ${name})
    `,
    ...(spec.sessionTokenHash === undefined
      ? []
      : [
          transaction`
            insert into account_sessions (token_hash, account_id, absolute_expires_at)
            values (${spec.sessionTokenHash}, ${accountId}, now() + ${SESSION_LIFETIME}::interval)
          `,
        ]),
  ]);
  return { accountId, email };
}

export type StaffFixtureDesignKind =
  | "visible"
  | "hidden"
  | "client-deleted"
  | "visitor-draft";

export interface StaffFixtureDesignSpec {
  readonly kind: StaffFixtureDesignKind;
  /** The account that owns the kitchen; refused for a visitor draft, which has no owner by definition. */
  readonly ownerAccountId?: string;
  readonly name?: string;
}

interface DesignFlags {
  readonly isSent: boolean;
  readonly isHiddenByClient: boolean;
  readonly isDeletedByClient: boolean;
}

const DESIGN_FLAGS: Readonly<Record<StaffFixtureDesignKind, DesignFlags>> = {
  visible: { isSent: true, isHiddenByClient: false, isDeletedByClient: false },
  hidden: { isSent: true, isHiddenByClient: true, isDeletedByClient: false },
  "client-deleted": {
    isSent: true,
    isHiddenByClient: false,
    isDeletedByClient: true,
  },
  "visitor-draft": {
    isSent: false,
    isHiddenByClient: false,
    isDeletedByClient: false,
  },
};

/**
 * Plants a kitchen holding the current schema's sample design. `visible` is sent and listed; `hidden` and
 * `client-deleted` are sent and then hidden or deleted by their client; a `visitor-draft` is unsent with no account, so
 * no staff list shows it. Answers the design's id.
 */
export async function plantStaffDesignForTests(
  marker: string,
  spec: StaffFixtureDesignSpec,
): Promise<string> {
  requireTestRunner({
    functionName: "plantStaffDesignForTests",
    effect: "inserts a design row",
  });
  requireMarker(marker, "plant a staff design");
  requireDesignSpec(spec);

  const designId = newMarkedId(marker);
  const flags = DESIGN_FLAGS[spec.kind];
  const visitorHash = spec.kind === "visitor-draft" ? randomDigest() : null;
  await openTestDatabase()`
    insert into designs (id, schema_version, document, account_id, name, sent_at, hidden_by_client_at,
      deleted_by_client_at, visitor_hash)
    values (${designId}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb,
      ${spec.ownerAccountId ?? null}, ${spec.name ?? null},
      case when ${flags.isSent}::boolean then now() end,
      case when ${flags.isHiddenByClient}::boolean then now() end,
      case when ${flags.isDeletedByClient}::boolean then now() end,
      ${visitorHash})
  `;
  return designId;
}

export interface PlantedStaffFixtureRequest {
  readonly clientRequestId: string;
  readonly reference: string;
}

/** Plants the contact request a sent kitchen was sent with: the staff detail page shows the newest one for a design. */
export async function plantStaffRequestForTests(
  marker: string,
  spec: { readonly designId: string },
): Promise<PlantedStaffFixtureRequest> {
  requireTestRunner({
    functionName: "plantStaffRequestForTests",
    effect: "inserts a contact request row",
  });
  requireMarker(marker, "plant a staff request");
  requireStoredId(spec.designId, "design id", "plant a staff request");

  const clientRequestId = newMarkedId(marker);
  const reference = `FX-${newReferenceSuffix()}`;
  await openTestDatabase()`
    insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
      name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale, design_document,
      priced)
    values (${clientRequestId}, ${reference}, ${spec.designId}, 1, ${randomDigest()},
      'Fixture Client', ${FIXTURE_PHONE}, ${FIXTURE_PHONE}, ${FIXTURE_LOCALITY}, 'email', ${FIXTURE_REQUEST_EMAIL},
      '1', ${FIXTURE_LOCALE}, ${EMPTY_JSON_OBJECT}::jsonb, ${EMPTY_JSON_OBJECT}::jsonb)
  `;
  return { clientRequestId, reference };
}

export interface StaffFixtureRequestStateSpec {
  readonly designId: string;
  readonly status: RequestStatus;
  readonly changedByAccountId: string;
}

/** Plants the saved status of a kitchen's request; a kitchen has at most one row, so a second plant for it fails. */
export async function plantStaffRequestStateForTests(
  marker: string,
  spec: StaffFixtureRequestStateSpec,
): Promise<void> {
  requireTestRunner({
    functionName: "plantStaffRequestStateForTests",
    effect: "inserts a request state row",
  });
  requireMarker(marker, "plant a staff request state");
  requireStoredId(spec.designId, "design id", "plant a staff request state");
  requireAccountIdShape(spec.changedByAccountId, "plant a staff request state");
  requireListedStatus(spec.status);

  await openTestDatabase()`
    insert into design_request_states (design_id, status, changed_by_account_id)
    values (${spec.designId}, ${spec.status}, ${spec.changedByAccountId})
  `;
}

export interface StaffFixtureNoteSpec {
  readonly designId: string;
  readonly authorAccountId: string;
  readonly body: string;
}

/** Plants a staff note on a kitchen. Answers the note's id. */
export async function plantStaffNoteForTests(
  marker: string,
  spec: StaffFixtureNoteSpec,
): Promise<string> {
  requireTestRunner({
    functionName: "plantStaffNoteForTests",
    effect: "inserts a design note row",
  });
  requireMarker(marker, "plant a staff note");
  requireStoredId(spec.designId, "design id", "plant a staff note");
  requireAccountIdShape(spec.authorAccountId, "plant a staff note");

  const noteId = newMarkedId(marker);
  await openTestDatabase()`
    insert into design_notes (id, design_id, author_account_id, body)
    values (${noteId}, ${spec.designId}, ${spec.authorAccountId}, ${spec.body})
  `;
  return noteId;
}

export interface StaffFixtureAuditEventSpec {
  readonly actorAccountId: string;
  readonly action: StaffAuditAction;
  /** Required exactly for the actions that name a kitchen, as the audit store requires it. */
  readonly designId?: string;
  readonly subjectAccountId?: string;
}

/** Plants a staff audit row with no detail. Answers the event's id. */
export async function plantStaffAuditEventForTests(
  marker: string,
  spec: StaffFixtureAuditEventSpec,
): Promise<string> {
  requireTestRunner({
    functionName: "plantStaffAuditEventForTests",
    effect: "inserts a staff audit row",
  });
  requireMarker(marker, "plant a staff audit event");
  requireAuditSpec(spec);

  const eventId = newMarkedId(marker);
  await openTestDatabase()`
    insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id)
    values (${eventId}, ${spec.actorAccountId}, ${spec.action}, ${spec.designId ?? null},
      ${spec.subjectAccountId ?? null})
  `;
  return eventId;
}

/** What a marker holds, by table. `rateLimitCounters` counts the keys handed in, not the marker. */
export interface StaffFixtureCounts {
  readonly designNotes: number;
  readonly designRequestStates: number;
  readonly staffAuditEvents: number;
  readonly contactSubmissions: number;
  readonly designShareLinks: number;
  readonly designs: number;
  readonly accountSessions: number;
  readonly accountEmailTokens: number;
  readonly accounts: number;
  readonly rateLimitCounters: number;
}

export interface StaffFixtureScope {
  /**
   * Bucket keys the spec computed for the planted accounts. The key is a digest of an encoding the web app owns, so it
   * is the caller's to derive; persistence only deletes and counts the rows of exactly these keys.
   */
  readonly rateLimitKeys?: readonly string[];
}

type MarkedTable = Exclude<keyof StaffFixtureCounts, "rateLimitCounters">;

/** `$1` is the marker. A kitchen is marked when its id or its owner's id is. */
const MARKED_DESIGNS =
  "(select id from designs where starts_with(id, $1) or starts_with(account_id, $1))";

/**
 * Which rows of each table belong to a marker, in teardown order: what points at a kitchen or an account goes before
 * it. `designs.account_id` has no foreign key (migration 0015), so accounts do not take their kitchens with them and
 * the kitchens go by their own owner id here; sessions and e-mail tokens do cascade from accounts but are named so a
 * count can show them gone. Removal and counting share these predicates, so a count can never be narrower than the
 * delete it checks.
 */
const MARKED_ROWS: readonly {
  readonly table: MarkedTable;
  readonly predicate: string;
}[] = [
  {
    table: "designNotes",
    predicate: `starts_with(id, $1) or starts_with(author_account_id, $1) or starts_with(design_id, $1)
      or design_id in ${MARKED_DESIGNS}`,
  },
  {
    table: "designRequestStates",
    predicate: `starts_with(design_id, $1) or starts_with(changed_by_account_id, $1)
      or design_id in ${MARKED_DESIGNS}`,
  },
  {
    table: "staffAuditEvents",
    predicate: `starts_with(id, $1) or starts_with(actor_account_id, $1) or starts_with(subject_account_id, $1)
      or starts_with(design_id, $1) or design_id in ${MARKED_DESIGNS}`,
  },
  {
    table: "contactSubmissions",
    predicate: `starts_with(client_request_id, $1) or starts_with(design_id, $1)
      or design_id in ${MARKED_DESIGNS}`,
  },
  {
    table: "designShareLinks",
    predicate: `starts_with(design_id, $1) or design_id in ${MARKED_DESIGNS}`,
  },
  {
    table: "designs",
    predicate: "starts_with(id, $1) or starts_with(account_id, $1)",
  },
  { table: "accountSessions", predicate: "starts_with(account_id, $1)" },
  { table: "accountEmailTokens", predicate: "starts_with(account_id, $1)" },
  { table: "accounts", predicate: "starts_with(id, $1)" },
];

const SQL_TABLE_OF: Readonly<Record<MarkedTable, string>> = {
  designNotes: "design_notes",
  designRequestStates: "design_request_states",
  staffAuditEvents: "staff_audit_events",
  contactSubmissions: "contact_submissions",
  designShareLinks: "design_share_links",
  designs: "designs",
  accountSessions: "account_sessions",
  accountEmailTokens: "account_email_tokens",
  accounts: "accounts",
};

/**
 * Removes every row the marker holds, in teardown order: notes, request states, audit rows (the application's own
 * included, found by actor), requests (their sent copies go with them), share links, designs, sessions, e-mail tokens,
 * accounts; then the counters of the keys handed in. Answers how many rows each table lost. Safe to run again, and
 * after a spec that failed halfway: it removes whatever is there. Not retried after a lost reply, which would answer
 * none for rows that did go.
 */
export async function removeStaffFixturesForTests(
  marker: string,
  scope: StaffFixtureScope = {},
): Promise<StaffFixtureCounts> {
  requireTestRunner({
    functionName: "removeStaffFixturesForTests",
    effect:
      "deletes accounts, sessions, designs, requests, notes and audit rows",
  });
  requireMarker(marker, "remove staff fixtures");
  const rateLimitKeys = scope.rateLimitKeys ?? [];
  requireBucketKeys(rateLimitKeys, "remove staff fixtures");

  const sql = openTestDatabase();
  const removed: Partial<Record<MarkedTable, number>> = {};
  for (const { table, predicate } of MARKED_ROWS) {
    removed[table] = await countRows(
      sql,
      `with removed as (delete from ${SQL_TABLE_OF[table]} where ${predicate} returning 1)
       select count(*)::int as stored from removed`,
      [marker],
    );
  }
  const counters = await deleteRateLimitCountersForTests(rateLimitKeys);
  return withRateLimitCounters(removed, counters.rowsRemoved);
}

/**
 * Counts the rows the marker holds in every table, by the predicates `removeStaffFixturesForTests` deletes with. A
 * read. A spec asserts every figure is zero after teardown to show nothing leaked.
 */
export async function countStaffFixturesForTests(
  marker: string,
  scope: StaffFixtureScope = {},
): Promise<StaffFixtureCounts> {
  requireTestRunner({
    functionName: "countStaffFixturesForTests",
    effect: "counts staff scenario rows",
  });
  requireMarker(marker, "count staff fixtures");
  const rateLimitKeys = scope.rateLimitKeys ?? [];
  requireBucketKeys(rateLimitKeys, "count staff fixtures");

  const sql = openTestDatabase();
  const stored: Partial<Record<MarkedTable, number>> = {};
  for (const { table, predicate } of MARKED_ROWS) {
    stored[table] = await countRows(
      sql,
      `select count(*)::int as stored from ${SQL_TABLE_OF[table]} where ${predicate}`,
      [marker],
    );
  }
  return withRateLimitCounters(stored, await countCounters(sql, rateLimitKeys));
}

type TestDatabase = ReturnType<typeof openTestDatabase>;

async function countRows(
  sql: TestDatabase,
  statement: string,
  parameters: readonly unknown[],
): Promise<number> {
  const rows = (await sql.query(statement, [...parameters])) as {
    readonly stored: unknown;
  }[];
  const stored = rows[0]?.stored;
  if (
    rows.length === 1 &&
    typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= 0
  ) {
    return stored;
  }
  throw new Error(
    "The database answered a count of staff scenario rows with something that is not a count",
  );
}

async function countCounters(
  sql: TestDatabase,
  keys: readonly string[],
): Promise<number> {
  if (keys.length === 0) return 0;
  return countRows(
    sql,
    "select count(*)::int as stored from rate_limit_counters where bucket_key = any($1)",
    [keys],
  );
}

function withRateLimitCounters(
  byTable: Partial<Record<MarkedTable, number>>,
  rateLimitCounters: number,
): StaffFixtureCounts {
  return {
    designNotes: byTable.designNotes ?? 0,
    designRequestStates: byTable.designRequestStates ?? 0,
    staffAuditEvents: byTable.staffAuditEvents ?? 0,
    contactSubmissions: byTable.contactSubmissions ?? 0,
    designShareLinks: byTable.designShareLinks ?? 0,
    designs: byTable.designs ?? 0,
    accountSessions: byTable.accountSessions ?? 0,
    accountEmailTokens: byTable.accountEmailTokens ?? 0,
    accounts: byTable.accounts ?? 0,
    rateLimitCounters,
  };
}

function newMarkedId(marker: string): string {
  return `${marker}${nanoid(STORED_ID_LENGTH - MARKER_LENGTH)}`;
}

function randomDigest(): string {
  return randomBytes(SHA256_BYTES).toString("hex");
}

function requireMarker(marker: unknown, operation: string): void {
  if (typeof marker === "string" && MARKER_SHAPE.test(marker)) return;
  throw new Error(
    `Refusing to ${operation}: a staff fixture marker must be exactly ${String(MARKER_LENGTH)} letters or digits. ` +
      "Any other text could name more rows than the ones it was handed.",
  );
}

function requireStoredId(
  value: unknown,
  whatItIs: string,
  operation: string,
): void {
  if (typeof value === "string" && STORED_ID_SHAPE.test(value)) return;
  throw new Error(
    `Refusing to ${operation}: a ${whatItIs} must be the 21 URL-safe characters the staff tables check.`,
  );
}

function requireBucketKeys(keys: readonly string[], operation: string): void {
  keys.forEach((key) => {
    requireSha256Digest(key, "rate-limit bucket key", operation);
  });
}

function requireAccountSpec(spec: StaffFixtureAccountSpec): void {
  const operation = "plant a staff account";
  if (!["client", "operator", "administrator"].includes(spec.role)) {
    throw new Error(
      `Refusing to ${operation}: the role must be client, operator or administrator.`,
    );
  }
  if (spec.sessionTokenHash !== undefined) {
    requireSha256Digest(spec.sessionTokenHash, "session token hash", operation);
  }
  if (spec.passwordHash !== undefined) {
    requirePasswordHashShape(spec.passwordHash, operation);
  }
}

function requireDesignSpec(spec: StaffFixtureDesignSpec): void {
  const operation = "plant a staff design";
  if (!Object.hasOwn(DESIGN_FLAGS, spec.kind)) {
    throw new Error(
      `Refusing to ${operation}: the kind is not one of the four.`,
    );
  }
  if (spec.ownerAccountId === undefined) return;
  if (spec.kind === "visitor-draft") {
    throw new Error(
      `Refusing to ${operation}: a visitor draft has no owner; it is the draft no account holds.`,
    );
  }
  requireAccountIdShape(spec.ownerAccountId, operation);
}

function requireListedStatus(status: unknown): void {
  if (isRequestStatus(status)) return;
  throw new Error(
    "Refusing to plant a staff request state: the status is not one the domain lists.",
  );
}

function requireAuditSpec(spec: StaffFixtureAuditEventSpec): void {
  const operation = "plant a staff audit event";
  if (!isStaffAuditAction(spec.action)) {
    throw new Error(
      `Refusing to ${operation}: the action is not one the domain lists.`,
    );
  }
  requireAccountIdShape(spec.actorAccountId, operation);
  if (spec.subjectAccountId !== undefined) {
    requireAccountIdShape(spec.subjectAccountId, operation);
  }
  if (spec.designId !== undefined) {
    requireStoredId(spec.designId, "design id", operation);
  }
  if (!auditActionAcceptsDesignId(spec.action, spec.designId ?? null)) {
    throw new Error(
      `Refusing to ${operation}: a design id is required exactly for the actions that name a kitchen.`,
    );
  }
}
