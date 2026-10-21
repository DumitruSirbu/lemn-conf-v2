import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { migrateDesign } from "@lemnaria/configurator-domain";
import type { NeonQueryPromise } from "@neondatabase/serverless";

import { requireAccountIdShape } from "./account-id-shape.js";
import {
  AccountKitchenStoreError,
  MAX_EXPORTED_KITCHENS,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
  instantOfCursorText,
  isKitchenCursor,
  requireValidKitchenIdsForExport,
  requireValidKitchenName,
  requireValidKitchenPageRequest,
} from "./account-kitchen-store.js";
import type {
  AccountKitchenStore,
  AccountKitchenStoreOperation,
  ExportedKitchen,
  ExportedKitchenNotes,
  ExportedNote,
  ExportSize,
  KitchenCursor,
  KitchenDeleteOutcome,
  KitchenDuplication,
  KitchenDuplicationOutcome,
  KitchenExport,
  KitchenHideOutcome,
  KitchenMark,
  KitchenPage,
  KitchenPageRequest,
  KitchenRename,
  KitchenRenameOutcome,
  ListedKitchen,
  SentMarkStore,
} from "./account-kitchen-store.js";
import {
  exportedKitchenNotesRowBound,
  exportedKitchenNotesStatement,
} from "./account-kitchen-notes-statement.js";
import { generateDesignId } from "./generate-design-id.js";
import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

type Row = Record<string, unknown>;

/** What a mark statement reports. `isSent` is `null` when the account has no listed kitchen under that id. */
interface MarkReport {
  readonly isMarked: boolean;
  readonly isSent: boolean | null;
  readonly isAlreadyMarked: boolean;
}

type MarkVerdict = "marked" | "conflict" | "none";

/**
 * `AccountKitchenStore` on Neon Postgres, over `designs` and `design_share_links` (migrations `0001`, `0006`, `0015`,
 * `0016`). Every query is a tagged-template `sql`, which parameterises values. Every statement names `account_id` in
 * its own predicate, and a listed kitchen is one whose `hidden_by_client_at` and `deleted_by_client_at` are both null.
 *
 * `exportAll` reads, and also lists a hidden kitchen, which every other read leaves out. The statements write only
 * `name` (rename), the two marks, `design_share_links.revoked_at`, and a new row
 * (duplicate). None writes `document`, `revision`, `updated_at`, `write_token_hash`, `visitor_hash` or `account_id` of
 * an existing row, and none deletes.
 */
export class NeonAccountKitchenStore implements AccountKitchenStore {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * One statement carries the page and the count, so `total` and the kitchens come from one snapshot, and a page that
   * is empty still reports the total (`left join lateral … on true` always yields a row). It asks for one kitchen more
   * than `limit`; that extra row only decides whether a next page exists, so its `document` is selected as null (a
   * `row_number()` beyond `limit`). The keyset walk is `designs_account_id_updated_at_idx` (`0015`).
   */
  async listPage(request: KitchenPageRequest): Promise<KitchenPage> {
    requireValidKitchenPageRequest(request);
    const { accountId, limit, after } = request;
    const rows = await queryRows("list kitchens", () =>
      retryOnTransientFailure(() =>
        after === undefined
          ? this.firstPageRows(accountId, limit)
          : this.pageRowsAfter(accountId, limit, after),
      ),
    );
    return kitchenPageFrom(rows, limit);
  }

  private firstPageRows(accountId: string, limit: number) {
    const fetchCount = limit + 1;
    return this.sql`
      select t.total, p.id, p.name, p.is_sent, p.cursor_updated_at, p.schema_version, p.document
      from (
        select count(*)::int as total from designs
        where account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
      ) t
      left join lateral (
        select id, name, (sent_at is not null) as is_sent, schema_version,
          case when row_number() over (order by updated_at desc, id desc) <= ${limit}::int then document end as document,
          to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_updated_at
        from designs
        where account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
        order by updated_at desc, id desc
        limit ${fetchCount}
      ) p on true
      order by p.cursor_updated_at desc nulls last, p.id desc
    `;
  }

  private pageRowsAfter(
    accountId: string,
    limit: number,
    after: KitchenCursor,
  ) {
    const fetchCount = limit + 1;
    return this.sql`
      select t.total, p.id, p.name, p.is_sent, p.cursor_updated_at, p.schema_version, p.document
      from (
        select count(*)::int as total from designs
        where account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
      ) t
      left join lateral (
        select id, name, (sent_at is not null) as is_sent, schema_version,
          case when row_number() over (order by updated_at desc, id desc) <= ${limit}::int then document end as document,
          to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_updated_at
        from designs
        where account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
          and (updated_at, id) < (${after.updatedAt}::timestamptz, ${after.id}::text)
        order by updated_at desc, id desc
        limit ${fetchCount}
      ) p on true
      order by p.cursor_updated_at desc nulls last, p.id desc
    `;
  }

  async countListed(accountId: string): Promise<number> {
    requireAccountIdShape(accountId, "count kitchens");
    const rows = await queryRows("count kitchens", () =>
      retryOnTransientFailure(
        () => this.sql`
          select count(*)::int as total from designs
          where account_id = ${accountId}
            and hidden_by_client_at is null and deleted_by_client_at is null
        `,
      ),
    );
    return totalOf(rows, "count kitchens");
  }

  /** The count `exportAll` bounds, over the same predicate and with no document selected. */
  async measureExport(accountId: string): Promise<ExportSize> {
    requireAccountIdShape(accountId, "measure an export");
    const rows = await queryRows("measure an export", () =>
      retryOnTransientFailure(
        () => this.sql`
          select count(*)::int as total from designs
          where account_id = ${accountId} and deleted_by_client_at is null
        `,
      ),
    );
    return totalOf(rows, "measure an export") > MAX_EXPORTED_KITCHENS
      ? { kind: "too-many" }
      : { kind: "within-bound" };
  }

  /**
   * One read in one snapshot: the count and the rows. The rows are selected only while the count is within
   * `MAX_EXPORTED_KITCHENS` (the lateral's `where`), so an account over the bound costs a count and no documents. Hidden
   * kitchens are included, deleted ones are not. Columns are named: no hash, token or visitor is selected. A document
   * this build cannot read is exported as `null` with the rest of its row.
   */
  async exportAll(accountId: string): Promise<KitchenExport> {
    requireAccountIdShape(accountId, "export kitchens");
    const rows = await queryRows("export kitchens", () =>
      retryOnTransientFailure(
        () => this.sql`
          select t.total, p.id, p.name, p.is_sent, p.is_hidden, p.cursor_updated_at, p.schema_version, p.document
          from (
            select count(*)::int as total from designs
            where account_id = ${accountId} and deleted_by_client_at is null
          ) t
          left join lateral (
            select id, name, (sent_at is not null) as is_sent, (hidden_by_client_at is not null) as is_hidden,
              schema_version, document,
              to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_updated_at
            from designs
            where account_id = ${accountId} and deleted_by_client_at is null
              and t.total <= ${MAX_EXPORTED_KITCHENS}::int
          ) p on true
          order by p.cursor_updated_at desc nulls last, p.id desc
        `,
      ),
    );
    return kitchenExportFrom(rows);
  }

  /**
   * One statement for all the export's kitchens (`exportedKitchenNotesStatement`): ownership by the account's own
   * predicate, no author or account column read. A reply that is not that statement's (a kitchen not asked for, more
   * rows than its windows yield, a row of the wrong shape) is the store error, never a download.
   */
  async exportNotes(
    accountId: string,
    designIds: readonly DesignId[],
  ): Promise<ReadonlyMap<DesignId, ExportedKitchenNotes>> {
    requireAccountIdShape(accountId, "export kitchen notes");
    requireValidKitchenIdsForExport(designIds);
    const kitchenIds = [...new Set(designIds)];
    if (kitchenIds.length === 0) return new Map();
    const rowBound = exportedKitchenNotesRowBound(kitchenIds);
    const rows = await queryRows("export kitchen notes", () =>
      retryOnTransientFailure(() =>
        exportedKitchenNotesStatement(this.sql, { accountId, kitchenIds }),
      ),
    );
    return kitchenNotesExportFrom(rows, { kitchenIds, rowBound });
  }

  /** Idempotent, so a repeat after a lost acknowledgement ends in the same row and the same answer. */
  async rename({
    accountId,
    designId,
    name,
  }: KitchenRename): Promise<KitchenRenameOutcome> {
    requireAccountIdShape(accountId, "rename a kitchen");
    requireValidKitchenName(name, "rename a kitchen");
    const rows = await queryRows("rename a kitchen", () =>
      retryOnTransientFailure(
        () => this.sql`
          update designs set name = ${name}
          where id = ${designId} and account_id = ${accountId}
            and hidden_by_client_at is null and deleted_by_client_at is null
          returning id
        `,
      ),
    );
    return rows.length > 0 ? { kind: "renamed" } : { kind: "none" };
  }

  /**
   * One statement: the copy is inserted from a `select` of the source under the account's listed predicate, so another
   * account's kitchen, a missing one, a hidden one and a deleted one insert nothing. `schema_version` and `document`
   * are copied as stored, so the copy owes the same normalisations as its source. `write_token_hash`, `visitor_hash`,
   * `sent_at` and both marks take their null defaults, `revision` starts at 1, and the source row is only read.
   *
   * The id is drawn before the retried callback, as `mint` does it. The final `union` arm finds a row this call's own
   * earlier attempt inserted (`on conflict do nothing` then inserts nothing); that id is unguessable and the arm also
   * names the account, so it matches no row but this call's own.
   */
  async duplicate({
    accountId,
    designId,
    name,
  }: KitchenDuplication): Promise<KitchenDuplicationOutcome> {
    requireAccountIdShape(accountId, "duplicate a kitchen");
    requireValidKitchenName(name, "duplicate a kitchen");
    const copyId = generateDesignId();
    const rows = await queryRows("duplicate a kitchen", () =>
      retryOnTransientFailure(
        () => this.sql`
          with copied as (
            insert into designs (id, schema_version, document, account_id, name)
            select ${copyId}::text, schema_version, document, account_id, ${name}::text
            from designs
            where id = ${designId} and account_id = ${accountId}
              and hidden_by_client_at is null and deleted_by_client_at is null
            on conflict (id) do nothing
            returning id
          )
          select id from copied
          union
          select id from designs where id = ${copyId} and account_id = ${accountId}
        `,
      ),
    );
    return rows.length > 0
      ? { kind: "duplicated", id: copyId }
      : { kind: "none" };
  }

  /**
   * Hides a sent kitchen and revokes its active share link in one atomic step (see `markAndRevoke`). Only a sent
   * kitchen can be hidden; an unsent one answers `not-sent`, to its owner only.
   */
  async hide({
    accountId,
    designId,
  }: KitchenMark): Promise<KitchenHideOutcome> {
    requireAccountIdShape(accountId, "hide a kitchen");
    const report = await this.markAndRevoke("hide a kitchen", {
      mark: { accountId, designId },
      markStatement: (isRetry) => this.sql`
        with marked as (
          update designs set hidden_by_client_at = now()
          where id = ${designId} and account_id = ${accountId}
            and sent_at is not null
            and hidden_by_client_at is null and deleted_by_client_at is null
          returning id
        ), revoked as (
          update design_share_links set revoked_at = now()
          where design_id in (select id from marked) and revoked_at is null
          returning token_hash
        )
        select
          exists (select 1 from marked) as is_marked,
          (select d.sent_at is not null from designs d
            where d.id = ${designId} and d.account_id = ${accountId}
              and d.hidden_by_client_at is null and d.deleted_by_client_at is null) as is_sent,
          exists (select 1 from designs d
            where ${isRetry} and d.id = ${designId} and d.account_id = ${accountId}
              and d.hidden_by_client_at is not null and d.deleted_by_client_at is null) as is_already_marked
      `,
    });
    const verdict = verdictOf(report, "hide a kitchen", {
      conflictingSentState: false,
    });
    return verdict === "marked"
      ? { kind: "hidden" }
      : outcomeOfRefusal(verdict, "not-sent");
  }

  /**
   * Deletes an unsent kitchen from its owner's list and revokes its active share link in one atomic step (see
   * `markAndRevoke`). Only an unsent kitchen can be deleted; a sent one answers `sent`, to its owner only. The row
   * stays: the application role holds no `DELETE`.
   */
  async markDeleted({
    accountId,
    designId,
  }: KitchenMark): Promise<KitchenDeleteOutcome> {
    requireAccountIdShape(accountId, "delete a kitchen");
    const report = await this.markAndRevoke("delete a kitchen", {
      mark: { accountId, designId },
      markStatement: (isRetry) => this.sql`
        with marked as (
          update designs set deleted_by_client_at = now()
          where id = ${designId} and account_id = ${accountId}
            and sent_at is null
            and hidden_by_client_at is null and deleted_by_client_at is null
          returning id
        ), revoked as (
          update design_share_links set revoked_at = now()
          where design_id in (select id from marked) and revoked_at is null
          returning token_hash
        )
        select
          exists (select 1 from marked) as is_marked,
          (select d.sent_at is not null from designs d
            where d.id = ${designId} and d.account_id = ${accountId}
              and d.hidden_by_client_at is null and d.deleted_by_client_at is null) as is_sent,
          exists (select 1 from designs d
            where ${isRetry} and d.id = ${designId} and d.account_id = ${accountId}
              and d.deleted_by_client_at is not null) as is_already_marked
      `,
    });
    const verdict = verdictOf(report, "delete a kitchen", {
      conflictingSentState: true,
    });
    return verdict === "marked"
      ? { kind: "deleted" }
      : outcomeOfRefusal(verdict, "sent");
  }

  /**
   * The shape of every mark: a transaction of two statements, so the share-link revoke is atomic with the mark and
   * waits on the same row lock that a share `issue` takes. (1) `select … for update` locks the design row, queuing
   * behind an `issue` in flight. (2) The statement then takes a snapshot that already holds whatever that `issue`
   * committed, and in one statement marks the row under its full predicate and revokes the links of the rows it marked.
   * A refused mark therefore revokes nothing, and a link minted just before the lock was granted is revoked with the
   * rest. A one-statement version would revoke from a snapshot older than the lock wait and miss that link.
   *
   * READ COMMITTED is pinned for the reason `NeonShareLinkRepository.issue` pins it.
   *
   * A repeat after a lost acknowledgement finds the mark already set: `is_already_marked` reads it on a retry only, so
   * a first attempt that finds an already-marked row still gets the refusal every other caller gets.
   */
  private async markAndRevoke(
    operation: AccountKitchenStoreOperation,
    {
      mark: { accountId, designId },
      markStatement,
    }: {
      mark: KitchenMark;
      markStatement: (isRetry: boolean) => NeonQueryPromise<false, false>;
    },
  ): Promise<MarkReport> {
    const results = await guarded(operation, () =>
      retryOnTransientFailure(({ isRetry }) =>
        this.sql.transaction(
          [
            this.sql`
              select 1 from designs
              where id = ${designId} and account_id = ${accountId}
              for update
            `,
            markStatement(isRetry),
          ],
          { isolationLevel: "ReadCommitted" },
        ),
      ),
    );
    return markReportFrom(plainRowsOf(results[1], operation), operation);
  }
}

/**
 * `SentMarkStore` on Neon Postgres, over `designs` (`0016`). The one statement names no account, because the contact
 * flow also sends designs no account owns; it is for a route that has already verified the id.
 */
export class NeonSentMarkStore implements SentMarkStore {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * A no-op when `sent_at` is already set, so the first instant stands and a repeat after a lost acknowledgement
   * changes nothing. A hidden or deleted draft is never marked. Writes no other column, so `updated_at` and resume
   * order stay.
   */
  async markSent(designId: DesignId): Promise<void> {
    await guarded("mark a kitchen sent", () =>
      retryOnTransientFailure(
        () => this.sql`
          update designs set sent_at = now()
          where id = ${designId} and sent_at is null
            and hidden_by_client_at is null and deleted_by_client_at is null
        `,
      ),
    );
  }
}

/** The rows of a statement, or the store error. A failure leaves as a store error holding a built cause (ADR 0146 B3),
 *  and the driver's own error is thrown by nothing here. */
async function queryRows(
  operation: AccountKitchenStoreOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<readonly Row[]> {
  return plainRowsOf(await guarded(operation, runQuery), operation);
}

async function guarded<Reply>(
  operation: AccountKitchenStoreOperation,
  runQuery: () => PromiseLike<Reply>,
): Promise<Reply> {
  try {
    return await runQuery();
  } catch (failure) {
    throw new AccountKitchenStoreError(operation, reducedCauseOf(failure));
  }
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(
  reply: unknown,
  operation: AccountKitchenStoreOperation,
): readonly Row[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw new AccountKitchenStoreError(operation);
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw new AccountKitchenStoreError(operation);
  }
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function totalOf(
  rows: readonly Row[],
  operation: AccountKitchenStoreOperation,
): number {
  const total = rows[0]?.["total"];
  if (rows.length !== 1 || !isCount(total)) {
    throw new AccountKitchenStoreError(operation);
  }
  return total;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * The page's rows, newest first: the lateral join's kitchens, or one row with no kitchen when there are none. A kitchen
 * whose document `migrateDesign` refuses is counted in `skippedCount` and left out of `kitchens`; `nextCursor` still
 * comes from the last row consumed, so the walk moves past it.
 */
function kitchenPageFrom(rows: readonly Row[], limit: number): KitchenPage {
  const total = rows[0]?.["total"];
  if (rows.length === 0 || !isCount(total)) {
    throw new AccountKitchenStoreError("list kitchens");
  }
  const found = rows.filter((row) => row["id"] !== null);
  if (rows.length > 1 && found.length !== rows.length) {
    throw new AccountKitchenStoreError("list kitchens");
  }
  const kept = found.slice(0, limit);
  const kitchens = kept.flatMap(readableKitchenFrom);
  return {
    kitchens,
    nextCursor: found.length > limit ? cursorOf(kept[kept.length - 1]) : null,
    total,
    skippedCount: kept.length - kitchens.length,
  };
}

/** The export's rows: the account's total, then one row per kitchen, or one row with no kitchen when there are none or
 *  when the total is over the bound. A row count that differs from the total is a statement that did not answer as it
 *  was written, and is the store error. */
function kitchenExportFrom(rows: readonly Row[]): KitchenExport {
  const total = rows[0]?.["total"];
  if (rows.length === 0 || !isCount(total)) {
    throw new AccountKitchenStoreError("export kitchens");
  }
  if (total > MAX_EXPORTED_KITCHENS) return { kind: "too-many" };
  const found = rows.filter((row) => row["id"] !== null);
  if (found.length !== total) {
    throw new AccountKitchenStoreError("export kitchens");
  }
  return { kind: "exported", kitchens: found.map(exportedKitchenFrom) };
}

function exportedKitchenFrom(row: Row): ExportedKitchen {
  const { name, is_sent, is_hidden, schema_version, document } = row;
  const cursor = { updatedAt: row["cursor_updated_at"], id: row["id"] };
  if (
    !isKitchenCursor(cursor) ||
    (typeof name !== "string" && name !== null) ||
    typeof is_sent !== "boolean" ||
    typeof is_hidden !== "boolean" ||
    typeof schema_version !== "number"
  ) {
    throw new AccountKitchenStoreError("export kitchens");
  }
  return {
    id: cursor.id,
    name,
    updatedAt: instantOfCursorText(cursor.updatedAt),
    isSent: is_sent,
    isHidden: is_hidden,
    design: migratedDesignOrUndefined(schema_version, document) ?? null,
  };
}

const EPOCH_MILLISECONDS_SHAPE = /^-?\d{1,16}$/;

/**
 * The notes of each kitchen from the statement's rows, which arrive newest first over all kitchens. A row naming a
 * kitchen that was not asked for, more rows than the statement can yield, or a row of the wrong shape is the store
 * error: a reply that is not the statement's is never turned into a download.
 */
function kitchenNotesExportFrom(
  rows: readonly Row[],
  { kitchenIds, rowBound }: { kitchenIds: readonly string[]; rowBound: number },
): ReadonlyMap<DesignId, ExportedKitchenNotes> {
  if (rows.length > rowBound) {
    throw new AccountKitchenStoreError("export kitchen notes");
  }
  const asked = new Set(kitchenIds);
  const rowsOfKitchen = new Map<DesignId, Row[]>();
  for (const row of rows) {
    const designId = row["design_id"];
    if (typeof designId !== "string" || !asked.has(designId)) {
      throw new AccountKitchenStoreError("export kitchen notes");
    }
    const held = rowsOfKitchen.get(designId) ?? [];
    held.push(row);
    rowsOfKitchen.set(designId, held);
  }
  return new Map(
    [...rowsOfKitchen].map(([designId, held]) => [
      designId,
      exportedKitchenNotesFrom(held),
    ]),
  );
}

function exportedKitchenNotesFrom(rows: readonly Row[]): ExportedKitchenNotes {
  const readable = rows.flatMap(exportedNoteFrom);
  const notes = readable.slice(0, MAX_EXPORTED_NOTES_PER_KITCHEN);
  return { notes, isTruncated: notes.length < rows.length };
}

/** The note of a row, or none for a row whose text the total bound withheld. A half-withheld row is the store error. */
function exportedNoteFrom(row: Row): readonly ExportedNote[] {
  const { body, created_ms } = row;
  if (body === null && created_ms === null) return [];
  if (
    typeof body !== "string" ||
    typeof created_ms !== "string" ||
    !EPOCH_MILLISECONDS_SHAPE.test(created_ms)
  ) {
    throw new AccountKitchenStoreError("export kitchen notes");
  }
  return [{ text: body, createdAt: new Date(Number(created_ms)) }];
}

/** The kitchen of a row, or none when its document is unreadable. A row of the wrong shape is the store error. */
function readableKitchenFrom(row: Row): readonly ListedKitchen[] {
  const { name, is_sent, schema_version, document } = row;
  const { id, updatedAt } = cursorOf(row);
  if (
    (typeof name !== "string" && name !== null) ||
    typeof is_sent !== "boolean" ||
    typeof schema_version !== "number"
  ) {
    throw new AccountKitchenStoreError("list kitchens");
  }
  const design = migratedDesignOrUndefined(schema_version, document);
  if (design === undefined) return [];
  return [
    {
      id,
      name,
      updatedAt: instantOfCursorText(updatedAt),
      isSent: is_sent,
      design,
    },
  ];
}

/** The failure is dropped whole: `InvalidDesignError` and a schema error can quote document text. */
function migratedDesignOrUndefined(
  schemaVersion: number,
  document: unknown,
): Design | undefined {
  try {
    return migrateDesign(schemaVersion, document);
  } catch {
    return undefined;
  }
}

function cursorOf(row: Row | undefined): KitchenCursor {
  const cursor = { updatedAt: row?.["cursor_updated_at"], id: row?.["id"] };
  if (!isKitchenCursor(cursor))
    throw new AccountKitchenStoreError("list kitchens");
  return cursor;
}

function markReportFrom(
  rows: readonly Row[],
  operation: AccountKitchenStoreOperation,
): MarkReport {
  const row = rows[0];
  const isSent = row?.["is_sent"];
  if (
    rows.length !== 1 ||
    typeof row?.["is_marked"] !== "boolean" ||
    typeof row["is_already_marked"] !== "boolean" ||
    (typeof isSent !== "boolean" && isSent !== null)
  ) {
    throw new AccountKitchenStoreError(operation);
  }
  return {
    isMarked: row["is_marked"],
    isSent,
    isAlreadyMarked: row["is_already_marked"],
  };
}

/**
 * What the mark statement's report means. `conflict` is the owner's own kitchen in the sent state this mark refuses,
 * so it is answered only after the ownership predicate matched. A kitchen in the other state that the statement still
 * did not mark cannot occur while the row is locked, and is the store error rather than a guess.
 */
function verdictOf(
  { isMarked, isSent, isAlreadyMarked }: MarkReport,
  operation: AccountKitchenStoreOperation,
  { conflictingSentState }: { conflictingSentState: boolean },
): MarkVerdict {
  if (isMarked || isAlreadyMarked) return "marked";
  if (isSent === null) return "none";
  if (isSent === conflictingSentState) return "conflict";
  throw new AccountKitchenStoreError(operation);
}

function outcomeOfRefusal<Conflict extends string>(
  verdict: Exclude<MarkVerdict, "marked">,
  conflictKind: Conflict,
): { readonly kind: Conflict } | { readonly kind: "none" } {
  return verdict === "conflict" ? { kind: conflictKind } : { kind: "none" };
}
