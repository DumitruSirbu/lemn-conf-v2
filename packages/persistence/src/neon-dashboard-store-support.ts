import { HandleSchema } from "@lemnaria/configurator-domain";
import type {
  DashboardAuditAction,
  ItemRef,
  StaffAuditEntry,
} from "@lemnaria/configurator-domain";

import { DashboardStoreError } from "./m10-ports.js";
import type {
  DashboardStoreFailure,
  DashboardStoreOperation,
} from "./m10-ports.js";
import { instantFromEpochMilliseconds, isRecord } from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import { staffAuditStoreErrorFrom } from "./neon-staff-audit-store.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import {
  StaffAuditStoreError,
  prepareStaffAuditRecord,
} from "./staff-audit-store.js";
import type { PreparedStaffAuditRecord } from "./staff-audit-store.js";
import type { StaffActingSession } from "./staff-kitchen-actions-store.js";

// What the Neon stores of the M10 price dashboard share: the audit record a write commits, the reading of a failure and of
// a reply, and the rebuilding of an item from the log's columns. Nothing here is a statement.

const ITEM_KINDS_WITH_A_TIER_ID = ["material", "hardware"] as const;

export interface DashboardAuditToPrepare {
  readonly operation: DashboardStoreOperation;
  readonly session: StaffActingSession;
  readonly action: string;
  /** Read again by the domain; what it returns, and not this object, is what the prepared record holds. */
  readonly detail: unknown;
  /** The actions this write may record: any other, though a valid dashboard action, is refused. */
  readonly accepts: readonly DashboardAuditAction[];
}

/**
 * Checks the session and the entry the way the audit store does (`prepareStaffAuditRecord`) and mints the row's id. A
 * session that is not well formed, an entry the domain refuses, and an action this write may not record are all
 * `invalid-request`, before any statement.
 */
export function prepareDashboardAudit({
  operation,
  session,
  action,
  detail,
  accepts,
}: DashboardAuditToPrepare): PreparedStaffAuditRecord {
  const prepared = prepareOrRefuse(operation, session, { action, detail });
  if (!accepts.some((accepted) => accepted === prepared.entry.action)) {
    throw new DashboardStoreError(operation, "invalid-request");
  }
  return prepared;
}

function prepareOrRefuse(
  operation: DashboardStoreOperation,
  session: StaffActingSession,
  entry: { readonly action: string; readonly detail: unknown },
): PreparedStaffAuditRecord {
  try {
    return prepareStaffAuditRecord({
      sessionTokenHash: session.sessionTokenHash,
      idleLifetimeSeconds: session.idleLifetimeSeconds,
      entry: entry as StaffAuditEntry,
      designId: null,
      subjectAccountId: null,
    });
  } catch (refusal) {
    if (refusal instanceof StaffAuditStoreError) {
      throw new DashboardStoreError(operation, "invalid-request");
    }
    throw refusal;
  }
}

/**
 * The prepared entry's detail as JSON text without the members the statement stamps from what it wrote. The detail is the
 * domain's reading, so it holds the closed key list and nothing a caller smuggled in.
 */
export function detailJsonWithout(
  prepared: PreparedStaffAuditRecord,
  stampedKeys: readonly string[],
): string {
  const kept = Object.entries(prepared.entry.detail ?? {}).filter(
    ([key]) => !stampedKeys.includes(key),
  );
  return JSON.stringify(Object.fromEntries(kept));
}

/**
 * The failure with a built cause (type name, SQLSTATE, constraint name): the audit store's reading of a driver error. A
 * missing table or grant is `unavailable`, which a route answers 503; anything else is `database`.
 */
export function failureFrom(
  operation: DashboardStoreOperation,
  failure: unknown,
): DashboardStoreError {
  if (failure instanceof DashboardStoreError) return failure;
  const read = staffAuditStoreErrorFrom("record a staff audit event", failure);
  const kind: DashboardStoreFailure =
    read.failure === "unavailable" ? "unavailable" : "database";
  return new DashboardStoreError(operation, kind, { cause: read.cause });
}

/** The SQLSTATE and constraint name a driver error carries, and nothing else of it. */
export function sqlFactsOf(failure: unknown): {
  readonly code?: string;
  readonly constraint?: string;
} {
  const cause = staffAuditStoreErrorFrom("record a staff audit event", failure)
    .cause as { code?: string; constraint?: string };
  return {
    ...(cause.code === undefined ? {} : { code: cause.code }),
    ...(cause.constraint === undefined ? {} : { constraint: cause.constraint }),
  };
}

export function unexpectedAnswer(
  operation: DashboardStoreOperation,
): DashboardStoreError {
  return new DashboardStoreError(operation, "unexpected-answer");
}

/** A read, retried on a transient failure, whose rows are plain copies. A write is never given this. */
export async function readRows(
  operation: DashboardStoreOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<readonly Row[]> {
  let reply: unknown;
  try {
    reply = await retryOnTransientFailure(() => Promise.resolve(runQuery()));
  } catch (failure) {
    throw failureFrom(operation, failure);
  }
  return plainRowsOf(reply, operation);
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
export function plainRowsOf(
  reply: unknown,
  operation: DashboardStoreOperation,
): readonly Row[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw unexpectedAnswer(operation);
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw unexpectedAnswer(operation);
  }
}

export function onlyRow(
  rows: readonly Row[],
  operation: DashboardStoreOperation,
): Row {
  const [row, ...others] = rows;
  if (row === undefined || others.length > 0) throw unexpectedAnswer(operation);
  return row;
}

export function requiredText(
  value: unknown,
  operation: DashboardStoreOperation,
): string {
  if (typeof value !== "string") throw unexpectedAnswer(operation);
  return value;
}

export function nullableText(
  value: unknown,
  operation: DashboardStoreOperation,
): string | null {
  return value === null ? null : requiredText(value, operation);
}

export function requiredBoolean(
  value: unknown,
  operation: DashboardStoreOperation,
): boolean {
  if (typeof value !== "boolean") throw unexpectedAnswer(operation);
  return value;
}

/** A whole, non-negative count as a statement reports it (`count(*)::int`). */
export function requiredCount(
  value: unknown,
  operation: DashboardStoreOperation,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw unexpectedAnswer(operation);
  }
  return value;
}

/** A `bigint` that is a version's sequence number, read from its text: a positive whole number a `number` holds. */
export function sequenceNumberFrom(
  value: unknown,
  operation: DashboardStoreOperation,
): number {
  const text = requiredText(value, operation);
  const sequence = /^[1-9][0-9]{0,15}$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(sequence)) throw unexpectedAnswer(operation);
  return sequence;
}

export function instantFrom(
  epochMilliseconds: unknown,
  operation: DashboardStoreOperation,
): Date {
  const instant = instantFromEpochMilliseconds(epochMilliseconds);
  if (instant === undefined) throw unexpectedAnswer(operation);
  return instant;
}

/** The column pair of a log row, as the item it names. `undefined` for a kind this build does not know. */
export function itemFromColumns(kind: string, id: string): ItemRef | undefined {
  const tierKind = ITEM_KINDS_WITH_A_TIER_ID.find((known) => known === kind);
  if (tierKind !== undefined) return { kind: tierKind, tierId: id };
  if (kind === "finish") return { kind, finishId: id };
  if (kind === "accessory") return { kind, accessoryId: id };
  if (kind === "handle") {
    const handle = HandleSchema.safeParse(id);
    return handle.success ? { kind, handle: handle.data } : undefined;
  }
  return undefined;
}
