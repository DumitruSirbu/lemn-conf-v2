import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  isRevisionShape,
  storableDefaultsJsonOf,
} from "./dashboard-store-shapes.js";
import {
  readKitchenDefaultsStatement,
  saveKitchenDefaultsStatement,
} from "./kitchen-defaults-statements.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  INITIAL_REVISION,
  NONE_SAVED,
} from "./m10-ports.js";
import type {
  KitchenDefaultsStore,
  ReadKitchenDefaultsResult,
  SaveKitchenDefaultsRequest,
  SaveKitchenDefaultsResult,
} from "./m10-ports.js";
import {
  detailJsonWithout,
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
import { isRecord } from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const READ_DEFAULTS = "read the kitchen defaults";
const SAVE_DEFAULTS = "save the kitchen defaults";

/**
 * `KitchenDefaultsStore` on Neon Postgres (migration `0029`, ADR 0178 A-9). A save is one statement, so the availability
 * head's compare-and-set, the defaults row and the audit row commit together or not at all, and it is never retried. A
 * revision is opaque text: both compare-and-sets are in SQL. The defaults are `unknown` here, so whether an item may be
 * the default is the domain's judgement, made before the call under the same head.
 */
export class NeonKitchenDefaultsStore implements KitchenDefaultsStore {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async read(): Promise<ReadKitchenDefaultsResult> {
    const rows = await readRows(READ_DEFAULTS, () =>
      readKitchenDefaultsStatement(this.sql),
    );
    return savedDefaultsFrom(onlyRow(rows, READ_DEFAULTS));
  }

  async save(
    request: SaveKitchenDefaultsRequest,
  ): Promise<SaveKitchenDefaultsResult> {
    const { expectedRevision, expectedAvailabilityRevision } = request;
    const defaultsJson = storableDefaultsJsonOf(request.defaults);
    if (
      !isRevisionShape(expectedRevision) ||
      !isRevisionShape(expectedAvailabilityRevision) ||
      defaultsJson === undefined
    ) {
      throw new DashboardStoreError(SAVE_DEFAULTS, "invalid-request");
    }
    const audit = prepareDashboardAudit({
      operation: SAVE_DEFAULTS,
      session: request.audit.session,
      action: request.audit.entry.action,
      detail: request.audit.entry.detail,
      accepts: ["kitchen-defaults-saved"],
    });
    const rows = await writeRows(SAVE_DEFAULTS, () =>
      saveKitchenDefaultsStatement(this.sql, {
        expectedRevision,
        expectedAvailabilityRevision,
        defaultsJson,
        detailJson: detailJsonWithout(audit, []),
        audit,
      }),
    );
    return saveResultFrom(onlyRow(rows, SAVE_DEFAULTS));
  }
}

/** The seeded row, never saved, reads as none saved: whether a save happened is the revision, not the content. */
function savedDefaultsFrom(row: Row): ReadKitchenDefaultsResult {
  const revision = requiredText(row["revision"], READ_DEFAULTS);
  const defaults: unknown = row["defaults"];
  if (!isRevisionShape(revision) || !isRecord(defaults)) {
    throw unexpectedAnswer(READ_DEFAULTS);
  }
  if (revision === INITIAL_REVISION) return NONE_SAVED;
  return {
    kind: "saved",
    saved: {
      revision,
      defaults,
      savedAt: instantFrom(row["saved_ms"], READ_DEFAULTS),
    },
  };
}

/**
 * A save that wrote nothing is told apart by what the statement saw: a defaults revision that was not current is
 * `changed-meanwhile`, and otherwise the head moved (or was lost to a writer racing at the same head), which is
 * `availability-changed-meanwhile`.
 */
function saveResultFrom(row: Row): SaveKitchenDefaultsResult {
  if (!requiredBoolean(row["is_session_live"], SAVE_DEFAULTS)) {
    throw new DashboardStoreError(SAVE_DEFAULTS, "not-recorded");
  }
  const revision = nullableText(row["revision"], SAVE_DEFAULTS);
  if (revision === null) return refusalFrom(row);
  const availabilityRevision = nullableText(
    row["availability_revision"],
    SAVE_DEFAULTS,
  );
  const isOneAuditRow = requiredCount(row["audited_rows"], SAVE_DEFAULTS) === 1;
  const isWellFormed =
    isRevisionShape(revision) &&
    isRevisionShape(availabilityRevision) &&
    isOneAuditRow;
  if (!isWellFormed) throw unexpectedAnswer(SAVE_DEFAULTS);
  return { kind: "ok", revision, availabilityRevision };
}

function refusalFrom(
  row: Row,
): typeof CHANGED_MEANWHILE | typeof AVAILABILITY_CHANGED_MEANWHILE {
  return requiredBoolean(row["is_revision_current"], SAVE_DEFAULTS)
    ? AVAILABILITY_CHANGED_MEANWHILE
    : CHANGED_MEANWHILE;
}
