import type { NeonQueryFunction } from "@neondatabase/serverless";

import { isMintedId, isRevisionShape } from "./dashboard-store-shapes.js";
import {
  DashboardStoreError,
  NEVER_RECORDED,
  REVISION_AHEAD,
  UNKNOWN_VERSION,
} from "./m10-ports.js";
import type {
  AcknowledgedPrices,
  DashboardStoreOperation,
  PriceNoticeStore,
  ReadAcknowledgedPricesResult,
  RecordAcknowledgedPricesResult,
} from "./m10-ports.js";
import {
  onlyRow,
  readRows,
  requiredBoolean,
  requiredCount,
  requiredText,
  unexpectedAnswer,
  writeRows,
} from "./neon-dashboard-store-support.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";
import {
  readAcknowledgedStatement,
  recordAcknowledgedStatement,
  recordIfAbsentStatement,
} from "./price-notice-statements.js";
import { isActionableDesignId } from "./staff-kitchen-actions-store.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const READ_ACKNOWLEDGED = "read a design's acknowledged prices";
const RECORD_FIRST_OPEN = "record a design's first-open prices";
const RECORD_ACKNOWLEDGED = "record a design's acknowledged prices";

/**
 * `PriceNoticeStore` on Neon Postgres (migration `0028`, ADR 0178 A-11 and F8). Every write is one statement and is
 * never retried, so a repeat after a lost reply cannot write twice; the read is retried on a transient failure. An
 * availability revision is opaque text: whether it is ahead of the head is decided in SQL, and the answer comes back as
 * a boolean.
 *
 * Whether the caller may edit the design is the route's: the store is given a design id and a pair and cannot tell who
 * is asking. A marker is a customer's write, so it has no actor and no audit row.
 */
export class NeonPriceNoticeStore implements PriceNoticeStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async readAcknowledged(
    designId: string,
  ): Promise<ReadAcknowledgedPricesResult> {
    requireDesignId(designId, READ_ACKNOWLEDGED);
    const rows = await readRows(READ_ACKNOWLEDGED, () =>
      readAcknowledgedStatement(this.sql, designId),
    );
    if (rows.length === 0) return NEVER_RECORDED;
    return {
      kind: "recorded",
      acknowledged: acknowledgedPricesFrom(onlyRow(rows, READ_ACKNOWLEDGED)),
    };
  }

  async recordIfAbsent(
    designId: string,
    pair: AcknowledgedPrices,
  ): Promise<void> {
    requireWritable(designId, pair, RECORD_FIRST_OPEN);
    await writeRows(RECORD_FIRST_OPEN, () =>
      recordIfAbsentStatement(this.sql, { designId, ...pair }),
    );
  }

  /** The version is judged before the revision, as the fake does, so a pair wrong in both is `unknown-version`. */
  async recordAcknowledged(
    designId: string,
    pair: AcknowledgedPrices,
  ): Promise<RecordAcknowledgedPricesResult> {
    requireWritable(designId, pair, RECORD_ACKNOWLEDGED);
    const rows = await writeRows(RECORD_ACKNOWLEDGED, () =>
      recordAcknowledgedStatement(this.sql, { designId, ...pair }),
    );
    return acknowledgementResultFrom(onlyRow(rows, RECORD_ACKNOWLEDGED));
  }
}

function requireDesignId(
  designId: string,
  operation: DashboardStoreOperation,
): void {
  if (!isActionableDesignId(designId)) {
    throw new DashboardStoreError(operation, "invalid-request");
  }
}

function requireWritable(
  designId: string,
  pair: AcknowledgedPrices,
  operation: DashboardStoreOperation,
): void {
  requireDesignId(designId, operation);
  const isWellFormed =
    isMintedId(pair.versionId) && isRevisionShape(pair.availabilityRevision);
  if (!isWellFormed)
    throw new DashboardStoreError(operation, "invalid-request");
}

function acknowledgedPricesFrom(row: Row): AcknowledgedPrices {
  const versionId = requiredText(
    row["acknowledged_version_id"],
    READ_ACKNOWLEDGED,
  );
  const availabilityRevision = requiredText(
    row["availability_revision"],
    READ_ACKNOWLEDGED,
  );
  if (!isMintedId(versionId) || !isRevisionShape(availabilityRevision)) {
    throw unexpectedAnswer(READ_ACKNOWLEDGED);
  }
  return { versionId, availabilityRevision };
}

function acknowledgementResultFrom(row: Row): RecordAcknowledgedPricesResult {
  if (!requiredBoolean(row["is_version_known"], RECORD_ACKNOWLEDGED)) {
    return UNKNOWN_VERSION;
  }
  if (requiredBoolean(row["is_revision_ahead"], RECORD_ACKNOWLEDGED)) {
    return REVISION_AHEAD;
  }
  if (requiredCount(row["written_rows"], RECORD_ACKNOWLEDGED) !== 1) {
    throw unexpectedAnswer(RECORD_ACKNOWLEDGED);
  }
  return { kind: "ok" };
}
