// A design returned to while this tab holds a write for it, with the probe's answer and the writer's answers in every
// order: the app's own session store and its one writer over a server that keeps every revision, under a fake clock
// (`support/qa-8k2-one-tab-two-designs.ts`). What is checked after every event is said there, rule by rule.
//
// Two sweeps. The first is random: any sequence of edits, saves stored, failed, limited or held, leaving for the other
// design, returning on a kept page of any revision the server has held, and the probe answered, arriving, failing or
// retried at any point; a save's answer is decided by the server at one point and reaches the tab at a later one. The
// second is whole: each state (`support/qa-8k2-held-states.ts`) a write can be in when its design is loaded again, each fate of its next two answers, and
// the probe's answer read from the server and applied before each answer, while it is on its way, and after it.
import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it } from "vitest";

import {
  HELD_STATES,
  PROBE_NOW,
  TO_A,
  type HeldState,
} from "../support/qa-8k2-held-states";
import {
  OneTabTwoDesigns,
  type SaveAnswer,
  type SaveMode,
  type TabEvent,
} from "../support/qa-8k2-one-tab-two-designs";

const RANDOM_RUNS = 600;
const RANDOM_TIMEOUT_MS = 240_000;
const WHOLE_SWEEP_TIMEOUT_MS = 240_000;
/** Past the longest wait a save is told here (30 s), so the next save of a waiting design has been sent. */
const UNTIL_THE_NEXT_SAVE_MS = 31_000;

const SAVE_ANSWERS: readonly SaveAnswer[] = [
  "stored",
  "failed",
  "limited-1s",
  "limited-30s",
];

const PASSES_MS = [
  0, 1, 250, 499, 500, 501, 999, 1000, 1001, 2000, 8000, 30_000,
];

const one = (event: TabEvent): fc.Arbitrary<TabEvent[]> => fc.constant([event]);

const aSaveAnswer = fc.constantFrom(...SAVE_ANSWERS);
const aDesign = fc.constantFrom("design-a" as const, "design-b" as const);
const aKeptPage = fc.nat({ max: 12 });

/** A step of the customer, the clock, the server or the probe; the longer ones are the moves a customer makes whole. */
const aStep: fc.Arbitrary<TabEvent[]> = fc.oneof(
  { weight: 6, arbitrary: one({ kind: "edit" }) },
  {
    weight: 5,
    arbitrary: fc
      .constantFrom(...PASSES_MS)
      .chain((ms) => one({ kind: "pass", ms })),
  },
  {
    weight: 3,
    arbitrary: aSaveAnswer.chain((answer) =>
      one({ kind: "server-decides", with: answer }),
    ),
  },
  {
    weight: 4,
    arbitrary: aSaveAnswer.chain((answer) =>
      one({ kind: "answer", with: answer }),
    ),
  },
  {
    weight: 4,
    arbitrary: fc
      .record({ to: aDesign, keptPage: aKeptPage })
      .chain(({ to, keptPage }) => one({ kind: "go", to, keptPage })),
  },
  {
    weight: 4,
    arbitrary: fc
      .record({ away: aKeptPage, back: aKeptPage })
      .map(({ away, back }): TabEvent[] => [
        { kind: "go", to: "design-b", keptPage: away },
        { kind: "go", to: "design-a", keptPage: back },
      ]),
  },
  { weight: 4, arbitrary: one({ kind: "probe-answered" }) },
  { weight: 4, arbitrary: one({ kind: "probe-arrives" }) },
  {
    weight: 6,
    arbitrary: fc.constant<TabEvent[]>([
      { kind: "probe-answered" },
      { kind: "probe-arrives" },
    ]),
  },
  { weight: 1, arbitrary: one({ kind: "probe-fails" }) },
  { weight: 1, arbitrary: one({ kind: "probe-retried" }) },
);

const someSteps: fc.Arbitrary<TabEvent[]> = fc
  .array(aStep, { maxLength: 40 })
  .map((steps) => steps.flat());

const saveModes: fc.Arbitrary<SaveMode[]> = fc.array(
  fc.constantFrom<SaveMode>(...SAVE_ANSWERS, "held", "held", "stored"),
  { maxLength: 16 },
);

async function violationsOf(
  modes: readonly SaveMode[],
  events: readonly TabEvent[],
): Promise<readonly string[]> {
  const tab = await OneTabTwoDesigns.open(modes);
  await tab.play(events);
  if (tab.violations.length === 0) await tab.comeToRest();
  return tab.violations;
}

afterEach(() => {
  OneTabTwoDesigns.close();
});

describe("one tab, two designs, the probe's answer and the writer's answers in any order", () => {
  it(
    "never offers an edit on a clean copy that is not the stored one, never loses an edit or shows an unstored one as saved, never sends a save early, twice or against a revision it was not shown, and never leaves a held write with nothing to send it",
    async () => {
      await fc.assert(
        fc.asyncProperty(saveModes, someSteps, async (modes, events) => {
          try {
            expect(await violationsOf(modes, events)).toEqual([]);
          } finally {
            OneTabTwoDesigns.close();
          }
        }),
        { numRuns: RANDOM_RUNS },
      );
    },
    RANDOM_TIMEOUT_MS,
  );
});

/** The probe's answer is read from the server at one point and applied at the same or a later one. */
interface ProbePlacement {
  readonly answeredAt: number;
  readonly arrivesAt: number;
}

function placementsOver(points: number): ProbePlacement[] {
  const placements: ProbePlacement[] = [];
  for (let answeredAt = 0; answeredAt < points; answeredAt += 1) {
    for (let arrivesAt = answeredAt; arrivesAt < points; arrivesAt += 1) {
      placements.push({ answeredAt, arrivesAt });
    }
  }
  return placements;
}

function probeEventsAt(point: number, probe: ProbePlacement): TabEvent[] {
  return [
    ...(probe.answeredAt === point ? [PROBE_NOW[0]] : []),
    ...(probe.arrivesAt === point ? [PROBE_NOW[1]] : []),
  ].filter((event): event is TabEvent => event !== undefined);
}

/** One answer has three points for the probe (before it, while it is on its way, after it) and so six placements; two
 *  answers have five points and fifteen placements. Four fates of one answer, sixteen of two. */
const CASES_OF_ONE_STATE = 4 * 6 + 16 * 15;

/** A's kept page is the first one, the oldest the router could hold. Every later save of A is held, then answered. */
function returnAndAnswer(
  held: HeldState,
  answers: readonly SaveAnswer[],
  probe: ProbePlacement,
): { modes: SaveMode[]; events: TabEvent[] } {
  const events: TabEvent[] = [...PROBE_NOW, ...held.untilLeft, TO_A];
  events.push(...probeEventsAt(0, probe), ...held.beforeTheFirstAnswer);
  answers.forEach((answer, index) => {
    const isOutAlready = index === 0 && held.isSentAlready;
    if (!isOutAlready)
      events.push({ kind: "pass", ms: UNTIL_THE_NEXT_SAVE_MS });
    events.push({ kind: "server-decides", with: answer });
    events.push(...probeEventsAt(2 * index + 1, probe));
    events.push({ kind: "answer", with: answer });
    events.push(...probeEventsAt(2 * index + 2, probe));
  });
  return {
    modes: [...held.modes, ...answers.map((): SaveMode => "held")],
    events,
  };
}

function answerSequences(): SaveAnswer[][] {
  const single = SAVE_ANSWERS.map((answer) => [answer]);
  const pairs = SAVE_ANSWERS.flatMap((first) =>
    SAVE_ANSWERS.map((second) => [first, second]),
  );
  return [...single, ...pairs];
}

describe("each state of a held write, as its design is loaded again", () => {
  it.each(HELD_STATES)(
    "shows a write $name in that write's status, unsaved while it is held",
    async (held) => {
      const tab = await OneTabTwoDesigns.open(held.modes);

      await tab.play([...PROBE_NOW, ...held.untilLeft, TO_A]);

      expect(tab.violations).toEqual([]);
      expect(tab.shown).toMatchObject({
        isUnsaved: held.shownOnReturn.isUnsaved,
        hasBeenEdited: held.shownOnReturn.isUnsaved,
        saveStatus: held.shownOnReturn.saveStatus,
      });
      expect(tab.shown.saveResumesAtMs !== null).toBe(
        held.shownOnReturn.hasATime,
      );
    },
  );
});

describe("each state of a held write, each fate of its next two answers, the probe before, between and after them", () => {
  it.each(HELD_STATES)(
    "holds every rule for a write $name",
    async (held) => {
      const broken: string[] = [];
      let cases = 0;
      for (const answers of answerSequences()) {
        for (const probe of placementsOver(2 * answers.length + 1)) {
          const { modes, events } = returnAndAnswer(held, answers, probe);
          const violations = await violationsOf(modes, events);
          OneTabTwoDesigns.close();
          cases += 1;
          if (violations.length > 0)
            broken.push(
              `${answers.join(", ")}; probe answered at ${String(probe.answeredAt)}, applied at ${String(probe.arrivesAt)}: ${violations.join(" | ")}`,
            );
        }
      }

      expect(cases).toBe(CASES_OF_ONE_STATE);
      expect(broken).toEqual([]);
    },
    WHOLE_SWEEP_TIMEOUT_MS,
  );
});
