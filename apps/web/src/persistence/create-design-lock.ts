// M7 wave 7E3b S6 (ADR 0114 Amendment H6, D2): the owner's ruling "Web Lock + random" closes the
// two-tab mint race in the browser rather than the server. Two tabs of one browser share the same
// visitor cookie jar but not the same JS heap, so nothing in-process can serialise them — the Web
// Locks API is scoped to origin and storage partition, exactly the jar's own scope, which is why a
// private window or another profile gets an independent lock and an independent race never
// happens there.

/** The one lock name every `POST /api/designs` takes. A single well-known name, not one per
 *  design: there is nothing to create yet when a mint starts, so there is no id to key a lock by. */
const LEMNARIA_CREATE_DESIGN_LOCK = "lemnaria:create-design";

/** How long a mint waits to acquire the lock before proceeding unlocked. A peer mint still holding
 *  it after this long has almost certainly failed — the mint itself is otherwise unbounded (ADR
 *  0010), so this bounds only the *wait*, never the request the winner is making. */
const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;

/** The one shape this module needs from `navigator.locks` — declared structurally so a test can
 *  fake it without constructing a real `LockManager`. */
interface LockRequester {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive"; readonly signal: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>;
}

/** Marks an error as `run`'s own, raised after the lock was granted and `run` had genuinely begun
 *  — the one signal {@link withCreateDesignLock} needs to tell that case apart from the wait for
 *  the lock itself timing out, without a mutable flag a closure would have to set (and which
 *  static analysis then cannot prove was ever read after being set). */
class LockedRunFailure extends Error {
  constructor(public override readonly cause: unknown) {
    super("withCreateDesignLock: the locked run threw");
    this.name = "LockedRunFailure";
  }
}

/**
 * Runs `run` — exclusively, across every tab of this browser — through the Web Locks API when it
 * exists, or immediately when it does not.
 *
 * **Held across the whole of `run`, including reading its response body** (D2): a second tab's own
 * `request` for this name is granted only once this call's callback has *settled*, by which point
 * the mint response's `Set-Cookie` has already been stored in the jar (the Fetch Standard stores it
 * while the response headers are processed, before `fetch` itself resolves) — so the second tab's
 * own mint, once it runs, reads the first tab's rotated cookie rather than the one it started with.
 *
 * **Feature detection, not a polyfill.** `navigator.locks?.request` absent — Safari before 15.4,
 * older Chromium and Firefox, and any non-browser caller — runs `run` unlocked. This is the
 * accepted residual (ADR 0114 H6): those browsers can still lose a design to the two-tab race: the
 * measured cost is recorded there, not repeated here.
 *
 * **A wait longer than {@link LOCK_ACQUIRE_TIMEOUT_MS} also proceeds unlocked**, never failing the
 * caller's own mint over a peer's stuck one. Built from an `AbortController` and a cleared timer
 * rather than `AbortSignal.timeout` for `requestWithinTimeout`'s own reason: the timer is what a
 * test advances, and clearing it stops a settled wait leaving a pending timeout behind it.
 *
 * The distinction that makes proceeding unlocked safe: a {@link LockedRunFailure} means `run` was
 * genuinely called and threw, so it is unwrapped and rethrown as-is — but every other rejection
 * from `locks.request` (the wait itself aborting; a driver defect) means `run` never started, so
 * falls through to a second, unlocked call. Minting twice for one customer action is worse than
 * minting unlocked once.
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

/** `navigator` itself is absent on the server, and `locks` is absent on an unsupporting browser —
 *  two separate reasons the same fallback below has to cover. */
function readLockRequester(): LockRequester | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.locks as LockRequester | undefined;
}
