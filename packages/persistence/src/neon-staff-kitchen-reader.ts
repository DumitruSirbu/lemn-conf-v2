import {
  INITIAL_REQUEST_STATUS,
  STAFF_KITCHEN_PAGE_SIZE,
  migrateDesign,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import type { Design, StaffKitchenQuery } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { reducedCauseOf } from "./migration-errors.js";
import type { ReducedCause } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import type { StaffAuditAccountRef } from "./staff-audit-store.js";
import {
  StaffKitchenReaderError,
  isWellFormedDesignId,
  likePatternContaining,
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
  StaffKitchenStatus,
  StaffListedKitchen,
} from "./staff-kitchen-reader.js";

type ApplicationSql = NeonQueryFunction<false, false>;
type Row = Record<string, unknown>;

const MISSING_GRANT = "42501";
const MISSING_TABLE = "42P01";

const LIST_OPERATION = "list staff kitchens";
const READ_OPERATION = "read a staff kitchen";

/**
 * `StaffKitchenReader` on Neon Postgres, over `designs`, joined to `accounts`, `design_request_states`,
 * `contact_submissions` and `contact_submission_views`, and reading `design_notes` (migrations `0008`, `0010`, `0012`,
 * `0015`-`0017`, `0021`, `0022`). Every statement is a read, in a tagged-template `sql`, which parameterises values.
 *
 * A kitchen its client deleted is excluded by every statement; one it hid is not. The `contact_submissions` clause names
 * only the seven columns the application role may select (`reference`, `client_request_id`, `design_id`, `created_at`
 * among them), never a column the client typed, and `accounts` is read for its e-mail, name and phone alone.
 */
export class NeonStaffKitchenReader implements StaffKitchenReader {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * One statement carries the page and the count, so `total` and the kitchens come from one snapshot, and an empty page
   * still reports the total. The accounts and the status row are **left** joins: a kitchen with no account stays, with
   * a null client. The sent segment walks `sent_at`, the others `updated_at`; ties break by `id`, and the outer query
   * repeats the order because a lateral join promises none.
   */
  async listPage(query: StaffKitchenQuery): Promise<StaffKitchenPage> {
    requireValidStaffKitchenQuery(query);
    const rows = await queryRows(LIST_OPERATION, () =>
      retryOnTransientFailure(() => this.pageRows(query)),
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
      retryOnTransientFailure(() => this.kitchenRows(designId)),
    );
    const row = oneRowOrNone(kitchenRows);
    if (row === undefined) return { kind: "none" };
    const noteRows = await queryRows(READ_OPERATION, () =>
      retryOnTransientFailure(() => this.noteRows(designId)),
    );
    return { kind: "found", kitchen: detailFrom(row, noteRows) };
  }

  private pageRows(query: StaffKitchenQuery) {
    const { segment, status, search, page } = query;
    const pattern = search === null ? null : likePatternContaining(search);
    return this.sql`
      with matching as (
        select d.id, d.name, d.sent_at, d.updated_at, d.hidden_by_client_at,
          case when ${segment}::text = 'sent' then d.sent_at else d.updated_at end as sorted_at,
          a.id as client_id, a.email as client_email, a.name as client_name, a.phone as client_phone,
          s.status as stored_status
        from designs d
        left join accounts a on a.id = d.account_id
        left join design_request_states s on s.design_id = d.id
        where d.deleted_by_client_at is null
          and (case ${segment}::text
            when 'sent' then d.sent_at is not null
            when 'drafts' then d.sent_at is null and d.account_id is not null
            when 'all' then d.sent_at is not null or d.account_id is not null
          end)
          and (${status}::text is null or coalesce(s.status, ${INITIAL_REQUEST_STATUS}::text) = ${status}::text)
          and (${pattern}::text is null
            or a.email_normal_form ilike ${pattern}::text escape '\\'
            or a.name ilike ${pattern}::text escape '\\')
      )
      select t.total, p.id, p.name, p.is_sent, p.is_hidden, p.sent_ms, p.updated_ms, p.sorted_at,
        p.client_id, p.client_email, p.client_name, p.client_phone, p.stored_status
      from (select count(*)::int as total from matching) t
      left join lateral (
        select m.id, m.name, (m.sent_at is not null) as is_sent, (m.hidden_by_client_at is not null) as is_hidden,
          floor(extract(epoch from m.sent_at) * 1000)::bigint::text as sent_ms,
          floor(extract(epoch from m.updated_at) * 1000)::bigint::text as updated_ms,
          m.sorted_at, m.client_id, m.client_email, m.client_name, m.client_phone, m.stored_status
        from matching m
        order by m.sorted_at desc, m.id desc
        limit ${STAFF_KITCHEN_PAGE_SIZE}::int offset ${staffKitchenOffsetOf(page)}::bigint
      ) p on true
      order by p.sorted_at desc nulls last, p.id desc
    `;
  }

  /**
   * A kitchen is readable unless its client deleted it, and unless it is a visitor's unsent draft, which no list shows
   * (the same two tests as the lists' `all` segment). `contact_submissions` is read through `cs` for the columns the
   * application role may select, and its newest row for the design is the latest request. The as-sent copy is the newest
   * unrevoked view of that request.
   */
  private kitchenRows(designId: string) {
    return this.sql`
      select d.id, d.name, d.schema_version, d.document,
        (d.sent_at is not null) as is_sent, (d.hidden_by_client_at is not null) as is_hidden,
        floor(extract(epoch from d.sent_at) * 1000)::bigint::text as sent_ms,
        floor(extract(epoch from d.updated_at) * 1000)::bigint::text as updated_ms,
        a.id as client_id, a.email as client_email, a.name as client_name, a.phone as client_phone,
        request.reference as request_reference, request.created_ms as request_ms,
        sent_copy.schema_version as sent_schema_version, sent_copy.design_document as sent_document,
        s.status as stored_status, s.changed_by_account_id as changed_by_id,
        floor(extract(epoch from s.changed_at) * 1000)::bigint::text as changed_ms,
        changer.email as changed_by_email, changer.name as changed_by_name
      from designs d
      left join accounts a on a.id = d.account_id
      left join lateral (
        select cs.reference, cs.client_request_id,
          floor(extract(epoch from cs.created_at) * 1000)::bigint::text as created_ms
        from contact_submissions cs
        where cs.design_id = d.id
        order by cs.created_at desc, cs.client_request_id desc
        limit 1
      ) request on true
      left join lateral (
        select csv.schema_version, csv.design_document
        from contact_submission_views csv
        where csv.client_request_id = request.client_request_id and csv.revoked_at is null
        order by csv.created_at desc
        limit 1
      ) sent_copy on true
      left join design_request_states s on s.design_id = d.id
      left join accounts changer on changer.id = s.changed_by_account_id
      where d.id = ${designId}
        and d.deleted_by_client_at is null
        and (d.sent_at is not null or d.account_id is not null)
    `;
  }

  private noteRows(designId: string) {
    return this.sql`
      select n.id, n.body, floor(extract(epoch from n.created_at) * 1000)::bigint::text as created_ms,
        n.author_account_id, author.email as author_email, author.name as author_name
      from design_notes n
      left join accounts author on author.id = n.author_account_id
      where n.design_id = ${designId}
      order by n.created_at desc, n.id desc
    `;
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
  const isMissing = sqlState === MISSING_GRANT || sqlState === MISSING_TABLE;
  return isMissing ? "unavailable" : "database";
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

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedAnswer(
  operation: StaffKitchenReaderOperation,
): StaffKitchenReaderError {
  return new StaffKitchenReaderError(operation, "unexpected-answer");
}

/** The statement's rows: the matching total, then one row per kitchen, or one row with no kitchen when the page is empty.
 *  A row count above a page, or an empty reply, is a statement that did not answer as it was written. */
function pageFrom(rows: readonly Row[], page: number): StaffKitchenPage {
  const total = rows[0]?.["total"];
  if (rows.length === 0 || !isCount(total))
    throw unexpectedAnswer(LIST_OPERATION);
  const found = rows.filter((row) => row["id"] !== null);
  const isEmptyPage = found.length === 0 && rows.length === 1;
  const isFullReply = found.length === rows.length;
  if (!isEmptyPage && !isFullReply) throw unexpectedAnswer(LIST_OPERATION);
  if (found.length > STAFF_KITCHEN_PAGE_SIZE) {
    throw unexpectedAnswer(LIST_OPERATION);
  }
  return {
    total,
    page,
    pageSize: STAFF_KITCHEN_PAGE_SIZE,
    kitchens: found.map(listedKitchenFrom),
  };
}

function listedKitchenFrom(row: Row): StaffListedKitchen {
  const operation = LIST_OPERATION;
  const id = requiredText(row["id"], operation);
  const isSent = requiredBoolean(row["is_sent"], operation);
  return {
    id,
    name: optionalText(row["name"], operation),
    client: clientFrom(row, operation),
    isSent,
    isHidden: requiredBoolean(row["is_hidden"], operation),
    sentAt: optionalInstant(row["sent_ms"], operation),
    updatedAt: requiredInstant(row["updated_ms"], operation),
    requestStatus: shownStaffStatusOf({
      isSent,
      storedStatus: optionalText(row["stored_status"], operation),
    }),
  };
}

function oneRowOrNone(rows: readonly Row[]): Row | undefined {
  const [row, ...others] = rows;
  if (others.length > 0) throw unexpectedAnswer(READ_OPERATION);
  return row;
}

function detailFrom(row: Row, noteRows: readonly Row[]): StaffKitchenDetail {
  const operation = READ_OPERATION;
  const isSent = requiredBoolean(row["is_sent"], operation);
  const schemaVersion = row["schema_version"];
  return {
    id: requiredText(row["id"], operation),
    name: optionalText(row["name"], operation),
    design: readableDesignOrNull(schemaVersion, row["document"]),
    isSent,
    isHidden: requiredBoolean(row["is_hidden"], operation),
    sentAt: optionalInstant(row["sent_ms"], operation),
    updatedAt: requiredInstant(row["updated_ms"], operation),
    client: clientFrom(row, operation),
    request: requestFrom(row, operation),
    asSent: readableDesignOrNull(
      row["sent_schema_version"],
      row["sent_document"],
    ),
    status: statusFrom(row, isSent, operation),
    notes: noteRows.map(noteFrom),
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
    change: storedStatus === null ? null : statusChangeFrom(row, operation),
  };
}

function statusChangeFrom(
  row: Row,
  operation: StaffKitchenReaderOperation,
): NonNullable<StaffKitchenStatus["change"]> {
  return {
    by: accountRefFrom(
      requiredText(row["changed_by_id"], operation),
      row["changed_by_email"],
      row["changed_by_name"],
      operation,
    ),
    at: requiredInstant(row["changed_ms"], operation),
  };
}

function noteFrom(row: Row): StaffKitchenNote {
  const operation = READ_OPERATION;
  return {
    id: requiredText(row["id"], operation),
    text: requiredText(row["body"], operation),
    createdAt: requiredInstant(row["created_ms"], operation),
    author: accountRefFrom(
      requiredText(row["author_account_id"], operation),
      row["author_email"],
      row["author_name"],
      operation,
    ),
  };
}

function accountRefFrom(
  id: string,
  email: unknown,
  name: unknown,
  operation: StaffKitchenReaderOperation,
): StaffAuditAccountRef {
  return {
    id,
    email: optionalText(email, operation),
    name: optionalText(name, operation),
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
  const milliseconds =
    typeof epochMilliseconds === "string" &&
    /^[0-9]{1,16}$/.test(epochMilliseconds)
      ? Number(epochMilliseconds)
      : Number.NaN;
  if (!Number.isSafeInteger(milliseconds)) throw unexpectedAnswer(operation);
  return new Date(milliseconds);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
