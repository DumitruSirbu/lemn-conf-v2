import type { Design, DesignId } from "@lemnaria/configurator-domain";

import {
  sessionConfigurationRepository,
  type ClientSaveRequest,
  type ClientSaveResult,
} from "@/persistence/fetch-configuration-repository";

export interface DesignCreationRepository {
  save(request: ClientSaveRequest): Promise<ClientSaveResult>;
}

export interface DesignCreationAttempt {
  run(): Promise<ClientSaveResult>;
}

interface DesignCreationOptions {
  readonly design: Design;
  readonly navigateToDesign: (id: DesignId) => void;
  readonly repository?: DesignCreationRepository;
}

/**
 * One deliberate Step 1 selection, from its first save through handing the customer the written
 * design's link. The attempt owns one opaque mint identity for its whole lifetime, and a second
 * factory call deliberately creates a new design even when its document is byte-for-byte equal.
 *
 * **Reusing the row across retries is half this factory's and half the repository's.** A retry after
 * a **failed** `PUT` has no `savedResult` to return, so it calls `save` again — and what makes that
 * a second write to the same row rather than a second row is the repository keeping one row per
 * `provisionalMintIdentity` (`FetchConfigurationRepository`'s `mintedIds`). `repository` below is an
 * injection point, so that is an **obligation on whatever is passed**: a repository that mints per
 * `save` breaks the one-row guarantee with every test in this file still green.
 *
 * That fresh identity is what opts the attempt out of the repository's shared default one, so the
 * "one row however many times it is tapped" guarantee holds only *within* a single attempt.
 * Construct one attempt per deliberate selection — where that selection's state lives — and reuse
 * it across taps; constructing one inside a click handler mints a row, and navigates, per tap.
 */
export function createDesignCreationAttempt({
  design,
  navigateToDesign,
  repository = sessionConfigurationRepository,
}: DesignCreationOptions): DesignCreationAttempt {
  const provisionalMintIdentity = {};
  let savedResult: ClientSaveResult | null = null;
  let runPromise: Promise<ClientSaveResult> | null = null;

  return {
    run() {
      if (runPromise !== null) return runPromise;

      const pending = beginSave().then(recordSuccessAndNavigate);
      const retryable = pending.catch(resetForRetry);
      runPromise = retryable;
      return retryable;
    },
  };

  /** The write this run awaits: the row an earlier run already persisted, or a fresh save. */
  function beginSave(): Promise<ClientSaveResult> {
    if (savedResult !== null) return Promise.resolve(savedResult);

    // `save` is *typed* to return a promise, but a repository that threw **synchronously** would
    // escape `run()`'s promised error channel and bypass the reset-for-retry path below — so the
    // call is wrapped rather than returned bare.
    return new Promise<ClientSaveResult>((resolve) => {
      resolve(
        repository.save({
          id: null,
          design,
          expectedRevision: null,
          provisionalMintIdentity,
        }),
      );
    });
  }

  /** Cache the completed write before navigation. If the router throws, the next run retries only
   *  this hand-off instead of writing the already-persisted document a second time. */
  function recordSuccessAndNavigate(saved: ClientSaveResult): ClientSaveResult {
    savedResult = saved;
    navigateToDesign(saved.id);
    return saved;
  }

  /** A failed run is not the attempt's last word: drop the memo so the next `run()` starts over,
   *  and re-throw so this caller still sees the failure. */
  function resetForRetry(error: unknown): never {
    runPromise = null;
    throw error;
  }
}
