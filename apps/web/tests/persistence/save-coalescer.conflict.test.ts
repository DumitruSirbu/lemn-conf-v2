// WEB-003's client half: what the coalescer expects, what it advances, and what it does when the
// stored design has moved on.
//
// Before wave S11 none of this existed — `save` took `(id, design)`, there was no revision on a
// queue and no `conflict` status — so every test in this file fails against that implementation
// rather than merely asserting something it happened to get right.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WriteConflictError } from "../../src/persistence/design-request-errors";
import { createSaveCoalescer } from "../../src/persistence/save-coalescer";
import type {
  CoalescedSaveRequest,
  CoalescedSaveResult,
  SaveCoalescer,
  SaveStatus,
} from "../../src/persistence/save-coalescer";

/** ADR 0019 decision 6's floor, restated here because a test that advances timers has to know it. */
const MIN_SAVE_INTERVAL_MS = 1000;
const DESIGN_ID = "design-a";
const FIRST_REVISION = "1";

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

interface RecordedSave {
  readonly id: DesignId | null;
  readonly expectedRevision: string | null;
  readonly preset: string | null;
}

describe("the save coalescer under a revision conflict", () => {
  let requests: RecordedSave[];
  let statuses: SaveStatus[];
  let saved: CoalescedSaveResult[];
  let designId: DesignId | null;
  let generation: number;
  let storeRevision: string | null;
  let currentRevisionOnServer: string;
  let readCurrentRevisionFails: boolean;
  let holdReadCurrentRevision: boolean;
  let pendingReads: (() => void)[];
  let outcomes: (() => Promise<CoalescedSaveResult>)[];
  let pendingSaves: (() => void)[];
  let holdSaves: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    statuses = [];
    saved = [];
    designId = DESIGN_ID;
    generation = 0;
    storeRevision = FIRST_REVISION;
    currentRevisionOnServer = FIRST_REVISION;
    readCurrentRevisionFails = false;
    holdReadCurrentRevision = false;
    pendingReads = [];
    outcomes = [];
    pendingSaves = [];
    holdSaves = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Succeeds by advancing the revision the caller stated, which is what the real route does. */
  function accepting(request: CoalescedSaveRequest): CoalescedSaveResult {
    const revision = String(Number(request.expectedRevision ?? "0") + 1);
    currentRevisionOnServer = revision;
    return { id: request.id ?? "minted", revision };
  }

  function scriptConflict(): void {
    outcomes.push(() =>
      Promise.reject(new WriteConflictError("Saving a design", 409)),
    );
  }

  function scriptFailure(): void {
    outcomes.push(() => Promise.reject(new Error("the server is down")));
  }

  function buildCoalescer(): SaveCoalescer {
    return createSaveCoalescer({
      repository: {
        save: (request) => {
          requests.push({
            id: request.id,
            expectedRevision: request.expectedRevision,
            preset: request.design.presetId,
          });
          const scripted = outcomes.shift();
          const answer =
            scripted ?? (() => Promise.resolve(accepting(request)));
          if (!holdSaves) return answer();
          return new Promise<CoalescedSaveResult>((resolve, reject) => {
            pendingSaves.push(() => {
              answer().then(resolve, reject);
            });
          });
        },
      },
      getDesignId: () => designId,
      getGeneration: () => generation,
      getRevision: () => storeRevision,
      readCurrentRevision: () => {
        const answer = (): Promise<string> =>
          readCurrentRevisionFails
            ? Promise.reject(new Error("the read failed"))
            : Promise.resolve(currentRevisionOnServer);
        if (!holdReadCurrentRevision) return answer();
        return new Promise<string>((resolve, reject) => {
          pendingReads.push(() => {
            answer().then(resolve, reject);
          });
        });
      },
      onSaved: (result) => {
        saved.push(result);
        designId = result.id;
        storeRevision = result.revision;
      },
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
    });
  }

  function releaseHeldSaves(): void {
    for (const release of pendingSaves.splice(0)) release();
  }

  function releaseHeldReads(): void {
    for (const release of pendingReads.splice(0)) release();
  }

  /** Drives one design into `conflict`: a save that the server refuses as stale. */
  async function conflictOn(coalescer: SaveCoalescer): Promise<void> {
    scriptConflict();
    coalescer.scheduleSave(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);
  }

  it("states the revision the store holds on the first save of an identity", async () => {
    storeRevision = "7";
    const coalescer = buildCoalescer();

    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    expect(requests).toEqual([
      { id: DESIGN_ID, expectedRevision: "7", preset: "first" },
    ]);
  });

  it("states the revision the previous save produced, not the one captured when the edit was made", async () => {
    // The regression this is really about. A job scheduled while an earlier save for the same
    // design is still in flight would, if it carried its own snapshot, state the revision that save
    // is about to consume — and be refused as stale for no reason at all.
    const coalescer = buildCoalescer();
    holdSaves = true;

    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);
    // Scheduled while the first save is still in flight, so nothing has told the store anything.
    coalescer.scheduleSave(withPreset("second"));
    holdSaves = false;
    releaseHeldSaves();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

    expect(requests.map((request) => request.expectedRevision)).toEqual([
      FIRST_REVISION,
      "2",
    ]);
    expect(saved.map((result) => result.revision)).toEqual(["2", "3"]);
  });

  it("re-sends the same revision when a retryable failure is retried, having consumed none", async () => {
    const coalescer = buildCoalescer();
    scriptFailure();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests.map((request) => request.expectedRevision)).toEqual([
      FIRST_REVISION,
      FIRST_REVISION,
    ]);
  });

  it("reports a conflict and arms no retry against it", async () => {
    // A retry would re-send the same stale document for ever, at the backoff rate, and be refused
    // every time — worse than the bug it replaced.
    const coalescer = buildCoalescer();
    scriptConflict();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(statuses.at(-1)).toBe("conflict");
    expect(requests).toHaveLength(1);
  });

  it("refuses even to queue a later edit of a conflicted design, and says so", async () => {
    // Reported synchronously rather than silently dropped: accepting a local edit while declining
    // to attempt its write is how a customer comes to believe something was saved.
    const coalescer = buildCoalescer();
    scriptConflict();

    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);
    statuses.length = 0;
    coalescer.scheduleSave(withPreset("another-edit"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(statuses).toEqual(["conflict"]);
    expect(requests).toHaveLength(1);
  });

  it("overwrites by re-reading the current revision and saving against that one", async () => {
    // Not a blind write. A third writer that lands between the re-read and the save conflicts
    // again, rather than being discarded unseen — which is the defect this wave removed, one press
    // further away.
    const coalescer = buildCoalescer();
    scriptConflict();
    coalescer.scheduleSave(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);
    currentRevisionOnServer = "5";

    coalescer.overwriteConflict(withPreset("mine-after-conflict"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests[1]).toEqual({
      id: DESIGN_ID,
      expectedRevision: "5",
      preset: "mine-after-conflict",
    });
    expect(statuses.at(-1)).toBe("idle");
    expect(saved.at(-1)?.revision).toBe("6");
  });

  it("keeps writing normally after an overwrite, from the revision the overwrite produced", async () => {
    const coalescer = buildCoalescer();
    scriptConflict();
    coalescer.scheduleSave(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);
    currentRevisionOnServer = "5";
    coalescer.overwriteConflict(withPreset("overwritten"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    coalescer.scheduleSave(withPreset("after"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests.at(-1)).toEqual({
      id: DESIGN_ID,
      expectedRevision: "6",
      preset: "after",
    });
  });

  it("leaves the conflict standing when the re-read itself fails, so the choice is still offered", async () => {
    const coalescer = buildCoalescer();
    scriptConflict();
    coalescer.scheduleSave(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);
    readCurrentRevisionFails = true;

    coalescer.overwriteConflict(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(statuses.at(-1)).toBe("conflict");
    expect(requests).toHaveLength(1);
  });

  it("does nothing on an overwrite for a design that is not in conflict", async () => {
    // A stray press must not overwrite anything: the choice exists only where the customer was
    // actually offered it.
    const coalescer = buildCoalescer();

    coalescer.overwriteConflict(withPreset("stray"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests).toHaveLength(0);
    expect(statuses).toEqual([]);
  });

  it("does not overwrite a design the store has moved away from while the re-read was in flight", async () => {
    const coalescer = buildCoalescer();
    scriptConflict();
    coalescer.scheduleSave(withPreset("mine"));
    await vi.advanceTimersByTimeAsync(0);

    coalescer.overwriteConflict(withPreset("mine"));
    designId = "design-b";
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests).toHaveLength(1);
    // And the design it declined to overwrite is left exactly as conflicted as it was, so the
    // choice is still on offer when the customer returns to it.
    expect(statuses.at(-1)).toBe("conflict");
    designId = DESIGN_ID;
    coalescer.scheduleSave(withPreset("back-on-a"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);
    expect(requests).toHaveLength(1);
  });

  it("writes the edit made while the overwrite's re-read was still out, and nothing stale", async () => {
    // Review finding F1. The conflict used to be cleared before the re-read was awaited, which
    // unblocked ordinary saves for the length of a round trip: an edit in that window went out
    // against the revision that had just been refused, conflicted, and re-armed the refusal — so
    // the overwrite itself was then refused and sent nothing. A pressed destructive-choice control
    // that silently does nothing is worse than one that refuses.
    const coalescer = buildCoalescer();
    await conflictOn(coalescer);
    currentRevisionOnServer = "5";
    holdReadCurrentRevision = true;

    coalescer.overwriteConflict(withPreset("pressed"));
    // The customer keeps editing while the round trip is out — which the panel invites, since a
    // conflict deliberately does not lock it.
    coalescer.scheduleSave(withPreset("edited-mid-reread"));
    holdReadCurrentRevision = false;
    releaseHeldReads();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    // Exactly one further request, and it is the overwrite: the newest design, at the revision the
    // re-read reported. Nothing went out against the stale one.
    expect(requests).toEqual([
      { id: DESIGN_ID, expectedRevision: FIRST_REVISION, preset: "mine" },
      { id: DESIGN_ID, expectedRevision: "5", preset: "edited-mid-reread" },
    ]);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("ignores a second press while the first overwrite's re-read is still out", async () => {
    // Two re-reads would report the same revision and queue the same write twice, the second of
    // which conflicts against the first.
    const coalescer = buildCoalescer();
    await conflictOn(coalescer);
    holdReadCurrentRevision = true;

    coalescer.overwriteConflict(withPreset("first-press"));
    coalescer.overwriteConflict(withPreset("second-press"));
    holdReadCurrentRevision = false;
    releaseHeldReads();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.preset).toBe("first-press");
  });

  it("adopts the store's revision when a hydrate replaces the generation of a queue in backoff", async () => {
    // Review finding F4. A queue sitting in retry backoff survives a hydrate away and back, and was
    // seeded with its revision only at creation. Another tab saving meanwhile made the store's
    // freshly loaded revision the true one, while the queue still stated the old one — a spurious
    // conflict on a design nothing else had touched.
    const coalescer = buildCoalescer();
    scriptFailure();
    coalescer.scheduleSave(withPreset("first"));
    await vi.advanceTimersByTimeAsync(0);

    // The customer leaves and returns: a new load generation, and the load reported revision 9.
    generation = 1;
    storeRevision = "9";
    coalescer.scheduleSave(withPreset("after-reload"));
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(requests.at(-1)).toEqual({
      id: DESIGN_ID,
      expectedRevision: "9",
      preset: "after-reload",
    });
  });
});
