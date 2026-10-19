import type { DesignId } from "@lemnaria/configurator-domain";
import { migrateDesign } from "@lemnaria/configurator-domain";
import type { NeonQueryPromise } from "@neondatabase/serverless";

import { requireAccountIdShape } from "./account-id-shape.js";
import {
  AccountKitchenStoreError,
  instantOfCursorText,
  isKitchenCursor,
  requireValidKitchenName,
  requireValidKitchenPageRequest,
} from "./account-kitchen-store.js";
import type {
  AccountKitchenStore,
  AccountKitchenStoreOperation,
  KitchenCursor,
  KitchenDeleteOutcome,
  KitchenDuplication,
  KitchenDuplicationOutcome,
  KitchenHideOutcome,
  KitchenMark,
  KitchenPage,
  KitchenPageRequest,
  KitchenRename,
  KitchenRenameOutcome,
  ListedKitchen,
} from "./account-kitchen-store.js";
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
 * `0016`). Every query is a tagged-template `sql`, which parameterises values. Every statement but `markSent` names
 * `account_id` in its own predicate, and a listed kitchen is one whose `hidden_by_client_at` and
 * `deleted_by_client_at` are both null.
 *
 * The statements write only `name` (rename), the two marks, `sent_at`, `design_share_links.revoked_at`, and a new row
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
   * than `limit`; that extra row only decides whether a next page exists. The keyset walk is
   * `designs_account_id_updated_at_idx` (`0015`).
   */
  async listPage(request: KitchenPageRequest): Promise<KitchenPage> {
    requireValidKitchenPageRequest(request);
    const { accountId, limit, after } = request;
    const fetchCount = limit + 1;
    const rows = await queryRows("list kitchens", () =>
      retryOnTransientFailure(() =>
        after === undefined
          ? this.firstPageRows(accountId, fetchCount)
          : this.pageRowsAfter(accountId, fetchCount, after),
      ),
    );
    return kitchenPageFrom(rows, limit);
  }

  private firstPageRows(accountId: string, fetchCount: number) {
    return this.sql`
      select t.total, p.id, p.name, p.is_sent, p.cursor_updated_at, p.schema_version, p.document
      from (
        select count(*)::int as total from designs
        where account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
      ) t
      left join lateral (
        select id, name, (sent_at is not null) as is_sent, schema_version, document,
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
    fetchCount: number,
    after: KitchenCursor,
  ) {
    return this.sql`
      select t.total, p.id, p.name, p.is_sent, p.cursor_updated_at, p.schema_version, p.document
      from (
        select count(*)::int as total from designs
        where account_id = ${accountId}
          and hidden_by_client_at is null and deleted_by_client_at is null
      ) t
      left join lateral (
        select id, name, (sent_at is not null) as is_sent, schema_version, document,
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

  /** Idempotent: the first instant stands. Reads and writes no other column, so `updated_at` and resume order stay. */
  async markSent(designId: DesignId): Promise<void> {
    await guarded("mark a kitchen sent", () =>
      retryOnTransientFailure(
        () => this.sql`
          update designs set sent_at = coalesce(sent_at, now())
          where id = ${designId}
        `,
      ),
    );
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

/** The page's rows, newest first: the lateral join's kitchens, or one row with no kitchen when there are none. */
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
  return {
    kitchens: kept.map(listedKitchenFrom),
    nextCursor: found.length > limit ? cursorOf(kept[kept.length - 1]) : null,
    total,
  };
}

function listedKitchenFrom(row: Row): ListedKitchen {
  const { name, is_sent, schema_version, document } = row;
  const { id, updatedAt } = cursorOf(row);
  if (
    (typeof name !== "string" && name !== null) ||
    typeof is_sent !== "boolean" ||
    typeof schema_version !== "number"
  ) {
    throw new AccountKitchenStoreError("list kitchens");
  }
  return {
    id,
    name,
    updatedAt: instantOfCursorText(updatedAt),
    isSent: is_sent,
    design: migrateDesign(schema_version, document),
  };
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
