// The write path (ADR 0002 decisions 13-17): the edit path never blocks on a write, writes coalesce into one save
// of the final state, and a failed write is surfaced and retried without reverting the applied edit.
// Its caller is the store's `onDesignChanged` seam; mint-on-first-write is simply the first of those.
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  SaveLimitReachedError,
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "./design-request-errors";

/**
 * What the customer's situation is, and so what a surface may honestly say:
 * - `error`: retryable; a retry is armed and the unwritten state stays queued behind it.
 * - `stopped`: terminal and not about the credential (`WriteNotRetryableError`: a 400 from a stale bundle, a
 *   413). No retry will happen, so the state on screen is the only copy.
 * - `unauthorized`: terminal; this browser does not hold the write credential (ADR 0019 decision 1), so the
 *   design is read-only here rather than failing to save.
 * - `conflict`: terminal until the customer chooses; the stored design has moved on, so no retry can succeed.
 *   Recoverable by reloading the stored design or overwriting it deliberately.
 *
 * A write the limit on saves refused is `error` with a time: its retry is armed for the time the answer stated, not for
 * the backoff, and `onSaveStatusChange` carries that time so a surface can say it.
 */
export type SaveStatus =
  | "idle"
  | "saving"
  | "error"
  | "stopped"
  | "unauthorized"
  | "conflict";

/**
 * The time a write the limit on saves holds will be sent: a failure that carries the time its retry is armed for, and
 * `undefined` for every other status and for a failure without one. The one place that decides so, asked by every
 * surface that tells a pause from a failure. A time of nought is a time.
 */
export function pausedUntilMs(
  status: SaveStatus,
  resumesAtMs: number | null | undefined,
): number | undefined {
  if (status !== "error" || typeof resumesAtMs !== "number") return undefined;
  return resumesAtMs;
}

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

/** One save request and what a successful one answers with. Mirrors `fetch-configuration-repository.ts`'s types
 *  so the coalescer depends on a shape rather than on that class. */
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
   * The revision the store believes the current design stands at, read once per identity queue when it is created.
   * Not read per job: a job scheduled while a save is in flight would capture the revision that save is about to
   * consume and be refused as stale. Only a successful save advances it (see `runSave`).
   */
  readonly getRevision: () => DesignRevision | null;
  /**
   * Re-reads a design's current revision from the server: the "re-read" half of an explicit overwrite, and the
   * only thing here that may raise a queue's expected revision without a save, which makes an overwrite
   * deliberate rather than a retry.
   */
  readonly readCurrentRevision: (id: DesignId) => Promise<DesignRevision>;
  /** Called after a successful save, scoped to the generation that scheduled it. */
  readonly onSaved: (saved: CoalescedSaveResult, generation: number) => void;
  /**
   * `error` alone comes with a third argument, and only when the limit on saves refused the write: the clock's
   * milliseconds at which the one waiting write will be sent. It is said again with every edit made meanwhile, since
   * an edit joins the waiting write and the customer is still told when it goes.
   */
  readonly onSaveStatusChange: (
    status: SaveStatus,
    generation: number,
    resumesAtMs?: number,
  ) => void;
}

/** The one write a design has not yet landed: the whole design it will send and the revision it is conditional on.
 *  `resumesAtMs` is the clock's milliseconds at which the limit on saves lets it go, `null` for a failure's backoff
 *  and for a write sent and not answered, which alone carries `isInFlight`. */
export interface WaitingWrite {
  readonly design: Design;
  readonly expectedRevision: DesignRevision | null;
  readonly resumesAtMs: number | null;
  readonly isInFlight?: true;
}

export interface SaveCoalescer {
  /** Queues `design` to be persisted. Returns immediately; the write happens off this call. */
  scheduleSave: (design: Design) => void;
  /**
   * The customer's answer to a conflict: write `design` over the stored one. Re-reads the current revision
   * first, so the overwrite stays a conditional write. A no-op unless this design is in `conflict`.
   */
  overwriteConflict: (design: Design) => void;
  /**
   * The design is being shown again by a fresh load while its own write has not landed: hands the write to the
   * load's generation, so the screen can show it in the state it is in, and answers it. The write is waiting for the
   * limit, backing off after a failure, or sent and not yet answered. It stays the one write on the same timer; an
   * edit made now joins it, and its outcome is reported to the generation that shows the design when it arrives.
   * `undefined` when no write is held for this design.
   */
  adoptWaitingWrite: (id: DesignId) => WaitingWrite | undefined;
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
   * The revision the next write for this identity must expect: seeded from the store, `null` while provisional,
   * and advanced only by a successful save, so a retry re-sends the revision the failed attempt used.
   */
  expectedRevision: DesignRevision | null;
  /** The newest generation that scheduled work for this persisted identity. */
  generation: number;
  /** Stable across every null-id attempt belonging to this provisional generation. */
  readonly provisionalMintIdentity: object | undefined;
  pending: SaveJob | null;
  /** The job whose request is out and unanswered. Its generation is the one its outcome is reported to. */
  inFlight: SaveJob | null;
  retryCount: number;
  /** The queue's one wait: the backoff after a failure, or the wait after the limit's refusal. */
  wait: QueueWait | null;
  readyQueued: boolean;
  readyVersion: number;
}

interface QueueWait {
  readonly timer: ReturnType<typeof setTimeout>;
  /** When the limit's wait ends; `null` for a failure's backoff. */
  readonly resumesAtMs: number | null;
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
   * The design an in-flight overwrite will write, per identity: the newest one offered while its re-read is out.
   * The conflict must stay in place across that await: clearing it first would let an ordinary edit go out against
   * the refused revision, conflict again and re-arm the refusal, so the overwrite itself would then be refused.
   * Holding the edit rather than refusing it keeps the panel editable and writes the latest state.
   */
  const overwritesInFlight = new Map<DesignId, Design>();

  function scheduleSave(design: Design): void {
    const job = jobFor(design);
    const refusedStatus = refusalStatus(job);
    if (refusedStatus !== undefined) {
      reportRefusedSave(job, design, refusedStatus);
      return;
    }

    const queue = queueFor(job);
    if (queue.generation !== job.generation) adoptNewerGeneration(queue, job);
    queue.pending = job;
    reportLimitWait(queue, job.generation);
    enqueueReady(queue);
    requestSave();
  }

  function reportRefusedSave(
    job: SaveJob,
    design: Design,
    refusedStatus: RefusedStatus,
  ): void {
    if (heldByOverwrite(job, design)) return;
    // A terminal identity is still terminal on return to it; report it synchronously rather than silently
    // decline to queue the write.
    deps.onSaveStatusChange(refusedStatus, job.generation);
  }

  function adoptNewerGeneration(queue: IdentityQueue, job: SaveJob): void {
    // Same persisted id, newer load generation: its state replaces any older retry/pending job.
    // An already in-flight old write cannot be cancelled, so this pending job remains and is
    // necessarily written after it settles.
    queue.generation = job.generation;
    queue.retryCount = 0;
    // A reload's fresh state is no reason to ask the server sooner than it said.
    if (limitWaitEndOf(queue) === null) clearWait(queue);
    invalidateReady(queue);
    // The load that advanced the generation read this design afresh, so the store's revision is newer than the
    // seeded one; a queue left in retry backoff would otherwise carry the stale one and conflict spuriously.
    queue.expectedRevision = deps.getRevision();
  }

  /** Says the limit's wait again, with its time, when the queue is in one. */
  function reportLimitWait(queue: IdentityQueue, generation: number): void {
    const resumesAtMs = limitWaitEndOf(queue);
    if (resumesAtMs === null) return;
    deps.onSaveStatusChange("error", generation, resumesAtMs);
  }

  function limitWaitEndOf(queue: IdentityQueue): number | null {
    return queue.wait?.resumesAtMs ?? null;
  }

  function adoptWaitingWrite(id: DesignId): WaitingWrite | undefined {
    const queue = persistedQueues.get(id);
    const held = queue === undefined ? undefined : heldWriteOf(queue);
    if (queue !== undefined && held !== undefined)
      handToCurrentGeneration(queue);
    return held;
  }

  /** What the screen must show for the write this queue holds, in the state it is in; nothing is changed. */
  function heldWriteOf(queue: IdentityQueue): WaitingWrite | undefined {
    const { pending, inFlight, wait } = queue;
    if (inFlight !== null) {
      return {
        design: (pending ?? inFlight).design,
        expectedRevision: queue.expectedRevision,
        resumesAtMs: null,
        isInFlight: true,
      };
    }
    if (pending === null || wait === null) return undefined;
    return {
      design: pending.design,
      expectedRevision: queue.expectedRevision,
      resumesAtMs: wait.resumesAtMs,
    };
  }

  /** The load that shows this design now is the one its write's outcome and its next edits are reported to. */
  function handToCurrentGeneration(queue: IdentityQueue): void {
    const generation = deps.getGeneration();
    queue.generation = generation;
    if (queue.pending !== null)
      queue.pending = { ...queue.pending, generation };
    if (queue.inFlight !== null) {
      queue.inFlight = { ...queue.inFlight, generation };
    }
  }

  /** The immutable snapshot every save is built from. The revision is deliberately not part of it: see
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
      inFlight: null,
      retryCount: 0,
      wait: null,
      readyQueued: false,
      readyVersion: 0,
    };
  }

  /** Explicit FIFO scheduling: historical Map insertion order never decides which identity runs. */
  function enqueueReady(queue: IdentityQueue): void {
    if (queue.readyQueued || queue.pending === null || queue.wait !== null)
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
        queue.wait === null
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
    queue.inFlight = job;
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
      recordSaved(queue, job, saved);
    } catch (error) {
      reportFailure(queue, job, error);
    }
  }

  function recordSaved(
    queue: IdentityQueue,
    sent: SaveJob,
    saved: CoalescedSaveResult,
  ): void {
    const answered = queue.inFlight ?? sent;
    queue.retryCount = 0;
    queue.inFlight = null;
    queue.expectedRevision = saved.revision;
    saving = false;
    lastSaveCompletedAtMs = Date.now();
    if (answered.designId === null) promoteQueue(queue, saved.id);
    deps.onSaved(saved, answered.generation);
    deps.onSaveStatusChange("idle", answered.generation);
    enqueueReady(queue);
    deleteQueueIfIdle(queue);
    requestSave();
  }

  /** The job as it stands when its request fails: a load may have handed its design to a newer generation meanwhile. */
  function reportFailure(
    queue: IdentityQueue,
    sent: SaveJob,
    error: unknown,
  ): void {
    const failedJob = queue.inFlight ?? sent;
    if (error instanceof WriteNotRetryableError) {
      stopWriting(failedJob, queue, error);
    } else if (error instanceof SaveLimitReachedError) {
      holdWriteForLimit(failedJob, queue, error.waitMs);
    } else {
      handleSaveFailure(failedJob, queue);
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
    queue.inFlight = null;
    queue.retryCount = 0;
    clearWait(queue);
    const status = refusedStatusFor(failure);
    if (job.designId === null) {
      refusedProvisional.set(job.generation, status);
    } else {
      refusedPersisted.set(job.designId, status);
    }

    // A stale in-flight refusal belongs to the persisted identity: if that identity is current again, surface the
    // stop to its newest generation before clearing its pending work.
    const affectedGeneration = queue.pending?.generation ?? queue.generation;
    queue.pending = null;
    invalidateReady(queue);
    deps.onSaveStatusChange(status, affectedGeneration);
    deleteQueueIfIdle(queue);
    requestSave();
  }

  /** Which terminal state a refusal leaves the identity in. A conflict is separated because it is the only one
   *  the customer can act on. */
  function refusedStatusFor(failure: WriteNotRetryableError): RefusedStatus {
    if (failure instanceof WriteConflictError) return "conflict";
    if (failure instanceof WriteNotAuthorizedError) return "unauthorized";
    return "stopped";
  }

  /**
   * The customer chose to overwrite: re-read the stored revision, then queue the newest document against that, so
   * a third tab that saved meanwhile conflicts again instead of being discarded. The conflict is cleared when the
   * save is queued, not here, so nothing goes out against the refused revision; edits meanwhile are held by
   * `heldByOverwrite`.
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

  /** An overwrite that did not happen leaves the design as conflicted as it was, so this only says so. */
  function reportConflictStanding(job: SaveJob): void {
    deps.onSaveStatusChange("conflict", job.generation);
  }

  function handleSaveFailure(failedJob: SaveJob, queue: IdentityQueue): void {
    saving = false;
    queue.inFlight = null;
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
    // Entering backoff and remaining ready are mutually exclusive: invalidate any FIFO ticket issued while the
    // failed request was in flight, so the retry timer issues the one replacement.
    invalidateReady(queue);
    armWait(queue, backoffDelayMs(queue.retryCount), null);
    // Other identities may progress while this one waits.
    requestSave();
  }

  /**
   * The limit refused this save, so the queue holds one waiting write and sends nothing until the time the answer
   * stated, counted from now, the answer's arrival: the queue's own timer, so there is no second one to race it.
   * Edits made meanwhile replace what waits, and a refusal when it is sent again is this same write waiting again.
   * The failure backoff is neither advanced nor reset: a wait is not a failure.
   */
  function holdWriteForLimit(
    failedJob: SaveJob,
    queue: IdentityQueue,
    waitMs: number,
  ): void {
    saving = false;
    queue.inFlight = null;
    queue.pending ??= failedJob;
    invalidateReady(queue);
    clearWait(queue);
    armWait(queue, waitMs, Date.now() + waitMs);
    reportLimitWait(queue, queue.pending.generation);
    // Other identities may progress while this one waits.
    requestSave();
  }

  /** Holds the queue for `delayMs`, then makes it ready again. `resumesAtMs` is set for the limit's wait alone. */
  function armWait(
    queue: IdentityQueue,
    delayMs: number,
    resumesAtMs: number | null,
  ): void {
    const timer = setTimeout(() => {
      queue.wait = null;
      enqueueReady(queue);
      requestSave();
    }, delayMs);
    queue.wait = { timer, resumesAtMs };
  }

  function clearWait(queue: IdentityQueue): void {
    if (queue.wait === null) return;
    clearTimeout(queue.wait.timer);
    queue.wait = null;
  }

  /** Invalidates a queued FIFO entry without scanning the deque; a later enqueue gets a new ticket. */
  function invalidateReady(queue: IdentityQueue): void {
    queue.readyQueued = false;
    queue.readyVersion += 1;
  }

  function deleteQueueIfIdle(queue: IdentityQueue): void {
    if (
      queue.inFlight !== null ||
      queue.pending !== null ||
      queue.wait !== null ||
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

  return { scheduleSave, overwriteConflict, adoptWaitingWrite };
}
