// A design shown again by a fresh load while the writer holds a write for it that is not waiting for the limit: a
// failure's backoff, and a write sent and not yet answered. The load is given the write, which stays the one write on
// the one timer, never goes sooner, and reports its outcome to the generation that shows the design when it arrives.
// Every wait runs on fake timers.
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

const DESIGN_A = "design-a";
const DESIGN_B = "design-b";
const FIRST_REVISION = "1";
const BACKOFF_BASE_MS = 500;
const MIN_SAVE_INTERVAL_MS = 1000;
const BACKOFF_SECOND_STEP_MS = 1000;
const BACKOFF_THIRD_STEP_MS = 2000;

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

interface Reported {
  readonly status: SaveStatus;
  readonly generation: number;
  readonly resumesAtMs: number | undefined;
}

describe("a design shown again while the writer holds a write that is not waiting for the limit", () => {
  let sent: { preset: string | null; revision: string | null }[];
  let reported: Reported[];
  let savedInGenerations: number[];
  let outcomes: (() => Promise<CoalescedSaveResult>)[];
  let shownDesignId: DesignId | null;
  let generation: number;
  let storeRevision: string;
  let coalescer: SaveCoalescer;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    reported = [];
    savedInGenerations = [];
    outcomes = [];
    shownDesignId = DESIGN_A;
    generation = 0;
    storeRevision = FIRST_REVISION;
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
      getRevision: () => storeRevision,
      readCurrentRevision: () => Promise.resolve("9"),
      onSaved: (saved, savedGeneration) => {
        storeRevision = saved.revision;
        savedInGenerations.push(savedGeneration);
      },
      onSaveStatusChange: (status, statusGeneration, resumesAtMs) => {
        reported.push({ status, generation: statusGeneration, resumesAtMs });
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const down = () =>
    Promise.reject<CoalescedSaveResult>(
      new DesignRequestFailedError("Saving a design", "down"),
    );

  /** What leaving for another design and coming back to this one does to the seam: two fresh loads. */
  function leaveAndReturn(): void {
    generation += 1;
    shownDesignId = DESIGN_B;
    generation += 1;
    shownDesignId = DESIGN_A;
  }

  /** The design the screen shows after a return: the held write's, else the page's kept copy. */
  function screenAfterReturn(pageCopy: Design): Design {
    return coalescer.adoptWaitingWrite(DESIGN_A)?.design ?? pageCopy;
  }

  function editShown(shown: Design, edit: string): Design {
    return { ...shown, presetId: `${shown.presetId ?? ""}+${edit}` };
  }

  describe("backing off after a failure", () => {
    async function failTwice(): Promise<void> {
      outcomes.push(down, down);
      coalescer.scheduleSave(withPreset("edit"));
      await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    }

    it("sends nothing sooner than the backoff already armed, and counts the return as no failure", async () => {
      await failTwice();
      expect(sent).toHaveLength(2);
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);
      outcomes.push(down);

      await vi.advanceTimersByTimeAsync(BACKOFF_SECOND_STEP_MS - 1);
      expect(sent).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(BACKOFF_THIRD_STEP_MS - 1);
      expect(sent).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(4);
    });

    it("keeps the one timer", async () => {
      await failTwice();
      leaveAndReturn();

      coalescer.adoptWaitingWrite(DESIGN_A);

      expect(vi.getTimerCount()).toBe(1);
    });

    it("reports the write's outcome to the generation that shows the design now", async () => {
      outcomes.push(down);
      coalescer.scheduleSave(withPreset("edit"));
      await vi.advanceTimersByTimeAsync(0);
      reported.length = 0;
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);

      await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);

      expect(
        reported.map(({ status, generation: to }) => [status, to]),
      ).toEqual([
        ["saving", 2],
        ["idle", 2],
      ]);
      expect(savedInGenerations).toEqual([2]);
    });

    it("reports a failure after the return to the generation that shows the design now, as a backoff with no time", async () => {
      await failTwice();
      reported.length = 0;
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);
      outcomes.push(down);

      await vi.advanceTimersByTimeAsync(BACKOFF_SECOND_STEP_MS);

      expect(reported).toEqual([
        { status: "saving", generation: 2, resumesAtMs: undefined },
        { status: "error", generation: 2, resumesAtMs: undefined },
      ]);
    });

    it("writes the earlier edit and the one made after the return in one request, never the page's copy over it", async () => {
      outcomes.push(down);
      coalescer.scheduleSave(withPreset("edit"));
      await vi.advanceTimersByTimeAsync(0);
      leaveAndReturn();
      const shown = screenAfterReturn(withPreset("kept-page"));

      coalescer.scheduleSave(editShown(shown, "later"));
      await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);

      expect(sent).toEqual([
        { preset: "edit", revision: FIRST_REVISION },
        { preset: "edit+later", revision: FIRST_REVISION },
      ]);
    });
  });

  describe("sent and not yet answered", () => {
    let answerHeldWrite: (result: CoalescedSaveResult) => void;
    let failHeldWrite: () => void;

    /** The first request stays out until the test answers it. */
    async function sendAndHold(preset = "edit"): Promise<void> {
      outcomes.push(
        () =>
          new Promise<CoalescedSaveResult>((resolve, reject) => {
            answerHeldWrite = resolve;
            failHeldWrite = () => {
              reject(new DesignRequestFailedError("Saving a design", "down"));
            };
          }),
      );
      coalescer.scheduleSave(withPreset(preset));
      await vi.advanceTimersByTimeAsync(0);
    }

    const stored = (revision: string): CoalescedSaveResult => ({
      id: DESIGN_A,
      revision,
    });

    it("gives the load the design being written, marked as sent, at the revision the request states", async () => {
      await sendAndHold("being-written");
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toEqual({
        design: withPreset("being-written"),
        expectedRevision: FIRST_REVISION,
        resumesAtMs: null,
        heldAs: "sent",
      });
    });

    it("gives the load the newest design when an edit was made while the request was out", async () => {
      await sendAndHold("being-written");
      coalescer.scheduleSave(withPreset("made-meanwhile"));
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)?.design).toEqual(
        withPreset("made-meanwhile"),
      );
    });

    it("reports the answer to the generation that shows the design when it arrives, not the one that sent it", async () => {
      await sendAndHold();
      reported.length = 0;
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);

      answerHeldWrite(stored("2"));
      await vi.advanceTimersByTimeAsync(0);

      expect(
        reported.map(({ status, generation: to }) => [status, to]),
      ).toEqual([["idle", 2]]);
      expect(savedInGenerations).toEqual([2]);
    });

    it("reports a failed answer to that generation and sends the same edit again", async () => {
      await sendAndHold();
      reported.length = 0;
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);

      failHeldWrite();
      await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);

      expect(
        reported.map(({ status, generation: to }) => [status, to]),
      ).toEqual([
        ["error", 2],
        ["saving", 2],
        ["idle", 2],
      ]);
      expect(sent).toEqual([
        { preset: "edit", revision: FIRST_REVISION },
        { preset: "edit", revision: FIRST_REVISION },
      ]);
    });

    it("builds an edit made after the return on the written design, so the earlier edit is not written over", async () => {
      await sendAndHold();
      leaveAndReturn();
      const shown = screenAfterReturn(withPreset("kept-page"));

      coalescer.scheduleSave(editShown(shown, "later"));
      answerHeldWrite(stored("2"));
      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

      expect(sent).toEqual([
        { preset: "edit", revision: FIRST_REVISION },
        { preset: "edit+later", revision: "2" },
      ]);
    });

    it("sends one request while the first is out, however often the design is returned to", async () => {
      await sendAndHold();
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);

      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 10);

      expect(sent).toHaveLength(1);
    });

    it("answers nothing once the answer has landed", async () => {
      await sendAndHold();
      answerHeldWrite(stored("2"));
      await vi.advanceTimersByTimeAsync(0);

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toBeUndefined();
    });
  });

  describe("ready and not yet sent", () => {
    let holdOtherDesign: (result: CoalescedSaveResult) => void;

    /** The first edit is stored, and a second one made inside the interval waits for it to pass. */
    async function storeOneAndQueueAnother(): Promise<number> {
      coalescer.scheduleSave(withPreset("first"));
      await vi.advanceTimersByTimeAsync(0);
      const storedAtMs = Date.now();
      coalescer.scheduleSave(withPreset("queued"));
      return storedAtMs;
    }

    /** Another design's request holds the one slot while this design's edit waits behind it. */
    async function queueBehindAnotherDesignsRequest(): Promise<void> {
      shownDesignId = DESIGN_B;
      outcomes.push(
        () =>
          new Promise<CoalescedSaveResult>((resolve) => {
            holdOtherDesign = resolve;
          }),
      );
      coalescer.scheduleSave(withPreset("b-edit"));
      await vi.advanceTimersByTimeAsync(0);
      shownDesignId = DESIGN_A;
      coalescer.scheduleSave(withPreset("queued"));
    }

    it("gives the load the queued design, marked ready, at the revision it will state", async () => {
      await storeOneAndQueueAnother();
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toEqual({
        design: withPreset("queued"),
        expectedRevision: "2",
        resumesAtMs: null,
        heldAs: "ready",
      });
    });

    it("sends it once, when the interval ends and not before, whether or not the design was returned to", async () => {
      const storedAtMs = await storeOneAndQueueAnother();
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);
      coalescer.adoptWaitingWrite(DESIGN_A);

      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS - 1);
      expect(sent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);

      expect(sent).toEqual([
        { preset: "first", revision: FIRST_REVISION },
        { preset: "queued", revision: "2" },
      ]);
      expect(Date.now()).toBe(storedAtMs + MIN_SAVE_INTERVAL_MS);
    });

    it("reports its answer to the generation that shows the design now", async () => {
      await storeOneAndQueueAnother();
      reported.length = 0;
      savedInGenerations.length = 0;
      leaveAndReturn();
      coalescer.adoptWaitingWrite(DESIGN_A);

      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

      expect(
        reported.map(({ status, generation: to }) => [status, to]),
      ).toEqual([
        ["saving", 2],
        ["idle", 2],
      ]);
      expect(savedInGenerations).toEqual([2]);
    });

    it("holds an edit made after the return and the queued one in that one request", async () => {
      await storeOneAndQueueAnother();
      leaveAndReturn();
      const shown = screenAfterReturn(withPreset("kept-page"));

      coalescer.scheduleSave(editShown(shown, "later"));
      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

      expect(sent).toEqual([
        { preset: "first", revision: FIRST_REVISION },
        { preset: "queued+later", revision: "2" },
      ]);
    });

    /** This design's write failed or was refused, its wait ended, and another design's request holds the slot. */
    async function endWaitBehindAnotherDesignsRequest(
      refusal: () => Promise<CoalescedSaveResult>,
      waitMs: number,
    ): Promise<number> {
      outcomes.push(refusal);
      coalescer.scheduleSave(withPreset("queued"));
      await vi.advanceTimersByTimeAsync(0);
      const refusedAtMs = Date.now();
      shownDesignId = DESIGN_B;
      outcomes.push(
        () =>
          new Promise<CoalescedSaveResult>((resolve) => {
            holdOtherDesign = resolve;
          }),
      );
      coalescer.scheduleSave(withPreset("b-edit"));
      shownDesignId = DESIGN_A;
      await vi.advanceTimersByTimeAsync(waitMs);
      return refusedAtMs;
    }

    it("hands a write whose save failed over as failed with no time, once its backoff has ended behind another design's request", async () => {
      await endWaitBehindAnotherDesignsRequest(down, BACKOFF_BASE_MS);
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toEqual({
        design: withPreset("queued"),
        expectedRevision: FIRST_REVISION,
        resumesAtMs: null,
      });
    });

    it("hands a write the limit refused over with the time it was told, once that time has passed behind another design's request", async () => {
      const refusedAtMs = await endWaitBehindAnotherDesignsRequest(
        () => Promise.reject(new SaveLimitReachedError("Saving a design", 1)),
        MIN_SAVE_INTERVAL_MS,
      );
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toEqual({
        design: withPreset("queued"),
        expectedRevision: FIRST_REVISION,
        resumesAtMs: refusedAtMs + MIN_SAVE_INTERVAL_MS,
      });
    });

    it("hands an edit made while the failed write's retry was out over as ready once that retry is stored, since the failure is no longer the last thing said", async () => {
      await endWaitBehindAnotherDesignsRequest(down, BACKOFF_BASE_MS);
      let storeRetry: (result: CoalescedSaveResult) => void = () => undefined;
      outcomes.push(
        () =>
          new Promise<CoalescedSaveResult>((resolve) => {
            storeRetry = resolve;
          }),
      );
      holdOtherDesign({ id: DESIGN_B, revision: "2" });
      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);
      shownDesignId = DESIGN_A;
      coalescer.scheduleSave(withPreset("after-the-retry"));
      storeRetry({ id: DESIGN_A, revision: "2" });
      await vi.advanceTimersByTimeAsync(0);
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toMatchObject({
        design: withPreset("after-the-retry"),
        heldAs: "ready",
      });
    });

    it("gives the load a design queued behind another design's request, and sends it once after that request", async () => {
      await queueBehindAnotherDesignsRequest();
      leaveAndReturn();

      expect(coalescer.adoptWaitingWrite(DESIGN_A)).toMatchObject({
        design: withPreset("queued"),
        resumesAtMs: null,
        heldAs: "ready",
      });
      holdOtherDesign({ id: DESIGN_B, revision: "2" });
      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

      expect(sent.map(({ preset }) => preset)).toEqual(["b-edit", "queued"]);
      expect(savedInGenerations).toEqual([0, 2]);
    });
  });
});
