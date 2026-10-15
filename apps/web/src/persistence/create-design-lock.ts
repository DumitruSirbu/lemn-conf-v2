// Closes the two-tab mint race in the browser (ADR 0114 Amendment H6). Two tabs of one browser share
// a visitor cookie jar but not a JS heap, so nothing in-process can serialise them; the Web Locks API
// is scoped to origin and storage partition, exactly the jar's own scope, so a private window or
// another profile gets an independent lock and never races.

/** One well-known name for every `POST /api/designs`, not one per design: nothing exists yet when a
 *  mint starts, so there is no id to key a lock by. */
const LEMNARIA_CREATE_DESIGN_LOCK = "lemnaria:create-design";

/** How long a mint waits to acquire the lock before proceeding unlocked. A peer still holding it
 *  after this long has almost certainly failed; this bounds only the wait, never the winner's request. */
export const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;

/** The one shape this module needs from `navigator.locks`, declared structurally so a test can fake it. */
interface LockRequester {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive"; readonly signal: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>;
}

/** Marks an error as `run`'s own, raised after the lock was granted, so {@link withCreateDesignLock}
 *  can tell it from the wait timing out without a mutable flag that static analysis cannot prove read. */
class LockedRunFailure extends Error {
  constructor(public override readonly cause: unknown) {
    super("withCreateDesignLock: the locked run threw");
    this.name = "LockedRunFailure";
  }
}

/**
 * Runs `run` exclusively across every tab of this browser through the Web Locks API, or immediately
 * when it is absent.
 *
 * Held across the whole of `run`, including reading its response body: a second tab's request is
 * granted only once the callback has settled, by which point the mint's `Set-Cookie` is already
 * stored (the Fetch Standard stores it while headers are processed), so the second mint reads the
 * first tab's rotated cookie.
 *
 * Feature detection, not a polyfill: where `navigator.locks?.request` is absent (Safari before 15.4,
 * older Chromium and Firefox, non-browser callers) `run` goes unlocked, the accepted residual of
 * ADR 0114 H6. A wait longer than {@link LOCK_ACQUIRE_TIMEOUT_MS} also proceeds unlocked, never
 * failing the caller's mint over a peer's stuck one. It uses an `AbortController` and a cleared
 * timer rather than `AbortSignal.timeout`: a test advances the timer, and clearing it leaves no
 * pending timeout behind a settled wait.
 *
 * Proceeding unlocked is safe because a {@link LockedRunFailure} means `run` was called and threw, so
 * it is rethrown as-is, while any other rejection from `locks.request` (the wait aborting; a driver
 * defect) means `run` never started and falls through to one unlocked call. Minting twice for one
 * customer action is worse than minting unlocked once.
 */
export async function withCreateDesignLock<T>(
  run: () => Promise<T>,
): Promise<T> {
  const locks = readLockRequester();
  if (locks === undefined) return run();

  const controller = new AbortController();
  const expiry = setTimeout(() => {
    controller.abort();
  }, LOCK_ACQUIRE_TIMEOUT_MS);

  try {
    return await locks.request(
      LEMNARIA_CREATE_DESIGN_LOCK,
      { mode: "exclusive", signal: controller.signal },
      () =>
        run().catch((error: unknown) =>
          Promise.reject(new LockedRunFailure(error)),
        ),
    );
  } catch (error) {
    if (error instanceof LockedRunFailure) throw error.cause;
    return await run();
  } finally {
    clearTimeout(expiry);
  }
}

/** `navigator` is absent on the server and `locks` on an unsupporting browser: two reasons for one fallback. */
function readLockRequester(): LockRequester | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.locks as LockRequester | undefined;
}
