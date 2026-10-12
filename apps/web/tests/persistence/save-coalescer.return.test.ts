// A design shown again by a fresh load while its own write waits for the limit on saves is given that write and its
// wait. The write stays the one write on the one timer, an edit made after the return joins it, and its outcome is
// reported to the generation that now shows the design. Every wait runs on fake timers.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  SaveLimitReachedError,
} from "../../src/persistence/design-request-errors";
import { createSaveCoalescer } from "../../src/persistence/save-coalescer";
import type {
  CoalescedSaveRequest,
  CoalescedSaveResult,
  SaveCoalescer,
  SaveStatus,
} from "../../src/persistence/save-coalescer";

const MILLISECONDS_PER_SECOND = 1000;
const DESIGN_A = "design-a";
const DESIGN_B = "design-b";
const FIRST_REVISION = "1";
const WAIT_SECONDS = 30;

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

interface Reported {
  readonly status: SaveStatus;
  readonly generation: number;
}

describe("a design shown again while its write waits", () => {
  let sent: { preset: string | null; revision: string | null }[];
  let reported: Reported[];
  let savedInGenerations: number[];
  let outcomes: (() => Promise<CoalescedSaveResult>)[];
  let shownDesignId: DesignId | null;
  let generation: number;
  let coalescer: SaveCoalescer;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    reported = [];
    savedInGenerations = [];
    outcomes = [];
    shownDesignId = DESIGN_A;
    generation = 0;
    coalescer = createSaveCoalescer({
      repository: {
        save: (request: CoalescedSaveRequest) => {
          sent.push({
            preset: request.design.presetId,
            revision: request.expectedRevision,
          });
          const scripted = outcomes.shift();
          if (scripted !== undefined) return scripted();
          return Promise.resolve({
            id: request.id ?? "minted",
            revision: String(Number(request.expectedRevision ?? "0") + 1),
          });
        },
      },
      getDesignId: () => shownDesignId,
      getGeneration: () => generation,
      getRevision: () => FIRST_REVISION,
      readCurrentRevision: () => Promise.resolve("9"),
      onSaved: (_saved, savedGeneration) => {
        savedInGenerations.push(savedGeneration);
      },
      onSaveStatusChange: (status, statusGeneration) => {
        reported.push({ status, generation: statusGeneration });
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function refuseTheFirstEdit(preset = "edit"): Promise<number> {
    outcomes.push(() =>
      Promise.reject(
        new SaveLimitReachedError("Saving a design", WAIT_SECONDS),
      ),
    );
    const refusedAtMs = Date.now();
    coalescer.scheduleSave(withPreset(preset));
    await vi.advanceTimersByTimeAsync(0);
    return refusedAtMs;
  }

  /** What leaving for another design and coming back to this one does to the seam: two fresh loads. */
  function leaveAndReturn(): void {
    generation += 1;
    shownDesignId = DESIGN_B;
    generation += 1;
    shownDesignId = DESIGN_A;
  }

  it("gives the load the whole waiting design, the revision it is conditional on and the time it goes", async () => {
    const refusedAtMs = await refuseTheFirstEdit("waiting-design");
    leaveAndReturn();

    const waiting = coalescer.adoptWaitingWrite(DESIGN_A);

    expect(waiting).toEqual({
      design: withPreset("waiting-design"),
      expectedRevision: FIRST_REVISION,
      resumesAtMs: refusedAtMs + WAIT_SECONDS * MILLISECONDS_PER_SECOND,
    });
  });

  it("keeps the one write on the one timer, sending nothing before the stated time and one write at it", async () => {
    const refusedAtMs = await refuseTheFirstEdit("waiting-design");
    leaveAndReturn();
    coalescer.adoptWaitingWrite(DESIGN_A);

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(
      WAIT_SECONDS * MILLISECONDS_PER_SECOND - 1,
    );
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(sent).toEqual([
      { preset: "waiting-design", revision: FIRST_REVISION },
      { preset: "waiting-design", revision: FIRST_REVISION },
    ]);
    expect(Date.now()).toBe(
      refusedAtMs + WAIT_SECONDS * MILLISECONDS_PER_SECOND,
    );
  });

  it("reports the write's outcome to the generation that shows the design now, not the one that left", async () => {
    await refuseTheFirstEdit();
    reported.length = 0;
    leaveAndReturn();
    coalescer.adoptWaitingWrite(DESIGN_A);

    await vi.advanceTimersByTimeAsync(WAIT_SECONDS * MILLISECONDS_PER_SECOND);

    expect(reported).toEqual([
      { status: "saving", generation: 2 },
      { status: "idle", generation: 2 },
    ]);
    expect(savedInGenerations).toEqual([2]);
  });

  it("lets an edit made after the return join the one write, which then holds the later edit", async () => {
    await refuseTheFirstEdit("first");
    leaveAndReturn();
    coalescer.adoptWaitingWrite(DESIGN_A);

    coalescer.scheduleSave(withPreset("later"));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(WAIT_SECONDS * MILLISECONDS_PER_SECOND);

    expect(sent.map(({ preset }) => preset)).toEqual(["first", "later"]);
    expect(sent.at(-1)?.revision).toBe(FIRST_REVISION);
  });

  it("is the same answer on a second return, and still one write", async () => {
    await refuseTheFirstEdit();
    leaveAndReturn();
    const first = coalescer.adoptWaitingWrite(DESIGN_A);
    leaveAndReturn();

    const second = coalescer.adoptWaitingWrite(DESIGN_A);

    expect(second).toEqual(first);
    await vi.advanceTimersByTimeAsync(WAIT_SECONDS * MILLISECONDS_PER_SECOND);
    expect(sent).toHaveLength(2);
    expect(savedInGenerations).toEqual([4]);
  });

  it("answers nothing for a design with no write waiting, and for another design's wait", async () => {
    await refuseTheFirstEdit();

    expect(coalescer.adoptWaitingWrite(DESIGN_B)).toBeUndefined();
    expect(coalescer.adoptWaitingWrite("never-seen")).toBeUndefined();
  });

  it("gives the load a failure's backoff write too, with no time, since the load's copy is not newer than it", async () => {
    outcomes.push(() =>
      Promise.reject(new DesignRequestFailedError("Saving a design", "down")),
    );
    coalescer.scheduleSave(withPreset("edit"));
    await vi.advanceTimersByTimeAsync(0);

    expect(coalescer.adoptWaitingWrite(DESIGN_A)).toEqual({
      design: withPreset("edit"),
      expectedRevision: FIRST_REVISION,
      resumesAtMs: null,
    });
  });

  it("answers nothing once the wait has ended and the write has landed", async () => {
    await refuseTheFirstEdit();
    await vi.advanceTimersByTimeAsync(
      WAIT_SECONDS * MILLISECONDS_PER_SECOND + 1000,
    );

    expect(coalescer.adoptWaitingWrite(DESIGN_A)).toBeUndefined();
  });

  it("is taken once the write is refused a second time, with the new time", async () => {
    await refuseTheFirstEdit();
    outcomes.push(() =>
      Promise.reject(new SaveLimitReachedError("Saving a design", 45)),
    );
    await vi.advanceTimersByTimeAsync(WAIT_SECONDS * MILLISECONDS_PER_SECOND);
    const secondRefusalAtMs = Date.now();
    leaveAndReturn();

    const waiting = coalescer.adoptWaitingWrite(DESIGN_A);

    expect(waiting?.resumesAtMs).toBe(
      secondRefusalAtMs + 45 * MILLISECONDS_PER_SECOND,
    );
  });
});
