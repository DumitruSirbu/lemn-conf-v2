import { CATALOGUE_ACTIVATION_AUDIT_ACTION } from "@lemnaria/configurator-domain";
import type {
  CatalogueAvailability,
  ItemRef,
} from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  isRevisionShape,
  isStorableItem,
  itemIdOf,
} from "./dashboard-store-shapes.js";
import {
  AVAILABILITY_REVISION_NOT_FOUND,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  INITIAL_REVISION,
} from "./m10-ports.js";
import type {
  CatalogueAvailabilityStore,
  ReadAvailabilityAtResult,
  SetItemActiveRequest,
  SetItemActiveResult,
} from "./m10-ports.js";
import {
  detailJsonWithout,
  itemFromColumns,
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
import {
  readAvailabilityAtStatement,
  readCurrentAvailabilityStatement,
  setItemActiveStatement,
} from "./catalogue-availability-statements.js";

type ApplicationSql = NeonQueryFunction<false, false>;

const READ_AVAILABILITY = "read the catalogue availability";
const SET_AVAILABILITY = "set an item's availability";

/** The members of the activation detail the statement stamps from the head revision it produced. */
const STAMPED_ACTIVATION_KEYS = ["availabilityRevision"] as const;

/**
 * `CatalogueAvailabilityStore` on Neon Postgres (migration `0025`, ADR 0178 A-17). A write is one statement, so the head's
 * compare-and-set, the log row and the audit row commit together or not at all, and it is never retried. A revision is
 * opaque text: the compare-and-set is in SQL.
 */
export class NeonCatalogueAvailabilityStore
  implements CatalogueAvailabilityStore
{
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async readCurrent(): Promise<CatalogueAvailability> {
    const rows = await readRows(READ_AVAILABILITY, () =>
      readCurrentAvailabilityStatement(this.sql),
    );
    return availabilityFrom(rows);
  }

  async readAt(revision: string): Promise<ReadAvailabilityAtResult> {
    if (!isRevisionShape(revision)) return AVAILABILITY_REVISION_NOT_FOUND;
    const rows = await readRows(READ_AVAILABILITY, () =>
      readAvailabilityAtStatement(this.sql, revision),
    );
    if (rows.length === 0) return AVAILABILITY_REVISION_NOT_FOUND;
    return { kind: "found", availability: availabilityFrom(rows) };
  }

  async setActive(request: SetItemActiveRequest): Promise<SetItemActiveResult> {
    const { item, active, expectedRevision, audit: record } = request;
    if (
      !isRevisionShape(expectedRevision) ||
      typeof active !== "boolean" ||
      !isStorableItem(item)
    ) {
      throw new DashboardStoreError(SET_AVAILABILITY, "invalid-request");
    }
    const audit = prepareDashboardAudit({
      operation: SET_AVAILABILITY,
      session: record.session,
      action: record.entry.action,
      detail: {
        ...record.entry.detail,
        availabilityRevision: INITIAL_REVISION,
      },
      accepts: [CATALOGUE_ACTIVATION_AUDIT_ACTION],
    });
    requireDescribing(audit.entry.detail, item, active);
    const rows = await writeRows(SET_AVAILABILITY, () =>
      setItemActiveStatement(this.sql, {
        expectedRevision,
        itemKind: item.kind,
        itemId: itemIdOf(item),
        active,
        detailJson: detailJsonWithout(audit, STAMPED_ACTIVATION_KEYS),
        audit,
      }),
    );
    return setActiveResultFrom(onlyRow(rows, SET_AVAILABILITY));
  }
}

function setActiveResultFrom(row: Row): SetItemActiveResult {
  if (!requiredBoolean(row["is_session_live"], SET_AVAILABILITY)) {
    throw new DashboardStoreError(SET_AVAILABILITY, "not-recorded");
  }
  const revision = nullableText(row["revision"], SET_AVAILABILITY);
  if (revision === null) return CHANGED_MEANWHILE;
  const isOneRowEach =
    row["logged_revision"] === revision &&
    requiredCount(row["audited_rows"], SET_AVAILABILITY) === 1;
  if (!isRevisionShape(revision) || !isOneRowEach) {
    throw unexpectedAnswer(SET_AVAILABILITY);
  }
  return { kind: "ok", revision };
}

/** The audit entry must describe this write: its item and its flag. The domain has read the detail already. */
function requireDescribing(
  detail: unknown,
  item: ItemRef,
  active: boolean,
): void {
  const isDescribing =
    isRecord(detail) &&
    detail["itemKind"] === item.kind &&
    detail["itemId"] === itemIdOf(item) &&
    detail["active"] === active;
  if (!isDescribing) {
    throw new DashboardStoreError(SET_AVAILABILITY, "invalid-request");
  }
}

/**
 * The statements answer one row per switched-off item, each with the revision they read, or one row with no item when
 * nothing is switched off. A reply with no row, or with rows that disagree on the revision, is not that.
 */
function availabilityFrom(rows: readonly Row[]): CatalogueAvailability {
  const [first] = rows;
  if (first === undefined) throw unexpectedAnswer(READ_AVAILABILITY);
  const revision = requiredText(first["revision"], READ_AVAILABILITY);
  if (!isRevisionShape(revision)) throw unexpectedAnswer(READ_AVAILABILITY);
  const disabled: ItemRef[] = [];
  for (const row of rows) {
    if (row["revision"] !== revision) throw unexpectedAnswer(READ_AVAILABILITY);
    const item = disabledItemFrom(row);
    if (item !== undefined) disabled.push(item);
  }
  return { revision, disabled };
}

function disabledItemFrom(row: Row): ItemRef | undefined {
  const kind = nullableText(row["item_kind"], READ_AVAILABILITY);
  const id = nullableText(row["item_id"], READ_AVAILABILITY);
  if (kind === null && id === null) return undefined;
  if (kind === null || id === null) throw unexpectedAnswer(READ_AVAILABILITY);
  const item = itemFromColumns(kind, id);
  if (item === undefined) throw unexpectedAnswer(READ_AVAILABILITY);
  return item;
}
