// The coalescer under the limit on saves: one waiting write, sent once when the stated time has passed, counted from
// the answer's arrival, with every edit made meanwhile folded into it and nothing lost. Every wait runs on fake
// timers; no test sleeps.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  SaveLimitReachedError,
  WriteConflictError,
} from "../../src/persistence/design-request-errors";
import { createSaveCoalescer } from "../../src/persistence/save-coalescer";
import type {
  CoalescedSaveRequest,
  CoalescedSaveResult,
  SaveCoalescer,
  SaveStatus,
} from "../../src/persistence/save-coalescer";

const MILLISECONDS_PER_SECOND = 1000;
const DESIGN_ID = "design-a";
const FIRST_REVISION = "1";
const BACKOFF_BASE_MS = 500;

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

function refusedFor(seconds: number): () => Promise<CoalescedSaveResult> {
  return () =>
    Promise.reject(new SaveLimitReachedError("Saving a design", seconds));
}

interface RecordedSave {
  readonly atMs: number;
  readonly expectedRevision: string | null;
  readonly preset: string | null;
}

interface RecordedStatus {
  readonly status: SaveStatus;
  readonly resumesAtMs: number | undefined;
}

describe("the save coalescer under the limit on saves", () => {
  let requests: RecordedSave[];
  let statuses: RecordedStatus[];
  let stored: string | null;
  let designId: DesignId | null;
  let generation: number;
  let outcomes: (() => Promise<CoalescedSaveResult>)[];
  let holdAnswersFor: number;

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    statuses = [];
    stored = null;
    designId = DESIGN_ID;
    generation = 0;
    outcomes = [];
    holdAnswersFor = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildCoalescer(): SaveCoalescer {
    return createSaveCoalescer({
      repository: {
        save: async (request: CoalescedSaveRequest) => {
          requests.push({
            atMs: Date.now(),
            expectedRevision: request.expectedRevision,
            preset: request.design.presetId,
          });
          if (holdAnswersFor > 0) {
            await new Promise((resolve) => setTimeout(resolve, holdAnswersFor));
          }
          const scripted = outcomes.shift();
          if (scripted !== undefined) return scripted();
          stored = request.design.presetId;
          return {
            id: request.id ?? "minted",
            revision: String(Number(request.expectedRevision ?? "0") + 1),
          };
        },
      },
      getDesignId: () => designId,
      getGeneration: () => generation,
      getRevision: () => FIRST_REVISION,
      readCurrentRevision: () => Promise.resolve("9"),
      onSaved: () => undefined,
      onSaveStatusChange: (status, _generation, resumesAtMs) => {
        statuses.push({ status, resumesAtMs });
      },
    });
  }

  const requestTimes = (): number[] => requests.map(({ atMs }) => atMs);

  it("sends nothing before the stated time and exactly one request at it", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    const startedAtMs = Date.now();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND - 1);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(requestTimes()).toEqual([
      startedAtMs,
      startedAtMs + 30 * MILLISECONDS_PER_SECOND,
    ]);
    expect(stored).toBe("edit");
  });

  it("counts the wait from the answer's arrival, not from the request's start", async () => {
    holdAnswersFor = 5 * MILLISECONDS_PER_SECOND;
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    const startedAtMs = Date.now();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(5 * MILLISECONDS_PER_SECOND);
    holdAnswersFor = 0;
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND - 1);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(requests).toHaveLength(2);
    expect(requestTimes()[1]).toBe(startedAtMs + 35 * MILLISECONDS_PER_SECOND);
  });

  it("waits a whole second when the least wait is stated, and never sends at once", async () => {
    outcomes.push(refusedFor(1));
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MILLISECONDS_PER_SECOND - 1);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(requests).toHaveLength(2);
  });

  it("holds the longest wait of the window and sends once at its end", async () => {
    outcomes.push(refusedFor(3600));
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(3599 * MILLISECONDS_PER_SECOND);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MILLISECONDS_PER_SECOND);

    expect(requests).toHaveLength(2);
  });

  it("tells the editor the time the write will be sent, as an armed retry, and then that it is saving", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    const startedAtMs = Date.now();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND);

    expect(statuses).toEqual([
      { status: "saving", resumesAtMs: undefined },
      {
        status: "error",
        resumesAtMs: startedAtMs + 30 * MILLISECONDS_PER_SECOND,
      },
      { status: "saving", resumesAtMs: undefined },
      { status: "idle", resumesAtMs: undefined },
    ]);
  });

  it("holds the wait in the queue's one timer, so nothing races it", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(1);
  });

  it("folds every edit made meanwhile into the one write that goes, and stores the last of them", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    coalescer.scheduleSave(withPreset("second"));
    await vi.advanceTimersByTimeAsync(10 * MILLISECONDS_PER_SECOND);
    coalescer.scheduleSave(withPreset("third"));
    await vi.advanceTimersByTimeAsync(10 * MILLISECONDS_PER_SECOND);
    coalescer.scheduleSave(withPreset("last"));
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * MILLISECONDS_PER_SECOND);
    await vi.advanceTimersByTimeAsync(MILLISECONDS_PER_SECOND * 2);

    expect(requests.map(({ preset }) => preset)).toEqual(["first", "last"]);
    expect(stored).toBe("last");
  });

  it("says again, with each edit, when the waiting write will be sent", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);
    const stated = statuses.at(-1);
    statuses.length = 0;

    coalescer.scheduleSave(withPreset("second"));

    expect(statuses).toEqual([stated]);
  });

  it("is still one write when the answer refuses it twice, and sends nothing between", async () => {
    outcomes.push(refusedFor(30), refusedFor(45));
    const coalescer = buildCoalescer();
    const startedAtMs = Date.now();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND);
    expect(requests).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    coalescer.scheduleSave(withPreset("edit-while-refused-twice"));
    await vi.advanceTimersByTimeAsync(45 * MILLISECONDS_PER_SECOND - 1);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);

    expect(requestTimes()).toEqual([
      startedAtMs,
      startedAtMs + 30 * MILLISECONDS_PER_SECOND,
      startedAtMs + 75 * MILLISECONDS_PER_SECOND,
    ]);
    expect(stored).toBe("edit-while-refused-twice");
  });

  it("keeps the same revision across the wait, having consumed none", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND);

    expect(requests.map(({ expectedRevision }) => expectedRevision)).toEqual([
      FIRST_REVISION,
      FIRST_REVISION,
    ]);
  });

  it("leaves the failure backoff where it was: a failure after the wait retries at the first step", async () => {
    outcomes.push(refusedFor(30), () => Promise.reject(new Error("down")));
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND);
    expect(requests).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS - 1);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);

    expect(requests).toHaveLength(3);
  });

  it("does not send sooner for a newer load generation of the same design", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);

    generation += 1;
    coalescer.scheduleSave(withPreset("after-reload"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND - 1);
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(requests).toHaveLength(2);
    expect(stored).toBe("after-reload");
  });

  it("lets another design write while this one waits", async () => {
    outcomes.push(refusedFor(30));
    const coalescer = buildCoalescer();
    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);

    designId = "design-b";
    coalescer.scheduleSave(withPreset("elsewhere"));
    await vi.advanceTimersByTimeAsync(0);

    expect(requests.map(({ preset }) => preset)).toEqual(["edit", "elsewhere"]);
  });

  it("is not the failure's retry: no request is sent at the backoff's steps while it waits", async () => {
    outcomes.push(refusedFor(60));
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(59 * MILLISECONDS_PER_SECOND);

    expect(requests).toHaveLength(1);
  });
});

describe("the save coalescer when the read of the current revision is refused", () => {
  let reads: number;
  let readFailure: Error | null;
  let requests: string[];
  let statuses: SaveStatus[];
  let outcomes: (() => Promise<CoalescedSaveResult>)[];

  beforeEach(() => {
    vi.useFakeTimers();
    reads = 0;
    readFailure = null;
    requests = [];
    statuses = [];
    outcomes = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildCoalescer(): SaveCoalescer {
    return createSaveCoalescer({
      repository: {
        save: (request) => {
          requests.push(
            `${request.design.presetId ?? ""}@${request.expectedRevision ?? ""}`,
          );
          const scripted = outcomes.shift();
          if (scripted !== undefined) return scripted();
          return Promise.resolve({ id: DESIGN_ID, revision: "10" });
        },
      },
      getDesignId: () => DESIGN_ID,
      getGeneration: () => 0,
      getRevision: () => FIRST_REVISION,
      readCurrentRevision: () => {
        reads += 1;
        return readFailure === null
          ? Promise.resolve("9")
          : Promise.reject(readFailure);
      },
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
    });
  }

  async function intoConflict(coalescer: SaveCoalescer): Promise<void> {
    outcomes.push(() =>
      Promise.reject(new WriteConflictError("Saving a design", 409)),
    );
    coalescer.scheduleSave(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);
  }

  const refusedRead = (): Error =>
    new DesignRequestFailedError("Loading a design", "HTTP status 429");

  it("leaves the conflict standing, reads once, and does not loop", async () => {
    const coalescer = buildCoalescer();
    await intoConflict(coalescer);
    readFailure = refusedRead();

    coalescer.overwriteConflict(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(10 * 60 * MILLISECONDS_PER_SECOND);

    expect(statuses.at(-1)).toBe("conflict");
    expect(reads).toBe(1);
    expect(requests).toEqual([`mine@${FIRST_REVISION}`]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("can save again: the next press reads once more and writes against what it read", async () => {
    const coalescer = buildCoalescer();
    await intoConflict(coalescer);
    readFailure = refusedRead();
    coalescer.overwriteConflict(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);
    readFailure = null;

    coalescer.overwriteConflict(withPreset("mine-again"));
    await vi.advanceTimersByTimeAsync(2 * MILLISECONDS_PER_SECOND);

    expect(reads).toBe(2);
    expect(requests.at(-1)).toBe("mine-again@9");
    expect(statuses.at(-1)).toBe("idle");
  });

  it("holds the overwrite's own write when the limit refuses it, and sends it once at the stated time", async () => {
    const coalescer = buildCoalescer();
    await intoConflict(coalescer);
    outcomes.push(refusedFor(30));

    coalescer.overwriteConflict(withPreset("overwrite"));
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND - 1);
    expect(requests).toEqual([`mine@${FIRST_REVISION}`, "overwrite@9"]);
    await vi.advanceTimersByTimeAsync(2 * MILLISECONDS_PER_SECOND);

    expect(requests).toEqual([
      `mine@${FIRST_REVISION}`,
      "overwrite@9",
      "overwrite@9",
    ]);
    expect(statuses.at(-1)).toBe("idle");
  });
});
