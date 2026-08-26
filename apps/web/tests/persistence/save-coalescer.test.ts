import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type {
  ConfigurationRepository,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "../../src/persistence/design-request-errors";
import {
  createSaveCoalescer,
  type SaveStatus,
} from "../../src/persistence/save-coalescer";

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
  private nextUnauthorized = 0;
  private nextNotRetryable = 0;
  private holdCount = 0;

  save(id: DesignId | null, design: Design): Promise<DesignId> {
    this.calls.push({ id, design });
    this.inFlight += 1;
    this.maxConcurrentSaves = Math.max(this.maxConcurrentSaves, this.inFlight);

    const settle = <T>(outcome: Promise<T>): Promise<T> =>
      outcome.finally(() => {
        this.inFlight -= 1;
      });

    if (this.nextUnauthorized > 0) {
      this.nextUnauthorized -= 1;
      return settle(
        Promise.reject(new WriteNotAuthorizedError("Saving a design", 403)),
      );
    }
    if (this.nextNotRetryable > 0) {
      this.nextNotRetryable -= 1;
      return settle(
        Promise.reject(new WriteNotRetryableError("Saving a design", 400)),
      );
    }
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

  /** Makes the next `count` saves fail the way a browser holding no write cookie does. */
  refuseNextCallsAsUnauthorized(count: number): void {
    this.nextUnauthorized = count;
  }

  /** A terminal failure that is not about the credential — the stale-bundle 400. */
  refuseNextCallsAsNotRetryable(count: number): void {
    this.nextNotRetryable = count;
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

  describe("a write refused for want of the credential", () => {
    it("stops retrying, and says why with a status of its own", async () => {
      const coalescer = buildCoalescer();
      repository.refuseNextCallsAsUnauthorized(1);

      coalescer.scheduleSave(withPreset("a"));
      await vi.runAllTimersAsync();

      expect(statuses.at(-1)).toBe("unauthorized");
      expect(statuses).not.toContain("error");
      expect(repository.calls).toHaveLength(1);
    });

    it("attempts nothing further, however long the customer keeps editing", async () => {
      // The behaviour this replaces: 400+ requests an hour, forever, every one known to fail.
      const coalescer = buildCoalescer();
      repository.refuseNextCallsAsUnauthorized(1);

      coalescer.scheduleSave(withPreset("a"));
      await vi.advanceTimersByTimeAsync(60_000);
      coalescer.scheduleSave(withPreset("b"));
      coalescer.scheduleSave(withPreset("c"));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(repository.calls).toHaveLength(1);
      expect(statuses.at(-1)).toBe("unauthorized");
    });

    it("never reports the design as saved, so nothing becomes shareable", async () => {
      const coalescer = buildCoalescer();
      repository.refuseNextCallsAsUnauthorized(1);

      coalescer.scheduleSave(withPreset("a"));
      await vi.runAllTimersAsync();

      expect(savedIds).toEqual([]);
      expect(designId).toBeNull();
    });
  });

  describe("editing on through an outage", () => {
    it("does not fall back to the edit rate when the very first save never lands", async () => {
      // The defect this pins: `lastSaveCompletedAtMs` moves only on success, so a first save that
      // failed left every computed wait at zero — one request per edit, forever, against a server
      // already failing. One edit every 50 ms for a second used to produce 22 attempts.
      const coalescer = buildCoalescer();
      repository.rejectNextCalls(100);

      for (let edit = 0; edit < 20; edit += 1) {
        coalescer.scheduleSave(withPreset(`edit-${String(edit)}`));
        await vi.advanceTimersByTimeAsync(50);
      }

      // Bounded by the backoff schedule (500, 1000, 2000, …), not by how fast the customer edits.
      expect(repository.calls.length).toBeLessThanOrEqual(4);
    });

    it("still lands the final state once the server recovers", async () => {
      const coalescer = buildCoalescer();
      repository.rejectNextCalls(3);

      coalescer.scheduleSave(withPreset("first"));
      await vi.advanceTimersByTimeAsync(50);
      coalescer.scheduleSave(withPreset("last"));
      await vi.runAllTimersAsync();

      expect(repository.calls.at(-1)?.design.presetId).toBe("last");
      expect(savedIds).toHaveLength(1);
    });

    it("leaves no retry timer behind once a save succeeds", async () => {
      // An untracked retry timer per failure fires again after the recovery it is no longer needed
      // for. Harmless only because `pending` is empty by then — but it is one live timer per
      // failure, and nothing can cancel a pending retry.
      const coalescer = buildCoalescer();
      repository.rejectNextCalls(1);

      coalescer.scheduleSave(withPreset("a"));
      await vi.runAllTimersAsync();
      const afterRecovery = repository.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);

      expect(repository.calls).toHaveLength(afterRecovery);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("a terminal failure that is not about the credential", () => {
    it("stops retrying a 400 but keeps calling it an error", async () => {
      // A tab running a bundle from before a deploy 400s on every save, permanently. Retrying it
      // is the same wasted cost that made a 403 terminal; `unauthorized` would be a lie about it.
      const coalescer = buildCoalescer();
      repository.refuseNextCallsAsNotRetryable(1);

      coalescer.scheduleSave(withPreset("a"));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(repository.calls).toHaveLength(1);
      expect(statuses.at(-1)).toBe("error");
      expect(statuses).not.toContain("unauthorized");
    });
  });

  describe("a refusal is remembered per design, not per session", () => {
    it("writes again once the store holds a different design", async () => {
      // The cookie is `Path=/api/designs/{id}`, so a refusal for one design says nothing about
      // another — and `hydrate` can move the store to another at any time.
      const coalescer = buildCoalescer();
      repository.refuseNextCallsAsUnauthorized(1);
      designId = "refused-design";

      coalescer.scheduleSave(withPreset("a"));
      await vi.runAllTimersAsync();
      expect(repository.calls).toHaveLength(1);

      designId = "a-design-this-browser-may-write";
      coalescer.scheduleSave(withPreset("b"));
      await vi.runAllTimersAsync();

      expect(repository.calls).toHaveLength(2);
      expect(repository.calls.at(-1)?.design.presetId).toBe("b");
    });
  });

  describe("the minimum interval between successful saves (ADR 0019 decision 6)", () => {
    it("does not start another save until 1000 ms after the last successful one", async () => {
      const coalescer = buildCoalescer();

      coalescer.scheduleSave(withPreset("first"));
      await vi.advanceTimersByTimeAsync(0);
      expect(repository.calls).toHaveLength(1);

      coalescer.scheduleSave(withPreset("second"));
      await vi.advanceTimersByTimeAsync(999);
      expect(repository.calls).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(repository.calls).toHaveLength(2);
      expect(repository.calls[1]?.design.presetId).toBe("second");
    });

    it("bounds sustained output to one write per interval under continuous editing", async () => {
      // The rate M5's width dragging will produce: an edit every 50 ms for five seconds. Without
      // the interval this emits one write per round trip — here, one per edit.
      const coalescer = buildCoalescer();

      for (let edit = 0; edit < 100; edit += 1) {
        coalescer.scheduleSave(withPreset(`edit-${String(edit)}`));
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.runAllTimersAsync();

      expect(repository.calls.length).toBeLessThanOrEqual(6);
      expect(repository.calls.at(-1)?.design.presetId).toBe("edit-99");
    });

    it("still lands the final state when editing stops inside the interval", async () => {
      const coalescer = buildCoalescer();

      coalescer.scheduleSave(withPreset("first"));
      await vi.advanceTimersByTimeAsync(0);
      coalescer.scheduleSave(withPreset("last"));
      await vi.runAllTimersAsync();

      expect(repository.calls.at(-1)?.design.presetId).toBe("last");
    });

    it("does not delay the first write of a session, so mint-on-first-edit stays immediate", async () => {
      const coalescer = buildCoalescer();

      coalescer.scheduleSave(withPreset("only"));
      await vi.advanceTimersByTimeAsync(0);

      expect(repository.calls).toHaveLength(1);
    });

    it("leaves the retry path on its own backoff rather than the interval", async () => {
      const coalescer = buildCoalescer();
      repository.rejectNextCalls(1);

      coalescer.scheduleSave(withPreset("a"));
      await vi.advanceTimersByTimeAsync(0);
      expect(repository.calls).toHaveLength(1);

      // A failure is not a successful save, so the 500 ms backoff governs — not the 1000 ms floor.
      await vi.advanceTimersByTimeAsync(500);
      expect(repository.calls).toHaveLength(2);
      expect(savedIds).toEqual(["minted-id"]);
    });
  });
});
