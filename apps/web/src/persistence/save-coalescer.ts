// The write path of decisions 13-17
// (`docs/decisions/2026-08-24-db-backed-shareable-persistence.md`): the edit path never blocks on
// a write, writes are coalesced so a burst of commands produces one save of the final state (not a
// queue of intermediate ones), and a failed write is surfaced and retried without ever reverting
// the already-applied edit. M2 has exactly one caller of `scheduleSave` (mint-on-first-write); M3's
// edit commands are expected to call it too, which is why this is generic infrastructure rather
// than something wired to a single call site.
import type {
  ConfigurationRepository,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";

export type SaveStatus = "idle" | "saving" | "error";

const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8000;

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
    if (!saving) void runSave();
  }

  async function runSave(): Promise<void> {
    // A retry timer can fire while a save started meanwhile is still in flight. Without this
    // guard both would run against the same row, and whichever `update` committed last would
    // decide the stored state — so an older design could land after a newer one, breaking the
    // "final state always lands" guarantee. Returning is safe: the in-flight save re-checks
    // `pending` when it settles, so nothing queued is dropped.
    if (saving) return;

    const toSave = getPending();
    if (toSave === null) return;
    setPending(null);
    saving = true;
    deps.onSaveStatusChange("saving");

    try {
      const id = await deps.repository.save(deps.getDesignId(), toSave);
      retryCount = 0;
      saving = false;
      deps.onSaved(id);
      deps.onSaveStatusChange("idle");
      if (getPending() !== null) void runSave();
    } catch {
      handleSaveFailure(toSave);
    }
  }

  function handleSaveFailure(failedDesign: Design): void {
    saving = false;
    deps.onSaveStatusChange("error");
    // Nothing newer arrived while this save was in flight: retry the state that failed. If a
    // newer state did arrive, it already superseded the failed one — retrying it, not the stale
    // one, is what "the final state always lands" requires.
    if (getPending() === null) setPending(failedDesign);
    retryCount += 1;
    setTimeout(() => void runSave(), backoffDelayMs(retryCount));
  }

  return { scheduleSave };
}
