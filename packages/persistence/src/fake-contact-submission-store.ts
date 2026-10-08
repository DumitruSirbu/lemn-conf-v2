import {
  ContactSubmissionStoreError,
  MAX_REFERENCE_PROPOSALS,
  requireValidClientRequestId,
  requireValidLookup,
  requireValidReference,
  requireValidSubmission,
} from "./contact-submission-store.js";
import type {
  ContactSubmissionStore,
  ContactSubmissionToRecord,
  RecordedSubmission,
  SubmissionConflict,
  SubmissionLookup,
  SubmissionLookupRequest,
  StoredSubmission,
  SubmissionRecording,
} from "./contact-submission-store.js";
import { generateSubmissionReference } from "./generate-submission-reference.js";

export interface FakeContactSubmissionStoreOptions {
  /** Where each reference proposal comes from. A test passes its own to force a collision; production wiring passes
   *  none. */
  readonly proposeReference?: () => string;
  /** The database's clock, for `createdAt` and the mark's instant. */
  readonly now?: () => Date;
}

/** What the fake holds for one request, for a test to read. The Neon store has no such reading. */
export interface HeldContactSubmission {
  readonly submission: ContactSubmissionToRecord;
  readonly reference: string;
  readonly createdAt: Date;
  readonly notifiedAt: Date | undefined;
}

interface HeldRow {
  readonly submission: ContactSubmissionToRecord;
  readonly reference: string;
  readonly createdAt: Date;
  notifiedAt: Date | undefined;
}

const CONFLICT: SubmissionConflict = { kind: "conflict" };

function asReplay(
  answer: StoredSubmission | SubmissionConflict,
): SubmissionRecording {
  return answer.kind === "stored" ? { ...answer, isNew: false } : answer;
}

/** In-memory `ContactSubmissionStore` for tests that need the port's contract without a database. */
export class FakeContactSubmissionStore implements ContactSubmissionStore {
  private readonly rowsByClientRequestId = new Map<string, HeldRow>();
  private readonly proposeReference: () => string;
  private readonly now: () => Date;

  constructor({
    proposeReference = generateSubmissionReference,
    now = () => new Date(),
  }: FakeContactSubmissionStoreOptions = {}) {
    this.proposeReference = proposeReference;
    this.now = now;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- a rejected promise for a refusal, as the Neon store gives.
  async lookUp(request: SubmissionLookupRequest): Promise<SubmissionLookup> {
    requireValidLookup(request);
    const held = this.rowsByClientRequestId.get(request.clientRequestId);
    if (held === undefined) return { kind: "absent" };
    return this.answerFor(held, request.payloadDigest);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see lookUp.
  async record(
    submission: ContactSubmissionToRecord,
  ): Promise<SubmissionRecording> {
    requireValidSubmission(submission);
    const held = this.rowsByClientRequestId.get(submission.clientRequestId);
    if (held === undefined) return this.store(submission);
    return asReplay(this.answerFor(held, submission.payloadDigest));
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see lookUp.
  async markNotified(clientRequestId: string): Promise<void> {
    requireValidClientRequestId(clientRequestId);
    const held = this.rowsByClientRequestId.get(clientRequestId);
    if (held === undefined) {
      throw new ContactSubmissionStoreError("mark a request notified");
    }
    held.notifiedAt ??= this.now();
  }

  /** Copies, so a test cannot change what the store holds through what it read. */
  heldSubmissions(): readonly HeldContactSubmission[] {
    return [...this.rowsByClientRequestId.values()].map((held) =>
      structuredClone({ ...held }),
    );
  }

  private answerFor(
    held: HeldRow,
    payloadDigest: string,
  ): StoredSubmission | SubmissionConflict {
    if (held.submission.payloadDigest !== payloadDigest) return CONFLICT;
    return {
      kind: "stored",
      reference: held.reference,
      isNotified: held.notifiedAt !== undefined,
    };
  }

  private store(submission: ContactSubmissionToRecord): RecordedSubmission {
    const reference = this.drawUnusedReference();
    this.rowsByClientRequestId.set(submission.clientRequestId, {
      submission: structuredClone(submission),
      reference,
      createdAt: this.now(),
      notifiedAt: undefined,
    });
    return { kind: "stored", reference, isNew: true, isNotified: false };
  }

  private drawUnusedReference(): string {
    for (let proposal = 0; proposal < MAX_REFERENCE_PROPOSALS; proposal += 1) {
      const reference = this.proposeReference();
      requireValidReference(reference);
      if (!this.isReferenceStored(reference)) return reference;
    }
    throw new ContactSubmissionStoreError("record a request");
  }

  private isReferenceStored(reference: string): boolean {
    return [...this.rowsByClientRequestId.values()].some(
      (held) => held.reference === reference,
    );
  }
}
