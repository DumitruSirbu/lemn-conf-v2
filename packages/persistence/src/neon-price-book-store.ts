import type { ItemRef } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

import {
  isJsonObject,
  isMintedId,
  isRevisionShape,
  isStorableItem,
  isWithinStoredJsonLimit,
  isVersionLabel,
  isVersionNote,
  itemIdOf,
} from "./dashboard-store-shapes.js";
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
  plainRowsOf,
  prepareDashboardAudit,
  readRows,
  requiredBoolean,
  requiredCount,
  requiredText,
  sequenceNumberFrom,
  sqlFactsOf,
  unexpectedAnswer,
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

type ApplicationSql = NeonQueryFunction<false, false>;

const READ_ACTIVE = "read the active price version";
const READ_VERSION = "read a price version";
const LIST_VERSIONS = "list the price versions";
const READ_DRAFT = "read the price draft";
const WRITE_DRAFT = "write the price draft";
const PUBLISH = "publish the price book";

/** The actions a draft write may record (X0's closed list of draft entries). */
const DRAFT_WRITE_ACTIONS = Object.freeze([
  "price-draft-changed",
  "price-draft-reverted",
  "price-bulk-changed",
  "price-restored-to-draft",
] as const);

/** The last page a request may name, so an offset stays far inside what the server counts in. A bound on a request. */
const MAX_PRICE_VERSION_PAGE = 100_000;

/** The members of the `price-published` detail the statement stamps from the version row it inserted. */
const STAMPED_PUBLISH_KEYS = ["sequenceNumber", "changeCount"] as const;

/**
 * `PriceBookStore` on Neon Postgres, over `price_book_versions`, `price_book_draft` and, for a publish,
 * `catalogue_availability_head` and `catalogue_availability_changes` (migrations `0023` to `0025`), with the audit row of
 * `staff_audit_events`. Every statement is a tagged-template `sql`, which parameterises values.
 *
 * Each write is **one statement** (`price-book-statements.ts`): the compare-and-set, every row the write produces and its
 * audit row are branches of one `with`, so they commit together or not at all, and a refusal leaves nothing. A write is
 * never retried: a repeat after a lost acknowledgement could publish twice. Reads are retried.
 *
 * Revisions are opaque text. Nothing here parses, orders or does arithmetic on one: the compare-and-set is in SQL, and a
 * revision is only checked for its digit shape before it is sent.
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
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > MAX_PRICE_VERSION_PAGE
    ) {
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
    if (!isRevisionShape(expectedDraftRevision)) {
      throw new DashboardStoreError(WRITE_DRAFT, "invalid-request");
    }
    const changesJson = jsonTextOf(changes, "array", WRITE_DRAFT);
    const audit = prepareDashboardAudit({
      operation: WRITE_DRAFT,
      session: record.session,
      action: record.entry.action,
      detail: record.entry.detail,
      accepts: DRAFT_WRITE_ACTIONS,
    });
    const rows = await this.write(WRITE_DRAFT, () =>
      writeDraftStatement(this.sql, {
        expectedRevision: expectedDraftRevision,
        changesJson,
        detailJson: detailJsonWithout(audit, []),
        audit,
      }),
    );
    const row = onlyRow(rows, WRITE_DRAFT);
    if (!requiredBoolean(row["is_session_live"], WRITE_DRAFT)) {
      throw new DashboardStoreError(WRITE_DRAFT, "not-recorded");
    }
    const draftRevision = nullableText(row["revision"], WRITE_DRAFT);
    if (draftRevision === null) return CHANGED_MEANWHILE;
    if (
      !isRevisionShape(draftRevision) ||
      requiredCount(row["audited_rows"], WRITE_DRAFT) !== 1
    ) {
      throw unexpectedAnswer(WRITE_DRAFT);
    }
    return { kind: "ok", draftRevision };
  }

  /**
   * Of two publishes at one draft revision the second finds the draft locked by the first and then moved, and is
   * `changed-meanwhile`; a stale availability head is `availability-changed-meanwhile`; a draft or head that moved
   * between the statement's snapshot and its lock rolls the whole statement back and is `changed-meanwhile`. A refusal
   * wrote nothing, the audit row included.
   */
  async publish(
    request: PublishPriceBookRequest,
  ): Promise<PublishPriceBookResult> {
    const publishable = requirePublishable(request);
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
    let reply: unknown;
    try {
      reply = await publishStatement(this.sql, {
        expectedDraftRevision: publishable.expectedDraftRevision,
        expectedActiveSequence: String(publishable.expectedActiveSequence),
        expectedAvailabilityRevision: publishable.expectedAvailabilityRevision,
        versionId,
        label: publishable.label,
        note: publishable.note,
        bookJson: publishable.bookJson,
        changeSummaryJson: publishable.changeSummaryJson,
        createdItemKinds: publishable.createdItems.map(({ kind }) => kind),
        createdItemIds: publishable.createdItems.map(itemIdOf),
        detailJson: detailJsonWithout(audit, STAMPED_PUBLISH_KEYS),
        audit,
      });
    } catch (failure) {
      return publishRefusalOf(failure);
    }
    return publishResultFrom(plainRowsOf(reply, PUBLISH), versionId);
  }

  private async write(
    operation: DashboardStoreOperation,
    sendStatement: () => PromiseLike<unknown>,
  ): Promise<readonly Row[]> {
    let reply: unknown;
    try {
      reply = await sendStatement();
    } catch (failure) {
      throw failureFrom(operation, failure);
    }
    return plainRowsOf(reply, operation);
  }
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

interface PublishableRequest {
  readonly expectedDraftRevision: string;
  readonly expectedActiveSequence: number;
  readonly expectedAvailabilityRevision: string;
  readonly label: string;
  readonly note: string;
  readonly bookJson: string;
  readonly changeSummaryJson: string;
  readonly changeCount: number;
  readonly createdItems: PublishPriceBookRequest["createdItems"];
}

/** The request as the statement takes it, or `invalid-request` before any statement. Each member is read once. */
function requirePublishable(
  request: PublishPriceBookRequest,
): PublishableRequest {
  const {
    expectedDraftRevision,
    expectedActiveSequence,
    expectedAvailabilityRevision,
    label,
    note,
    book,
    changeSummary,
    createdItems,
  } = request;
  const isWellFormed =
    isRevisionShape(expectedDraftRevision) &&
    isRevisionShape(expectedAvailabilityRevision) &&
    Number.isSafeInteger(expectedActiveSequence) &&
    expectedActiveSequence >= 0 &&
    isVersionLabel(label) &&
    isVersionNote(note) &&
    isJsonObject(book) &&
    Array.isArray(changeSummary) &&
    Array.isArray(createdItems) &&
    createdItems.every(isStorableItem);
  if (!isWellFormed) throw new DashboardStoreError(PUBLISH, "invalid-request");
  return {
    expectedDraftRevision,
    expectedActiveSequence,
    expectedAvailabilityRevision,
    label,
    note,
    bookJson: jsonTextOf(book, "object", PUBLISH),
    changeSummaryJson: jsonTextOf(changeSummary, "array", PUBLISH),
    changeCount: (changeSummary as readonly unknown[]).length,
    createdItems: Array.from<ItemRef>(createdItems),
  };
}

/**
 * The JSON text of a value that must come out as an object or an array, or `invalid-request`: a value JSON cannot hold,
 * or one longer than a table takes (refused without quoting any of it).
 */
function jsonTextOf(
  value: unknown,
  shape: "object" | "array",
  operation: DashboardStoreOperation,
): string {
  let text: string | undefined;
  try {
    // `JSON.stringify` answers `undefined` for a value JSON has no text for, which its signature does not say.
    text = JSON.stringify(value) as string | undefined;
  } catch {
    throw new DashboardStoreError(operation, "invalid-request");
  }
  const opening = shape === "array" ? "[" : "{";
  if (!text?.startsWith(opening) || !isWithinStoredJsonLimit(text)) {
    throw new DashboardStoreError(operation, "invalid-request");
  }
  return text;
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
