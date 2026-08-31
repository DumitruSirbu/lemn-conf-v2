// Adversarial QA for M3 Wave 3C-2b: ADR 0019 decision 6's minimum interval, and what it does to the
// guarantee it sits on top of.
//
// The interval is a timer added to a path whose whole contract is "the final state always lands".
// That is the classic place for a last-write-lost bug, so every case here ends by asserting **which
// design reached the repository last** rather than how many calls happened. A coalescer that saved
// the right number of times and the wrong state would pass a call-count assertion and lose a
// customer's work.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  WriteNotAuthorizedError,
} from "../../src/persistence/design-request-errors";
import {
  createSaveCoalescer,
  type SaveStatus,
} from "../../src/persistence/save-coalescer";
import type {
  ClientSaveRepository,
  CoalescedSaveRequest,
  CoalescedSaveResult,
} from "../../src/persistence/save-coalescer";

/** The revision every scripted repository in this file reports and every queue therefore expects.
 *  These tests are about scheduling, identity and retry — the concurrency rule has its own tests —
 *  so one value throughout keeps them readable. */
const TEST_REVISION = "1";

const MIN_SAVE_INTERVAL_MS = 1000;

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

/** Every save recorded in order, with per-call scripting. Deliberately a second, simpler double
 *  than the implementer's: this one records the *order* designs arrive in, which is the property
 *  under test here. */
class RecordingRepository implements ClientSaveRepository {
  readonly saved: string[] = [];
  maxConcurrentSaves = 0;
  private inFlight = 0;
  private failuresRemaining = 0;
  private failEverything = false;

  save({ id, design }: CoalescedSaveRequest): Promise<CoalescedSaveResult> {
    this.inFlight += 1;
    this.maxConcurrentSaves = Math.max(this.maxConcurrentSaves, this.inFlight);
    const settle = <T>(outcome: Promise<T>): Promise<T> =>
      outcome.finally(() => {
        this.inFlight -= 1;
      });

    if (this.failEverything || this.failuresRemaining > 0) {
      if (!this.failEverything) this.failuresRemaining -= 1;
      return settle(Promise.reject(new Error("write refused")));
    }
    this.saved.push(design.presetId ?? "(none)");
    return settle(
      Promise.resolve({ id: id ?? "minted-id", revision: TEST_REVISION }),
    );
  }

  failNext(count: number): void {
    this.failuresRemaining = count;
  }

  failForever(): void {
    this.failEverything = true;
  }

  get lastSaved(): string | undefined {
    return this.saved.at(-1);
  }
}

describe("the minimum interval never loses the last state", () => {
  let repository: RecordingRepository;
  let designId: DesignId | null;
  let statuses: SaveStatus[];

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new RecordingRepository();
    designId = null;
    statuses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildCoalescer() {
    return createSaveCoalescer({
      repository,
      getDesignId: () => designId,
      getGeneration: () => 0,
      onSaved: ({ id }) => {
        designId = id;
      },
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });
  }

  it("writes a save scheduled inside the interval window once the window expires", async () => {
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved).toEqual(["first"]);

    // Well inside the window: nothing may go out yet, and nothing may be dropped either.
    await vi.advanceTimersByTimeAsync(200);
    coalescer.scheduleSave(withPreset("second"));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

    expect(repository.saved).toEqual(["first", "second"]);
  });

  it("collapses a burst inside the window to one save of the last state", async () => {
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    for (const preset of ["a", "b", "c", "d", "e"]) {
      coalescer.scheduleSave(withPreset(preset));
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

    // Dropping intermediate states is expected; dropping or reordering the last one is a defect.
    expect(repository.saved).toEqual(["first", "e"]);
    expect(repository.lastSaved).toBe("e");
  });

  it("does not starve a pending save when nothing further is scheduled", async () => {
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);
    coalescer.scheduleSave(withPreset("stranded"));

    // No further activity of any kind — the pending state must still go out on the timer alone.
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS + 10);

    expect(repository.saved).toEqual(["first", "stranded"]);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("never runs two saves at once, however the timers interleave", async () => {
    const coalescer = buildCoalescer();
    repository.failNext(1);
    coalescer.scheduleSave(withPreset("fails"));
    await vi.advanceTimersByTimeAsync(0);

    // A retry timer is now pending. Schedule more work at every interesting offset around it.
    for (const offset of [100, 200, 100, 300, 500, 1000, 1500]) {
      coalescer.scheduleSave(withPreset(`t${String(offset)}`));
      await vi.advanceTimersByTimeAsync(offset);
    }
    await vi.advanceTimersByTimeAsync(10_000);

    expect(repository.maxConcurrentSaves).toBe(1);
    expect(repository.lastSaved).toBe("t1500");
  });
});

describe("the interval and the retry backoff do not stall the path", () => {
  let repository: RecordingRepository;
  let designId: DesignId | null;
  let statuses: SaveStatus[];

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new RecordingRepository();
    designId = null;
    statuses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildCoalescer() {
    return createSaveCoalescer({
      repository,
      getDesignId: () => designId,
      getGeneration: () => 0,
      onSaved: ({ id }) => {
        designId = id;
      },
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });
  }

  it("lands the newest state after a failure, not the one that failed", async () => {
    const coalescer = buildCoalescer();
    repository.failNext(1);
    coalescer.scheduleSave(withPreset("failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toContain("error");

    // A newer edit arrives while the retry timer is pending. The retry must carry *it*, not the
    // superseded design — retrying the stale one would reorder the final state.
    coalescer.scheduleSave(withPreset("newest"));
    await vi.advanceTimersByTimeAsync(5000);

    expect(repository.saved).toEqual(["newest"]);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("retries the failed state when nothing newer arrived", async () => {
    const coalescer = buildCoalescer();
    repository.failNext(2);
    coalescer.scheduleSave(withPreset("only-edit"));

    await vi.advanceTimersByTimeAsync(10_000);

    expect(repository.saved).toEqual(["only-edit"]);
  });

  it("recovers within a bounded time even when a failure and the interval combine", async () => {
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);
    repository.failNext(1);
    coalescer.scheduleSave(withPreset("second"));

    // Interval (1000) then a failure then one backoff (500). Nothing may compound into a stall.
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS + 500 + 50);

    expect(repository.lastSaved).toBe("second");
    expect(statuses.at(-1)).toBe("idle");
  });
});

// R1.2, flipped. This block recorded the old behaviour — 400+ requests an hour against a
// permanently refused write, forever. A credential refusal is now terminal, and what follows checks
// both halves of that: that it stops, and that it stops for *only* the failures that cannot recover.
describe("a credential refusal is terminal, and nothing else is", () => {
  const MINT_ID = "design-with-an-expired-cookie";

  interface Attempt {
    readonly attempts: () => number;
    readonly statuses: SaveStatus[];
    readonly coalescer: ReturnType<typeof createSaveCoalescer>;
  }

  function coalescerRejectingWith(error: () => Error): Attempt {
    let attempts = 0;
    const statuses: SaveStatus[] = [];
    const coalescer = createSaveCoalescer({
      repository: {
        save: () => {
          attempts += 1;
          return Promise.reject(error());
        },
      },
      getDesignId: () => MINT_ID,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });
    return { attempts: () => attempts, statuses, coalescer };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([401, 403])(
    "stops after a single refused attempt when the write is refused with %i",
    async (status) => {
      const subject = coalescerRejectingWith(
        () => new WriteNotAuthorizedError("Saving a design", status),
      );

      subject.coalescer.scheduleSave(withPreset("edit"));
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      // Was 400+ over this same hour. One attempt, then nothing.
      expect(subject.attempts()).toBe(1);
      expect(subject.statuses.at(-1)).toBe("unauthorized");
      // A distinct value, not a relabelled "error": the customer's situation is different.
      expect(subject.statuses).not.toContain("error");
    },
  );

  it("ignores further edits once the credential has been refused, without another request", async () => {
    const subject = coalescerRejectingWith(
      () => new WriteNotAuthorizedError("Saving a design", 403),
    );
    subject.coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    for (const preset of ["second", "third", "fourth"]) {
      subject.coalescer.scheduleSave(withPreset(preset));
      await vi.advanceTimersByTimeAsync(10_000);
    }

    expect(subject.attempts()).toBe(1);
    expect(subject.statuses.at(-1)).toBe("unauthorized");
  });

  // The case to look at hardest: 429 is a refusal too, but a temporary one. Treating it as terminal
  // would turn a moment of throttling into a session that never saves again.
  it.each([
    {
      name: "429 Too Many Requests",
      error: () =>
        new DesignRequestFailedError("Saving a design", "HTTP status 429"),
    },
    {
      name: "500",
      error: () =>
        new DesignRequestFailedError("Saving a design", "HTTP status 500"),
    },
    {
      name: "502",
      error: () =>
        new DesignRequestFailedError("Saving a design", "HTTP status 502"),
    },
    {
      name: "503",
      error: () =>
        new DesignRequestFailedError("Saving a design", "HTTP status 503"),
    },
    {
      name: "a network TypeError",
      error: () => new TypeError("Failed to fetch"),
    },
  ])("keeps retrying after $name", async (testCase) => {
    const subject = coalescerRejectingWith(testCase.error);

    subject.coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(subject.attempts()).toBeGreaterThan(5);
    expect(subject.statuses.at(-1)).toBe("error");
    expect(subject.statuses).not.toContain("unauthorized");
    // `stopped` is the terminal status, and the surface tells the customer nothing more will be
    // written. Emitting it while retries are still running would say the edit is lost when it is
    // about to be saved.
    expect(subject.statuses).not.toContain("stopped");
  });

  it("recovers normally when a retryable failure is followed by success", async () => {
    const repository = new RecordingRepository();
    const statuses: SaveStatus[] = [];
    repository.failNext(3);
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => MINT_ID,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(repository.saved).toEqual(["edit"]);
    expect(statuses.at(-1)).toBe("idle");
  });

  // Escapability, stated rather than left accidental: the flag is never cleared, so a refusal ends
  // writing for the life of this coalescer. The store builds exactly one per module instance, so in
  // practice that means "until the page is loaded again" — a full navigation to `/d/{id}` gets a
  // fresh one, a client-side transition does not. See the report.
  it("stays terminal for the life of the coalescer, even after a would-be-successful write", async () => {
    let refuse = true;
    let attempts = 0;
    const statuses: SaveStatus[] = [];
    const coalescer = createSaveCoalescer({
      repository: {
        save: ({ id }) => {
          attempts += 1;
          if (refuse) {
            return Promise.reject(
              new WriteNotAuthorizedError("Saving a design", 403),
            );
          }
          return Promise.resolve({
            id: id ?? MINT_ID,
            revision: TEST_REVISION,
          });
        },
      },
      getDesignId: () => MINT_ID,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("refused"));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("unauthorized");

    // The credential comes back — a new cookie, a re-mint elsewhere — and this coalescer still
    // will not write. Recovery is a page load, not a retry.
    refuse = false;
    coalescer.scheduleSave(withPreset("would-succeed"));
    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(attempts).toBe(1);
    expect(statuses.at(-1)).toBe("unauthorized");
  });
});

// R1.4: the comment at the retry call site claims the first retry lands at 500 ms even though the
// interval is 1000 ms. Asserted rather than read, because a comment that drifts from the code is
// worse than no comment.
describe("the documented retry/interval asymmetry is what the code does", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries 500 ms after a failure, not 1000 ms, even right after a success", async () => {
    const repository = new RecordingRepository();
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => "id",
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved).toEqual(["first"]);

    // A success just happened, so the *interval* would delay a fresh save by ~1000 ms. A retry is
    // not subject to it.
    repository.failNext(1);
    coalescer.scheduleSave(withPreset("second"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);
    const savedAfterFirstWindow = [...repository.saved];
    await vi.advanceTimersByTimeAsync(600);

    // The failing attempt goes out on the interval, and its retry 500 ms later — inside what would
    // have been the next interval window.
    expect(savedAfterFirstWindow).toEqual(["first"]);
    expect(repository.saved).toEqual(["first", "second"]);
  });
});

// F1, and the state my earlier sweep never started from. Every interleaving I wrote began with a
// successful first save, so `lastSaveCompletedAtMs` was always set and the zero-wait branch was
// never the one under test. The defect lived entirely in the other starting state: **no save has
// ever succeeded**, where that field stays `null`, every wait computes to zero, and the write rate
// becomes the edit rate. These cases start there deliberately.
describe("an outage from the very first save is bounded by the backoff, not by the edit rate", () => {
  const EDIT_INTERVAL_MS = 50;
  const DRAG_DURATION_MS = 5000;

  interface Outage {
    readonly attempts: () => number;
    readonly statuses: SaveStatus[];
    readonly coalescer: ReturnType<typeof createSaveCoalescer>;
  }

  function failingCoalescer(): Outage {
    let attempts = 0;
    const statuses: SaveStatus[] = [];
    const coalescer = createSaveCoalescer({
      repository: {
        save: () => {
          attempts += 1;
          return Promise.reject(new Error("the server is down"));
        },
      },
      getDesignId: () => null,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });
    return { attempts: () => attempts, statuses, coalescer };
  }

  /** One edit every 50 ms for five seconds — M5's width drag, arriving during an outage. */
  async function dragFor(subject: Outage, durationMs: number): Promise<void> {
    for (let elapsed = 0; elapsed < durationMs; elapsed += EDIT_INTERVAL_MS) {
      subject.coalescer.scheduleSave(withPreset(`edit-${String(elapsed)}`));
      await vi.advanceTimersByTimeAsync(EDIT_INTERVAL_MS);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes a handful of attempts across a five-second drag, not one per edit", async () => {
    const subject = failingCoalescer();

    await dragFor(subject, DRAG_DURATION_MS);

    // 100 edits. Before the fix this was one request per edit — 22 a second against a server
    // already failing. The backoff schedule over 5 s allows 500+1000+2000+4000 ms of waiting, so
    // roughly five attempts is the ceiling; the assertion is deliberately loose on the exact count
    // and tight on the order of magnitude.
    expect(subject.attempts()).toBeLessThan(10);
    expect(subject.attempts()).toBeGreaterThan(0);
    expect(subject.statuses.at(-1)).toBe("error");
  });

  it("keeps the same bound when the drag runs for a full minute", async () => {
    const subject = failingCoalescer();

    await dragFor(subject, 60_000);

    // 1200 edits. At the 8 s ceiling a minute allows well under twenty attempts.
    expect(subject.attempts()).toBeLessThan(25);
  });

  // The constraint on the fix: none of this may delay the write that actually works.
  it("does not delay the genuine first write", async () => {
    const repository = new RecordingRepository();
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => null,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    // No timer, no interval: the first save of a session goes out immediately.
    expect(repository.saved).toEqual(["first"]);
  });

  it("still recovers to the newest state when the outage ends", async () => {
    const repository = new RecordingRepository();
    const statuses: SaveStatus[] = [];
    repository.failNext(4);
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => null,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    for (const preset of ["a", "b", "c", "d", "e", "f"]) {
      coalescer.scheduleSave(withPreset(preset));
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(60_000);

    // Whatever was written during the outage, the state that ends up stored is the last edit.
    expect(repository.lastSaved).toBe("f");
    expect(statuses.at(-1)).toBe("idle");
  });
});

// The risk the fix introduces: `requestSave` now returns early in strictly more cases, so the armed
// retry timer is the only thing that will pick up a newer `pending`. If it ever read a stale value,
// or if an edit could arrive after it had already read one, the final state would be lost — which is
// the guarantee the whole path exists to provide.
describe("the newest pending state survives the new early return", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes an edit that arrives in the last moments before the retry fires", async () => {
    const repository = new RecordingRepository();
    repository.failNext(1);
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => "id",
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("failed"));
    await vi.advanceTimersByTimeAsync(0);

    // The first retry is armed for 500 ms out. Land an edit at 499 ms.
    await vi.advanceTimersByTimeAsync(499);
    coalescer.scheduleSave(withPreset("just-in-time"));
    await vi.advanceTimersByTimeAsync(5000);

    expect(repository.saved).toEqual(["just-in-time"]);
  });

  /** Runs one failure, lands an edit `offsetMs` later, and reports what was written. */
  async function editDuringRetryWindow(offsetMs: number): Promise<string[]> {
    const repository = new RecordingRepository();
    repository.failNext(1);
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => "id",
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("failed"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(offsetMs);
    coalescer.scheduleSave(withPreset("newest"));
    await vi.advanceTimersByTimeAsync(30_000);
    return repository.saved;
  }

  // Two regimes, and the distinction is worth encoding rather than glossing. Before the retry
  // fires, the newer edit **supersedes** the failed one and the stale state is never written at
  // all. After it fires, the retry has already written the earlier state legitimately — what must
  // still hold is that the newest edit lands *after* it, never the other way round.
  it.each([1, 10, 100, 250, 499])(
    "supersedes the failed state with an edit %i ms into the retry window",
    async (offsetMs) => {
      const saved = await editDuringRetryWindow(offsetMs);

      expect(saved).toEqual(["newest"]);
    },
  );

  it.each([500, 501, 750, 1500])(
    "keeps the newest state last when the edit arrives %i ms in, after the retry fired",
    async (offsetMs) => {
      const saved = await editDuringRetryWindow(offsetMs);

      expect(saved.at(-1)).toBe("newest");
      // The earlier state was written by the retry, which is correct — what would be a defect is
      // it landing *after* the newer one.
      expect(saved.indexOf("failed")).toBeLessThan(saved.lastIndexOf("newest"));
    },
  );

  it("never leaves a pending state unwritten once the server recovers", async () => {
    const repository = new RecordingRepository();
    repository.failNext(3);
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => "id",
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("during-outage"));
    await vi.advanceTimersByTimeAsync(1200);
    coalescer.scheduleSave(withPreset("final"));
    // No further activity at all — only the armed timer can flush this.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(repository.lastSaved).toBe("final");
  });
});

// One armed retry timer at a time, cleared when a save starts: two timers firing together would put
// two attempts on the same instant, and two writes racing the same row is how an older design lands
// after a newer one.
describe("only one retry is ever armed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never makes two attempts at the same instant, however edits interleave", async () => {
    const timestamps: number[] = [];
    let failuresLeft = 6;
    const coalescer = createSaveCoalescer({
      repository: {
        save: ({ id }) => {
          timestamps.push(Date.now());
          if (failuresLeft > 0) {
            failuresLeft -= 1;
            return Promise.reject(new Error("still down"));
          }
          return Promise.resolve({
            id: id ?? "minted",
            revision: TEST_REVISION,
          });
        },
      },
      getDesignId: () => "id",
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("first"));
    for (const offset of [0, 1, 50, 499, 500, 501, 999, 1000, 1001, 2000]) {
      coalescer.scheduleSave(withPreset(`e${String(offset)}`));
      await vi.advanceTimersByTimeAsync(offset);
    }
    await vi.advanceTimersByTimeAsync(60_000);

    expect(new Set(timestamps).size).toBe(timestamps.length);
  });
});

// The `hydrate` case: a refusal is now scoped to the design it was refused for, so moving the store
// to a different design must not inherit it. `hydrate` runs during render behind an id comparison,
// so it re-runs on any client-side transition where the id differs.
describe("a refusal on one design does not silence another", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes design Y after design X was refused", async () => {
    const attempts: (DesignId | null)[] = [];
    let currentId: DesignId | null = "design-x";
    const statuses: SaveStatus[] = [];
    const coalescer = createSaveCoalescer({
      repository: {
        save: ({ id }) => {
          attempts.push(id);
          if (id === "design-x") {
            return Promise.reject(
              new WriteNotAuthorizedError("Saving a design", 403),
            );
          }
          return Promise.resolve({
            id: id ?? "minted",
            revision: TEST_REVISION,
          });
        },
      },
      getDesignId: () => currentId,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("x-edit"));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("unauthorized");

    // The customer navigates to a design they do own. Nothing about X may follow them.
    currentId = "design-y";
    coalescer.scheduleSave(withPreset("y-edit"));
    await vi.advanceTimersByTimeAsync(5000);

    expect(attempts).toEqual(["design-x", "design-y"]);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("still refuses design X if the store returns to it", async () => {
    const attempts: (DesignId | null)[] = [];
    let currentId: DesignId | null = "design-x";
    const coalescer = createSaveCoalescer({
      repository: {
        save: ({ id }) => {
          attempts.push(id);
          return id === "design-x"
            ? Promise.reject(
                new WriteNotAuthorizedError("Saving a design", 403),
              )
            : Promise.resolve({ id: id ?? "minted", revision: TEST_REVISION });
        },
      },
      getDesignId: () => currentId,
      getGeneration: () => 0,
      onSaved: () => undefined,
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("x-edit"));
    await vi.advanceTimersByTimeAsync(0);
    currentId = "design-y";
    coalescer.scheduleSave(withPreset("y-edit"));
    await vi.advanceTimersByTimeAsync(5000);

    // Back to X: the refusal it already earned still stands, without a second refused request.
    currentId = "design-x";
    coalescer.scheduleSave(withPreset("x-again"));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(attempts).toEqual(["design-x", "design-y"]);
  });
});
