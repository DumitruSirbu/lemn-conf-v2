import type { NeonQueryFunction } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

import {
  isListablePage,
  isMintedId,
  isRevisionShape,
  itemIdOf,
  storableJsonTextOf,
  storablePublishOf,
} from "./dashboard-store-shapes.js";
import type { StorablePublish } from "./dashboard-store-shapes.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  PRICE_VERSION_PAGE_SIZE,
  VERSION_NOT_FOUND,
} from "./m10-ports.js";
import type {
  DashboardStoreOperation,
  PriceBookStore,
  PriceDraft,
  PriceVersionPage,
  PriceVersionPageRequest,
  PriceVersionSummary,
  PublishPriceBookRequest,
  PublishPriceBookResult,
  ReadActiveVersionResult,
  ReadVersionResult,
  StoredPriceVersion,
  WriteDraftRequest,
  WriteDraftResult,
} from "./m10-ports.js";
import {
  detailJsonWithout,
  failureFrom,
  instantFrom,
  nullableText,
  onlyRow,
  prepareDashboardAudit,
  readRows,
  requiredBoolean,
  requiredCount,
  requiredText,
  sequenceNumberFrom,
  sqlFactsOf,
  unexpectedAnswer,
  writeRows,
} from "./neon-dashboard-store-support.js";
import { isRecord, pagedRowsFrom } from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";
import {
  PUBLISH_RACED,
  SEQUENCE_NUMBER_IS_UNIQUE,
  listVersionsStatement,
  publishStatement,
  readActiveVersionStatement,
  readDraftStatement,
  readVersionStatement,
  writeDraftStatement,
} from "./price-book-statements.js";
import type { PublishStatementInput } from "./price-book-statements.js";
import type { PreparedStaffAuditRecord } from "./staff-audit-store.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const READ_ACTIVE = "read the active price version";
const READ_VERSION = "read a price version";
const LIST_VERSIONS = "list the price versions";
const READ_DRAFT = "read the price draft";
const WRITE_DRAFT = "write the price draft";
const PUBLISH = "publish the price book";

const DRAFT_WRITE_ACTIONS = Object.freeze([
  "price-draft-changed",
  "price-draft-reverted",
  "price-bulk-changed",
  "price-restored-to-draft",
] as const);

/** The members of the `price-published` detail the statement stamps from the version row it inserted. */
const STAMPED_PUBLISH_KEYS = ["sequenceNumber", "changeCount"] as const;

/**
 * `PriceBookStore` on Neon Postgres (migrations `0023` to `0025`, ADR 0178). Each write is one statement, so it and its
 * audit row commit together or not at all, and none is retried. A revision is opaque text: the compare-and-set is in SQL.
 */
export class NeonPriceBookStore implements PriceBookStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async readActive(): Promise<ReadActiveVersionResult> {
    const rows = await readRows(READ_ACTIVE, () =>
      readActiveVersionStatement(this.sql),
    );
    const [row, ...others] = rows;
    if (others.length > 0) throw unexpectedAnswer(READ_ACTIVE);
    if (row === undefined) return NO_ACTIVE_VERSION;
    return { kind: "found", version: activeVersionFrom(row, READ_ACTIVE) };
  }

  async readVersion(versionId: string): Promise<ReadVersionResult> {
    if (!isMintedId(versionId)) return VERSION_NOT_FOUND;
    const rows = await readRows(READ_VERSION, () =>
      readVersionStatement(this.sql, versionId),
    );
    const [row, ...others] = rows;
    if (others.length > 0) throw unexpectedAnswer(READ_VERSION);
    if (row === undefined) return VERSION_NOT_FOUND;
    return { kind: "found", version: storedVersionFrom(row) };
  }

  async listVersions({
    page,
  }: PriceVersionPageRequest): Promise<PriceVersionPage> {
    if (!isListablePage(page)) {
      throw new DashboardStoreError(LIST_VERSIONS, "invalid-request");
    }
    const offset = (page - 1) * PRICE_VERSION_PAGE_SIZE;
    const rows = await readRows(LIST_VERSIONS, () =>
      listVersionsStatement(this.sql, {
        offset,
        limit: PRICE_VERSION_PAGE_SIZE,
      }),
    );
    const paged = pagedRowsFrom(rows, PRICE_VERSION_PAGE_SIZE);
    if (paged === undefined) throw unexpectedAnswer(LIST_VERSIONS);
    return {
      total: paged.total,
      page,
      pageSize: PRICE_VERSION_PAGE_SIZE,
      versions: paged.found.map(summaryFrom),
    };
  }

  async readDraft(): Promise<PriceDraft> {
    const rows = await readRows(READ_DRAFT, () => readDraftStatement(this.sql));
    const row = onlyRow(rows, READ_DRAFT);
    const draftRevision = requiredText(row["revision"], READ_DRAFT);
    const changes: unknown = row["changes"];
    if (!isRevisionShape(draftRevision) || !Array.isArray(changes)) {
      throw unexpectedAnswer(READ_DRAFT);
    }
    return { draftRevision, changes: [...(changes as unknown[])] };
  }

  async writeDraft(request: WriteDraftRequest): Promise<WriteDraftResult> {
    const { expectedDraftRevision, changes, audit: record } = request;
    const changesJson = storableJsonTextOf(changes, "array");
    if (!isRevisionShape(expectedDraftRevision) || changesJson === undefined) {
      throw new DashboardStoreError(WRITE_DRAFT, "invalid-request");
    }
    const audit = prepareDashboardAudit({
      operation: WRITE_DRAFT,
      session: record.session,
      action: record.entry.action,
      detail: record.entry.detail,
      accepts: DRAFT_WRITE_ACTIONS,
    });
    const rows = await writeRows(WRITE_DRAFT, () =>
      writeDraftStatement(this.sql, {
        expectedRevision: expectedDraftRevision,
        changesJson,
        detailJson: detailJsonWithout(audit, []),
        audit,
      }),
    );
    return draftWriteResultFrom(onlyRow(rows, WRITE_DRAFT));
  }

  /**
   * Of two publishes at one draft revision the second finds the draft locked by the first and then moved, and is
   * `changed-meanwhile`; a stale availability head is `availability-changed-meanwhile`. A refusal wrote nothing, the audit
   * row included. The book is stored with its `version` set to the new version's id.
   */
  async publish(
    request: PublishPriceBookRequest,
  ): Promise<PublishPriceBookResult> {
    const publishable = storablePublishOf(request);
    if (publishable === undefined) {
      throw new DashboardStoreError(PUBLISH, "invalid-request");
    }
    const versionId = nanoid();
    const audit = prepareDashboardAudit({
      operation: PUBLISH,
      session: request.audit.session,
      action: request.audit.entry.action,
      detail: {
        ...request.audit.entry.detail,
        sequenceNumber: publishable.expectedActiveSequence + 1,
        changeCount: publishable.changeCount,
      },
      accepts: ["price-published"],
    });
    const outcome = await writeRows(
      PUBLISH,
      () =>
        publishStatement(
          this.sql,
          statementInputOf(request, publishable, versionId, audit),
        ),
      publishRefusalOf,
    );
    if (isRefusal(outcome)) return outcome;
    return publishResultFrom(outcome, versionId);
  }
}

function isRefusal(outcome: unknown): outcome is typeof CHANGED_MEANWHILE {
  return outcome === CHANGED_MEANWHILE;
}

function statementInputOf(
  request: PublishPriceBookRequest,
  publishable: StorablePublish,
  versionId: string,
  audit: PreparedStaffAuditRecord,
): PublishStatementInput {
  return {
    expectedDraftRevision: request.expectedDraftRevision,
    expectedActiveSequence: String(publishable.expectedActiveSequence),
    expectedAvailabilityRevision: request.expectedAvailabilityRevision,
    versionId,
    label: request.label,
    note: request.note,
    bookJson: publishable.bookJson,
    changeSummaryJson: publishable.changeSummaryJson,
    createdItemKinds: publishable.createdItems.map(({ kind }) => kind),
    createdItemIds: publishable.createdItems.map(itemIdOf),
    detailJson: detailJsonWithout(audit, STAMPED_PUBLISH_KEYS),
    audit,
  };
}

function draftWriteResultFrom(row: Row): WriteDraftResult {
  if (!requiredBoolean(row["is_session_live"], WRITE_DRAFT)) {
    throw new DashboardStoreError(WRITE_DRAFT, "not-recorded");
  }
  const draftRevision = nullableText(row["revision"], WRITE_DRAFT);
  if (draftRevision === null) return CHANGED_MEANWHILE;
  const isOneAuditRow = requiredCount(row["audited_rows"], WRITE_DRAFT) === 1;
  if (!isRevisionShape(draftRevision) || !isOneAuditRow) {
    throw unexpectedAnswer(WRITE_DRAFT);
  }
  return { kind: "ok", draftRevision };
}

/** A race lost inside the statement is the refusal `changed-meanwhile`; any other failure is a failure to answer. */
function publishRefusalOf(failure: unknown): typeof CHANGED_MEANWHILE {
  const { code, constraint } = sqlFactsOf(failure);
  const isRaced = code === PUBLISH_RACED;
  const isSequenceTaken =
    code === "23505" && constraint === SEQUENCE_NUMBER_IS_UNIQUE;
  if (isRaced || isSequenceTaken) return CHANGED_MEANWHILE;
  throw failureFrom(PUBLISH, failure);
}

function publishResultFrom(
  rows: readonly Row[],
  mintedVersionId: string,
): PublishPriceBookResult {
  const row = onlyRow(rows, PUBLISH);
  const versionId = nullableText(row["version_id"], PUBLISH);
  if (versionId !== null) return publishedFrom(row, versionId, mintedVersionId);
  if (!requiredBoolean(row["is_session_live"], PUBLISH)) {
    throw new DashboardStoreError(PUBLISH, "not-recorded");
  }
  const isDraftOrSequenceStale =
    requiredCount(row["draft_rows"], PUBLISH) === 0 ||
    !requiredBoolean(row["is_sequence_current"], PUBLISH);
  return isDraftOrSequenceStale
    ? CHANGED_MEANWHILE
    : AVAILABILITY_CHANGED_MEANWHILE;
}

function publishedFrom(
  row: Row,
  versionId: string,
  mintedVersionId: string,
): PublishPriceBookResult {
  const availabilityRevision = requiredText(
    row["availability_revision"],
    PUBLISH,
  );
  if (versionId !== mintedVersionId || !isRevisionShape(availabilityRevision)) {
    throw unexpectedAnswer(PUBLISH);
  }
  return {
    kind: "ok",
    versionId,
    sequenceNumber: sequenceNumberFrom(row["sequence_number"], PUBLISH),
    availabilityRevision,
  };
}

function activeVersionFrom(row: Row, operation: DashboardStoreOperation) {
  const book: unknown = row["book"];
  if (!isRecord(book)) throw unexpectedAnswer(operation);
  return {
    versionId: requiredText(row["id"], operation),
    sequenceNumber: sequenceNumberFrom(row["sequence_number"], operation),
    label: requiredText(row["label"], operation),
    publishedAt: instantFrom(row["published_ms"], operation),
    book,
  };
}

function storedVersionFrom(row: Row): StoredPriceVersion {
  const changeSummary: unknown = row["change_summary"];
  if (!Array.isArray(changeSummary)) throw unexpectedAnswer(READ_VERSION);
  return {
    ...activeVersionFrom(row, READ_VERSION),
    state: requiredBoolean(row["is_active"], READ_VERSION)
      ? "active"
      : "archived",
    note: requiredText(row["note"], READ_VERSION),
    changeSummary,
  };
}

function summaryFrom(row: Row): PriceVersionSummary {
  return {
    versionId: requiredText(row["id"], LIST_VERSIONS),
    sequenceNumber: sequenceNumberFrom(row["sequence_number"], LIST_VERSIONS),
    label: requiredText(row["label"], LIST_VERSIONS),
    state: requiredBoolean(row["is_active"], LIST_VERSIONS)
      ? "active"
      : "archived",
    publishedAt: instantFrom(row["published_ms"], LIST_VERSIONS),
    changeCount: requiredCount(row["change_count"], LIST_VERSIONS),
  };
}
