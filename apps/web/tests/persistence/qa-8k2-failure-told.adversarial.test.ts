// The failure the writer remembers having said for the write it holds, driven on the writer alone with a fake
// repository and clock: the one path the application's own events do not take. A load that does not ask for the held
// write and then edits replaces that write with its own (`adoptNewerGeneration`), and the write it now holds was never
// said to have failed. The session store always asks first, so this is reached here and by nothing in the application.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  SaveLimitReachedError,
} from "../../src/persistence/design-request-errors";
import { createSaveCoalescer } from "../../src/persistence/save-coalescer";
import type {
  CoalescedSaveResult,
  SaveCoalescer,
  SaveStatus,
} from "../../src/persistence/save-coalescer";

const DESIGN_A = "design-a";
const DESIGN_B = "design-b";
const LIMIT_WAIT_SECONDS = 30;

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

interface Said {
  readonly status: SaveStatus;
  readonly generation: number;
}

let said: Said[];
let outcomes: (() => Promise<CoalescedSaveResult>)[];
let shownDesignId: DesignId;
let generation: number;
let coalescer: SaveCoalescer;

const neverAnswered = () => new Promise<CoalescedSaveResult>(() => undefined);

function load(designId: DesignId): void {
  generation += 1;
  shownDesignId = designId;
}

/** Design A's save answered with `failure`, and design B's save then out and unanswered, holding the one slot. */
async function failAThenHoldTheSlotWithB(failure: Error): Promise<void> {
  outcomes.push(() => Promise.reject(failure), neverAnswered);
  coalescer.scheduleSave(withPreset("a-first"));
  await vi.advanceTimersByTimeAsync(0);
  load(DESIGN_B);
  coalescer.scheduleSave(withPreset("b-first"));
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  said = [];
  outcomes = [];
  shownDesignId = DESIGN_A;
  generation = 0;
  coalescer = createSaveCoalescer({
    repository: {
      save: (request) =>
        outcomes.shift()?.() ??
        Promise.resolve({ id: request.id ?? "minted", revision: "2" }),
    },
    getDesignId: () => shownDesignId,
    getGeneration: () => generation,
    getRevision: () => "1",
    readCurrentRevision: () => Promise.resolve("1"),
    onSaved: () => undefined,
    onSaveStatusChange: (status, saidTo) => {
      said.push({ status, generation: saidTo });
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a write that replaced a failed one without being handed it", () => {
  it("is handed to the next load as ready, since no failure was ever said for it", async () => {
    await failAThenHoldTheSlotWithB(
      new DesignRequestFailedError("Saving a design", "HTTP status 500"),
    );
    load(DESIGN_A);
    coalescer.scheduleSave(withPreset("a-second"));
    const saidToTheLoadThatEdited = said.filter(
      (entry) => entry.generation === generation,
    );
    load(DESIGN_B);
    load(DESIGN_A);

    const held = coalescer.adoptWaitingWrite(DESIGN_A);

    expect(saidToTheLoadThatEdited).toEqual([]);
    expect(held?.design.presetId).toBe("a-second");
    expect(held).toMatchObject({ heldAs: "ready", resumesAtMs: null });
  });

  it("is handed over with the limit's time while the limit's wait still stands, as that load was told", async () => {
    await failAThenHoldTheSlotWithB(
      new SaveLimitReachedError("Saving a design", LIMIT_WAIT_SECONDS),
    );
    load(DESIGN_A);
    coalescer.scheduleSave(withPreset("a-second"));
    const saidToTheLoadThatEdited = said.filter(
      (entry) => entry.generation === generation,
    );
    load(DESIGN_B);
    load(DESIGN_A);

    const held = coalescer.adoptWaitingWrite(DESIGN_A);

    expect(saidToTheLoadThatEdited.map((entry) => entry.status)).toEqual([
      "error",
    ]);
    expect(held?.design.presetId).toBe("a-second");
    expect(held?.heldAs).toBeUndefined();
    expect(typeof held?.resumesAtMs).toBe("number");
  });
});
