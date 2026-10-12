// Leaving a design for the other one and coming straight back, with no time passed and no answer arrived, while the tab
// holds a write for it: the screen says of that write what it said before the customer left. The same tab is played
// twice from a fresh start, once ending where the customer stays and once with the round trip added, and the two
// screens are compared (`support/qa-8k2-one-tab-two-designs.ts`).
//
// The last two tests are a finding and are red. A write that failed, or that the limit refused, and whose wait has
// since ended while another design's request holds the one slot, is handed to a load as a write that is merely ready:
// the hand-over has no word for what it was last said to be. So the customer who stays is still told the save failed
// (or when it goes), and the one who leaves and returns is told nothing. The edit is on the screen, unsaved, either way,
// and is sent once; only the sentence differs. `save-coalescer.ts`, `heldWriteOf`, the branch for `wait === null`.
import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it } from "vitest";

import {
  OneTabTwoDesigns,
  type SaveAnswer,
  type SaveMode,
  type TabEvent,
} from "../support/qa-8k2-one-tab-two-designs";

const RUNS = 120;
const TIMEOUT_MS = 240_000;
const BACKOFF_FIRST_STEP_MS = 500;
const LIMIT_WAIT_MS = 1000;

const SAVE_ANSWERS: readonly SaveAnswer[] = [
  "stored",
  "failed",
  "limited-1s",
  "limited-30s",
];
const PASSES_MS = [0, 1, 499, 500, 999, 1000, 1001, 8000, 30_000];

const PROBE_NOW: readonly TabEvent[] = [
  { kind: "probe-answered" },
  { kind: "probe-arrives" },
];
const EDIT: TabEvent = { kind: "edit" };
const A_MOMENT: TabEvent = { kind: "pass", ms: 0 };
const TO_A: TabEvent = { kind: "go", to: "design-a", keptPage: 0 };
const TO_B: TabEvent = { kind: "go", to: "design-b", keptPage: 0 };

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

async function stayAndReturn(
  modes: readonly SaveMode[],
  events: readonly TabEvent[],
): Promise<BothScreens> {
  const stayed = await shownAfter(modes, events);
  const holdsAWriteOfA =
    stayed.designId === "design-a" && stayed.shown.isUnsaved;
  // The second tab is played only where the comparison is owed.
  const returned = holdsAWriteOfA
    ? await shownAfter(modes, [...events, TO_B, TO_A])
    : stayed;
  return { holdsAWriteOfA, stayed: stayed.shown, returned: returned.shown };
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
