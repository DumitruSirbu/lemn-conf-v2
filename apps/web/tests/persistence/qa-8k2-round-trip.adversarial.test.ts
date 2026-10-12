// Leaving a design for the other one and coming straight back, with no time passed and no answer arrived, while the tab
// holds a write for it: the screen says of that write what it said before the customer left. One tab is played to
// where the customer stays and read, the round trip is added and it is read again, and the two screens are compared (`support/qa-8k2-one-tab-two-designs.ts`).
//
// An ordinary run plays a stated share of the first two ways (`support/qa-8k2-sweep-size.ts`); `QA_8K2_WHOLE_SWEEP=1`
// plays all of both.
//
// Three ways. Random sequences. Then whole: each state a write can be in (`support/qa-8k2-held-states.ts`), on the
// screen that never left and on the one that returned once, followed by every one or two of a time passing, an answer
// arriving, an edit and the probe answering. Then by name: the two cases that were red before the writer remembered
// the failure it last said, and their opposites, where a failure once said must not be said again.
import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it } from "vitest";

import {
  A_MOMENT,
  EDIT,
  HELD_STATES,
  PROBE_NOW,
  TO_A,
  TO_B,
} from "../support/qa-8k2-held-states";
import { isWholeSweep, runsFor, shareOf } from "../support/qa-8k2-sweep-size";
import {
  OneTabTwoDesigns,
  type SaveAnswer,
  type SaveMode,
  type TabEvent,
} from "../support/qa-8k2-one-tab-two-designs";

/** The random sweep's floor: fast-check plays this many sequences that hold a write, or fails, and prints its seed. */
const RUNS = runsFor({ ordinary: 15, whole: 120 });
const TIMEOUT_MS = 240_000;
const BACKOFF_FIRST_STEP_MS = 500;
const LIMIT_WAIT_MS = 1000;
const LONGEST_WAIT_MS = 30_000;

const SAVE_ANSWERS: readonly SaveAnswer[] = [
  "stored",
  "failed",
  "limited-1s",
  "limited-30s",
];
const PASSES_MS = [0, 1, 499, 500, 999, 1000, 1001, 8000, 30_000];

const one = (event: TabEvent): fc.Arbitrary<TabEvent[]> => fc.constant([event]);
const aSaveAnswer = fc.constantFrom(...SAVE_ANSWERS);

const aStep: fc.Arbitrary<TabEvent[]> = fc.oneof(
  { weight: 6, arbitrary: one(EDIT) },
  {
    weight: 5,
    arbitrary: fc
      .constantFrom(...PASSES_MS)
      .chain((ms) => one({ kind: "pass", ms })),
  },
  {
    weight: 4,
    arbitrary: aSaveAnswer.chain((answer) =>
      one({ kind: "answer", with: answer }),
    ),
  },
  { weight: 3, arbitrary: one(TO_A) },
  { weight: 3, arbitrary: one(TO_B) },
  { weight: 8, arbitrary: fc.constant<TabEvent[]>([...PROBE_NOW]) },
);

const someSteps = fc
  .array(aStep, { maxLength: 30 })
  .map((steps) => steps.flat());

const saveModes: fc.Arbitrary<SaveMode[]> = fc.array(
  fc.constantFrom<SaveMode>(...SAVE_ANSWERS, "held", "held"),
  { maxLength: 12 },
);

type Shown = OneTabTwoDesigns["shown"];

interface BothScreens {
  /** Whether design A is on screen with an edit the tab has not stored, which is when the comparison is owed. */
  readonly holdsAWriteOfA: boolean;
  readonly stayed: Shown;
  readonly returned: Shown;
}

async function shownAfter(
  modes: readonly SaveMode[],
  events: readonly TabEvent[],
): Promise<{ shown: Shown; designId: string | null }> {
  const tab = await OneTabTwoDesigns.open(modes);
  await tab.play(events);
  const result = { shown: tab.shown, designId: tab.state.designId };
  OneTabTwoDesigns.close();
  return result;
}

/** One tab: what it shows where the customer stays, then what it shows once the round trip is added to the same events. */
async function stayAndReturn(
  modes: readonly SaveMode[],
  events: readonly TabEvent[],
): Promise<BothScreens> {
  const tab = await OneTabTwoDesigns.open(modes);
  await tab.play(events);
  const stayed = tab.shown;
  const holdsAWriteOfA = tab.state.designId === "design-a" && stayed.isUnsaved;
  // The round trip is played only where the comparison is owed.
  if (holdsAWriteOfA) await tab.play([TO_B, TO_A]);
  const returned = tab.shown;
  OneTabTwoDesigns.close();
  return { holdsAWriteOfA, stayed, returned };
}

afterEach(() => {
  OneTabTwoDesigns.close();
});

describe("a design left and returned to at once while the tab holds a write for it", () => {
  it(
    "shows the same design, revision, save status and time as before it was left, over any sequence of edits, answers, waits and returns",
    async () => {
      await fc.assert(
        fc.asyncProperty(saveModes, someSteps, async (modes, events) => {
          const both = await stayAndReturn(modes, events);
          fc.pre(both.holdsAWriteOfA);

          expect(both.returned).toEqual(both.stayed);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it("still says the save failed when the backoff has ended and the write waits behind the other design's request", async () => {
    const both = await stayAndReturn(
      ["failed", "held"],
      [
        ...PROBE_NOW,
        EDIT,
        A_MOMENT,
        TO_B,
        ...PROBE_NOW,
        EDIT,
        A_MOMENT,
        TO_A,
        { kind: "pass", ms: BACKOFF_FIRST_STEP_MS },
      ],
    );

    expect(both.stayed.saveStatus).toBe("error");
    expect(both.returned.saveStatus).toBe(both.stayed.saveStatus);
  });

  it("still says when the limit lets the save go when that time has come and the write waits behind the other design's request", async () => {
    const both = await stayAndReturn(
      ["limited-1s", "held"],
      [
        ...PROBE_NOW,
        EDIT,
        A_MOMENT,
        TO_B,
        ...PROBE_NOW,
        EDIT,
        A_MOMENT,
        TO_A,
        { kind: "pass", ms: LIMIT_WAIT_MS },
      ],
    );

    expect(both.stayed.saveStatus).toBe("error");
    expect(both.returned).toMatchObject({
      saveStatus: both.stayed.saveStatus,
      saveResumesAtMs: both.stayed.saveResumesAtMs,
    });
  });
});

/** What can happen next to a tab that holds a write: time, an answer to the save that is out, an edit, the probe. */
const WHAT_FOLLOWS: readonly (readonly TabEvent[])[] = [
  [{ kind: "pass", ms: 0 }],
  [{ kind: "pass", ms: BACKOFF_FIRST_STEP_MS }],
  [{ kind: "pass", ms: LIMIT_WAIT_MS }],
  [{ kind: "pass", ms: LONGEST_WAIT_MS }],
  [{ kind: "answer", with: "stored" }],
  [{ kind: "answer", with: "failed" }],
  [{ kind: "answer", with: "limited-1s" }],
  [EDIT],
  [...PROBE_NOW],
];

const NOTHING_OR_ONE: TabEvent[][] = [
  [],
  ...WHAT_FOLLOWS.map((events) => [...events]),
];
const TWO: TabEvent[][] = WHAT_FOLLOWS.flatMap((first) =>
  WHAT_FOLLOWS.map((second) => [...first, ...second]),
);
/** The ordinary run plays nothing and every one thing after each start, and each twenty-seventh pair; the whole one all 81. */
const SHARE_OF_PAIRS = 27;

function followUpsPlayedFor(stateIndex: number): TabEvent[][] {
  return [
    ...NOTHING_OR_ONE,
    ...shareOf(TWO, { stride: SHARE_OF_PAIRS, offset: stateIndex }),
  ];
}

/**
 * The floor of each start's arm for a state that holds a write: the comparisons it must have made. A follow-up after
 * which the write is already stored has nothing to compare and is not counted. The least measured over the eight
 * such states is 12 of 13 in the ordinary run and 75 of 91 in the whole one.
 */
const COMPARED_AT_LEAST = isWholeSweep ? 70 : 11;

/** Every save after the state's own is kept out until an answer event, so each answer above has a save to answer. */
const LATER_SAVES: readonly SaveMode[] = ["held", "held", "held", "held"];
const WHOLE_TIMEOUT_MS = 240_000;

describe("each state of a held write, on the screen that stayed and on the one that returned, then one or two things happening", () => {
  it.each(HELD_STATES)(
    "says the same of a write $name before and after a return at once",
    async (held) => {
      const modes = [...held.modes, ...LATER_SAVES];
      const stayedOnA = held.untilLeft.slice(0, -1);
      const returnedOnce = [...held.untilLeft, TO_A];
      const differing: string[] = [];
      const comparedByStart: number[] = [];

      for (const start of [stayedOnA, returnedOnce]) {
        let compared = 0;
        for (const followUp of followUpsPlayedFor(HELD_STATES.indexOf(held))) {
          const events = [...PROBE_NOW, ...start, ...followUp];
          const both = await stayAndReturn(modes, events);
          if (!both.holdsAWriteOfA) continue;
          compared += 1;
          if (JSON.stringify(both.returned) !== JSON.stringify(both.stayed))
            differing.push(
              `after ${JSON.stringify(followUp)}: stayed ${both.stayed.saveStatus} ${String(both.stayed.saveResumesAtMs)}, returned ${both.returned.saveStatus} ${String(both.returned.saveResumesAtMs)}`,
            );
        }
        comparedByStart.push(compared);
      }

      expect(differing).toEqual([]);
      const floor = held.shownOnReturn.isUnsaved ? COMPARED_AT_LEAST : 0;
      expect(Math.min(...comparedByStart)).toBeGreaterThanOrEqual(floor);
    },
    WHOLE_TIMEOUT_MS,
  );
});

describe("a failure once said is not said again after the write was next said to be saving", () => {
  const UNTIL_A_FAILURE_IS_SAID: readonly TabEvent[] = [
    ...PROBE_NOW,
    EDIT,
    A_MOMENT,
  ];
  const RETRY_GOES: TabEvent = { kind: "pass", ms: BACKOFF_FIRST_STEP_MS };

  async function shownOnReturnAfter(
    modes: readonly SaveMode[],
    events: readonly TabEvent[],
  ): Promise<Shown> {
    return (await shownAfter(modes, [...events, TO_B, TO_A])).shown;
  }

  it("shows an edit made after the failed save's retry was stored as unsaved with no failure", async () => {
    const shown = await shownOnReturnAfter(
      ["failed", "stored"],
      [...UNTIL_A_FAILURE_IS_SAID, RETRY_GOES, EDIT],
    );

    expect(shown).toMatchObject({
      isUnsaved: true,
      saveStatus: "idle",
      saveResumesAtMs: null,
      revision: "2",
    });
  });

  it("shows an edit made after the refused save went and was stored as unsaved with no time", async () => {
    const shown = await shownOnReturnAfter(
      ["limited-1s", "stored"],
      [...UNTIL_A_FAILURE_IS_SAID, { kind: "pass", ms: LIMIT_WAIT_MS }, EDIT],
    );

    expect(shown).toMatchObject({
      isUnsaved: true,
      saveStatus: "idle",
      saveResumesAtMs: null,
      revision: "2",
    });
  });

  it("shows the retry that is out as being saved, with an edit behind it, and not as failed", async () => {
    const shown = await shownOnReturnAfter(
      ["failed", "held"],
      [...UNTIL_A_FAILURE_IS_SAID, RETRY_GOES, EDIT],
    );

    expect(shown).toMatchObject({ isUnsaved: true, saveStatus: "saving" });
  });

  it("shows an edit as never failed when its design's earlier save failed, was retried and stored, and the edit now waits behind the other design's request", async () => {
    const shown = await shownOnReturnAfter(
      ["failed", "stored", "held"],
      [
        ...UNTIL_A_FAILURE_IS_SAID,
        RETRY_GOES,
        TO_B,
        ...PROBE_NOW,
        { kind: "pass", ms: LIMIT_WAIT_MS },
        EDIT,
        A_MOMENT,
        TO_A,
        ...PROBE_NOW,
        EDIT,
      ],
    );

    expect(shown).toMatchObject({
      isUnsaved: true,
      saveStatus: "idle",
      saveResumesAtMs: null,
    });
  });

  it.each([
    ["failed", BACKOFF_FIRST_STEP_MS],
    ["limited-1s", LIMIT_WAIT_MS],
  ] as const)(
    "shows an edit made while the retry of a %s save was out as unsaved with no failure once that retry is stored, the queue never having been empty",
    async (firstAnswer, waitMs) => {
      const shown = await shownOnReturnAfter(
        [firstAnswer, "held"],
        [
          ...UNTIL_A_FAILURE_IS_SAID,
          { kind: "pass", ms: waitMs },
          EDIT,
          { kind: "answer", with: "stored" },
        ],
      );

      expect(shown).toMatchObject({
        isUnsaved: true,
        saveStatus: "idle",
        saveResumesAtMs: null,
        revision: "2",
      });
    },
  );

  it("says the failure again, and no time, when the save refused by the limit then fails", async () => {
    const shown = await shownOnReturnAfter(
      ["limited-1s", "failed"],
      [...UNTIL_A_FAILURE_IS_SAID, { kind: "pass", ms: LIMIT_WAIT_MS }],
    );

    expect(shown).toMatchObject({
      isUnsaved: true,
      saveStatus: "error",
      saveResumesAtMs: null,
    });
  });
});
