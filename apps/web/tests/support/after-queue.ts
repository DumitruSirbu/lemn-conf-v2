// `after()` collected instead of scheduled: nothing runs until the test drains it, which is what "after the response"
// means. A module of its own with no import of `next/server`, because the mock of `next/server` is built from it and
// a module that imported `next/server` would wait on the mock that is waiting on it.

const afterQueue: (() => unknown)[] = [];

/** `next/server` with `after` replaced. */
export function nextServerModule<Module extends object>(original: Module) {
  return {
    ...original,
    after: (task: () => unknown) => {
      afterQueue.push(task);
    },
  };
}

export function pendingAfterTasks(): number {
  return afterQueue.length;
}

export function forgetAfterTasks(): void {
  afterQueue.length = 0;
}

/** Runs every task `after()` was given, those the tasks give it too, in order. */
export async function drainAfterTasks(): Promise<void> {
  while (afterQueue.length > 0) {
    const task = afterQueue.shift();
    await task?.();
  }
}
