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
   *  none. A proposer never repeats a reference: `isNew` is the stored reference being this call's proposal, so a
   *  proposer that repeats itself makes a later call read as new, as it does in the Neon store. */
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

/** What a draw that met another request's reference answers, so the loop draws again. */
const REFERENCE_COLLISION = Symbol("reference collision");

/**
 * In-memory `ContactSubmissionStore` for tests that need the port's contract without a database. It draws a proposal
 * exactly when the Neon store does (once for each `record`, and once more for each collision) and answers `isNew` by
 * the same comparison. It refuses what the shared check refuses and nothing more: it cannot stand for a server's
 * refusal of size, a time limit or anything a later server refuses. Depth is the check's, bounded at 64.
 */
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

  // eslint-disable-next-line @typescript-eslint/require-await -- a refusal rejects, as the Neon store's does.
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
    for (let proposal = 0; proposal < MAX_REFERENCE_PROPOSALS; proposal += 1) {
      const reference = this.proposeReference();
      requireValidReference(reference);
      const outcome = this.recordProposing(submission, reference);
      if (outcome !== REFERENCE_COLLISION) return outcome;
    }
    throw new ContactSubmissionStoreError("record a request");
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

  private recordProposing(
    submission: ContactSubmissionToRecord,
    reference: string,
  ): SubmissionRecording | typeof REFERENCE_COLLISION {
    const held = this.rowsByClientRequestId.get(submission.clientRequestId);
    if (held !== undefined)
      return this.answerReplay(held, submission, reference);
    if (this.isReferenceStored(reference)) return REFERENCE_COLLISION;
    return this.store(submission, reference);
  }

  private answerReplay(
    held: HeldRow,
    { payloadDigest }: SubmissionLookupRequest,
    proposed: string,
  ): SubmissionRecording {
    const answer = this.answerFor(held, payloadDigest);
    if (answer.kind !== "stored") return answer;
    return { ...answer, isNew: held.reference === proposed };
  }

  private store(
    submission: ContactSubmissionToRecord,
    reference: string,
  ): RecordedSubmission {
    this.rowsByClientRequestId.set(submission.clientRequestId, {
      submission: structuredClone(submission),
      reference,
      createdAt: this.now(),
      notifiedAt: undefined,
    });
    return { kind: "stored", reference, isNew: true, isNotified: false };
  }

  private isReferenceStored(reference: string): boolean {
    return [...this.rowsByClientRequestId.values()].some(
      (held) => held.reference === reference,
    );
  }
}
