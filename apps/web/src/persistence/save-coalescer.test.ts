import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type {
  ConfigurationRepository,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSaveCoalescer, type SaveStatus } from "./save-coalescer";

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

/** Records every `save` call and lets each test script its resolution/rejection per call. */
class ScriptedRepository implements Pick<ConfigurationRepository, "save"> {
  readonly calls: { id: DesignId | null; design: Design }[] = [];
  /** Highest number of saves in flight at once — two concurrent writes to the same row would let
   *  an older design commit after a newer one. */
  maxConcurrentSaves = 0;
  private inFlight = 0;
  private readonly resolutions: (() => DesignId)[] = [];
  private readonly deferred: (() => void)[] = [];
  private nextRejects = 0;
  private holdCount = 0;

  save(id: DesignId | null, design: Design): Promise<DesignId> {
    this.calls.push({ id, design });
    this.inFlight += 1;
    this.maxConcurrentSaves = Math.max(this.maxConcurrentSaves, this.inFlight);

    const settle = <T>(outcome: Promise<T>): Promise<T> =>
      outcome.finally(() => {
        this.inFlight -= 1;
      });

    if (this.nextRejects > 0) {
      this.nextRejects -= 1;
      return settle(Promise.reject(new Error("network error")));
    }
    if (this.holdCount > 0) {
      this.holdCount -= 1;
      return settle(
        new Promise<DesignId>((resolve) => {
          this.deferred.push(() => {
            resolve(id ?? "minted-id");
          });
        }),
      );
    }
    const resolve = this.resolutions.shift();
    return settle(Promise.resolve(resolve ? resolve() : (id ?? "minted-id")));
  }

  /** Makes the next `count` saves hang until `releaseHeld()`, so a retry timer can fire while one
   *  is still in flight. */
  holdNextCalls(count: number): void {
    this.holdCount = count;
  }

  releaseHeld(): void {
    for (const release of this.deferred.splice(0)) release();
  }

  rejectNextCalls(count: number): void {
    this.nextRejects = count;
  }

  resolveNextWith(id: DesignId): void {
    this.resolutions.push(() => id);
  }
}

describe("createSaveCoalescer", () => {
  let repository: ScriptedRepository;
  let designId: DesignId | null;
  let statuses: SaveStatus[];
  let savedIds: DesignId[];

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new ScriptedRepository();
    designId = null;
    statuses = [];
    savedIds = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildCoalescer() {
    return createSaveCoalescer({
      repository,
      getDesignId: () => designId,
      onSaved: (id) => {
        savedIds.push(id);
        designId = id;
      },
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
    });
  }

  it("returns synchronously without ever handing the caller a promise to await", () => {
    // `SaveCoalescer.scheduleSave` is typed `(design: Design) => void`, so `await`ing it is a type
    // error at every call site; this is the runtime half of that guarantee — the call completes
    // and control returns to the caller without the caller doing anything to make that happen.
    const coalescer = buildCoalescer();
    expect(() => {
      coalescer.scheduleSave(withPreset("a"));
    }).not.toThrow();
  });

  it("coalesces rapid successive calls into fewer writes, with the final state persisted", async () => {
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("a"));
    coalescer.scheduleSave(withPreset("b"));
    coalescer.scheduleSave(withPreset("c"));
    await vi.runAllTimersAsync();

    expect(repository.calls.length).toBeLessThan(3);
    expect(repository.calls.at(-1)?.design.presetId).toBe("c");
  });

  it("saves again after an in-flight write settles when a newer state arrived meanwhile", async () => {
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("first"));
    // Queue the second call while the first save's promise is still pending (before flushing).
    coalescer.scheduleSave(withPreset("second"));
    await vi.runAllTimersAsync();

    expect(repository.calls).toHaveLength(2);
    expect(repository.calls[0]?.design.presetId).toBe("first");
    expect(repository.calls[1]?.design.presetId).toBe("second");
  });

  it("mints an id on the first write and reuses it on the next", async () => {
    const coalescer = buildCoalescer();
    repository.resolveNextWith("design-1");

    coalescer.scheduleSave(withPreset("a"));
    await vi.runAllTimersAsync();
    expect(savedIds).toEqual(["design-1"]);

    coalescer.scheduleSave(withPreset("b"));
    await vi.runAllTimersAsync();
    expect(repository.calls[1]?.id).toBe("design-1");
  });

  it("retries a failed write with capped backoff until it succeeds", async () => {
    const coalescer = buildCoalescer();
    repository.rejectNextCalls(2);

    coalescer.scheduleSave(withPreset("a"));
    await vi.runAllTimersAsync();

    expect(repository.calls.length).toBeGreaterThanOrEqual(3);
    expect(savedIds).toHaveLength(1);
  });

  it("surfaces a failed write as 'error' status rather than swallowing it", async () => {
    const coalescer = buildCoalescer();
    repository.rejectNextCalls(1);

    coalescer.scheduleSave(withPreset("a"));
    await vi.runAllTimersAsync();

    expect(statuses).toContain("error");
    expect(statuses.at(-1)).toBe("idle");
  });

  it("retries the design that failed, not an empty write, when nothing newer arrives", async () => {
    const coalescer = buildCoalescer();
    repository.rejectNextCalls(1);

    coalescer.scheduleSave(withPreset("only"));
    await vi.runAllTimersAsync();

    expect(
      repository.calls.every((call) => call.design.presetId === "only"),
    ).toBe(true);
  });

  it("a rejected save never invokes onSaved, so the caller's model is left unchanged", async () => {
    const coalescer = buildCoalescer();
    repository.rejectNextCalls(1);

    coalescer.scheduleSave(withPreset("a"));
    await vi.runAllTimersAsync();

    expect(savedIds).toHaveLength(1);
    expect(designId).not.toBeNull();
  });

  it("never runs two saves at once when a retry timer fires during an in-flight save", async () => {
    const coalescer = buildCoalescer();

    // Fail once so a retry is pending, then start a save that hangs. When the retry timer fires,
    // an unguarded coalescer starts a second concurrent write to the same row — and whichever
    // `update` commits last decides the stored state, so an older design can beat a newer one.
    repository.rejectNextCalls(1);
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    repository.holdNextCalls(1);
    coalescer.scheduleSave(withPreset("second"));
    await vi.advanceTimersByTimeAsync(0);

    coalescer.scheduleSave(withPreset("third"));
    await vi.advanceTimersByTimeAsync(2000);

    repository.releaseHeld();
    await vi.runAllTimersAsync();

    expect(repository.maxConcurrentSaves).toBe(1);
    expect(repository.calls.at(-1)?.design.presetId).toBe("third");
  });
});
