import type { Design } from "@lemnaria/configurator-domain";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "@lemnaria/configurator-domain";

import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";
import { requireSha256Digest } from "./sha256-digest.js";
import { isUnstorableText } from "./snapshot-judgement.js";

export type SentKitchenViewOperation =
  | "record a sent kitchen view"
  | "load a sent kitchen view";

/** One view-only link of the shop's notice: the hash of its token, the request it was minted for, and the kitchen as
 *  sent, as the design schema version and the document's JSON text the request's snapshot holds. */
export interface SentKitchenViewToRecord {
  readonly tokenHash: string;
  readonly clientRequestId: string;
  readonly schemaVersion: number;
  readonly document: string;
}

/** `recorded`: the row under the hash is this request's, stored now or by an earlier attempt of this call. `taken`:
 *  the hash names another request's row, which is left as it was. */
export type SentKitchenViewRecording = "recorded" | "taken";

export type SentKitchenViewLookup =
  | { readonly kind: "found"; readonly design: Design }
  | { readonly kind: "none" };

/**
 * The frozen copies of the kitchens the shop was sent, apart from `ShareLinkRepository`, whose contract is the design's
 * own live link. Nothing here reads or writes `designs` or `design_share_links`, and nothing revokes or deletes: the
 * owner revokes a row by hand.
 */
export interface SentKitchenViewRepository {
  /** Rejects with a refusal before any statement for a view the table would refuse, and with
   *  `SentKitchenViewRepositoryError` when the database gives no trustworthy answer, a request it does not hold
   *  included. */
  record(view: SentKitchenViewToRecord): Promise<SentKitchenViewRecording>;
  /** Reads by token hash alone, for an unrevoked row only. A malformed hash matches nothing. */
  load(tokenHash: string): Promise<SentKitchenViewLookup>;
}

/** The database refused, did not answer, or answered with something that is not what the statement names. Its
 *  `cause`, when present, is a `ReducedCause`, never the driver's own error. */
export class SentKitchenViewRepositoryError extends Error {
  readonly operation: SentKitchenViewOperation;

  constructor(operation: SentKitchenViewOperation, options?: ErrorOptions) {
    super(
      `The sent kitchen view repository could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "SentKitchenViewRepositoryError";
    this.operation = operation;
  }
}

/** `contact_submissions.client_request_id`'s check, which the reference makes this column's too. */
const CLIENT_REQUEST_ID_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** The oldest design schema `migrateDesign` reads; nothing below it was ever written. */
const OLDEST_SCHEMA_VERSION = 1;

const REFUSALS = {
  view: "the view must be an object",
  clientRequestId:
    "the client request id must be 16 to 64 letters, digits, underscores or hyphens",
  schemaVersion: `the schema version must be a whole number from ${String(OLDEST_SCHEMA_VERSION)} to ${String(CURRENT_SCHEMA_VERSION)}`,
  document:
    "the document must be the JSON text of an object, in text the database can hold",
} as const;

/**
 * Refuses, before any statement and with no value in the refusal, a closed list: a token hash that is not a digest, a
 * request id of the wrong shape, a schema version `migrateDesign` cannot read, and a document that is not an object's
 * JSON text or holds a raw NUL or lone surrogate. Anything else the server refuses (an escaped `\u0000` in the JSON,
 * an unknown request) is the repository error. Shared by both repositories, so the fake refuses exactly this list.
 */
export function requireValidSentKitchenView(
  view: SentKitchenViewToRecord,
): void {
  if (!isObject(view as unknown)) throw refusalOf("view");
  requireSha256Digest(
    view.tokenHash,
    "sent kitchen view's token hash",
    "record a sent kitchen view",
  );
  if (!isClientRequestId(view.clientRequestId))
    throw refusalOf("clientRequestId");
  if (!isReadableSchemaVersion(view.schemaVersion))
    throw refusalOf("schemaVersion");
  if (!isObjectJsonText(view.document)) throw refusalOf("document");
}

function refusalOf(part: keyof typeof REFUSALS): Error {
  return new Error(
    `Refusing to record a sent kitchen view: ${REFUSALS[part]}.`,
  );
}

function isClientRequestId(value: unknown): boolean {
  return typeof value === "string" && CLIENT_REQUEST_ID_SHAPE.test(value);
}

function isReadableSchemaVersion(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= OLDEST_SCHEMA_VERSION &&
    value <= CURRENT_SCHEMA_VERSION
  );
}

function isObjectJsonText(value: unknown): boolean {
  if (typeof value !== "string" || isUnstorableText(value)) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

interface RecordedRow {
  readonly is_recorded: boolean;
}

interface ViewRow {
  readonly schema_version: number;
  readonly design_document: object;
}

/** `SentKitchenViewRepository` on Neon Postgres, in `contact_submission_views` (migration `0010`). Every query is a
 *  tagged-template `sql`, which parameterises values. It logs nothing. */
export class NeonSentKitchenViewRepository
  implements SentKitchenViewRepository
{
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * One statement. The insert's own rows are invisible to the statement's read of the table, so `inserted` answers for
   * a row stored now and the read for one stored by an earlier attempt: a repeat after a lost reply answers `recorded`
   * (ADR 0145). A twin committing during the statement can read as `taken`, never the reverse.
   */
  async record(
    view: SentKitchenViewToRecord,
  ): Promise<SentKitchenViewRecording> {
    requireValidSentKitchenView(view);
    const rows = await this.queryRows("record a sent kitchen view", () =>
      this.insertUnlessHeld(view),
    );
    return recordingOf(rows);
  }

  /** It selects no id and no request, so the caller learns only the migrated document. A stored copy `migrateDesign`
   *  refuses throws its error, as `ShareLinkRepository.loadShared` does. */
  async load(tokenHash: string): Promise<SentKitchenViewLookup> {
    const rows = await this.queryRows("load a sent kitchen view", () =>
      this.selectUnrevoked(tokenHash),
    );
    const row = viewRowOf(rows);
    if (row === undefined) return { kind: "none" };
    return {
      kind: "found",
      design: migrateDesign(row.schema_version, row.design_document),
    };
  }

  private insertUnlessHeld({
    tokenHash,
    clientRequestId,
    schemaVersion,
    document,
  }: SentKitchenViewToRecord) {
    return this.sql`
      with inserted as (
        insert into contact_submission_views (token_hash, client_request_id, schema_version, design_document)
        values (${tokenHash}, ${clientRequestId}, ${schemaVersion}, ${document}::jsonb)
        on conflict (token_hash) do nothing
        returning token_hash
      )
      select (
        exists (select 1 from inserted)
        or exists (
          select 1 from contact_submission_views
          where token_hash = ${tokenHash} and client_request_id = ${clientRequestId}
        )
      ) as is_recorded
    `;
  }

  private selectUnrevoked(tokenHash: string) {
    return this.sql`
      select schema_version, design_document
      from contact_submission_views
      where token_hash = ${tokenHash} and revoked_at is null
    `;
  }

  /** The rows of a statement, copied in one guarded step, or the repository error holding a built cause: nothing the
   *  driver threw or answered leaves this module (ADR 0146 B3). */
  private async queryRows(
    operation: SentKitchenViewOperation,
    runQuery: () => Promise<unknown>,
  ): Promise<object[]> {
    let reply: unknown;
    try {
      reply = await retryOnTransientFailure(runQuery);
    } catch (failure) {
      throw new SentKitchenViewRepositoryError(
        operation,
        reducedCauseOf(failure),
      );
    }
    return copiedRowsOf(reply, operation);
  }
}

function copiedRowsOf(
  reply: unknown,
  operation: SentKitchenViewOperation,
): object[] {
  try {
    if (Array.isArray(reply) && reply.every(isObject)) {
      return Array.from(reply, (row) => ({ ...row }));
    }
  } catch {
    // A row that throws when read is no answer; refused below.
  }
  throw new SentKitchenViewRepositoryError(operation);
}

function recordingOf(rows: readonly object[]): SentKitchenViewRecording {
  const [row, ...others] = rows;
  if (row === undefined || others.length > 0 || !isRecordedRow(row)) {
    throw new SentKitchenViewRepositoryError("record a sent kitchen view");
  }
  return row.is_recorded ? "recorded" : "taken";
}

/** The one unrevoked row, or `undefined` for none; the primary key allows no second. */
function viewRowOf(rows: readonly object[]): ViewRow | undefined {
  const [row, ...others] = rows;
  if (row === undefined) return undefined;
  if (others.length > 0 || !isViewRow(row)) {
    throw new SentKitchenViewRepositoryError("load a sent kitchen view");
  }
  return row;
}

function isRecordedRow(row: object): row is RecordedRow {
  return (
    hasExactlyKeys(row, ["is_recorded"]) &&
    typeof (row as RecordedRow).is_recorded === "boolean"
  );
}

function isViewRow(row: object): row is ViewRow {
  const { schema_version, design_document } = row as ViewRow;
  return (
    hasExactlyKeys(row, ["design_document", "schema_version"]) &&
    Number.isInteger(schema_version) &&
    isObject(design_document)
  );
}

function hasExactlyKeys(row: object, keys: readonly string[]): boolean {
  return Object.keys(row).sort().join() === [...keys].sort().join();
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
