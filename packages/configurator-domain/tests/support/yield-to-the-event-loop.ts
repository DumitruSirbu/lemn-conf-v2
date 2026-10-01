// A synchronous sweep that runs past a minute kills the vitest run, not just its own test: the worker
// cannot read the main process's reply to its task-status call while the loop is blocked, and vitest's
// fixed 60 s RPC timeout then reports `Timeout calling "onTaskUpdate"` as an unhandled error (vitest 3.2
// offers no option for it). A long sweep awaits this between its rows, so a reply is read within a row.

/** Lets the worker process its pending I/O and timers before the caller continues. */
export function yieldToTheEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
