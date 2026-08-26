// The write path of decisions 13-17
// (`docs/decisions/0002-db-backed-shareable-persistence.md`): the edit path never blocks on
// a write, writes are coalesced so a burst of commands produces one save of the final state (not a
// queue of intermediate ones), and a failed write is surfaced and retried without ever reverting
// the already-applied edit. Its caller is the store's `onDesignChanged` seam, which fires after
// every successful command — mint-on-first-write is simply the first of those, not a special case.
import type {
  ConfigurationRepository,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";

import {
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "./design-request-errors";

/**
 * `error` is a failure worth retrying; `unauthorized` is one that is not, and the two are separate
 * values because the customer's situation is different (ADR 0019 decision 1: the write credential
 * is a cookie this browser simply does not hold — the design is read-only here, not failing to
 * save). M3 exposes both and no more; which surface communicates them is M4's open question.
 */
export type SaveStatus = "idle" | "saving" | "error" | "unauthorized";

const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8000;

/**
 * ADR 0019 decision 6. Without it `scheduleSave` starts a write the moment no other one is in
 * flight, so sustained output is bounded by round-trip time rather than by a timer — roughly one
 * write per RTT while a customer is editing, and continuous once M5 adds width dragging. The
 * interval bounds the output rate by a clock the client owns, which is what makes decision 4's
 * server-side update limits sizeable at all.
 *
 * It gates *starting* a save, never dropping one: whatever is pending when the interval elapses is
 * written, so the final state still always lands.
 */
const MIN_SAVE_INTERVAL_MS = 1000;

function backoffDelayMs(retryCount: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * 2 ** (retryCount - 1),
    RETRY_MAX_DELAY_MS,
  );
}

export interface SaveCoalescerDependencies {
  readonly repository: Pick<ConfigurationRepository, "save">;
  /** The id to save against. `null` mints a new row (M2's only trigger: first write). */
  readonly getDesignId: () => DesignId | null;
  /** Called after every successful save, including the mint case, with the id that was saved to. */
  readonly onSaved: (id: DesignId) => void;
  readonly onSaveStatusChange: (status: SaveStatus) => void;
}

export interface SaveCoalescer {
  /** Queues `design` to be persisted. Returns immediately; the write happens off this call. */
  scheduleSave: (design: Design) => void;
}

/** Builds a coalescer bound to one repository/id pair. Each call owns its own in-flight/pending
 *  state, so the store wires one instance per session rather than sharing a module-level singleton. */
export function createSaveCoalescer(
  deps: SaveCoalescerDependencies,
): SaveCoalescer {
  let pending: Design | null = null;
  let saving = false;
  let retryCount = 0;
  let lastSaveCompletedAtMs: number | null = null;
  let intervalTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The design a write was refused for, or `undefined` while none has been. Terminal for **that**
   * design: the credential cannot be obtained from here, so every further attempt on it is known to
   * fail. Keyed by id rather than a bare flag because the cause is per-design — the cookie is
   * `Path=/api/designs/{id}` — while this coalescer is one per session. A refusal for design X is
   * no evidence about design Y, and `hydrate` can move the store to Y at any time (it runs during
   * render, guarded by an id comparison, so any client-side transition to a different id re-runs
   * it). `null` is a real value here: it records a refusal suffered while the store still held no
   * id, which is why "never refused" is `undefined` and not `null`.
   */
  let refusedDesignId: DesignId | null | undefined = undefined;

  // `pending` is reassigned by `scheduleSave` while `runSave` sits at its `await`. TypeScript's
  // flow analysis doesn't model that reentrant write across the await boundary, so it would
  // (wrongly) treat a direct `pending === null` check after line ~48 as always true. Reading and
  // writing only through these two functions keeps every access an opaque call the type checker
  // can't narrow, which is what makes the post-await check below trustworthy rather than dead code.
  function getPending(): Design | null {
    return pending;
  }
  function setPending(design: Design | null): void {
    pending = design;
  }

  function scheduleSave(design: Design): void {
    setPending(design);
    requestSave();
  }

  /**
   * Starts the next save, or arms the timer that will. Every path that has something new to write
   * goes through here rather than calling `runSave` directly, so there is exactly one place the
   * minimum interval can be bypassed from — and a second armed timer is impossible.
   *
   * `retryCount > 0` means a retry timer is armed (`handleSaveFailure` always arms one, and only
   * a success clears the count), and that timer will read whatever `pending` holds when it fires.
   * So an edit arriving mid-outage needs to start nothing: returning here leaves the newest state
   * queued behind an already-armed waker. Without this, the minimum interval was bypassed for the
   * whole session whenever the **first** save failed — `lastSaveCompletedAtMs` moves only on
   * success, so it stayed `null`, every wait computed to zero, and the write rate went back to
   * being the customer's edit rate: 22 requests a second under a one-edit-per-50 ms drag, against
   * a server already failing. Gating on the armed retry instead bounds an outage to the backoff
   * schedule itself, which is stricter than the interval and needs no second clock.
   */
  function requestSave(): void {
    if (saving || intervalTimer !== null || retryCount > 0) return;
    if (isRefused()) return;

    const waitMs = millisecondsUntilNextSaveAllowed();
    if (waitMs === 0) {
      void runSave();
      return;
    }
    intervalTimer = setTimeout(() => {
      intervalTimer = null;
      void runSave();
    }, waitMs);
  }

  /** Zero until a save has actually succeeded: the first write of a session — the mint — is never
   *  delayed, because there is no preceding save for it to be too close to. */
  /** Whether writing is over for the design the store currently holds. */
  function isRefused(): boolean {
    return (
      refusedDesignId !== undefined && refusedDesignId === deps.getDesignId()
    );
  }

  function millisecondsUntilNextSaveAllowed(): number {
    if (lastSaveCompletedAtMs === null) return 0;
    return Math.max(
      0,
      MIN_SAVE_INTERVAL_MS - (Date.now() - lastSaveCompletedAtMs),
    );
  }

  async function runSave(): Promise<void> {
    // A retry timer can fire while a save started meanwhile is still in flight. Without this
    // guard both would run against the same row, and whichever `update` committed last would
    // decide the stored state — so an older design could land after a newer one, breaking the
    // "final state always lands" guarantee. Returning is safe: the in-flight save re-checks
    // `pending` when it settles, so nothing queued is dropped.
    if (saving || isRefused()) return;

    const toSave = getPending();
    if (toSave === null) return;
    setPending(null);
    saving = true;
    clearRetryTimer();
    deps.onSaveStatusChange("saving");

    try {
      const id = await deps.repository.save(deps.getDesignId(), toSave);
      retryCount = 0;
      saving = false;
      lastSaveCompletedAtMs = Date.now();
      // Only ever on a **fully** successful save. `onSaved` is what sets the store's `designId`
      // and `hasPersistedSuccessfully`, so reporting a partial success here — the mint, say,
      // before the design it minted for has been written — would present a shareable link to a
      // design holding none of the customer's work (persistence decision 17).
      deps.onSaved(id);
      deps.onSaveStatusChange("idle");
      if (getPending() !== null) requestSave();
    } catch (error) {
      if (error instanceof WriteNotRetryableError) {
        stopWriting(toSave, error);
        return;
      }
      handleSaveFailure(toSave);
    }
  }

  /**
   * A failure retrying cannot change ends this design's writing rather than repeating it forever.
   *
   * Retrying such a write costs a request and a database round trip per attempt — 400+ an hour at
   * the backoff ceiling — spending exactly what ADR 0019 decision 2 protects, and spending it from
   * the client where no firewall rule can see it as abuse.
   *
   * `unauthorized` is reserved for the credential case, which is the one M4 can say something
   * useful about ("read-only in this browser"). Any other terminal failure keeps the plain `error`
   * status: it is still surfaced and still never silent, it simply is not retried.
   *
   * The edit itself is untouched, here as everywhere: the store keeps the applied change, `pending`
   * keeps the state that was never written, and the status says nothing is being written.
   */
  function stopWriting(
    unwrittenDesign: Design,
    failure: WriteNotRetryableError,
  ): void {
    saving = false;
    refusedDesignId = deps.getDesignId();
    if (getPending() === null) setPending(unwrittenDesign);
    deps.onSaveStatusChange(
      failure instanceof WriteNotAuthorizedError ? "unauthorized" : "error",
    );
  }

  function handleSaveFailure(failedDesign: Design): void {
    saving = false;
    deps.onSaveStatusChange("error");
    // Nothing newer arrived while this save was in flight: retry the state that failed. If a
    // newer state did arrive, it already superseded the failed one — retrying it, not the stale
    // one, is what "the final state always lands" requires.
    if (getPending() === null) setPending(failedDesign);
    retryCount += 1;
    // Deliberately `runSave` and not `requestSave`: a retry is not subject to the minimum interval,
    // which ADR 0019 decision 6 defines as the gap between **successful** saves — and
    // `lastSaveCompletedAtMs` moves only on success. So the first retry lands at 500 ms even though
    // the interval is 1000 ms. Routing it through `requestSave` would let a recent success delay a
    // retry, which is the opposite of what a failed write needs.
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void runSave();
    }, backoffDelayMs(retryCount));
  }

  /** Held and cleared like `intervalTimer` rather than left as a bare `setTimeout`: an untracked
   *  retry timer per failure means one live timer per failure, and no way to cancel a pending
   *  retry — which is what a future `dispose()` would need. */
  function clearRetryTimer(): void {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  return { scheduleSave };
}
