// The one waiting write of a save the limit refused, over sequences its own tests do not walk: what a press, a
// conflict, a lost credential or a second design does to it, and that whatever was edited last is what is sent,
// once, when the wait ends. Every wait runs on fake timers.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  SaveLimitReachedError,
  WriteConflictError,
  WriteNotAuthorizedError,
} from "../../src/persistence/design-request-errors";
import { createSaveCoalescer } from "../../src/persistence/save-coalescer";
import type {
  CoalescedSaveRequest,
  CoalescedSaveResult,
  SaveCoalescer,
  SaveStatus,
} from "../../src/persistence/save-coalescer";

const SECOND_MS = 1000;
const A_DESIGN = "qa-design-a";
const ANOTHER_DESIGN = "qa-design-b";
const A_LONG_WHILE_MS = 3 * 3_600_000;

type Answer = () => Promise<CoalescedSaveResult>;

function refusedFor(seconds: number): Answer {
  return () =>
    Promise.reject(new SaveLimitReachedError("Saving a design", seconds));
}

function edit(name: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId: name };
}

interface Sent {
  readonly atMs: number;
  readonly design: DesignId | null;
  readonly edit: string | null;
  readonly expectedRevision: string | null;
}

let sent: Sent[];
let statuses: [SaveStatus, number | undefined][];
let answers: Answer[];
let revisionReads: number;
let currentDesign: DesignId;
let startedAtMs: number;

function coalescer(): SaveCoalescer {
  return createSaveCoalescer({
    repository: {
      save: (request: CoalescedSaveRequest) => {
        sent.push({
          atMs: Date.now() - startedAtMs,
          design: request.id,
          edit: request.design.presetId,
          expectedRevision: request.expectedRevision,
        });
        const scripted = answers.shift();
        if (scripted !== undefined) return scripted();
        return Promise.resolve({
          id: request.id ?? "qa-minted",
          revision: String(Number(request.expectedRevision ?? "0") + 1),
        });
      },
    },
    getDesignId: () => currentDesign,
    getGeneration: () => 0,
    getRevision: () => "1",
    readCurrentRevision: () => {
      revisionReads += 1;
      return Promise.resolve("7");
    },
    onSaved: () => undefined,
    onSaveStatusChange: (status, _generation, resumesAtMs) => {
      statuses.push([status, resumesAtMs]);
    },
  });
}

async function pass(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  statuses = [];
  answers = [];
  revisionReads = 0;
  currentDesign = A_DESIGN;
  startedAtMs = Date.now();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a press of the conflict's overwrite while a write waits for the limit", () => {
  it("sends nothing and reads nothing, since the design is waiting and not in conflict", async () => {
    answers.push(refusedFor(600));
    const saves = coalescer();
    saves.scheduleSave(edit("first"));
    await pass(0);

    saves.overwriteConflict(edit("pressed"));
    await pass(599 * SECOND_MS);

    expect(sent).toHaveLength(1);
    expect(revisionReads).toBe(0);
  });
});

describe("the waiting write, sent when its wait ends", () => {
  it("stands as a conflict when the stored design moved meanwhile, and is not sent again by itself", async () => {
    answers.push(refusedFor(30), () =>
      Promise.reject(new WriteConflictError("Saving a design", 409)),
    );
    const saves = coalescer();
    saves.scheduleSave(edit("first"));
    await pass(30 * SECOND_MS);

    await pass(A_LONG_WHILE_MS);

    expect(sent.map(({ atMs }) => atMs)).toEqual([0, 30 * SECOND_MS]);
    expect(statuses.at(-1)).toEqual(["conflict", undefined]);
  });

  it("is written over the stored design by one read and one write when the customer then chooses to", async () => {
    answers.push(refusedFor(30), () =>
      Promise.reject(new WriteConflictError("Saving a design", 409)),
    );
    const saves = coalescer();
    saves.scheduleSave(edit("first"));
    await pass(30 * SECOND_MS);

    saves.overwriteConflict(edit("chosen"));
    await pass(A_LONG_WHILE_MS);

    expect(revisionReads).toBe(1);
    expect(sent.at(-1)).toMatchObject({
      edit: "chosen",
      expectedRevision: "7",
    });
    expect(sent).toHaveLength(3);
    expect(statuses.at(-1)).toEqual(["idle", undefined]);
  });

  it("stops for good when this browser no longer holds the credential", async () => {
    answers.push(refusedFor(30), () =>
      Promise.reject(new WriteNotAuthorizedError("Saving a design", 403)),
    );
    const saves = coalescer();
    saves.scheduleSave(edit("first"));

    await pass(A_LONG_WHILE_MS);

    expect(sent).toHaveLength(2);
    expect(statuses.at(-1)).toEqual(["unauthorized", undefined]);
  });

  it("says idle with no time once it is stored, and the next edit is written without that wait", async () => {
    answers.push(refusedFor(120));
    const saves = coalescer();
    saves.scheduleSave(edit("first"));
    await pass(120 * SECOND_MS);
    const afterTheWait = statuses.at(-1);

    const statusesAtTheWaitsEnd = statuses.length;
    saves.scheduleSave(edit("next"));
    await pass(2 * SECOND_MS);

    expect(afterTheWait).toEqual(["idle", undefined]);
    expect(
      statuses
        .slice(statusesAtTheWaitsEnd)
        .filter(([, time]) => time !== undefined),
    ).toEqual([]);
    expect(sent.map(({ edit: name }) => name)).toEqual([
      "first",
      "first",
      "next",
    ]);
    expect((sent[2]?.atMs ?? 0) - (sent[1]?.atMs ?? 0)).toBeLessThanOrEqual(
      2 * SECOND_MS,
    );
  });
});

describe("a plain failure of the write that was sent when its wait ended", () => {
  it("is told as a failure with no time, and so is an edit made while its retry is armed", async () => {
    answers.push(
      refusedFor(30),
      () =>
        Promise.reject(
          new DesignRequestFailedError("Saving a design", "the network"),
        ),
      () =>
        Promise.reject(
          new DesignRequestFailedError("Saving a design", "the network"),
        ),
      () =>
        Promise.reject(
          new DesignRequestFailedError("Saving a design", "the network"),
        ),
    );
    const saves = coalescer();
    saves.scheduleSave(edit("first"));
    await pass(30 * SECOND_MS);
    const statusesAtTheFailure = statuses.length;

    saves.scheduleSave(edit("after the failure"));
    await pass(100);

    const told = statuses.slice(statusesAtTheFailure - 1);
    expect(told.map(([status]) => status)).toContain("error");
    expect(told.filter(([, time]) => time !== undefined)).toEqual([]);
  });
});

describe("an edit made while the save that will be refused is still on its way", () => {
  const ANSWER_TAKES_MS = 500;

  function refusedAfterAWhile(seconds: number): Answer {
    return () =>
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new SaveLimitReachedError("Saving a design", seconds));
        }, ANSWER_TAKES_MS);
      });
  }

  it("is the write that waits and is sent, not the older one the refusal answered", async () => {
    answers.push(refusedAfterAWhile(60));
    const saves = coalescer();
    saves.scheduleSave(edit("sent and refused"));
    await pass(200);
    saves.scheduleSave(edit("typed while it was on its way"));
    await pass(ANSWER_TAKES_MS - 200);

    await pass(A_LONG_WHILE_MS);

    expect(sent.map(({ atMs, edit: name }) => [atMs, name])).toEqual([
      [0, "sent and refused"],
      [ANSWER_TAKES_MS + 60 * SECOND_MS, "typed while it was on its way"],
    ]);
  });
});

describe("a write refused again when its wait ends", () => {
  it("waits the second stated time from the second answer, and stores the last edit made in either wait", async () => {
    answers.push(refusedFor(100), refusedFor(50));
    const saves = coalescer();
    saves.scheduleSave(edit("first"));
    await pass(40 * SECOND_MS);
    saves.scheduleSave(edit("in the first wait"));
    await pass(60 * SECOND_MS);
    saves.scheduleSave(edit("in the second wait"));
    await pass(49 * SECOND_MS + 999);
    const sentBeforeTheSecondWaitEnded = sent.length;

    await pass(1);

    expect(sentBeforeTheSecondWaitEnded).toBe(2);
    expect(sent.map(({ atMs, edit: name }) => [atMs, name])).toEqual([
      [0, "first"],
      [100 * SECOND_MS, "in the first wait"],
      [150 * SECOND_MS, "in the second wait"],
    ]);
    expect(
      new Set(sent.map(({ expectedRevision }) => expectedRevision)),
    ).toEqual(new Set(["1"]));
  });
});

describe("two designs, each with a write that waits", () => {
  it("sends each once at its own time, the shorter wait first", async () => {
    answers.push(refusedFor(300), refusedFor(60));
    const saves = coalescer();
    saves.scheduleSave(edit("of a"));
    await pass(0);
    currentDesign = ANOTHER_DESIGN;
    saves.scheduleSave(edit("of b"));
    await pass(2 * SECOND_MS);
    const firstAttempts = sent.length;

    await pass(A_LONG_WHILE_MS);

    const resent = sent.slice(firstAttempts);
    expect(firstAttempts).toBe(2);
    expect(resent.map(({ design }) => design)).toEqual([
      ANOTHER_DESIGN,
      A_DESIGN,
    ]);
    expect(resent[1]?.atMs).toBe(300 * SECOND_MS);
    expect(sent).toHaveLength(4);
  });
});

describe("any number of edits at any moments of a wait", () => {
  const WAIT_SECONDS = 900;

  it("sends nothing before the wait ends and then one write holding the last edit, over many sequences", async () => {
    let seed = 20261010;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const wrong: string[] = [];
    let editsMade = 0;
    for (let sequence = 0; sequence < 40; sequence += 1) {
      sent = [];
      answers = [refusedFor(WAIT_SECONDS)];
      startedAtMs = Date.now();
      currentDesign = `qa-design-${String(sequence)}`;
      const saves = coalescer();
      saves.scheduleSave(edit("first"));
      await pass(0);
      const edits = 1 + Math.floor(random() * 12);
      let elapsedMs = 0;
      let last = "first";
      for (let made = 0; made < edits; made += 1) {
        const stepMs = Math.floor(random() * 60 * SECOND_MS);
        if (elapsedMs + stepMs >= WAIT_SECONDS * SECOND_MS) break;
        await pass(stepMs);
        elapsedMs += stepMs;
        last = `edit ${String(made)}`;
        saves.scheduleSave(edit(last));
        editsMade += 1;
      }
      await pass(WAIT_SECONDS * SECOND_MS - elapsedMs - 1);
      const sentDuringTheWait = sent.length;
      await pass(A_LONG_WHILE_MS);
      const isRight =
        sentDuringTheWait === 1 &&
        sent.length === 2 &&
        sent[1]?.edit === last &&
        sent[1].atMs === WAIT_SECONDS * SECOND_MS;
      if (!isRight) wrong.push(`sequence ${String(sequence)}`);
    }

    expect(wrong).toEqual([]);
    expect(editsMade).toBeGreaterThan(100);
  });
});
