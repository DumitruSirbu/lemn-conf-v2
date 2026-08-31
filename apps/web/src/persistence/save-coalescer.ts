// The write path of decisions 13-17
// (`docs/decisions/0002-db-backed-shareable-persistence.md`): the edit path never blocks on
// a write, writes are coalesced so a burst of commands produces one save of the final state (not a
// queue of intermediate ones), and a failed write is surfaced and retried without ever reverting
// the already-applied edit. Its caller is the store's `onDesignChanged` seam, which fires after
// every successful command — mint-on-first-write is simply the first of those, not a special case.
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "./design-request-errors";

/**
 * The three failures are separate values because the customer's situation — and therefore what a
 * surface may honestly tell them — is different in each:
 *
 * - `error` is a failure worth retrying: a retry is already armed, and the unwritten state is still
 *   queued behind it. Writing continues.
 * - `stopped` is a terminal failure that is not about the credential (`WriteNotRetryableError`:
 *   a 400 from a stale bundle, a 413). Writing is over for this design and no retry will happen, so
 *   the state on screen is the only copy of it.
 * - `unauthorized` is terminal too, but the one terminal case a surface can say something useful
 *   about (ADR 0019 decision 1: the write credential is a cookie this browser simply does not hold —
 *   the design is read-only here, not failing to save).
 * - `conflict` is terminal **until the customer chooses** (WEB-003): the credential is right and the
 *   stored design has moved on, so no retry can succeed and none is armed. Unlike the two above it
 *   is recoverable, by reloading the stored design or by overwriting it deliberately, and the state
 *   on screen is intact meanwhile.
 */
export type SaveStatus =
  | "idle"
  | "saving"
  | "error"
  | "stopped"
  | "unauthorized"
  | "conflict";

/** The three statuses that stop a design's writes until something outside the coalescer changes.
 *  Recorded per identity, so returning to a refused design does not quietly start writing again. */
type RefusedStatus = Extract<
  SaveStatus,
  "stopped" | "unauthorized" | "conflict"
>;

const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8000;
/** ADR 0019 decision 6: successful saves start at least one second apart. */
const MIN_SAVE_INTERVAL_MS = 1000;

function backoffDelayMs(retryCount: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * 2 ** (retryCount - 1),
    RETRY_MAX_DELAY_MS,
  );
}

/** One save request, and what a successful one answers with. Mirrors
 *  `fetch-configuration-repository.ts`'s own types, declared here so the coalescer depends on a
 *  shape rather than on that class. */
export interface CoalescedSaveRequest {
  readonly id: DesignId | null;
  readonly design: Design;
  /** Ignored when `id` is `null`; a mint decides its own first revision. */
  readonly expectedRevision: DesignRevision | null;
  readonly provisionalMintIdentity?: object | undefined;
}

export interface CoalescedSaveResult {
  readonly id: DesignId;
  readonly revision: DesignRevision;
}

export interface ClientSaveRepository {
  readonly save: (
    request: CoalescedSaveRequest,
  ) => Promise<CoalescedSaveResult>;
}

export interface SaveCoalescerDependencies {
  readonly repository: ClientSaveRepository;
  /** Captured when `scheduleSave` is called. `null` mints a new row. */
  readonly getDesignId: () => DesignId | null;
  /** Unlike an id, the generation also distinguishes two fresh designs that both carry `null`. */
  readonly getGeneration: () => number;
  /**
   * The revision the store believes the current design stands at, read **once per identity queue**
   * when that queue is created (WEB-003).
   *
   * It is not read per job on purpose. A job scheduled while an earlier save for the same design is
   * still in flight would capture the revision that save is about to consume, and would then be
   * refused as stale for no reason. The queue owns the revision instead, and only a successful save
   * advances it — see `runSave`.
   */
  readonly getRevision: () => DesignRevision | null;
  /**
   * Re-reads a design's current revision from the server. The "re-read" half of an explicit
   * overwrite, and the only thing in this module that may raise the revision a queue expects
   * without a save having produced it — which is exactly what makes an overwrite a deliberate act
   * rather than a retry.
   */
  readonly readCurrentRevision: (id: DesignId) => Promise<DesignRevision>;
  /** Called after a successful save, scoped to the generation that scheduled it. */
  readonly onSaved: (saved: CoalescedSaveResult, generation: number) => void;
  readonly onSaveStatusChange: (status: SaveStatus, generation: number) => void;
}

export interface SaveCoalescer {
  /** Queues `design` to be persisted. Returns immediately; the write happens off this call. */
  scheduleSave: (design: Design) => void;
  /**
   * The customer's answer to a conflict: write `design` over whatever the stored design has become
   * (WEB-003). Re-reads the current revision first, so the overwrite is conditional on the state it
   * is actually replacing — a blind write with no expectation would reintroduce the very defect
   * this wave removed, one press further away.
   *
   * A no-op unless this design is in `conflict`, so a stray press cannot overwrite anything.
   */
  overwriteConflict: (design: Design) => void;
}

/** The immutable scheduling-time snapshot. No repository call reads live store identity. */
interface SaveJob {
  readonly designId: DesignId | null;
  readonly design: Design;
  readonly generation: number;
}

interface IdentityQueue {
  /** `null` until this provisional queue completes its first successful save. */
  designId: DesignId | null;
  /**
   * The revision the next write for this identity must expect. Seeded from the store when the queue
   * is created, `null` while the identity is still provisional, and advanced **only** by a
   * successful save — so a retry re-sends the revision the failed attempt used, never one a
   * different write already consumed.
   */
  expectedRevision: DesignRevision | null;
  /** The newest generation that scheduled work for this persisted identity. */
  generation: number;
  /** Stable across every null-id attempt belonging to this provisional generation. */
  readonly provisionalMintIdentity: object | undefined;
  pending: SaveJob | null;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  readyQueued: boolean;
  readyVersion: number;
  active: boolean;
}

interface ReadyEntry {
  readonly queue: IdentityQueue;
  readonly version: number;
}

/**
 * Builds one session coalescer. Persisted work reconciles by design id, so returning to the same id
 * supersedes that identity's older retry/pending state. Generation scopes callbacks only. A fresh
 * null-id generation owns a distinct provisional queue and mint token until its first save succeeds.
 */
export function createSaveCoalescer(
  deps: SaveCoalescerDependencies,
): SaveCoalescer {
  const persistedQueues = new Map<DesignId, IdentityQueue>();
  const provisionalQueues = new Map<number, IdentityQueue>();
  const readyQueues: ReadyEntry[] = [];
  let readyHead = 0;
  let saving = false;
  let lastSaveCompletedAtMs: number | null = null;
  let intervalTimer: ReturnType<typeof setTimeout> | null = null;
  const refusedPersisted = new Map<DesignId, RefusedStatus>();
  const refusedProvisional = new Map<number, RefusedStatus>();
  /**
   * The design an in-flight overwrite will write, per identity — the newest one offered while its
   * re-read is still out.
   *
   * It exists because the conflict must **stay** in place across that await. Clearing it first left
   * a window in which an ordinary edit was no longer blocked: it went out against the revision that
   * had just been refused, conflicted again, and re-armed the refusal — so the overwrite, arriving
   * a moment later, was itself refused and sent nothing. The customer pressed a destructive-choice
   * control and watched it do nothing (review finding F1).
   *
   * Holding the edit rather than refusing it is what makes `CONFLICT_NOTICE`'s promise true: the
   * panel stays editable, so an edit made between the press and the round trip is part of what
   * "overwrite with what you see now" means, and it is what gets written.
   */
  const overwritesInFlight = new Map<DesignId, Design>();

  function scheduleSave(design: Design): void {
    const job = jobFor(design);
    const refusedStatus = refusalStatus(job);
    if (refusedStatus !== undefined) {
      if (heldByOverwrite(job, design)) return;
      // A terminal identity is still terminal on return to it. Reporting this synchronously avoids
      // accepting a local edit while silently declining even to queue its write.
      deps.onSaveStatusChange(refusedStatus, job.generation);
      return;
    }

    const queue = queueFor(job);
    if (queue.generation !== job.generation) {
      // Same persisted id, newer load generation: its state replaces any older retry/pending job.
      // An already in-flight old write cannot be cancelled, so this pending job remains and is
      // necessarily written after it settles.
      queue.generation = job.generation;
      queue.retryCount = 0;
      clearRetryTimer(queue);
      invalidateReady(queue);
      // The load that advanced the generation read this design afresh, so the store's revision is
      // newer than the one this queue was seeded with — and a queue sitting in retry backoff
      // survives a hydrate away and back carrying the stale one (review finding F4). It fails
      // closed, as a spurious conflict rather than a lost update, but a design nothing else touched
      // should not conflict at all.
      queue.expectedRevision = deps.getRevision();
    }
    queue.pending = job;
    enqueueReady(queue);
    requestSave();
  }

  /** The immutable snapshot every save is built from: what is on screen, whose design it is, and
   *  which load generation asked. The revision is deliberately **not** part of it — see
   *  `getRevision`. */
  function jobFor(design: Design): SaveJob {
    return {
      designId: deps.getDesignId(),
      design,
      generation: deps.getGeneration(),
    };
  }

  function queueFor(job: SaveJob): IdentityQueue {
    if (job.designId !== null) {
      const existing = persistedQueues.get(job.designId);
      if (existing) return existing;
      const queue = newQueue(job.designId, job.generation, undefined);
      queue.expectedRevision = deps.getRevision();
      persistedQueues.set(job.designId, queue);
      return queue;
    }

    const existing = provisionalQueues.get(job.generation);
    if (existing) return existing;
    const queue = newQueue(null, job.generation, {});
    provisionalQueues.set(job.generation, queue);
    return queue;
  }

  function newQueue(
    designId: DesignId | null,
    generation: number,
    provisionalMintIdentity: object | undefined,
  ): IdentityQueue {
    return {
      designId,
      expectedRevision: null,
      generation,
      provisionalMintIdentity,
      pending: null,
      retryCount: 0,
      retryTimer: null,
      readyQueued: false,
      readyVersion: 0,
      active: false,
    };
  }

  /** Explicit FIFO scheduling: historical Map insertion order never decides which identity runs. */
  function enqueueReady(queue: IdentityQueue): void {
    if (
      queue.readyQueued ||
      queue.pending === null ||
      queue.retryTimer !== null
    )
      return;
    queue.readyQueued = true;
    queue.readyVersion += 1;
    readyQueues.push({ queue, version: queue.readyVersion });
  }

  function nextReadyQueue(): IdentityQueue | null {
    while (readyHead < readyQueues.length) {
      const entry = readyQueues[readyHead];
      const queue = entry?.queue;
      if (
        queue?.readyQueued === true &&
        entry?.version === queue.readyVersion &&
        queue.pending !== null &&
        queue.retryTimer === null
      )
        return queue;
      readyHead += 1;
    }
    compactReadyQueue();
    return null;
  }

  function takeReadyQueue(): IdentityQueue | null {
    const queue = nextReadyQueue();
    if (queue === null) return null;
    readyHead += 1;
    queue.readyQueued = false;
    compactReadyQueue();
    return queue;
  }

  function compactReadyQueue(): void {
    if (readyHead === readyQueues.length) {
      readyQueues.length = 0;
      readyHead = 0;
      return;
    }
    if (readyHead < 64 || readyHead * 2 < readyQueues.length) return;
    readyQueues.splice(0, readyHead);
    readyHead = 0;
  }

  /** Starts the next serial save, or arms the successful-save interval that will. */
  function requestSave(): void {
    if (saving || intervalTimer !== null || nextReadyQueue() === null) return;

    const waitMs = millisecondsUntilNextSaveAllowed();
    if (waitMs === 0) {
      void runSave();
      return;
    }
    intervalTimer = setTimeout(() => {
      intervalTimer = null;
      requestSave();
    }, waitMs);
  }

  /** Whether this edit belongs to an overwrite that is mid-re-read, in which case it replaces what
   *  that overwrite will write rather than being refused. */
  function heldByOverwrite(job: SaveJob, design: Design): boolean {
    const { designId } = job;
    if (designId === null || !overwritesInFlight.has(designId)) return false;
    overwritesInFlight.set(designId, design);
    deps.onSaveStatusChange("saving", job.generation);
    return true;
  }

  function refusalStatus(job: SaveJob): RefusedStatus | undefined {
    return job.designId === null
      ? refusedProvisional.get(job.generation)
      : refusedPersisted.get(job.designId);
  }

  function millisecondsUntilNextSaveAllowed(): number {
    if (lastSaveCompletedAtMs === null) return 0;
    return Math.max(
      0,
      MIN_SAVE_INTERVAL_MS - (Date.now() - lastSaveCompletedAtMs),
    );
  }

  async function runSave(): Promise<void> {
    if (saving) return;

    const queue = takeReadyQueue();
    const job = queue?.pending ?? null;
    if (queue === null || job === null) return;
    queue.pending = null;
    queue.active = true;
    saving = true;
    deps.onSaveStatusChange("saving", job.generation);

    try {
      // The revision comes off the queue, not off the job: it must be the newest one a save for
      // this identity has actually produced, which a snapshot taken at schedule time need not be.
      const saved = await deps.repository.save({
        id: job.designId,
        design: job.design,
        expectedRevision: queue.expectedRevision,
        provisionalMintIdentity: queue.provisionalMintIdentity,
      });
      queue.retryCount = 0;
      queue.active = false;
      queue.expectedRevision = saved.revision;
      saving = false;
      lastSaveCompletedAtMs = Date.now();
      if (job.designId === null) promoteQueue(queue, saved.id);
      deps.onSaved(saved, job.generation);
      deps.onSaveStatusChange("idle", job.generation);
      enqueueReady(queue);
      deleteQueueIfIdle(queue);
      requestSave();
    } catch (error) {
      if (error instanceof WriteNotRetryableError) {
        stopWriting(job, queue, error);
        return;
      }
      handleSaveFailure(job, queue);
    }
  }

  /** Move a successfully minted provisional queue to its persisted identity without retargeting
   * another generation's null queue. Pending same-generation work updates the minted id. */
  function promoteQueue(queue: IdentityQueue, id: DesignId): void {
    provisionalQueues.delete(queue.generation);
    queue.designId = id;
    if (queue.pending?.designId === null) {
      queue.pending = { ...queue.pending, designId: id };
    }
    if (queue.pending !== null) persistedQueues.set(id, queue);
  }

  function stopWriting(
    job: SaveJob,
    queue: IdentityQueue,
    failure: WriteNotRetryableError,
  ): void {
    saving = false;
    queue.active = false;
    queue.retryCount = 0;
    clearRetryTimer(queue);
    const status = refusedStatusFor(failure);
    if (job.designId === null) {
      refusedProvisional.set(job.generation, status);
    } else {
      refusedPersisted.set(job.designId, status);
    }

    // A stale in-flight refusal belongs to the persisted identity, not merely to the generation
    // that issued the request. If that identity has since become current again, surface the stop to
    // its newest generation before clearing its pending work.
    const affectedGeneration = queue.pending?.generation ?? queue.generation;
    queue.pending = null;
    invalidateReady(queue);
    deps.onSaveStatusChange(status, affectedGeneration);
    deleteQueueIfIdle(queue);
    requestSave();
  }

  /** Which terminal state a refusal leaves the identity in. A conflict is separated from the rest
   *  because it is the only one the customer can act on; falling through to `stopped` would be safe
   *  but would hide the two choices behind an apology. */
  function refusedStatusFor(failure: WriteNotRetryableError): RefusedStatus {
    if (failure instanceof WriteConflictError) return "conflict";
    if (failure instanceof WriteNotAuthorizedError) return "unauthorized";
    return "stopped";
  }

  /**
   * The customer chose to overwrite: re-read the revision the stored design now stands at, then
   * queue the newest document against **that** — so the overwrite is still a conditional write, and
   * a third tab that saved in the meantime conflicts again rather than being silently discarded.
   *
   * The conflict is **not** cleared here. It stays until the moment the save is actually queued, so
   * nothing slips out against the revision that was just refused (review finding F1); edits made
   * meanwhile are held by `heldByOverwrite` rather than refused.
   */
  function overwriteConflict(design: Design): void {
    const job = jobFor(design);
    const { designId } = job;
    if (designId === null) return;
    if (refusalStatus(job) !== "conflict") return;
    // One re-read at a time: a second press while the first is out would read the same revision
    // and queue the same write twice.
    if (overwritesInFlight.has(designId)) return;

    overwritesInFlight.set(designId, design);
    deps.onSaveStatusChange("saving", job.generation);
    void adoptCurrentRevisionAndSave(job, designId);
  }

  async function adoptCurrentRevisionAndSave(
    job: SaveJob,
    designId: DesignId,
  ): Promise<void> {
    try {
      const revision = await deps.readCurrentRevision(designId);
      const design = overwritesInFlight.get(designId) ?? job.design;
      overwritesInFlight.delete(designId);
      // The store may have moved to another design while the re-read was in flight. Overwriting
      // then would write this document over a design the customer never chose it for.
      if (deps.getDesignId() !== designId) {
        reportConflictStanding(job);
        return;
      }
      refusedPersisted.delete(designId);
      queueFor(job).expectedRevision = revision;
      scheduleSave(design);
    } catch {
      overwritesInFlight.delete(designId);
      reportConflictStanding(job);
    }
  }

  /** An overwrite that did not happen leaves the design exactly as conflicted as it was — the
   *  refusal was never lifted — so this only has to say so, rather than leaving the customer
   *  watching a save that is not coming. */
  function reportConflictStanding(job: SaveJob): void {
    deps.onSaveStatusChange("conflict", job.generation);
  }

  function handleSaveFailure(failedJob: SaveJob, queue: IdentityQueue): void {
    saving = false;
    queue.active = false;
    deps.onSaveStatusChange("error", failedJob.generation);

    if (
      queue.pending !== null &&
      queue.pending.generation !== failedJob.generation
    ) {
      // A newer generation of the same persisted id arrived while the old request was in flight.
      // It is fresh work, not a retry of the failed snapshot, so it runs without the old backoff.
      queue.retryCount = 0;
      enqueueReady(queue);
      requestSave();
      return;
    }

    // A same-generation edit supersedes the failed design but keeps its outage backoff. With no
    // newer edit, retry the immutable snapshot that failed.
    queue.pending ??= failedJob;
    queue.retryCount += 1;
    // Entering backoff and remaining ready are mutually exclusive states. A same-generation edit
    // may already have issued a FIFO ticket while the failed request was in flight; invalidate it
    // now so the retry timer can issue the one replacement ticket when this queue becomes ready.
    invalidateReady(queue);
    queue.retryTimer = setTimeout(() => {
      queue.retryTimer = null;
      enqueueReady(queue);
      requestSave();
    }, backoffDelayMs(queue.retryCount));
    // Other identities may progress while this one waits.
    requestSave();
  }

  function clearRetryTimer(queue: IdentityQueue): void {
    if (queue.retryTimer === null) return;
    clearTimeout(queue.retryTimer);
    queue.retryTimer = null;
  }

  /** Invalidates a queued FIFO entry without scanning the deque; a later enqueue gets a new ticket. */
  function invalidateReady(queue: IdentityQueue): void {
    queue.readyQueued = false;
    queue.readyVersion += 1;
  }

  function deleteQueueIfIdle(queue: IdentityQueue): void {
    if (
      queue.active ||
      queue.pending !== null ||
      queue.retryTimer !== null ||
      queue.readyQueued
    )
      return;
    if (queue.designId === null) {
      if (provisionalQueues.get(queue.generation) === queue)
        provisionalQueues.delete(queue.generation);
      return;
    }
    if (persistedQueues.get(queue.designId) === queue)
      persistedQueues.delete(queue.designId);
  }

  return { scheduleSave, overwriteConflict };
}
