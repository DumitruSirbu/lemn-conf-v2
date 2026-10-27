import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_MS,
} from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  isCalendarDay,
  isInstantPostgresCanCast,
  isStorableDesignRevision,
} from "./dashboard-store-shapes.js";
import {
  ALREADY_CLAIMED,
  DISPLAYED_REVISION_AHEAD,
  DashboardStoreError,
} from "./m10-ports.js";
import type {
  ClaimDigestDayResult,
  DigestDayKey,
  DigestEligibleKitchen,
  DigestedKitchen,
  KitchenChangeStore,
  MarkKitchenSeenRequest,
  MarkKitchenSeenResult,
} from "./m10-ports.js";
import {
  claimDigestDayStatement,
  listDigestEligibleStatement,
  markSeenStatement,
  recordDigestedStatement,
} from "./kitchen-change-statements.js";
import {
  instantFrom,
  nullableText,
  onlyRow,
  prepareDashboardAudit,
  readRows,
  requiredBoolean,
  requiredCount,
  requiredText,
  unexpectedAnswer,
  writeRows,
} from "./neon-dashboard-store-support.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { isActionableDesignId } from "./staff-kitchen-actions-store.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const MARK_SEEN = "mark a kitchen as seen";
const CLAIM_DAY = "claim a digest day";
const LIST_DIGEST = "list the kitchens a digest holds";
const RECORD_DIGEST = "record a digest";

/**
 * `KitchenChangeStore` on Neon Postgres (migrations `0026` and `0027`, ADR 0178 A-12 and A-13). Every write is one
 * statement and is never retried, so a repeat after a lost reply cannot write twice; the digest list is a read, retried
 * on a transient failure. A revision is opaque text: it is compared only in SQL, and the answers that depend on a
 * comparison (`changedAfterSeen`, the digest's membership) come back from the statement as booleans and as rows.
 *
 * The mark's actor is the staff member behind a live session, whatever their role (the route has judged `contact.read`),
 * as the staff kitchen actions' statements take it. The digest is a system action: it has no actor and writes no audit row.
 */
export class NeonKitchenChangeStore implements KitchenChangeStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * The order of refusals matches the fake's: a revision that is not a digit string is `invalid-request`; an id that
   * cannot be a design's is `not-found` without a statement; then the audit entry; then, in the statement, the live
   * session (`not-recorded`), the kitchen's visibility (`not-found`) and a displayed revision ahead of the kitchen's.
   */
  async markSeen(
    request: MarkKitchenSeenRequest,
  ): Promise<MarkKitchenSeenResult> {
    const { designId, displayedRevision, audit: record } = request;
    if (!isStorableDesignRevision(displayedRevision)) {
      throw new DashboardStoreError(MARK_SEEN, "invalid-request");
    }
    if (!isActionableDesignId(designId)) return { kind: "not-found" };
    const audit = prepareDashboardAudit({
      operation: MARK_SEEN,
      session: record.session,
      action: record.entry.action,
      detail: record.entry.detail,
      accepts: ["kitchen-seen"],
      designId,
    });
    const rows = await writeRows(MARK_SEEN, () =>
      markSeenStatement(this.sql, { designId, displayedRevision, audit }),
    );
    return markSeenResultFrom(onlyRow(rows, MARK_SEEN));
  }

  async claimDigestDay(dayKey: DigestDayKey): Promise<ClaimDigestDayResult> {
    if (!isCalendarDay(dayKey)) {
      throw new DashboardStoreError(CLAIM_DAY, "invalid-request");
    }
    const rows = await writeRows(CLAIM_DAY, () =>
      claimDigestDayStatement(this.sql, dayKey),
    );
    if (rows.length === 0) return ALREADY_CLAIMED;
    if (onlyRow(rows, CLAIM_DAY)["day_key"] !== dayKey) {
      throw unexpectedAnswer(CLAIM_DAY);
    }
    return { kind: "claimed", roundId: dayKey };
  }

  async listDigestEligible(
    now: Date,
  ): Promise<readonly DigestEligibleKitchen[]> {
    if (!isInstantPostgresCanCast(now)) {
      throw new DashboardStoreError(LIST_DIGEST, "invalid-request");
    }
    const rows = await readRows(LIST_DIGEST, () =>
      listDigestEligibleStatement(this.sql, {
        nowIso: now.toISOString(),
        windowMilliseconds: DIGEST_WINDOW_MS,
        stoppingStatuses: DIGEST_STOPPING_STATUSES,
      }),
    );
    return rows.map(digestKitchenFrom);
  }

  /** An entry for a round nobody claimed, or one that is not well formed, is `invalid-request` and writes nothing. */
  async recordDigested(
    roundId: string,
    entries: readonly DigestedKitchen[],
  ): Promise<void> {
    if (!isCalendarDay(roundId) || !entries.every(isRecordableEntry)) {
      throw new DashboardStoreError(RECORD_DIGEST, "invalid-request");
    }
    const rows = await writeRows(RECORD_DIGEST, () =>
      recordDigestedStatement(this.sql, {
        roundId,
        designIds: entries.map((entry) => entry.designId),
        revisions: entries.map((entry) => entry.revision),
      }),
    );
    const row = onlyRow(rows, RECORD_DIGEST);
    if (!requiredBoolean(row["is_claimed"], RECORD_DIGEST)) {
      throw new DashboardStoreError(RECORD_DIGEST, "invalid-request");
    }
    if (requiredCount(row["counted_rows"], RECORD_DIGEST) !== 1) {
      throw unexpectedAnswer(RECORD_DIGEST);
    }
  }
}

function isRecordableEntry(entry: DigestedKitchen): boolean {
  return (
    isActionableDesignId(entry.designId) &&
    isStorableDesignRevision(entry.revision)
  );
}

function markSeenResultFrom(row: Row): MarkKitchenSeenResult {
  if (!requiredBoolean(row["is_session_live"], MARK_SEEN)) {
    throw new DashboardStoreError(MARK_SEEN, "not-recorded");
  }
  if (!requiredBoolean(row["is_kitchen_visible"], MARK_SEEN)) {
    return { kind: "not-found" };
  }
  if (requiredBoolean(row["is_displayed_ahead"], MARK_SEEN)) {
    return DISPLAYED_REVISION_AHEAD;
  }
  const isOneRowEach =
    requiredCount(row["marked_rows"], MARK_SEEN) === 1 &&
    requiredCount(row["audited_rows"], MARK_SEEN) === 1;
  if (!isOneRowEach) throw unexpectedAnswer(MARK_SEEN);
  return {
    kind: "ok",
    changedAfterSeen: requiredBoolean(row["is_changed_after_seen"], MARK_SEEN),
  };
}

/** The name is `accounts.name` as `btrim` left it, else the request's reference; a row with neither is not this reply. */
function digestKitchenFrom(row: Row): DigestEligibleKitchen {
  const revision = requiredText(row["revision"], LIST_DIGEST);
  if (!isStorableDesignRevision(revision)) throw unexpectedAnswer(LIST_DIGEST);
  const kitchenName = nullableText(row["kitchen_name"], LIST_DIGEST);
  const kitchen = {
    designId: requiredText(row["design_id"], LIST_DIGEST),
    ...(kitchenName === null ? {} : { kitchenName }),
    sentAt: instantFrom(row["sent_ms"], LIST_DIGEST),
    updatedAt: instantFrom(row["updated_ms"], LIST_DIGEST),
    revision,
  };
  const customerName = nullableText(row["customer_name"], LIST_DIGEST);
  if (customerName !== null) return { ...kitchen, customerName };
  const reference = nullableText(row["reference"], LIST_DIGEST);
  if (reference === null) throw unexpectedAnswer(LIST_DIGEST);
  return { ...kitchen, reference };
}
