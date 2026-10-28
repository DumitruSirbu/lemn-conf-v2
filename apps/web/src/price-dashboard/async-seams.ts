// What every screen of the dashboard shares in the way it reaches a client: a call that cannot leave it waiting, and a load
// that happens once. Neutral, so no screen's client module is imported by another's.

/** What a call answers, or `failed` when it throws or its promise rejects: a screen is never left waiting on one. */
export async function orFailed<Outcome>(
  call: () => Promise<Outcome>,
  failed: Outcome,
): Promise<Outcome> {
  try {
    return await call();
  } catch {
    return failed;
  }
}

/**
 * A loader that runs `load` on its first call and answers the same promise to every call after it. A load that rejects is
 * not remembered: the next call tries again.
 */
export function memoizeAsync<Loaded>(
  load: () => Promise<Loaded>,
): () => Promise<Loaded> {
  let loaded: Promise<Loaded> | undefined;
  return () => {
    loaded ??= load().catch((failure: unknown) => {
      loaded = undefined;
      throw failure;
    });
    return loaded;
  };
}
