// The write path of decisions 13-17
// (`docs/decisions/0002-db-backed-shareable-persistence.md`): the edit path never blocks on
// a write, writes are coalesced so a burst of commands produces one save of the final state (not a
// queue of intermediate ones), and a failed write is surfaced and retried without ever reverting
// the already-applied edit. Its caller is the store's `onDesignChanged` seam, which fires after
// every successful command — mint-on-first-write is simply the first of those, not a special case.
import type { Design, DesignId } from "@lemnaria/configurator-domain";

import {
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
 */
export type SaveStatus =
  | "idle"
  | "saving"
  | "error"
  | "stopped"
  | "unauthorized";

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

/**
 * The browser repository accepts one extra, opaque value meaningful only when `id` is `null`.
 * Reusing it deduplicates a mint across retries/overlap for one fresh design; a different value
 * deliberately means a different fresh design. Domain repositories with two arguments remain
 * structurally compatible and simply ignore the extra value.
 */
export interface ClientSaveRepository {
  readonly save: (
    id: DesignId | null,
    design: Design,
    provisionalMintIdentity?: object,
  ) => Promise<DesignId>;
}

export interface SaveCoalescerDependencies {
  readonly repository: ClientSaveRepository;
  /** Captured when `scheduleSave` is called. `null` mints a new row. */
  readonly getDesignId: () => DesignId | null;
  /** Unlike an id, the generation also distinguishes two fresh designs that both carry `null`. */
  readonly getGeneration: () => number;
  /** Called after a successful save, scoped to the generation that scheduled it. */
  readonly onSaved: (id: DesignId, generation: number) => void;
  readonly onSaveStatusChange: (status: SaveStatus, generation: number) => void;
}

export interface SaveCoalescer {
  /** Queues `design` to be persisted. Returns immediately; the write happens off this call. */
  scheduleSave: (design: Design) => void;
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
  const refusedPersisted = new Map<
    DesignId,
    Extract<SaveStatus, "stopped" | "unauthorized">
  >();
  const refusedProvisional = new Map<
    number,
    Extract<SaveStatus, "stopped" | "unauthorized">
  >();

  function scheduleSave(design: Design): void {
    const job: SaveJob = {
      designId: deps.getDesignId(),
      design,
      generation: deps.getGeneration(),
    };
    const refusedStatus = refusalStatus(job);
    if (refusedStatus !== undefined) {
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
    }
    queue.pending = job;
    enqueueReady(queue);
    requestSave();
  }

  function queueFor(job: SaveJob): IdentityQueue {
    if (job.designId !== null) {
      const existing = persistedQueues.get(job.designId);
      if (existing) return existing;
      const queue = newQueue(job.designId, job.generation, undefined);
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

  function refusalStatus(
    job: SaveJob,
  ): Extract<SaveStatus, "stopped" | "unauthorized"> | undefined {
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
      const id = await deps.repository.save(
        job.designId,
        job.design,
        queue.provisionalMintIdentity,
      );
      queue.retryCount = 0;
      queue.active = false;
      saving = false;
      lastSaveCompletedAtMs = Date.now();
      if (job.designId === null) promoteQueue(queue, id);
      deps.onSaved(id, job.generation);
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
    const status =
      failure instanceof WriteNotAuthorizedError ? "unauthorized" : "stopped";
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

  return { scheduleSave };
}
