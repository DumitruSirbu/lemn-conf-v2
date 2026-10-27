import {
  PRICE_BOOK_CURRENCY,
  STAFF_KITCHEN_PAGE_SIZE,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import type { Design, StaffKitchenQuery } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { isDesignRevision } from "./design-revision.js";
import type { DesignRevision } from "./design-revision.js";
import { reducedCauseOf } from "./migration-errors.js";
import type { ReducedCause } from "./migration-errors.js";
import {
  instantFromEpochMilliseconds,
  isCount,
  isMissingGrantOrTable,
  isRecord,
  pagedRowsFrom,
} from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import type { StaffAuditAccountRef } from "./staff-audit-store.js";
import {
  NOTES_READ_LIMIT,
  StaffKitchenReaderError,
  isWellFormedDesignId,
  requireValidStaffKitchenQuery,
  shownStaffStatusOf,
} from "./staff-kitchen-reader.js";
import type {
  StaffKitchenClient,
  StaffKitchenDetail,
  StaffKitchenNote,
  StaffKitchenPage,
  StaffKitchenReader,
  StaffKitchenReaderFailure,
  StaffKitchenReaderOperation,
  StaffKitchenReading,
  StaffKitchenRequest,
  StaffKitchenSentTotal,
  StaffKitchenStatus,
  StaffListedKitchen,
} from "./staff-kitchen-reader.js";
import {
  staffKitchenListStatement,
  staffKitchenNotesStatement,
  staffKitchenStatement,
} from "./staff-kitchen-statements.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const LIST_OPERATION = "list staff kitchens";
const READ_OPERATION = "read a staff kitchen";

/** The text of a stored total: a whole number, no sign and no fraction, as `jsonb` prints an integer. */
const WHOLE_NUMBER_TEXT = /^(0|[1-9][0-9]{0,15})$/;

/**
 * `StaffKitchenReader` on Neon Postgres, over `designs`, joined to `accounts`, `design_request_states`,
 * `design_staff_seen`, `contact_submissions` and `contact_submission_views`, and reading `design_notes` (migrations
 * `0008`, `0010`, `0012`, `0015`-`0017`, `0021`, `0022`, `0026`). Every statement is a read, written in
 * `staff-kitchen-statements.ts`.
 *
 * A kitchen its client deleted is excluded by every statement; one it hid is not. The `contact_submissions` clause
 * names only the seven columns the application role may select (among them `reference`, `client_request_id`,
 * `design_id`, `design_revision` and `created_at`) and `priced`, the one column `0026`'s grant adds, of which it takes
 * the total and the currency alone, never a column the client typed; `accounts` is read for its e-mail, name and phone
 * alone. Whether a kitchen changed after staff saw it is judged in SQL, and the revision stays opaque here.
 */
export class NeonStaffKitchenReader implements StaffKitchenReader {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /** One statement carries the page and the count, so `total` and the kitchens come from one snapshot. */
  async listPage(query: StaffKitchenQuery): Promise<StaffKitchenPage> {
    requireValidStaffKitchenQuery(query);
    const rows = await queryRows(LIST_OPERATION, () =>
      retryOnTransientFailure(() => staffKitchenListStatement(this.sql, query)),
    );
    return pageFrom(rows, query.page);
  }

  /**
   * The kitchen first; its notes only once the kitchen is found, so a refused id costs one statement and reads no note.
   * A malformed id sends no statement.
   */
  async readOne(designId: string): Promise<StaffKitchenReading> {
    if (!isWellFormedDesignId(designId)) return { kind: "none" };
    const kitchenRows = await queryRows(READ_OPERATION, () =>
      retryOnTransientFailure(() => staffKitchenStatement(this.sql, designId)),
    );
    const row = oneRowOrNone(kitchenRows);
    if (row === undefined) return { kind: "none" };
    const noteRows = await queryRows(READ_OPERATION, () =>
      retryOnTransientFailure(() =>
        staffKitchenNotesStatement(this.sql, designId),
      ),
    );
    return { kind: "found", kitchen: detailFrom(row, noteRows) };
  }
}

/** The rows of a statement, or the store error holding a built cause: nothing the driver threw or answered leaves this
 *  module (ADR 0146 B3). */
async function queryRows(
  operation: StaffKitchenReaderOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<readonly Row[]> {
  let reply: unknown;
  try {
    reply = await runQuery();
  } catch (failure) {
    throw readerErrorFrom(operation, failure);
  }
  return plainRowsOf(reply, operation);
}

function readerErrorFrom(
  operation: StaffKitchenReaderOperation,
  failure: unknown,
): StaffKitchenReaderError {
  const { cause } = reducedCauseOf(failure) as { cause: ReducedCause };
  return new StaffKitchenReaderError(operation, failureKindOf(cause.code), {
    cause,
  });
}

function failureKindOf(
  sqlState: string | undefined,
): StaffKitchenReaderFailure {
  return isMissingGrantOrTable(sqlState) ? "unavailable" : "database";
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(
  reply: unknown,
  operation: StaffKitchenReaderOperation,
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

function unexpectedAnswer(
  operation: StaffKitchenReaderOperation,
): StaffKitchenReaderError {
  return new StaffKitchenReaderError(operation, "unexpected-answer");
}

function pageFrom(rows: readonly Row[], page: number): StaffKitchenPage {
  const paged = pagedRowsFrom(rows, STAFF_KITCHEN_PAGE_SIZE);
  const changedCount = rows[0]?.["changed_count"];
  if (paged === undefined || !isCount(changedCount)) {
    throw unexpectedAnswer(LIST_OPERATION);
  }
  return {
    total: paged.total,
    changedCount,
    page,
    pageSize: STAFF_KITCHEN_PAGE_SIZE,
    kitchens: paged.found.map(listedKitchenFrom),
  };
}

function listedKitchenFrom(row: Row): StaffListedKitchen {
  const operation = LIST_OPERATION;
  const isSent = requiredBoolean(row["is_sent"], operation);
  return {
    id: requiredText(row["id"], operation),
    name: optionalText(row["name"], operation),
    design: readableDesignOrNull(row["schema_version"], row["document"]),
    client: clientFrom(row, operation),
    isSent,
    isHidden: requiredBoolean(row["is_hidden"], operation),
    sentAt: optionalInstant(row["sent_ms"], operation),
    updatedAt: requiredInstant(row["updated_ms"], operation),
    requestStatus: shownStaffStatusOf({
      isSent,
      storedStatus: optionalText(row["stored_status"], operation),
    }),
    isChangedSinceSeen: requiredBoolean(row["is_changed"], operation),
  };
}

function oneRowOrNone(rows: readonly Row[]): Row | undefined {
  const [row, ...others] = rows;
  if (others.length > 0) throw unexpectedAnswer(READ_OPERATION);
  return row;
}

/** The statement asks for one note more than the limit; that extra row only says that some were left out. */
function detailFrom(row: Row, noteRows: readonly Row[]): StaffKitchenDetail {
  const operation = READ_OPERATION;
  const isSent = requiredBoolean(row["is_sent"], operation);
  return {
    id: requiredText(row["id"], operation),
    name: optionalText(row["name"], operation),
    revision: revisionFrom(row["revision"], operation),
    isChangedSinceSeen: requiredBoolean(
      row["is_changed_since_seen"],
      operation,
    ),
    design: readableDesignOrNull(row["schema_version"], row["document"]),
    isSent,
    isHidden: requiredBoolean(row["is_hidden"], operation),
    sentAt: optionalInstant(row["sent_ms"], operation),
    updatedAt: requiredInstant(row["updated_ms"], operation),
    client: clientFrom(row, operation),
    request: requestFrom(row, operation),
    sentTotal: sentTotalFrom(row, operation),
    asSent: readableDesignOrNull(
      row["sent_schema_version"],
      row["sent_document"],
    ),
    status: statusFrom(row, isSent, operation),
    notes: noteRows.slice(0, NOTES_READ_LIMIT).map(noteFrom),
    notesTruncated: noteRows.length > NOTES_READ_LIMIT,
  };
}

function clientFrom(
  row: Row,
  operation: StaffKitchenReaderOperation,
): StaffKitchenClient | null {
  const id = optionalText(row["client_id"], operation);
  if (id === null) return null;
  return {
    id,
    email: requiredText(row["client_email"], operation),
    name: optionalText(row["client_name"], operation),
    phone: optionalText(row["client_phone"], operation),
  };
}

function requestFrom(
  row: Row,
  operation: StaffKitchenReaderOperation,
): StaffKitchenRequest | null {
  const reference = optionalText(row["request_reference"], operation);
  if (reference === null) return null;
  return { reference, sentAt: requiredInstant(row["request_ms"], operation) };
}

/** The revision as `designs.revision::text` prints it: a digit run that is a revision, and opaque from here on. */
function revisionFrom(
  value: unknown,
  operation: StaffKitchenReaderOperation,
): DesignRevision {
  const revision = requiredText(value, operation);
  if (!isDesignRevision(revision)) throw unexpectedAnswer(operation);
  return revision;
}

/**
 * The total stored with the latest request, from the two members of its snapshot the statement selects. A request
 * without a snapshot, or a snapshot with no numeric total, stored nothing to show: `null`. A total that is present but
 * is not a whole number a `number` holds exactly, or a currency this build does not price in, is not this reply.
 */
function sentTotalFrom(
  row: Row,
  operation: StaffKitchenReaderOperation,
): StaffKitchenSentTotal | null {
  const totalText = optionalText(row["priced_total_minor"], operation);
  if (totalText === null) return null;
  const totalMinor = Number(totalText);
  const currency = optionalText(row["priced_currency"], operation);
  const isStoredTotal =
    WHOLE_NUMBER_TEXT.test(totalText) &&
    Number.isSafeInteger(totalMinor) &&
    currency === PRICE_BOOK_CURRENCY;
  if (!isStoredTotal) throw unexpectedAnswer(operation);
  return { totalMinor, currency };
}

function statusFrom(
  row: Row,
  isSent: boolean,
  operation: StaffKitchenReaderOperation,
): StaffKitchenStatus | null {
  const storedStatus = optionalText(row["stored_status"], operation);
  const value = shownStaffStatusOf({ isSent, storedStatus });
  if (value === null) return null;
  return {
    value,
    change:
      storedStatus === null
        ? null
        : {
            by: accountRefFrom(row, "changed_by", operation),
            at: requiredInstant(row["changed_ms"], operation),
          },
  };
}

function noteFrom(row: Row): StaffKitchenNote {
  const operation = READ_OPERATION;
  return {
    id: requiredText(row["id"], operation),
    text: requiredText(row["body"], operation),
    createdAt: requiredInstant(row["created_ms"], operation),
    author: accountRefFrom(row, "author", operation),
  };
}

/** The account named by the row's `<prefix>_id`, `<prefix>_email` and `<prefix>_name`; the id is always there. */
function accountRefFrom(
  row: Row,
  prefix: string,
  operation: StaffKitchenReaderOperation,
): StaffAuditAccountRef {
  return {
    id: requiredText(row[`${prefix}_id`], operation),
    email: optionalText(row[`${prefix}_email`], operation),
    name: optionalText(row[`${prefix}_name`], operation),
  };
}

/** The failure is dropped whole: `InvalidDesignError` and a schema error can quote document text. */
function readableDesignOrNull(
  schemaVersion: unknown,
  document: unknown,
): Design | null {
  if (typeof schemaVersion !== "number") return null;
  try {
    return migrateDesign(schemaVersion, document);
  } catch {
    return null;
  }
}

function requiredText(
  value: unknown,
  operation: StaffKitchenReaderOperation,
): string {
  if (typeof value !== "string") throw unexpectedAnswer(operation);
  return value;
}

/** A text column, or `null`. Any other type is not this statement's reply. */
function optionalText(
  value: unknown,
  operation: StaffKitchenReaderOperation,
): string | null {
  return value === null ? null : requiredText(value, operation);
}

function requiredBoolean(
  value: unknown,
  operation: StaffKitchenReaderOperation,
): boolean {
  if (typeof value !== "boolean") throw unexpectedAnswer(operation);
  return value;
}

function optionalInstant(
  epochMilliseconds: unknown,
  operation: StaffKitchenReaderOperation,
): Date | null {
  return epochMilliseconds === null
    ? null
    : requiredInstant(epochMilliseconds, operation);
}

function requiredInstant(
  epochMilliseconds: unknown,
  operation: StaffKitchenReaderOperation,
): Date {
  const instant = instantFromEpochMilliseconds(epochMilliseconds);
  if (instant === undefined) throw unexpectedAnswer(operation);
  return instant;
}
