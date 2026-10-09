import {
  ContactSubmissionStoreError,
  MAX_REFERENCE_PROPOSALS,
  requireValidClientRequestId,
  requireValidLookup,
  requireValidReference,
  judgeSubmission,
} from "./contact-submission-store.js";
import type {
  ContactSubmissionOperation,
  ContactSubmissionStore,
  ContactSubmissionToRecord,
  SnapshotJson,
  SubmissionLookup,
  SubmissionLookupRequest,
  SubmissionRecording,
} from "./contact-submission-store.js";
import { generateSubmissionReference } from "./generate-submission-reference.js";
import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import { isNeonDbError } from "./open-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

export interface NeonContactSubmissionStoreOptions {
  /** Where each reference proposal comes from. Only a test passes one, to force a collision; production wiring passes
   *  none. A proposer never repeats a reference: `isNew` is the stored reference being this call's proposal, so a proposer
   *  that repeats itself makes a later call read as new. */
  readonly proposeReference?: () => string;
}

/** What `record` and the lookup read back: only columns the application role may `SELECT`. */
interface StoredRow {
  readonly reference: string;
  readonly is_same_payload: boolean;
  readonly is_notified: boolean;
}

interface RecordedRow extends StoredRow {
  readonly is_new: boolean;
}

const LOOKUP_ROW_KEYS = ["is_notified", "is_same_payload", "reference"];
const RECORD_ROW_KEYS = ["is_new", ...LOOKUP_ROW_KEYS];

const UNIQUE_VIOLATION = "23505";
const REFERENCE_UNIQUENESS_NAME = "contact_submissions_reference_is_unique";

/** What a draw that met another request's reference answers, so the loop draws again. */
const REFERENCE_COLLISION = Symbol("reference collision");

/** `ContactSubmissionStore` on Neon Postgres, storing in `contact_submissions` (migration `0008`). It holds no secret
 *  and reads no variable but its connection, and it logs nothing. */
export class NeonContactSubmissionStore implements ContactSubmissionStore {
  private readonly sql;
  private readonly proposeReference: () => string;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(
    connectionUrl?: string,
    {
      proposeReference = generateSubmissionReference,
    }: NeonContactSubmissionStoreOptions = {},
  ) {
    this.sql = openApplicationDatabase(connectionUrl);
    this.proposeReference = proposeReference;
  }

  async lookUp(request: SubmissionLookupRequest): Promise<SubmissionLookup> {
    requireValidLookup(request);
    const rows = await queryRows("look up a request", () =>
      retryOnTransientFailure(() => this.selectByClientRequestId(request)),
    );
    const [row, ...others] = rows;
    if (row === undefined) return { kind: "absent" };
    return storedOrConflict(requireStoredRow(row, others, "look up a request"));
  }

  /**
   * One statement answers a new request, a replay and a conflict: the update changes nothing, so a replay returns the
   * stored row. A reference that is another request's is the only failure drawn again, with a new proposal; a repeated
   * statement after a lost reply re-sends the same one, so a statement that landed still answers new (ADR 0145). The
   * document the statement carries is the text handed in, which the shared check refused unless it is exactly what
   * `JSON.stringify` makes of its own parsed value; the priced design is walked as a value and then encoded once.
   */
  async record(
    submission: ContactSubmissionToRecord,
  ): Promise<SubmissionRecording> {
    const { snapshotJson } = judgeSubmission(submission);
    for (let proposal = 0; proposal < MAX_REFERENCE_PROPOSALS; proposal += 1) {
      const reference = this.proposeReference();
      requireValidReference(reference);
      const outcome = await this.recordProposing({
        submission,
        snapshotJson,
        reference,
      });
      if (outcome !== REFERENCE_COLLISION) return outcome;
    }
    throw new ContactSubmissionStoreError("record a request");
  }

  /** Sets the mark once: a second mark keeps the first instant, and the row is found by its primary key. */
  async markNotified(clientRequestId: string): Promise<void> {
    requireValidClientRequestId(clientRequestId);
    const rows = await queryRows("mark a request notified", () =>
      retryOnTransientFailure(() => this.updateNotifiedAt(clientRequestId)),
    );
    if (rows.length !== 1) {
      throw new ContactSubmissionStoreError("mark a request notified");
    }
  }

  private async recordProposing(
    proposed: ProposedRecord,
  ): Promise<SubmissionRecording | typeof REFERENCE_COLLISION> {
    const rows = await queryRowsOrCollision("record a request", () =>
      retryOnTransientFailure(() => this.upsert(proposed)),
    );
    return rows === REFERENCE_COLLISION ? rows : recordedFrom(rows);
  }

  private selectByClientRequestId({
    clientRequestId,
    payloadDigest,
  }: SubmissionLookupRequest) {
    return this.sql`
      select reference,
        (payload_digest = ${payloadDigest}) as is_same_payload,
        (notified_at is not null) as is_notified
      from contact_submissions
      where client_request_id = ${clientRequestId}
    `;
  }

  private updateNotifiedAt(clientRequestId: string) {
    return this.sql`
      update contact_submissions
      set notified_at = coalesce(notified_at, now())
      where client_request_id = ${clientRequestId}
      returning reference
    `;
  }

  private upsert({ submission, snapshotJson, reference }: ProposedRecord) {
    const { contact } = submission;
    const design = designColumnsOf(submission);
    return this.sql`
      insert into contact_submissions as submission (
        client_request_id, reference, design_id, design_revision, payload_digest,
        name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
        intent, design_document, priced
      ) values (
        ${submission.clientRequestId}, ${reference}, ${design.id}, ${design.revision}::bigint,
        ${submission.payloadDigest},
        ${contact.name}, ${contact.phone}, ${contact.phoneNormalForm}, ${contact.locality}, ${contact.channel},
        ${contact.email ?? null}, ${contact.consentTextVersion}, ${submission.locale},
        ${design.intent}, ${snapshotJson?.document ?? null}::jsonb, ${snapshotJson?.priced ?? null}::jsonb
      )
      on conflict (client_request_id)
      do update set notified_at = submission.notified_at
      returning submission.reference,
        (submission.reference = ${reference}) as is_new,
        (submission.payload_digest = ${submission.payloadDigest}) as is_same_payload,
        (submission.notified_at is not null) as is_notified
    `;
  }
}

/** One draw of a reference for a request that passed the shared check, with the JSON its statement carries. */
interface ProposedRecord {
  readonly submission: ContactSubmissionToRecord;
  readonly snapshotJson: SnapshotJson | undefined;
  readonly reference: string;
}

interface DesignColumns {
  readonly id: string | null;
  readonly revision: string | null;
  readonly intent: string | null;
}

function designColumnsOf({ target }: ContactSubmissionToRecord): DesignColumns {
  return target.kind === "design"
    ? { id: target.design.id, revision: target.design.revision, intent: null }
    : { id: null, revision: null, intent: target.intent };
}

/** Whether a failure is the reference's collision. Asked once, of one failure, and never of an error that then leaves:
 *  an error that cannot be read answers no. */
function isReferenceCollision(failure: unknown): boolean {
  try {
    return (
      isNeonDbError(failure) &&
      failure.code === UNIQUE_VIOLATION &&
      failure.constraint === REFERENCE_UNIQUENESS_NAME
    );
  } catch {
    return false;
  }
}

/** What a statement did: it replied, or it failed. The failure is held as a value and is read, never thrown. */
type Attempt =
  | { readonly failed: false; readonly reply: unknown }
  | { readonly failed: true; readonly failure: unknown };

async function attempt(runQuery: () => PromiseLike<unknown>): Promise<Attempt> {
  try {
    return { failed: false, reply: await runQuery() };
  } catch (failure) {
    return { failed: true, failure };
  }
}

/** The rows of a statement, or the store error: a failure, or a reply that is not a list of rows, never leaves as
 *  anything else. Every driver failure leaves as a store error holding a built cause, as ADR 0146 B3 requires, and the
 *  driver's own error is not thrown by anything in this module. */
async function queryRows(
  operation: ContactSubmissionOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<object[]> {
  const attempted = await attempt(runQuery);
  if (attempted.failed) {
    throw new ContactSubmissionStoreError(
      operation,
      reducedCauseOf(attempted.failure),
    );
  }
  return rowsOf(attempted.reply, operation);
}

/** {@link queryRows} for the upsert, whose one expected failure is the reference's collision: that is answered as a
 *  value for the loop to draw again, and a failure is classified here once, where it is caught. */
async function queryRowsOrCollision(
  operation: ContactSubmissionOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<object[] | typeof REFERENCE_COLLISION> {
  const attempted = await attempt(runQuery);
  if (!attempted.failed) return rowsOf(attempted.reply, operation);
  if (isReferenceCollision(attempted.failure)) return REFERENCE_COLLISION;
  throw new ContactSubmissionStoreError(
    operation,
    reducedCauseOf(attempted.failure),
  );
}

function rowsOf(
  reply: unknown,
  operation: ContactSubmissionOperation,
): object[] {
  if (!Array.isArray(reply) || !reply.every(isObject)) {
    throw new ContactSubmissionStoreError(operation);
  }
  return reply;
}

function recordedFrom(rows: readonly object[]): SubmissionRecording {
  const [row, ...others] = rows;
  const recorded = requireRecordedRow(row, others);
  if (!recorded.is_same_payload) return { kind: "conflict" };
  return {
    kind: "stored",
    reference: recorded.reference,
    isNew: recorded.is_new,
    isNotified: recorded.is_notified,
  };
}

function storedOrConflict(row: StoredRow): SubmissionLookup {
  if (!row.is_same_payload) return { kind: "conflict" };
  return {
    kind: "stored",
    reference: row.reference,
    isNotified: row.is_notified,
  };
}

function requireRecordedRow(
  row: object | undefined,
  others: readonly object[],
): RecordedRow {
  if (row === undefined || others.length > 0 || !isRecordedRow(row)) {
    throw new ContactSubmissionStoreError("record a request");
  }
  return row;
}

function requireStoredRow(
  row: object,
  others: readonly object[],
  operation: ContactSubmissionOperation,
): StoredRow {
  if (others.length > 0 || !isStoredRow(row)) {
    throw new ContactSubmissionStoreError(operation);
  }
  return row;
}

function isRecordedRow(row: object): row is RecordedRow {
  return (
    hasExactlyKeys(row, RECORD_ROW_KEYS) &&
    hasStoredColumns(row) &&
    typeof (row as RecordedRow).is_new === "boolean"
  );
}

function isStoredRow(row: object): row is StoredRow {
  return hasExactlyKeys(row, LOOKUP_ROW_KEYS) && hasStoredColumns(row);
}

function hasStoredColumns(row: object): boolean {
  const { reference, is_same_payload, is_notified } = row as StoredRow;
  return (
    isReference(reference) &&
    typeof is_same_payload === "boolean" &&
    typeof is_notified === "boolean"
  );
}

function isReference(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    requireValidReference(value);
    return true;
  } catch {
    return false;
  }
}

function hasExactlyKeys(row: object, keys: readonly string[]): boolean {
  return Object.keys(row).sort().join() === [...keys].sort().join();
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
